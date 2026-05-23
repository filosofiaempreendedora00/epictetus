// Conversões entre strings amigáveis (voz / URL) e Date.
//
// Formatos aceitos para parseDiaParam:
//   - "hoje"
//   - "amanha" | "amanhã"
//   - "ontem"
//   - "YYYY-MM-DD"
//
// Use formatDiaParam(date) pra serializar (sempre devolve YYYY-MM-DD).

export function parseDiaParam(value: string | null | undefined): Date | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (v === "hoje") return today;
  if (v === "amanha" || v === "amanhã") {
    const d = new Date(today);
    d.setDate(today.getDate() + 1);
    return d;
  }
  if (v === "ontem") {
    const d = new Date(today);
    d.setDate(today.getDate() - 1);
    return d;
  }

  // YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) {
    const d = new Date(
      parseInt(m[1], 10),
      parseInt(m[2], 10) - 1,
      parseInt(m[3], 10)
    );
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

export function formatDiaParam(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Procura um deal pelo seu ID exato ou por substring do nome
 * (case-insensitive). Útil pra URLs amigáveis como ?negocio=luma.
 */
export function findDealByQuery<T extends { id: string; name: string }>(
  query: string | null | undefined,
  deals: T[] | undefined
): T | null {
  if (!query || !deals?.length) return null;
  const q = query.trim().toLowerCase();
  if (!q) return null;
  // 1) Match exato pelo ID
  const byId = deals.find((d) => d.id === query);
  if (byId) return byId;
  // 2) Nome contendo a query (case-insensitive)
  const byName = deals.find((d) => d.name.toLowerCase().includes(q));
  return byName || null;
}
