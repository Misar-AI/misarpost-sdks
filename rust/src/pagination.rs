use std::future::Future;

use serde_json::Value;

use crate::MisarPostError;

/// Walk a `?page=` list endpoint: calls `fetch` with page 1, 2, … and collects
/// every page, stopping after the page the server reports as `totalPages` — or,
/// when an endpoint reports no totals, after the first empty page.
///
/// ```no_run
/// # async fn demo(client: misarpost::Client) -> Result<(), misarpost::MisarPostError> {
/// let pages = misarpost::paginate(|page| {
///     let client = &client;
///     async move {
///         let mut q = misarpost::Query::new();
///         q.insert("page".into(), page.to_string());
///         client.posts().list(Some(&q)).await
///     }
/// }, None).await?;
/// # Ok(()) }
/// ```
pub async fn paginate<F, Fut>(
    mut fetch: F,
    max_pages: Option<u32>,
) -> Result<Vec<Value>, MisarPostError>
where
    F: FnMut(u32) -> Fut,
    Fut: Future<Output = Result<Value, MisarPostError>>,
{
    let mut pages = Vec::new();
    let mut page = 1u32;
    loop {
        if max_pages.is_some_and(|max| pages.len() as u32 >= max) {
            return Ok(pages);
        }
        let result = fetch(page).await?;
        let done = match result.get("totalPages").and_then(Value::as_u64) {
            Some(total) => u64::from(page) >= total,
            None => result
                .as_object()
                .and_then(|o| o.values().find_map(Value::as_array))
                .map(|a| a.is_empty())
                .unwrap_or(true),
        };
        pages.push(result);
        if done {
            return Ok(pages);
        }
        page += 1;
    }
}
