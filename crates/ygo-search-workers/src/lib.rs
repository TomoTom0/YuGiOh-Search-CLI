pub mod db;
pub mod handlers;
pub mod types;

// 旧 ygo-search-workers rlib 利用者向け互換 re-export（経過措置・将来非推奨）。
// core 側の純粋ロジックモジュールを再公開する。新規利用者は ygo-search crate を直接依存すること。
pub use ygo_search::{faq, normalize, search};

use worker::*;

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    console_error_panic_hook::set_once();

    Router::new()
        .get("/", |_, _| Response::ok("YGO Search API"))
        .get("/health", |_, _| {
            Response::from_json(&serde_json::json!({
                "status": "ok",
                "version": env!("CARGO_PKG_VERSION")
            }))
        })
        .post_async("/api/normalize", handlers::normalize_text)
        .post_async("/api/patterns/extract", handlers::extract_patterns)
        .post_async("/api/patterns/replace", handlers::replace_patterns)
        .post_async("/api/search/cards", handlers::search_cards)
        .post_async("/api/search/faqs", handlers::search_faqs)
        .run(req, env)
        .await
}
