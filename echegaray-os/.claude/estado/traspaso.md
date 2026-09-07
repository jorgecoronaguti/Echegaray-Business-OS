# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-07 (tarde) · extracto cargado, botón repuesto, filtros de admin_

## 1. OBJETIVO GENERAL

Echegaray Business OS es el sistema operativo digital de Echegaray Construcciones. Integra
aplicación web (Next.js + Supabase), datos, automatizaciones, motores determinísticos e IA para que
Dirección y la empresa operen desde una única plataforma. XSAS es la capa de inteligencia operativa
del OS: el usuario trabaja desde la app con lenguaje natural, interfaces y archivos, sin conocer
tablas, skills ni código.

Claude Code NO es la interfaz operativa del negocio: se usa únicamente para desarrollar, corregir,
probar y evolucionar el OS y XSAS. Prueba definitiva: Jorge puede cerrar Claude Code, entrar a
/xsas y hacer su trabajo diario.

## 2. PRINCIPIOS INVARIANTES

- Obra como eje central · una fuente de verdad por concepto (Postgres cuando lo consumen varias caras)
- Plan vs Real vs Forecast · P&L devengado · Cash Flow percibido · nunca mezclar ventanas de tiempo
- Datos y evidencia antes que inferencia · no inventar · FALTA_DATO cuando falta evidencia · CONFLICTO cuando las fuentes se contradicen
- Preservar genealogía/provenance · edición manual del dueño = verdad definitiva
- Acciones sensibles: autorización + RBAC + auditoría + verificación (Nivel E = firma humana)
- Deterministic first · skills/capabilities/tools first · Reasoner/LLM sólo cuando aporte valor real
- Reutilizar motores/datos/capacidades existentes antes de crear otros
- Minimizar llamadas, tokens, costo y complejidad — el límite semanal de Claude Code es recurso escaso
- UX simple, compacta, operativa · less is more · **minimalismo extremo en el Sheet: sin aclaraciones
  ni explicaciones de nada** (deroga «la nota al lado»)
- Conocimiento y experiencia real ECSAS priman sobre generalizaciones externas
- Nadie cierra su propio trabajo · evidencia del EFECTO, no del intento
- **Un control que impide corregir un defecto lo vuelve eterno**
- **Ningún hallazgo se reporta sin mirar la celda real** — cuatro falsos ya costaron caro

## 3. ARQUITECTURA CONCEPTUAL

Usuario → OS/XSAS → intención/contexto → capabilities/skills/workflows → engines/tools/integraciones
→ datos y conocimiento ECSAS → ejecución → verificación → respuesta/acción. El Reasoner interviene
sólo cuando lo determinístico no alcanza.

Piezas: gateway XSAS (`servidor-entrante.mjs`, unit `echegaray-xsas-gateway`, sirve
app.ecsas.com.ar/xsas) · orquestador (`orquestador/lib|scripts|comunicacion`) · Sheet «Flujo de
Caja - Cash Flow» regenerado por pipeline (`flujo-caja-rehacer-todo.mjs`, timer cada 2 h) ·
Supabase como fuente única · web por Vercel desde `main` · bot @os en Mattermost.

**Deploy backend = push a origin main + `git merge --ff-only origin/main` en
`~/echegaray-os/produccion/echegaray-os` + `systemctl --user restart` de los 3 units.** Producción
es OTRO checkout: pushear actualiza Vercel pero NO ese árbol, y el timer corre desde ahí.
**Antes de buscar nada: `.claude/MAPA.md`.**

## 4. ESTADO ACTUAL

- **El contrato de minimalismo del Sheet se aplica en el CAMINO DE ESCRITURA, no a mano.**
  `lib/podar-prosa.mjs` poda la grilla GENERADA (nunca la fusionada) en los dos cuellos que comparten
  los generadores: `escribirPreservando` y `conEdicionesRespetadas`. Un canario
  (`podar-prosa-cobertura.test.mjs`) impide que un generador nuevo escriba una pestaña del contrato
  por un camino sin podar. Tres reglas que los tests fijan: se poda lo generado · se poda al
  CENTINELA (`''` significa «no es mi celda», dejaría la prosa intacta) · el encabezado sólo se toca
  cuando la grilla es la pestaña entera.
- **Para lo escrito ANTES de que existiera la huella**: `scripts/reclamar-parrafos-huerfanos.mjs` usa
  `lib/autoria-por-historial.mjs` (`git log -S`) como prueba de autoría, y escribe con `MIA_PROBADA`
  —no con `VACIO`, que la huella sólo obedece si puede probar la propiedad—. Lo que no se puede
  probar queda intacto.
- **Contrato de diseño medido contra el archivo: 104 → 17 desvíos · 7 de 15 pestañas conformes**
  (Tarjeta, Cargas Sociales, Impuestos y Financieros, Recurrentes, Cash Flow Semanal, Calendario de
  Cobros, SUBCONTRATISTAS, Plantel). `node orquestador/scripts/auditar-diseno-unificado.mjs`.
- **Pestañas INTOCABLES por decisión del dueño**: Compras · Cobranzas · CAJA · Cheques Emitidos ·
  Cheques Recibidos. Declaradas en `EXCLUIDAS` de `lib/diseno-unificado.mjs` con su motivo textual.
  Excepción vigente: los GRÁFICOS de CAJA sí se tocan (pedido explícito del 06/09).
- **CAJA y Proveedores quedaron reparadas hoy y verificadas leyendo la hoja viva.** Gráficos en las
  filas 23/38/53 (`caja-graficos-verificar.mjs` da ✓) y `Proveedores ✓ en estándar`.
- **Trampa nueva y cara: las huellas de FORMATO de un layout que ya no existe frenan la piel para
  siempre.** `scripts/olvidar-huella-de-formato.mjs <pestaña> [--todas] --aplicar` las borra. **El
  orden importa**: olvidar → `formato-pestanas.mjs` (ve la pestaña virgen, aplica y siembra) → el
  generador de la pestaña. Al revés el generador siembra primero y el formateador ya no la ve virgen.
- **HF en producción, no en shadow**: Qwen3-4B es el proveedor #1 por volumen (28/28 ok en 4 días,
  contra 21 de Haiku) en `rutear` y `completar-argumentos`. La decisión del dueño sobre visión
  —dejar de mandar `detalle` e `indeterminado` a Opus— está aplicada, reversible entera con
  `XSAS_MIRAR_TODAS_LAS_REGIONES=1`.
- CRM admin: 155 tests canónicos contra `crmadmin.zip` en verde. Papeles del proveedor en el panel.
- Firma por pestaña (ORQ_AUTOCANDADO) sigue APAGADA a propósito. Timer activo — verificarlo, no asumirlo.

## 5. TRABAJO DE ESTA SESIÓN (07/09 tarde)

Siete pedidos del dueño en ráfaga. Lo que quedó:

1. **Extracto bancario cargado** (`importar-banco.mjs --sheet`). 3 movimientos nuevos; `_BANCO_RAW`
   en 556, corte 07/09, saldo **$14.066.088,84** = el declarado por el banco, leído del destino. La
   cadena completa mejoró: el agujero bajó de $455.082,14 a **$45.080,00**.
2. **El botón «ir al día» volvió a A3 de las dos vistas del Cash Flow** (`cc8ee0b8`). Lo había
   borrado `podarProsa`, que vaciaba la fila 3 ENTERA para el aire que pide `sin-respiro`. La
   excepción se define UNA vez —`esAtajoDelPeriodo` en `diseno-unificado.mjs`— y la usan el podador
   y el auditor. Reconoce las dos formas: `=HYPERLINK(…)` del generador y el rótulo ya resuelto al
   medir el archivo. Los dos tests gemelos esperaban '3 · sin-respiro' como desvío; ahora esperan
   CERO y exigen el HYPERLINK, para que un cero conseguido borrando el botón no pase.
3. **Dos facturas de honorarios del mail → Compras** (filas 951–952, verificadas sin #ERROR):
   Robles Jose Maria FC 00001-00000211 $696.502,61 y MASS CONSULTORA FC 00001-00000067 $250.000.
   Fecha prevista de pago **11/09/2026** escrita con bisturí en Q951:R952 (Q es VALOR en esta
   pestaña, no fórmula: el copyPaste del cargador les deja el texto «Pendiente»).
   D'Amico NO era proveedor nuevo: ya existía como MASS CONSULTORA, su razón social.
4. **Filtros de admin** (`61bb1a6b`). Compras: 10 criterios combinables en `comprasFiltros.ts` (puro,
   12 tests) que conviven con los chips —el chip decide la población, los criterios la recortan—.
   Proveedores: rubro (con `rubroDe`, porque ninguno tiene rubro DECLARADO y 18 lo tienen deducido)
   y deuda, que ahora es un concepto del OS: vista `proveedor_deuda`, aplicada y verificada.
5. **`compra_sheet` sincronizada** (949 filas). El timer `echegaray-compras-sync` ya corre cada hora.

## 6. PENDIENTES REALES

**P0 — decisión del dueño, no arranca solo**
- **ARCA SYNC CAÍDO DESDE EL 01/09.** `echegaray-arca-sync.service` FAILED: no hay `ACCESS_TOKEN` de
  AfipSDK en `~/.config/echegaray-orq/worker.env` (el 24/08 todavía funcionaba). Falla cerrado, bien,
  pero `comprobante_compra` quedó congelada en el 21/08 con 653 filas. **Bloquea el pedido de «todos
  los gastos al día»**: la pestaña sí está al día, el libro fiscal no. Reponer el token.
- **El cheque ECHEQ 277 a «DUBOS UGARTE PEDRO LUIS RAUL» ($1.002.330,73, FA 03-000242, emitido
  4/12/2025, vence 22/01/2026).** El dueño pidió darle tratamiento en Compras. NO se cargó, y el
  motivo es dato, no pereza: DUBOS = DUPEC está PROBADO (mismo CUIT 20-28773782-4 en las 4 filas de
  Cheques Emitidos), pero ese CUIT sólo emite desde los puntos de venta **11 y 9** en ARCA — nunca 03
  —, no hay ninguna compra de ese importe en la pestaña, y la factura sería de 2025, fuera del
  ejercicio que cubren Compras y el Libro IVA. Falta la factura o el número correcto.
- **$14.294.688,31 de deuda SIN ACREEDOR en el maestro.** La pestaña declara $19.164.815,70 de saldo
  vivo; `proveedor_deuda` llega a $4.870.127,39. La diferencia son cuatro textos no vinculados:
  PEDRO TELLO $8,65M (4) · Pedro Fredes $5,2M (5) · Sersolin SAS $376.890,80 · RSV $67.797,51. Se
  arregla vinculándolos en la cola de resolución de nombres.
- **¿La base del IVA va por «Fecha de Factura» (col P) o «Fecha de Venta» (col C)?** La base
  declarada de las DDJJ de marzo ($78.349.586,76) y mayo ($20.000.000) coincide AL CENTAVO con la
  columna C, no con la P. Hoy se usa P. Si la respuesta es C, cambia una sola constante
  (`VENTA.fecha` en `lib/impuestos-base-libro.mjs`).
- **DDJJ de IVA de agosto SIN PRESENTAR**, vencía el 20/08.
- Los 31 párrafos que el bisturí dejó intactos (no se pudo probar autoría): si alguno es residuo mío
  y no del dueño, hay que señalarlo para sacarlo.

**P1 — técnicos**
- **Push pendiente: 6 commits sin subir** (hasta `61bb1a6b`). Pushear + `git merge --ff-only
  origin/main` en `~/echegaray-os/produccion/echegaray-os` + reiniciar los 3 units. NO en rojo.
- Las dos pantallas de admin NO se miraron con un navegador: typecheck, eslint y los tests puros
  están en verde, pero nadie vio los filtros dibujados. `qa-visual` sobre /administracion/compras y
  /administracion/proveedores, autenticado.
- 17 desvíos del contrato: Proveedores 9 (arriba de la fila 157, territorio de las dinámicas, que ese
  generador no escribe) · Jornales 2 · Nómina 2 · Estructura 1 · Materiales 1 · OBRAS 1 · CF Mensual 1.
- El pipeline `echegaray-flujo-caja` termina en FAILED desde el 3/09 por `▲ $171.314 salen por un
  medio de pago que no tiene columna` (21 filas de Compras sin fecha de caja — se arregla llenando
  celdas, decisión del dueño).
- 13 filas con comprobante repetido ($6.502.878): pago en tramos vs carga duplicada — criterio del dueño.
- La cadena de saldos del banco no cierra por $455.082,14 (`scripts/auditar-saldo-banco.mjs`).
- `E45:E61` de OBRAS (17 celdas) bloqueado: el guard que lo destraba, fallando cerrado, borraría un
  plan de $145M. Necesita firma del dueño.
- HF: el volante junta 0 ejemplos (820 filas esperando, 0 correcciones humanas en toda su historia);
  `elegir-herramienta` habilitada pero sin tráfico — el bucle de especialistas corre sobre
  `engines/anthropic-api.mjs`, fuera del gateway.

**P2**
- Cotizador: cotizar un plano NUEVO desde el navegador (único circuito sin probar).
- La Estrella: que Rodrigo confirme si los pagos en efectivo de `CONTROL DE GASTOS` ya están
  facturados — traba decidir si esos $25.141.687 suman o duplican.

## 7. ESTADO GIT

- Rama: `main` · HEAD `61bb1a6b` · **ahead 6 de `origin/main`** · árbol limpio.
- Producción sigue en `55b8c421`: nada de esto está desplegado.

## 8. PRÓXIMO PASO

Mirar las dos pantallas de admin con `qa-visual` (autenticado), y si están bien: pushear los 6
commits, actualizar producción y reiniciar `echegaray-comunicacion-ws`, `echegaray-xsas-gateway`,
`echegaray-asistencia-http`. En paralelo, el dueño tiene que reponer el token de AfipSDK.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.** No leer
transcripts viejos, no explorar todo el repo, no auditorías generales por defecto. Mantener este
archivo CHICO: lo permanente vive en docs/, MAPA.md o la memoria, no acá.
