# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-14 (−03) · main = producción_

## 1. OBJETIVO GENERAL

Echegaray Business OS es el sistema operativo digital de Echegaray Construcciones. Integra app web
(Next.js + Supabase), datos, automatizaciones, motores determinísticos e IA para que Dirección y la
empresa operen desde una única plataforma. XSAS es la capa de inteligencia operativa: el usuario
trabaja desde la app con lenguaje natural, interfaces y archivos, sin conocer tablas, skills ni código.

Claude Code NO es la interfaz operativa del negocio: sólo desarrolla, corrige, prueba y evoluciona el OS y XSAS.

## 2. PRINCIPIOS INVARIANTES

- Obra como eje central · una fuente de verdad por concepto (Postgres si la consumen varias caras)
- Plan vs Real vs Forecast · P&L devengado · Cash Flow percibido · no mezclar ventanas de tiempo
- Evidencia antes que inferencia · no inventar · FALTA_DATO / CONFLICTO explícitos
- Genealogía/provenance · la edición manual del dueño es verdad definitiva
- Acciones sensibles: autorización + RBAC + auditoría + verificación · Nivel E = firma del dueño · nunca debilitar RLS
- Deterministic first · skills/tools first · LLM sólo si aporta valor · reutilizar antes de crear
- Minimizar llamadas, tokens, costo, complejidad · UX simple, compacta · less is more
- Conocimiento real ECSAS prima sobre generalizaciones · nadie cierra su propio trabajo (evidencia del EFECTO)
- Padrón: nunca alta/baja de personas · Compras/Cobranzas/CAJA/Cheques: el OS no las edita salvo cargador de comprobantes, DEBITADO con extracto u orden del dueño · cargas sociales nunca a Compras
- Sheet real nunca desde un worktree · nunca correr el pipeline/generadores «para ver si anda»

## 3. ARQUITECTURA CONCEPTUAL

Usuario → OS/XSAS → intención/contexto → capabilities/skills/workflows → engines/tools/integraciones
→ datos ECSAS → ejecución → verificación → respuesta/acción. Reasoner sólo si lo determinístico no alcanza.

- Web: Vercel desde `main` (app.ecsas.com.ar). Una RPC por pantalla (`pantalla_clientes`, `pantalla_cliente`).
- Supabase (ref jdqbpchkjrxktcxndnho): **Pro + Small 2 GB desde 13/09** (vía Vercel Marketplace). Caída → reiniciar por Management API.
- Ficha del cliente: caché `ficha_cliente_cache` refrescada por pg_cron job 39 (cada minuto, 12 s, cede con >3 activas). Cambios de contenido van a `*_en_vivo` + vaciar la caché.
- HH de obra: vista `hh_que_cuentan_en_obra` = JORNALES + web de jefes de obra en días sin JORNALES. Costo a la fecha: `costo_de_obras_a_la_fecha` (Compras por columna K vía `compra_obra_asignada`).
- Orquestador (`orquestador/`) con timers; bot @os en Mattermost (misma VM). Deploy backend = push + `git -C ~/echegaray-os/produccion/echegaray-os pull --ff-only`.
- Migraciones desde main: `node orquestador/scripts/aplicar-migracion.mjs <f>` (ensayo) y `--aplicar`, antes del push.
- Código en worktree (node_modules por symlink; `next build --webpack`). VM 4 cores/7 GB compartida: un agente pesado a la vez. Mapa: `.claude/MAPA.md`.
- Avisos al dueño: `node orquestador/scripts/avisar-al-dueno.mjs < archivo.md` (DM del bot).

## 4. ESTADO ACTUAL

- **CRM admin (clientes) operativo y firmado por tercero:** cartera y ficha con Materiales/MO a la fecha de todas las obras (activas y cerradas), también a 390 px; desglose HH «Toda la obra» por bloques de JORNALES; Personal→Horas a ancho completo; aviso «Cargando…» corregido.
- Base estable desde el resize (ficha 0,2–0,5 s en vivo). Timer `echegaray-mantener-caliente` APAGADO (daba permission denied).
- Multiplicador de cargas 1,6713: **rechazado contra banco**, falta «Mis Facilidades» ARCA → no presentarlo como hecho.
- `obra_costo_real` (ficha de OBRA, módulo obras) atribuye Compras por columna J → difiere del CRM. El dueño pidió no tocar el módulo obras.
- 657/880 compras sin obra asignada: el dueño decide `obra_alias`.
- `contrato_monto` abierto a invoker: lo leen `xsas_obra`/`xsas_actividad`; cerrarlo rompe XSAS.
- Units fallidas preexistentes (no de esta tanda): arca-sync, avance-sync, balanz-browser, espejos, flujo-caja (vuelve sola 06:50).
- Sin migraciones pendientes conocidas.

## 5. TRABAJO DE ESTA SESIÓN (13–14/09)

- Costo a la fecha por obra en CRM (T1550, T1600, T0100) + fix `sync-compras` (ROLLBACK). Cartera suma todas las obras (`TablaClientes.tsx`, `CeldasDeCosto.tsx`).
- Tres caídas de Postgres por 406 MB → T2100 (refresco liviano) + resize a Small (autorizado por el dueño).
- HH: jefe de obra cuenta en su obra (T2300; Quattropani 458 h / 3 personas); desglose por bloques de JORNALES (T2200, `DesgloseHH.tsx`); `hh-por-obra.pg.test.mjs` 6/6.
- `GrillaHorasQuincena.tsx` sin techo de ancho; `navegacion.ts`/`IndicadorNavegacion.tsx` (`pedidoVigente`, e2e `tests/navegacion-atras.spec.ts`).
- Todo con QA visual de tercero (390/1440) y aviso al dueño por bot. Último commit de producto: 78954967.

## 6. PENDIENTES REALES

**Del dueño (FALTA_DATO):** horas de jefes de obra 08/08–31/08 en JORNALES «Oficina 26» · repartir celda 11/06 = 70 h (Alaniz/Agüero/Rosales). El import horario las toma solo.
**P1** — prueba con rol Jefe de Obra/Campo del CRM · `orq:test` completo no corrido en esta tanda · medición de performance en producción con la VM en silencio (`perf-baseline-web.mjs`).
**P2** — Mis Facilidades ARCA (firma del multiplicador) · datos Santander Ochoa/Castillo (pedir a los trabajadores) · F931 julio falta en `_MOVIMIENTOS` · búsqueda mes en palabras vs número.

## 7. ESTADO GIT

- rama: main (= origin/main) · HEAD al cerrar: 2f59e45a (+ este commit de traspaso) · working tree limpio
- sin ramas ni worktrees pendientes conocidos
- producción: no verificada en este cierre (último deploy conocido: 78954967, en Vercel)

## 8. PRÓXIMO PASO

Correr `orq:test` completo una vez (P1) y, si queda verde, esperar la próxima tarea del dueño; si él cargó las horas faltantes en JORNALES, verificar Quattropani/La Estrella en `hh_de_obra_en_vivo` como Dirección.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO lo necesario (MAPA.md primero) · 6) cambio mínimo correcto · 7) tests dirigidos ·
8) actualizar este handoff al cerrar. No leer conversaciones viejas ni explorar todo el repo.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.**
