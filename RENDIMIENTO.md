# Medición reproducible del panel de cobranza

Ejecución local del 22/10/2026, contra Firestore Emulator 1.22.0, Node 25.8.1 y Java 25. Los entornos de operación recomendados siguen siendo Node 24 LTS y Java 21 o superior.

Escenario sintético: 50 clientes, cada uno con 100 ventas canceladas y sus 100 pagos; total 10.000 movimientos. Se compara descargar el historial con consultar la cartera que ya tiene sus resúmenes preparados.

| Consulta | Documentos leídos | Bytes de respuesta | Tiempo local |
| --- | ---: | ---: | ---: |
| Historial completo de movimientos | 10.000 | 1.768.501 | 526 ms |
| Clientes y sus resúmenes | 100 | 19.051 | 28 ms |

Las lecturas de la segunda fila corresponden a 50 clientes y 50 resúmenes; el tamaño es el JSON de la cartera resultante. La primera fila mide el JSON de los movimientos. Son cargas diferentes, indicadas para mostrar el efecto de no trasladar historial cancelado al panel. No son resultados de producción, una prueba de estrés concurrente ni una estimación de la factura de Firebase.

Reproducir iniciando el emulador y ejecutando `npm run medir:historial` con `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085`. El script rechaza otros hosts y elimina exclusivamente su empresa sintética al terminar.

Cada operación sigue consultando el historial de la cuenta afectada para calcular imputaciones y regenerar su resumen. El siguiente cuello de botella a medir en producción es una cuenta individual con muchos años de movimientos. También deben medirse catálogos grandes, reportes por rango y cuentas con miles de comprobantes todavía abiertos. Los resúmenes de esta versión no eliminan esos costos.
