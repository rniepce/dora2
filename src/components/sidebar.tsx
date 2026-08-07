"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { FilePlus2, Search, PanelLeft, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { TjmgMark } from "@/components/tjmg-logo";
import { createClient } from "@/lib/supabase";

export interface SidebarRecent {
    id: string;
    title: string;
    completed: boolean;
}

interface SidebarProps {
    userName: string;
    userEmail: string;
    recents: SidebarRecent[];
}

export function Sidebar({ userName, userEmail, recents }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [collapsed, setCollapsed] = useState(false);

    const handleLogout = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
    };

    const initial = userName.trim().charAt(0).toUpperCase() || "U";

    const actions = [
        { name: "Nova degravação", href: "/dashboard/new", icon: FilePlus2 },
        { name: "Buscar degravações", href: "/dashboard", icon: Search },
    ];

    return (
        <aside
            className={cn(
                "hidden shrink-0 flex-col bg-sidebar transition-[width] duration-200 lg:flex",
                collapsed ? "w-[72px]" : "w-[276px]"
            )}
        >
            {/* ─── Marca + recolher ──────────────────────────────────────── */}
            <div className="flex h-16 items-center justify-between px-5">
                <Link href="/dashboard" className="flex items-center gap-2">
                    <TjmgMark className="h-7 w-7 text-primary" />
                    {!collapsed && (
                        <span className="text-[19px] font-extrabold leading-none tracking-tight text-foreground">
                            TJMG
                        </span>
                    )}
                </Link>

                {!collapsed && (
                    <button
                        type="button"
                        onClick={() => setCollapsed(true)}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                        title="Recolher menu"
                        aria-label="Recolher menu"
                    >
                        <PanelLeft className="h-5 w-5" />
                    </button>
                )}
            </div>

            {collapsed && (
                <button
                    type="button"
                    onClick={() => setCollapsed(false)}
                    className="mx-auto mb-2 text-muted-foreground transition-colors hover:text-foreground"
                    title="Expandir menu"
                    aria-label="Expandir menu"
                >
                    <PanelLeft className="h-5 w-5" />
                </button>
            )}

            {/* ─── Ações principais ──────────────────────────────────────── */}
            <nav className="mt-3 space-y-1 px-3">
                {actions.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;

                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            title={collapsed ? item.name : undefined}
                            className={cn(
                                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors",
                                collapsed && "justify-center px-0",
                                active
                                    ? "font-semibold text-foreground"
                                    : "font-medium text-foreground/85 hover:bg-sidebar-accent"
                            )}
                        >
                            <Icon className="h-5 w-5 shrink-0 stroke-[1.6] text-foreground/70" />
                            {!collapsed && item.name}
                        </Link>
                    );
                })}
            </nav>

            {/* ─── Recentes ──────────────────────────────────────────────── */}
            {!collapsed && (
                <div className="mt-7 flex min-h-0 flex-1 flex-col px-3">
                    <p className="px-3 pb-2 text-[13px] font-medium text-muted-foreground">
                        Degravações Recentes
                    </p>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {recents.length === 0 ? (
                            <p className="px-3 py-1 text-[14px] text-muted-foreground/70">
                                Nenhuma ainda
                            </p>
                        ) : (
                            recents.map((item) => {
                                const active = pathname === `/editor/${item.id}`;
                                const className = cn(
                                    "block truncate rounded-lg px-3 py-2 text-[15px] transition-colors",
                                    active
                                        ? "bg-sidebar-accent font-medium text-foreground"
                                        : "text-foreground/85 hover:bg-sidebar-accent"
                                );

                                return item.completed ? (
                                    <Link
                                        key={item.id}
                                        href={`/editor/${item.id}`}
                                        title={item.title}
                                        className={className}
                                    >
                                        {item.title}
                                    </Link>
                                ) : (
                                    <span
                                        key={item.id}
                                        title={`${item.title} — em processamento`}
                                        className={cn(className, "cursor-default text-muted-foreground/70")}
                                    >
                                        {item.title}
                                    </span>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {collapsed && <div className="flex-1" />}

            {/* ─── Usuário ───────────────────────────────────────────────── */}
            <div
                className={cn(
                    "flex items-center gap-3 px-5 py-5",
                    collapsed && "justify-center px-0"
                )}
            >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-[13px] font-semibold text-background">
                    {initial}
                </div>

                {!collapsed && (
                    <>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
                                {userName}
                            </p>
                            <p className="truncate text-[13px] leading-tight text-muted-foreground">
                                {userEmail}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={handleLogout}
                            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                            title="Sair"
                            aria-label="Sair"
                        >
                            <LogOut className="h-[18px] w-[18px] stroke-[1.6]" />
                        </button>
                    </>
                )}
            </div>
        </aside>
    );
}
