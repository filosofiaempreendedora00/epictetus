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
