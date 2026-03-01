"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Scale, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase";

interface DashboardHeaderProps {
    userName: string;
}

export function DashboardHeader({ userName }: DashboardHeaderProps) {
    const router = useRouter();
    const supabase = createClient();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
    };

    return (
        <header className="sticky top-0 z-50 border-b border-border bg-white/80 backdrop-blur-xl" style={{ paddingTop: "env(safe-area-inset-top)" }}>
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 sm:px-6 lg:px-8">
                {/* Logo */}
                <Link href="/dashboard" className="flex items-center gap-2 sm:gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg gradient-primary shadow-md">
                        <Scale className="h-4 w-4 text-white" />
                    </div>
                    <span className="hidden text-lg font-bold tracking-tight text-foreground min-[400px]:inline">
                        Transcritor TJMG
                    </span>
                </Link>

                {/* Actions */}
                <div className="flex items-center gap-2 sm:gap-3">

                    <span className="max-w-[100px] truncate text-sm text-muted-foreground sm:max-w-none">{userName}</span>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleLogout}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <LogOut className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </header>
    );
}
