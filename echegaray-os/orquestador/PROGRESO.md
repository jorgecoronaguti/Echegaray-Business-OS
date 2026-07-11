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

## FASE 1 — Work Ledger y Worker durable ✅ COMPLETA

**Objetivo**: capa satélite de ejecución con intentos, DAG, prioridades,
deadlines, reintentos, backoff, dead-letter, leases, visibility-timeout, claim
`FOR UPDATE SKIP LOCKED`, recuperación de abandonados, worker Node (`--once`/
daemon/health), heartbeat y ejecución no-op para validar el ciclo sin IA.

### Entregado
- Migración `supabase/migrations/20260711121000_orq_ledger.sql`:
  - `orq.tasks` (envelope: linaje correlation/causation/parent, origen
    polimórfico subject_type/subject_id, capability_slug, priority, run_after,
    deadline, DAG, lease, result/evidence/cost, dedupe_key único).
  - `orq.task_deps` (DAG), `orq.task_attempts` (retry-aware, session_id/tokens/
    cost/logs_ref/review).
  - Funciones (todas transaccionales → outbox): `enqueue_task` (idempotente),
    `claim_task` (SKIP LOCKED), `heartbeat_task`, `transition_task` (valida
    transición + ownership del lease), `fail_task` (backoff/dead-letter),
    `reap_expired_leases` (recuperación).
  - Índices parciales de cola/lease; RLS + grants.
- Worker Node: `orquestador/worker.mjs` (loop claim→running→reviewing→succeeded,
  heartbeat, timeout, graceful shutdown SIGTERM/SIGINT, `--once`/daemon/`--health`,
  concurrencia por slots) + `lib/ledger.mjs` (port) + `handlers/` (registry +
  noop) + `scripts/enqueue.mjs`. npm scripts `orq:*`.

### Pruebas ejecutadas (evidencia, Postgres 16 docker)
- Ciclo completo: received→claimed→running→reviewing→succeeded; outbox con los 5
  eventos; dedupe_key idempotente (reenvío devuelve el mismo id). ✅
- Fallo: fail#1→retrying (backoff), fail#2 (=max_attempts)→dead_letter; intentos
  registrados. ✅
- Reap: tarea con lease vencido → recuperada a retrying. ✅
- Concurrencia SQL (claims solapados): exactamente 1 worker gana. ✅
- Worker Node end-to-end `--once`: 2 succeeded + 1 dead_letter (max_attempts=1). ✅
- **Concurrencia definitiva (2 workers Node)**: 7 tareas, W1=1/W2=6, 7 succeeded,
  **0 tareas con >1 intento**, 7 intentos, 2 workers distintos. Sin doble
  ejecución. ✅
- Rollback F1: drop → re-apply limpio. Repo typecheck/lint verde.

### Decisiones
- Claim admite `ready` y `retrying` (con run_after vencido) para no duplicar
  lógica de promoción.
- `transition_task` valida la transición (F0) y el ownership del lease en estados
  activos → un worker no puede pisar la tarea de otro.

### Pendiente
- Aplicar F0+F1 a Supabase prod (pooler) — dentro de política automática.

## FASE 2 — Executor real (Engine/Runner + Claude CLI) ✅ COMPLETA

**Objetivo**: port Engine/Runner neutral + adaptador Claude CLI headless +
worktree aislado por tarea + review + commit local. Nunca push/PR/merge.

### Entregado
- Port neutral (D3): `orquestador/engines/index.mjs` — registry con `noop` y
  `claude-cli` implementados; `claude-sdk`/`anthropic-api`/`openai`/`gemini` con
  interfaz lista y `notImplemented` (el resto del Fabric no depende del motor).
- Adaptador `engines/claude-cli.mjs`: `claude -p --output-format json
  --permission-mode acceptEdits --model --add-dir --session-id`, guardarraíl de
  herramientas (solo Read/Edit/Write/Glob/Grep; sin Bash/red/MCP), timeout +
  kill, captura session_id/exit/cost/tokens. Corre con cwd en el worktree →
  reutiliza CLAUDE.md/skills/memoria nativamente. No filtra DATABASE_URL/
  SERVICE_ROLE al subproceso.
- `engines/noop-engine.mjs`: cambio determinista sin IA (valida el pipeline sin
  tokens).
- Workspace Manager `lib/workspace.mjs`: `git worktree` aislado + branch por
  tarea, commit LOCAL (nunca push), release seguro (solo bajo WORKSPACES_DIR).
- Reviewer básico `lib/review.mjs`: gates (cambio presente, sin rutas prohibidas
  —.env/credentials/pem—, typecheck si cambió TS). Port del Reviewer completo (F4).
- Policy port `lib/policy.mjs` + handler `handlers/code_change.mjs` (worktree →
  engine → review → policy gate `git.commit_local` → commit local → release).

### Pruebas ejecutadas (evidencia)
- Smoke `claude -p` headless: crea archivo, JSON con session_id/cost/usage. ✅
- Pipeline con `noop-engine`: worktree→review→commit local→release; tarea
  succeeded con sha/branch. ✅
- **Pipeline con Claude real**: worktree aislado → `claude-cli` (sonnet, sesión
  1fe55580, cost $0.23) → review pass → commit local `8ec5b36` → worktree
  removido → succeeded. El archivo creado por Claude describe correctamente el
  Work Fabric (confirma reuso real de CLAUDE.md/skills). Working tree principal
  intacto; ramas de prueba limpiadas. ✅
- typecheck/lint verde.

### Decisiones
- Guardarraíl de push en DOS capas: el motor no tiene Bash (no puede pushear) y
  el Fabric hace el commit local determinista; push/PR quedan como capacidad
  Nivel E (requires_approval) para Fase 5.
- Release remueve el worktree pero conserva la branch (commit inspeccionable).

## FASE 6 — Operación remota 24×7 (systemd) ✅ COMPLETA (interino sobre store local)

**Objetivo**: servicios systemd en la VM, Restart=always, arranque al boot, sin
sesión SSH, journal, graceful shutdown, recuperación. Sin tocar
echegaray-claude-remote.service.

### Entregado
- Units `orquestador/systemd/`: `echegaray-orq-worker.service` (daemon,
  Restart=always, RestartSec=5, KillSignal=SIGTERM, TimeoutStopSec=90, journal),
  `echegaray-orq-health.{service,timer}` (cada 5 min), `echegaray-orq-cleanup.
  {service,timer}` (worktrees huérfanos cada 6 h). Instalador idempotente
  `install.sh` (crea EnvironmentFile chmod 600, NO versionado).
- `scripts/cleanup-worktrees.mjs` (poda git + borra dirs huérfanos >1h).
- Store durable interino en la VM: contenedor `orq-store` (postgres:16,
  `--restart=always`, volumen `orq-store-data`, 127.0.0.1:55433). F0+F1 aplicadas.

### Pruebas ejecutadas (evidencia)
- Servicios instalados y `active (running)`; timers activos;
  echegaray-claude-remote.service intacto. ✅
- El servicio permanente procesó tareas encoladas EXTERNAMENTE (svc1/svc2 →
  succeeded) sin intervención. ✅
- **Supervivencia**: `kill -9` del MainPID → systemd reinició (PID nuevo,
  NRestarts=1, active). ✅
- **Recuperación de tarea interrumpida** (end-to-end): worker claim→running,
  kill -9, lease vencido → otro worker reap (attempt1=timeout) → attempt2
  succeeded. ✅
- Loop completo con Claude a través del servicio: ver Fase 2 (mismo pipeline).

### Bugs reales encontrados por el propio sistema y corregidos
- `spawn claude ENOENT` bajo systemd --user (PATH sin nvm): resuelto vía
  `CLAUDE_BIN` junto a node + PATH del child (`ORQ_CLAUDE_BIN` override).
- Colisión de branch en reintentos: nombre de branch/worktree único por intento
  (`-a<attempt>`) + borrado de branch vacía al fallar (keepBranch=false).
- `.orq-sandbox` gitignoreado ocultaba el cambio al review/commit: revertido.

### Nota (bloqueo declarado)
Corre sobre store Postgres LOCAL durable en la VM porque el password de la
Supabase real (pooler) no está disponible. Migrar a prod (D1) = cambiar
`DATABASE_URL` en el EnvironmentFile (una línea). Ver bloqueo al pie del progreso.

## FASE 3 — Planner, Router y Agentes ⬜ PENDIENTE (no bloqueado por credencial)
## FASE 4 — Review, Recovery y Aprendizaje 🟡 PARCIAL (recovery/reap operativo; falta reviewer full + learning)
## FASE 5 — Human Control y Observabilidad 🟡 PARCIAL (status.mjs CLI; UI en app bloqueada por prod DB)
## FASE 7 — Intake e integraciones 🟡 PARCIAL (enqueue CLI; API/webhooks pendientes)

---

## CRITERIO DE FINALIZACIÓN — estado

| Requisito | Estado |
|---|---|
| worker como servicio permanente | ✅ systemd, active, enabled |
| sobrevive cierre de Claude/VS Code/SSH | ✅ systemd --user + Linger=yes + WantedBy=default.target |
| reinicia automáticamente | ✅ Restart=always (probado con kill -9, NRestarts=1) |
| procesa una tarea de prueba completa | ✅ noop y Claude, vía servicio |
| crea un worktree | ✅ |
| ejecuta Claude headless | ✅ (sonnet, sesiones reales, costo capturado) |
| modifica un archivo de prueba controlado | ✅ NOTA-SERVICIO.md |
| corre revisión | ✅ gates (cambio/rutas prohibidas/typecheck) |
| crea un commit local | ✅ (nunca push) |
| persiste eventos e intentos | ✅ outbox + task_attempts |
| libera/limpia el workspace | ✅ release + cleanup timer |
| recupera una tarea interrumpida | ✅ reap probado end-to-end |
| muestra el estado en la interfaz existente | 🟡 CLI status.mjs; UI del app **bloqueada por prod DB** |
| deja documentación / rollback / pruebas / evidencia | ✅ README, rollback/, test-fabric.sh, este PROGRESO |

## BLOQUEO DECLARADO — credencial no disponible

- **Bloqueo**: no hay password de la Supabase real. `supabase/.temp/pooler-url`
  trae el usuario/host pero SIN password; ninguna otra fuente lo tiene.
- **Impacto**: por D1 el `orq` debe vivir en la Supabase de producción (para
  referenciar backlog_autonomo/acciones y para que la UI existente lo lea).
  Hoy corre sobre un Postgres durable LOCAL en la VM (interino, restart=always).
- **Alternativas**: (a) me pasás el `DATABASE_URL` del pooler con password;
  (b) autorizás habilitar el MCP de Supabase para aplicar `orq` a prod;
  (c) seguimos en el store local hasta tener el dato.
- **Comando mínimo tuyo**: pegar en el EnvironmentFile
  `~/.config/echegaray-orq/worker.env` el `DATABASE_URL` real y
  `ORQ_DB_SSL=true`, y avisarme para aplicar F0+F1 a prod (aditivo/reversible,
  ya validado) y reiniciar el servicio.

### Siguiente acción (una vez desbloqueado o en paralelo, no bloqueado)
Fase 3 (Planner durable + Agent/Capability Registry + Router multi-modelo +
agentes mínimos) y Fase 4 (Reviewer full + aprendizaje a memoria). Ambas
avanzan sobre el store actual sin necesitar la credencial de prod.
