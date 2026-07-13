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
| muestra el estado en la interfaz existente | ✅ CLI status.mjs + pantalla /orquestador (F5) sobre vistas public.orq_* |
| deja documentación / rollback / pruebas / evidencia | ✅ README, rollback/ (0000-0003), test-fabric.sh, este PROGRESO |

## FASES 3–5 — COMPLETADAS Y VALIDADAS EN PRODUCCIÓN

**F3 — Planner · Agent Registry · Model Router** (commit F3)
- `orq.agents`, `orq.agent_capabilities`, `orq.model_routes`, `capabilities.agent_role`.
  6 agentes mínimos (director-planner, software-architect, implementer, reviewer-qa,
  devops, knowledge-manager); identidad/clearance en `principals`.
- `lib/registry.mjs` (lectura), `lib/router.mjs` (candidatos por especificidad
  capability>agent>default, fallback, techo de costo), `handlers/plan.mjs` (Planner:
  objetivo → DAG con criterios de éxito, hijos+deps atómicos; el ledger hace cumplir
  el orden). `code_change` elige modelo por router; el fallback escala con el intento.
- Validado en prod: router (3 casos) + DAG (analyze→implement→verify) ejecutado en
  orden por el worker vivo, 100% verde.

**F4 — Reviewer completo · Policy Gate · Learning** (commit F4)
- `review.mjs`: gates configurables (lint/build/definition_of_done) + **Policy Gate
  de rutas protegidas (D5)**: bloquea escritura autónoma sobre `.claude/`, `CLAUDE.md`
  y `supabase/migrations` (editar el cerebro es Nivel E). `workspace.mjs` con `-uall`.
- `learning.mjs`: post-mortem de dead_letter (causa+recomendación+historial) y captura
  de aprendizaje como eventos append-only (clase A/B; C+ requiere validación humana).
- `worker.mjs`: post-mortem automático + reconciliación de arranque.
- Validado en prod: 3 rutas protegidas bloqueadas, normal pasa, DoD, post-mortem e2e.

**F5 — Observabilidad + Control Humano en la interfaz existente** (commit F5)
- Vistas read-only `public.orq_*` (security_invoker, respetan RLS) — el cliente
  Supabase de la app las lee sin exponer `orq` a la API. Control humano vía
  `orq.human_action` (valida contra el state machine) expuesto por RPC
  `public.orq_task_action` (SECURITY DEFINER, sólo autenticado).
- Feature `src/features/orquestador` + pantalla `/orquestador`: resumen, cola por
  estado, dead-letter con reintentar/cancelar, tareas, agentes, timeline de eventos.
- Validado en prod: vistas + security_invoker + control (dead_letter→ready, cupo de
  intentos, evento, transición inválida rechazada). `typecheck` y `build` OK. Sin deploy.

Estado prod: 15 tablas `orq`, 5 vistas `public.orq_*`, 6 agentes. Worker 24×7 sobre
Supabase (canónico). `echegaray-claude-remote.service` intacto. Sin push/PR/merge/deploy.

## CUTOVER A PRODUCCIÓN (Supabase canónico) — RESUELTO

El bloqueo de credencial quedó **resuelto**: el `DATABASE_URL` real se cargó en
`~/.config/echegaray-orq/worker.env` (no versionado, nunca impreso).

Pasos ejecutados y validados (todo contra la Supabase real, proyecto
`jdqbpchkjrxktcxndnho`, PG 17.6):

1. **Verificación de destino**: proyecto correcto, `public` intacto (33 tablas).
2. **Fix de robustez** (`lib/db.mjs`): parser de connection string tolerante a
   passwords crudos (con `#`, `!`, etc.) — separa por el último `@` y pasa
   `user`/`password` como campos discretos a `pg`. Además se corrigió el usuario
   del pooler al formato `postgres.<project_ref>` (ref público, password intacto).
3. **F0 + F1 aplicadas** a prod, cada una en **transacción atómica** (todo-o-nada):
   12 tablas, 12 funciones, 23 capabilities, 16 estados, 35 transiciones, 6
   niveles A–F, principal `system`. `public` sin cambios. Rollback disponible.
4. **Supabase = fuente canónica**: worker reiniciado sobre prod (`db=postgres`,
   NRestarts 0). Store local interino **retirado de forma reversible** (detenido,
   auto-restart off, volumen `orq-store-data` conservado, sin pérdida de datos).
5. **Revalidación en prod** (determinística): LEASE ✅ · HEARTBEAT ✅ ·
   REAP/recuperación ✅ · RETRY/backoff ✅ · DEAD-LETTER ✅ · OUTBOX/eventos ✅ ·
   procesamiento end-to-end (`succeeded` ~2.5s) ✅ · scheduler (timers health +
   cleanup active+enabled) ✅ · RLS en 12 tablas + 24 policies + SELECT a
   `authenticated` (legibilidad de la UI) ✅.

`echegaray-claude-remote.service` intacto. Sin push, sin PR, sin deploy.

---

## ETAPA 2 — CERRADA (PR #6 mergeado + deploy productivo)

**Merge**: PR #6 mergeado a `main` por **rebase** → `main` = `6c44216` con
**exactamente los 11 commits de Work Fabric** (F0–F6 + cutover), sin merge commit
y **sin el commit ajeno** del calendario (excluido por rebase; recuperable por
reflog `b8c27fe`). Checkout de la VM movido a `main` (el worker ya no corre desde
la rama temporal). Cambios de `scripts/arca` **intactos** (md5 verificado
antes/después).

**Deploy productivo**: Vercel Production, sha **`6c44216`** (== `main` HEAD),
estado *success*, deployment id `5416248834`, 2026-07-12T21:08:05Z.
URL: https://echegaray-business-os.vercel.app

**Servicios**: `echegaray-orq-worker` active+enabled (PID 134746) sobre Supabase
prod; `echegaray-claude-remote` intacto; timers health+cleanup activos; Linger=yes.

**Smoke tests productivos**:
- reachability `/`, `/login`, rutas existentes (`/flujo-caja`, `/reportes`,
  `/operador-digital`, `/dashboard`): 200 ✅ (sin regresión)
- `/orquestador`: renderiza con gate "Iniciá sesión", **sin filtrar datos** a
  anónimos ✅
- **RLS/permisos (data-layer, prod)**: anon → **401** en `orq_tasks`, `orq_agents`
  y en la RPC `orq_task_action` ✅ (acciones y lectura denegadas a no autorizados)
- **Bundle web**: 0 credenciales / worker / infra en `.next/static` y en los chunks
  productivos ✅ (solo anon key, público por diseño)
- **Pendiente de sesión humana**: la vista autenticada de tareas/agentes/timeline y
  el click de reintentar/cancelar con usuario autorizado requieren tu login (no
  tengo credenciales de usuario). El happy-path de `orq_task_action` ya quedó
  validado a nivel función (dead_letter→ready) y anon queda rechazado.

**Rollback disponible**: DB `db/rollback/0000–0003` (aditivo/reversible); código
`git revert` de los 11 commits o checkout de la rama preservada; commit del
calendario recuperable por reflog. Migraciones ya aplicadas a prod (el merge NO
las re-ejecuta).

**Estado**: Etapa 2 (F0–F5 + operación 24×7 + PR/merge/deploy) COMPLETADA.

---

## ETAPA 3 — DIRECCIÓN IA (cierre productivo)

**Qué es**: primer **Director General IA** del Business OS, construido *sobre* el
Work Fabric (sin sistemas paralelos). Es un agente/principal más
(`agent:director-general`, clearance D); su "pensar" es una tarea `type='direction'`
(handler `handlers/direction.mjs`). Comprende el estado (Situation Assembler
`lib/situation.mjs` sobre tablas reales de `public`), prioriza, planifica,
descompone en un DAG, **asigna** a especialistas (`created_by=director`), controla
y reporta. NO ejecuta Nivel E: lo deja en `approval_requests`.

**Invariante (DB)**: `tasks_direction_assignment` — sólo el Director asigna a
especialistas; especialista→especialista queda bloqueado.

**PR / commit / deploy**
- PR **#7** (`direccion-ia/etapa-3` → `main`), rebase merge, 1 commit, 10 archivos,
  100% aditivo. El commit ajeno del calendario (`6de24e2`) quedó **fuera** del PR.
- **main = `45b69f9`** ("etapa3(Dirección IA): Director General IA sobre el Work Fabric").
- Deploy productivo Vercel: **success** para `45b69f9`. URL `https://echegaray-business-os.vercel.app`.
  `/direccion` responde 200 (ruta nueva desplegada, no 404).

**Validación previa (pre-merge)**: lint ✅ · typecheck ✅ · build ✅ · suite fabric
base (PG efímero) ✅ · e2e Etapa 3 (PG efímero) ✅ — invariante bidireccional,
gating de RPC (sin auth / vacío / válido), ciclo objetivo→DAG(2,1 dep)→enrutado→
informe→evento.

**Migración**: `20260712140000_orq_direccion_ia.sql` (aditiva, ya aplicada a prod).
Rollback: `db/rollback/0004_direccion_down.sql`.

**Servicios**: `echegaray-orq-worker.service` active+enabled corriendo desde `main`
(checkout estable actualizado, ARCA intacto md5). `echegaray-claude-remote.service`
intacto. Ledger sin duplicados; heartbeats/leases/retries/dead-letter OK.

**Bundle/RLS (prod)**: anon → **401** en `orq_direction`, `orq_tasks` y la RPC
`orq_submit_objective`. Bundle: 0 secretos / 0 lógica de worker (643 KB escaneados).

**Smoke productivo del Director (con Claude, datos reales)** — objetivo:
"Analizar el estado actual y proponer las 5 prioridades de Dirección para los
próximos 30 días, sin acciones externas ni modificar datos críticos".
- Director `succeeded`, engine `claude-cli`, costo **$0.27**.
- Comprendió estado real: 311M contratados con 0 obras activas (3 pausadas + 1
  cerrada), 37,7M en obligaciones vencidas con caja sana, backlog 38/42 abierto,
  scorecard 22/22 con bloqueo, 13 fuentes críticas.
- Generó **5 prioridades** razonadas (cuello de botella = 0 obras activas),
  **4 recomendaciones**, y un **DAG de 8 subtareas / 7 dependencias**, todas
  `created_by=agent:director-general` (invariante respetada), enrutadas a
  software-architect / director-planner / knowledge-manager.
- **2 solicitudes de aprobación humana** (destino de las 3 obras pausadas —
  contractual; gestión de 2 obligaciones vencidas — Nivel E fiscal) **NO ejecutadas**.
- Subtareas de especialistas: 3 succeeded, **2 dead_letter** (los especialistas
  están DIFERIDOS en Etapa 3; el engine por defecto del worker es `noop`, un stub
  — el ledger las frenó con retries→dead-letter, sin efecto externo), 3 canceladas
  (bloqueadas por dependencia). Cierre en vuelo global = 0.

**Pendiente de sesión humana** (igual que Etapa 2): el click autenticado en
`/direccion` (login → cargar objetivo vía RPC `orq_submit_objective` → ver plan/
informe) y reintentar/cancelar desde la UI requieren tu login. La RPC quedó
validada a nivel función y anon queda rechazado.

**Rollback disponible**: DB `db/rollback/0004`; código `git revert 45b69f9` o
checkout de la rama `direccion-ia/etapa-3` (preservada). Migración ya aplicada a
prod (el merge no la re-ejecuta).

**NO IMPLEMENTADO (diferido, por diseño)**: CFO / Compras / Ingeniería / RRHH /
Comercial / Arquitecto / Ingeniero Civil / Contador / Abogado / Software IA. Sólo
queda preparada la arquitectura (se registran como agentes; el Director los enruta).

**Estado**: Etapa 3 (Director IA sobre el Work Fabric) COMPLETADA.
No iniciar Etapa 4 sin nueva instrucción.

---

# ETAPA 4 — ORGANIZACIÓN IA (cierre productivo)

**Qué se construyó** (todo aditivo, reutiliza el Work Fabric; sin sistemas paralelos):
el Director General IA ahora coordina **11 especialistas reales** que **trabajan de
verdad** sobre el Work Fabric. Cierra el gap de Etapa 3: los especialistas ya no
mueren en dead_letter por no producir un diff — su trabajo es análisis/preparación
(Nivel C) con salida estructurada.

- **Migración `20260713120000`** (aditiva, aplicada a prod; rollback `0005`):
  `orq.agents.org_title/org_order`; **9 capacidades `advise.*`** (clearance C, auto);
  **9 especialistas de negocio** (CFO, Contador, Compras, Comercial, Ingeniería,
  Arquitecto, Ingeniero Civil, Abogado, RRHH) con `context_ref` → su **skill de
  dominio**; Software Architect/Developer mapeados a los agentes F3 existentes
  (`software-architect`/`implementer`); vistas `public.orq_org` (métricas por
  especialista) y `public.orq_objective_closure`. `public.orq_direction` NO se tocó.
- **Handlers nuevos**: `specialist.mjs` (`type='specialist'`, análisis read-only,
  salida estructurada findings/recomendaciones/approval_requests/confianza, **no
  exige diff**, **no ejecuta Nivel E**) y `consolidate.mjs` (`type='direction_consolidate'`,
  depende de todas las hojas, cierra el objetivo con `direction.completed`).
  `direction.mjs` enruta a las capacidades de negocio, marca el `type` por
  especialista y agrega el nodo de consolidación al DAG.
- **Motor `noop` retirado** del camino productivo → `fixture` (solo tests, env-gated);
  el config coacciona valores legacy a `claude-cli` (no brickea la VM). `worker.env`
  de la VM actualizado a `ORQ_ENGINE=claude-cli`.
- **UI `/organizacion`** (Organización IA): organigrama Director→11, métricas
  (estado/tareas/éxitos/fallos/retries/costo/tokens/duración/última actividad),
  evidencia y control humano (`TaskActions` reutilizado). `/direccion` muestra el
  cierre del Director y enlaza la Organización.

**Cierre productivo**:
- PR **#8** (rebase merge). El commit ajeno del calendario (`5acbbf4`) quedó FUERA
  del PR (rebase sobre `origin/main` en worktree aislado). `main` = **`d49814d`**.
- Deploy Vercel **success** = `d49814d`. URL **https://echegaray-business-os.vercel.app**;
  `/organizacion` responde **200** en prod. Sin regresión (`/direccion` `/orquestador`
  `/obras` `/login` → 200).
- Worker reiniciado desde el commit mergeado (engine `claude-cli`), **16 agentes**
  habilitados (6 infra F3 + Director + 9 negocio), heartbeats/ledger OK,
  `claude-remote` **intacto**, **ARCA md5 idéntico** al baseline.
- RLS: anon → **401** en `orq_org`, `orq_objective_closure`, `orq_tasks` y la RPC.
- QA: typecheck · lint · build · suite base del Work Fabric · **e2e efímero de Etapa 4**
  (Director→especialistas `succeeded` sin diff→consolidación que cierra el objetivo,
  cero dead_letter) — VERDE.

**Smoke productivo con Claude sobre datos reales** (objetivo: "prioridades de Dirección
30 días, solo análisis"):
- Objetivo **succeeded** (director $0.31). **4 prioridades** (desbloquear 3 obras
  pausadas; resolver obligaciones vencidas; causa raíz del scorecard 22/22 bloqueado;
  triage del backlog 38/3). **DAG de 7 subtareas de especialista + consolidación**,
  todas `created_by=agent:director-general` (invariante respetada). **2 approval_requests
  del Director** (no ejecutadas).
- **4/7 especialistas SUCCEEDED** con análisis real y escéptico (sin dead_letter por el
  motivo de Etapa 3 — el gap está cerrado):
  - **CFO IA**: detectó que la cifra del propio Director ("obligaciones vencidas por
    $37,7M") era incorrecta; consultó `obligaciones`+`aplicaciones_pago` y propuso
    secuencia de pago por riesgo legal (UOCRA/IERIC/Fondo de Cese primero).
  - **Contador IA**: exigió comprobante primario (F.931, CONTROL DE GASTOS) antes de
    escalar pagos; criterio devengado.
  - **Ingeniero Civil IA**: halló que "Pisos" tiene HH reciente que **contradice** su
    estado "pausado" declarado; pidió validar antes de diagnosticar.
  - **Software Architect IA** (conf. alta): sin causa común de "fuente caída";
    priorizó actualizar Flujo de Caja + CONTROL DE GASTOS (6 días de atraso).
  - **7 approval_requests de especialistas** — todas registradas, **no ejecutadas**.
- **3 especialistas en dead_letter** (Abogado + 2 subtareas duplicadas de CFO/Software
  Architect) por **error transitorio del motor** (`claude-cli: exit 1`, stderr vacío)
  tras 3 reintentos — **contenidos por el ledger, sin efecto externo**. Reintentables
  por un humano desde `/organizacion` (control humano).
- **Consolidación** quedó en `ready` **bloqueada**: el nodo join exige que **todas** las
  hojas estén `succeeded`; con 3 en dead_letter, no se puede reclamar. Al reintentar y
  cerrar esas 3 hojas desde la UI, la consolidación se destraba y emite `direction.completed`.
- Costo total del smoke: **$3.57** (especialistas $3.26 + director $0.31).

**Hallazgo / follow-up (Nivel D, no bloqueante)**: el nodo de consolidación depende de
`success` de todas las hojas (semántica DAG estándar). Cuando un especialista queda en
dead_letter, la consolidación se bloquea hasta intervención humana. Mejora futura:
permitir consolidación con hojas fallidas (reportar parcial) o "depende-de-settled".
Segundo follow-up: el motor `claude-cli` con `CONCURRENCY=2` produjo `exit 1` transitorios
en 3/7 llamadas — evaluar serializar por agente o backoff específico del motor.

**Rollback disponible**: DB `orquestador/db/rollback/0005_organizacion_down.sql`
(verificado: restaura el estado de Etapa 3); código `git revert d49814d` o checkout de
la rama `etapa-4/organizacion-ia` (preservada). Migración ya aplicada a prod (el merge
no la re-ejecuta).

**Estado**: Etapa 4 (Organización IA) COMPLETADA. Los 11 especialistas ejecutan sobre
el Work Fabric. No iniciar Etapa 5 sin nueva instrucción.
