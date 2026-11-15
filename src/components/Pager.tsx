import { useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { paginate } from "../lib/catalog";

// Client-side pagination for any list. `resetKey` returns to page 1 when a filter changes.
export function usePaged<T>(items: T[], pageSize = 10, resetKey: unknown = "") {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey]);
  const result = paginate(items, page, pageSize);
  return { ...result, setPage };
}

export function Pagination({
  current,
  total,
  count,
  setPage,
  label = "Pagination",
}: {
  current: number;
  total: number;
  count: number;
  setPage: (n: number) => void;
  label?: string;
}) {
  if (total <= 1) return null;
  const start = total <= 7 ? 1 : Math.max(1, Math.min(current - 3, total - 6));
  return (
    <nav className="pagination" aria-label={label}>
      <span className="muted">
        {current} / {total} · {count} items
      </span>
      <div className="row">
        <button
          className="secondary"
          aria-label="Previous page"
          disabled={current <= 1}
          onClick={() => setPage(current - 1)}
        >
          <ChevronLeft size={14} />
        </button>
        {Array.from({ length: Math.min(total, 7) }, (_, i) => start + i).map(
          (n) => (
            <button
              key={n}
              aria-label={"Page " + n}
              aria-current={n === current ? "page" : undefined}
              className={n === current ? "primary" : "secondary"}
              onClick={() => setPage(n)}
            >
              {n}
            </button>
          ),
        )}
        <button
          className="secondary"
          aria-label="Next page"
          disabled={current >= total}
          onClick={() => setPage(current + 1)}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </nav>
  );
}

// Search runs only when the Search button is clicked (or Enter submits the form).
export function SearchBar({
  value,
  onSearch,
  placeholder = "Search…",
  label = "Search",
}: {
  value: string;
  onSearch: (query: string) => void;
  placeholder?: string;
  label?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  function submit(e: FormEvent) {
    e.preventDefault();
    onSearch(draft.trim());
  }
  return (
    <form className="search-bar" role="search" onSubmit={submit}>
      <div className="search-box">
        <Search size={15} />
        <input
          aria-label={label}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        {(draft || value) && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Clear search"
            onClick={() => {
              setDraft("");
              onSearch("");
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
      <button type="submit" className="primary">
        Search
      </button>
    </form>
  );
}
