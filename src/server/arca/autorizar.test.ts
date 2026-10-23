import { beforeEach, describe, expect, it, vi } from "vitest";
import { crearArcaServidor, type IntentoFiscal, type PersistenciaFiscal } from "./autorizar";
import { ErrorArca, SIN_RESPUESTA } from "./soap";
import { consultarComprobante, solicitarCae, ultimoAutorizado } from "./wsfe";
import { calcularComprobante } from "@/domain/comprobante";
import type { SolicitudAutorizacion } from "@/integrations/fiscal/fiscal-provider";

vi.mock("./credenciales", () => ({
  credencialActiva: async () => ({ cuit: "30715834924", entorno: "homologacion" }),
  almacenTicket: () => ({}),
}));
vi.mock("./wsaa", () => ({ obtenerTicket: async () => ({ token: "test", sign: "test" }) }));
vi.mock("./wsfe", () => ({ consultarComprobante: vi.fn(), solicitarCae: vi.fn(), ultimoAutorizado: vi.fn() }));

const solicitud: SolicitudAutorizacion = {
  comercio: {
    razonSocial: "Prueba",
    nombreFantasia: "Prueba",
    cuit: "30715834924",
    condicionIva: "RI",
    puntoVenta: 1,
    ingresosBrutos: "",
    inicioActividades: "2026-01-01",
    domicilio: "",
    localidad: "",
    telefono: "",
    email: "",
  },
  clase: "factura",
  tipo: "B",
  fecha: "2026-10-22T14:00:00Z",
  clienteCondicionIva: "CF",
  clienteDocumento: "",
  totales: calcularComprobante("B", [{ cantidad: 1000, precioNeto: 10000, precioFinal: 12100, alicuotaIva: 2100 }])
    .totales,
};
const emitido = {
  cae: "76123456789012",
  vencimiento: "20261101",
  total: "121.00",
  documentoNumero: "0",
  documentoTipo: "99",
  fecha: "20261022",
  neto: "100.00",
  iva: "21.00",
  exento: "0.00",
};
function persistencia(): PersistenciaFiscal {
  const p: PersistenciaFiscal = {
    guardar: vi.fn(async (i: IntentoFiscal) => {
      p.intento = i;
    }),
  };
  return p;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(ultimoAutorizado).mockResolvedValue(9);
  vi.mocked(solicitarCae).mockResolvedValue(emitido);
  vi.mocked(consultarComprobante).mockResolvedValue(undefined);
});

describe("recuperación de autorizaciones ARCA", () => {
  it("persiste número y pedido antes de enviarlo", async () => {
    const p = persistencia();
    vi.mocked(solicitarCae).mockImplementation(async () => {
      expect(p.intento?.detalle.numero).toBe(10);
      expect(p.intento?.detalle.importes.total).toBe(12100);
      return emitido;
    });
    expect((await crearArcaServidor("prueba", p).autorizar(solicitud)).numero).toBe(10);
  });
  it("recupera un CAE cuando se pierde la respuesta sin solicitar otro", async () => {
    vi.mocked(solicitarCae).mockRejectedValueOnce(new ErrorArca("timeout", [SIN_RESPUESTA]));
    vi.mocked(consultarComprobante).mockResolvedValueOnce(emitido);
    expect((await crearArcaServidor("prueba", persistencia()).autorizar(solicitud)).cae).toBe(emitido.cae);
    expect(solicitarCae).toHaveBeenCalledTimes(1);
  });
  it("un reinicio después del envío consulta el número persistido", async () => {
    const p = persistencia();
    await crearArcaServidor("prueba", p).autorizar(solicitud);
    vi.mocked(solicitarCae).mockClear();
    vi.mocked(ultimoAutorizado).mockClear();
    vi.mocked(consultarComprobante).mockResolvedValue(emitido);
    await crearArcaServidor("prueba", p).autorizar(solicitud);
    expect(solicitarCae).not.toHaveBeenCalled();
    expect(ultimoAutorizado).not.toHaveBeenCalled();
  });
  it("si no existe el número, reenvía ese mismo número", async () => {
    const p = persistencia();
    await crearArcaServidor("prueba", p).autorizar(solicitud);
    vi.mocked(solicitarCae).mockClear();
    await crearArcaServidor("prueba", p).autorizar(solicitud);
    expect(vi.mocked(solicitarCae).mock.calls[0][3].numero).toBe(10);
  });
  it("no confunde comprobantes de mismo total con otra fecha o IVA", async () => {
    const p = persistencia();
    await crearArcaServidor("prueba", p).autorizar(solicitud);
    vi.mocked(consultarComprobante).mockResolvedValue({ ...emitido, iva: "0.00" });
    await expect(crearArcaServidor("prueba", p).autorizar(solicitud)).rejects.toThrow("otro comprobante");
  });
  it("una consulta caída no se interpreta como comprobante inexistente", async () => {
    const p = persistencia();
    await crearArcaServidor("prueba", p).autorizar(solicitud);
    vi.mocked(solicitarCae).mockClear();
    vi.mocked(consultarComprobante).mockRejectedValue(new ErrorArca("sin conexión", [SIN_RESPUESTA]));
    await expect(crearArcaServidor("prueba", p).autorizar(solicitud)).rejects.toThrow("sin conexión");
    expect(solicitarCae).not.toHaveBeenCalled();
  });
  it("reintenta una colisión de numeración y recupera el timeout del segundo envío", async () => {
    vi.mocked(ultimoAutorizado).mockResolvedValueOnce(9).mockResolvedValueOnce(10);
    vi.mocked(solicitarCae)
      .mockRejectedValueOnce(new ErrorArca("colisión", ["10016"]))
      .mockRejectedValueOnce(new ErrorArca("timeout", [SIN_RESPUESTA]));
    vi.mocked(consultarComprobante).mockResolvedValueOnce(undefined).mockResolvedValueOnce(emitido);
    expect((await crearArcaServidor("prueba", persistencia()).autorizar(solicitud)).numero).toBe(11);
  });
  it("una colisión posterior a un timeout recupera el reservado sin avanzar la numeración", async () => {
    vi.mocked(solicitarCae).mockRejectedValueOnce(new ErrorArca("correlativo", ["10016"]));
    vi.mocked(consultarComprobante).mockResolvedValueOnce(emitido);
    expect((await crearArcaServidor("prueba", persistencia()).autorizar(solicitud)).numero).toBe(10);
    expect(solicitarCae).toHaveBeenCalledTimes(1);
  });
  it("rechaza cambios del pedido entre reintentos", async () => {
    const p = persistencia();
    await crearArcaServidor("prueba", p).autorizar(solicitud);
    await expect(
      crearArcaServidor("prueba", p).autorizar({ ...solicitud, clienteDocumento: "28123456" }),
    ).rejects.toThrow("pedido fiscal pendiente cambió");
  });
  it("propaga un rechazo explícito sin pedir otro comprobante", async () => {
    vi.mocked(solicitarCae).mockRejectedValue(new ErrorArca("Receptor inválido", ["10015"]));
    await expect(crearArcaServidor("prueba", persistencia()).autorizar(solicitud)).rejects.toThrow("Receptor inválido");
    expect(solicitarCae).toHaveBeenCalledTimes(1);
  });
});
