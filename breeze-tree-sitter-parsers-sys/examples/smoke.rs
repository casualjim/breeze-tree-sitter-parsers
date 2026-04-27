use tree_sitter::{Language, Parser};

fn main() {
    let names = ["rust", "python", "javascript", "go", "c"];
    for name in names {
        let lang_fn = breeze_tree_sitter_parsers_sys::language_fn(name)
            .unwrap_or_else(|| panic!("language not found: {name}"));
        let language: Language = lang_fn.into();
        let mut parser = Parser::new();
        parser.set_language(&language).expect("set_language");
        let src = match name {
            "rust" => "fn main() { println!(\"hi\"); }",
            "python" => "def f():\n    pass\n",
            "javascript" => "const x = () => 1;",
            "go" => "package main\nfunc main(){}",
            "c" => "int main(void){return 0;}",
            _ => unreachable!(),
        };
        let tree = parser.parse(src, None).expect("parse");
        println!(
            "{name}: nodes={}, root={}",
            tree.root_node().descendant_count(),
            tree.root_node().to_sexp()
        );
    }
    println!(
        "available: {} languages",
        breeze_tree_sitter_parsers_sys::available_languages().len()
    );
}
