use std::{
    env, fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};

use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Grammar {
    name: String,
}

const GH_OWNER: &str = "casualjim";
const GH_REPO: &str = "breeze-tree-sitter-parsers";
/// Breeze release version this crate targets. Bump when targeting a newer breeze release.
/// Override at build time with `BREEZE_TREE_SITTER_PARSERS_VERSION=<x.y.z>`.
const BREEZE_RELEASE: &str = "0.1.11";

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=BREEZE_TREE_SITTER_PARSERS_LIB");
    println!("cargo:rerun-if-env-changed=BREEZE_TREE_SITTER_PARSERS_METADATA");
    println!("cargo:rerun-if-env-changed=BREEZE_TREE_SITTER_PARSERS_VERSION");

    let target = env::var("TARGET").expect("TARGET not set");
    let platform = target_to_platform(&target)
        .unwrap_or_else(|| panic!("unsupported target: {target} (supported: x86_64/aarch64 linux-gnu/linux-musl/apple-darwin/pc-windows-gnu)"));

    let version = env::var("BREEZE_TREE_SITTER_PARSERS_VERSION")
        .unwrap_or_else(|_| BREEZE_RELEASE.to_string());

    let (lib_dir, metadata_path) = if let Ok(lib) = env::var("BREEZE_TREE_SITTER_PARSERS_LIB") {
        let lib_path = PathBuf::from(&lib);
        if !lib_path.is_file() {
            panic!("BREEZE_TREE_SITTER_PARSERS_LIB={lib} is not a file");
        }
        let dir = lib_path
            .parent()
            .unwrap_or(Path::new("."))
            .to_path_buf();
        let meta = env::var("BREEZE_TREE_SITTER_PARSERS_METADATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| dir.join(format!("grammars-{platform}.json")));
        if !meta.is_file() {
            panic!(
                "metadata not found at {}; set BREEZE_TREE_SITTER_PARSERS_METADATA",
                meta.display()
            );
        }
        (dir, meta)
    } else {
        ensure_cached(&version, &platform)
    };

    let lib_name = format!("tree-sitter-parsers-all-{platform}");
    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:rustc-link-lib=static={lib_name}");
    link_cxx_stdlib(&target);

    let metadata = fs::read_to_string(&metadata_path)
        .unwrap_or_else(|e| panic!("failed to read metadata {}: {e}", metadata_path.display()));
    let grammars: Vec<Grammar> =
        serde_json::from_str(&metadata).expect("failed to parse grammars metadata");

    generate_bindings(&grammars);
}

fn target_to_platform(target: &str) -> Option<&'static str> {
    Some(match target {
        "x86_64-apple-darwin" => "macos-x86_64",
        "aarch64-apple-darwin" => "macos-aarch64",
        "x86_64-unknown-linux-gnu" => "linux-x86_64-glibc",
        "aarch64-unknown-linux-gnu" => "linux-aarch64-glibc",
        "x86_64-unknown-linux-musl" => "linux-x86_64-musl",
        "aarch64-unknown-linux-musl" => "linux-aarch64-musl",
        "x86_64-pc-windows-gnu" => "windows-x86_64",
        "aarch64-pc-windows-gnu" => "windows-aarch64",
        _ => return None,
    })
}

fn link_cxx_stdlib(target: &str) {
    // .a is built with clang/libc++; link c++ on darwin and linux. Windows-gnu uses stdc++.
    if target.contains("apple-darwin") || target.contains("linux") {
        println!("cargo:rustc-link-lib=c++");
    } else if target.contains("windows-gnu") {
        println!("cargo:rustc-link-lib=stdc++");
    }
}

fn cache_root() -> PathBuf {
    if let Ok(p) = env::var("BREEZE_TREE_SITTER_PARSERS_CACHE_DIR") {
        return PathBuf::from(p);
    }
    let base = env::var_os("CARGO_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(|h| PathBuf::from(h).join(".cargo")))
        .unwrap_or_else(|| PathBuf::from(env::var("OUT_DIR").unwrap()));
    base.join("breeze-tree-sitter-parsers-cache")
}

fn ensure_cached(version: &str, platform: &str) -> (PathBuf, PathBuf) {
    let dir = cache_root().join(format!("v{version}")).join(platform);
    fs::create_dir_all(&dir).expect("failed to create cache dir");

    let lib_file = format!("libtree-sitter-parsers-all-{platform}.a");
    let meta_file = format!("grammars-{platform}.json");
    let lib_path = dir.join(&lib_file);
    let meta_path = dir.join(&meta_file);

    if !lib_path.exists() {
        let url = format!(
            "https://github.com/{GH_OWNER}/{GH_REPO}/releases/download/v{version}/{lib_file}"
        );
        eprintln!("breeze-tree-sitter-parsers-sys: downloading {url}");
        download(&url, &lib_path).unwrap_or_else(|e| {
            panic!("failed to download {url}: {e}");
        });
    }
    if !meta_path.exists() {
        let url = format!(
            "https://github.com/{GH_OWNER}/{GH_REPO}/releases/download/v{version}/{meta_file}"
        );
        eprintln!("breeze-tree-sitter-parsers-sys: downloading {url}");
        download(&url, &meta_path).unwrap_or_else(|e| {
            panic!("failed to download {url}: {e}");
        });
    }
    (dir, meta_path)
}

fn download(url: &str, dest: &Path) -> io::Result<()> {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(15))
        .timeout(Duration::from_secs(600))
        .build();

    let resp = agent
        .get(url)
        .call()
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    if resp.status() != 200 {
        return Err(io::Error::new(
            io::ErrorKind::Other,
            format!("HTTP {} for {url}", resp.status()),
        ));
    }

    let tmp = dest.with_extension("part");
    let mut out = fs::File::create(&tmp)?;
    let mut reader = resp.into_reader();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        out.write_all(&buf[..n])?;
    }
    out.sync_all()?;
    drop(out);
    fs::rename(tmp, dest)?;
    Ok(())
}

fn generate_bindings(grammars: &[Grammar]) {
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let dest = out_dir.join("bindings.rs");

    let mut s = String::new();
    s.push_str("// AUTO-GENERATED by build.rs from grammars metadata.\n\n");

    let mut entries: Vec<(String, String)> = grammars
        .iter()
        .map(|g| (g.name.clone(), symbol_for(g)))
        .collect();
    entries.sort();
    entries.dedup_by(|a, b| a.1 == b.1);

    for (_, sym) in &entries {
        s.push_str(&format!(
            "unsafe extern \"C\" {{ fn tree_sitter_{sym}() -> *const (); }}\n"
        ));
    }
    s.push('\n');

    s.push_str("/// Returns the [`LanguageFn`] for the given language name, or `None` if not bundled.\n");
    s.push_str("pub fn language_fn(name: &str) -> Option<LanguageFn> {\n");
    s.push_str("    match name {\n");
    for (name, sym) in &entries {
        s.push_str(&format!(
            "        {name:?} => Some(unsafe {{ LanguageFn::from_raw(tree_sitter_{sym}) }}),\n"
        ));
    }
    s.push_str("        _ => None,\n");
    s.push_str("    }\n");
    s.push_str("}\n\n");

    s.push_str("/// All language names bundled in the linked static library for this target.\n");
    s.push_str("pub fn available_languages() -> &'static [&'static str] {\n");
    s.push_str("    &[\n");
    for (name, _) in &entries {
        s.push_str(&format!("        {name:?},\n"));
    }
    s.push_str("    ]\n");
    s.push_str("}\n");

    fs::write(&dest, s).expect("failed to write bindings");
}

fn symbol_for(g: &Grammar) -> String {
    // Derive from name; metadata's `symbol_name` field is unreliable (contains
    // values that don't match what's actually exported from the .a).
    match g.name.as_str() {
        "csharp" => "c_sharp".to_string(),
        other => other.replace('-', "_"),
    }
}
