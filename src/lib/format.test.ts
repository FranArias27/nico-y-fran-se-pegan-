import { describe, expect, it } from "vitest";
import {
  formatCuit,
  formatDate,
  formatMoney,
  formatPercent,
  formatQty,
  parseMoney,
  parseQty,
} from "./format";

describe("formatMoney", () => {
  it("formatea con separador de miles y coma decimal", () => {
    expect(formatMoney(123456)).toBe("$ 1.234,56");
    expect(formatMoney(0)).toBe("$ 0,00");
    expect(formatMoney(5)).toBe("$ 0,05");
    expect(formatMoney(123456789)).toBe("$ 1.234.567,89");
  });

  it("formatea negativos", () => {
    expect(formatMoney(-150000)).toBe("-$ 1.500,00");
  });
});

describe("formatQty", () => {
  it("muestra enteros sin decimales y decimales con coma", () => {
    expect(formatQty(2000)).toBe("2");
    expect(formatQty(1500)).toBe("1,5");
    expect(formatQty(250)).toBe("0,25");
    expect(formatQty(-3000)).toBe("-3");
    expect(formatQty(1234000)).toBe("1.234");
  });
});

describe("formatPercent", () => {
  it("usa coma decimal", () => {
    expect(formatPercent(21)).toBe("21 %");
    expect(formatPercent(10.5)).toBe("10,5 %");
  });
});

describe("formatDate", () => {
  it("devuelve dd/mm/aaaa", () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe("05/01/2026");
  });
});

describe("formatCuit", () => {
  it("agrega guiones", () => {
    expect(formatCuit("30712345678")).toBe("30-71234567-8");
  });
});

describe("parseMoney", () => {
  it("entiende formato local y formato con punto", () => {
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("1234.5")).toBe(123450);
    expect(parseMoney("$ 100")).toBe(10000);
    expect(parseMoney("1.234")).toBe(123400);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
});

describe("parseQty", () => {
  it("convierte a milésimas", () => {
    expect(parseQty("1,5")).toBe(1500);
    expect(parseQty("3")).toBe(3000);
    expect(parseQty("x")).toBeNull();
  });
});
