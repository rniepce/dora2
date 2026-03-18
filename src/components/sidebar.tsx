"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Scale, LayoutDashboard, FileText, Clock, BarChart2, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
    { name: "Dashboard", href: "/dashboard", exact: true, icon: LayoutDashboard },
    { name: "Degravações", href: "/dashboard", exact: false, activePaths: ["/dashboard/new", "/editor"], icon: FileText },
    { name: "Em Progresso", href: "#", icon: Clock },
    { name: "Relatórios", href: "#", icon: BarChart2 },
    { name: "Configurações", href: "#", icon: Settings },
];

export function Sidebar() {
    const pathname = usePathname();

    const isActive = (href: string, exact: boolean | undefined, activePaths: string[] | undefined) => {
        if (exact) {
            return pathname === href;
        }
        if (activePaths && activePaths.some(p => pathname.startsWith(p))) {
            return true;
        }
        // Basic active logic when it's not the exact dashboard root
        if (href !== "/dashboard" && pathname.startsWith(href)) {
            return true;
        }
        // Force Degravações active on the root layout temporarily or based on logic if dashboard is Degravações 
        // Given the mockup, let's treat dashboard as root, and Degravações is the actual main list view.
        if (href === "/dashboard" && !exact) {
            if (pathname === "/dashboard" || pathname.startsWith("/dashboard/new") || pathname.startsWith("/editor")) {
                return true;
            }
        }
        return false;
    };

    return (
        <aside className="hidden w-64 flex-col border-r border-border bg-sidebar/50 backdrop-blur-sm lg:flex">
            {/* Logo */}
            <div className="flex h-14 items-center gap-2 border-b border-border px-6">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg gradient-primary shadow-sm">
                    <Scale className="h-4 w-4 text-white" />
                </div>
                <div className="flex flex-col">
                    <span className="text-xs font-bold leading-none tracking-tight text-primary">
                        TJMG
                    </span>
                    <span className="text-[10px] font-medium leading-none text-muted-foreground">
                        Transcritor TJMG
                    </span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 p-4">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href, item.exact, item.activePaths);

                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                                active
                                    ? "bg-red-50 text-primary shadow-sm"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>
        </aside>
    );
}
