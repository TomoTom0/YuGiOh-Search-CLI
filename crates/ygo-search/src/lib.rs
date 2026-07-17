pub mod faq;
pub mod normalize;
pub mod search;
pub mod types;

#[cfg(feature = "format")]
pub mod format;

#[cfg(feature = "fs")]
pub mod fs;

#[cfg(feature = "vector-search")]
pub mod vector;

#[cfg(all(target_arch = "wasm32", feature = "fs"))]
compile_error!("feature `fs` is native-only (file IO unavailable on wasm32)");

#[cfg(all(target_arch = "wasm32", feature = "vector-search"))]
compile_error!("feature `vector-search` is native-only (lancedb/ort cannot link to wasm32)");

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
