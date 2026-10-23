import { ErrorPedido, respuestaDeError, usuarioDelPedido, validarAcceso } from "@/server/acceso";
import { adminDb } from "@/server/firebase-admin";
import { respaldarEmpresa } from "@/server/respaldo";
import { generarExcel, importarExcel, leerExcel, prepararImportacion } from "@/server/excel";
import { idSeguro } from "@/domain/gestion";
import { conExclusion } from "@/server/exclusion";
import { actualizarCartera } from "@/server/cartera";

export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    const uid = await usuarioDelPedido(request);
    const url = new URL(request.url),
      empresa = url.searchParams.get("empresaId") ?? "";
    await validarAcceso(uid, empresa, { soloAdmin: true });
    const formato = url.searchParams.get("formato");
    const headers = {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${empresa}-${formato === "respaldo" ? "respaldo.json" : "articulos.xlsx"}"`,
    };
    if (formato === "respaldo") {
      const contenido = JSON.stringify(await respaldarEmpresa(adminDb(), empresa));
      if (Buffer.byteLength(contenido) > 4_000_000)
        throw new ErrorPedido(
          "El respaldo supera el tamaño de descarga disponible. Solicitá la copia al administrador del sistema.",
          422,
        );
      return new Response(contenido, { headers: { ...headers, "Content-Type": "application/json" } });
    }
    if (formato !== "excel" && formato !== "plantilla") throw new ErrorPedido("Formato inválido", 400);
    const buffer = await generarExcel(adminDb(), empresa, formato === "plantilla");
    return new Response(new Uint8Array(buffer), {
      headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    });
  } catch (e) {
    return respuestaDeError(e, (error) =>
      error instanceof Error ? Response.json({ error: error.message }, { status: 422 }) : undefined,
    );
  }
}
export async function POST(request: Request) {
  try {
    const uid = await usuarioDelPedido(request);
    const form = await request.formData();
    const empresa = String(form.get("empresaId") ?? ""),
      id = idSeguro(form.get("id"));
    await validarAcceso(uid, empresa, { soloAdmin: true });
    if (form.get("accion") === "reconstruir_cartera") {
      const resultado = await conExclusion(
        adminDb(),
        empresa,
        id,
        uid,
        { accion: "reconstruir_cartera" },
        async (exclusion) => {
          const clientes = await adminDb().collection(`empresas/${empresa}/clientes`).get();
          for (const c of clientes.docs) await actualizarCartera(adminDb(), empresa, c.id, exclusion);
          return { clientes: clientes.size };
        },
      );
      return Response.json(resultado);
    }
    const archivo = form.get("archivo");
    if (!(archivo instanceof File) || !archivo.name.toLowerCase().endsWith(".xlsx") || archivo.size > 3_000_000)
      throw new ErrorPedido("Elegí un .xlsx de hasta 3 MB", 400);
    const filas = await leerExcel(await archivo.arrayBuffer());
    if (form.get("confirmar") !== "si") {
      const { errores, nuevos, actualizados } = await prepararImportacion(adminDb(), empresa, filas);
      return Response.json({ errores: errores.slice(0, 100), totalErrores: errores.length, nuevos, actualizados });
    }
    return Response.json(await importarExcel(adminDb(), empresa, uid, id, filas));
  } catch (e) {
    return respuestaDeError(e, (error) =>
      error instanceof Error
        ? Response.json(
            { error: error.message, pendiente: "pendiente" in error && error.pendiente === true },
            { status: 422 },
          )
        : undefined,
    );
  }
}
