"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";

export async function loginAction(formData: FormData) {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!email || !password) {
        return { error: "Email e senha são obrigatórios." };
    }

    const supabase = await createServerClient();
    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        return { error: error.message };
    }

    redirect("/dashboard");
}

export async function signupAction(formData: FormData) {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (!email || !password || !name) {
        return { error: "Todos os campos são obrigatórios." };
    }

    if (password !== confirmPassword) {
        return { error: "As senhas não coincidem." };
    }

    if (password.length < 6) {
        return { error: "A senha deve ter pelo menos 6 caracteres." };
    }

    const supabase = await createServerClient();
    const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: name,
            },
        },
    });

    if (error) {
        return { error: error.message };
    }

    redirect("/dashboard");
}

export async function logoutAction() {
    const supabase = await createServerClient();
    await supabase.auth.signOut();
    redirect("/login");
}
