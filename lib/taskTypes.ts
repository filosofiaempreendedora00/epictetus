// Tipo de tarefa — inferido pelo prefixo do título no Bitrix.
// Não usa campo customizado: combina com o padrão já existente
// ("FUP - ...", "R2 na sexta", "Criar proposta - ...").

export type TaskType = "FUP" | "R2R3" | "PROPOSTA" | "OUTRO";

export const TASK_TYPE_INFO: Record<
  TaskType,
  { label: string; prefix: string }
> = {
  FUP: { label: "FUP", prefix: "FUP - " },
  R2R3: { label: "R2/R3", prefix: "R2 - " },
  PROPOSTA: { label: "Criar proposta", prefix: "Criar proposta - " },
  OUTRO: { label: "Outro", prefix: "" },
};

// Paleta de cores por tipo. Classes Tailwind escritas inteiras pro JIT detectar.
export type TaskTypeColors = {
  bg: string;
  border: string;
  hover: string;
  dot: string;
  title: string;
  deadline: string;
  // Para pills sólidos (filtro ativo, badge sólido)
  solidBg: string;
  solidBorder: string;
  solidText: string;
};

export const TASK_TYPE_COLORS: Record<TaskType, TaskTypeColors> = {
  FUP: {
    bg: "bg-sky-50",
    border: "border-sky-200",
    hover: "hover:bg-sky-100/70",
    dot: "bg-sky-500",
    title: "text-sky-800",
    deadline: "text-sky-600",
    solidBg: "bg-sky-500",
    solidBorder: "border-sky-500",
    solidText: "text-white",
  },
  R2R3: {
    bg: "bg-violet-50",
    border: "border-violet-200",
    hover: "hover:bg-violet-100/70",
    dot: "bg-violet-500",
    title: "text-violet-800",
    deadline: "text-violet-600",
    solidBg: "bg-violet-500",
    solidBorder: "border-violet-500",
    solidText: "text-white",
  },
  PROPOSTA: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    hover: "hover:bg-emerald-100/70",
    dot: "bg-emerald-500",
    title: "text-emerald-800",
    deadline: "text-emerald-600",
    solidBg: "bg-emerald-500",
    solidBorder: "border-emerald-500",
    solidText: "text-white",
  },
  OUTRO: {
    bg: "bg-slate-50",
    border: "border-slate-200",
    hover: "hover:bg-slate-100/70",
    dot: "bg-slate-500",
    title: "text-slate-700",
    deadline: "text-slate-500",
    solidBg: "bg-slate-500",
    solidBorder: "border-slate-500",
    solidText: "text-white",
  },
};

export const TASK_TYPE_ORDER: TaskType[] = [
  "FUP",
  "R2R3",
  "PROPOSTA",
  "OUTRO",
];

export function inferTaskType(title: string | undefined | null): TaskType {
  if (!title) return "OUTRO";
  const t = title.trim();
  if (/^FUP\b/i.test(t)) return "FUP";
  if (/^R[23]\b/i.test(t)) return "R2R3";
  if (/^(criar\s+proposta|proposta)\b/i.test(t)) return "PROPOSTA";
  return "OUTRO";
}

/**
 * Constrói o título final aplicando o prefixo do tipo escolhido,
 * mas evita duplicação se o usuário já digitou o prefixo manualmente.
 */
export function buildTitleWithType(type: TaskType, raw: string): string {
  const trimmed = raw.trim();
  const prefix = TASK_TYPE_INFO[type].prefix;
  if (!prefix) return trimmed;
  // Se o usuário já tem um prefixo do MESMO tipo, não duplica
  if (inferTaskType(trimmed) === type) return trimmed;
  return prefix + trimmed;
}
