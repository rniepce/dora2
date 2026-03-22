import { describe, it, expect } from "vitest";
import { buildSystemPrompt, parseLLMResponse } from "../format-llm";

describe("buildSystemPrompt — sanitização de glossário", () => {
    it("inclui glossário seguro no prompt", () => {
        const prompt = buildSystemPrompt("Dr. João Silva, Dra. Maria Souza");
        expect(prompt).toContain("Dr. João Silva");
    });

    it("remove markdown headings do glossário", () => {
        const prompt = buildSystemPrompt("## Injeção de instrução\nDr. Legítimo");
        expect(prompt).not.toContain("## Injeção de instrução");
        expect(prompt).toContain("Dr. Legítimo");
    });

    it("remove separadores do glossário", () => {
        const prompt = buildSystemPrompt("Nome\n---\nOutro Nome");
        expect(prompt).not.toContain("---");
    });

    it("limita o glossário a 2000 caracteres", () => {
        const longGlossary = "a".repeat(3000);
        const prompt = buildSystemPrompt(longGlossary);
        // Verificar que o glossário injetado é truncado
        const idx = prompt.indexOf("Glossário de Referência");
        if (idx !== -1) {
            const glossarySection = prompt.slice(idx);
            expect(glossarySection.length).toBeLessThan(2500); // margem para texto ao redor
        }
    });

    it("omite seção de glossário se vazio", () => {
        const prompt = buildSystemPrompt("");
        expect(prompt).not.toContain("Glossário de Referência");
    });
});

describe("parseLLMResponse", () => {
    it("parseia array JSON direto", () => {
        const raw = JSON.stringify([{ id: "abc", speaker_label: "JUIZ(A)", text: "Texto" }]);
        const result = parseLLMResponse(raw);
        expect(result).toHaveLength(1);
        expect(result![0].speaker_label).toBe("JUIZ(A)");
    });

    it("parseia JSON dentro de markdown code block", () => {
        const raw = '```json\n[{"id":"x","speaker_label":"DEPOENTE","text":"sim"}]\n```';
        const result = parseLLMResponse(raw);
        expect(result).toHaveLength(1);
        expect(result![0].speaker_label).toBe("DEPOENTE");
    });

    it("extrai array do meio de texto", () => {
        const raw = 'Aqui está o resultado:\n[{"id":"y","speaker_label":"ADV. AUTOR","text":"ok"}]\nFim.';
        const result = parseLLMResponse(raw);
        expect(result).not.toBeNull();
    });

    it("retorna null para JSON inválido", () => {
        const result = parseLLMResponse("isso não é JSON");
        expect(result).toBeNull();
    });
});
