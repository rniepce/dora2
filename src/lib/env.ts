/**
 * Validação de variáveis de ambiente na inicialização.
 * Importe este módulo no topo de qualquer route server-side que dependa de env vars externas.
 */

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Variável de ambiente obrigatória não definida: ${name}`);
    }
    return value;
}

function validateEnv() {
    const required = [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_API_KEY",
    ] as const;

    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(
            `Variáveis de ambiente obrigatórias não definidas: ${missing.join(", ")}`
        );
    }
}

export const env = {
    SUPABASE_URL: () => requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    SUPABASE_ANON_KEY: () => requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    AZURE_OPENAI_ENDPOINT: () => requireEnv("AZURE_OPENAI_ENDPOINT"),
    AZURE_OPENAI_API_KEY: () => requireEnv("AZURE_OPENAI_API_KEY"),
    DEEPGRAM_API_KEY: () => requireEnv("DEEPGRAM_API_KEY"),
    GOOGLE_CLOUD_API_KEY: () => requireEnv("GOOGLE_CLOUD_API_KEY"),
    GOOGLE_CLOUD_PROJECT_ID: () => requireEnv("GOOGLE_CLOUD_PROJECT_ID"),
};

export { requireEnv, validateEnv };
