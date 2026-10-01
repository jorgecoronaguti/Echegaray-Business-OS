# TRASPASO — 01/10/2026 noche (sesión 081bf46e) — LEER ESTO PRIMERO

`origin/main` = `fb3e20a0b` (+ este traspaso). Producción (`produccion/`) al día. Chat y bot reinician solos entre las 2 y las 5 h: hasta entonces corren el código de ayer.
Migraciones aplicadas hoy: T0300, T0400, T0600, T0700, T0800, T0900, T1000, T1100, **T1200** (`cliente_cobranza` + `fecha_venta`). Ninguna pendiente.
El dueño recibe todo por DM del bot (`avisar-al-dueno.mjs`). `--aplicar` de una migración lo frena el clasificador hasta que el dueño lo autoriza en la conversación: no se rodea.

## EN CURSO — Tarjeta PymeNación (BNA) — pedido del dueño: «hacé todo completo y perfecto, y tiene que dar positivo el FF»
- Auditoría del 01/10 (detalle: scratchpad `bna/auditoria.md`): formularios OK con 4 cierres (fecha/firma, Rodrigo confirma los «NO» premarcados, F66294 en duplicado, Consentimiento debe ser idéntico al modelo). **Flujo NO presentable**: armado por devengado (acumulado jul-26 −119,9 M contra banco +81,1 M), faltan cargos Santander (~0,47 M/mes), PDF más viejo que el Sheet, NC TRIELEC mar-26 sumada (+210.736), jul-26 +4.232.246 sin explicar, Nota clientes/proveedores afirma coincidir con DDJJ y no coincide en 7 meses, DJ Deudas «sin descubierto» sólo cierto al 29/09.
- **Aparecieron los extractos Santander oct-25→may-26 (falta marzo-26)** en Gmail de rodrigo@ (mails al estudio FR Asesores); bajados a scratchpad `bna2/` (.xls tabulado + PDF). Saldos de cierre: nov +1,78 M · dic −7,84 M · ene −5,39 M · feb +1,10 M · mar −5,64 M (inferido) · abr −11,04 M · may −1,46 M. `banco_movimientos` cubre desde 28/05/26.
- Saldo inicial 33.774.364 = disponibilidades 6.643.873 + inversiones 27.130.491 (EECC nota 2.1/2.2: FCI PER2A 15,45 M + bonos/ON en Balanz). No hay saldos de inversiones posteriores; sí boletos de Balanz (11/11/25, 04–05/06/26, 15/07/26).
- **Método acordado con el dueño (DM 4giawnnewtfrixqeurgy7htchw):** rehacer por PERCIBIDO atado al banco, saldo = Caja y Bancos + Inversiones corrientes (lo que pide la Guía del banco). **Límite dicho al dueño: ningún número sin fuente para forzar el signo.**
- Un agente está armando el libro bancario clasificado por rubro del modelo en scratchpad `bna3/` (`libro.csv`, `totales.json/md`, `reglas.md`, `guia-del-banco.md`). FALTA: revisar su control de cadena, pasar los meses reales a una COPIA del Sheet del flujo (original `1QUGF56A3cQZzbC9wf6uhVUu7lsFtQgjl__D-APu1DLc`, no se escribe), proyección +2 % ingresos / costos constantes, premisas, PDF nuevo, corregir Nota clientes/proveedores, DJ Deudas, Consentimiento, F66294 duplicado, LEEME; auditoría independiente; avisar al dueño. Marzo-26: pedir el extracto a Rodrigo/estudio si no aparece.
- Período: la Guía exige nov-25→oct-27; el dueño había dicho «2026 y 2027». Sin decidir (preguntado en DM gwm9fy18ftnfjjcy1r6o4nk5gr).
- Carpeta real en Drive: `1ff-L3JwKj7cv80PR9UKOcDHuWsJam-b4`. Nada enviado al banco; «05 Firmados» vacía.

## Hecho hoy a la tarde/noche, verificado en producción con el usuario del dueño (sólo lectura, 1440 y 390)
- **Recibos en lote + checklist** (`306fc95e2`): vista previa con «Qué lleva el recibo» para todo el lote (`OPCIONES_DEL_RECIBO`, `eleccionEnElLote`). Los botones «Guardar…» NO se apretaron nunca en QA: el primer uso real es del dueño.
- **Filtro «Cliente»** en Liquidación y escala UOCRA sept en el cartel.
- **Comprobantes en Compras** (`843824035`, `c4540bda1`): la fila sin número muestra el papel declarado en su renglón; recibos cargados como pago en 882, 1048, 876, 1049, 1050; 1052 rellaveada. Ver memoria `compras-fila-sin-numero-recibo-por-fila`.
- **Filtro de fechas en Cobranzas del cliente** (`fb3e20a0b` + T1200): Factura (col. Q = `cobranzas.fecha_venta`) y Cobro (col. R). El portal no lee `cliente_cobranza` (verificado).
- **ANR Agencia de Inversiones**: respuesta armada en rodrigo@, en el hilo, con 4 adjuntos (draft `r644291967228489622`). Falta que Rodrigo la envíe; baja automática ~08/10.

## Abierto, mío
- En el panel de una compra sin número sigue el texto «Sin número de comprobante no hay de qué colgar el papel» (AccionesCompra) aunque ya muestra el recibo; y el pago aparece en «El papel» y en «Comprobantes del pago» (doble). Menor.
- Error React #418 (hidratación) en `/administracion/compras`, en todas las filas: preexistente, sin diagnosticar.
- Gasto manual de Efectivo (web): falta obra, proveedor del padrón y categoría en el formulario (necesita migración).
- Bot Efectivo: foto de un tercero mandada por quien tiene UNA sola entrega propia se imputa a ésa.
- Efectivo UI: cabecera «$ 0» al reconocer; «Entregas» desborda a 390 px; enlace de confirmar abre fuera de sesión.
- QA por nivel y teléfono pendiente: legajo «Cuentas bancarias», «rendir por otro».
- Rojos preexistentes en main (no tocados): canonico-legajo-v2, navegacion-sin-anchor-crudo, ritmo-vertical, canonico-definiciones, nombre-en-pantallas, rotulo-de-obra-en-pantallas, cableado-del-ingreso.
- C7 de Impuestos sin releer. `_UOCRA_RAW` del Sheet termina en agosto. Escala oct (+1,8 %) y nov (+1,7 %) sin cargar: cuando el dueño diga.
- ~200 worktrees: `node scripts/higiene-worktrees.mjs`. De esta sesión quedan `comprobantes-sin-numero`, `cobranzas-filtro-fechas`, `recibos-lote-v2`, `efectivo-pantalla` (todos ya en main: se pueden quitar).

## Abierto, depende del dueño
- PymeNación: período del flujo; extracto Santander de marzo-26; firma de Rodrigo.
- FCL Castillo/Ochoa; cuenta sueldo de Tello y CBU de Agüero.
- Roxana: factura por el otro 50 % de la cargadora ($1.000.000). ER-0023 en −$213.432,88.
- San Francisco: 67.160,60 «a cuenta» del 18/09 sin fila.
- Rodados: services, RTO y seguro de Ford XLS AG503PV y Hilux NMN898.

## Riesgos
- El typecheck dirigido tiene que incluir los tests que importan lo cambiado: excluirlos rompió un build de Vercel hoy (memoria `typecheck-dirigido-incluye-los-tests`). `tsc` completo no entra en la memoria de la VM.
- Vercel: 100 deploys por día; hoy van ~10 pushes a main.
- El worker de comunicación corre código viejo hasta su reinicio nocturno.
- No vaciar celdas del Sheet desde el OS (`no-borrar.mjs`); no insertar ni borrar filas en Compras/Cobranzas (los recibos sin número cuelgan del renglón).
