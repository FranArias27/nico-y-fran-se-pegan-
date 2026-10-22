import { describe, expect, it } from "vitest";
import { cuitValido, digitoVerificadorCuit, digitoVerificadorEan13 } from "./identificadores";

describe("CUIT", () => {
  it("calcula el dígito verificador", () => {
    expect(digitoVerificadorCuit("2012345678")).toBe(6);
    expect(cuitValido("20-12345678-6")).toBe(true);
    expect(cuitValido("20-12345678-5")).toBe(false);
    expect(cuitValido("123")).toBe(false);
  });
});

describe("EAN-13", () => {
  it("calcula el dígito verificador", () => {
    expect(digitoVerificadorEan13("779123456789")).toBe(8);
    expect(digitoVerificadorEan13("400638133393")).toBe(1);
  });
});
