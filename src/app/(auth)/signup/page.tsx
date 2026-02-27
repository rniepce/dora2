"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Scale } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupAction } from "@/lib/actions/auth";

export default function SignupPage() {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(e.currentTarget);
        const result = await signupAction(formData);

        if (result?.error) {
            toast.error("Erro ao criar conta", { description: result.error });
            setIsLoading(false);
        } else {
            toast.success("Conta criada!", {
                description: "Verifique seu email para confirmar o cadastro.",
            });
            router.push("/dashboard");
        }
    }

    return (
        <div className="gradient-bg flex min-h-screen items-center justify-center p-4">
            {/* Decorative blobs */}
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -top-40 -left-40 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
                <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-chart-2/10 blur-3xl" />
            </div>

            <Card className="glass-card w-full max-w-md border-border/50 shadow-2xl">
                <CardHeader className="space-y-4 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl gradient-primary shadow-lg shadow-primary/25">
                        <Scale className="h-7 w-7 text-primary-foreground" />
                    </div>
                    <div>
                        <CardTitle className="text-2xl font-bold">
                            Criar conta no <span className="text-gradient">Transcritor TJMG</span>
                        </CardTitle>
                        <CardDescription className="mt-1 text-muted-foreground">
                            Comece a degravação inteligente de audiências
                        </CardDescription>
                    </div>
                </CardHeader>

                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nome completo</Label>
                            <Input
                                id="name"
                                name="name"
                                type="text"
                                placeholder="Dr. João Silva"
                                required
                                disabled={isLoading}
                                className="bg-background/50"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                placeholder="seu@email.com"
                                required
                                disabled={isLoading}
                                className="bg-background/50"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Senha</Label>
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                placeholder="Mínimo 6 caracteres"
                                minLength={6}
                                required
                                disabled={isLoading}
                                className="bg-background/50"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirmar senha</Label>
                            <Input
                                id="confirmPassword"
                                name="confirmPassword"
                                type="password"
                                placeholder="Repita sua senha"
                                minLength={6}
                                required
                                disabled={isLoading}
                                className="bg-background/50"
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full gradient-primary font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Criando conta...
                                </>
                            ) : (
                                "Criar conta"
                            )}
                        </Button>
                    </form>

                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        Já tem conta?{" "}
                        <Link
                            href="/login"
                            className="font-medium text-primary underline-offset-4 transition-colors hover:underline"
                        >
                            Entrar
                        </Link>
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
