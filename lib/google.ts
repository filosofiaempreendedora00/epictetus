import { google, type calendar_v3 } from "googleapis";

// =============================================================================
// OAuth do Google — integração com a agenda do Roberto
// =============================================================================
//
// Como funciona:
// 1) Setup único: Roberto autoriza o app em /api/google/auth → callback
//    devolve um REFRESH TOKEN, que é persistido como env var.
// 2) Cada request: criamos um OAuth2Client com o refresh token, ele troca
//    automaticamente por um access token novo (cache interno do google-auth)
//    e bate na Calendar API.
//
// Env vars esperadas (em .env.local pro dev e no Render pro prod):
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REDIRECT_URI       (ex.: https://epictetus.onrender.com/api/google/callback)
//   GOOGLE_REFRESH_TOKEN      (gerado uma vez via /api/google/auth)

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

export function buildOAuthClient(): InstanceType<typeof google.auth.OAuth2> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Credenciais Google não configuradas — defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI em .env.local"
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * URL de consent — manda o usuário pro Google autorizar.
 * `prompt: "consent"` força a tela de permissão a aparecer mesmo se já
 * autorizou antes, garantindo que o refresh_token venha de volta (caso
 * contrário, em 2ª autorização o Google não devolve refresh_token).
 */
export function buildAuthUrl(): string {
  const client = buildOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

/** Troca o `code` retornado no callback por tokens (incluindo refresh). */
export async function exchangeCodeForTokens(code: string): Promise<{
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
}> {
  const client = buildOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

/** Cliente autenticado pronto pra uso, usando o REFRESH TOKEN persistido. */
function getAuthenticatedClient(): InstanceType<typeof google.auth.OAuth2> {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error(
      "GOOGLE_REFRESH_TOKEN não configurado — autorize uma vez via /api/google/auth e cole o token retornado em .env.local"
    );
  }
  const client = buildOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  start: string;           // ISO; pode ser data-só (event all-day) ou dateTime
  end: string;
  allDay: boolean;
  location: string;
  hangoutLink?: string;    // Meet
  htmlLink: string;        // link pra abrir no calendário
  attendees: { email: string; name?: string; responseStatus?: string }[];
  organizer?: { email?: string; name?: string };
  status: string;          // "confirmed" | "tentative" | "cancelled"
};

/**
 * Lista eventos do calendário primário entre `from` e `to` (ambos ISO).
 * Limit padrão alto pra cobrir 2 semanas (~50-100 eventos típicos).
 */
export async function listCalendarEvents(
  from: Date,
  to: Date
): Promise<CalendarEvent[]> {
  const auth = getAuthenticatedClient();
  const calendar = google.calendar({ version: "v3", auth });

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: true,      // expande eventos recorrentes em instâncias
    orderBy: "startTime",
    maxResults: 250,
    showDeleted: false,
  });

  const items = res.data.items || [];
  return items.map(toCalendarEvent).filter((e) => e.start && e.end);
}

function toCalendarEvent(e: calendar_v3.Schema$Event): CalendarEvent {
  // Eventos all-day usam `date`, eventos com hora usam `dateTime`.
  const startRaw = e.start?.dateTime || e.start?.date || "";
  const endRaw = e.end?.dateTime || e.end?.date || "";
  const allDay = !e.start?.dateTime;

  return {
    id: String(e.id || ""),
    title: e.summary || "(sem título)",
    description: e.description || "",
    start: startRaw,
    end: endRaw,
    allDay,
    location: e.location || "",
    hangoutLink: e.hangoutLink || undefined,
    htmlLink: e.htmlLink || "",
    attendees: (e.attendees || []).map((a) => ({
      email: a.email || "",
      name: a.displayName || undefined,
      responseStatus: a.responseStatus || undefined,
    })),
    organizer: e.organizer
      ? {
          email: e.organizer.email || undefined,
          name: e.organizer.displayName || undefined,
        }
      : undefined,
    status: e.status || "confirmed",
  };
}
