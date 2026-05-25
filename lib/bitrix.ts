const BASE = process.env.BITRIX_WEBHOOK_URL;

// Bitrix devolve esse código quando passamos do rate limit (geralmente
// ~2 req/s por webhook). Quando isso aparece, retry com backoff
// exponencial — costuma resolver em 1–2 tentativas.
const RATE_LIMIT_CODES = new Set([
  "QUERY_LIMIT_EXCEEDED",
  "OPERATION_TIME_LIMIT",
  "OVERLOAD_LIMIT",
]);
const RATE_LIMIT_RE = /too many requests|query limit/i;

function isRateLimitError(err: { error?: string; error_description?: string }): boolean {
  if (err.error && RATE_LIMIT_CODES.has(String(err.error).toUpperCase())) return true;
  if (err.error_description && RATE_LIMIT_RE.test(err.error_description)) return true;
  if (err.error && RATE_LIMIT_RE.test(String(err.error))) return true;
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: buildFormBody(params),
    cache: "no-store",
  });
  return res.json();
}

/**
 * Chama um método REST do Bitrix com retry automático em caso de rate
 * limit. Backoff: 600ms, 1500ms, 3500ms (até 4 tentativas no total).
 */
export async function bitrix<T = any>(
  method: string,
  params: Record<string, any> = {}
): Promise<T> {
  if (!BASE) throw new Error("BITRIX_WEBHOOK_URL não está configurado em .env.local");

  const delays = [600, 1500, 3500];
  let lastErr: { error?: string; error_description?: string } | null = null;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const json = await bitrixRaw(method, params);
    if (!json.error) return json.result as T;
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
  const delays = [600, 1500, 3500];

  for (let i = 0; i < 50; i++) {
    let json: any = null;
    // retry interno em rate limit
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      json = await bitrixRaw(method, { ...params, start });
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
    // Throttle ~120ms entre páginas pra não estourar o budget de 2 req/s
    // do Bitrix em listagens longas.
    await sleep(120);
  }
  return out;
}
