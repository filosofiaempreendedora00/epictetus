export type TaskStatus = "PRAZO ATUALIZADO" | "ATRASADA" | null;

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
};

export type Column = {
  id: string;
  title: string;
  color: string;
  cardIds: string[];
  stageId?: string;
};

export type BoardState = {
  columns: Column[];
  cards: Record<string, Card>;
};
