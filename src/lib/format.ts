/**
 * Formatos rioplatenses. Se implementan a mano (sin Intl) para que el
 * resultado sea idéntico en cualquier navegador, en Node y en los tests.
 */

function agruparMiles(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** 123456 centavos → "$ 1.234,56". Los negativos van como "-$ 1.234,56". */
export function formatMoney(centavos: number): string {
  const signo = centavos < 0 ? "-" : "";
  const abs = Math.abs(Math.round(centavos));
  const entero = Math.floor(abs / 100).toString();
  const decimales = (abs % 100).toString().padStart(2, "0");
  return `${signo}$ ${agruparMiles(entero)},${decimales}`;
}

/** Igual que formatMoney pero sin el signo $ (para tablas y campos). */
export function formatAmount(centavos: number): string {
  return formatMoney(centavos).replace("$ ", "");
}

/** Porcentaje con hasta 2 decimales: 21 → "21 %", 10.5 → "10,5 %". */
export function formatPercent(valor: number, decimales = 2): string {
  const redondeado = Number(valor.toFixed(decimales));
  return `${redondeado.toString().replace(".", ",")} %`;
}

/** Cantidad guardada en milésimas: 1500 → "1,5"; 2000 → "2". */
export function formatQty(milesimas: number): string {
  const valor = milesimas / 1000;
  const texto = Number.isInteger(valor) ? valor.toString() : Number(valor.toFixed(3)).toString();
  const [entero, dec] = texto.replace("-", "").split(".");
  const signo = valor < 0 ? "-" : "";
  return `${signo}${agruparMiles(entero)}${dec ? `,${dec}` : ""}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Date o ISO → "dd/mm/aaaa" en hora local. */
export function formatDate(fecha: Date | string): string {
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Date o ISO → "dd/mm/aaaa hh:mm". */
export function formatDateTime(fecha: Date | string): string {
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  return `${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "20-12345678-9" a partir de 11 dígitos; si no son 11, se devuelve tal cual. */
export function formatCuit(cuit: string): string {
  const digitos = cuit.replace(/\D/g, "");
  if (digitos.length !== 11) return cuit;
  return `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos.slice(10)}`;
}

/** Punto de venta y número: "0001-00000123". */
export function formatNumeroComprobante(puntoVenta: number, numero: number): string {
  return `${puntoVenta.toString().padStart(4, "0")}-${numero.toString().padStart(8, "0")}`;
}

/**
 * Interpreta un importe tipeado por el usuario ("1.234,56", "1234.5", "$ 100")
 * y lo devuelve en centavos. Devuelve null si no es un número válido.
 */
export function parseMoney(texto: string): number | null {
  let limpio = texto.replace(/[$\s]/g, "");
  if (limpio === "") return null;
  if (limpio.includes(",")) {
    // Formato local: el punto es separador de miles y la coma, decimal.
    limpio = limpio.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) {
    // "1.234" sin coma: se toma como miles.
    limpio = limpio.replace(/\./g, "");
  }
  const valor = Number(limpio);
  if (!Number.isFinite(valor)) return null;
  return Math.round(valor * 100);
}

/** "1,5" o "1.5" → 1500 milésimas. Devuelve null si no es válido. */
export function parseQty(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (limpio === "") return null;
  const valor = Number(limpio);
  if (!Number.isFinite(valor)) return null;
  return Math.round(valor * 1000);
}
