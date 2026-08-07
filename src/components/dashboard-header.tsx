import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { TjmgMark } from "@/components/tjmg-logo";

/**
 * Barra superior da área principal — apenas o nome do sistema, alinhado à
 * esquerda, sem cromo. No mobile (sem barra lateral) exibe a marca e o
 * atalho de nova degravação.
 */
export function DashboardHeader() {
    return (
        <header
            className="flex h-16 shrink-0 items-center justify-between gap-3 px-5 sm:px-8"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
            <div className="flex items-center gap-2">
                <TjmgMark className="h-6 w-6 text-primary lg:hidden" />
                <Link
                    href="/dashboard"
                    className="text-[19px] font-semibold tracking-tight text-foreground"
                >
                    Transcritor TJMG
                </Link>
            </div>

            <Link
                href="/dashboard/new"
                className="text-muted-foreground transition-colors hover:text-foreground lg:hidden"
                aria-label="Nova degravação"
            >
                <FilePlus2 className="h-5 w-5 stroke-[1.6]" />
            </Link>
        </header>
    );
}
