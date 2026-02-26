"use client";

import Link from "next/link";
import { Scale, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardHeaderProps {
    userName: string;
}

export function DashboardHeader({ userName }: DashboardHeaderProps) {
    return (
        <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                {/* Logo */}
                <Link href="/dashboard" className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary shadow-lg shadow-primary/25">
                        <Scale className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <span className="text-lg font-bold tracking-tight text-foreground">
                        JusScribe
                    </span>
                </Link>

                {/* Actions */}
                <div className="flex items-center gap-3">
                    <Link href="/dashboard/new">
                        <Button
                            size="sm"
                            className="gradient-primary font-semibold text-primary-foreground shadow-lg shadow-primary/25"
                        >
                            <Plus className="mr-1.5 h-4 w-4" />
                            Nova Degravação
                        </Button>
                    </Link>

                    <span className="text-sm text-muted-foreground">
                        {userName}
                    </span>
                </div>
            </div>
        </header>
    );
}
