"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, LogOut, User } from "lucide-react";
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
        <header className="sticky top-0 z-50 border-b border-border bg-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
            <div className="flex h-14 items-center justify-end px-3 sm:px-6 lg:px-8 w-full">
                {/* Actions */}
                <div className="flex items-center gap-4">
                    <button className="relative text-muted-foreground hover:text-foreground">
                        <Bell className="h-5 w-5" />
                        <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-600 border border-white"></span>
                    </button>

                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                            <User className="h-4 w-4 text-gray-600" />
                        </div>
                        <span className="hidden leading-tight text-sm text-foreground sm:block">
                            {userName}
                        </span>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleLogout}
                            className="ml-2 text-muted-foreground hover:text-foreground h-8 w-8 p-0"
                            title="Sair"
                        >
                            <LogOut className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </header>
    );
}
