# PRP-015: Canal de Acción de la Extensión → OS (de "ve y aconseja" a "actúa con tu aprobación")

> **Estado**: IMPLEMENTADO (Fases 1–4) — 2026-07-14
> **Fecha**: 2026-07-14
> **Proyecto**: Echegaray Business OS — orquestador + extensión + app

---

## Objetivo

Convertir el canal interactivo del OS (extensión de Chrome → motor `interactive-server.mjs`) de un asistente que solo lee y aconseja a uno que **ejecuta trabajo real con aprobación humana explícita**: escribir/crear/eliminar archivos en Drive, interpretar archivos multimedia cargados, activar al especialista correcto según el dominio, y programar tareas recurrentes — todo lo de efecto real pasando por la cola de aprobación (Nivel D/E) que ya existe pero está a medio conectar.

## Por Qué

| Problema | Solución |
|----------|----------|
| El OS ya *entiende* la operación (lee Drive, tiene memoria, tiene 19 especialistas) pero no puede *hacer* nada: cada acción termina en "esto requiere tu aprobación" y muere ahí (el `enqueue` del motor interactivo es un stub que no registra nada, y no hay ejecutor que corra lo aprobado). | Cerrar el lazo VER→...→TRABAJAR→CONTROLAR: tools de escritura tipadas como capacidad, cola de aprobación real (reusa `orq.pending_operations` de PRP-014) y un ejecutor idempotente que corre lo aprobado. |
| El dueño carga a mano en Sheets lo que ya tiene en una foto/PDF/remito. La extensión hoy solo manda texto + un `fileId`; no puede subir un archivo. | Ingesta multimedia: subir una foto de factura → el modelo la interpreta (visión/PDF) → propone el asiento en Flujo de Caja → el dueño aprueba de un toque. |
| El canal interactivo es UN generalista (haiku), aunque la organización de especialistas con SKILL.md real ya existe en el worker. Una consulta de laboral UOCRA, impuestos o exigibilidad de un adicional la responde un generalista, no el experto. | Rutear la directiva al especialista/skills correctas (reusar `skill-map` + razonamiento del `specialist` handler), no reconstruir. |
| Los hallazgos y compromisos no se convierten en seguimiento: no hay forma de decir "todos los lunes revisá cobranzas y avisame" ni de auto-crear un seguimiento desde un hallazgo. | Programar/autoprogramar tareas desde la extensión (escribe en la cola de trabajo existente + una tabla de recurrencias) y auto-crear follow-ups internos (Nivel D, seguro). |

**Valor de negocio**: elimina carga administrativa manual (carga de comprobantes, ordenar Sheets, redactar seguimientos), acorta el ciclo detección→registro de horas/días a segundos, y sube la autonomía segura del OS de Nivel A–C (observar/investigar/preparar) a Nivel D real (actuar internamente) sin abrir riesgo externo — cada efecto real sigue detrás de un botón humano. Prioridad por la función de misión: alto impacto económico (caja/registro), riesgo contenido (gate obligatorio), alta frecuencia (carga diaria), alto tiempo humano ahorrado.

## Qué

### Criterios de Éxito
- [ ] Desde la extensión, una directiva tipo "completá/ordená este Sheet" produce una **operación pendiente real** en `orq.pending_operations` (no un stub), visible con su borrador/cambio concreto.
- [ ] La extensión muestra una **vista de pendientes** con botones **Aprobar/Rechazar**; aprobar dispara la ejecución real de la escritura en Drive y la operación pasa a `executed` (o `failed` con el error), de forma **idempotente** (aprobar dos veces no duplica el efecto).
- [ ] `drive.write` y `drive.delete` **nunca** se ejecutan sin pasar por la policy: `drive.write` → `requires_approval`, `drive.delete` → `forbidden` (verificable en el ledger/eventos).
- [ ] La extensión puede **subir un archivo** (foto/PDF/Excel/Word); el OS lo interpreta y, para el caso killer (foto de factura/remito), propone un asiento en Flujo de Caja como operación pendiente.
- [ ] Una directiva de dominio (cotizar / laboral UOCRA / impuestos / adicional exigible) es respondida **con las skills del especialista correcto** activadas (registrado en el evento/telemetría: qué capability y qué skills se cargaron), no por el generalista.
- [ ] Desde la extensión se puede **crear una tarea recurrente** ("todos los lunes revisá cobranzas y avisame") que queda persistida y el worker la dispara en su cadencia; y un hallazgo puede **auto-generar un seguimiento** interno sin aprobación (Nivel D).
- [ ] `npm run typecheck`, `npm run build` y `npm run lint` pasan; los tests nuevos del ejecutor/tools de escritura pasan.

### Comportamiento Esperado

**Fase 1 (espina) — "ordená este Sheet":** el dueño, con el Sheet abierto, escribe la directiva. El motor interactivo razona, decide que hay que escribir, invoca `drive_update`. El `tool-executor` consulta la policy (`drive.write` → `requires_approval`), **no ejecuta**, y encola la operación con el cambio concreto en `orq.pending_operations`. El motor responde: "preparé estos cambios, quedaron pendientes de tu aprobación". La extensión, en su pestaña de pendientes, muestra la operación con el diff propuesto. El dueño toca **Aprobar** → la operación pasa a `approved`; el **ejecutor** (worker) la toma, corre la escritura real en Drive vía la cuenta de servicio, marca `executed` y devuelve el resultado. Rechazar la marca `rejected` sin efecto.

**Fase 2 — foto de factura:** el dueño adjunta una foto en la extensión y escribe "cargá esta factura". El archivo viaja al motor, que se lo pasa al modelo como contenido de visión, extrae proveedor/fecha/importe/concepto, y —con Fase 1— propone una fila nueva en el Flujo de Caja como operación pendiente. El dueño aprueba y queda registrada.

**Fase 3 — dominio experto:** "¿es exigible este adicional?" El canal clasifica la directiva a una capability (`advise.legal`/`derecho-construccion-contratos`), carga esas skills y razona como el especialista (reusando lo del worker), no como generalista. Si el trabajo es profundo, encola una tarea `specialist` y avisa que lo está trabajando.

**Fase 4 — programar:** "todos los lunes revisá cobranzas y avisame" crea una recurrencia persistida; el worker enque­ua la tarea cada lunes. Un hallazgo de un ciclo ("hay 3 facturas vencidas sin gestionar") auto-crea un seguimiento interno (Nivel D, auto, sin aprobación).

---

## Contexto

### Estado real verificado (lo que YA existe — no reconstruir)

- **Cola de aprobación a nivel DB (PRP-014)**: `supabase/migrations/20260715120000_orq_operator_capabilities.sql` ya crea:
  - tabla `orq.pending_operations` (con `status` awaiting_approval→approved→executed/failed, `target`, `payload`, RLS),
  - vista `public.orq_pending_operations` (security_invoker),
  - RPC `public.orq_operation_action(id, action, note)` (aprobar/rechazar, exige `auth.uid()`),
  - capabilities `drive.read`(A) `drive.draft/doc.create/mail.draft`(C) `drive.write/mail.send`(E) `drive.delete`(F) con su clearance — la policy ya las resuelve auto/requires_approval/forbidden **sin tocar código**.
- **Gate y ejecutor de tools**: `orquestador/lib/policy.mjs` (`decide`), `orquestador/lib/tool-executor.mjs` — **ya rutea `requires_approval` a un `enqueue`**. El stub a reemplazar está en `interactive-server.mjs` línea ~108 (`enqueue: async () => 'pendiente-de-aprobacion'`).
- **enqueue real ya escrito** en `orquestador/handlers/specialist.mjs` (`enqueuePendingOperation`, inserta en `orq.pending_operations`) — extraer a un lib compartido (DRY) y reusar en el motor interactivo.
- **Ruteo a especialistas + skills** ya existe: `orquestador/lib/skill-map.mjs` (`skillsForCapability`), `orquestador/lib/router.mjs`, `orquestador/handlers/specialist.mjs` (razona con la skill del dominio inyectada). El canal interactivo NO lo usa todavía.
- **UI de aprobación en la web app** ya existe (PRP-014 F5): `src/features/aprobaciones/` (`OperacionCard.tsx`, `services/actions.ts` → RPC `orq_operation_action`), página `src/app/(main)/aprobaciones/page.tsx`. Es el **canal humano alterno**; la extensión necesita el suyo.
- **Cliente Google**: `orquestador/lib/google.mjs` — Service Account existente, **solo READONLY_SCOPES** y métodos GET/download. No hay ningún método de escritura.
- **Frente/proxy**: `src/app/api/os/[...path]/route.ts` (Vercel, `maxDuration=60`) reenvía `/*` al túnel saliente publicado en `os_runtime`. La extensión (`extension/sidepanel.js`) solo llama `/ask` y `/health` con `Authorization: Bearer <token>` y NO tiene sesión Supabase.
- **Worker durable**: `orquestador/worker.mjs` + `orquestador/handlers/index.mjs` (registry de handlers) + `orquestador/lib/ledger.mjs` (cola de tareas `orq.tasks`).

### Gaps a construir (lo que NO existe)

1. **Escritura en Google**: scopes de escritura + métodos (`createFile`/`updateSheetValues`/`appendSheetValues`/`uploadMultipart`/`trashFile`) en `google.mjs`. Hoy es 100% readonly.
2. **Tools de escritura** tipadas como capacidad (`drive_create`, `drive_update`, `drive_append`, `drive_delete`) — no existe ninguna.
3. **Ejecutor de operaciones aprobadas**: NADIE consume `orq.pending_operations` con `status='approved'`. Aprobar hoy (web o extensión) deja la fila en `approved` y no pasa nada. Es el eslabón faltante del lazo.
4. **enqueue real en el motor interactivo** (reemplazar el stub) + endpoints del motor para listar pendientes y aprobar/rechazar desde la extensión (que no tiene `auth.uid()`, así que no puede llamar el RPC directo).
5. **UI de pendientes en la extensión** (lista + Aprobar/Rechazar).
6. **Ingesta multimedia** (subir archivo, pasar bytes al modelo como visión/PDF).
7. **Programación/recurrencias** desde la extensión + auto-follow-up.

### Referencias
- `orquestador/interactive-server.mjs` — motor a extender (stub enqueue, agregar registry de escritura y endpoints).
- `orquestador/handlers/specialist.mjs` — patrón de `enqueuePendingOperation` y de razonamiento con skills (reusar en F1 y F3).
- `orquestador/lib/tool-executor.mjs` / `lib/policy.mjs` — gate ya funcionando, no modificar el contrato.
- `orquestador/lib/tools/drive.mjs` — patrón de tool tipada como capacidad (espejar para escritura).
- `orquestador/lib/google.mjs` — agregar WRITE_SCOPES y métodos de escritura.
- `orquestador/handlers/index.mjs` / `worker.mjs` / `lib/ledger.mjs` — registrar el handler ejecutor y (F4) las recurrencias.
- `src/features/aprobaciones/` — patrón de UI/estado de aprobación (la extensión replica la esencia).
- `extension/sidepanel.js` / `sidepanel.html` — cliente a extender (upload + pestaña pendientes).
- Docs API: Drive v3 (`files.create`, `files.update`, multipart upload, `trash`), Sheets v4 (`values.update`, `values.append`).

### Arquitectura Propuesta

**Decisión de canal de aprobación desde la extensión**: la extensión se autentica con `Bearer <INTERACTIVE_TOKEN>`, no con sesión Supabase, por lo que **no puede** llamar el RPC `orq_operation_action` (exige `auth.uid()`). Por eso las acciones de la extensión van **por el motor interactivo** (nuevos endpoints `GET /pending`, `POST /operation`), que ya corre en la VM con acceso `service_role` a la DB. La web app sigue usando el RPC directo. Una sola tabla de verdad (`orq.pending_operations`), dos canales humanos. No se duplica dato.

**Decisión ejecución de lo aprobado**: al aprobar, la operación pasa a `approved` y se **encola una tarea** `type='operation_execute'` en `orq.tasks` (reusa el worker durable: retry/backoff/lease/heartbeat). Un nuevo `handlers/operation_execute.mjs` toma la tarea, re-verifica la policy, corre la tool de escritura idempotentemente (dedupe por `pending_operation_id`) y marca `executed`/`failed`. Esto respeta la restricción de tiempos (el `/ask` responde en segundos; la escritura real es diferida y durable, no bloquea el request).

```
extension/                         # cliente: + upload, + pestaña "Pendientes" (aprobar/rechazar)
orquestador/
├── interactive-server.mjs         # + registry escritura, + /pending /operation /upload, enqueue real
├── lib/
│   ├── google.mjs                 # + WRITE_SCOPES + métodos de escritura
│   ├── tools/drive-write.mjs      # NUEVO: drive_create/update/append/delete (tipadas como capacidad)
│   ├── pending-ops.mjs            # NUEVO: enqueue/list/decide (extraído de specialist.mjs, DRY)
│   └── schedules.mjs              # NUEVO (F4): recurrencias
└── handlers/
    └── operation_execute.mjs      # NUEVO: ejecutor idempotente de operaciones aprobadas
src/features/aprobaciones/         # sin cambios de fondo (canal web ya existe)
```

### Modelo de Datos

**F1–F3 no requieren tablas nuevas**: reusan `orq.pending_operations` (PRP-014) y `orq.tasks` (ledger). Esto cumple la regla anti-duplicación.

**F4 — nueva tabla de recurrencias** (única estructura nueva, con RLS):
```sql
create table orq.schedules (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references orq.tenants(id) on delete restrict,
  created_by    uuid references orq.principals(id),
  title         text not null,
  directive     text not null,          -- qué ejecutar (se transforma en tarea al disparar)
  cadence       text not null,          -- cron o preset ('weekly:mon:08:00')
  next_run_at   timestamptz not null,
  last_run_at   timestamptz,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table orq.schedules enable row level security;
-- select authenticated / all service_role (mismo patrón que orq.pending_operations)
```

---

## Blueprint (Assembly Line)

> Solo FASES. Las subtareas se generan al entrar a cada fase con `/bucle-agentico`.
> Cada fase es entregable y usable antes de la próxima.

### Fase 1: Escritura + gate de aprobación REAL (la espina)
**Objetivo**: cerrar el lazo escribir→aprobar→ejecutar. Métodos de escritura en `google.mjs` (con WRITE_SCOPES acotados); tools `drive_create/update/append/delete` tipadas como capacidad; extraer el `enqueuePendingOperation` a `lib/pending-ops.mjs` y reemplazar el stub del motor interactivo; `handlers/operation_execute.mjs` que ejecuta idempotentemente lo aprobado; endpoints `GET /pending` y `POST /operation` en el motor; pestaña "Pendientes" con Aprobar/Rechazar en la extensión.
**Validación**: desde la extensión, "completá este Sheet" crea una operación pendiente real con el cambio concreto; aprobar la ejecuta en Drive y pasa a `executed`; aprobar dos veces no duplica; `drive.delete` queda `forbidden`. Test del ejecutor (idempotencia + policy) pasa.

### Fase 2: Ingesta multimedia
**Objetivo**: la extensión sube un archivo (no solo `fileId`); el motor lo pasa al modelo como contenido de visión/PDF, lo interpreta y —con Fase 1— propone el registro. Endpoint de upload (con límite de tamaño; trabajos grandes → asíncrono). Caso killer cableado: foto de factura/remito → asiento propuesto en Flujo de Caja.
**Validación**: subir una foto de factura produce una operación pendiente con proveedor/fecha/importe extraídos; el dueño la aprueba y queda registrada. Formatos no interpretables se informan honestamente (no se inventan datos).

### Fase 3: Ruteo a especialistas
**Objetivo**: el canal interactivo clasifica la directiva a una capability y activa las skills del especialista correcto (reusar `skill-map` + razonamiento de `specialist.mjs`), en vez del generalista. Trabajo liviano: inline dentro del `/ask`. Trabajo profundo: encola una tarea `specialist` y avisa.
**Validación**: "¿es exigible este adicional?" carga `derecho-construccion-contratos` (registrado en el evento/telemetría); una consulta financiera carga la skill de finanzas; el generalista solo atiende lo que no mapea a un dominio.

### Fase 4: Programar / autoprogramar
**Objetivo**: crear recurrencias desde la extensión (tabla `orq.schedules` + disparo desde el worker que enque­ua la tarea en su cadencia) y auto-crear seguimientos internos desde hallazgos (Nivel D, auto, sin aprobación). Depende del plumbing de Fase 1.
**Validación**: "todos los lunes revisá cobranzas y avisame" persiste una recurrencia y el worker la dispara en la cadencia; un hallazgo genera un seguimiento interno sin pedir aprobación.

### Fase N: Validación Final
**Objetivo**: sistema end-to-end desde la extensión real.
**Validación**:
- [ ] `npm run typecheck` pasa
- [ ] `npm run build` exitoso
- [ ] `npm run lint` sin errores
- [ ] Tests del ejecutor y tools de escritura pasan
- [ ] Recorrido manual en la extensión: escribir Sheet → aprobar → ejecutado; foto factura → asiento propuesto; consulta de dominio → especialista; recurrencia creada
- [ ] Criterios de éxito cumplidos

---

## 🧠 Aprendizajes (Self-Annealing)

> Crece durante la implementación.

### [2026-07-14]: Fases 1–4 implementadas y verificadas en vivo
- **F1** (escritura+gate+ejecutor): lazo cerrado. Verificado: drive.delete aprobada→failed (forbidden), drive.create aprobada→executed en Drive real. Tests herméticos drive-write(12)+tool-executor(20) OK.
- **F2** (multimedia): el engine acepta `content` como array de bloques → pasar imagen/PDF NO tocó el engine. La extensión reduce la foto en canvas (bajo el límite de ~4.5MB de Vercel). Verificado: imagen 320×160 llega al modelo y la describe.
- **F3** (especialistas): clasificador haiku directiva→capability + skill-map. Verificado: adicional→advise.legal, IVA→advise.tax, alta UOCRA→advise.hr, general→sin skills.
- **F4** (agenda): tabla orq.schedules + timer systemd (5 min) + handler que corre la directiva por el propio /ask. Verificado: crear→forzar vencida→disparar→worker responde "Miércoles"→reprograma 08:00 AR.
- **Gotcha confirmado**: la extensión aprueba/programa por el MOTOR (Bearer token), no por el RPC (auth.uid). La escritura real la hace el worker (diferida), respetando el límite de segundos del /ask.
- **Deferido consciente**: auto-follow-up desde un hallazgo (el agente auto-creándose un schedule) NO se cableó — la infra de agenda existe, falta darle al agente una tool para auto-programarse. La programación EXPLÍCITA (dueño) sí anda. Entrega "avisame": hoy el resultado queda en la Agenda (last_result) y las acciones en Pendientes; el push por WhatsApp/email es pieza aparte (skill reportes-automaticos).

### [2026-07-14]: Gran parte de la espina ya estaba construida por PRP-014
- **Hallazgo**: la cola `orq.pending_operations`, el RPC de aprobación, las capabilities E/F y el `enqueuePendingOperation` ya existen. El trabajo de Fase 1 NO es crear la cola desde cero — es (a) escritura en Google, (b) el **ejecutor de lo aprobado** (eslabón faltante que hace que aprobar tenga efecto), (c) reemplazar el stub del motor interactivo, (d) UI en la extensión.
- **Aplicar en**: no re-modelar `pending_operations`; reusar el patrón del handler `specialist` para el enqueue.

---

## Gotchas

- [ ] **Permisos del Service Account**: la SA escribe solo en archivos que posee o donde tiene rol de editor. Para escribir en los Sheets de negocio reales, cada archivo destino debe estar **compartido con edición** a la SA. Verificar antes de prometer escritura sobre un archivo existente; si no tiene permiso, la operación debe fallar con un mensaje claro, no en silencio.
- [ ] **WRITE_SCOPES separados**: no ampliar el scope global a `drive` full; usar el mínimo (`drive.file` / `spreadsheets`) y documentar por qué. Cambiar scopes puede requerir re-consentir la SA.
- [ ] **Idempotencia del ejecutor**: dedupe por `pending_operation_id` y estado; aprobar/reintentar no debe duplicar el efecto (append de una fila dos veces es el riesgo típico).
- [ ] **La extensión no tiene `auth.uid()`**: no puede llamar el RPC `orq_operation_action`; sus acciones van por el motor (`/operation`) con el Bearer token. No exponer `service_role` al cliente.
- [ ] **Tiempos**: `/ask` y `/operation` deben responder en segundos (Vercel `maxDuration=60`, túnel ~100s). La escritura real y los trabajos multimedia grandes van al worker (async), no en el request.
- [ ] **Límite de body**: el motor hoy corta el body en 1e6 bytes; la ingesta multimedia (F2) necesita subir ese techo o usar upload por partes / almacenamiento intermedio.
- [ ] **`drive.delete` es `forbidden` (Nivel F)**: nunca autónomo ni siquiera con aprobación por la vía normal; si alguna vez se necesita borrar, es un flujo aparte con doble confirmación explícita — no aflojar la policy.
- [ ] **No tocar el "cerebro"**: `review.mjs` protege `.claude/`, `CLAUDE.md` y migraciones de escritura autónoma. Las tools de Drive escriben en el Drive de negocio, no en el repo; mantener esa separación.

## Anti-Patrones

- NO crear una tabla nueva para pendientes: `orq.pending_operations` ya existe.
- NO duplicar el enqueue: extraer el de `specialist.mjs` a un lib y reusar.
- NO reconstruir el ruteo a especialistas: reusar `skill-map` + `specialist`.
- NO ejecutar el efecto externo dentro del RPC/aprobación: aprobar solo marca `approved`; el ejecutor (worker) corre el efecto de forma diferida e idempotente.
- NO ampliar el scope de Google más de lo necesario.
- NO ejecutar Nivel E sin aprobación humana; NO relajar la policy para "que sea más cómodo".
- NO ignorar errores de TypeScript ni omitir validación Zod en inputs de la extensión.

---

*PRP pendiente de aprobación. No se ha modificado código.*
