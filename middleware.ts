import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// HTTP Basic Auth simples na frente de todo o app.
// Credenciais lidas das env vars APP_USERNAME / APP_PASSWORD.
// Se as env vars não estiverem definidas, o middleware libera tudo
// (útil pra rodar dev sem configurar nada).
export function middleware(req: NextRequest) {
  const expectedUser = process.env.APP_USERNAME;
  const expectedPass = process.env.APP_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return NextResponse.next();
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    try {
      const decoded = atob(authHeader.slice(6));
      const colon = decoded.indexOf(":");
      const user = decoded.slice(0, colon);
      const pass = decoded.slice(colon + 1);
      if (user === expectedUser && pass === expectedPass) {
        return NextResponse.next();
      }
    } catch {
      // cai no 401 abaixo
    }
  }

  return new NextResponse("Autenticação necessária", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Epictetus", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
