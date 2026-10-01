# TRASPASO — 01/10/2026 13:00 (sesión 081bf46e) — LEER ESTO PRIMERO

`origin/main` y producción en `f4e229008`. El checkout de la sesión (`echegaray-os-daily`) quedó en **main** por pedido del dueño (antes: rama `liquidacion-presentismo-recibo`, que conserva los traspasos viejos). Mandato vigente: «seguí con todo… liberá todo ya». Se le contesta por DM del bot (`avisar-al-dueno.mjs` desde producción).

**Permisos:** el dueño habilitó `git push origin *:main` (12:40). El modo automático sigue negando cosas sueltas (leer `produccion-al-dia.mjs`, listar procesos): no se rodea; correr el script directo sí anduvo. El MCP de Supabase declina los `UPDATE` sueltos: las escrituras pedidas por el dueño van por script con `getPool` de producción.

## Publicado hoy
- `112e1aa54` Efectivo: el gasto reconocido a mano entra a Compras → ER-0021 quedó en **Compras fila 1052** ($5.000, A rendir). DEFECTO ABIERTO: la fila nació sin proveedor, obra ni categoría (el gasto a mano no los lleva al Sheet) → arreglar en el código y completar esa fila.
- `6b273451c` Legajo «Cuentas bancarias» (migración T0300 aplicada, 17 personas cargadas). Falta QA visual.
- `f4e229008` Efectivo: Administración rinde con foto por la entrega de cualquiera (auditor: firma con límites; falta verlo en pantalla por nivel y teléfono).
- El worker de comunicación sigue con código viejo hasta su reinicio nocturno: un reintento manual tiene que encolar y correr `reintentar-fajos-comprobantes.mjs --ahora` EN EL MISMO comando (`systemd-run --user --wait --pipe -p EnvironmentFile=worker.env -p EnvironmentFile=comunicacion.env`), o el worker viejo se lleva el fajo en segundos.

## En curso
- **Pedro Tello (RECLAMO ABIERTO DEL DUEÑO, 12:34):** «mal lo de Tello, revisá las celdas anteriores porque se le hacía un descuento de lo que se paga porque se le adelantó 1.250.000». Historia reconstruida: 27–29/08 plan «400 + 600×3 m², $9.900.000, anticipos $1.250.000 pagados, pendiente $8.650.000» con el anticipo repartido como pagado dentro de cada fila (bruto en Total, descuento en Monto Pagado); 11/09 dueño: total 3.610 m² × 4.400 = 15.884.000, el resto (5.984.000) semanal hasta 23/10; 18/09 pago por m² ejecutado (600 m² = 2.640.000) y fila 990 «a cuenta»; 01/10 recibo pago 3: 720 m² = 3.168.000 − 50 % del adelanto = 2.543.000. Fila 806 (Galpón 5, 1000 m² × 4.200) tiene U = `=1250000+1000000`: **el 1.250.000 puede ser el pago del Galpón 5 y no un anticipo aparte** — verificar antes de tocar. Estado actual de Compras: 990, 880–883, 959, 960 (suma 15.884.000) y 1048 (Messina). Respaldo: `scratchpad/tello-compras.antes.json`.
- **Liquidación** (`liquidacion-0110b`: `7d968aa97`, `cfa2646ec`; migraciones T0600 y T0700 sin aplicar): en auditoría. Según veredicto: ensayar/aplicar migraciones, rebasar sobre main, publicar.
- **Herramientas** (`herramientas-arreglos`: `9c92904f2`, migración T0800 sin aplicar): falta el informe del agente, auditoría, migración, publicar.
- **Recibo para firmar del gasto manual** (pedido 12:25): agente en worktree `efectivo-recibo`.
- **Bot Efectivo** (`bot-efectivo-fix` `0e994b907` WIP): tests sin correr, T0400 sin aplicar, sin auditar.

## Cerrado hoy
San Francisco (Cobranzas 70–73 y 106–110, publicado en el portal) · cuentas sueldo Ochoa/Castillo (Drive y legajo) · ER-0026 → fila 1047 · recibos: Tello fila 882 y 1048, Fredes (foto), Roxana filas 1049/1050 imputadas a ER-0023 (queda en −$213.432,88) · nota del subcontrato de Tello actualizada (habrá que rehacerla con la corrección).

## Abierto, depende del dueño
- FCL Castillo/Ochoa: no existe archivo de apertura FCL; falta saber qué carga Rodrigo en el portal (lote «- 2»). Cuenta sueldo de Tello y CBU de Agüero.
- Roxana: factura por el otro 50 % de la cargadora ($1.000.000). ER-0023 negativa.
- San Francisco: 67.160,60 «a cuenta» del 18/09 sin fila; `obras.monto_contratado` de Mampostería.

## Defectos anotados sin arreglar
Efectivo: cabecera «$ 0» al reconocer; importes con un decimal en teléfono; «Entregas» desborda a 390 px; «Devolver efectivo» visible a campo sin plata; enlace de confirmar abre fuera de sesión; el bot contesta «no tenés efectivo a rendir» a recibos de terceros. C7 de Impuestos sin releer.
