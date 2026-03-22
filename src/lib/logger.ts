/**
 * Logger simples que respeita NODE_ENV.
 * Em produção, suprime logs de debug/info desnecessários.
 */

const isDev = process.env.NODE_ENV !== "production";

export const logger = {
    debug: (...args: unknown[]) => {
        if (isDev) console.log("[DEBUG]", ...args);
    },
    info: (...args: unknown[]) => {
        if (isDev) console.log("[INFO]", ...args);
    },
    warn: (...args: unknown[]) => {
        console.warn("[WARN]", ...args);
    },
    error: (...args: unknown[]) => {
        console.error("[ERROR]", ...args);
    },
};
