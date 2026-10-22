/** Dígito verificador del CUIT/CUIL (módulo 11). */
export function digitoVerificadorCuit(base10: string): number | null {
  if (!/^\d{10}$/.test(base10)) return null;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(base10[i]), 0);
  const resto = 11 - (suma % 11);
  if (resto === 11) return 0;
  if (resto === 10) return null; // combinación inválida
  return resto;
}

export function cuitValido(cuit: string): boolean {
  const digitos = cuit.replace(/\D/g, "");
  if (digitos.length !== 11) return false;
  return digitoVerificadorCuit(digitos.slice(0, 10)) === Number(digitos[10]);
}

/** Dígito verificador EAN-13 para los primeros 12 dígitos. */
export function digitoVerificadorEan13(base12: string): number {
  const suma = [...base12].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (suma % 10)) % 10;
}
