# PR-4 · Enlace Communication Service ↔ Work Fabric

> Conexión **real y mínima** entre el Communication Service (PR-3, congelado en `735088e`) y el Work
> Fabric del Business OS. Primer flujo vertical de punta a punta: `@os estado del sistema`. **No** integra
> especialistas/CFO/ejecución financiera; **no** modifica producción; **no** hay mocks entre el
> Communication Service y el Work Fabric.

## 1. Arquitectura implementada

```
Mattermost (webhook / mención)
   │  raw body + firma HMAC + timestamp
   ▼
Communication Service (PR-3)  ── recibir() ── [seguridad M7: HMAC/ts/anti-replay/allowlist/allow-audit]
   │  evento canónico → comunicacion.eventos (dedup atómico) + comunicacion.inbox (durable)
   ▼  procesarInbox()  →  handler entrante = PuenteOrqEvents.publicarHaciaOS
Bridge (M10, emitEvent inyectado = ingesta-os.mjs)   ── MECANISMO OFICIAL, sin escritura directa ──
   │  orq.emit_event('comunicacion.mensaje.recibido')  +  orq.enqueue_task('comunicacion.responder')
   │  dedup end-to-end: dedupe_key = comm:<comm_event_id>
   ▼
Work Fabric (orq.tasks)  ── procesarWorkFabric(): claim_task → handler → transition ──
   │  handler REAL `comunicacion.responder` (registrado en handlers/index.mjs)
   │  lee DATOS REALES de orq (estado-sistema.mjs) → produce la respuesta
   ▼  ctx.responderComunicacion(respuesta)  →  svc.emitir(MENSAJE_RESPONDER)
Communication Service  ── comunicacion.outbox (durable, lease) ── procesarOutbox()
   ▼
Mattermost  ── post en el MISMO hilo (root_id), con correlation/causation/comm_event_id preservados
```

**Regla de dependencia respetada:** el OS (composition root, `orquestador/comunicacion/`) importa el
Communication Service; el Communication Service **nunca** importa el OS. El puente usa `emitEvent`
inyectado; el repositorio Postgres recibe el pool inyectado. No hay capa de eventos paralela.

## 2. Contrato de eventos (verificado end-to-end)

| Etapa | Tabla / mecanismo | Clave de idempotencia | correlation_id | causation_id |
|---|---|---|---|---|
| Mensaje entrante | `comunicacion.eventos` (inbound) | identidad natural (`post_id`) | raíz del hilo (= id del evento) | — |
| Cola de ingreso | `comunicacion.inbox` | `idempotency_key` (unique) | heredado | — |
| Hecho en el OS | `orq.events` (`comunicacion.mensaje.recibido`) | `payload.comm_event_id` | preservado | = id del evento de comunicación |
| Trabajo del OS | `orq.tasks` (`comunicacion.responder`) | `dedupe_key = comm:<comm_event_id>` (idempotente) | (propio del task) + en `inputs` | = id del evento de comunicación |
| Respuesta | `comunicacion.eventos` (outbound) + `comunicacion.outbox` | intención `respuesta:<comm_event_id>` | = correlation del entrante | = id del evento de comunicación |
| Post en el chat | Mattermost (root_id = post original) | — | en `props.os_correlation_id` | — |

- **Evento original:** el mensaje de Mattermost, materializado como evento canónico entrante en
  `comunicacion.eventos`. Su `id` es la `comm_event_id`.
- **Dueño de cada estado:** el Communication Service es dueño de `comunicacion.*`; el Work Fabric es dueño
  de `orq.*`. El puente traduce; nadie escribe las tablas internas del otro salvo por sus RPCs oficiales.
- **Doble procesamiento:** imposible en tres capas — (1) dedup atómico entrante (M2); (2) `dedupe_key`
  idempotente del task (comm_event_id); (3) idempotencia de la respuesta por intención (`respuesta:<id>`).
- **Caída de un lado:** si el OS cae, el `inbox` reintenta y agota a DLQ de entrada (no se pierde el
  mensaje del usuario). Si Mattermost cae, la respuesta queda en `outbox` y se publica al recuperarse. Un
  worker que muere libera su lease y otro retoma (verificado).

## 3. Archivos

**Nuevos (`echegaray-os/orquestador/comunicacion/`):** `estado-sistema.mjs` (respuesta real del OS),
`ingesta-os.mjs` (`emitEvent` oficial: dedup + emit_event + enqueue_task), `conector.mjs` (composition
root), `worker-comunicacion.mjs` (worker de larga duración), `aplicar-esquema.mjs` (esquemas orq+comm en
PG descartable), `test-pr4.mjs` (runner), `conector.pr4.test.mjs` (18 casos), `demo-pr4.mjs`. **Nuevo
handler:** `orquestador/handlers/comunicacion.mjs`. **Modificado (aditivo):** `orquestador/handlers/index.mjs`
(registra `comunicacion.responder`).

## 4. Variables de entorno

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Pool del OS (Work Fabric + comm-service comparten pool). |
| `ORQ_DB_SSL` | `0` para el PG descartable local; `1` (default) para el pooler de Supabase. |
| `MM_INCOMING_SECRET` | Secreto HMAC del webhook entrante (M7). **Fuera del repo.** Sin él y sin `COMM_DEV=1`, fail-closed. |
| `MM_INCOMING_WINDOW` | Ventana anti-replay en segundos (default 300). |
| `MM_INCOMING_ALLOWLIST` | IPs/prefijos permitidos (coma-separado). |
| `MM_INCOMING_TOKEN` | Token del outgoing webhook (verificación de origen a nivel adapter). |
| `MM_BOT_TOKEN` / `MM_BOT_USER_ID` | Bot @os para publicar / ignorar su eco. |
| `COMM_DEV` | `1` habilita el modo dev del verificador (sólo local, sin secreto). |
| `COMM_WORKER_IDLE_MS` / `COMM_WORKER_BUSY_MS` | Cadencia del worker (backoff ocioso vs. con trabajo). |

## 5. Migraciones

Ninguna migración nueva del lado OS. Se reutiliza la migración `comunicacion` (PR-3) y el esquema `orq`
existente. `aplicar-esquema.mjs` aplica `orq` (fundacion + ledger) + `comunicacion` a un **Postgres
efímero descartable** para tests/demo. **No se toca la base productiva.**

## 6. Workers

`worker-comunicacion.mjs`: proceso de larga duración (systemd-ready, **no activado**). Cada tick:
recupera leases vencidos (comm + Work Fabric) → `procesarInbox` → `procesarWorkFabric` → `procesarOutbox`.
Idempotente (todo el estado en la base), tolerante a reinicios, shutdown limpio (SIGTERM/SIGINT), sin
loop agresivo (backoff ocioso hasta 15 s; sigue pronto si hubo trabajo). No depende de sesión interactiva.

## 7. Seguridad

HMAC-SHA256 sobre el **raw body** + timestamp + ventana anti-replay + comparación en tiempo constante +
allowlist + **fail-closed** por defecto + auditoría estructurada de cada rechazo (`comunicacion.rechazos_entrantes`,
sólo prefijo de firma, nunca el secreto). No se relajó ningún control para la demo (la demo firma de
verdad). Secretos por entorno, fuera del repo.

## 8. Observabilidad

Logs estructurados con `correlation_id` en cada hop; métricas (contadores/observaciones) del comm-service;
`props.os_correlation_id` + `os_event_id` en cada post para seguir el hilo del chat al evento del OS; y la
cadena `comunicacion.eventos → orq.events → orq.tasks → comunicacion.eventos(outbound) → post` reconstruible
por `comm_event_id`/`causation_id` (test 18 lo verifica).

## 9. Retry y DLQ

Entrada (`inbox`) y salida (`outbox`) comparten la política: reintentos con backoff exponencial (techo 5
min, `MAX_INTENTOS=6`), lease durable, y DLQ (`comunicacion.dead_letter`, columna `cola`). El Work Fabric
usa su propio reintento oficial (`fail_task` → backoff → re-claim). Replay manual entrante seguro
(`reprocesarEntrada`), idempotente por `comm_event_id`.

## 10. Despliegue (staging / prueba controlada — NO producción sin autorización)

1. Aplicar la migración `comunicacion` en la base (ventana controlada). El esquema `orq` ya existe.
2. Configurar env (`MM_INCOMING_SECRET`, `MM_BOT_TOKEN`, `MM_BOT_USER_ID`, `MM_INCOMING_TOKEN`).
3. Crear el outgoing webhook de Mattermost apuntando al endpoint entrante (por la red privada), con el
   secreto HMAC. **[Pendiente: bindear `recibir()` a una ruta HTTP — es transporte, no lógica; PR-4.1.]**
4. Correr `worker-comunicacion.mjs` como unidad systemd donde fluyen las tareas de comunicación.
5. Verificar: mandar `@os estado del sistema` en un canal de prueba y ver la respuesta en el hilo.

## 11. Rollback

- Detener `worker-comunicacion` (nada se pierde: queda en las colas).
- Desactivar el outgoing webhook (deja de entrar tráfico).
- Quitar `comunicacion.responder` del registry si se quiere desconectar el Work Fabric (aditivo, seguro).
- Revertir la migración `comunicacion` con su `down` si corresponde (`drop schema comunicacion cascade`;
  no afecta `orq.*` ni `public.*`). Reversible.

## 12. Riesgos remanentes

- **Topología de worker en producción:** `procesarWorkFabric` usa `claim_task` (oficial), que reclama
  cualquier tarea `ready`. En el entorno de prueba sólo hay tareas de comunicación. Para producción hay
  dos caminos, a decidir en la prueba controlada: (a) que el **worker principal** procese las tareas
  `comunicacion.responder` (el handler ya está registrado) inyectándole `ctx.responderComunicacion`; o
  (b) un claim con filtro por tipo. **No resuelto en PR-4 a propósito** (requiere decisión + la prueba
  productiva autorizada).
- **Endpoint HTTP entrante:** `recibir()` implementa toda la lógica; falta bindearlo a una ruta (transporte).
- **`estado-sistema`** reporta sólo datos que existen; "Modo cerebro" y "última tarea" dan "sin dato" en
  el entorno mínimo (correcto: nunca inventa). En producción leerán los valores reales.
- **Push móvil / SMTP / HSTS** y demás endurecimientos siguen fuera de alcance (PR-2/PR-9).

## 13. Alcance de PR-5

Comandos determinísticos de dominio (`/os caja`, `/os obra`) apoyados en los **tools existentes** del OS
(sin especialistas todavía), identidad→rol real para autorizar comandos, y el binding del endpoint HTTP
entrante. La expansión a especialistas (CFO/Compras/RRHH) y multimedia→Drive es posterior.
