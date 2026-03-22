import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// ─── Rate limiting in-memory (funciona em Railway/Node.js persistente) ────────
// Nota: em deploys serverless/Edge, o Map não persiste entre invocações.
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // janela de 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 60;     // máx. 60 req/min por IP em rotas /api

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const timestamps = rateLimitMap.get(ip) ?? [];
    // Remove timestamps fora da janela (sliding window)
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    recent.push(now);
    rateLimitMap.set(ip, recent);
    return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

// Limpeza periódica para evitar crescimento indefinido do Map
setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of rateLimitMap.entries()) {
        const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
        if (recent.length === 0) {
            rateLimitMap.delete(ip);
        } else {
            rateLimitMap.set(ip, recent);
        }
    }
}, RATE_LIMIT_WINDOW_MS);

export async function middleware(request: NextRequest) {
    // ── Rate limiting para rotas /api ────────────────────────────────────────
    if (request.nextUrl.pathname.startsWith("/api/")) {
        const ip =
            request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
            request.headers.get("x-real-ip") ??
            "unknown";

        if (isRateLimited(ip)) {
            return new NextResponse(
                JSON.stringify({ error: "Muitas requisições. Tente novamente em breve." }),
                {
                    status: 429,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }
    }

    let supabaseResponse = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Se não tem user e não está na rota de auth, redireciona para login
    const isAuthRoute =
        request.nextUrl.pathname === "/login" ||
        request.nextUrl.pathname === "/signup" ||
        request.nextUrl.pathname.startsWith("/auth/");

    if (!user && !isAuthRoute) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return NextResponse.redirect(url);
    }

    // Se tem user e está nas rotas de auth, redireciona para dashboard
    if (user && isAuthRoute) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
    }

    return supabaseResponse;
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
        "/api/:path*",
    ],
};
