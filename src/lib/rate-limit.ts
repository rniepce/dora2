/**
 * Rate limiter simples em memória para API routes.
 * Em produção com múltiplas instâncias, substituir por Redis.
 */

const store = new Map<string, { count: number; resetAt: number }>();

// Limpar entradas expiradas periodicamente (a cada 5 minutos)
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (now > entry.resetAt) {
            store.delete(key);
        }
    }
}, 5 * 60 * 1000);

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
}

/**
 * Verifica se a requisição está dentro do limite.
 * @param key - Identificador único (ex: userId + endpoint)
 * @param maxRequests - Máximo de requisições no período
 * @param windowMs - Janela de tempo em milissegundos
 */
export function checkRateLimit(
    key: string,
    maxRequests: number,
    windowMs: number
): RateLimitResult {
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
    }

    entry.count++;

    if (entry.count > maxRequests) {
        return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}
