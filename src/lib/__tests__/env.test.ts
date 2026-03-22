import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { requireEnv, validateEnv } from "../env";

describe("requireEnv", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("retorna o valor se a variável existe", () => {
        process.env.TEST_VAR = "hello";
        expect(requireEnv("TEST_VAR")).toBe("hello");
    });

    it("lança erro se a variável não existe", () => {
        delete process.env.UNDEFINED_VAR;
        expect(() => requireEnv("UNDEFINED_VAR")).toThrow(
            "Variável de ambiente obrigatória não definida: UNDEFINED_VAR"
        );
    });
});

describe("validateEnv", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("não lança erro quando todas as variáveis obrigatórias estão definidas", () => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "key";
        process.env.AZURE_OPENAI_ENDPOINT = "https://x.openai.azure.com";
        process.env.AZURE_OPENAI_API_KEY = "key";
        expect(() => validateEnv()).not.toThrow();
    });

    it("lança erro listando as variáveis faltantes", () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        delete process.env.AZURE_OPENAI_ENDPOINT;
        expect(() => validateEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    });
});
