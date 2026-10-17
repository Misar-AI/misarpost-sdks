<?php

declare(strict_types=1);

namespace MisarAI\MisarPost;

/**
 * Page through MisarPost's ?page= list endpoints: calls the fetcher with page
 * 1, 2, … until the page the server reports as totalPages — or, when an
 * endpoint reports no totals, until a page comes back empty.
 *
 *     foreach (Pagination::paginate(fn (int $p) => $post->posts->list(['status' => 'queued', 'page' => $p])) as $page) { … }
 */
final class Pagination
{
    /**
     * @param callable(int): array<string, mixed> $fetchPage
     * @return \Generator<int, array<string, mixed>>
     */
    public static function paginate(callable $fetchPage, int $maxPages = 0): \Generator
    {
        for ($page = 1, $seen = 0; $maxPages <= 0 || $seen < $maxPages; $page++, $seen++) {
            $result = $fetchPage($page);
            yield $result;
            if (isset($result['totalPages']) && is_int($result['totalPages'])) {
                if ($page >= $result['totalPages']) {
                    return;
                }
                continue;
            }
            $items = null;
            foreach ($result as $value) {
                if (is_array($value) && array_is_list($value)) {
                    $items = $value;
                    break;
                }
            }
            if (!$items) {
                return;
            }
        }
    }
}
