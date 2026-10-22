import { randomBytes } from "node:crypto";
import forge from "node-forge";
import { describe, expect, it } from "vitest";
import { cifrar, descifrar } from "../cifrado";
import { ErrorCertificado, generarClaveYPedido, validarCertificado } from "./credenciales";

const CUIT = "20123456786";
const AHORA = new Date(2026, 9, 22);

/** Hace de ARCA: firma el pedido y devuelve un certificado con los datos del pedido. */
function emitirCertificado(pedidoPem: string, opciones: { cuit?: string; vence?: Date } = {}): string {
  const pedido = forge.pki.certificationRequestFromPem(pedidoPem);
  const autoridad = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = pedido.publicKey!;
  cert.serialNumber = "0a";
  cert.validity.notBefore = new Date(2026, 0, 1);
  cert.validity.notAfter = opciones.vence ?? new Date(2028, 0, 1);
  cert.setSubject([
    { shortName: "CN", value: "facturacion" },
    { name: "serialNumber", value: `CUIT ${opciones.cuit ?? CUIT}` },
  ]);
  cert.setIssuer([{ shortName: "CN", value: "Computadores Test" }]);
  cert.sign(autoridad.privateKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}

describe("cifrado de claves", () => {
  const clave = randomBytes(32).toString("base64");

  it("descifra lo que cifró y cada cifrado es distinto", () => {
    const a = cifrar("secreto", clave);
    expect(descifrar(a, clave)).toBe("secreto");
    expect(cifrar("secreto", clave)).not.toBe(a);
  });

  it("falla con otra clave o si alguien modifica el dato", () => {
    const cifrado = cifrar("secreto", clave);
    expect(() => descifrar(cifrado, randomBytes(32).toString("base64"))).toThrow();
    const [iv, etiqueta, datos] = cifrado.split(".");
    const alterado = Buffer.from(datos, "base64");
    alterado[0] ^= 1;
    expect(() => descifrar([iv, etiqueta, alterado.toString("base64")].join("."), clave)).toThrow();
  });
});

describe("certificado de ARCA del comercio", () => {
  const { clave, pedido } = generarClaveYPedido({ cuit: CUIT, razonSocial: "Kiosco Mauro & Cía." });

  it("el pedido lleva la CUIT y está firmado con la clave generada", () => {
    const csr = forge.pki.certificationRequestFromPem(pedido);
    expect(csr.verify()).toBe(true);
    expect(csr.subject.getField({ name: "serialNumber" }).value).toBe(`CUIT ${CUIT}`);
    expect(csr.subject.getField("O").value).toBe("Kiosco Mauro  Cia.");
  });

  it("acepta el certificado emitido para ese pedido", () => {
    expect(validarCertificado(emitirCertificado(pedido), clave, CUIT, AHORA)).toBe(new Date(2028, 0, 1).toISOString());
  });

  it("rechaza un certificado de otro pedido, de otra CUIT o vencido", () => {
    const otro = generarClaveYPedido({ cuit: CUIT, razonSocial: "Otro" });
    expect(() => validarCertificado(emitirCertificado(otro.pedido), clave, CUIT, AHORA)).toThrow(ErrorCertificado);
    expect(() => validarCertificado(emitirCertificado(pedido, { cuit: "30715834924" }), clave, CUIT, AHORA)).toThrow(/otra CUIT/);
    expect(() => validarCertificado(emitirCertificado(pedido, { vence: new Date(2026, 5, 1) }), clave, CUIT, AHORA)).toThrow(/vigente/);
    expect(() => validarCertificado("cualquier cosa", clave, CUIT, AHORA)).toThrow(/no es un certificado/);
  });
});
