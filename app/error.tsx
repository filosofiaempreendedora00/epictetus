"use client";

import { useEffect, useState } from "react";

// Error boundary global do App Router. Quando algum render falha, em vez
// de mostrar "Application error: client-side exception" sem contexto,
// renderiza a mensagem + stack + botões úteis (recarregar / limpar
// sessionStorage). Limpar a session é importante porque várias features
// salvam state lá (pendingCongelado, pendingReuniaoExit, etc.) — se algum
// stored state ficou com shape stale após um deploy, a próxima render
// pode quebrar até o user limpar.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Log no console pra facilitar debug. Em produção o digest do Next
    // mascara a stack — mas o console tem a stack completa.
    // eslint-disable-next-line no-console
    console.error("[GlobalError]", error);
    // Também dispara pra /api/error pra ficar no log do server (Render),
    // onde a gente consegue puxar depois. Não bloqueia se falhar.
    try {
      fetch("/api/error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          digest: error.digest,
          url: typeof window !== "undefined" ? window.location.href : "",
          userAgent:
            typeof navigator !== "undefined" ? navigator.userAgent : "",
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }, [error]);

  function clearSessionAndReload() {
    try {
      // Limpa todos os state persistidos do app — útil quando o shape
      // mudou e o stored state ficou incompatível.
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith("epictetus."))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch {
      /* private mode, sem permissão, etc. */
    }
    window.location.reload();
  }

  async function copyFullDetails() {
    const details = [
      `Message: ${error.message}`,
      error.digest ? `Digest: ${error.digest}` : "",
      `URL: ${typeof window !== "undefined" ? window.location.href : ""}`,
      `UA: ${typeof navigator !== "undefined" ? navigator.userAgent : ""}`,
      `Timestamp: ${new Date().toISOString()}`,
      "",
      "Stack:",
      error.stack || "(sem stack)",
    ].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      /* clipboard bloqueado */
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#060912]">
      <div className="max-w-xl w-full bg-white/[0.04] border border-red-400/30 rounded-xl p-6 text-white">
        <h1 className="text-lg font-semibold mb-2">
          Algo quebrou aqui no Epictetus 😬
        </h1>
        <p className="text-sm text-white/70 mb-4">
          O front-end deu uma exceção no render. Tenta recarregar — se o
          erro insistir, clica em "Limpar sessão e recarregar" pra zerar
          state salvo (modais pendentes etc.) que pode estar com formato
          antigo após um deploy.
        </p>

        <div className="bg-black/30 border border-white/10 rounded-md p-3 mb-4 max-h-48 overflow-auto">
          <div className="text-[11px] text-rose-300 font-mono whitespace-pre-wrap break-all">
            {error.message}
          </div>
          {error.digest && (
            <div className="text-[10px] text-white/40 mt-2">
              digest: {error.digest}
            </div>
          )}
          {error.stack && (
            <div className="text-[10px] text-white/50 font-mono mt-2 whitespace-pre-wrap break-all">
              {error.stack.split("\n").slice(0, 30).join("\n")}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={reset}
            className="px-4 py-2 text-sm bg-sky-500 hover:bg-sky-400 text-white rounded-md font-medium"
          >
            Tentar de novo
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 text-white rounded-md"
          >
            Recarregar página
          </button>
          <button
            onClick={clearSessionAndReload}
            className="px-4 py-2 text-sm bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/30 rounded-md"
          >
            Limpar sessão e recarregar
          </button>
          <button
            onClick={copyFullDetails}
            className="px-4 py-2 text-sm bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 rounded-md"
          >
            {copied ? "✓ Copiado" : "Copiar stack completa"}
          </button>
        </div>
      </div>
    </div>
  );
}
