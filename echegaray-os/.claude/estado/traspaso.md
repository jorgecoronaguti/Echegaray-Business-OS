# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-11 ~09:30 (hora local −03) · main = producción_

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
- **Supabase**: incidente «Unresponsive Projects» (major) hoy 06:19Z→monitoreo; a las 08:2x producción medía /clientes 23 s y a las 08:40 2,2 s. La RPC `pantalla_clientes()` tarda 0,2–1,3 s desde la VM. La lentitud intermitente es del proveedor, no del código.
- **Pipeline Flujo de Caja**: el libro `_MOVIMIENTOS` no corría desde 10/09 17:01 (`chequesPorCompras is not defined`, commit b316b907); corregido en dcd4a3f8 y en producción 08:05. Corrida 08:50 pendiente de verificar (agente consistencia).
- **Sheet Cobranzas**: verificado 07:56 celda por celda; nada pisado (Messina 34/69/102, Quattropani 78/101, ARCOR 51/52/59).
- **Base canónica nueva**: `public.obra_contrato` (migración 20260911T0900) + datos de 8 obras (0910): Quattropani MO U$S 63.000 + materiales $44.110.169,31 (contrato docx 1glixkTWr5HDDKdzsniqoBJLZias5DLn9); 7 obras Messina/SF 100 % MO con cita de la cotización; BSA sin desglose (no se inventa). `cobranza_comprobante` (0920, en rama, SIN aplicar) ata la nota de Rodrigo a las filas 34/69/102.

## 5. TRABAJO DE ESTA SESIÓN

Ver §4. Agentes en curso al cierre: auditor de la cartera v5 · Liquidación (rama fix/liquidacion-editable-y-panel, retomado) · consistencia Flujo de Fondos (informe 10/09 18:35 → resolver) · extracto bancario 13/07–10/09 (/tmp/claude-1001/banco-1109/descargaUltimosMovimientos-47.csv) · UX solapa Cobranzas (rama feat/cobranzas-cliente-ux, nace de fix/crm-barra-unica).

## 6. PENDIENTES REALES

**P0 (agentes en curso)**
- IERIC/FODECO 11/09: dos comprobantes $13.794,56 (trx 889015905659 y 493817674210) en /tmp/claude-1001/ieric-1109 → Drive archivo-fiscal/2026/IERIC + Cargas Sociales; agente en curso.
- Cartera v5: PUBLICADA y verificada; tercera auditoría (sobre producción) en curso; worktree wt-crm eliminado.
- Liquidación: merge y publicación (panel derecho, edición, ZZ-E2E fuera, <4 s).
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
