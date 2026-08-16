import { Search } from "lucide-react";
import { SelectMenu } from "@/components/select-menu";

/** Search + project filter, both at the standard 36px control height so they line up with the status filter across the toolbar row. */
export function TaskSearchBar({
  search,
  onSearchChange,
  project,
  onProjectChange,
  projectOptions,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  project: string;
  onProjectChange: (v: string) => void;
  projectOptions: string[];
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted"
          aria-hidden
        />
        <input
          className="h-9 w-full rounded-md border border-border bg-fg/[0.03] pl-9 pr-3 text-sm text-fg placeholder:text-fg-faint transition-colors duration-fast hover:border-border-strong focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/40"
          placeholder="제목, 경로, 브랜치 검색"
          aria-label="작업 검색"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      {projectOptions.length > 0 ? (
        <SelectMenu
          label="프로젝트 필터"
          value={project}
          onChange={onProjectChange}
          placeholder="모든 프로젝트"
          options={[
            { value: "", label: "모든 프로젝트" },
            ...projectOptions.map((p) => ({ value: p, label: p })),
          ]}
        />
      ) : null}
    </div>
  );
}
