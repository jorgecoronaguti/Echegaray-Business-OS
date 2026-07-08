---
name: programa-ejecucion-continua
description: Arquitectura permanente aprobada tras cerrar O1-B→...→Login — Track A (cobertura integral 0-10) + Track B (autonomía progresiva del Operador Digital), ejecutado en olas. Reemplaza la idea de "elegir entre A o B" por un programa continuo ordenado por impacto/dependencia/riesgo.
metadata:
  type: project
---

Fecha: 2026-07-08. Aprobado como marco permanente del proyecto (no un incremento más) tras el Marco de Madurez y Operador Digital entregado como artifact.

## Principio central

Cobertura integral (Track A) y autonomía progresiva (Track B) avanzan **en paralelo**, no como alternativas. Ver [[arquitectura-cobertura-integral]] (el artifact original con la escala 0-10 y las 22 dimensiones) para el detalle completo — este archivo documenta la ejecución real, no repite la arquitectura.

Ejecución en olas, no un mega-PR: **OLA 0** (quick wins no controversiales) → **OLA 1** (confiabilidad y observación) → **OLA 2** (primer operador proactivo) → **OLA 3** (cobertura mínima 0-1) → **OLA 4+** (profundización continua).

## OLA 0 — Seguridad inmediata (completada, 2026-07-08)

- **Backup/PITR de Supabase**: verificado con evidencia real de Postgres (no asumido por capability del proveedor). `wal_level=logical`, `archive_mode=on`, `archive_command` usa `wal-g` (herramienta estándar de backup físico continuo de Supabase), `pg_stat_archiver` muestra 93 WALs archivados sin fallos, el último a minutos de la verificación. Esto confirma que el archivado físico continuo está activo — **no** confirma (no es visible por SQL) el plan/tier exacto, la ventana de retención, ni que una restauración real se haya probado alguna vez. Eso queda como gap explícito, verificable solo desde el Dashboard de Supabase (fuera del alcance de las tools MCP disponibles).
- **HH real de Pisos**: ver [[o1-a-obra-piloto-base-operacional]] — 681h reales cargadas desde JORNALES con huecos de reconciliación documentados, no inventados.

## OLA 1 — Confiabilidad y observación (completada, 2026-07-08)

- **Scorecard vivo**: tabla `scorecard_dominios` (22 filas, escala 0-10) + página `/scorecard`. Reemplaza el documento estático como fuente de "qué dominio puede avanzar ahora" — ver [[scorecard-madurez]] (ahora marcado como superseded).
- **Catálogo de preguntas de negocio**: tabla `preguntas_negocio` (18 filas: 9 confiables, 2 parciales, 7 no confiables) + página `/preguntas-negocio`. Convierte las secciones G/H del Marco de Madurez en datos vivos.
- **Tests de negocio reales**: `tests/negocio-casos-reales.spec.ts` — valida 2 preguntas ya declaradas confiables contra valores reales ya verificados independientemente (margen Galpones $40.578.428,25 / desvío 23,2% exacto contra el cálculo manual de Jorge; HH real de Pisos 681h / HH estimada 4047 / avance 58% / tendencia atrasado). No son snapshots arbitrarios — son casos con evidencia externa ya validada en O1-A.
- **Motor de Confianza transversal (B1)**: `DatoTrazado`/`NaturalezaDato` migrado de `features/actividades-semanales` a `src/shared/types/datoTrazado.ts`. Se extendió el vocabulario con `confirmado`/`conciliado`/`conflictivo` (antes solo observado/calculado/estimado/inferido/sin_dato) para casos futuros, sin romper ningún uso existente.
- **Motor de Observación v1 (B4)**: decisión de diseño explícita — `AlertaDashboard` (dashboard de Dirección) YA ERA la forma común de observación del OS; en vez de crear una segunda estructura paralela ("Observacion"), se la generalizó agregándole `fuente`, `confianza` (`NaturalezaDato`), `materialidad` y `skillsRelevantes` (mapeados por categoría contra la matriz multidisciplinaria del CLAUDE.md raíz). Se dividió el tipo en `AlertaDashboardBase` (lo que cada `mapX` construye) + `AlertaDashboard` (enriquecido en un único punto, `enriquecerObservacion`, dentro de `construirAlertasDashboard`) para no tocar los 10+ sitios que ya construían alertas.

## Reglas de autonomía aplicadas durante la ejecución

Se avanzó sin pedir aprobación en cada paso porque todos los cambios de OLA 0/1 son reversibles, no borran datos, no cambian criterios económicos materiales y no tocan permisos — exactamente el criterio que el usuario fijó como umbral de autonomía. `typecheck`, `lint` y la suite completa de Playwright (42 tests, 41 passed + 1 skip ya documentado) se corrieron después de cada cambio estructural.

## OLA 2 — Primer operador proactivo (completada, 2026-07-08)

- **Backlog Autónomo (punto 6)**: tabla `backlog_autonomo` (13 items reales, no inventados: backup/PITR sin validar del todo, jefe_obra sin acotar a su obra, 10 tablas sin RLS diferenciada, compras sin uso real, pipeline comercial en nivel 1, seguridad e higiene en nivel 0, aprendizaje de Galpones sin aplicar, anomalía real de cuadrilla de Pisos, y un hallazgo de flakiness de tests) + página `/backlog-autonomo` + conversión a `acciones` reutilizando `alerta_origen_id` (mismo mecanismo que las alertas del dashboard, cero duplicación del Centro de Acción).
- **Motor de Decisiones v1 (B5)**: `construirAnalisisMultidisciplinario` arma HECHO→CONTEXTO→CAUSA→IMPACTOS (operativo/económico/financiero/contractual, aplicables según categoría de alerta)→RIESGO→ALTERNATIVAS→RECOMENDACIÓN→CONFIANZA→ACCIÓN a partir de una `AlertaDashboard` ya calculada — reglas + datos ya estructurados, "la solución más simple que funcione" (sin orquestación de LLM). Página `/motor-decisiones`. **Probado contra los 4 casos reales exactos que pidió el usuario**, todos confirmados en vivo con la cuenta de prueba real: déficit de caja de 3 semanas reales, concentración de cliente La Estrella (Alimentos del Sur SAS), concentración anormal de HH de Pisos (412hs semana 06-22 vs. 227hs promedio — disparada por la propia carga de HH de OLA 0.2, sin cablear nada a mano) y margen crítico de Galpones ($30.838.420 de desvío, exacto).
- **Rutinas Proactivas on-demand (B7)**: página `/rutinas` — "qué mostraría la rutina si corriera ahora", agrupando alertas ya calculadas en diaria (caja/vencimientos/acciones vencidas) y semanal (obra/HH/exposición financiera/control económico/ejecución financiera/riesgo operación-finanzas/backlog prioritario). Deliberadamente **no** se automatizó la ejecución real (que corra sola sin abrir la página) porque eso es una decisión de infraestructura (Vercel Cron / Supabase pg_cron / externo), no solo de código — queda registrado como el próximo paso en `backlog_autonomo`.

### Bug real encontrado y corregido en esta ola

Las 3 tablas nuevas de OLA 1 (`scorecard_dominios`, `preguntas_negocio`) y la nueva de OLA 2 (`backlog_autonomo`) tenían RLS correcta pero **sin el GRANT base a `authenticated`** — Postgres deniega el acceso antes de evaluar la policy si falta el grant. Lo encontró un test real (`tests/backlog-autonomo-conversion.spec.ts`), no una revisión manual. Corregido con `grant select, insert, update, delete ... to authenticated`, mismo patrón que ya usan `acciones`/`actividades_semanales`.

## Dependencia transversal resuelta — Continuidad Operacional de Datos (2026-07-08)

Antes de OLA 3, se ejecutó un descubrimiento exhaustivo del universo documental real (carpeta `administracion` de Drive) y se construyó `fuentes_datos` (registro vivo de frescura/cobertura) conectado al Motor de Decisiones. Ver [[continuidad-operacional-datos]] para el detalle completo — incluye 2 de los dominios objetivo de OLA 3 (Fiscal, Equipos y Vehículos) ya avanzados con datos reales (0-1 → 2) como efecto directo del descubrimiento.

## Próximo paso natural

OLA 3 (cobertura mínima de dominios en nivel 0-1: Comercial, Personas, Laboral, Seguridad e Higiene, Legal y Contractual) — priorizar por evidencia real de impacto/dependencia, no por orden arbitrario. El primer paso concreto ya identificado: explorar ALTAS-BAJAS-HM-EPP-DNI en profundidad (Personas/Seguridad e Higiene). Sigue pendiente la única pregunta que no se puede inferir: confirmar con Jorge si Pipeline Comercial es hoy el cuello de botella real antes de construir cualquier estructura (regla de oro del CLAUDE.md raíz).
