# PRP-014: Especialistas IA como Operadores sobre Drive y Gmail

> **Estado**: PENDIENTE
> **Fecha**: 2026-07-13
> **Proyecto**: Echegaray Business OS — Work Fabric (orquestador)

---

## Objetivo

Convertir a los especialistas IA (CFO, Contador, Abogado, ...) de analistas texto→texto en **operadores** que leen, redactan y operan sobre Google Drive y Gmail (cuentas @gmail y @ecsas) a través del Work Fabric, con tool-use en el motor `anthropic-api`, credencial propia en la VM (patrón `anthropic.env`), clearance por capacidad usando el `policy_decide()` existente, y una cola de aprobación con pantalla para Dirección. Primer valor concreto: el **CFO IA lee la posición de caja real** del Sheet `Flujo de Caja - Cash Flow` (SALDO TOTAL DISPONIBLE y CAPITAL DE TRABAJO) y **deja de decir "desconocido"**.

## Por Qué

| Problema | Solución |
|----------|----------|
| El CFO IA responde "desconocido" sobre la caja porque `situation.mjs` solo lee `movimientos_caja` de Supabase; el saldo real vive en un Sheet no ingerido | `drive.read` (auto) permite al CFO leer las celdas reales del Sheet y razonar sobre el dato verdadero, con fuente y confianza declaradas |
| Los especialistas son texto→texto: producen análisis pero no pueden tocar el mundo (leer un archivo, dejar un borrador, mandar un mail) | Tool-use en el motor `anthropic-api` + ejecutor de herramientas en el worker, cada tool tipada como capacidad y filtrada por `policy_decide()` |
| Los `approval_requests` de hoy son eventos informativos: nadie puede aprobar/ejecutar la operación concreta | Cola de operaciones pendientes con el payload/borrador real + pantalla de Dirección que aprueba/rechaza y dispara la ejecución diferida (Nivel E) |
| Riesgo de que una IA ejecute efectos externos irreversibles o filtre secretos | `drive.write`/`mail.send` = E (requiere aprobación); `drive.delete` = F (nunca autónomo); credencial fuera de git (patrón `anthropic.env`); `policy_decide` nunca relaja F |
| Riesgo de crear una "realidad" paralela entre Drive, Supabase y el OS | Toda lectura de Drive se registra como evidencia con fuente + confianza y se concilia contra la fuente de verdad interna, sin duplicar el cálculo (Principio de Realidad Única) |

**Valor de negocio**: desbloquea el Nivel A–E controlado para 11 especialistas sobre las dos fuentes donde vive el trabajo real de Echegaray (Drive + mail). Elimina el trabajo humano de copiar datos de Sheets al OS y de redactar/mandar mails rutinarios, manteniendo la aprobación humana para todo efecto externo. Mensurable primero en un caso: el CFO reporta caja real (saldo + capital de trabajo) en vez de "desconocido".

## Qué

### Criterios de Éxito
- [ ] El motor `anthropic-api` soporta tool-use: acepta `job.tools` + un ejecutor inyectado, corre el loop agéntico (`stop_reason: 'tool_use'` → ejecutar → `tool_result` → continuar) y sigue devolviendo el mismo `EngineResult` del port neutral cuando no hay tools (retrocompatibilidad total).
- [ ] Cada tool ejecutada por el worker pasa por `decide(capability, principalId)` antes de correr: `auto` ejecuta, `requires_approval` encola, `forbidden`/`drive.delete` nunca ejecuta.
- [ ] Existen las capacidades nuevas en `orq.capabilities` con clearance/blast correctos: `drive.read` (auto), `doc.create`/`drive.draft`/`mail.draft` (propone/auto, produce borrador sin efecto externo), `drive.write`/`mail.send` (E, requires_approval), `drive.delete` (F, forbidden).
- [ ] La credencial de Google vive en `~/.config/echegaray-orq/google.env` (o service-account fuera del repo), nunca en git ni en logs; hay soporte para las dos cuentas (@gmail personal y @ecsas trabajo).
- [ ] **El CFO IA lee el Sheet `Flujo de Caja - Cash Flow` y usa SALDO TOTAL DISPONIBLE y CAPITAL DE TRABAJO reales en su análisis**, con fuente y confianza declaradas, sin decir "desconocido".
- [ ] Una operación que requiere aprobación (ej. `mail.draft` → `mail.send`) aparece en la cola con su payload real; Dirección la aprueba/rechaza desde una pantalla; al aprobar, el worker ejecuta la operación diferida.
- [ ] `npm run typecheck` y `npm run build` pasan; los tests del motor y de policy pasan; ningún secreto aparece en el diff.

### Comportamiento Esperado
El Director asigna una tarea `specialist` al CFO ("¿cuál es nuestra posición de caja hoy?"). El handler arma el system (gobernanza + skill `finanzas-tesoreria-construccion`) y corre el motor `anthropic-api` **con tool-use habilitado**. El modelo pide `drive.read` sobre el Sheet `Flujo de Caja - Cash Flow`; el worker consulta `decide('drive.read', cfg_cfo)` → `auto`, ejecuta la lectura con la credencial @ecsas, devuelve las celdas SALDO TOTAL DISPONIBLE y CAPITAL DE TRABAJO como `tool_result`. El modelo razona sobre el dato real, lo concilia con `movimientos_caja` de Supabase, y responde con la caja real + fuente + confianza. Si además propone mandar un mail de alerta, emite `mail.draft` (auto, deja el borrador) y una operación `mail.send` que cae en la cola de aprobación. Dirección abre la pantalla, ve el borrador, aprueba; el worker ejecuta `mail.send` con la cuenta correspondiente y registra el evento.

---

## Contexto

### Referencias (código real existente)
- `orquestador/engines/anthropic-api.mjs` — motor Reasoner; hoy llama `api.messages.create` **sin** `tools` (líneas 132–141). Punto de inserción del tool-use loop.
- `orquestador/engines/index.mjs` — port neutral de dos motores (`anthropic-api` negocio, `claude-cli` dev, `fixture` tests). El contrato `run(job, ctx)` no debe romperse.
- `orquestador/lib/policy.mjs` — `decide(capabilitySlug, principalId, blastOverride)` → `'auto'|'requires_approval'|'forbidden'` (delega en SQL puro).
- `supabase/migrations/20260711120000_orq_fundacion_work_fabric.sql` — `orq.capabilities`, `orq.autonomy_levels` (A–F), `orq.principals` (clearance), `orq.policy_decide()`, state machine con `awaiting_approval`/`approved`/`rejected`.
- `supabase/migrations/20260712130000_orq_f5_ui_control.sql` — `orq.human_action` / `public.orq_task_action(task_id, action, note)` (RPC autenticado, base de la aprobación humana a nivel tarea).
- `supabase/migrations/20260712120000_orq_f3_planner_agents.sql` — `orq.agents` (incluye `allowed_tools`, `context_ref`, `secret_scope` en capabilities), `orq.agent_capabilities`, `orq.model_routes`.
- `supabase/migrations/20260713120000_orq_organizacion_ia.sql` — seed de especialistas (cfo/contador/abogado...), `org_title`, capacidades `advise.*`, vista `public.orq_org`.
- `orquestador/handlers/specialist.mjs` — handler del especialista; hoy READ-ONLY texto→texto; gate `decide()` que **lanza** si no es `auto`; `approval_requests` emitidos solo como eventos.
- `orquestador/lib/situation.mjs` — `assembleSituation`/`domainDigest`; el bloque CAJA (líneas 35–40) NO tiene saldo ni capital de trabajo (viven en el Sheet). Causa del "desconocido".
- `orquestador/systemd/echegaray-orq-worker.service` — patrón `EnvironmentFile=-%h/.config/echegaray-orq/anthropic.env` a replicar para Google.
- `src/app/(main)/organizacion/page.tsx` + `src/features/organizacion/services/organizacionService.ts` — dónde se renderiza el trabajo y los `approval_requested`; base de la nueva pantalla de cola.
- `src/features/orquestador/components/TaskActions.tsx` — patrón de acción humana (llama `orq_task_action`).
- Skill `finanzas-tesoreria-construccion` + `lectura-drive-documentos-multiformato` + `integraciones-apis-sistemas-externos` + `arquitectura-integracion-finanzas-obras` — criterio de dominio a inyectar/respetar.

### Arquitectura Propuesta

Cambios en el orquestador (VM, no en `src/features`):
```
orquestador/
├── engines/anthropic-api.mjs        # + tool-use loop (opt-in por job.tools)
├── lib/google.mjs                   # cliente Drive/Gmail, credencial por cuenta (@gmail/@ecsas)
├── lib/tools/                       # NUEVO: definición + ejecución de tools tipadas como capacidad
│   ├── index.mjs                    #   registry: slug -> {schema, run, capability}
│   ├── drive.mjs                    #   drive.read / drive.draft / doc.create / drive.write / drive.delete
│   └── mail.mjs                     #   mail.draft / mail.send
├── lib/tool-executor.mjs            # NUEVO: gate policy -> auto ejecuta | requires_approval encola | forbidden niega
├── handlers/specialist.mjs          # deja de ser texto→texto: corre el loop con el ejecutor policy-gated
└── systemd/*.service                # + EnvironmentFile google.env
```
Frontend (feature-first, solo lectura + una RPC de acción ya existente):
```
src/features/aprobaciones/           # NUEVO (o extensión de organizacion)
├── services/aprobacionesService.ts  # lee la cola, dispara approve/reject
├── components/ColaAprobacion.tsx
└── types/index.ts
src/app/(main)/aprobaciones/page.tsx # pantalla de Dirección
```

### Modelo de Datos (migración aditiva y reversible)

Capacidades nuevas (seed en `orq.capabilities`, sin duplicar el motor de policy):
```sql
-- drive.read      A / none      -> auto
-- drive.draft     C / low       -> auto   (borrador en Drive, sin efecto autoritativo)
-- doc.create      C / low       -> auto   (crea Doc borrador propio del OS)
-- mail.draft      C / low       -> auto   (borrador en Gmail, NO envía)
-- drive.write     E / high      -> requires_approval (edita/crea archivo autoritativo)
-- mail.send       E / high      -> requires_approval (envío externo)
-- drive.delete    F / critical  -> forbidden (nunca autónomo)
-- secret_scope por capacidad/agente: qué cuenta (@gmail | @ecsas) puede tocar cada especialista
```

Cola de operaciones pendientes (reusa el estado `awaiting_approval` + guarda el payload concreto):
```sql
create table orq.pending_operations (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references orq.tenants(id),
  task_id        uuid references orq.tasks(id),
  agent_slug     text not null,
  capability_slug text not null references orq.capabilities(slug),
  account        text not null,              -- 'gmail' | 'ecsas'
  target         jsonb not null,             -- destino (file_id, to, subject...)
  payload        jsonb not null,             -- borrador/cambio propuesto (evidencia para aprobar)
  status         text not null default 'awaiting_approval'
                   check (status in ('awaiting_approval','approved','rejected','executed','failed')),
  decided_by     uuid references orq.principals(id),
  created_at     timestamptz not null default now()
);
-- RLS: select authenticated, all service_role (mismo patrón que el resto de orq.*)
-- Vista public.orq_pending_operations + RPC public.orq_operation_action(id, action, note)
```

---

## Blueprint (Assembly Line)

> Solo FASES. Las subtareas se generan al entrar a cada fase (bucle agéntico).

### Fase 1: Tool-use en el motor `anthropic-api` (mecanismo puro, sin Google)
**Objetivo**: El motor acepta `job.tools` (definiciones) + `job.toolExecutor` (función async inyectada por el handler) y corre el loop agéntico de la Messages API, manteniendo intacto el contrato del port cuando no hay tools. El ejecutor es una caja negra para el motor: el motor no conoce policy ni Google.
**Validación**: Test con un cliente falso y una tool ficticia — el motor pide la tool, el ejecutor responde, el motor cierra con texto. `EngineResult` idéntico al actual cuando `job.tools` está ausente. Breaker/semáforo/costo siguen funcionando.

### Fase 2: Credencial e integración Google (Drive/Gmail) en el worker
**Objetivo**: `lib/google.mjs` con cliente autenticado por cuenta (@gmail y @ecsas), credencial leída de `~/.config/echegaray-orq/google.env` (o service-account fuera del repo), nunca en git ni en logs. Primero read-only: leer un Sheet/Doc/archivo por id o búsqueda. Wire de `google.env` en los `.service` de systemd.
**Validación**: El worker lee un Sheet real por id y devuelve valores de celdas; `.gitignore` cubre el secreto; ningún log imprime el token; el arranque no rompe si el env está ausente (patrón `-EnvironmentFile`).

### Fase 3: Capacidades, clearance por especialista y cola (migración aditiva)
**Objetivo**: Migración que siembra `drive.read`/`drive.draft`/`doc.create`/`mail.draft`/`drive.write`/`mail.send`/`drive.delete` en `orq.capabilities` con clearance/blast/disposition correctos; mapea `agent_capabilities` por especialista y `secret_scope`/`account` (qué cuenta puede tocar cada rol); crea `orq.pending_operations` + vista + RPC de acción. `policy_decide()` ya resuelve sin cambios.
**Validación**: `orq.policy_decide` devuelve `auto` para `drive.read`, `requires_approval` para `mail.send`, `forbidden` para `drive.delete`, por principal de especialista. Rollback `*_down.sql` presente.

### Fase 4: Especialista OPERADOR + primer valor CFO (lee la caja real)
**Objetivo**: `handlers/specialist.mjs` corre el loop de tool-use con `lib/tool-executor.mjs` (gate `decide()` por tool): `auto` ejecuta, `requires_approval` encola en `orq.pending_operations` (ya no lanza), `forbidden` niega. El CFO lee `Flujo de Caja - Cash Flow` (SALDO TOTAL DISPONIBLE, CAPITAL DE TRABAJO) vía `drive.read`; la lectura se registra como evidencia con fuente + confianza.
**Validación**: Una tarea `specialist` del CFO devuelve caja real (saldo + capital de trabajo) con fuente citada, **sin "desconocido"**. Las tools `forbidden` nunca corren; las `requires_approval` quedan encoladas, no ejecutadas.

### Fase 5: Cola de aprobación + ejecución diferida + pantalla de Dirección
**Objetivo**: Pantalla `(main)/aprobaciones` que lista `orq_pending_operations` con el payload/borrador legible; Dirección aprueba/rechaza vía RPC. Al aprobar, el worker ejecuta la operación diferida (`mail.send`/`drive.write`) con la cuenta correcta y marca `executed`; al rechazar, descarta. Reusa el patrón de `TaskActions`/`orq_task_action`.
**Validación**: `mail.draft` (auto) deja borrador → aparece en la cola → Dirección aprueba → `mail.send` se ejecuta a una dirección de prueba → estado `executed` + evento. Rechazo → `rejected`, sin envío.

### Fase 6: Coherencia Realidad Única + Validación Final
**Objetivo**: La lectura del Cash Flow se concilia/anota contra la fuente interna (`fuentes_datos` / `movimientos_caja`) sin crear un cálculo paralelo; fuente + confianza + fecha de lectura visibles en la UI. Confirmar que `drive.delete` es inejecutable y que no hay secretos en git.
**Validación**:
- [ ] `npm run typecheck` pasa
- [ ] `npm run build` exitoso
- [ ] Tests de motor (tool-use), policy y ejecutor pasan
- [ ] `git grep` no revela credenciales; `drive.delete` → `forbidden` confirmado
- [ ] Criterios de éxito cumplidos (CFO reporta caja real; cola aprueba y ejecuta)

---

## 🧠 Aprendizajes (Self-Annealing)

> Crece con cada error encontrado durante la implementación.

_(vacío — se completa durante `/bucle-agentico`)_

---

## Gotchas

- [ ] **No romper el port neutral**: el tool-use es opt-in por `job.tools`. Sin tools, el motor debe comportarse EXACTO como hoy (el handler `direction`/`plan`/`consolidate` no debe cambiar de comportamiento).
- [ ] **El modelo no ejecuta tools; el worker sí.** El motor solo transporta `tool_use`/`tool_result`. Toda ejecución pasa por `lib/tool-executor.mjs` → `decide()`. Nunca ejecutar una tool sin gate de policy.
- [ ] **Loop agéntico con techos**: límite de iteraciones y de costo (`maxCostUsd`/breaker) para que un especialista no entre en bucle de tool-use infinito. Cada vuelta cuenta tokens.
- [ ] **Secreto de Google fuera de git**: patrón `anthropic.env` (`EnvironmentFile=-...google.env`). Verificar `.gitignore`. Nunca loguear token ni contenido sensible de mails.
- [ ] **Dos cuentas (@gmail personal / @ecsas trabajo)**: cada especialista opera con la cuenta que le corresponde (`secret_scope`/`account`). El CFO sobre datos de empresa usa @ecsas. No mezclar credenciales.
- [ ] **Realidad Única**: `drive.read` del Cash Flow es lectura con fuente + confianza; NO se persiste como verdad económica paralela. Si se ingiere, va como candidato a conciliar contra `movimientos_caja`, no como cálculo nuevo (consultar `arquitectura-integracion-finanzas-obras`).
- [ ] **`mail.send`/`drive.write` son Nivel E**: SIEMPRE requieren aprobación humana explícita (CLAUDE.md raíz). `drive.delete` es F: nunca autónomo, ni siquiera con aprobación en esta fase.
- [ ] **Idempotencia de la ejecución diferida**: al aprobar, ejecutar una sola vez (dedup por `pending_operations.id`); reintentos no deben re-enviar un mail.
- [ ] **RLS obligatorio** en `orq.pending_operations` y su vista `public.*`, mismo patrón que el resto de `orq.*`.
- [ ] **Nombre del Sheet vs id**: `Flujo de Caja - Cash Flow` se resuelve por búsqueda una vez y se fija por `file_id` para no depender del nombre; las celdas SALDO TOTAL DISPONIBLE / CAPITAL DE TRABAJO deben localizarse por etiqueta, no por coordenada fija (validar con la skill `lectura-drive-documentos-multiformato`).

## Anti-Patrones

- NO crear un segundo motor ni un tercer port: el tool-use vive dentro de `anthropic-api`.
- NO duplicar el motor de policy: usar `orq.policy_decide` / `decide()` tal como está.
- NO crear una tabla paralela de caja: la posición de caja se lee, se cita y se concilia, no se re-modela.
- NO ejecutar efectos externos (mail.send/drive.write) sin pasar por la cola de aprobación.
- NO hardcodear file_ids, direcciones de mail ni tokens: config/env.
- NO omitir validación Zod en el payload de la cola ni en el input de las tools.
- NO ignorar errores de TypeScript ni loguear contenido sensible.

---

*PRP pendiente de aprobación. No se ha modificado código.*
