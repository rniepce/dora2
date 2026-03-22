// Validação centralizada de variáveis de ambiente

/**
 * Retorna o valor da variável de ambiente ou lança um erro descritivo se ausente.
 */
export function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Variável de ambiente obrigatória não configurada: ${name}`);
    }
    return value;
}

/**
 * Objeto tipado com todas as variáveis de ambiente usadas pelo servidor.
 * Acesse via getters para validar on-demand (não na inicialização do módulo).
 */
export const env = {
    // Públicas (expostas ao browser)
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",

    // Privadas — validam na primeira chamada
    get AZURE_OPENAI_ENDPOINT() { return requireEnv("AZURE_OPENAI_ENDPOINT"); },
    get AZURE_OPENAI_API_KEY() { return requireEnv("AZURE_OPENAI_API_KEY"); },
    get DEEPGRAM_API_KEY() { return requireEnv("DEEPGRAM_API_KEY"); },
    get GOOGLE_CLOUD_API_KEY() { return requireEnv("GOOGLE_CLOUD_API_KEY"); },
    get GOOGLE_CLOUD_PROJECT_ID() { return requireEnv("GOOGLE_CLOUD_PROJECT_ID"); },
};
