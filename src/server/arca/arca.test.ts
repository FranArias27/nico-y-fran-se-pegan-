import forge from "node-forge";
import { describe, expect, it } from "vitest";
import { calcularComprobante } from "@/domain/comprobante";
import { importesArca, tipoDocumento, urlQrComprobante } from "@/integrations/fiscal/arca-datos";
import { firmar } from "./wsaa";
import { xmlSolicitudCae } from "./wsfe";
import { parsearXml } from "./soap";

const LINEAS = [
  { cantidad: 2000, precioNeto: 10000, precioFinal: 12100, alicuotaIva: 2100 as const },
  { cantidad: 1000, precioNeto: 20000, precioFinal: 22100, alicuotaIva: 1050 as const },
  { cantidad: 1000, precioNeto: 5000, precioFinal: 5000, alicuotaIva: 0 as const },
];

describe("importes para ARCA", () => {
  it("Factura A y B: neto gravado + IVA + exento = total, con una alícuota por tasa", () => {
    for (const tipo of ["A", "B"] as const) {
      const { totales } = calcularComprobante(tipo, LINEAS, { tipo: "porcentaje", valor: 700 });
      const i = importesArca(tipo, totales);
      expect(i.neto + i.iva + i.exento).toBe(i.total);
      expect(i.alicuotas.map((a) => a.id).sort()).toEqual([4, 5]);
      expect(i.alicuotas.reduce((s, a) => s + a.base, 0)).toBe(i.neto);
      expect(i.alicuotas.reduce((s, a) => s + a.importe, 0)).toBe(i.iva);
      expect(i.exento).toBeGreaterThan(0);
    }
  });

  it("Factura C: todo el total como neto, sin IVA", () => {
    const { totales } = calcularComprobante("C", LINEAS);
    expect(importesArca("C", totales)).toEqual({ total: totales.total, neto: totales.total, exento: 0, iva: 0, alicuotas: [] });
  });

  it("identifica al receptor por CUIT, DNI o como consumidor final", () => {
    expect(tipoDocumento("30-71583492-4")).toEqual({ tipo: 80, numero: 30715834924 });
    expect(tipoDocumento("28123456")).toEqual({ tipo: 96, numero: 28123456 });
    expect(tipoDocumento("")).toEqual({ tipo: 99, numero: 0 });
  });

  it("arma el QR con el JSON que define ARCA", () => {
    const url = urlQrComprobante({
      fecha: "2026-10-22T12:00:00Z",
      cuit: "30715834924",
      puntoVenta: 3,
      codigoComprobante: 11,
      numero: 45,
      total: 123456,
      clienteDocumento: "",
      cae: "76123456789012",
    });
    const datos = JSON.parse(Buffer.from(url.split("?p=")[1], "base64").toString());
    expect(datos).toMatchObject({ ver: 1, fecha: "2026-10-22", ptoVta: 3, tipoCmp: 11, nroCmp: 45, importe: 1234.56, tipoDocRec: 99 });
  });
});

describe("pedido de CAE (WSFEv1)", () => {
  const { totales } = calcularComprobante("B", LINEAS);
  const xml = xmlSolicitudCae({
    puntoVenta: 2,
    codigoComprobante: 8,
    numero: 17,
    fecha: "20261022",
    documentoTipo: 99,
    documentoNumero: 0,
    condicionIvaReceptor: 5,
    importes: importesArca("B", totales),
    asociado: { codigoComprobante: 6, puntoVenta: 2, numero: 9, cuit: "30715834924", fecha: "20261020" },
  });
  const det = parsearXml(`<r xmlns:ar="x">${xml}</r>`) as {
    r: { FeCAEReq: { FeCabReq: Record<string, string>; FeDetReq: { FECAEDetRequest: Record<string, unknown> } } };
  };
  const d = det.r.FeCAEReq.FeDetReq.FECAEDetRequest;

  it("informa cabecera, importes en pesos y condición del receptor", () => {
    expect(det.r.FeCAEReq.FeCabReq).toEqual({ CantReg: "1", PtoVta: "2", CbteTipo: "8" });
    expect(d).toMatchObject({ Concepto: "1", DocTipo: "99", CbteDesde: "17", CbteHasta: "17", CbteFch: "20261022" });
    expect(d.ImpTotal).toBe((totales.total / 100).toFixed(2));
    expect(d.CondicionIVAReceptorId).toBe("5");
    expect(d.CbtesAsoc).toEqual({ CbteAsoc: { Tipo: "6", PtoVta: "2", Nro: "9", Cuit: "30715834924", CbteFch: "20261020" } });
  });

  it("respeta el orden del WSDL: los importes antes de la moneda y el IVA al final", () => {
    const orden = ["ImpTotal", "ImpNeto", "ImpIVA", "MonId", "CondicionIVAReceptorId", "CbtesAsoc", "Iva"].map((e) =>
      xml.indexOf(`<ar:${e}>`),
    );
    expect(orden.every((pos, i) => pos > 0 && (i === 0 || pos > orden[i - 1]))).toBe(true);
  });
});

describe("firma del pedido de acceso (WSAA)", () => {
  it("genera un CMS firmado que incluye el pedido y el certificado", () => {
    const claves = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = claves.publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date(2026, 0, 1);
    cert.validity.notAfter = new Date(2028, 0, 1);
    const nombre = [{ name: "commonName", value: "prueba" }];
    cert.setSubject(nombre);
    cert.setIssuer(nombre);
    cert.sign(claves.privateKey, forge.md.sha256.create());

    const cms = firmar(
      { certificado: forge.pki.certificateToPem(cert), clave: forge.pki.privateKeyToPem(claves.privateKey) },
      "<loginTicketRequest/>",
    );
    const mensaje = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.decode64(cms))) as forge.pkcs7.PkcsSignedData & {
      rawCapture: { content: forge.asn1.Asn1 };
    };
    expect(mensaje.certificates).toHaveLength(1);
    expect(forge.asn1.toDer(mensaje.rawCapture.content).getBytes()).toContain("<loginTicketRequest/>");
  });
});
