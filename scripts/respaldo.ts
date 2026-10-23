import { mkdir, readFile, writeFile } from "node:fs/promises";
import { adminDb } from "../src/server/firebase-admin";
import { respaldarEmpresa, restaurarEmpresa, validarRespaldo } from "../src/server/respaldo";

async function main() {
  const [accion, empresa, archivo] = process.argv.slice(2);
  if (!empresa || !["crear", "verificar", "restaurar"].includes(accion)) {
    throw new Error("Uso: npm run respaldo -- crear EMPRESA [archivo] | verificar ARCHIVO | restaurar DESTINO ARCHIVO");
  }
  if (accion === "verificar") {
    const respaldo = validarRespaldo(JSON.parse(await readFile(empresa, "utf8")));
    console.log(`Respaldo válido: ${respaldo.documentos.length} documentos de ${respaldo.empresaId}`);
  } else if (accion === "crear") {
    const respaldo = await respaldarEmpresa(adminDb(), empresa);
    await mkdir("backups", { recursive: true });
    const salida = archivo ?? `backups/${empresa}-${Date.now()}.json`;
    await writeFile(salida, JSON.stringify(respaldo), { flag: "wx" });
    console.log(`Respaldo guardado y verificado: ${salida}`);
    validarRespaldo(JSON.parse(await readFile(salida, "utf8")));
  } else {
    if (!archivo) throw new Error("Falta el archivo de respaldo");
    console.log(await restaurarEmpresa(adminDb(), empresa, JSON.parse(await readFile(archivo, "utf8"))));
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
