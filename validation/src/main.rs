// Include the auto-generated bindings
include!(concat!(env!("OUT_DIR"), "/grammars.rs"));

fn main() {
    println!("🔍 Tree-sitter Parsers Validation");
    println!("===================================");
    
    let languages = available_grammars();
    println!("Testing {} core grammars...\n", languages.len());

    let mut all_passed = true;

    // Test cases for different languages
    let test_cases = vec![
        ("c", "int main() { return 0; }"),
        ("python", "def hello():\n    pass"),
        ("javascript", "function hello() { return 42; }"),
        ("rust", "fn main() { println!(\"Hello\"); }"),
        ("go", "func main() { fmt.Println(\"Hello\") }"),
    ];

    for &lang_name in languages {
        print!("Testing {:<12} ", format!("{}...", lang_name));
        
        match test_language(lang_name, &test_cases) {
            Ok(details) => {
                println!("✅ {} ", details);
            }
            Err(error) => {
                println!("❌ {}", error);
                all_passed = false;
            }
        }
    }

    println!("\n=== Validation Summary ===");
    if all_passed {
        println!("🎉 All grammars validated successfully!");
        println!("✅ Library linking works correctly");
        println!("✅ Grammar loading works correctly");
        println!("✅ Basic parsing works correctly");
        std::process::exit(0);
    } else {
        println!("💥 Validation failed! Some grammars are broken.");
        println!("❌ This indicates a problem with the library build process");
        std::process::exit(1);
    }
}

fn test_language(lang_name: &str, test_cases: &[(&str, &str)]) -> Result<String, String> {
    // Test 1: Load the language
    let language = load_grammar(lang_name)
        .ok_or_else(|| format!("Failed to load grammar"))?;

    // Test 2: Check basic language properties
    let node_kind_count = language.node_kind_count();
    if node_kind_count == 0 {
        return Err("Invalid language (0 node kinds)".to_string());
    }

    // Test 3: Try to parse with this language if we have test code
    if let Some((_, test_code)) = test_cases.iter().find(|(name, _)| *name == lang_name) {
        let mut parser = tree_sitter::Parser::new();
        parser.set_language(&language)
            .map_err(|e| format!("Failed to set language: {}", e))?;

        let tree = parser.parse(test_code, None)
            .ok_or_else(|| "Failed to parse test code".to_string())?;

        if tree.root_node().has_error() {
            return Err("Parse tree has errors".to_string());
        }

        Ok(format!("(nodes: {}, parsed: {} chars)", node_kind_count, test_code.len()))
    } else {
        // Just test basic loading for languages without test cases
        Ok(format!("(nodes: {})", node_kind_count))
    }
}