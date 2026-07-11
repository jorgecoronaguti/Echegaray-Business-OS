# Work Fabric — Registro durable de progreso

Fuente de verdad del estado del build del núcleo autónomo. Se actualiza después
de cada unidad lógica. Decisiones ratificadas: D1–D7 (ver blueprint / CLAUDE.md).

Rama de trabajo: `orquestador/work-fabric`. **Sin push** (política de autonomía).

---

## FASE 0 — Seguridad y Fundación ✅ COMPLETA

**Objetivo**: contratos, identidad, ejes reservados, máquina de estados, Policy
Engine, capacidades tipadas, eventos append-only + Transactional Outbox,
config validada, secretos, logs estructurados, docs.

### Entregado
- Migración `supabase/migrations/20260711120000_orq_fundacion_work_fabric.sql`
  (schema `orq`, 100% aditiva, aislada de `public`):
  - Identidad/ejes (D4): `orq.tenants`, `orq.projects`, `orq.repositories`,
    `orq.principals` (kind human/agent/system, clearance A–F).
  - Autonomía (D5): `orq.autonomy_levels` (A–F), `orq.capabilities` (23 caps que
    codifican la política de autonomía ratificada como datos),
    `orq.policy_decide()` → auto/requires_approval/forbidden (función pura).
  - Máquina de estados (D7): `orq.task_states` (16), `orq.task_transitions` (34),
    `orq.transition_allowed()`.
  - Eventos/Outbox (D1/C2): `orq.events` append-only (trigger bloquea update/
    delete), polimórfico (subject_type/subject_id), `correlation_id`/
    `causation_id`, `orq.emit_event()`.
  - RLS + grants (patrón del proyecto: authenticated lee, service_role opera).
  - Seeds: tenant `echegaray`, project/repo `echegaray-os`, principal `system`.
- Rollback: `orquestador/db/rollback/0000_orq_fundacion_down.sql`.
- Fundación Node (`orquestador/lib/`): `config` (zod, fail-fast, secretos por
  entorno), `logger` (JSON estructurado + redacción de secretos), `db` (pg,
  portable, `withTx` = base del outbox), `identity` (resuelve ejes), `events`.
- Self-check: `orquestador/scripts/selfcheck-f0.mjs`.
- Dep nueva: `pg` (justificada: PostgREST no hace SKIP LOCKED ni tx de sesión).
- Docs: `orquestador/README.md`. `.env.local.example` extendido.

### Pruebas ejecutadas (evidencia)
- Migración aplica limpio en Postgres 16 (docker). ✅
- Seeds correctos: 1 tenant / 1 project / 1 repo / 1 principal / 23 caps /
  6 levels / 16 states / 34 transitions. ✅
- `policy_decide`: A→auto, C→auto (system clearance D), E→requires_approval,
  F→forbidden; principal clearance A → C escala a requires_approval. ✅
- Transiciones válidas/ inválidas correctas. ✅
- Append-only: update y delete sobre `orq.events` rechazados por trigger. ✅
- Reversibilidad: drop cascade → re-apply limpio (23 caps). ✅
- Self-check Node: fail-fast sin `DATABASE_URL`; con DB: config/redacción/
  conexión/contexto/policy/outbox OK. ✅

### Decisiones
- `orq` es schema propio (no toca `public`); referencia lo existente por
  patrón polimórfico. Elegido sobre columnas inline en `backlog_autonomo`/
  `acciones` para no mezclar detección/seguimiento con ejecución.
- Worker usa `pg` (no supabase-js) por D2 (portable) + necesidad de SKIP LOCKED.
- Política de autonomía vive como DATOS en `orq.capabilities`, no en código.

### Riesgos / pendientes
- Aplicar F0 a Supabase prod: pendiente (requiere `DATABASE_URL` del pooler
  real; dentro de política automática por ser aditiva/reversible/validada).
- Exponer `orq` a PostgREST para la UI (Fase 5): decisión diferida (vistas en
  `public` vs. exposed schema).

---

## FASE 1 — Work Ledger y Worker durable ⏳ EN CURSO
## FASE 2 — Executor real (Engine/Runner + Claude CLI) ⬜
## FASE 3 — Planner, Router y Agentes ⬜
## FASE 4 — Review, Recovery y Aprendizaje ⬜
## FASE 5 — Human Control y Observabilidad ⬜
## FASE 6 — Operación remota 24×7 (systemd) ⬜
## FASE 7 — Intake e integraciones ⬜

---

### Siguiente acción
Fase 1: capa satélite `orq.tasks` + `orq.task_attempts` + funciones de claim
(`FOR UPDATE SKIP LOCKED`), leases/visibility-timeout, reintentos/backoff/
dead-letter, y el worker Node (`--once` / daemon, health, heartbeat, handler
no-op). Validar concurrencia con dos workers sobre la misma tarea.
