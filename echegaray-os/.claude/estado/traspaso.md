# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-11 ~14:50 (hora local −03) · main = producción_

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
- Asistencia: presencia es un estado, nunca se deduce de horas. Padrón: NUNCA dar de alta/baja personas.
- Compras · Cobranzas · CAJA · Cheques: el OS no las edita salvo el cargador de comprobantes, el
  marcado DEBITADO con extracto (`--forzar-candado`) o una orden explícita del dueño por celda.
- Cargas sociales/gremiales (UOCRA, IERIC, FODECO, FCL) NUNCA van a Compras.
- Mandato 11/09 (memoria `mandato-optimizacion-integral-1109`): nada es PRODUCCIÓN sin consumidor
  real verificable; toda mejora = baseline → cambio → deploy → medición posterior; P0 operación
  lenta/inestable → P1 backend/DB → P2 UX → P3 herramientas HF. Nunca debilitar RLS.

## 3. ARQUITECTURA CONCEPTUAL

Usuario → OS/XSAS → intención/contexto → capabilities/skills/workflows → engines/tools/integraciones
→ datos y conocimiento ECSAS → ejecución → verificación → respuesta/acción. El Reasoner interviene
sólo cuando lo determinístico no alcanza.

Piezas: web por Vercel desde `main` (app.ecsas.com.ar; middleware con tope 6 s y página 503
propia) · Supabase fuente única (RLS ≠ GRANT; columna nueva necesita GRANT; PostgREST corta en
1.000 filas sin error; ~800 ms de arranque por conexión → UNA RPC por pantalla: `pantalla_clientes()`,
`pantalla_cliente(p_slug, p_solapa)`, `campanita_atencion()`) · orquestador
(`orquestador/lib|scripts|comunicacion|handlers`) con timers de usuario (flujo-caja cada 2 h a las
:50, compras-sync, gmail-*, arca-sync, drive-index, asistencia-obra) · Sheet «Flujo de Caja - Cash
Flow» regenerado por pipeline (`_MOVIMIENTOS` única fuente de los Cash Flow) · bot @os en Mattermost
(worker + ws; Mattermost corre en ESTA VM, 127.0.0.1:8065) · capa ML en `orquestador/lib/ml/`
(registro + tablero `ml-tablero.mjs`).

**Deploy backend = push a origin main + `git -C ~/echegaray-os/produccion/echegaray-os pull
--ff-only origin main` (fuera de una corrida del pipeline) + restart de
`echegaray-comunicacion-worker/ws` si cambió el bot.** Migraciones: desde main,
`node orquestador/scripts/aplicar-migracion.mjs <archivo>` (ensayo) y `--aplicar` ANTES del push.
Código siempre en worktree (`node_modules` por symlink; `next build --webpack`). Sheet real NUNCA
desde un worktree. **VM 4 cores/7 GB compartida con Mattermost: un agente pesado a la vez, `nice -n
19`, lint/tests dirigidos, `uptime` antes de algo pesado** (con 4 agentes la carga llegó a 31 y tumbó
el chat). **Antes de buscar nada: `.claude/MAPA.md`.**

## 4. ESTADO ACTUAL

- **Producción sana** (verificado 14:37): web responde, Mattermost 200, bot ws/worker activos, carga 0,2.
- **Clientes/CRM**: cartera de cinco columnas con contrato desglosado desde los papeles
  (`public.obra_contrato` → `obra_economia_cartera.contrato_*`), UNA barra por obra, avance neto/neto,
  solapa Órdenes (OC bajo cada obra, OP bajo cada cliente), solapa Cobranzas rediseñada, respaldos de
  cobranza atados por `(cliente_id, sheet_id)`. Migraciones 0900–1200 del 11/09 aplicadas.
- **Personal/Liquidación**: celda de Horas editable en línea, panel rehecho, paginación; blur sin test.
- **Flujo de Caja**: caja verificada tras la corrida 12:17 (CAJA!A3 40.948.755; CFM!M50 53.134.890 =
  CFS!BB50; e-cheq retenidos $38,57 M fuera de disponible). Corrida programada 12:50: success (54/66,
  las 12 ✗ son presentación conocida). Extracto bancario e IERIC/FODECO 08-2026 cargados.
- **Capa ML/HF**: e5-small en producción (indexado documental); reranker cableado al bot pero 0 trazas
  en 90 días; whisper bajó a CANDIDATO (sin consumidor). Nada más de HF hecho.
- **Deuda conocida**: `orq:test` con 11 archivos rojos en main; `tc_vigente()` no grita si
  `tipo_cambio` se congela; 36 worktrees `agent-*` viejos en `.claude/worktrees` (higiene).

## 5. TRABAJO DE ESTA SESIÓN (11/09)

Publicado en main: cartera CRM v5 + contrato desglosado + Órdenes (81b60e37/df9e2cf5), Cobranzas UX
(e9ae7a1a), Liquidación/Horas (8c239766), middleware con tope (a739f450), router cache
`staleTimes.dynamic 60` (83c01119: 4 vueltas 35 s → 0,39 s), DB RPC una pasada + CTE materialized
(28fe9041) y ficha por solapa (13fd3944, migración 1200), libro `_MOVIMIENTOS` (dcd4a3f8), caja
e-cheq retenidos (c981af53), consistencia Sheet (817bb501), sello viejo Tarjeta (fe197722), IERIC
(c8ddc0f5), registro ML whisper→candidato (6bf7d56d). Tests dirigidos por frente; suite ML 166/166.
Decisiones: Maldonado ref 88958840 es devolución (omitir); un agente pesado a la vez en la VM.

## 6. PENDIENTES REALES

**P0** — ninguno bloqueante. Verificar en la próxima corrida del pipeline (:50) que Tarjeta!L2 y L23
quedaron vacías (fe197722 entró después de la corrida 12:50).

**P1**
- `pantalla_obra()` RPC para /obras/[obra] (15 viajes, 2–30 s) y /presupuestos (0,6–56 s).
- Personal/Horas: ~25 consultas por render → deduplicar; test del blur de la celda.
- Cargas Sociales «2 · PAGADO» sigue leyendo Compras (0 desde septiembre).
- `orq:test`: 11 archivos rojos en main. Canario de `tipo_cambio`.
- HF §6/§7 del mandato: herramientas del Hub para construir ECSAS probadas sobre problemas reales
  (adoptar sólo si superan lo existente) e impacto local vs Inference Providers. Un agente lo arrancó
  al cierre en la rama `feat/hf-herramientas` (sin commits; worktree en el scratchpad → `git worktree
  prune`). Entregable exigido: `docs/engineering/HF-INCORPORADO-VS-RECHAZADO-2026-09-11.md`.

**P2** — UX por flujo/mobile/XSAS en contexto de pantalla (mandato P2). Decisiones del dueño a
listar por bot: Bases tanque SO2 $6,7 M sin respaldo · F68 · OC 2135 · Compras «Pagado» con cheques
sin debitar · Jornales!M26 · e-cheq $38,57 M ¿disponibles? · `public.cheques` corte 08/09 · BSA sin
desglose MO/materiales · Dilución de ácido «solo MO» es inferencia.

## 7. ESTADO GIT

- rama: `main` = `origin/main` · HEAD 6bf7d56d (`fix(ml): whisper baja a candidato`).
- working tree: limpio salvo este handoff.
- producción: main desplegado (Vercel) · migraciones hasta 20260911T1200 aplicadas y verificadas.
- rama abierta: `feat/hf-herramientas` en 6bf7d56d, sin commits propios.

## 8. PRÓXIMO PASO

Continuar el hito (b): crear `pantalla_obra(p_slug)` como RPC única para `/obras/[obra]` (patrón de
`pantalla_cliente` en `supabase/migrations/20260911T1200_*.sql`), medir antes/después en producción,
aplicar la migración desde main antes del push.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.** No leer
transcripts viejos, no explorar todo el repo, no auditorías generales por defecto. Mantener este
archivo CHICO: lo permanente vive en docs/, MAPA.md o la memoria, no acá.
