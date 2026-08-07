import { cn } from "@/lib/utils";

/**
 * Marca TJMG — triângulo (referência ao triângulo da bandeira de Minas).
 *
 * NOTA: aproximação geométrica da marca. Para uso oficial, substitua o SVG
 * abaixo pelo arquivo vetorial fornecido pela Assessoria de Comunicação.
 */
export function TjmgMark({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 40 36"
            fill="none"
            aria-hidden="true"
            className={cn("h-7 w-7 shrink-0", className)}
        >
            <path
                d="M20 3.5 36.5 32.5H3.5L20 3.5Z"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinejoin="round"
            />
            <path
                d="M20 14 27.5 27H12.5L20 14Z"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinejoin="round"
            />
        </svg>
    );
}

interface TjmgLogoProps {
    /** Texto secundário abaixo do wordmark (ex.: nome do sistema). */
    subtitle?: string;
    className?: string;
}

/** Marca + wordmark "TJMG", como no cabeçalho do Assistente TJMG. */
export function TjmgLogo({ subtitle, className }: TjmgLogoProps) {
    return (
        <div className={cn("flex items-center gap-2", className)}>
            <TjmgMark className="text-primary" />
            <div className="flex flex-col">
                <span className="text-[19px] font-extrabold leading-none tracking-tight text-foreground">
                    TJMG
                </span>
                {subtitle && (
                    <span className="mt-1 text-[11px] font-medium leading-none text-muted-foreground">
                        {subtitle}
                    </span>
                )}
            </div>
        </div>
    );
}
