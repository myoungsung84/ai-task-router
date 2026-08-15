const inputClass =
  "w-full rounded-md border border-[#232c38] bg-[#0e131a] px-3 py-2 text-sm text-white placeholder:text-[#546274] focus:border-blue-500 focus:outline-none";
const selectClass =
  "rounded-md border border-[#232c38] bg-[#0e131a] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none";

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
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input
        className={inputClass}
        placeholder="검색: Job ID, 제목, 프로젝트, branch (예: T-1042)"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <select
        className={selectClass}
        value={project}
        onChange={(e) => onProjectChange(e.target.value)}
      >
        <option value="">모든 프로젝트</option>
        {projectOptions.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </div>
  );
}
