# Operación · Bot @os + WebSocket (PR-4.2)

Runbook operativo del enlace de comunicación definitivo entre Mattermost y el Business OS.
Arquitectura **Bot Account + WebSocket saliente**. Sin endpoint HTTP, sin webhook, sin slash commands.

## 1. Arquitectura final

```
Mattermost (echegaray-mm-app, loopback 127.0.0.1:8065)
   │  posted (WS)                                  ▲ POST /posts (cliente REAL, en hilo)
   ▼                                               │
[ws-consumer]  ── con.recibir ──►  comunicacion.inbox
   guardas: eco propio / DM-o-mención / sistema        │  (bridge: orq.emit_event + orq.enqueue_task)
   dedup por post.id                                    ▼
                                              orq.tasks (lane 'comunicacion')
                                                        │  claim filtrado por lane
                                                        ▼
                                           [worker-comunicacion]
                                             handler determinístico
                                             comunicacion.responder → estadoSistema (SQL puro)
                                                        │  responderComunicacion (evento saliente)
                                                        ▼
                                              comunicacion.outbox ── publica ──► Mattermost
```

- **Dos procesos, un solo pool (Supabase/orq):**
  - `ws-consumer` **INGRESA** (llena el inbox). No publica.
  - `worker-comunicacion` **DRENA** inbox → Work Fabric (lane `comunicacion`) → outbox → publica con el cliente REAL.
- **Desacople intacto:** Communication Service, contratos canónicos, inbox/outbox/DLQ/dedup, bridge y lane **no se tocan**.
- **Cero-Anthropic:** ninguno de los dos procesos carga `anthropic.env`; el handler `estadoSistema` sólo lee SQL de `orq`; la lane `comunicacion` nunca encola handlers IA.

## 2. Variables obligatorias

En `~/.config/echegaray-orq/comunicacion.env` (chmod **600**):

| Variable | Rol |
|---|---|
| `DATABASE_URL` | pool del Work Fabric (mismo Supabase que el OS) |
| `ORQ_DB_SSL` | `1`/`true` en Supabase |
| `MM_WS_URL` | `ws://127.0.0.1:8065/api/v4/websocket` (WS local; `wss://` si fuera TLS público) |
| `MM_BASE_URL` | `http://127.0.0.1:8065` (API REST local para publicar) |
| `MM_BOT_TOKEN` | token del bot @os — **obligatorio; sin él los procesos NO arrancan** |
| `MM_BOT_USER_ID` | user_id del bot (guarda anti-eco + mención por id) |
| `MM_BOT_USERNAME` | username del bot para detectar `@mención` por texto (default `os`) |
| `WORKER_ID` | id del worker (default `comm-1`) |

`COMM_DEV=1` habilita `FakeMattermost` **sólo** en desarrollo. **Nunca en producción.**

## 3. Ubicación de secretos

- `~/.config/echegaray-orq/comunicacion.env` — **único** lugar del token del bot (600, fuera del repo).
- El token **nunca** se loguea (los procesos loguean sólo `tipo: real|fake` y `base_url`).
- No hay secretos en el repositorio ni en las units (las units referencian el EnvironmentFile, no valores).

## 4. Servicios systemd --user

- `echegaray-comunicacion-ws.service` — consumidor WebSocket.
- `echegaray-comunicacion-worker.service` — worker (drenaje + publicación).

Ambos: `WantedBy=default.target`, `Restart=always`, **sin** `anthropic.env`. `Linger=yes` ⇒ 24×7.
Checkout de despliegue (worktree dedicado): `.../worktrees/deploy-comunicacion/echegaray-os`.

## 5. Comandos de operación

```bash
# Estado
systemctl --user status echegaray-comunicacion-ws.service
systemctl --user status echegaray-comunicacion-worker.service
systemctl --user is-active echegaray-comunicacion-{ws,worker}.service

# Logs (seguir en vivo / últimas líneas)
journalctl --user -u echegaray-comunicacion-ws.service -f
journalctl --user -u echegaray-comunicacion-worker.service -n 50 -o cat

# Restart / enable / disable
systemctl --user restart echegaray-comunicacion-{ws,worker}.service
systemctl --user enable  --now echegaray-comunicacion-{ws,worker}.service
systemctl --user disable --now echegaray-comunicacion-{ws,worker}.service

# Recargar units tras editar
systemctl --user daemon-reload
```

**Señal esperada al arrancar** (WS): `cliente Mattermost activo {tipo:real}` → `ws: conectado, enviado authentication_challenge` → `ws: autenticado (hello)`.

## 6. Rollback

```bash
systemctl --user disable --now echegaray-comunicacion-ws.service echegaray-comunicacion-worker.service
# (opcional) quitar el bot del canal / revocar su token (ver §7 y §8)
# (opcional, desactivación total del esquema) migraciones down:
#   lane:  orquestador/db/rollback/20260729180000_orq_comunicacion_lane_down.sql
#   comm:  drop schema comunicacion cascade;
git worktree remove .../worktrees/deploy-comunicacion
```
No afecta al chat ni al OS principal (el worker general reclama la lane `default`).

## 7. Rotación del token del bot

El `bot create`/token se maneja por API con un token admin **efímero** (mmctl `--local` no puede crear bots):

```bash
MM=echegaray-mm-app
# 1) token admin efímero (revocar al terminar)
AT=$(docker exec $MM /mattermost/bin/mmctl --local token generate jorge rotacion --json | jq -r '.[0].token')
# 2) revocar el token viejo del bot y generar uno nuevo
BOT=<user_id_del_bot>
curl -s "http://127.0.0.1:8065/api/v4/users/$BOT/tokens" -H "Authorization: Bearer $AT" | jq -r '.[].id'   # listar ids
curl -s -X DELETE "http://127.0.0.1:8065/api/v4/users/tokens/<tokenId_viejo>" -H "Authorization: Bearer $AT"
NEW=$(curl -s -X POST "http://127.0.0.1:8065/api/v4/users/$BOT/tokens" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"description":"ws-consumer"}' | jq -r '.token')
# 3) escribir el nuevo token en comunicacion.env (600) y reiniciar
#    (editar MM_BOT_TOKEN=$NEW) ; luego:
systemctl --user restart echegaray-comunicacion-{ws,worker}.service
# 4) revocar SIEMPRE el token admin efímero
for id in $(docker exec $MM /mattermost/bin/mmctl --local token list jorge --json | jq -r '.[].id'); do docker exec $MM /mattermost/bin/mmctl --local token revoke "$id"; done
```
Verificar: `journalctl` muestra `ws: autenticado (hello)` tras el restart.

## 8. Agregar el bot a un nuevo canal privado

El bot **sólo recibe eventos de canales donde es miembro**:

```bash
docker exec echegaray-mm-app /mattermost/bin/mmctl --local channel users add echegaray:<nombre-canal> os
```
Para un canal nuevo: crearlo (o que exista) y luego agregar `os`. No requiere reiniciar servicios.

## 9. Diagnóstico — el bot RECIBE pero no responde

Orden de revisión:
1. **¿El WS recibió el evento?** `journalctl -u ...-ws` → `ws: evento aceptado → inbox` con el `post_id`.
   - Si dice `ws: ignorado por guarda`: faltó la mención `@os` (o no es DM), o es eco propio, o post de sistema.
2. **¿El worker tomó la tarea?** `journalctl -u ...-worker` → `comunicacion.responder: ejecutando`.
   - Si no aparece: ver que el worker esté `active` y que la tarea esté en lane `comunicacion`
     (`select state,queue from orq.tasks where dedupe_key like 'comm:%' order by created_at desc`).
3. **¿El outbox publicó?** journal del worker → `tick con trabajo … outbox:{publicados:1}`.
   - Si `publicados:0` y `reintentar>0`: el cliente REAL no pudo publicar (ver §10).
4. **¿Cliente real activo?** journal → `cliente Mattermost activo {tipo:"real"}`. Si dijera `fake`, hay `COMM_DEV=1` mal seteado (**prohibido en prod**).
5. **¿El bot es miembro del canal?** (§8). Sin membresía, MM no le envía el `posted` por WS.

## 10. Diagnóstico — el outbox queda PENDIENTE

- `select id,estado,intentos,last_error from comunicacion.outbox where estado <> 'PUBLICADO'`.
- Causa típica: el cliente REAL falla al publicar (token vencido → 401; canal inexistente → 404; MM caído → 5xx).
  - 401/403 → rotar token (§7).
  - 404 → el `channel_id` de la respuesta no existe o el bot no es miembro (§8).
  - 5xx / red → transitorio: el outbox **reintenta con backoff**; si agota, va a `comunicacion.dead_letter`.
- Reintentar un evento muerto: `select * from comunicacion.dead_letter` y reencolar (la idempotencia por intención evita doble efecto).
- Leases colgados (worker que murió): el propio worker corre `recuperarLeases` cada tick; no requiere acción manual.

## 11. Prohibición de fallback falso en producción (GUARDA)

`resolverCliente()` (en `conector.mjs`) es la guarda **fail-fast**:
- cliente inyectado → se usa; `MM_BOT_TOKEN` presente → cliente **real**;
- `FakeMattermost` **sólo** con `opts.cliente` (tests) o `COMM_DEV=1` (dev);
- **en cualquier otro caso LANZA** y el proceso **no arranca**.

Esto elimina el incidente del 29/07 (outbox marcaba "publicado" contra un Fake y la respuesta se perdía).
Regla: **en producción, sin `MM_BOT_TOKEN`, los servicios deben fallar al iniciar — nunca correr con Fake.**

## 12. Riesgo conocido — eventos durante una desconexión WS

Mattermost **no reenvía** por WS los eventos ocurridos mientras el consumidor estuvo desconectado. Un
mensaje `@os` publicado exactamente durante una caída del `ws-consumer` (entre la desconexión y la
reconexión con backoff) puede perderse. Impacto bajo para un comando de estado; mitigación futura =
reconciliación periódica del historial del canal. **No** afecta a mensajes posteriores a la reconexión
(`ws: autenticado (hello)`), ni a la durabilidad de lo ya ingresado (vive en las colas con lease).
