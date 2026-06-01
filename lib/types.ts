export type TaskStatus = "PRAZO ATUALIZADO" | "ATRASADA" | null;

export type DealTask = {
  id: string;
  title: string;
  description?: string;
  deadline: string | null;
  overdue: boolean;
  type: TaskType;
};

export type Card = {
  id: string;
  title: string;
  value: number;
  dateLabel: string;
  responsible: string;
  source: string;
  sdr?: string;
  pontual?: number;
  recurring?: number;
  taskStatus?: TaskStatus;
  notifications?: number;
  bitrixId?: string;
  tasks?: DealTask[];
  phone?: string;
  proposalLink?: string;
  // Campos extras do pipeline de Congelados (preenchidos só por
  // /api/bitrix/congelados; demais views deixam undefined).
  congeladoMotivos?: string[];
  congeladoDescricao?: string;
  // Data exata do congelamento (CLOSEDATE), já formatada pro display
  // — ex.: "26/05/2026". O Card pinta isso num chip "gelinho" se vier.
  congeladoEm?: string;
};

export type Column = {
  id: string;
  title: string;
  color: string;
  cardIds: string[];
  stageId?: string;
};

export type EnumOption = { id: string; value: string };

export type LoseFieldOptions = {
  motivo: EnumOption[];
  servicos: EnumOption[];
};

export type BoardState = {
  columns: Column[];
  cards: Record<string, Card>;
  loseFieldOptions?: LoseFieldOptions;
  reuniaoFieldOptions?: Record<string, EnumOption[]>;
  // Opções pro PerdidoModal (stage APOLOGY = "Negócio perdido"):
  // só "motivo" — não tem serviços nem nada extra.
  perdidoFieldOptions?: { motivo: EnumOption[] };
};

import type { TaskType } from "./taskTypes";

export type TaskCard = {
  id: string;
  bitrixId: string;
  title: string;
  description: string;
  deadline: string | null;
  dealId?: string;
  dealName?: string;
  phone?: string;
  type: TaskType;
};

export type TasksBoardState = {
  tasks: Record<string, TaskCard>;
  deals?: Array<{ id: string; name: string }>;
};
