const BASE = process.env.BITRIX_WEBHOOK_URL;

// Bitrix devolve esse código quando passamos do rate limit (geralmente
// ~2 req/s por webhook). Quando isso aparece, retry com backoff
// exponencial — costuma resolver em 1–2 tentativas.
const RATE_LIMIT_CODES = new Set([
  "QUERY_LIMIT_EXCEEDED",
  "OPERATION_TIME_LIMIT",
  "OVERLOAD_LIMIT",
]);
const RATE_LIMIT_RE = /too many requests|query limit|overload/i;

function isRateLimitError(err: {
  error?: string;
  error_description?: string;
}): boolean {
  if (err.error && RATE_LIMIT_CODES.has(String(err.error).toUpperCase())) return true;
  if (err.error_description && RATE_LIMIT_RE.test(err.error_description)) return true;
  if (err.error && RATE_LIMIT_RE.test(String(err.error))) return true;
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ===========================================================================
// Semáforo global de concorrência
// ===========================================================================
// Bitrix REST aceita ~2 req/s por webhook. Sem isso, um único GET
// /api/bitrix/board dispara ~19 chamadas em paralelo (7 do Promise.all
// principal + 12 userfield.list pros enums da Reunião) e estoura o limite.
// Limitando concorrência a 2 e adicionando throttle entre slots, conseguimos
// manter um throughput estável sem precisar contar tokens.

const MAX_CONCURRENT = 2;
const MIN_INTERVAL_MS = 350; // 350ms entre slots ⇒ ~2.8 req/s no pico
let inFlight = 0;
const waiters: Array<() => void> = [];
let lastStartedAt = 0;

async function acquireSlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
  } else {
    await new Promise<void>((resolve) => waiters.push(resolve));
    inFlight++;
  }
  // Espaça os starts pra ficar próximo do limite
  const since = Date.now() - lastStartedAt;
  if (since < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - since);
  lastStartedAt = Date.now();
}

function releaseSlot(): void {
  inFlight--;
  const next = waiters.shift();
  if (next) next();
}

// ===========================================================================
// Cache em memória pra metadados (userfield.list, etc.)
// ===========================================================================
// Definições de campos custom raramente mudam — cachear 5 min reduz
// drasticamente o número de chamadas em GETs subsequentes do /board.

const metaCache = new Map<string, { value: any; expiresAt: number }>();
const META_TTL_MS = 5 * 60 * 1000;

function cacheKey(method: string, params: Record<string, any>): string {
  return `${method}::${JSON.stringify(params)}`;
}

function getCached<T>(method: string, params: Record<string, any>): T | undefined {
  const key = cacheKey(method, params);
  const hit = metaCache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    metaCache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function setCached(method: string, params: Record<string, any>, value: any): void {
  metaCache.set(cacheKey(method, params), {
    value,
    expiresAt: Date.now() + META_TTL_MS,
  });
}

// Métodos cujos resultados ficam cacheados por META_TTL_MS:
const CACHEABLE_METHODS = new Set([
  "crm.deal.userfield.list",
  "crm.status.list",
  "user.get",
]);

function buildFormBody(params: Record<string, any>): URLSearchParams {
  const body = new URLSearchParams();
  const append = (key: string, value: any) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => append(`${key}[${i}]`, v));
    } else if (typeof value === "object") {
      Object.entries(value).forEach(([k, v]) => append(`${key}[${k}]`, v));
    } else {
      body.append(key, String(value));
    }
  };
  Object.entries(params).forEach(([k, v]) => append(k, v));
  return body;
}

async function bitrixRaw(method: string, params: Record<string, any>): Promise<any> {
  const url = `${BASE!.replace(/\/$/, "")}/${method}.json`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: buildFormBody(params),
      cache: "no-store",
    });
    // Algumas vezes Bitrix devolve 503/429 com HTML ou texto plano ao
    // sobrecarregar. Sintetizamos um erro estilo rate-limit pra que o
    // retry pegue.
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429 || res.status === 503 || /too many|overload/i.test(text)) {
        return { error: "QUERY_LIMIT_EXCEEDED", error_description: text || `HTTP ${res.status}` };
      }
      // Tenta parsear JSON do corpo de erro mesmo assim
      try {
        return JSON.parse(text);
      } catch {
        return { error: `HTTP_${res.status}`, error_description: text || res.statusText };
      }
    }
    return await res.json();
  } catch (e: any) {
    // Erro de rede — também tratamos como retry-elegível
    return {
      error: "NETWORK_ERROR",
      error_description: e?.message || String(e),
    };
  }
}

/**
 * Chama um método REST do Bitrix com retry automático em caso de rate
 * limit. Backoff: 700ms, 1800ms, 4000ms, 8000ms (até 5 tentativas).
 * Concorrência global limitada via semáforo (ver topo do arquivo).
 * Métodos de metadata (CACHEABLE_METHODS) ficam em cache por 5 min.
 */
export async function bitrix<T = any>(
  method: string,
  params: Record<string, any> = {}
): Promise<T> {
  if (!BASE) throw new Error("BITRIX_WEBHOOK_URL não está configurado em .env.local");

  // 1) Cache hit pra metadados
  if (CACHEABLE_METHODS.has(method)) {
    const hit = getCached<T>(method, params);
    if (hit !== undefined) return hit;
  }

  const delays = [700, 1800, 4000, 8000];
  let lastErr: { error?: string; error_description?: string } | null = null;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    await acquireSlot();
    let json: any;
    try {
      json = await bitrixRaw(method, params);
    } finally {
      releaseSlot();
    }
    if (!json.error) {
      if (CACHEABLE_METHODS.has(method)) setCached(method, params, json.result);
      return json.result as T;
    }
    lastErr = json;
    if (!isRateLimitError(json) || attempt === delays.length) break;
    await sleep(delays[attempt]);
  }

  throw new Error(
    `Bitrix ${method}: ${lastErr?.error_description || lastErr?.error || "erro desconhecido"}`
  );
}

export async function bitrixListAll<T = any>(
  method: string,
  params: Record<string, any> = {}
): Promise<T[]> {
  if (!BASE) throw new Error("BITRIX_WEBHOOK_URL não está configurado em .env.local");
  const out: T[] = [];
  let start = 0;
  const delays = [700, 1800, 4000, 8000];

  for (let i = 0; i < 50; i++) {
    let json: any = null;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      await acquireSlot();
      try {
        json = await bitrixRaw(method, { ...params, start });
      } finally {
        releaseSlot();
      }
      if (!json.error) break;
      if (!isRateLimitError(json) || attempt === delays.length) {
        throw new Error(`Bitrix ${method}: ${json.error_description || json.error}`);
      }
      await sleep(delays[attempt]);
    }
    const chunk = (json.result as T[]) || [];
    out.push(...chunk);
    if (json.next === undefined || json.next === null) break;
    start = json.next;
    // O semáforo já espaça os slots; sleep aqui seria redundante.
  }
  return out;
}
