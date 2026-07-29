# PR-4.2 · Plan Bot + WebSocket (arquitectura definitiva)

> Planificación. **No se implementó código, no se desplegó, no se modificó producción** en este paso.
> Objetivo: reemplazar el transporte de ENTRADA (outgoing webhook) por un **Bot con conexión WebSocket
> permanente**, reutilizando TODO lo ya construido. Satisface los requisitos que el webhook no podía:
> mención `@os`, DMs, **canal privado**, hilos, miembro permanente — sin superficie de ataque inbound.

## 0. Idea central

El outgoing webhook fallaba porque MM sólo lo dispara en canales públicos. Con **Bot + WebSocket** el OS
se conecta SALIENTE a Mattermost (autenticado con el token del bot, sobre TLS) y **recibe** los eventos de
los canales/DMs donde el bot es miembro — incluidos **privados**. La autenticidad la da la conexión
autenticada; **no hay endpoint inbound**. Cambia únicamente **cómo entra el evento**; todo lo de aguas
abajo es idéntico.

## 1. Impacto exacto sobre lo ya construido

| Componente | Impacto |
|---|---|
| Communication Service (PR-3): eventos canónicos, inbox/outbox, lease, DLQ, dedup | **CERO** — se reutiliza tal cual |
| Contratos canónicos, correlation_id, causation_id, comm_event_id | **CERO** |
| Bridge `ingesta-os` (orq.emit_event + orq.enqueue_task, dedup por comm_event_id) | **CERO** |
| Work Fabric: lane `comunicacion`, handler `comunicacion.responder`, `estado-sistema` | **CERO** |
| Worker `worker-comunicacion` (procesa inbox → WF → outbox) | **CERO** (procesa las colas sin importar cómo se llenaron) |
| Publicación de respuestas: `MattermostCliente.crearPost` (hilo por `root_id`) | **CERO** |
| `MattermostAdapter.aCanonico` (mapeo → canónico) | **CERO** (el consumidor arma el payload que el adapter ya espera) |
| Migración de lane + schema `comunicacion` (ya aplicados en prod) | **CERO** — reutilizados |
| Endpoint HTTP (`servidor-entrante`, `endpoint-entrante`, `auth-endpoint`) | **NO se despliega** en esta arquitectura. NO se borra (validado; útil para inbound de terceros futuro con HMAC). |
| Auth por token/HMAC del endpoint | Queda como capacidad latente (no se usa con WS). |

**Conclusión:** el único cambio real es un **nuevo transporte de entrada** (consumidor WebSocket) que
alimenta el MISMO `con.recibir`. El 95% del sistema no se toca.

## 2. Archivos a modificar

**Nuevos (mínimos):**
- `orquestador/comunicacion/mattermost-ws-consumer.mjs` — cliente WebSocket + loop de eventos + guardas + mapeo.
- `orquestador/comunicacion/mattermost-ws-consumer.test.mjs` — tests herméticos (eventos fake, guardas, mapeo).
- `orquestador/comunicacion/deploy/echegaray-comunicacion-ws.service` — user-unit del consumidor (reemplaza a la del endpoint).

**Modificaciones menores:**
- `orquestador/comunicacion/deploy/env.example` — el camino WS usa `MM_BOT_TOKEN` + `MM_WS_URL`; ya no `MM_INCOMING_TOKEN`.
- (Posible) `conector.mjs` — sólo si conviene exponer un helper; probablemente **ninguna** (el consumidor
  importa `crearConector` con `verificador: null`, ya soportado, y usa `con.recibir`).

**Sin cambios:** adapter, bridge, handler, worker, migraciones, comm-service, contratos.

## 3. Componentes reutilizados (sin tocar)

Communication Service completo · contratos canónicos · inbox/outbox/lease/DLQ/dedup · `ingesta-os`
(bridge) · `comunicacion.responder` + `estado-sistema` · `worker-comunicacion` · `MattermostCliente`
(crearPost) · `MattermostAdapter` · lane (migración ya aplicada) · schema `comunicacion` · el canal
privado **os-pruebas** · el comando funcional **@os estado del sistema** · el checkout de deploy.

## 4. Código nuevo estrictamente necesario

**`mattermost-ws-consumer.mjs`** (usa `WebSocket` **nativo de Node v24** — sin dependencia nueva):
1. Conecta a `MM_WS_URL` (`ws://127.0.0.1:8065/api/v4/websocket` por red privada) y, al abrir, envía el
   `authentication_challenge` con `MM_BOT_TOKEN`.
2. Recibe eventos; procesa sólo `event === "posted"`; parsea `data.post` (string JSON) → post.
3. **GUARDAS (antes de crear cualquier evento canónico ⇒ costo cero para lo irrelevante):**
   - ignora si `post.user_id === MM_BOT_USER_ID` (eco propio, anti-loop);
   - ignora si **no** es DM (`data.channel_type !== 'D'`) **y** no menciona al bot (mentions/`@os`);
   - dedup por `post.id` (set reciente + idempotencia del inbox aguas abajo).
4. Mapea el post → `{ user_id, user_name, channel_id, channel_name, post_id: post.id,
   text: post.message, root_id: post.root_id || post.id }` y llama `con.recibir(payload, { plataforma:'mattermost' })`.
   La **autenticidad la garantiza la conexión saliente autenticada** (bot token + TLS): el conector se
   construye **sin verificador** (`verificador: null`, ya soportado) — no hay auth inbound que verificar.
5. **Reconexión** con backoff exponencial + ping/pong keep-alive + **shutdown limpio** (SIGTERM). Idempotente
   y tolerante a reinicios (el estado vive en las colas).

**`echegaray-comunicacion-ws.service`** (user-unit, sin sudo) — reemplaza a la unit del endpoint.

Todo lo demás (mapeo canónico, inbox, bridge, WF, outbox, publicación) ya existe y no se reescribe.

## 5. Riesgos

- **Eventos perdidos durante una desconexión** (MM WS no reenvía lo perdido): bajo impacto para un comando
  de estado; mitigación futura = reconciliación periódica. Se documenta, no se resuelve ahora.
- **El bot debe ser miembro del canal** para recibir sus eventos por WS → agregar el bot a `os-pruebas`.
- **Token del bot** en `comunicacion.env` (chmod 600, fuera del repo).
- **WebSocket nativo** estable en Node v24; si alguna vez cambiara, fallback `ws` (no requerido hoy).
- **Doble entrega** de eventos por MM → cubierto por dedup (`post.id` → idempotency_key → inbox).
- **Tormenta de reconexión** → backoff exponencial con techo.
- **Superficie de ataque inbound: ELIMINADA** (no hay endpoint HTTP escuchando) — es una mejora de seguridad.

## 6. Pruebas

- **Herméticas (sin red, sin DB):** parseo de eventos WS (`posted` vs otros), guardas (DM ✓, mención ✓,
  sin mención ✗, eco propio ✗), dedup por `post.id`, mapeo → payload → `recibir` → inbox (con
  `RepositorioMemoria`). Simulan mensajes WS crudos.
- **Integración (Postgres descartable):** un evento WS `posted "@os estado del sistema"` recorre el flujo
  vertical ya probado (20/20) hasta el post en `FakeMattermost`, preservando hilo/correlation/causation.
- **Cero-Anthropic:** aserción de que el camino determinístico no importa/llama ningún engine.
- Mantener verdes: comm-service 65/0/11, auth+endpoint 28/28, vertical+lane 20/20.

## 7. Secuencia de activación (cuando se autorice)

1. Crear bot **@os** (`mmctl --local bot create os --display-name "Business OS"`), generar token, obtener
   `user_id`. **Agregar el bot a `os-pruebas`** (para que reciba sus eventos).
2. Escribir `comunicacion.env` (600): `MM_BOT_TOKEN`, `MM_BOT_USER_ID`, `MM_WS_URL`, `DATABASE_URL`, `ORQ_DB_SSL`.
3. Instalar user-units (ws-consumer + worker): `systemctl --user daemon-reload && systemctl --user enable --now …`.
4. Validar: el consumidor loguea "WS conectado + autenticado"; el worker activo; sin errores.
5. **Prueba controlada:** Jorge escribe `@os estado del sistema` en `os-pruebas` (privado) → el bot
   responde en el hilo con datos reales.
6. Verificar trazabilidad (comm.eventos → orq.events → tarea → outbox → post) y **cero tokens Anthropic**.

## 8. Rollback

1. `systemctl --user disable --now echegaray-comunicacion-ws echegaray-comunicacion-worker`.
2. (Opcional) desactivar/quitar el bot del canal; revertir flags MM (`EnableBotAccountCreation` /
   `EnableUserAccessTokens` → false).
3. (Opcional, desactivación total) migraciones down: lane (`…_lane_down.sql`) + `drop schema comunicacion cascade`.
4. `git worktree remove /home/jorge/echegaray-os/deploy-comunicacion`.
5. Verificar: worker principal reclama normal (lane default); Mattermost y OS intactos. Nada de esto
   afecta al chat ni al OS principal.

## 9. Confirmación: Bot + WebSocket NO generan costo Anthropic en reposo

- La **conexión WS sólo recibe eventos**; no invoca Claude. Estar conectado = 0 tokens.
- Las **guardas descartan lo irrelevante ANTES** de crear un evento canónico: mensajes sin mención/DM,
  eco del bot y duplicados **no generan ni tarea ni procesamiento** ⇒ 0 costo.
- El comando `@os estado del sistema` ejecuta el handler **determinístico** `comunicacion.responder` →
  `estadoSistema` (sólo lecturas SQL de `orq`). **Verificado:** ese handler NO importa ni llama
  `engine`/`anthropic`/`claude` (grep confirmado). ⇒ **0 tokens Anthropic**.
- Anthropic sólo se invoca en los handlers IA del worker **principal** (`specialist`/`direction`/…), que
  la lane `comunicacion` **nunca encola** (sólo `comunicacion.responder`). La lane aísla el costo.
- **Guardas de costo para comandos que SÍ razonen (futuro, fuera de este alcance):** registrar tokens y
  costo por interacción, límite por usuario/día configurable, auditoría completa (ya existe base:
  `comunicacion.eventos` append-only + `orq.events` + logs con `correlation_id`). Puntos de enganche
  señalados; sin efecto hasta que exista un comando que invoque razonamiento.

---

**Estado de producción tras la parada (sin cambios nuevos en este paso):** migraciones `comunicacion` +
lane aplicadas y verificadas (retro-compatibles); canal privado `os-pruebas` creado; flags de bot/token
habilitados; **sin bot, sin webhook, sin servicios levantados**. Nada degradado. Esperando autorización
para implementar el plan.

---

## 10. Estado de IMPLEMENTACIÓN (autorizado)

Implementado exactamente según este plan (ver commit):
- `mattermost-ws-consumer.mjs` — WS nativo de Node v24 (sin dependencia nueva), `authentication_challenge`
  con el token del bot, guardas (eco propio / DM o mención / sistema), dedup por `post.id`, mapeo →
  `con.recibir`, reconexión con backoff, keep-alive por app-ping, shutdown limpio. Conector `verificador: null`.
- `mattermost-ws-consumer.test.mjs` — 18 tests herméticos (parser, guardas, dedup, mapeo→inbox, auth
  challenge, hello, reconexión con backoff, shutdown limpio) con WebSocket falso inyectado.
- `deploy/echegaray-comunicacion-ws.service` y `…-worker.service` — user-units (systemd --user), **sin
  `anthropic.env`** (refuerza cero-Anthropic); `deploy/env.example` — camino Bot+WS (sin `MM_INCOMING_*`/`COMM_HTTP_*`).

Suites verdes tras el cambio: comm-service 64 (53 + 11 skip PG) · auth+endpoint+ws 46 · integración PR4
(vertical + lane) 20 · nuevo WS 18. Lint 0/0 en los archivos nuevos.

**Sin cambios** en Communication Service, contratos, inbox/outbox/DLQ/dedup, bridge, Work Fabric, worker,
lane ni migraciones. El endpoint HTTP y su auth por token/HMAC quedan en el repo como capacidad latente,
**no se despliegan**.

### Cierre PR-4.2 — guarda fail-fast + operación

- **Guarda fail-fast del cliente Mattermost** (`resolverCliente` en `conector.mjs`): elimina el fallback
  silencioso a `FakeMattermost`. En producción, sin `MM_BOT_TOKEN`, los procesos **no arrancan**;
  `FakeMattermost` sólo con `opts.cliente` (tests) o `COMM_DEV=1` (dev). El conector loguea `tipo:
  real|fake` sin exponer el token. Tests: `conector-guarda.test.mjs` (7). `worker` y `ws-consumer`
  delegan la construcción del cliente en la guarda (fail-fast claro al iniciar).
- **Runbook operativo**: `docs/OPERACION-BOT-WEBSOCKET.md` (arquitectura, variables, secretos, servicios,
  comandos, rollback, rotación de token, alta de canales, diagnóstico recibe-pero-no-responde / outbox
  pendiente, prohibición de fallback falso, riesgo de desconexión WS).
