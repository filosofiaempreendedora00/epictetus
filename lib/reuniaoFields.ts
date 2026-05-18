// Config centralizado dos campos obrigatórios para sair da etapa
// "Reunião realizada" (STAGE_ID = "NEW") para qualquer próxima etapa.
//
// Se algum mapeamento abaixo estiver apontando para o UF_CRM errado,
// basta corrigir o valor de "bitrixField" — o restante (modal, API)
// usa esse config como fonte única de verdade.

export type ReuniaoFieldType =
  | "textarea"
  | "string"
  | "enum"
  | "enum-multi"
  | "datetime";

export type ReuniaoField = {
  key: string;
  bitrixField: string;
  label: string;
  type: ReuniaoFieldType;
};

export const REUNIAO_FIELDS: ReuniaoField[] = [
  {
    key: "planoAcao",
    bitrixField: "UF_CRM_1752257201941", // string longo
    label: "Plano de ação para fechamento",
    type: "textarea",
  },
  {
    key: "briefing",
    bitrixField: "UF_CRM_1752257382853",
    label: "O briefing foi bem feito?",
    type: "enum",
  },
  {
    key: "consciencia",
    bitrixField: "UF_CRM_1752257470858",
    label: "Consciência do cliente sobre a nossa solução",
    type: "enum",
  },
  {
    key: "maturidade",
    bitrixField: "UF_CRM_1752257573260",
    label: "Maturidade da empresa",
    type: "enum",
  },
  {
    key: "qualifBudget",
    bitrixField: "UF_CRM_1752257644630",
    label: "Qualificação por Budget",
    type: "enum",
  },
  {
    key: "qualifAutoridade",
    bitrixField: "UF_CRM_1752257724752",
    label: "Qualificação por autoridade",
    type: "enum",
  },
  {
    key: "qualifTimming",
    bitrixField: "UF_CRM_1752257794549",
    label: "Qualificação por Timming",
    type: "enum",
  },
  {
    key: "forecast",
    bitrixField: "UF_CRM_1753386706",
    label: "Forecast",
    type: "datetime",
  },
  {
    key: "probabilidade",
    bitrixField: "UF_CRM_1753390153",
    label: "Probabilidade de fechamento",
    type: "enum",
  },
  {
    key: "feedbackReuniao",
    bitrixField: "UF_CRM_1752257244471",
    label: "Feedback sobre a reunião",
    type: "string",
  },
  {
    key: "reuniaoQualificada",
    bitrixField: "UF_CRM_1762201643",
    label: "Reunião qualificada?",
    type: "enum",
  },
  {
    key: "tier",
    bitrixField: "UF_CRM_1762281321",
    label: "Tier",
    type: "enum",
  },
  {
    key: "pausarComunicacoes",
    bitrixField: "UF_CRM_1771964969",
    label: "Pausar comunicações do João",
    type: "enum",
  },
  {
    key: "riscos",
    bitrixField: "UF_CRM_1771965137", // mesmo campo de "Motivo de perda" — Bitrix reusa
    label: "Riscos à negociação",
    type: "enum-multi",
  },
  {
    key: "quaisServicos",
    bitrixField: "UF_CRM_1764612541",
    label: "Quais serviços o cliente precisa?",
    type: "enum-multi",
  },
];
