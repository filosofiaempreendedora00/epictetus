"use client";

import { useEffect, useState } from "react";

type Props = {
  heading: string;
  initialTitle: string;
  initialDescription: string;
  initialDeadline?: string | null;
  saveLabel: string;
  onClose: () => void;
  onSave: (fields: {
    title: string;
    description: string;
    deadline: string | null;
  }) => Promise<void>;
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
  if (!local) return { date: "", hour: 9, minute: 0 };
  const [date, time] = local.split("T");
  const [h, m] = (time || "09:00").split(":").map((v) => parseInt(v, 10) || 0);
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

export default function TaskEditModal({
  heading,
  initialTitle,
  initialDescription,
  initialDeadline,
  saveLabel,
  onClose,
  onSave,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [deadline, setDeadline] = useState(() =>
    snapTo15Minutes(isoToLocalInput(initialDeadline))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { date: dlDate, hour: dlHour, minute: dlMinute } = splitLocal(deadline);

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
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        description,
        deadline: deadline ? localInputToBitrix(deadline) : null,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
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
            disabled={saving}
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
              disabled={saving}
              className="w-full text-sm text-slate-900 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:bg-slate-50"
            />
          </div>

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
                disabled={saving}
                className="flex-1 text-sm text-slate-900 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:bg-slate-50"
              />
              <select
                value={dlHour}
                onChange={(e) =>
                  setDeadline(joinLocal(dlDate, parseInt(e.target.value, 10), dlMinute))
                }
                disabled={saving || !dlDate}
                className="text-sm text-slate-900 border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:bg-slate-50 disabled:text-slate-400"
                aria-label="Hora"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {pad2(i)}
                  </option>
                ))}
              </select>
              <span className="text-slate-400">:</span>
              <select
                value={[0, 15, 30, 45].includes(dlMinute) ? dlMinute : 0}
                onChange={(e) =>
                  setDeadline(joinLocal(dlDate, dlHour, parseInt(e.target.value, 10)))
                }
                disabled={saving || !dlDate}
                className="text-sm text-slate-900 border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:bg-slate-50 disabled:text-slate-400"
                aria-label="Minuto"
              >
                {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>
                    {pad2(m)}
                  </option>
                ))}
              </select>
              {dlDate && (
                <button
                  type="button"
                  onClick={() => setDeadline("")}
                  disabled={saving}
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
              disabled={saving}
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

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-200 rounded-md transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-md transition disabled:opacity-50 font-medium"
          >
            {saving ? "Salvando…" : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
