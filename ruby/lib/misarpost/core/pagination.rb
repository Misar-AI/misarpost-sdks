# frozen_string_literal: true

module MisarPost
  # Page through MisarPost's ?page= list endpoints. Yields page 1, 2, … until
  # the response's totalPages is reached, or — when an endpoint reports no
  # totals — until a page comes back empty.
  #
  #   MisarPost.paginate { |n| post.posts.list(query: { "status" => "queued", "page" => n }) }.each { |page| ... }
  def self.paginate(start_page: 1, max_pages: nil, &fetch_page)
    Enumerator.new do |yielder|
      page_no = start_page
      seen = 0
      loop do
        break if max_pages && seen >= max_pages
        result = fetch_page.call(page_no)
        yielder << result
        total = result.is_a?(Hash) ? result["totalPages"] : nil
        if total.is_a?(Integer)
          break if page_no >= total
        else
          items = result.is_a?(Hash) ? result.values.find { |v| v.is_a?(Array) } : nil
          break if items.nil? || items.empty?
        end
        page_no += 1
        seen += 1
      end
    end
  end
end
