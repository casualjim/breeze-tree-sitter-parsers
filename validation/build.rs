use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize, Serialize, Clone)]
struct Grammar {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    symbol_name: Option<String>,
}

fn get_validation_library_path() -> Result<PathBuf, String> {
    // Get the target triple
    let target = env::var("TARGET").unwrap_or_else(|_| {
        env::var("HOST").unwrap_or_else(|_| "unknown".to_string())
    });

    eprintln!("Validation: Building for target: {}", target);

    // Find the dist directory with our built libraries
    let current_dir = env::current_dir().map_err(|e| format!("Failed to get current dir: {}", e))?;
    let dist_dir = current_dir.parent().unwrap().join("dist");
    
    if !dist_dir.exists() {
        return Err("dist directory not found. Run `npm run build` first.".to_string());
    }

    // Map Rust target triple to expected filename
    let expected_filename = match target.as_str() {
        "aarch64-apple-darwin" => "libtree-sitter-parsers-all-macos-aarch64.a",
        "x86_64-apple-darwin" => "libtree-sitter-parsers-all-macos-x86_64.a",
        "aarch64-unknown-linux-gnu" => "libtree-sitter-parsers-all-linux-aarch64-glibc.a",
        "x86_64-unknown-linux-gnu" => "libtree-sitter-parsers-all-linux-x86_64-glibc.a",
        "aarch64-unknown-linux-musl" => "libtree-sitter-parsers-all-linux-aarch64-musl.a",
        "x86_64-unknown-linux-musl" => "libtree-sitter-parsers-all-linux-x86_64-musl.a",
        "aarch64-pc-windows-gnu" => "libtree-sitter-parsers-all-windows-aarch64.a",
        "x86_64-pc-windows-gnu" => "libtree-sitter-parsers-all-windows-x86_64.a",
        _ => {
            return Err(format!("Unsupported target for validation: {}", target));
        }
    };

    let lib_path = dist_dir.join(expected_filename);
    if lib_path.exists() {
        eprintln!("Validation: Found library: {}", lib_path.display());
        Ok(lib_path)
    } else {
        Err(format!(
            "Validation: Library {} not found in {}",
            expected_filename,
            dist_dir.display()
        ))
    }
}

fn get_metadata_path(lib_path: &Path) -> PathBuf {
    lib_path.parent().unwrap().join(
        lib_path
            .file_name()
            .unwrap()
            .to_str()
            .unwrap()
            .replace(".a", ".json")
            .replace("libtree-sitter-parsers-all-", "grammars-"),
    )
}

fn main() {
    println!("cargo:rerun-if-changed=build.rs");

    let out_dir = env::var("OUT_DIR").unwrap();
    let out_path = Path::new(&out_dir);

    // Get validation library path
    let lib_path = get_validation_library_path()
        .expect("Failed to find validation library");

    eprintln!("Validation: Using library from {}", lib_path.display());

    // Link the library - this is the critical test!
    let lib_name = lib_path.file_stem().unwrap().to_str().unwrap();
    let lib_name = lib_name.strip_prefix("lib").unwrap_or(lib_name);

    println!("cargo:rustc-link-lib=static={}", lib_name);
    println!(
        "cargo:rustc-link-search=native={}",
        lib_path.parent().unwrap().display()
    );

    // Always link C++ standard library as some grammars use C++ scanners
    if cfg!(target_os = "macos") {
        println!("cargo:rustc-link-lib=c++");
    } else if cfg!(target_os = "linux") {
        println!("cargo:rustc-link-lib=stdc++");
    } else if cfg!(target_os = "windows") {
        // For MinGW/GNU on Windows
        println!("cargo:rustc-link-lib=stdc++");
    }

    // Load metadata and generate bindings
    let metadata_path = get_metadata_path(&lib_path);
    if metadata_path.exists() {
        eprintln!("Validation: Found metadata at: {}", metadata_path.display());
        let metadata_str = fs::read_to_string(&metadata_path)
            .expect("Failed to read grammar metadata");
        let grammars: Vec<Grammar> = serde_json::from_str(&metadata_str)
            .expect("Failed to parse grammar metadata");
        
        // Only generate bindings for a small subset to speed up validation
        let test_grammars: Vec<Grammar> = grammars
            .into_iter()
            .filter(|g| ["c", "python", "javascript", "rust", "go"].contains(&g.name.as_str()))
            .collect();
            
        eprintln!("Validation: Testing {} grammars", test_grammars.len());
        generate_bindings(out_path, &test_grammars);
    } else {
        panic!("Validation: No grammar metadata found at {}", metadata_path.display());
    }
}

fn generate_bindings(out_path: &Path, compiled_grammars: &[Grammar]) {
    let bindings_path = out_path.join("grammars.rs");
    let mut bindings = String::new();

    bindings.push_str("// Auto-generated validation grammar bindings\n\n");
    bindings.push_str("use tree_sitter::Language;\n");
    bindings.push_str("use tree_sitter_language::LanguageFn;\n\n");

    // Generate extern declarations
    for grammar in compiled_grammars {
        let fn_name = if let Some(symbol) = &grammar.symbol_name {
            symbol.clone()
        } else if grammar.name == "csharp" {
            "c_sharp".to_string()
        } else {
            grammar.name.replace("-", "_")
        };
        bindings.push_str(&format!(
            "unsafe extern \"C\" {{ fn tree_sitter_{}() -> *const (); }}\n",
            fn_name
        ));
    }

    bindings.push('\n');

    // Generate LanguageFn constants
    for grammar in compiled_grammars {
        let fn_name = if let Some(symbol) = &grammar.symbol_name {
            symbol.clone()
        } else if grammar.name == "csharp" {
            "c_sharp".to_string()
        } else {
            grammar.name.replace("-", "_")
        };
        let const_name = grammar.name.to_uppercase();
        bindings.push_str(&format!(
            "pub const {}_LANGUAGE: LanguageFn = unsafe {{ LanguageFn::from_raw(tree_sitter_{}) }};\n",
            const_name, fn_name
        ));
    }

    bindings.push('\n');
    bindings.push_str("pub fn load_grammar(name: &str) -> Option<Language> {\n");
    bindings.push_str("    match name {\n");

    // Generate match arms
    for grammar in compiled_grammars {
        let const_name = grammar.name.to_uppercase();
        bindings.push_str(&format!(
            "        \"{}\" => Some({}_LANGUAGE.into()),\n",
            grammar.name, const_name
        ));
    }

    bindings.push_str("        _ => None,\n");
    bindings.push_str("    }\n");
    bindings.push_str("}\n\n");

    bindings.push_str("pub fn available_grammars() -> &'static [&'static str] {\n");
    bindings.push_str("    &[\n");
    for grammar in compiled_grammars {
        bindings.push_str(&format!("        \"{}\",\n", grammar.name));
    }
    bindings.push_str("    ]\n");
    bindings.push_str("}\n");

    fs::write(bindings_path, bindings).unwrap();
}
