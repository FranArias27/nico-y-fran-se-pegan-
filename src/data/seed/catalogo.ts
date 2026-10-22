import type { AlicuotaIva, Categoria, Redondeo, UnidadMedida } from "@/domain/types";

export const CATEGORIAS: Categoria[] = [
  { id: "cat-tor", nombre: "Tornillería y fijaciones" },
  { id: "cat-her", nombre: "Herramientas manuales" },
  { id: "cat-hel", nombre: "Herramientas eléctricas" },
  { id: "cat-elc", nombre: "Electricidad" },
  { id: "cat-plo", nombre: "Plomería" },
  { id: "cat-pin", nombre: "Pinturería" },
  { id: "cat-con", nombre: "Construcción" },
  { id: "cat-adh", nombre: "Adhesivos y selladores" },
  { id: "cat-jar", nombre: "Jardín y seguridad" },
];

export interface ArticuloSemilla {
  codigo: string;
  nombre: string;
  marca: string;
  categoriaId: string;
  unidad?: UnidadMedida;
  /** Costo neto en pesos. */
  costo: number;
  /** % de ganancia. */
  margen: number;
  iva?: AlicuotaIva;
  redondeo?: Redondeo;
  stock: number;
  minimo: number;
  /** Códigos adicionales: cantidad de unidades que representa cada uno. */
  codigosExtra?: number[];
  /** Popularidad relativa en el historial de ventas. */
  rotacion: number;
}

/** Catálogo de ejemplo (precios de referencia, en pesos, netos de IVA). */
export const ARTICULOS: ArticuloSemilla[] = [
  // Tornillería y fijaciones
  { codigo: "TOR-001", nombre: 'Clavo punta París 2"', marca: "Acindar", categoriaId: "cat-tor", unidad: "kg", costo: 3200, margen: 45, stock: 38, minimo: 10, rotacion: 8 },
  { codigo: "TOR-002", nombre: 'Clavo punta París 3"', marca: "Acindar", categoriaId: "cat-tor", unidad: "kg", costo: 3100, margen: 45, stock: 6.5, minimo: 10, rotacion: 6 },
  { codigo: "TOR-003", nombre: 'Tornillo autoperforante T2 8 x 1/2" (x100)', marca: "Fixser", categoriaId: "cat-tor", costo: 4800, margen: 50, stock: 42, minimo: 10, rotacion: 7 },
  { codigo: "TOR-004", nombre: 'Tornillo madera 6 x 1 1/2" (x100)', marca: "Fixser", categoriaId: "cat-tor", costo: 3900, margen: 50, stock: 25, minimo: 8, rotacion: 5 },
  { codigo: "TOR-005", nombre: "Tarugo nylon 8 mm (x50)", marca: "Fischer", categoriaId: "cat-tor", costo: 2200, margen: 60, stock: 60, minimo: 15, rotacion: 9, codigosExtra: [1] },
  { codigo: "TOR-006", nombre: 'Bulón hexagonal 1/4" x 2"', marca: "Fixser", categoriaId: "cat-tor", costo: 180, margen: 80, stock: 300, minimo: 100, rotacion: 6 },
  { codigo: "TOR-007", nombre: 'Arandela plana 1/4" (x100)', marca: "Fixser", categoriaId: "cat-tor", costo: 1500, margen: 60, stock: 18, minimo: 5, rotacion: 2 },
  { codigo: "TOR-008", nombre: 'Tuerca hexagonal 1/4" (x100)', marca: "Fixser", categoriaId: "cat-tor", costo: 1900, margen: 60, stock: 4, minimo: 5, rotacion: 2 },
  { codigo: "TOR-009", nombre: "Taco S6 con tornillo (blíster x10)", marca: "Fischer", categoriaId: "cat-tor", costo: 1600, margen: 70, stock: 45, minimo: 10, rotacion: 7 },
  { codigo: "TOR-010", nombre: "Alambre negro recocido N.º 16", marca: "Acindar", categoriaId: "cat-tor", unidad: "kg", costo: 2600, margen: 40, stock: 22, minimo: 10, rotacion: 4 },

  // Herramientas manuales
  { codigo: "HER-001", nombre: "Martillo carpintero 16 oz", marca: "Stanley", categoriaId: "cat-her", costo: 14500, margen: 45, redondeo: "centena", stock: 9, minimo: 4, rotacion: 3 },
  { codigo: "HER-002", nombre: "Destornillador plano 6 x 150 mm", marca: "Stanley", categoriaId: "cat-her", costo: 3800, margen: 50, redondeo: "centena", stock: 20, minimo: 6, rotacion: 4 },
  { codigo: "HER-003", nombre: "Destornillador Phillips PH2 x 100 mm", marca: "Stanley", categoriaId: "cat-her", costo: 3800, margen: 50, redondeo: "centena", stock: 17, minimo: 6, rotacion: 4 },
  { codigo: "HER-004", nombre: "Juego de destornilladores x6", marca: "Bremen", categoriaId: "cat-her", costo: 12500, margen: 45, redondeo: "centena", stock: 7, minimo: 3, rotacion: 2 },
  { codigo: "HER-005", nombre: 'Pinza universal 8"', marca: "Bahco", categoriaId: "cat-her", costo: 11200, margen: 45, redondeo: "centena", stock: 8, minimo: 3, rotacion: 2 },
  { codigo: "HER-006", nombre: 'Alicate corte diagonal 6"', marca: "Bahco", categoriaId: "cat-her", costo: 9800, margen: 45, redondeo: "centena", stock: 2, minimo: 3, rotacion: 2 },
  { codigo: "HER-007", nombre: 'Llave ajustable 10"', marca: "Bahco", categoriaId: "cat-her", costo: 16500, margen: 40, redondeo: "centena", stock: 6, minimo: 2, rotacion: 1.5 },
  { codigo: "HER-008", nombre: "Cinta métrica 5 m", marca: "Stanley", categoriaId: "cat-her", costo: 7400, margen: 50, redondeo: "centena", stock: 14, minimo: 5, rotacion: 4, codigosExtra: [1] },
  { codigo: "HER-009", nombre: "Nivel de aluminio 60 cm", marca: "Bremen", categoriaId: "cat-her", costo: 9900, margen: 45, redondeo: "centena", stock: 5, minimo: 2, rotacion: 1.5 },
  { codigo: "HER-010", nombre: 'Serrucho carpintero 20"', marca: "Bahco", categoriaId: "cat-her", costo: 13900, margen: 40, redondeo: "centena", stock: 4, minimo: 2, rotacion: 1 },
  { codigo: "HER-011", nombre: "Cutter profesional 18 mm", marca: "Stanley", categoriaId: "cat-her", costo: 3200, margen: 60, stock: 26, minimo: 8, rotacion: 5 },
  { codigo: "HER-012", nombre: "Llave combinada 13 mm", marca: "Bremen", categoriaId: "cat-her", costo: 2900, margen: 55, stock: 15, minimo: 5, rotacion: 2 },

  // Herramientas eléctricas (bienes de capital al 10,5 %)
  { codigo: "HEL-001", nombre: "Taladro percutor 13 mm 750 W", marca: "Black+Decker", categoriaId: "cat-hel", costo: 68000, margen: 30, iva: 1050, redondeo: "centena", stock: 4, minimo: 2, rotacion: 0.8 },
  { codigo: "HEL-002", nombre: "Amoladora angular 115 mm 820 W", marca: "Bosch", categoriaId: "cat-hel", costo: 82000, margen: 28, iva: 1050, redondeo: "centena", stock: 3, minimo: 2, rotacion: 0.7 },
  { codigo: "HEL-003", nombre: "Atornillador inalámbrico 12 V", marca: "Black+Decker", categoriaId: "cat-hel", costo: 75000, margen: 30, iva: 1050, redondeo: "centena", stock: 1, minimo: 2, rotacion: 0.5 },
  { codigo: "HEL-004", nombre: "Mecha widia 6 mm", marca: "Ezeta", categoriaId: "cat-hel", costo: 1500, margen: 70, stock: 40, minimo: 10, rotacion: 6 },
  { codigo: "HEL-005", nombre: "Mecha widia 8 mm", marca: "Ezeta", categoriaId: "cat-hel", costo: 1900, margen: 70, stock: 32, minimo: 10, rotacion: 5 },
  { codigo: "HEL-006", nombre: "Disco de corte 115 mm para metal", marca: "Tyrolit", categoriaId: "cat-hel", costo: 950, margen: 25, stock: -3, minimo: 20, rotacion: 8, codigosExtra: [10] },
  { codigo: "HEL-007", nombre: "Juego de mechas acero rápido x13", marca: "Ezeta", categoriaId: "cat-hel", costo: 9800, margen: 45, redondeo: "centena", stock: 6, minimo: 2, rotacion: 1 },

  // Electricidad
  { codigo: "ELC-001", nombre: "Cable unipolar 2,5 mm²", marca: "Prysmian", categoriaId: "cat-elc", unidad: "metro", costo: 620, margen: 45, stock: 350, minimo: 100, rotacion: 9 },
  { codigo: "ELC-002", nombre: "Cable unipolar 1,5 mm²", marca: "Prysmian", categoriaId: "cat-elc", unidad: "metro", costo: 430, margen: 45, stock: 80, minimo: 100, rotacion: 8 },
  { codigo: "ELC-003", nombre: "Cable tipo taller 2 x 1,5 mm²", marca: "Prysmian", categoriaId: "cat-elc", unidad: "metro", costo: 980, margen: 45, stock: 120, minimo: 50, rotacion: 5 },
  { codigo: "ELC-004", nombre: "Cinta aisladora negra 20 m", marca: "Tacsa", categoriaId: "cat-elc", costo: 900, margen: 70, stock: 54, minimo: 24, rotacion: 10, codigosExtra: [12] },
  { codigo: "ELC-005", nombre: "Lámpara LED 9 W luz fría", marca: "Philips", categoriaId: "cat-elc", costo: 1700, margen: 60, stock: 70, minimo: 20, rotacion: 8, codigosExtra: [1, 10] },
  { codigo: "ELC-006", nombre: "Tomacorriente doble 10 A", marca: "Jeluz", categoriaId: "cat-elc", costo: 2900, margen: 55, stock: 25, minimo: 10, rotacion: 5 },
  { codigo: "ELC-007", nombre: "Interruptor de un punto", marca: "Jeluz", categoriaId: "cat-elc", costo: 1900, margen: 55, stock: 30, minimo: 10, rotacion: 5 },
  { codigo: "ELC-008", nombre: "Prolongador 3 tomas 5 m", marca: "Kalop", categoriaId: "cat-elc", costo: 7800, margen: 45, redondeo: "centena", stock: 9, minimo: 4, rotacion: 2 },
  { codigo: "ELC-009", nombre: "Interruptor termomagnético 2 x 20 A", marca: "Sica", categoriaId: "cat-elc", costo: 9500, margen: 40, redondeo: "centena", stock: 12, minimo: 4, rotacion: 2.5 },
  { codigo: "ELC-010", nombre: 'Caño corrugado 3/4"', marca: "Tubelectric", categoriaId: "cat-elc", unidad: "metro", costo: 260, margen: 60, stock: 200, minimo: 50, rotacion: 5 },

  // Plomería
  { codigo: "PLO-001", nombre: "Caño termofusión 20 mm (barra 4 m)", marca: "Acqua System", categoriaId: "cat-plo", costo: 4800, margen: 45, stock: 30, minimo: 10, rotacion: 4 },
  { codigo: "PLO-002", nombre: "Codo termofusión 20 mm a 90°", marca: "Acqua System", categoriaId: "cat-plo", costo: 420, margen: 80, stock: 120, minimo: 40, rotacion: 6 },
  { codigo: "PLO-003", nombre: 'Llave de paso 1/2"', marca: "FV", categoriaId: "cat-plo", costo: 12800, margen: 40, redondeo: "centena", stock: 7, minimo: 3, rotacion: 2 },
  { codigo: "PLO-004", nombre: 'Cinta de teflón 3/4" x 10 m', marca: "Sellafix", categoriaId: "cat-plo", costo: 450, margen: 90, stock: -2, minimo: 20, rotacion: 9, codigosExtra: [1] },
  { codigo: "PLO-005", nombre: 'Manguera de jardín 1/2"', marca: "Pentaflex", categoriaId: "cat-plo", unidad: "metro", costo: 750, margen: 50, stock: 75, minimo: 25, rotacion: 3 },
  { codigo: "PLO-006", nombre: "Sifón de PVC 40 mm", marca: "Awaduct", categoriaId: "cat-plo", costo: 3200, margen: 50, stock: 11, minimo: 4, rotacion: 2 },
  { codigo: "PLO-007", nombre: 'Flexible mallado 1/2" x 40 cm', marca: "FV", categoriaId: "cat-plo", costo: 2600, margen: 55, stock: 22, minimo: 8, rotacion: 4 },
  { codigo: "PLO-008", nombre: "Adhesivo para PVC 50 ml", marca: "Awaduct", categoriaId: "cat-plo", costo: 1900, margen: 60, stock: 16, minimo: 6, rotacion: 3 },

  // Pinturería
  { codigo: "PIN-001", nombre: "Látex interior blanco 20 L", marca: "Alba", categoriaId: "cat-pin", costo: 62000, margen: 30, redondeo: "centena", stock: 6, minimo: 3, rotacion: 1.5 },
  { codigo: "PIN-002", nombre: "Látex interior blanco 4 L", marca: "Alba", categoriaId: "cat-pin", costo: 15800, margen: 35, redondeo: "centena", stock: 14, minimo: 5, rotacion: 3 },
  { codigo: "PIN-003", nombre: "Esmalte sintético negro 1 L", marca: "Alba", categoriaId: "cat-pin", costo: 9800, margen: 40, redondeo: "centena", stock: 9, minimo: 4, rotacion: 2 },
  { codigo: "PIN-004", nombre: "Rodillo de lana 22 cm", marca: "El Galgo", categoriaId: "cat-pin", costo: 5200, margen: 50, stock: 12, minimo: 4, rotacion: 3 },
  { codigo: "PIN-005", nombre: "Pincel N.º 20", marca: "El Galgo", categoriaId: "cat-pin", costo: 2600, margen: 55, stock: 18, minimo: 6, rotacion: 3 },
  { codigo: "PIN-006", nombre: "Lija al agua grano 120", marca: "Doble A", categoriaId: "cat-pin", costo: 380, margen: 90, stock: 140, minimo: 50, rotacion: 6 },
  { codigo: "PIN-007", nombre: "Thinner 1 L", marca: "Dilutec", categoriaId: "cat-pin", costo: 3100, margen: 50, stock: 15, minimo: 6, rotacion: 3 },
  { codigo: "PIN-008", nombre: "Cinta de papel 24 mm x 50 m", marca: "Tacsa", categoriaId: "cat-pin", costo: 1700, margen: 60, stock: 28, minimo: 10, rotacion: 4 },

  // Construcción
  { codigo: "CON-001", nombre: "Cemento portland 50 kg", marca: "Loma Negra", categoriaId: "cat-con", costo: 8900, margen: 22, redondeo: "centena", stock: 45, minimo: 20, rotacion: 7 },
  { codigo: "CON-002", nombre: "Cal hidratada 25 kg", marca: "Cacique", categoriaId: "cat-con", costo: 4300, margen: 25, redondeo: "centena", stock: 30, minimo: 15, rotacion: 5 },
  { codigo: "CON-003", nombre: "Hierro aletado 8 mm (barra 12 m)", marca: "Acindar", categoriaId: "cat-con", costo: 7900, margen: 20, redondeo: "centena", stock: 60, minimo: 30, rotacion: 4 },
  { codigo: "CON-004", nombre: "Pegamento para cerámica 30 kg", marca: "Klaukol", categoriaId: "cat-con", costo: 7600, margen: 28, redondeo: "centena", stock: 18, minimo: 10, rotacion: 4 },
  { codigo: "CON-005", nombre: "Hidrófugo 4 L", marca: "Ceresita", categoriaId: "cat-con", costo: 6800, margen: 35, redondeo: "centena", stock: 8, minimo: 4, rotacion: 2 },

  // Adhesivos y selladores
  { codigo: "ADH-001", nombre: "Silicona transparente 280 ml", marca: "Fischer", categoriaId: "cat-adh", costo: 3900, margen: 55, stock: 24, minimo: 8, rotacion: 5 },
  { codigo: "ADH-002", nombre: "Adhesivo instantáneo 3 g", marca: "La Gotita", categoriaId: "cat-adh", costo: 1500, margen: 70, stock: 48, minimo: 12, rotacion: 6, codigosExtra: [12] },
  { codigo: "ADH-003", nombre: "Espuma de poliuretano 500 ml", marca: "Fischer", categoriaId: "cat-adh", costo: 6200, margen: 45, stock: 10, minimo: 4, rotacion: 2 },
  { codigo: "ADH-004", nombre: "Sellador acrílico blanco 280 ml", marca: "Sika", categoriaId: "cat-adh", costo: 2900, margen: 55, stock: 3, minimo: 6, rotacion: 3 },

  // Jardín y seguridad
  { codigo: "JAR-001", nombre: "Pala ancha mango de madera", marca: "Gherardi", categoriaId: "cat-jar", costo: 14800, margen: 40, redondeo: "centena", stock: 5, minimo: 2, rotacion: 1 },
  { codigo: "JAR-002", nombre: 'Tijera de podar 8"', marca: "Tramontina", categoriaId: "cat-jar", costo: 9500, margen: 45, redondeo: "centena", stock: 7, minimo: 2, rotacion: 1.2 },
  { codigo: "JAR-003", nombre: "Guantes de vaqueta", marca: "Prestoflex", categoriaId: "cat-jar", costo: 3800, margen: 55, stock: 30, minimo: 10, rotacion: 4 },
  { codigo: "JAR-004", nombre: "Cadena galvanizada 5 mm", marca: "Acindar", categoriaId: "cat-jar", unidad: "metro", costo: 2100, margen: 50, stock: 40, minimo: 15, rotacion: 2 },
];
