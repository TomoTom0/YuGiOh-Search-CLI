pub mod handlers;
pub mod types;
pub mod db;

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
        .post("/api/normalize", handlers::normalize_text)
        .post("/api/patterns/extract", handlers::extract_patterns)
        .post("/api/patterns/replace", handlers::replace_patterns)
        .post("/api/search/cards", handlers::search_cards)
        .post("/api/search/faqs", handlers::search_faqs)
        .run(req, env)
        .await
}
