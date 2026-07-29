# PR-3 · Cierre de los bloqueantes de la auditoría

> Implementación de M1, M2, M3, M4, M7, M10 y M11 más las consistencias derivadas,
> sin cambiar la arquitectura Ports & Adapters ni ampliar el alcance del PR-3. No
> se conectó ningún especialista ni Work Fabric productivo. Todo dentro de
> `communication-service/`. Sin push/merge; WT-1 y la rama estable intactos.

## Estado por ajuste

| M | Ajuste | Estado | Dónde |
|---|---|---|---|
| **M1** | Idempotencia saliente por intención (no por contenido) | ✅ Cerrado | `core/eventos-canonicos.mjs` |
| **M2** | Dedup entrante atómico (gate en el insert) | ✅ Cerrado | `core/communication-service.mjs` · `events/repositorio-*` |
| **M3** | DLQ de ingesta entrante (inbox + retry + replay) | ✅ Cerrado | `core/communication-service.mjs` · `events/cola-*` |
| **M4** | Claim durable del outbox con lease | ✅ Cerrado | `events/cola-memoria.mjs` · `events/cola-postgres.mjs` |
| **M7** | Seguridad entrante (HMAC + anti-replay + allowlist + auditoría) | ✅ Cerrado | `integrations/seguridad-entrante.mjs` |
| **M10** | Puente explícito con `orq.events` | ✅ Cerrado | `integrations/puente-eventos.mjs` |
| **M11** | Tests reales del repositorio Postgres | ✅ Cerrado | `events/repositorio-postgres.pg.test.mjs` · `scripts/test-postgres.mjs` |

## 2. Archivos modificados / agregados

**Modificados:** `core/eventos-canonicos.mjs` (M1), `core/outbox.mjs` (estados `en_proceso`/`procesado`, `estadoOk`), `core/communication-service.mjs` (M2/M3/M4/M7/M10 + `await aCanonico`), `core/puerto-adapter.mjs` (aCanonico async), `events/repositorio-memoria.mjs` y `events/repositorio-postgres.mjs` (puerto unificado), `src/index.mjs`, `scripts/demo-e2e.mjs`, `package.json`, `db/migrations/0001_comunicacion.sql`, `db/rollback/0001_comunicacion_down.sql`, y los tests de `eventos-canonicos` y `communication-service`.

**Agregados:** `events/cola-memoria.mjs`, `events/cola-postgres.mjs`, `integrations/seguridad-entrante.mjs`, `integrations/puente-eventos.mjs`, `scripts/test-postgres.mjs`, y los tests `seguridad-entrante.test.mjs`, `puente-eventos.test.mjs`, `repositorio-postgres.pg.test.mjs`.

## 3. Migraciones

Una sola migración, `db/migrations/0001_comunicacion.sql` (reescrita al esquema final; **nunca aplicada a producción**, se aplica en PR-4). Cambios vs. la versión auditada: columnas de lease (`estado` con `en_proceso`, `claimed_by`, `claimed_at`, `lease_expires_at`) en `outbox`; nueva tabla `inbox` (cola de entrada simétrica); nueva `rechazos_entrantes` (auditoría M7); `dead_letter` con columna `cola` (salida/entrada) + `correlation_id`/`causation_id`; se eliminaron las RPCs `emit`/`claim_outbox` (la lógica de claim-con-lease e insert atómico vive en el repositorio, en SQL parametrizado testeable). Rollback: `drop schema comunicacion cascade`.

## 4. Semántica final de idempotencia (M1)

La identidad de un evento **nunca es su contenido**. `construirEvento` resuelve la clave así:
1. `idempotency_key` explícita (clave de negocio del emisor) — gana.
2. `intent_id` ⇒ `intent:<intent_id>` (una intención de negocio).
3. el `id` del evento (único por emisión).

Consecuencias: dos mensajes idénticos con `id` distinto **se envían los dos**; un reintento reusa el mismo objeto evento (mismo `id`/clave) y **se deduplica**; canales distintos ⇒ claves distintas. Para eventos **entrantes**, la clave es la **identidad natural** del hecho externo (`post_id`/`trigger_id`), no el texto. A nivel base, `unique(idempotency_key)` la hace efectiva.

## 5. Semántica final del lease (M4)

Reclamar es una **operación atómica** que flipea `pendiente → en_proceso` y setea `claimed_by`/`claimed_at`/`lease_expires_at` en la MISMA transacción que selecciona (`UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING`). Devuelve **sólo** las filas efectivamente reclamadas ⇒ dos workers concurrentes obtienen conjuntos disjuntos. El ítem se marca `publicado`/`procesado` **sólo tras confirmar el adapter/handler**; un error lo devuelve a `pendiente` (con backoff) o a `dead`. Si un worker muere, `recuperarLeases()` devuelve a `pendiente` las filas `en_proceso` con `lease_expires_at` vencido (reclamables de nuevo). No hay bloqueo indefinido. Verificado en memoria y contra Postgres real (dos workers concurrentes, recuperación de lease).

## 6. Semántica final de retry y DLQ entrante (M3)

La entrada es ahora una cola durable (`inbox`) simétrica al outbox. `recibir()` **audita y encola**, no despacha inline. `procesarInbox()` reclama con lease, corre los handlers y aplica la MISMA política (`decidirProximo`): éxito ⇒ `procesado`; fallo reintentable ⇒ `pendiente` con backoff exponencial; agotado `MAX_INTENTOS` (6) o permanente ⇒ `dead` + copia a `dead_letter` (con `event_id`, `correlation_id`, `causation_id`). **Replay manual** (`reprocesarEntrada(ref)`) devuelve un muerto a `pendiente`; como el evento y el puente son idempotentes, reprocesar no duplica el efecto. Un handler que falla **no pierde el mensaje**. (En PR-3 no corre un worker permanente: se entrega la infraestructura y los tests.)

## 7. Firma HMAC y anti-replay (M7)

`VerificadorEntrante.verificar({ rawBody, firma, timestamp, ip })`:
- **HMAC-SHA256** de `` `${timestamp}.${rawBody}` `` (cuerpo **bruto**) con secreto compartido; comparación en **tiempo constante** (`timingSafeEqual`, con guarda de longitud). Un body alterado cambia el HMAC ⇒ `firma_invalida`.
- **Timestamp** dentro de una ventana (default 300 s) ⇒ si no, `timestamp_vencido`.
- **Anti-replay**: una firma válida no se acepta dos veces dentro de la ventana ⇒ `replay`.
- **Allowlist** de IP/red opcional ⇒ `ip_no_permitida`.
- **Fail-closed**: sin secreto y sin `modoDev` explícito ⇒ `secreto_faltante` (rechaza). El modo dev local es explícito y seguro.
- Cada rechazo se **audita** (`comunicacion.rechazos_entrantes` / `repo.registrarRechazo`) con motivo estructurado + IP + **prefijo** de firma (nunca la firma completa ni el secreto). Motivos: `firma_invalida | firma_faltante | timestamp_vencido | replay | ip_no_permitida | secreto_faltante`.

El servicio enforcea el verificador si se le inyecta uno; los rechazos ya no se cuentan como "ignorada" (que es sólo el eco benigno del propio bot).

## 8. Diseño final del puente con orq.events (M10)

No hay una tercera fuente de eventos. **`comunicacion.eventos`** es la verdad de la *comunicación* (qué pasó en el chat); **`orq.events`** es la verdad del *trabajo* del OS. El puente es un **traductor unidireccional para la entrada**: `aEventoOrq(ev)` mapea un evento canónico entrante ya deduplicado a un evento del OS (`type = comunicacion.<tipo>`, `causation_id = ev.id`, `correlation_id` preservado, `payload.comm_event_id` como clave de dedup end-to-end). `PuenteOrqEvents` recibe `emitEvent` **inyectado** (nunca importa el orquestador); `PuenteMemoria` es el fake para demo/tests y deduplica por `comm_event_id`.

- **Quién publica / consume:** entrada — el Communication Service publica al puente; el OS consume el `orq.event` y decide (PR-4). Salida — el OS emite un evento canónico saliente por la API del servicio; el puente no interviene.
- **Dónde está la verdad:** el hecho de chat en `comunicacion.eventos`; el trabajo derivado en `orq.events`.
- **Doble procesamiento:** evitado en dos capas — el inbox deduplica (M2, una sola llegada al puente) y el consumidor del OS deduplica por `comm_event_id` (el replay reusa el id).
- **Caída de un lado:** si el OS/puente falla, el inbox reintenta y, agotado, va a DLQ (M3): el mensaje no se pierde. Si el chat cae, la salida queda en el outbox y se entrega al recuperarse (M4).

## 9. Tests ejecutados y resultados

| Suite | Comando | Resultado |
|---|---|---|
| Unit + integración (memoria, hermético) | `npm test` | **65 pass · 0 fail · 11 skip** (los PG, sin base) |
| Integración Postgres REAL (docker efímero) | `npm run test:pg` | **11 pass · 0 fail** (migración, insert atómico, append-only, claim concurrente 2 workers, retry, DLQ con correlation/causation, recuperación de lease, replay, encolado idempotente, rollback transaccional, consistencia PG↔memoria) |
| Demo end-to-end | `npm run demo` | **7/7 criterios** (5 del PR-3 + hilo causal + rechazo HMAC auditado) |
| Sintaxis | `node --check` (todos los `.mjs`) | OK |
| Acoplamiento | grep imports | 0 imports al orquestador; repo Postgres con port inyectado |

## 10. Consistencias adicionales verificadas

`registrarEvento` devuelve `insertado` **real** (ON CONFLICT DO NOTHING RETURNING en Postgres; check-and-set atómico en memoria) — ya no siempre `true`. `emitir` y `encolar` tienen responsabilidades **separadas y simétricas** en ambos repos (auditar vs. encolar). `aCanonico` es **async-capable** (`await` en el servicio). Los errores de autenticación quedan **auditados**. No hay pérdida silenciosa de mensajes (outbox + inbox + DLQ). Memoria y Postgres cumplen el **mismo puerto** (test de consistencia). Sin imports cruzados nuevos. Ningún archivo supera el límite (máx. 234 líneas).

## 11. Riesgos remanentes (no bloqueantes para PR-4)

- **M6** (idempotencia entrante sin `post_id`/`trigger_id`), **M9** (direccionamiento agnóstico para Email/WhatsApp), **M8** ya resuelto (aCanonico async), **M12–M15** (fuga de IDs en props, retención de outbox, ruteo de deep-links, orden por conversación): quedan como P1/P2 planificables con PR-4/PR-5. Ninguno bloquea la integración.
- El worker permanente que corre `procesarOutbox`/`procesarInbox` en loop y la aplicación de la migración en la base son parte del **wiring de PR-4/PR-9**, no de PR-3.
- El consumidor del OS debe deduplicar por `comm_event_id` (contrato del puente) — se implementa en PR-4.

## 12/13. Confirmaciones

- **No se inició PR-4.** No se conectó Director IA, CFO, especialistas ni Work Fabric productivo.
- **Sin push, sin merge, sin cambios en producción.** WT-1, rama estable de Mattermost y Finance intactos. Todo dentro de `feature/pr3-communication-layer`.
