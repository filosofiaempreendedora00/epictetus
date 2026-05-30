"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card as CardType } from "@/lib/types";
import { formatBRL } from "@/lib/initialData";
import TaskEditModal from "./TaskEditModal";
import { TASK_TYPE_COLORS } from "@/lib/taskTypes";

type Props = {
  card: CardType;
  columnId: string;
  onDelete?: () => void;
  onUpdateValue?: (cardId: string, field: "pontual" | "recurring", value: number) => void;
  onUpdateTask?: (
    cardId: string,
    taskId: string,
    fields: { title?: string; description?: string; deadline?: string | null }
  ) => Promise<void>;
  onCreateTask?: (
    cardId: string,
    fields: { title: string; description: string; deadline?: string | null }
  ) => Promise<void>;
  onCompleteTask?: (cardId: string, taskId: string) => Promise<void>;
  onUpdateProposalLink?: (cardId: string, link: string) => Promise<void>;
  allStages?: Array<{ stageId: string; title: string }>;
  currentStageId?: string;
  onChangeStage?: (cardId: string, newStageId: string) => Promise<void>;
  // Abrir o modal "Editar negócio" agora é responsabilidade do parent
  // (Board) — ele atualiza a URL pra /negocios/<nome> e renderiza o modal.
  // Mantém só uma instância do modal por board (evita duplicação).
  onOpenDealEdit?: (cardTitle: string) => void;
};

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function formatTaskDeadline(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return `hoje ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();
  if (isTomorrow) return "amanhã";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

function parseInputToNumber(raw: string): number {
  if (!raw) return 0;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let cleaned: string;
  if (lastComma > lastDot) {
    cleaned = raw.replace(/\./g, "").replace(",", ".");
  } else {
    cleaned = raw.replace(/,/g, "");
  }
  const n = parseFloat(cleaned.replace(/[^\d.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function MoneyRow({
  label,
  value,
  onSave,
}: {
  label: "R" | "P";
  value: number;
  onSave?: (n: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const isZero = !value;
  const canEdit = !!onSave;

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(String(value || 0));
    setEditing(true);
  }

  function commit() {
    const n = parseInputToNumber(draft);
    setEditing(false);
    if (onSave && n !== value) onSave(n);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-slate-500 text-[10px] font-medium uppercase tracking-wide whitespace-nowrap shrink-0">
          Valor {label}
        </span>
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={draft}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className="w-24 text-base sm:text-[12px] px-2 py-1 sm:px-1.5 sm:py-0.5 border border-sky-400 rounded outline-none text-slate-900"
        />
      </div>
    );
  }

  return (
    <div className="flex items-baseline gap-1.5 group/v">
      <span className="text-slate-500 text-[10px] font-medium uppercase tracking-wide whitespace-nowrap shrink-0">
        Valor {label}
      </span>
      <span
        className={`text-[12px] whitespace-nowrap ${
          isZero ? "text-slate-600" : "text-slate-900 font-semibold"
        }`}
      >
        {formatBRL(value || 0)}
      </span>
      {canEdit && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={startEdit}
          // Mobile: mais visível (50%); desktop: discreto (25%) e brilha no hover
          className="w-6 h-6 sm:w-5 sm:h-5 flex items-center justify-center opacity-50 sm:opacity-25 hover:opacity-100 transition text-slate-500 hover:text-sky-600"
          title={`Editar Valor ${label}`}
          aria-label={`Editar Valor ${label}`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 000-1.41l-2.34-2.34a.996.996 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function Card({
  card,
  columnId,
  onDelete,
  onUpdateValue,
  onUpdateTask,
  onCreateTask,
  onCompleteTask,
  onUpdateProposalLink,
  allStages,
  currentStageId,
  onChangeStage,
  onOpenDealEdit,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: card.id,
      data: { type: "card", columnId },
    });

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);
  const [editingProposal, setEditingProposal] = useState(false);
  const [proposalDraft, setProposalDraft] = useState("");
  const editingTask = card.tasks?.find((t) => t.id === editingTaskId) || null;
  const showModal = !!editingTask || creatingTask;

  function startEditProposal(e: React.MouseEvent) {
    e.stopPropagation();
    setProposalDraft(card.proposalLink || "");
    setEditingProposal(true);
  }

  async function commitProposal() {
    const trimmed = proposalDraft.trim();
    setEditingProposal(false);
    if (onUpdateProposalLink && trimmed !== (card.proposalLink || "")) {
      await onUpdateProposalLink(card.id, trimmed);
    }
  }

  function ensureProtocol(url: string): string {
    const t = url.trim();
    if (!t) return "";
    if (/^(https?:|mailto:|tel:)/i.test(t)) return t;
    return `https://${t}`;
  }

  function openProposalLink(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const url = ensureProtocol(card.proposalLink || "");
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  async function handleCopyPhone(e: React.MouseEvent) {
    e.stopPropagation();
    if (!card.phone) return;
    try {
      await navigator.clipboard.writeText(card.phone);
      setPhoneCopied(true);
      setTimeout(() => setPhoneCopied(false), 2200);
    } catch {
      // Fallback: tenta selecionar texto via execCommand
      const ta = document.createElement("textarea");
      ta.value = card.phone;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setPhoneCopied(true);
        setTimeout(() => setPhoneCopied(false), 2200);
      } catch {}
      document.body.removeChild(ta);
    }
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={(e) => {
          if (!onOpenDealEdit) return;
          // ignora cliques originados em elementos filhos interativos
          // (cada um já chama stopPropagation, mas guardamos por segurança)
          if ((e.target as HTMLElement).closest("button, input, textarea, select, a, [contenteditable='true']")) {
            return;
          }
          // Se algum input/textarea ainda está montado no card (ex.: usuário
          // editando Valor R/P ou link da proposta), esse clique é o "blur"
          // pra commitar a edição — NÃO devemos abrir o modal de editar
          // negócio em cima. Esse era o bug do "tentei mudar Valor R e
          // abriu uma tela estranha".
          if (e.currentTarget.querySelector("input, textarea")) {
            return;
          }
          onOpenDealEdit(card.title);
        }}
        className="group bg-white rounded-xl shadow-sm px-3 py-2.5 cursor-grab active:cursor-grabbing relative overflow-hidden hover:shadow-md transition"
      >
        {/* WhatsApp — copia telefone do contato. Touch area mais generosa
            (32x32) com padding pra ser fácil de tocar em mobile. */}
        {card.phone && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleCopyPhone}
            className="absolute top-0.5 right-0.5 w-8 h-8 flex items-center justify-center opacity-75 hover:opacity-100 text-[#25D366] hover:text-[#1ebe5d] transition"
            title={`Copiar telefone (${card.phone})`}
            aria-label="Copiar telefone para WhatsApp"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.6 6.32A7.85 7.85 0 0 0 12 4a7.94 7.94 0 0 0-6.87 11.93L4 20l4.2-1.1A7.94 7.94 0 0 0 12 19.94a7.94 7.94 0 0 0 7.94-7.94 7.85 7.85 0 0 0-2.34-5.68Zm-5.6 12.22a6.6 6.6 0 0 1-3.36-.92l-.24-.14-2.49.65.67-2.43-.16-.25a6.59 6.59 0 1 1 12.24-3.48 6.6 6.6 0 0 1-6.66 6.57Zm3.62-4.92c-.2-.1-1.18-.58-1.36-.65s-.31-.1-.45.1-.51.65-.62.78-.23.15-.43.05a5.4 5.4 0 0 1-1.6-1 6 6 0 0 1-1.1-1.37c-.12-.2 0-.3.09-.4l.3-.35a1.4 1.4 0 0 0 .2-.34.36.36 0 0 0 0-.35c-.05-.1-.45-1.08-.62-1.48s-.33-.34-.45-.34h-.4a.78.78 0 0 0-.56.26 2.36 2.36 0 0 0-.73 1.75A4.1 4.1 0 0 0 8.43 13a9.34 9.34 0 0 0 3.57 3.17 12.2 12.2 0 0 0 1.2.44 2.9 2.9 0 0 0 1.32.08 2.15 2.15 0 0 0 1.41-1 1.74 1.74 0 0 0 .13-1c-.05-.08-.18-.13-.38-.23Z" />
            </svg>
          </button>
        )}

        {/* Delete — opacidade total em mobile (sem hover), só hover em desktop */}
        {onDelete && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className={`absolute top-0.5 ${
              card.phone ? "right-9" : "right-0.5"
            } w-7 h-7 flex items-center justify-center opacity-50 sm:opacity-0 group-hover:opacity-100 transition text-slate-400 hover:text-red-500 text-xs`}
            title="Excluir"
            aria-label="Excluir"
          >
            ✕
          </button>
        )}

        {/* Title */}
        <h3
          className={`text-slate-900 font-medium leading-snug text-[12px] ${
            card.phone ? "pr-7" : ""
          }`}
        >
          {card.title}
        </h3>

        {/* Chip "gelinho" — só aparece em cards do pipeline de Congelados.
            Mostra a data exata do congelamento (CLOSEDATE) com vibe
            azul-gelo + ❄️ pra reforçar visualmente. */}
        {card.congeladoEm && (
          <div className="mt-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-gradient-to-r from-sky-50 to-cyan-50 border border-sky-200/80 text-sky-700 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)]">
              <span className="text-sky-500" aria-hidden>❄</span>
              <span>Congelado em {card.congeladoEm}</span>
            </span>
          </div>
        )}

        {/* Valores R e P (sempre visíveis, editáveis) */}
        <div className="mt-1.5 space-y-0.5">
          <MoneyRow
            label="R"
            value={card.recurring || 0}
            onSave={
              onUpdateValue ? (n) => onUpdateValue(card.id, "recurring", n) : undefined
            }
          />
          <MoneyRow
            label="P"
            value={card.pontual || 0}
            onSave={
              onUpdateValue ? (n) => onUpdateValue(card.id, "pontual", n) : undefined
            }
          />
        </div>

        {/* Date */}
        <div className="text-slate-400 text-[10px] mt-1">{card.dateLabel}</div>

        {/* Pessoa responsável + Fonte (lado a lado) */}
        <div className="mt-2 flex gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[9px] text-slate-500">Responsável</div>
            <div className="mt-0.5 flex items-center gap-1 min-w-0">
              <div className="w-3.5 h-3.5 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-[8px] shrink-0">
                👤
              </div>
              <span className="text-sky-500 text-[11px] truncate">{card.responsible}</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[9px] text-slate-500">Fonte</div>
            <div className="mt-0.5 text-slate-800 text-[11px] truncate">{card.source}</div>
          </div>
        </div>

        {/* SDR */}
        {card.sdr && (
          <>
            <div className="mt-2 text-[10px] text-slate-500">SDR</div>
            <div className="text-sky-500 text-[12px]">{card.sdr}</div>
          </>
        )}

        {/* Task badge (legacy mock) */}
        {card.taskStatus && (
          <>
            <div className="mt-2 text-[10px] text-slate-500">Tarefa</div>
            <span
              className={`inline-block mt-0.5 text-[10px] font-semibold px-2 py-1 rounded ${
                card.taskStatus === "ATRASADA"
                  ? "bg-red-100 text-red-600"
                  : "bg-sky-100 text-sky-600"
              }`}
            >
              {card.taskStatus}
            </span>
          </>
        )}

        {/* Link da proposta */}
        {onUpdateProposalLink && (
          <div className="mt-2 pt-1.5 border-t border-slate-100">
            {editingProposal ? (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 text-[10px] uppercase tracking-wide font-medium shrink-0">
                  Proposta
                </span>
                <input
                  autoFocus
                  type="url"
                  value={proposalDraft}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setProposalDraft(e.target.value)}
                  onBlur={commitProposal}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitProposal();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setEditingProposal(false);
                    }
                  }}
                  placeholder="https://…"
                  className="flex-1 min-w-0 text-base sm:text-[11px] px-2 py-1 sm:px-1.5 sm:py-0.5 border border-sky-400 rounded outline-none text-slate-900"
                />
              </div>
            ) : card.proposalLink ? (
              <div className="flex items-center gap-1.5 group/p">
                <span className="text-slate-500 text-[10px] uppercase tracking-wide font-medium shrink-0">
                  Proposta
                </span>
                <a
                  href={ensureProtocol(card.proposalLink)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={openProposalLink}
                  className="flex-1 min-w-0 truncate text-[11px] text-sky-600 hover:text-sky-800 underline cursor-pointer"
                  title={card.proposalLink}
                >
                  {card.proposalLink}
                </a>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={startEditProposal}
                  className="w-6 h-6 flex items-center justify-center opacity-50 sm:opacity-30 hover:opacity-100 transition text-slate-500 hover:text-sky-600 shrink-0"
                  title="Editar link"
                  aria-label="Editar link da proposta"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 000-1.41l-2.34-2.34a.996.996 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={startEditProposal}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-slate-200 text-slate-400 hover:text-sky-600 hover:border-sky-300 transition text-[11px]"
                title="Adicionar link da proposta"
              >
                <span className="leading-none">+</span>
                <span>Link da proposta</span>
              </button>
            )}
          </div>
        )}

        {/* Tarefas */}
        <div className="mt-2 pt-1.5 border-t border-slate-100 space-y-1">
          {card.tasks && card.tasks.length > 0 && (
            <ul className="space-y-1">
              {card.tasks.map((task) => {
                const colors = TASK_TYPE_COLORS[task.type];
                return (
                  <li
                    key={task.id}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingTaskId(task.id);
                    }}
                    className={`flex items-start gap-1.5 px-2 py-1 rounded-md border text-[11px] cursor-pointer transition hover:shadow-sm ${
                      colors.bg
                    } ${colors.hover} ${
                      task.overdue ? "border-red-300" : colors.border
                    }`}
                    title="Clique para editar"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[5px] ${colors.dot}`}
                    />
                    <span
                      className={`flex-1 break-words font-medium leading-snug ${colors.title}`}
                    >
                      {task.title}
                    </span>
                    {task.deadline && (
                      <span
                        className={`shrink-0 text-[10px] whitespace-nowrap mt-[1px] ${
                          task.overdue ? "text-red-500 font-medium" : colors.deadline
                        }`}
                      >
                        {formatTaskDeadline(task.deadline)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {onCreateTask && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setCreatingTask(true);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-slate-200 text-slate-400 hover:text-sky-600 hover:border-sky-300 transition text-[11px]"
              title="Criar nova tarefa"
            >
              <span className="leading-none">+</span>
              <span>Criar tarefa</span>
            </button>
          )}
        </div>
      </div>

      {showModal && (
        <TaskEditModal
          heading={editingTask ? "Editar tarefa" : "Nova tarefa"}
          initialTitle={editingTask?.title ?? ""}
          initialDescription={editingTask?.description ?? ""}
          initialDeadline={editingTask?.deadline ?? null}
          saveLabel={editingTask ? "Salvar alterações" : "Criar"}
          onClose={() => {
            setEditingTaskId(null);
            setCreatingTask(false);
          }}
          onSave={async (fields) => {
            if (editingTask && onUpdateTask) {
              await onUpdateTask(card.id, editingTask.id, fields);
            } else if (creatingTask && onCreateTask) {
              await onCreateTask(card.id, fields);
            }
          }}
          onComplete={
            editingTask && onCompleteTask
              ? () => onCompleteTask(card.id, editingTask.id)
              : undefined
          }
        />
      )}

      {phoneCopied && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-8 z-[60] bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-2xl flex items-center gap-2 pointer-events-none">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-emerald-400"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>
            Número copiado{card.phone ? `: ${card.phone}` : ""}
          </span>
        </div>
      )}
    </>
  );
}
