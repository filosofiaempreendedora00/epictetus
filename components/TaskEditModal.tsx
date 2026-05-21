"use client";

import { useEffect, useRef, useState } from "react";
import {
  TASK_TYPE_COLORS,
  TASK_TYPE_INFO,
  TASK_TYPE_ORDER,
  inferTaskType,
  stripTypePrefix,
  type TaskType,
} from "@/lib/taskTypes";

type DealOption = { id: string; name: string };

type Props = {
  heading: string;
  initialTitle: string;
  initialDescription: string;
  initialDeadline?: string | null;
  initialDealId?: string | null;
  dealsForSelect?: DealOption[];
  linkedDealName?: string;
  saveLabel: string;
  onClose: () => void;
  onSave: (fields: {
    title: string;
    description: string;
    deadline: string | null;
    dealId?: string;
  }) => Promise<void>;
  onComplete?: () => Promise<void>;
};

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

function snapTo15Minutes(local: string): string {
  if (!local) return local;
  const d = new Date(local);
  if (isNaN(d.getTime())) return local;
  const minutes = d.getMinutes();
  const snapped = Math.round(minutes / 15) * 15;
  if (snapped >= 60) {
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
  } else {
    d.setMinutes(snapped);
  }
  d.setSeconds(0, 0);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

function splitLocal(local: string): { date: string; hour: number; minute: number } {
  if (!local) return { date: "", hour: 20, minute: 0 };
  const [date, time] = local.split("T");
  const [h, m] = (time || "20:00").split(":").map((v) => parseInt(v, 10) || 0);
  return { date: date || "", hour: h, minute: m };
}

function joinLocal(date: string, hour: number, minute: number): string {
  if (!date) return "";
  return `${date}T${pad2(hour)}:${pad2(minute)}`;
}

function localInputToBitrix(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (isNaN(d.getTime())) return null;
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const absMin = Math.abs(offset);
  const hh = pad2(Math.floor(absMin / 60));
  const mm = pad2(absMin % 60);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}:00${sign}${hh}:${mm}`;
}

function HourPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="w-[60px] text-sm text-slate-900 border border-slate-200 rounded-lg px-2 py-2 outline-none hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:bg-slate-50 disabled:text-slate-400 flex items-center justify-between gap-1"
        aria-label="Hora"
      >
        <span className="tabular-nums">{pad2(value)}</span>
        <span className="text-slate-400 text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute z-10 top-full mt-1 left-0 bg-white rounded-lg shadow-xl border border-slate-200 p-1.5 grid grid-cols-4 gap-1 min-w-[176px]">
          {Array.from({ length: 24 }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onChange(i);
                setOpen(false);
              }}
              className={`tabular-nums text-[13px] px-2 py-1.5 rounded transition ${
                i === value
                  ? "bg-sky-500 text-white font-medium"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {pad2(i)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DealCombobox({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: DealOption[];
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(() => {
    const sel = options.find((o) => o.id === value);
    return sel ? sel.name : "";
  });
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sincroniza query quando value muda externamente (ex: pré-seleção via prop)
  useEffect(() => {
    const sel = options.find((o) => o.id === value);
    setQuery(sel ? sel.name : "");
  }, [value, options]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        // Restaura query se ficou divergente do selecionado
        const sel = options.find((o) => o.id === value);
        setQuery(sel ? sel.name : "");
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        const sel = options.find((o) => o.id === value);
        setQuery(sel ? sel.name : "");
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, value, options]);

  const selectedName = options.find((o) => o.id === value)?.name;
  const q = query.trim().toLowerCase();
  const showAll = !q || q === (selectedName?.toLowerCase() ?? "");
  const filtered = showAll
    ? options
    : options.filter((o) => o.name.toLowerCase().includes(q));

  function handleSelect(id: string, name: string) {
    onChange(id);
    setQuery(name);
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setQuery("");
    setOpen(true);
    inputRef.current?.focus();
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          width="14"
          height="14"
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
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          placeholder="Buscar negócio…"
          className="w-full text-sm text-slate-900 border border-slate-200 rounded-lg pl-9 pr-9 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:bg-slate-50"
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition w-5 h-5 flex items-center justify-center"
            title="Limpar"
            aria-label="Limpar"
          >
            ✕
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-10 top-full mt-1 w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-slate-400 text-sm">
              Nenhum negócio encontrado
            </div>
          ) : (
            <>
              {filtered.slice(0, 50).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => handleSelect(o.id, o.name)}
                  className={`block w-full text-left px-3 py-2 text-sm transition ${
                    o.id === value
                      ? "bg-sky-100 text-sky-800 font-medium"
                      : "text-slate-700 hover:bg-sky-50"
                  }`}
                >
                  {o.name}
                </button>
              ))}
              {filtered.length > 50 && (
                <div className="px-3 py-1.5 text-[11px] text-slate-400 border-t border-slate-100">
                  Mostrando 50 de {filtered.length} — refine a busca
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MinutePicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const safeValue = [0, 15, 30, 45].includes(value) ? value : 0;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="w-[60px] text-sm text-slate-900 border border-slate-200 rounded-lg px-2 py-2 outline-none hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:bg-slate-50 disabled:text-slate-400 flex items-center justify-between gap-1"
        aria-label="Minuto"
      >
        <span className="tabular-nums">{pad2(safeValue)}</span>
        <span className="text-slate-400 text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute z-10 top-full mt-1 left-0 bg-white rounded-lg shadow-xl border border-slate-200 p-1.5 flex gap-1">
          {[0, 15, 30, 45].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                onChange(m);
                setOpen(false);
              }}
              className={`tabular-nums text-[13px] px-3 py-1.5 rounded transition ${
                m === safeValue
                  ? "bg-sky-500 text-white font-medium"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {pad2(m)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TaskEditModal({
  heading,
  initialTitle,
  initialDescription,
  initialDeadline,
  initialDealId,
  dealsForSelect,
  linkedDealName,
  saveLabel,
  onClose,
  onSave,
  onComplete,
}: Props) {
  // Detecta o tipo inferido do título original (vazio em criação)
  const inferredOriginalType = initialTitle ? inferTaskType(initialTitle) : "";
  const originalWasR3 = !!initialTitle && /^R3\b/i.test(initialTitle.trim());

  const [title, setTitle] = useState(stripTypePrefix(initialTitle));
  const [description, setDescription] = useState(initialDescription);
  const [deadline, setDeadline] = useState(() =>
    snapTo15Minutes(isoToLocalInput(initialDeadline))
  );
  const [dealId, setDealId] = useState<string>(initialDealId || "");
  const [taskType, setTaskType] = useState<TaskType | "">(
    inferredOriginalType || ""
  );
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = saving || completing;

  const { date: dlDate, hour: dlHour, minute: dlMinute } = splitLocal(deadline);
  const showDealSelector = Array.isArray(dealsForSelect);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave() {
    if (!title.trim()) {
      setError("O nome da tarefa não pode ficar vazio");
      return;
    }
    if (showDealSelector && !dealId) {
      setError("Selecione o negócio do Kanban");
      return;
    }
    if (!taskType) {
      setError("Selecione o tipo da tarefa");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Monta o prefixo: caso especial pra preservar R3 quando o original era R3
      const t = taskType as TaskType;
      let prefix = TASK_TYPE_INFO[t].prefix;
      if (t === "R2R3" && originalWasR3) prefix = "R3 - ";
      const cleanTitle = title.trim();
      const finalTitle = prefix && cleanTitle ? prefix + cleanTitle : cleanTitle;
      await onSave({
        title: finalTitle,
        description,
        deadline: deadline ? localInputToBitrix(deadline) : null,
        ...(showDealSelector ? { dealId } : {}),
      });
      onClose();
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    if (!onComplete) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Marcar essa tarefa como concluída?")
    ) {
      return;
    }
    setCompleting(true);
    setError(null);
    try {
      await onComplete();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Erro ao concluir tarefa");
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{heading}</h2>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-slate-400 hover:text-slate-700 transition text-lg leading-none w-6 h-6 flex items-center justify-center"
            title="Fechar"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1">
              Nome da tarefa
            </label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              className="w-full text-sm text-slate-900 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:bg-slate-50"
            />
            {taskType && TASK_TYPE_INFO[taskType as TaskType].prefix && (
              <div className="text-[10px] text-slate-400 mt-1">
                Será salva como:{" "}
                <span className="text-slate-600 font-medium">
                  {(() => {
                    const t = taskType as TaskType;
                    const pre =
                      t === "R2R3" && originalWasR3
                        ? "R3 - "
                        : TASK_TYPE_INFO[t].prefix;
                    return pre + (title.trim() || "...");
                  })()}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1.5">
              Tipo da tarefa <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {TASK_TYPE_ORDER.map((t) => {
                const selected = taskType === t;
                const colors = TASK_TYPE_COLORS[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTaskType(t)}
                    disabled={busy}
                    className={`text-[12px] px-3 py-1 rounded-full border transition ${
                      selected
                        ? `${colors.solidBg} ${colors.solidBorder} ${colors.solidText}`
                        : `bg-white ${colors.border} ${colors.title} hover:${colors.bg}`
                    } disabled:opacity-50`}
                  >
                    {TASK_TYPE_INFO[t].label}
                  </button>
                );
              })}
            </div>
          </div>

          {showDealSelector ? (
            <div>
              <label className="block text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1">
                Negócio do Kanban
              </label>
              <DealCombobox
                value={dealId}
                options={dealsForSelect || []}
                onChange={setDealId}
                disabled={busy}
              />
            </div>
          ) : linkedDealName ? (
            <div>
              <label className="block text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1">
                Negócio vinculado
              </label>
              <div className="text-sm text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2 break-words">
                {linkedDealName}
              </div>
            </div>
          ) : null}

          <div>
            <label className="block text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1">
              Prazo
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dlDate}
                onChange={(e) =>
                  setDeadline(joinLocal(e.target.value, dlHour, dlMinute))
                }
                disabled={busy}
                className="flex-1 text-sm text-slate-900 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:bg-slate-50"
              />
              <HourPicker
                value={dlHour}
                onChange={(h) => setDeadline(joinLocal(dlDate, h, dlMinute))}
                disabled={saving || !dlDate}
              />
              <span className="text-slate-400">:</span>
              <MinutePicker
                value={dlMinute}
                onChange={(m) => setDeadline(joinLocal(dlDate, dlHour, m))}
                disabled={saving || !dlDate}
              />
              {dlDate && (
                <button
                  type="button"
                  onClick={() => setDeadline("")}
                  disabled={busy}
                  className="text-[11px] text-slate-500 hover:text-red-600 transition px-2 py-1 rounded shrink-0"
                  title="Limpar prazo"
                >
                  limpar
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1">
              Descrição
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              rows={6}
              placeholder="Mais detalhes sobre a tarefa…"
              className="w-full text-sm text-slate-900 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 resize-y disabled:bg-slate-50"
            />
          </div>

          {error && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded px-2.5 py-1.5">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          {onComplete ? (
            <button
              onClick={handleComplete}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition disabled:opacity-50 font-medium"
              title="Marca a tarefa como concluída no Bitrix e remove daqui"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {completing ? "Concluindo…" : "Marcar como concluída"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={onClose}
              disabled={busy}
              className="px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-200 rounded-md transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={busy}
              className="px-4 py-1.5 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-md transition disabled:opacity-50 font-medium"
            >
              {saving ? "Salvando…" : saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
