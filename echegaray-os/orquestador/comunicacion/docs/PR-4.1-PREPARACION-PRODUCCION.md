# PR-4.1 · Preparación para prueba controlada en producción

> Cierra los dos pendientes de PR-4: (1) topología segura del worker; (2) endpoint HTTP entrante.
> **No despliega, no toca producción, no configura el webhook, no aplica migraciones.** Todo en el
> worktree `feature/pr4-mattermost-work-fabric`.

## 1. Topología del worker — decisión final

**Problema:** `orq.claim_task` reclamaba cualquier tarea `ready` → el worker de comunicación podía robar
tareas del worker general (IA/finanzas) y viceversa.

**Decisión: aislamiento por COLA (lane), con el mecanismo oficial del Work Fabric.** Una columna
`queue` en `orq.tasks` (default `'default'`), un trigger que rutea `comunicacion.%` → lane `'comunicacion'`
en el INSERT, y `orq.claim_task` extendido con `p_queue` (default `'default'`) que **filtra la lane dentro
del mismo `SELECT … FOR UPDATE SKIP LOCKED`** (atómico, sin post-filtrado). Migración
`20260729180000_orq_comunicacion_lane.sql` (+ rollback).

**Mecanismo de claim:** UNA sola implementación de `claim_task` (se dropeó la de 2 args; las llamadas de 2
args resuelven al default). No hay dos claims incompatibles.

**Por qué no interfiere con el worker principal:**
- El worker general llama `claim_task($1,$2)` → `p_queue='default'`. Todas las tareas existentes quedan en
  `'default'` ⇒ comportamiento idéntico al previo.
- Las tareas de comunicación se rutean a la lane `'comunicacion'` ⇒ el worker general **nunca las ve**.
- El worker de comunicación llama `claim_task($1,$2,'comunicacion')` ⇒ **sólo ve su lane**.
- Aislamiento en **ambos** sentidos, atómico. Verificado con tests L1–L6 (routing, reclama sólo su lane,
  no reclama finanzas/especialista, el general no roba comunicación, el general sigue funcionando, dos
  workers de comunicación no toman la misma tarea) + recuperación de lease, reinicio y concurrencia del
  test vertical.

## 2. Endpoint HTTP entrante

**Ubicación y diseño.** Transporte **framework-agnóstico** (`endpoint-entrante.mjs`): recibe una petición
normalizada `{method, headers, rawBody, ip}` y devuelve `{status, body}`. Se monta en un **servidor Node
delgado** (`servidor-entrante.mjs`) ligado a **`127.0.0.1`** (no abre puerto público; se publica detrás de
Caddy en la ruta `/integrations/mattermost/events`). **No se usó** ni el servidor `/ask`
(`interactive-server`, pesado, otra responsabilidad) ni la app Next.js (runtime/bundle equivocado para el
Work Fabric): un receptor Node mínimo en el mismo runtime del orquestador es la separación correcta y no
agrega puerto público.

**Responsabilidades (sólo transporte):** método POST · Content-Type válido · límite de tamaño (64 KB) ·
timeout de body · preservar el **raw body** exacto · extraer firma/timestamp e IP real (X-Forwarded-For
detrás de Caddy) · parsear el payload de Mattermost · delegar a `con.recibir` · códigos HTTP estructurados
· no exponer errores internos · no loguear secretos/tokens/firmas. **No** contiene lógica de negocio, **no**
llama al Work Fabric, **no** omite inbox/bridge/retries/DLQ.

**Códigos:** 202 aceptado · 200 ignorado (eco del bot) · 401 no autorizado (con `motivo` estructurado) ·
405 método · 413 body grande · 415 content-type · 408 timeout · 500 genérico (sin filtrar el detalle).

## 3. Mecanismo de Mattermost elegido y contrato del payload

**Mecanismo: outgoing webhook** disparado por la palabra clave `@os` (sin plugin, sin permisos elevados
del bot). El bot @os publica las respuestas por la API (token de bot).

**Payload (application/x-www-form-urlencoded):** `token`, `team_id`, `team_domain`, `channel_id`,
`channel_name`, `timestamp`, `user_id`, `user_name`, `post_id`, `text`, `trigger_word`.

| Dato | De dónde |
|---|---|
| Usuario | `user_id` / `user_name` |
| Canal | `channel_id` / `channel_name` |
| post_id | `post_id` (mensaje que disparó el webhook) |
| root_id / hilo | se responde con `root_id = post_id` del disparador ⇒ **respuesta en el mismo hilo** |
| Evitar eco del bot | el adapter ignora `user_id == MM_BOT_USER_ID`; además el outgoing webhook no dispara con mensajes del bot |
| Autenticidad | ver §4 |
| Respuesta en el hilo | el bot publica un post con `root_id = post_id` (adapter → `crearPost`) |

## 4. Autenticación y seguridad — honesto

El endpoint **enforcea la seguridad M7** (verificador del Communication Service): HMAC-SHA256 sobre el raw
body + timestamp + ventana anti-replay + comparación en tiempo constante + allowlist + **fail-closed** +
auditoría estructurada de rechazos (sin loguear secretos ni firmas completas). **Todo esto está
implementado y probado** (16 tests del endpoint + los del verificador).

**Realidad del mecanismo (a decidir en la ventana autorizada):** el **outgoing webhook de Mattermost
autentica con un `token` compartido en el payload, NO con un HMAC sobre el raw body.** Por eso, para la
prueba controlada hay dos caminos, y **no se relaja ningún control en el código** (el endpoint sigue
exigiendo HMAC por defecto):

- **(A) Recomendado — ingreso firmado (HMAC completo):** un relay local mínimo (o un plugin) que HMAC-firma
  el raw body antes de llegar al endpoint. Mantiene M7 completo. Es el estado por defecto del código.
- **(B) Token + red (mecanismo nativo, endurecido):** verificación del `token` compartido del webhook en
  tiempo constante + **allowlist de IP estricta** (sólo la IP local de Mattermost) + binding en `127.0.0.1`
  + anti-replay con el `timestamp` del propio webhook. Requiere habilitar el modo token en el borde
  (decisión explícita del dueño; no está activado).

La primera prueba está limitada a Jorge en un canal privado, con Mattermost y el endpoint en el **mismo
VM** (POST a `127.0.0.1`), lo que hace viable (B) con riesgo acotado; (A) es el objetivo para dejar HMAC
obligatorio de punta a punta. **Esta es la decisión abierta clave de la ventana controlada.**

## 5. Archivos

**Nuevos:** `orquestador/comunicacion/{endpoint-entrante.mjs, servidor-entrante.mjs, endpoint-entrante.test.mjs}`,
`supabase/migrations/20260729180000_orq_comunicacion_lane.sql`, `db/rollback/20260729180000_orq_comunicacion_lane_down.sql`,
`orquestador/comunicacion/deploy/{env.example, *.service, caddy-comunicacion.snippet}`, este doc.
**Modificados (aditivo, retrocompatible):** `orquestador/lib/ledger.mjs` (claimTask con lane opcional),
`orquestador/comunicacion/{conector.mjs (reclama lane 'comunicacion'), aplicar-esquema.mjs, handlers/comunicacion.mjs (gate de comando)}`,
`orquestador/comunicacion/conector.pr4.test.mjs` (tests de lane).

## 6. Configuración productiva preparada (NO aplicada)

`deploy/env.example` (todas las variables + secretos fuera del repo), `deploy/echegaray-comunicacion-worker.service`
y `deploy/echegaray-comunicacion-endpoint.service` (systemd, endurecidos, shutdown limpio),
`deploy/caddy-comunicacion.snippet` (ruta detrás de Caddy, 127.0.0.1). Bot @os: permisos mínimos (publicar
en el canal de prueba). Rotación de secretos: ver checklist.

## 7. Checklist de despliegue (ventana controlada, tras autorización)

1. Cargar `EnvironmentFile` fuera del repo (chmod 600) con `MM_INCOMING_SECRET`, `MM_BOT_TOKEN`,
   `MM_BOT_USER_ID`, `MM_INCOMING_TOKEN`, `DATABASE_URL`.
2. Aplicar la migración `20260729180000_orq_comunicacion_lane.sql` (+ la `comunicacion` si no está) en la
   ventana, con rollback listo.
3. Decidir el camino de auth (§4-A o §4-B).
4. Crear el bot @os (permisos mínimos) e invitarlo al canal privado de prueba.
5. Crear el outgoing webhook (trigger `@os`, canal de prueba) → endpoint.
6. Instalar y arrancar los servicios systemd (endpoint + worker); confirmar arranque limpio.
7. Smoke: `@os estado del sistema` en el canal de prueba → respuesta real en el hilo.

## 8. Checklist de rollback

1. `systemctl stop` del worker y del endpoint (las colas retienen el estado; nada se pierde).
2. Desactivar/borrar el outgoing webhook (corta el ingreso).
3. (Opcional) quitar `comunicacion.responder` del registry.
4. Revertir la migración con `db/rollback/20260729180000_orq_comunicacion_lane_down.sql` (restaura
   `claim_task` de 2 args, quita la lane) y/o `comunicacion` down si corresponde.
5. Confirmar Mattermost (chat) y el OS intactos.

## 9. Checklist de prueba productiva limitada a Jorge (mínimo privilegio)

- [ ] Un solo usuario autorizado: **Jorge**. Un solo canal **privado** de prueba.
- [ ] Bot @os con permisos mínimos (publicar en ese canal). Sin acceso a otros canales/usuarios.
- [ ] Sólo se acepta `@os estado del sistema`; cualquier otro texto → "no soportado" (sin efectos).
- [ ] Sin especialistas, sin ejecución financiera, sin comandos destructivos, sin efectos de negocio.
- [ ] Verificar: recepción → auth → inbox → orq.events → tarea (lane comunicación) → Work Fabric → outbox →
      post en el hilo, con datos reales.
- [ ] Repetir el mensaje: sin doble tarea ni doble post (dedup por `comm_event_id`).
- [ ] Firmar/tokenizar mal: rechazo 401 auditado.
- [ ] Rotación de secretos: generar `MM_INCOMING_SECRET`/token nuevos, recargar el EnvironmentFile,
      `systemctl restart`, re-crear el webhook con el nuevo token; verificar; revocar los viejos.

## 10. Riesgos remanentes

- **Auth del outgoing webhook (§4):** HMAC completo requiere un relay firmante; la decisión (A vs B) es el
  ítem abierto de la ventana. El código no relaja controles.
- **Binding del endpoint:** el servidor es `127.0.0.1`; la exposición la da Caddy/red privada — verificar
  que Mattermost llega por localhost o por la ruta de Caddy con allowlist.
- **`estado-sistema`** dará valores reales en producción; en el entorno mínimo da "sin dato" (correcto).
- Migración `comunicacion` aún no aplicada a prod (parte del despliegue).
