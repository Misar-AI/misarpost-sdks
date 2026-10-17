package misarpost

import "context"

// Paginate walks a ?page= list endpoint: it calls fetch with page 1, 2, … and
// hands each response to visit, stopping after the page the server reports as
// totalPages — or, when an endpoint reports no totals, after the first empty
// page. Return false from visit to stop early.
//
//	err := misarpost.Paginate(ctx, func(ctx context.Context, page int) (map[string]any, error) {
//		return client.Posts.List(ctx, map[string]string{"status": "queued", "page": strconv.Itoa(page)})
//	}, func(page map[string]any) bool { fmt.Println(page["posts"]); return true })
func Paginate(ctx context.Context, fetch func(ctx context.Context, page int) (map[string]any, error), visit func(map[string]any) bool) error {
	for page := 1; ; page++ {
		res, err := fetch(ctx, page)
		if err != nil {
			return err
		}
		if !visit(res) {
			return nil
		}
		if total, ok := res["totalPages"].(float64); ok {
			if float64(page) >= total {
				return nil
			}
			continue
		}
		empty := true
		for _, v := range res {
			if arr, ok := v.([]any); ok {
				empty = len(arr) == 0
				break
			}
		}
		if empty {
			return nil
		}
	}
}
