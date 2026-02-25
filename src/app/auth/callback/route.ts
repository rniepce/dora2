import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

/**
 * Auth callback para trocar o code do Supabase pelo token de sessão.
 * Necessário para OAuth flows e confirmação de email.
 */
export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    const next = searchParams.get("next") ?? "/dashboard";

    if (code) {
        const supabase = await createServerClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            return NextResponse.redirect(`${origin}${next}`);
        }
    }

    // Se algo falhar, redireciona para login com erro
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
