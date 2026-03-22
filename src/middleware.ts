import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// ─── Rate Limiting (in-memory sliding window) ─────────────────────────────────
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minuto
const RATE_LIMIT_MAX = 60; // máximo 60 requisições por minuto por IP

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const timestamps = (rateLimitMap.get(ip) ?? []).filter(
        (ts) => now - ts < RATE_LIMIT_WINDOW_MS
    );
    timestamps.push(now);
    rateLimitMap.set(ip, timestamps);
    return timestamps.length > RATE_LIMIT_MAX;
}

export async function middleware(request: NextRequest) {
    // Rate limiting para rotas de API
    if (request.nextUrl.pathname.startsWith("/api/")) {
        const ip =
            request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
            request.headers.get("x-real-ip") ??
            "unknown";
        if (isRateLimited(ip)) {
            return new NextResponse(JSON.stringify({ error: "Too many requests" }), {
                status: 429,
                headers: { "Content-Type": "application/json", "Retry-After": "60" },
            });
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
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
