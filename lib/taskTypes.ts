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
  // Para chips/cards (fundo claro sobre cards brancos)
  bg: string;
  border: string;
  hover: string;
  dot: string;
  title: string;
  deadline: string;
  // Para pills do filtro quando ATIVO (cor sólida, sobre fundo escuro)
  solidBg: string;
  solidBorder: string;
  solidText: string;
  // Para pills do filtro quando INATIVO (translúcido, mas mantendo identidade)
  fadedBg: string;
  fadedBorder: string;
  fadedText: string;
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
    fadedBg: "bg-sky-500/15",
    fadedBorder: "border-sky-400/40",
    fadedText: "text-sky-300",
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
    fadedBg: "bg-violet-500/15",
    fadedBorder: "border-violet-400/40",
    fadedText: "text-violet-300",
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
    fadedBg: "bg-emerald-500/15",
    fadedBorder: "border-emerald-400/40",
    fadedText: "text-emerald-300",
  },
  OUTRO: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    hover: "hover:bg-amber-100/70",
    dot: "bg-amber-500",
    title: "text-amber-800",
    deadline: "text-amber-600",
    solidBg: "bg-amber-500",
    solidBorder: "border-amber-500",
    solidText: "text-white",
    fadedBg: "bg-amber-500/15",
    fadedBorder: "border-amber-400/40",
    fadedText: "text-amber-300",
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

/**
 * Remove o prefixo conhecido (FUP, R2, R3, Criar proposta/Proposta)
 * do início do título. Mantém o restante intacto.
 */
export function stripTypePrefix(title: string): string {
  if (!title) return "";
  const t = title.trim();
  const stripped = t
    .replace(/^FUP[\s\-:p\/]+/i, "")
    .replace(/^R[23][\s\-:]+/i, "")
    .replace(/^(criar\s+proposta|proposta)[\s\-:]+/i, "")
    .trim();
  // Se nada foi removido OU se sobrou vazio, devolve o original
  return stripped && stripped !== t ? stripped : t;
}
