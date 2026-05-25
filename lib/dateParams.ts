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
 * Slugifica um nome (deve casar com `slugifyClient` em lib/route.ts):
 * remove acentos, lowercase, troca não-alfanumérico por `-`.
 */
function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Procura um deal por ID exato, por substring do nome (case-insensitive)
 * ou por slug. O fallback por slug é o que faz `/negocios/geral-sonnix-david-david`
 * achar o deal `[Geral] Sonnix | David David` — sem ele, o path-routing
 * abria a URL mas o modal nem renderizava.
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
  if (byName) return byName;
  // 3) Slug do nome contém o slug da query (ou vice-versa, pra ser
  //    permissivo com queries curtas tipo "luma")
  const slugQ = slugify(q);
  if (!slugQ) return null;
  const bySlug = deals.find((d) => {
    const slugName = slugify(d.name);
    return slugName.includes(slugQ) || slugQ.includes(slugName);
  });
  return bySlug || null;
}
