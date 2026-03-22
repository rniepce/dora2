// Logger wrapper que respeita NODE_ENV: silencia debug em produção

const isProd = process.env.NODE_ENV === "production";

export const logger = {
    debug: (...args: unknown[]) => {
        if (!isProd) console.log("[DEBUG]", ...args);
    },
    info: (...args: unknown[]) => {
        console.log("[INFO]", ...args);
    },
    warn: (...args: unknown[]) => {
        console.warn("[WARN]", ...args);
    },
    error: (...args: unknown[]) => {
        console.error("[ERROR]", ...args);
    },
};
