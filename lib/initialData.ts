import type { BoardState } from "./types";

export const initialBoard: BoardState = {
  columns: [
    {
      id: "col-reuniao",
      title: "Reunião realizada",
      color: "from-[#2c7cb0] to-[#3a8cc0]",
      cardIds: [],
    },
    {
      id: "col-diagnostico",
      title: "Em diagnóstico",
      color: "from-[#3aacd9] to-[#46bfe0]",
      cardIds: ["card-modo", "card-deep"],
    },
    {
      id: "col-proposta",
      title: "Confecção de proposta",
      color: "from-[#4dd0ce] to-[#55dcc8]",
      cardIds: ["card-coopercann"],
    },
    {
      id: "col-negociacao",
      title: "Em negociação",
      color: "from-[#5fe0b7] to-[#6ce8a5]",
      cardIds: ["card-luma", "card-lf"],
    },
  ],
  cards: {
    "card-modo": {
      id: "card-modo",
      title: "[Creators] MODO | Mário Mário",
      value: 0,
      dateLabel: "ontem, 12:05",
      responsible: "Roberto Fachetti",
      source: "Formulário",
      sdr: "Eduardo Tonane",
      notifications: 0,
    },
    "card-deep": {
      id: "card-deep",
      title: "Deep Fitness | Tatieli",
      value: 0,
      dateLabel: "27 de abril",
      responsible: "Roberto Fachetti",
      source: "Prospecção",
      sdr: "Pedro Amaral",
    },
    "card-coopercann": {
      id: "card-coopercann",
      title: "[Ecommerce] coopercann | juliano",
      value: 0,
      dateLabel: "12 de abril",
      responsible: "Roberto Fachetti",
      source: "Formulário",
      pontual: 12000,
      sdr: "Kaike Pereira",
      taskStatus: "PRAZO ATUALIZADO",
      notifications: 1,
    },
    "card-luma": {
      id: "card-luma",
      title: "Luma",
      value: 0,
      dateLabel: "5 de maio",
      responsible: "Roberto Fachetti",
      source: "Indicação",
      pontual: 9997,
      recurring: 6997,
      taskStatus: "ATRASADA",
      notifications: 2,
    },
    "card-lf": {
      id: "card-lf",
      title: "[Creators] L&F Fashion | Luis Luis",
      value: 0,
      dateLabel: "27 de abril",
      responsible: "Roberto Fachetti",
      source: "Formulário",
      notifications: 1,
    },
  },
};

export const formatBRL = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
