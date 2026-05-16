export type TaskStatus = "PRAZO ATUALIZADO" | "ATRASADA" | null;

export type DealTask = {
  id: string;
  title: string;
  description?: string;
  deadline: string | null;
  overdue: boolean;
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

export type TaskCard = {
  id: string;
  bitrixId: string;
  title: string;
  description: string;
  deadline: string | null;
  dealId?: string;
  dealName?: string;
};

export type TasksBoardState = {
  tasks: Record<string, TaskCard>;
};
