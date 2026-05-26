import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/google";

export const dynamic = "force-dynamic";

// Inicia o fluxo OAuth: redireciona pro Google. O usuário vai ver a tela
// de consentimento e depois cair em /api/google/callback com um `code`.
export async function GET() {
  try {
    const url = buildAuthUrl();
    return NextResponse.redirect(url);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao iniciar OAuth" },
      { status: 500 }
    );
  }
}
