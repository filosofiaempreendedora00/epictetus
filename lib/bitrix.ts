const BASE = process.env.BITRIX_WEBHOOK_URL;

export async function bitrix<T = any>(
  method: string,
  params: Record<string, any> = {}
): Promise<T> {
  if (!BASE) throw new Error("BITRIX_WEBHOOK_URL não está configurado em .env.local");

  const url = `${BASE.replace(/\/$/, "")}/${method}.json`;
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

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const json = await res.json();
  if (json.error) {
    throw new Error(`Bitrix ${method}: ${json.error_description || json.error}`);
  }
  return json.result as T;
}

export async function bitrixListAll<T = any>(
  method: string,
  params: Record<string, any> = {}
): Promise<T[]> {
  const out: T[] = [];
  let start = 0;
  for (let i = 0; i < 50; i++) {
    const url = `${(BASE || "").replace(/\/$/, "")}/${method}.json`;
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
    Object.entries({ ...params, start }).forEach(([k, v]) => append(k, v));

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const json = await res.json();
    if (json.error) throw new Error(`Bitrix ${method}: ${json.error_description || json.error}`);
    const chunk = (json.result as T[]) || [];
    out.push(...chunk);
    if (json.next === undefined || json.next === null) break;
    start = json.next;
  }
  return out;
}
