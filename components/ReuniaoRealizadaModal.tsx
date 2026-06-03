"use client";

import { useEffect, useMemo, useState } from "react";
import type { EnumOption } from "@/lib/types";
import { REUNIAO_FIELDS } from "@/lib/reuniaoFields";

type Props = {
  cardTitle: string;
  targetStageName: string;
  fieldOptions: Record<string, EnumOption[]>;
  onCancel: () => void;
  onConfirm: (data: Record<string, any>) => Promise<void>;
};

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function localInputToBitrix(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  if (isNaN(d.getTime())) return "";
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const absMin = Math.abs(offset);
  const hh = pad2(Math.floor(absMin / 60));
  const mm = pad2(absMin % 60);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}:00${sign}${hh}:${mm}`;
}

export default function ReuniaoRealizadaModal({
  cardTitle,
  targetStageName,
  fieldOptions,
  onCancel,
  onConfirm,
}: Props) {
  const initialValues = useMemo(() => {
    const v: Record<string, any> = {};
    for (const f of REUNIAO_FIELDS) {
      if (f.type === "enum-multi") v[f.key] = [];
      else v[f.key] = "";
    }
    return v;
  }, []);

  const [values, setValues] = useState<Record<string, any>>(initialValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  function setField(key: string, value: any) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function toggleMulti(key: string, id: string) {
    setValues((v) => {
      const arr: string[] = v[key] || [];
      return {
        ...v,
        [key]: arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id],
      };
    });
  }

  async function handleConfirm() {
    // Validação: todos obrigatórios
    for (const f of REUNIAO_FIELDS) {
      const val = values[f.key];
      if (f.type === "enum-multi") {
        if (!Array.isArray(val) || val.length === 0) {
          setError(`Selecione: ${f.label}`);
          return;
        }
      } else if (!val || (typeof val === "string" && !val.trim())) {
        setError(`Preencha: ${f.label}`);
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      // Converte datetime do input local pra ISO Bitrix
      const payload: Record<string, any> = {};
      for (const f of REUNIAO_FIELDS) {
        const v = values[f.key];
        if (f.type === "datetime") {
          payload[f.key] = localInputToBitrix(v);
        } else if (f.type === "string" || f.type === "textarea") {
          payload[f.key] = typeof v === "string" ? v.trim() : v;
        } else {
          payload[f.key] = v;
        }
      }
      await onConfirm(payload);
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-stretch sm:items-center justify-center p-0 sm:p-4"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onCancel();
      }}
    >
      <div
        className="bg-white shadow-2xl w-full sm:max-w-2xl flex flex-col h-[100dvh] sm:h-auto sm:max-h-[92vh] rounded-none sm:rounded-xl overflow-hidden cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="safe-top px-4 sm:px-5 py-4 border-b border-slate-100 flex items-start justify-between shrink-0 gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              <span className="hidden sm:inline">Sair de "Reunião realizada" → </span>
              <span className="sm:hidden">Mover para </span>
              {targetStageName}
            </h2>
            <div className="text-[11px] text-slate-500 mt-0.5 break-words">
              {cardTitle}
            </div>
          </div>
          <button type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-slate-400 hover:text-slate-700 transition text-lg leading-none w-10 h-10 sm:w-6 sm:h-6 flex items-center justify-center shrink-0 -mr-2 sm:mr-0"
            title="Cancelar"
            aria-label="Cancelar"
          >
            ✕
          </button>
        </div>

        <div className="px-4 sm:px-5 py-4 overflow-y-auto flex-1">
          <div className="text-[12px] text-slate-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
            Preencha todos os campos abaixo para avançar de etapa. Tudo é
            obrigatório.
          </div>

          {/* Grid 1-col em mobile / 2-col em desktop. Campos textarea
              (só o "Plano de ação") spanam as 2 colunas pra dar espaço. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
            {REUNIAO_FIELDS.map((f) => (
              <div
                key={f.key}
                className={f.type === "textarea" ? "sm:col-span-2" : ""}
              >
                <FieldRow
                  field={f}
                  value={values[f.key]}
                  options={fieldOptions[f.key] || []}
                  disabled={saving}
                  onChange={(v) => setField(f.key, v)}
                  onToggleMulti={(id) => toggleMulti(f.key, id)}
                />
              </div>
            ))}
          </div>

          {error && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded px-2.5 py-1.5 mt-4">
              {error}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 shrink-0 safe-bottom">
          <button type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2.5 sm:py-1.5 text-sm text-slate-700 hover:bg-slate-200 rounded-md transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="px-4 py-2.5 sm:py-1.5 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-md transition disabled:opacity-50 font-medium"
          >
            {saving ? "Salvando…" : "Avançar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  field,
  value,
  options,
  disabled,
  onChange,
  onToggleMulti,
}: {
  field: (typeof REUNIAO_FIELDS)[number];
  value: any;
  options: EnumOption[];
  disabled: boolean;
  onChange: (v: any) => void;
  onToggleMulti: (id: string) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1">
        {field.label} <span className="text-red-500">*</span>
      </label>

      {field.type === "textarea" && (
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={3}
          className="w-full text-sm text-slate-900 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 resize-y disabled:bg-slate-50"
        />
      )}

      {field.type === "string" && (
        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full text-sm text-slate-900 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:bg-slate-50"
        />
      )}

      {field.type === "datetime" && (
        <input
          type="datetime-local"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full text-sm text-slate-900 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:bg-slate-50"
        />
      )}

      {field.type === "enum" && (
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full text-sm text-slate-900 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:bg-slate-50 bg-white"
        >
          <option value="" disabled>
            Selecione…
          </option>
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.value}
            </option>
          ))}
        </select>
      )}

      {field.type === "enum-multi" && (
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt) => {
            const selected = Array.isArray(value) && value.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onToggleMulti(opt.id)}
                disabled={disabled}
                className={`text-[12px] px-2.5 py-1 rounded-full border transition ${
                  selected
                    ? "bg-sky-500 border-sky-500 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:border-sky-300"
                } disabled:opacity-50`}
              >
                {opt.value}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
