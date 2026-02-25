"use client";

import { useRouter } from "next/navigation";
import { Scale, LogOut, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/actions/auth";

interface DashboardHeaderProps {
    userName: string;
}

export function DashboardHeader({ userName }: DashboardHeaderProps) {
    const router = useRouter();

    return (
        <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
                {/* Logo */}
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-primary shadow-md shadow-primary/20">
                        <Scale className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <span className="text-xl font-bold text-gradient">JusScribe</span>
                </div>

                {/* Right side */}
                <div className="flex items-center gap-3">
                    <Button
                        onClick={() => router.push("/dashboard/new")}
                        className="gradient-primary font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/30"
                        size="sm"
                    >
                        <Plus className="mr-1.5 h-4 w-4" />
                        Nova Degravação
                    </Button>

                    <div className="hidden h-8 w-px bg-border/50 sm:block" />

                    <div className="hidden items-center gap-2 sm:flex">
                        <span className="text-sm text-muted-foreground">{userName}</span>
                    </div>

                    <form action={logoutAction}>
                        <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <LogOut className="h-4 w-4" />
                        </Button>
                    </form>
                </div>
            </div>
        </header>
    );
}
