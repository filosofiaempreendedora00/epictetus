import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Endpoint que só existe pra logar erros do client-side no Render.
// GlobalError (app/error.tsx) POSTa aqui sempre que o boundary é
// acionado — assim conseguimos ler a stack real (com source maps) no
// log do Render em vez de depender do usuário mandar screenshot.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    // Log estruturado — o Render captura stdout.
    // eslint-disable-next-line no-console
    console.error(
      "[client-error]",
      JSON.stringify(
        {
          message: body?.message,
          digest: body?.digest,
          url: body?.url,
          userAgent: body?.userAgent,
          timestamp: body?.timestamp,
          stack: body?.stack,
        },
        null,
        2
      )
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
