import { describe, it, expect } from "vitest";
import { getSpeakerColorHex, getSpeakerColorRgb } from "../speaker-colors";

describe("getSpeakerColorHex", () => {
    it("retorna cor correta para JUIZ(A)", () => {
        expect(getSpeakerColorHex("JUIZ(A)")).toBe("B45309");
    });

    it("retorna cor correta para ADV. AUTOR", () => {
        expect(getSpeakerColorHex("ADV. AUTOR")).toBe("1D4ED8");
    });

    it("retorna cor padrão para locutor desconhecido", () => {
        expect(getSpeakerColorHex("DESCONHECIDO")).toBe("991B1B");
    });

    it("retorna cor padrão para string vazia", () => {
        expect(getSpeakerColorHex("")).toBe("991B1B");
    });
});

describe("getSpeakerColorRgb", () => {
    it("retorna RGB correto para JUIZ(A)", () => {
        expect(getSpeakerColorRgb("JUIZ(A)")).toEqual([180, 83, 9]);
    });

    it("retorna RGB correto para DEPOENTE", () => {
        expect(getSpeakerColorRgb("DEPOENTE")).toEqual([124, 58, 237]);
    });

    it("retorna RGB padrão para locutor desconhecido", () => {
        expect(getSpeakerColorRgb("UNKNOWN")).toEqual([153, 27, 27]);
    });
});
