import { NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/google";

export const dynamic = "force-dynamic";

// Callback do OAuth: o Google manda o usuário aqui com ?code=...
// Trocamos o code por tokens e mostramos o REFRESH_TOKEN numa HTML
// rudimentar (mas amigável) pra Roberto copiar e colar no .env.local
// e nas env vars do Render. Setup é manual de propósito — é uma chave
// sensível e queremos que ele veja exatamente o que está sendo persistido.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return htmlResponse(
      `<h1>Erro autorizando</h1><pre>${escapeHtml(error)}</pre>`,
      400
    );
  }
  if (!code) {
    return htmlResponse(
      "<h1>Esperando um <code>?code</code> do Google.</h1>",
      400
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return htmlResponse(
        `<h1>O Google não devolveu refresh_token.</h1>
         <p>Isso costuma acontecer quando você já autorizou esse app antes.
            Vá em <a href="https://myaccount.google.com/permissions" target="_blank">
            myaccount.google.com/permissions</a>, remova o acesso do Epictetus,
            e tente de novo.</p>`,
        400
      );
    }

    const rt = tokens.refresh_token;
    return htmlResponse(`
      <!doctype html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Google conectado</title>
        <style>
          body { font-family: system-ui, -apple-system, Segoe UI, sans-serif;
                 background: #060912; color: #e5e7eb; max-width: 700px;
                 margin: 40px auto; padding: 20px; line-height: 1.6; }
          h1 { color: #4ade80; }
          code, pre { background: rgba(255,255,255,0.06); padding: 4px 6px;
                      border-radius: 6px; word-break: break-all; }
          pre { padding: 14px; border: 1px solid rgba(255,255,255,0.1);
                white-space: pre-wrap; }
          .step { margin: 28px 0; }
          .danger { color: #f87171; font-weight: 600; }
          button { background: #38bdf8; color: #062c43; border: 0;
                   font: inherit; padding: 8px 14px; border-radius: 8px;
                   cursor: pointer; font-weight: 600; }
          a { color: #38bdf8; }
        </style>
      </head>
      <body>
        <h1>✅ Google autorizado</h1>
        <p>Cole esse <strong>refresh token</strong> nas env vars:</p>

        <div class="step">
          <p><strong>1)</strong> Em <code>.env.local</code> (local) e em
             <em>Environment Variables</em> do Render (prod), adicione:</p>
          <pre id="token">GOOGLE_REFRESH_TOKEN=${escapeHtml(rt)}</pre>
          <button onclick="navigator.clipboard.writeText(document.getElementById('token').textContent); this.textContent='copiado ✓'">
            copiar
          </button>
        </div>

        <div class="step">
          <p><strong>2)</strong> Reinicie o dev server (Ctrl+C, depois <code>npm run dev</code>)
             e no Render dispara um redeploy (ou ele reinicia automático ao salvar env).</p>
        </div>

        <div class="step">
          <p><strong>3)</strong> Acesse <a href="/reunioes">/reunioes</a> — sua agenda
             deve aparecer.</p>
        </div>

        <p class="danger">⚠ Esse token tem acesso de leitura à sua agenda — não compartilhe.</p>
      </body>
      </html>
    `);
  } catch (e: any) {
    return htmlResponse(
      `<h1>Erro trocando code por tokens</h1><pre>${escapeHtml(e?.message || String(e))}</pre>`,
      500
    );
  }
}

function htmlResponse(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
