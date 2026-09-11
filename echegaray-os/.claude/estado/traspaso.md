# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-11 ~12:50 (hora local −03) · main = producción_

## 1. OBJETIVO GENERAL

Echegaray Business OS es el sistema operativo digital de Echegaray Construcciones. Integra
aplicación web (Next.js + Supabase), datos, automatizaciones, motores determinísticos e IA para que
Dirección y la empresa operen desde una única plataforma. XSAS es la capa de inteligencia operativa
del OS: el usuario trabaja desde la app con lenguaje natural, interfaces y archivos, sin conocer
tablas, skills ni código.

Claude Code NO es la interfaz operativa del negocio: se usa únicamente para desarrollar, corregir,
probar y evolucionar el OS y XSAS.

## 2. PRINCIPIOS INVARIANTES

- Obra como eje central · una fuente de verdad por concepto (Postgres cuando lo consumen varias caras)
- Plan vs Real vs Forecast · P&L devengado · Cash Flow percibido · nunca mezclar ventanas de tiempo
- Datos y evidencia antes que inferencia · no inventar · FALTA_DATO cuando falta evidencia · CONFLICTO cuando las fuentes se contradicen
- Preservar genealogía/provenance · edición manual del dueño = verdad definitiva
- Acciones sensibles: autorización + RBAC + auditoría + verificación (Nivel E = firma humana)
- Deterministic first · skills/capabilities/tools first · Reasoner/LLM sólo cuando aporte valor real
- Reutilizar motores/datos/capacidades existentes antes de crear otros
- Minimizar llamadas, tokens, costo y complejidad — el límite semanal de Claude Code es recurso escaso
- UX simple, compacta, operativa · less is more · minimalismo extremo en el Sheet (sin aclaraciones)
- Conocimiento y experiencia real ECSAS priman sobre generalizaciones externas
- Nadie cierra su propio trabajo · evidencia del EFECTO, no del intento
- Asistencia: presencia es un estado, nunca se deduce de horas. Ausencia sin motivo = 0 h; con motivo
  que paga = jornada (9 h L–J, 8 h V). Un día nunca suma dos veces.
- Padrón: quien no está en la quincena en curso es inactivo; NUNCA dar de alta ni de baja personas.
- Compras · Cobranzas · CAJA · Cheques Emitidos/Recibidos: el OS no las edita salvo (a) el cargador de
  comprobantes de proveedores en Compras, (b) `cheques-emitidos-sync-banco --forzar-candado`, (c) una
  orden explícita del dueño para celdas concretas (10/09: Cobranzas M32, fila 55, W99/W100).
- **Cargas sociales / gremiales (UOCRA, IERIC, FODECO, FCL) NUNCA van a Compras** (dueño 10/09; se
  revirtió una carga). Dónde se registra su pago fuera de Compras está pendiente de decisión.

## 3. ARQUITECTURA CONCEPTUAL

Usuario → OS/XSAS → intención/contexto → capabilities/skills/workflows → engines/tools/integraciones
→ datos y conocimiento ECSAS → ejecución → verificación → respuesta/acción. El Reasoner interviene
sólo cuando lo determinístico no alcanza.

Piezas: web por Vercel desde `main` (app.ecsas.com.ar) · Supabase fuente única (RLS ≠ GRANT; toda
columna nueva necesita GRANT; PostgREST corta en 1.000 filas sin error → leer paginado) · orquestador
(`orquestador/lib|scripts|comunicacion|handlers`) con timers de usuario (flujo-caja cada 2 h a las
:50, compras-sync, gmail-ordenes cada 6 h —dos casillas—, gmail-transferencias, arca-sync,
drive-index cada 6 h, asistencia-obra) · Sheet «Flujo de Caja - Cash Flow» regenerado por pipeline
(`_MOVIMIENTOS` única fuente de los Cash Flow) · bot @os en Mattermost (worker + ws) · gateway XSAS.

**Deploy backend = push a origin main + `git -C ~/echegaray-os/produccion/echegaray-os pull --ff-only
origin main` (fuera de una corrida del pipeline) + restart de `echegaray-comunicacion-worker/ws` si
cambió el bot.** Código siempre en worktree bajo `~/echegaray-os/worktrees/` (symlink de
`node_modules`; `next dev/build` con `--webpack`: turbopack rechaza el symlink). Sheet real NUNCA
desde un worktree; migraciones sólo desde la sesión principal (`aplicar-migracion.mjs <archivo>`
ensayo, `--aplicar`). Playwright anda sin root con las libs del scratchpad (`libs/lp.txt` →
`LD_LIBRARY_PATH`) y `NODE_PATH=<proyecto>/node_modules`; login de prueba en memoria
`qa-visual-sin-root`. **Antes de buscar nada: `.claude/MAPA.md`.**

## 4. ESTADO ACTUAL (10/09 17:05)

- ## 4. ESTADO ACTUAL (11/09 08:50)

- **Producción** (Vercel + Supabase): main 1fe49942 = cartera de cinco columnas (Cliente · Contratado · Materiales · Mano de obra · Avance de cobro), contrato desglosado (obra_contrato, migraciones 0900/0910/0930/0940 aplicadas), respaldo de cobranzas (0920), solapa Órdenes. Verificado en producción 09:40: Quattropani $ 139.413.923 y 65 % en lista, ficha y panel; 3 respaldos con enlace en Cobranzas de Messina; Órdenes con 9 grupos. Dos auditorías previas rechazaron y se corrigieron sus 12 hallazgos; la firma final queda pendiente de una tercera lectura sobre producción.
- **Supabase**: CAÍDO para el proyecto desde ~09:20 (Auth 504 en 5 s, REST sin respuesta, pool de la base sin conexiones); incidente mayor «Unresponsive Projects» en monitoreo. Vercel devolvía 504 MIDDLEWARE_INVOCATION_TIMEOUT en todo. Publicado a739f450: middleware con `fetchConTope` (6 s) y página 503 propia que se reintenta sola; rutas públicas pasan. Detenidos orq:test y 17 chromium de agentes durante el incidente (regla: una corrida por VM, nunca contra base degradada).
- **Pipeline Flujo de Caja**: el libro `_MOVIMIENTOS` no corría desde 10/09 17:01 (`chequesPorCompras is not defined`, commit b316b907); corregido en dcd4a3f8 y en producción 08:05. Corrida 08:50 pendiente de verificar (agente consistencia).
- **Sheet Cobranzas**: verificado 07:56 celda por celda; nada pisado (Messina 34/69/102, Quattropani 78/101, ARCOR 51/52/59).
- **Base canónica nueva**: `public.obra_contrato` (migración 20260911T0900) + datos de 8 obras (0910): Quattropani MO U$S 63.000 + materiales $44.110.169,31 (contrato docx 1glixkTWr5HDDKdzsniqoBJLZias5DLn9); 7 obras Messina/SF 100 % MO con cita de la cotización; BSA sin desglose (no se inventa). `cobranza_comprobante` (0920, en rama, SIN aplicar) ata la nota de Rodrigo a las filas 34/69/102.

## 5. TRABAJO DE ESTA SESIÓN

11:00–11:10: la VM llegó a carga 27–31 con cuatro agentes en paralelo (eslint ., tests, 3 next dev): se cayó el websocket del bot y Mattermost (corre en esta VM, puerto 8065), el guardia del pipeline de las 10:50 falló por ETIMEDOUT («No ejecuté un solo generador», próxima 12:50) y la sesión murió dos veces. Se mataron los procesos; carga 1. REGLA NUEVA (memoria vm-saturada-por-agentes-tumba-el-chat): un agente pesado a la vez, nice 19, lint/tests dirigidos, dev server efímero.

Frentes del 11/09 — TODOS PUBLICADOS: Liquidación/Horas 8c239766 · Cobranzas UX e9ae7a1a · DB (RPC una pasada, migración 1030) 28fe9041 · velocidad frontend (staleTimes 60 s: 4 vueltas de 4 renders/35,0 s a 0/0,39 s en producción; loading.tsx en 3 secciones) 83c01119 · middleware con tope a739f450 · caja/acreditación c981af53 · cartera 81b60e37/df9e2cf5 · IERIC c8ddc0f5 · libro dcd4a3f8. Caja VERIFICADA tras la corrida manual 12:17–12:40: CAJA!A3 79,5 M → 40.948.755; Santander 41,56 M → 2.988.683 (declarado − retenido); «⏳ Retenido» 38.572.526,23; CFM!M50 91,9 M → 53.134.890 = CFS!BB50 al peso; Estructura!O16 0; CFM!N46 +7.147.930 y cierra con Cheques Emitidos!B23 a 3 centavos. Post al dueño yroxodw85jg98f3qxqqwcmypih. ABIERTO cosmético: Tarjeta!L2/L23 «al 24/7/2026» — tarjeta-pestana.mjs repone el sello viejo 29 s después de que cheques-cobertura lo vacía; el arreglo va en tarjeta-pestana.mjs (dueño del ancho; sellosViejos sólo arriba de filaCab).

Siguientes hitos (P1, con número): (a) `pantalla_cliente(p_slug)` se vuelve a pagar entero en cada cambio de solapa (Cobranzas 2,8 s en frío, hasta 29 s bajo carga) → la solapa debe leer sólo su consulta o la RPC debe cachearse por request; (b) /obras/[obra] 15 viajes (2,2→30 s) y /presupuestos (0,6→56 s): varianza ×95 de la base → RPC por pantalla; (c) Personal/Horas ~25 consultas por render (persona_legajo ×3, liquidacion_quincena ×3) → deduplicar; (d) Cargas Sociales «2 · PAGADO» sigue leyendo Compras; (e) orq:test con 11 archivos rojos en main (frente propio); (f) canario de tipo_cambio; (g) blur de la celda de Horas sin test; (h) UX por flujo/mobile/XSAS-contexto/HF con consumidor real (mandato 11/09, P2–P3).

## 6. PENDIENTES REALES

**P0 (agentes en curso)**
- Backend/DB Pareto (perf/base-de-datos, wt-db): baseline pg_stat_statements + traza por pantalla; índices, RPC por pantalla (/obras/[obra], /obras, personas, proveedores, compras), select *, RLS costosa. Mandato integral del dueño guardado en memoria (mandato-optimizacion-integral-1109).
- Velocidad de navegación (perf/navegacion, wt-perf): medir recorrido completo en producción cuando Supabase vuelva; loading.tsx/streaming, staleTimes, dedupe perfil, una RPC por pantalla.
- Caja: depósitos pendientes de acreditación ($38,57 M del 10/09) no son disponibles → agente consistencia corrige saldo Santander = declarado − pendientes, y `cerrarElDia()` de importar-banco.mjs; el cierre CFM 91,9 M debe volver a ~53,3 M. Post del puente al dueño: 8sctp1uekib9zxqyn4qezsebne.
- IERIC/FODECO 08-2026: HECHO (c8ddc0f5). PDFs en Drive archivo-fiscal/2026/IERIC (1fg1q9D5tUZNeQRzegeTFcd35cG7MBSN0, 1XwCE7A3036pZJLK3BfjthyjZRNM15rQ2) + drive_index; apareo bancario IERIC/FODECO por boleta (cargas-boletas-ieric.mjs) listo para el próximo extracto. Pendiente hito: cuadro «2 · PAGADO» de Cargas Sociales sigue leyendo Compras (0 desde septiembre); lectura de boletas +40 s por corrida (cachear en Postgres si molesta).
- Cartera v5: publicada y auditada tres veces; la tercera (sobre producción) marcó suma viva/discrepancia/ficha neto-neto → corregido en 81b60e37 + df9e2cf5. Quedan: H3 ficha /clientes/quattropani 10–30 s (frentes de velocidad), H6 `tipo_cambio` sólo tiene filas 10 y 11/09 y `tc_vigente()` no grita si el sync se congela (agregar canario), H7 el canónico 25 prueba fuente y no render (E2E dirigido pendiente). Solapa Órdenes sin probar con rol de campo.
- Liquidación/Horas: PUBLICADO 8c239766 (celda de Horas editable en línea, panel derecho rehecho, registros_hh paginado —PostgREST cortaba en db-max-rows sin error—, ZZ-E2E fuera y 8 h fabricadas borradas). Pendientes declarados: blur sin test, ~25 consultas por render (persona_legajo ×3, liquidacion_quincena ×3 → deduplicar, siguiente hito), capa fósil BloqueLiquidacion/CuadroLiquidacion, orq:test con 11 archivos rojos en main (frente propio).
- Consistencia Flujo de Fondos: 5 fixes publicados (817bb501: cuotas en cheque con rubro «Cheques emitidos», Estructura proyectado ≥ 0, sello Tarjeta L2/L23, impuesto al cheque y f136 ya en el libro). Pendiente: verificar corrida 10:50, post al dueño con el PUENTE 61,3 M → 91 M del cierre CFM (pedido 09:25) — sospecha: e-cheq $38,57 M del 10/09 contados como caja disponible.
- Extracto bancario: HECHO (4 movimientos nuevos, saldo coincide, ECHEQ 308 marcado DEBITADO, ref 88958840 excluida por decisión). Pendiente del dueño: e-cheq $38,5 M del 10/09 ¿disponibles?; `public.cheques` con corte 08/09; clasificación CUIL-padrón vs proveedor. Defecto sin corregir: `cerrarElDia()` en importar-banco.mjs no llama acreditarPendientes() sin el pie «Saldo al…».
- Solapa Cobranzas UX: rehacer por completo (pedido 11/09 08:45).

**P1 (decisiones del dueño, listar por bot cuando cierre lo anterior)**
- Bases tanque SO2 fila 31 $6.700.000 sin respaldo · F68 Q 08/09→12/09 (+$102.474) · OC 2135 pedir a Isabel Villanueva · Compras 9 «Pagado» con cheque sin debitar · Jornales!M26 «Pagado el 01/07/2026» · Nómina liquidada al 09/09 · accesos portal Messina/La Estrella/ARCOR · obras ARCOR a dar de alta · Saldo obras San Francisco $47,6 M a repartir · BSA sin desglose MO/materiales · Dilución de ácido «solo MO» es inferencia (confirmar con Rodrigo) · contrato Quattropani cláusula 2 dice 48,2 M en letras y 44.110.169,31 en número · materiales Quattropani: cobrado 36,45 M de 44,11 M (falta 7,66 M o se pagó por otra vía).

**P2**
- `ver.mjs` de /tmp/claude-1001/cobranzas-1009 lee dump-completo.json (15:29 del 10/09): usar dump-final.json (dump.mjs escribe ahí). Casi causó una falsa alarma.
- Agentes pisaron `q.mjs` del scratchpad: usar `qq-privado.mjs` y no dar esa ruta a agentes.
- Balanz chromium (pid 940034) sigue vivo; el dueño pidió cerrarlo; kill falló ayer.
- Archivos sueltos de un agente en main: `scratchpad-tmp-fetch.mjs`, `scratchpad-tmp-list.mjs` (borrar).
- hydration warning en /clientes del dev server del worktree (verificar en producción).

## 7. ESTADO GIT

- main: 1f8f13f0 + merges de hoy (dcd4a3f8 libro; 362b2b28 solapa Órdenes; de587ff5/0910 obra_contrato).
- `fix/crm-barra-unica` (wt-crm): 161800f1 cartera v5 · a908fdc6 cobranza_comprobante — en auditoría.
- `fix/liquidacion-editable-y-panel` (wt-liq): agente retomado.
- `feat/cobranzas-cliente-ux` (wt-cob): recién nace.
- Worktrees viejos de sesiones anteriores: decenas en .claude/worktrees (higiene pendiente).

## 8. PRÓXIMO PASO

1. Recibir el veredicto del auditor de la cartera; corregir; merge; `aplicar-migracion.mjs supabase/migrations/20260911T0920_*.sql --aplicar` desde main; push; pull producción; captura de producción.
2. Cerrar los cuatro agentes restantes con evidencia y publicar; después, UN mensaje al dueño por bot con lo publicado y la lista P1.
3. ScheduleWakeup activo mientras haya agentes corriendo (orden del dueño: no dejar de trabajar).

Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.** No leer
transcripts viejos, no explorar todo el repo, no auditorías generales por defecto. Mantener este
archivo CHICO: lo permanente vive en docs/, MAPA.md o la memoria, no acá.
