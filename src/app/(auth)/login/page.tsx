"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TjmgMark } from "@/components/tjmg-logo";
import { loginAction } from "@/lib/actions/auth";

export default function LoginPage() {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(e.currentTarget);
        const result = await loginAction(formData);

        if (result?.error) {
            toast.error("Erro ao entrar", { description: result.error });
            setIsLoading(false);
        } else {
            router.push("/dashboard");
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="w-full max-w-[420px] rounded-3xl border border-border bg-card px-7 py-10 sm:px-10">
                <div className="flex flex-col items-center text-center">
                    <TjmgMark className="h-9 w-9 text-primary" />
                    <h1 className="display-title mt-5 text-[30px] text-foreground">
                        Transcritor TJMG
                    </h1>
                    <p className="mt-2 text-[15px] text-muted-foreground">
                        Degravação inteligente de audiências
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="mt-9 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email" className="text-[13px] font-medium text-muted-foreground">
                            Email
                        </Label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="seu@email.com"
                            required
                            disabled={isLoading}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password" className="text-[13px] font-medium text-muted-foreground">
                            Senha
                        </Label>
                        <Input
                            id="password"
                            name="password"
                            type="password"
                            placeholder="••••••••"
                            required
                            disabled={isLoading}
                        />
                    </div>

                    <Button type="submit" className="h-11 w-full" disabled={isLoading}>
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Entrando...
                            </>
                        ) : (
                            "Entrar"
                        )}
                    </Button>
                </form>

                <p className="mt-7 text-center text-sm text-muted-foreground">
                    Não tem conta?{" "}
                    <Link
                        href="/signup"
                        className="font-semibold text-foreground underline-offset-4 transition-colors hover:underline"
                    >
                        Criar conta
                    </Link>
                </p>
            </div>
        </div>
    );
}
