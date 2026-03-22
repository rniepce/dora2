import { describe, it, expect, afterEach } from "vitest";
import { requireEnv } from "../env";

describe("requireEnv", () => {
    const TEST_KEY = "__TEST_DORA2_ENV__";

    afterEach(() => {
        delete process.env[TEST_KEY];
    });

    it("retorna o valor quando a variável está definida", () => {
        process.env[TEST_KEY] = "valor-teste";
        expect(requireEnv(TEST_KEY)).toBe("valor-teste");
    });

    it("lança erro quando a variável está ausente", () => {
        delete process.env[TEST_KEY];
        expect(() => requireEnv(TEST_KEY)).toThrow(TEST_KEY);
    });

    it("lança erro quando a variável é uma string vazia", () => {
        process.env[TEST_KEY] = "";
        expect(() => requireEnv(TEST_KEY)).toThrow(TEST_KEY);
    });
});
