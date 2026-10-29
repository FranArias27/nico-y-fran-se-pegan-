# Mostrador local — primera base funcional

Requiere Node.js 24. Ejecutar `npm run local` desde la raíz y abrir http://127.0.0.1:4310. La terminal debe permanecer abierta. No requiere internet ni Firebase. El navegador se conecta únicamente al servidor de esta misma computadora.

Los datos se guardan en `local/data/comercio.sqlite`, fuera del control de versiones. No borrar esa carpeta. Cerrar el servidor antes de copiar la carpeta como respaldo manual.

Incluye alta de productos, venta en efectivo, descuento atómico de stock e historial de ventas persistente. Un reintento con el mismo identificador no duplica la venta. El navegador conserva la solicitud pendiente para recuperarla después de recargar.

Ejecutar `npm run test:local` para verificar persistencia, stock y reintentos.

Es una base de desarrollo para una computadora y un operador de confianza. Todavía no tiene instalador, usuarios, caja, devoluciones, impresión ni restauración asistida. No emite comprobantes fiscales. No exponer este servidor a la red: escucha exclusivamente en 127.0.0.1. La web compilada original sigue en la raíz sin modificaciones.
