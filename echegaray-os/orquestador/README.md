# Orquestador — Work Fabric (núcleo autónomo del Business OS)

Capa satélite de ejecución 24×7 del Echegaray Business OS. Vive en la VM Ubuntu,
independiente de cualquier sesión interactiva (Claude Code, VS Code, SSH, navegador).

**No reemplaza nada.** Reutiliza y referencia lo existente:
`backlog_autonomo` (detección), `acciones` (seguimiento humano), `pg_cron`
(detección programada), skills, memoria, RLS, `current_rol()`, auditoría,
`operador-digital`, y el patrón de idempotencia `origen_tabla/origen_id`.

## Arquitectura (resumen)

- **Estado + eventos** en el mismo Postgres, schema `orq`, con Transactional
  Outbox (D1). Solo SQL portable (D2).
- **Ejes reservados** desde el día 1: `tenant / project / repository / principal /
  correlation_id / causation_id` (D4).
- **Motor de IA neutral** detrás de un port Engine/Runner (D3): adaptador
  `claude-cli` primero; `noop` para validar el ciclo sin IA.
- **Autonomía gobernada** por Policy Engine + capacidades tipadas (D5). Los
  agentes no escriben dominio con `service_role` de backdoor.
- **Cada agente** es un principal con identidad, clearance y trazabilidad (D6).
- **Coordinación** por estado durable + DAG + eventos; nada en memoria de
  proceso (D7).

## Layout

```
orquestador/
  lib/         config, logger, secrets/redacción, db (pg), identity, events
  scripts/     self-checks y utilidades operativas
  db/rollback/ scripts de rollback de cada migración del Fabric
  systemd/     units de la VM (Fase 6)
  PROGRESO.md  registro durable de avance (fuente de verdad del estado del build)
```

Migraciones SQL del Fabric: `supabase/migrations/2026071112*_orq_*.sql`
(aditivas y reversibles; cada una con su rollback en `db/rollback/`).

## Configuración (variables de entorno)

Secreto (nunca en git; en la VM via systemd `EnvironmentFile`):

- `DATABASE_URL` — Postgres directo. En prod: **session pooler** de Supabase
  (puerto 5432). Fuente local no versionada: `supabase/.temp/pooler-url`.

Opcionales (`ORQ_*`, con defaults sensatos — ver `lib/config.mjs`):

| Variable | Default | Qué controla |
|---|---|---|
| `ORQ_DB_SSL` | `true` | SSL a Postgres (Supabase lo exige) |
| `ORQ_TENANT` / `ORQ_PROJECT` / `ORQ_REPO` | `echegaray` / `echegaray-os` / `echegaray-os` | ejes reservados |
| `ORQ_CONCURRENCY` | `1` | tareas concurrentes por worker |
| `ORQ_POLL_INTERVAL_MS` | `2000` | cadencia de polling de la cola |
| `ORQ_LEASE_SECONDS` | `900` | visibility-timeout del lease |
| `ORQ_HEARTBEAT_MS` | `15000` | latido del lease en ejecución |
| `ORQ_MAX_ATTEMPTS` | `3` | reintentos antes de dead-letter |
| `ORQ_BACKOFF_BASE_MS` | `30000` | base del backoff exponencial |
| `ORQ_WORKSPACES_DIR` | `../orq-workspaces` | worktrees aislados (fuera del repo) |
| `ORQ_ENGINE` | `noop` | motor: `noop` (sin IA) / `claude-cli` |
| `ORQ_LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |

## Validación local (sin tocar prod)

Se valida contra un Postgres efímero en docker:

```bash
docker run -d --name orqpg -e POSTGRES_PASSWORD=orq -e POSTGRES_DB=orqtest \
  -p 55432:5432 postgres:16-alpine
# crear roles authenticated/service_role (los provee Supabase, docker no):
docker exec orqpg psql -U postgres -d orqtest -c \
  "create role authenticated nologin; create role service_role nologin;"
# aplicar la migración F0:
docker exec -i orqpg psql -U postgres -d orqtest \
  < supabase/migrations/20260711120000_orq_fundacion_work_fabric.sql
# self-check de la fundación Node:
DATABASE_URL='postgres://postgres:orq@localhost:55432/orqtest' ORQ_DB_SSL=false \
  node orquestador/scripts/selfcheck-f0.mjs
```

## Política de autonomía (codificada como datos en `orq.capabilities`)

- **Automático**: leer/analizar, planificar, documentar, código en worktree,
  tests/lint/build, crear tareas, commits **locales** en branch aislada,
  aprendizaje preliminar, migraciones aditivas/reversibles del Fabric, systemd
  propio.
- **Requiere aprobación**: push, PR, merge, deploy, secretos, comms externas,
  escritura de datos económicos/fiscales/laborales/legales reales, subir límites.
- **Prohibido**: pagos/transferencias, borrado irreversible, hacerse pasar por
  una persona, acciones legales/fiscales automáticas, deploy sin rollback,
  `service_role` indiscriminado, secretos en git.

La decisión la toma `orq.policy_decide(capability, principal, blast_override)` →
`auto | requires_approval | forbidden`. Función pura, testeable.

## Rollback

Cada migración tiene su inverso en `db/rollback/`. El schema `orq` es aislado:
`drop schema orq cascade` no afecta ningún dato de negocio de `public`.
