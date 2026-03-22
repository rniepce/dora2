import { describe, it, expect } from "vitest";
import { buildSystemPrompt, parseLLMResponse } from "../format-llm";

describe("buildSystemPrompt", () => {
    it("inclui o glossário quando fornecido", () => {
        const prompt = buildSystemPrompt("João Silva, Maria Santos");
        expect(prompt).toContain("Glossário de Referência");
        expect(prompt).toContain("João Silva");
        expect(prompt).toContain("Maria Santos");
    });

    it("omite a seção de glossário quando vazio", () => {
        const prompt = buildSystemPrompt("");
        expect(prompt).not.toContain("Glossário de Referência");
    });

    it("contém instrução sobre identificação de locutores", () => {
        const prompt = buildSystemPrompt("");
        expect(prompt).toContain("JUIZ(A)");
        expect(prompt).toContain("DEPOENTE");
    });

    it("não altera start_times mesmo com glossário com caracteres especiais", () => {
        const prompt = buildSystemPrompt("Dr. José (advogado)\nDr. Ana");
        expect(prompt).toContain("start_times");
        expect(prompt).toContain("Dr. José");
    });
});

describe("parseLLMResponse", () => {
    it("parseia array JSON direto", () => {
        const input = JSON.stringify([
            { id: "abc", speaker_label: "JUIZ(A)", text: "Texto corrigido" },
        ]);
        const result = parseLLMResponse(input);
        expect(result).toHaveLength(1);
        expect(result![0].speaker_label).toBe("JUIZ(A)");
    });

    it("parseia JSON dentro de markdown code block", () => {
        const input = "```json\n[{\"id\":\"x\",\"speaker_label\":\"ADV. AUTOR\",\"text\":\"Ok\"}]\n```";
        const result = parseLLMResponse(input);
        expect(result).toHaveLength(1);
        expect(result![0].id).toBe("x");
    });

    it("retorna null para resposta malformada", () => {
        const result = parseLLMResponse("isso não é JSON");
        expect(result).toBeNull();
    });

    it("retorna null para resposta vazia", () => {
        const result = parseLLMResponse("");
        expect(result).toBeNull();
    });
});
