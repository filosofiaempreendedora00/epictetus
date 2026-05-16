"use client";

export type ViewMode = "negocios" | "tarefas";

type Props = {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
};

export default function Header({
  searchTerm,
  onSearchChange,
  viewMode,
  onViewModeChange,
}: Props) {
  const title =
    viewMode === "tarefas" ? "Tarefas do Roberto" : "Negócios do Roberto";

  return (
    <header className="px-6 pt-6 pb-3">
      <div className="flex items-center gap-6 flex-wrap">
        <h1 className="text-2xl font-semibold text-white">{title}</h1>

        <div className="relative flex-1 min-w-[240px] max-w-[420px] ml-auto">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={
              viewMode === "tarefas" ? "Pesquisar tarefa" : "Pesquisar negócio"
            }
            className="w-full bg-white/[0.07] hover:bg-white/[0.1] focus:bg-white/[0.1] transition border border-white/15 focus:border-sky-400/60 rounded-lg pl-9 pr-9 py-2 text-sm text-white placeholder:text-white/50 outline-none focus:ring-2 focus:ring-sky-400/20"
          />
          {searchTerm && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/90 transition w-5 h-5 flex items-center justify-center rounded"
              title="Limpar busca"
              aria-label="Limpar busca"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 inline-flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-lg p-1">
        <button
          onClick={() => onViewModeChange("negocios")}
          className={`px-3 py-1 text-[13px] rounded-md transition ${
            viewMode === "negocios"
              ? "bg-white/15 text-white font-medium shadow-sm"
              : "text-white/55 hover:text-white/85"
          }`}
        >
          Negócios
        </button>
        <button
          onClick={() => onViewModeChange("tarefas")}
          className={`px-3 py-1 text-[13px] rounded-md transition ${
            viewMode === "tarefas"
              ? "bg-white/15 text-white font-medium shadow-sm"
              : "text-white/55 hover:text-white/85"
          }`}
        >
          Tarefas
        </button>
      </div>
    </header>
  );
}
