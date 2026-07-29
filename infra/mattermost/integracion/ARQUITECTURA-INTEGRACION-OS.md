# Arquitectura de integración — Mattermost ⇄ Business OS

> **Estado: DISEÑO (WT-4, etapa Hardening + Integración). Nada implementado.**
> Este documento define la arquitectura **definitiva** de la integración entre Mattermost (transporte)
> y el Business OS (cerebro). **No autoriza construir nada.** Extiende y es consistente con
> `communication-service/ARCHITECTURE.md` (PR-1) y `infra/mattermost/PR-3-PREPARACION.md`; donde hay
> superposición, aquellos mandan sobre el alcance de cada PR y este documento sobre el diseño de conjunto.
> Autor: OS (Worktree WT-4). Fecha: 2026-07-29.

---

## 0. Principio rector (no negociable)

**Mattermost es transporte, no cerebro ni fuente de verdad.**

- El **Director IA** decide. Los especialistas (CFO, Obras, Compras, Admin…) son **personas de un solo
  cerebro**, no sistemas separados.
- **Supabase = verdad estructurada** (caja, obras, obligaciones, `orq.pending_operations`).
  **Drive = verdad documental** (adjuntos, comprobantes).
- **Ningún dato nace en un chat como verdad.** Un mensaje es un evento; se convierte en dato solo cuando
  el OS lo valida y lo persiste en Supabase/Drive.
- **Nivel E siempre humano.** Nada con efecto económico/contractual/fiscal/laboral/externo se ejecuta
  desde un canal. Se **prepara** y queda en `orq.pending_operations` para aprobación humana explícita.
- El **Communication Service traduce y enruta; no razona.** Si el servicio "decide" algo de negocio, es
  un bug de arquitectura, no una feature.

**Prueba de arquitectura (test de desacople):** eliminar `channels/mattermost/` no debe requerir tocar
`echegaray-os/orquestador/`. Agregar WhatsApp = un adapter nuevo, cero cambios en el cerebro.

---

## 1. Diagrama de alto nivel

```
  PERSONA (web MM / app móvil MM: obra, celular, campo, Dirección)
     │  @os · /caja · botón Aprobar · foto de comprobante · reacción
     │  HTTPS/WSS  →  chat.ecsas.com.ar  (Caddy 80/443 → mattermost:8065, PR-2)
     ▼
  ┌── COMMUNICATION SERVICE (loopback en la VM, desacoplado — communication-service/) ──────────┐
  │  channels/mattermost/  ◄─ inbound: WebSocket (menciones/DM) · slash (HTTP) · interactive     │
  │        · normaliza payload MM  ─────────►  EVENTO CANÓNICO (core/)                            │
  │        · formatea resultado OS  ◄────────  SOBRE DE SALIDA (core/)                            │
  │  core/         tipos del evento canónico + sobre de salida + idempotencia + role-gate iface   │
  │  events/       publica evento → Work Fabric · consume notificaciones proactivas del OS        │
  │  integrations/ puentes al OS: POST /ask (Bearer) · identidad user_id→rol · Drive · pending-ops│
  └───────────────────────────────┬──────────────────────────────────┬──────────────────────────┘
        evento canónico            │                                  │  sobre de salida (respuesta/alerta)
                                   ▼                                  ▲
  ┌──────────────── BUSINESS OS = ÚNICO CEREBRO (echegaray-os/orquestador/) ───────────────────────┐
  │  interactive-server  POST /ask {directive,fileId?,fast?} → {answer,model,cost,navigate,rol…}    │
  │  Work Fabric (worker.mjs) → Director IA decide → especialista (persona) / tool de dominio       │
  │  Nivel E: lib/pending-ops.mjs (enqueue/list/decide) · handlers/operation_execute.mjs (ejecuta)  │
  │  Proactivo: lib/cfo-proactivo.mjs · briefing-caja-tool.mjs   (~45 tools en lib/tools/)          │
  └───────────────────────────────┬──────────────────────────────────┬──────────────────────────────┘
                                   ▼                                  ▼
                     Supabase Cloud (verdad estructurada)   Google Drive (verdad documental)
```

**Regla de flujo:** *todo* lo que no es una pregunta conversacional trivial (archivo, botón, comando,
formulario, aprobación) entra como **evento canónico** y lo enruta el **Director IA**. Solo la consulta
conversacional pura (`@os ¿cómo viene la caja?`) puede tomar el atajo `POST /ask` por latencia.

---

## 2. Decisiones arquitectónicas clave

### D1 — UN solo bot `@os` con routing interno del Director IA. NO un bot por especialista.

**Decisión.** Existe **una sola identidad** en Mattermost: el bot account `os` (display "Echegaray OS").
El **Director IA decide qué especialista responde** (reusa `dispatchToSpecialist` que ya existe en
`interactive-server.mjs`). La respuesta se **rotula** con la persona ("— CFO IA", "— Obras IA") usando el
override cosmético de `username`/`icon` que Mattermost permite por post del bot — **mismo account, misma
PAT**.

**Por qué.** Un bot por dominio (a) multiplica PATs y superficie de ataque, (b) **mete el routing en el
transporte** (violando el principio rector: el Director IA es quien enruta, no Mattermost), (c) confunde
al usuario sobre "a quién le hablo", y (d) contradice la identidad única del OS
(`.claude/memory` → "una sola identidad; no deflectar pedidos como si el OS fuera otro"). Los especialistas
son personas de un cerebro; en el chat también.

### D2 — El evento canónico es el único contrato. `POST /ask` es solo el atajo de latencia.

**Decisión.** Toda superficie (mensaje, mención, slash, botón, archivo, reacción, dialog, decisión de
aprobación) se normaliza al **evento canónico** de `core/` y se publica al Work Fabric. `POST /ask` se usa
**únicamente** para la pregunta conversacional pura que no requiere orquestación ni escritura.

**Por qué.** Evita que el servicio crezca N caminos ad-hoc. Un solo contrato aguas arriba → el cerebro es
agnóstico del canal → el multicanal (WhatsApp/Email/Teams/Telegram) es gratis. `POST /ask` como *único*
camino era el error de la auditoría original; el PR-1 ya lo corrigió y este diseño lo mantiene.

### D3 — Nivel E se ancla en `orq.pending_operations` + la web `/aprobaciones`. El botón de MM nunca ejecuta.

**Decisión.** El flujo de aprobación reusa **tal cual** el mecanismo que ya existe en el OS:
`lib/pending-ops.mjs` (`enqueuePendingOperation` → `awaiting_approval`; `decidePendingOperation` →
`approved`) y `handlers/operation_execute.mjs` (ejecuta, idempotente). Mattermost solo **muestra** una
propuesta y **captura** un intento aprobar/rechazar como evento; el `decide` y la ejecución ocurren en el
OS. La UI **fuente de verdad** de aprobaciones es la web `app.ecsas.com.ar/aprobaciones`; el botón de MM
arranca como **deep link a esa pantalla** (dry-run, PR-8) y, cuando sea operable, solo cambia
`awaiting_approval → approved` para un actor **autenticado por SSO** y con rol autorizado — **la ejecución
del acto económico sigue siendo del handler del OS.**

**Por qué.** Cumple la regla raíz (Nivel E humano) sin crear una segunda cola ni un segundo ejecutor.
Ningún pago/contrato/fisco sale desde un webhook. El OS sigue siendo el único que ejecuta y la única
fuente de verdad del estado de la operación.

---

## 3. Contrato canónico (core/)

Mantiene la forma de `communication-service/ARCHITECTURE.md` y de `PR-3-PREPARACION.md §6·B1`
(`{ tipo, canal, actor, contenido, adjuntos, contexto, idempotency_key }`) y la detalla.

### 3.1 Evento canónico de ENTRADA (canal → OS)

```
EventoCanonico {
  tipo:        'mensaje' | 'mencion' | 'comando_slash' | 'interaccion_boton'
             | 'archivo' | 'reaccion' | 'dialog_submit' | 'aprobacion_decision'
             | 'union_canal' | 'salida_canal' | 'edicion' | 'borrado'
  canal:       { transporte:'mattermost', canal_id, canal_slug, team_id, es_privado }
  actor:       { transporte_user_id, transporte_username,           // crudo del canal
                 rol: 'direccion'|'operaciones'|'administracion'|'campo'|'no_autorizado' } // lo RESUELVE integrations/, NO se confía del nombre visible
  contenido:   { texto?, comando?, args?, boton?:{ id, value }, dialog?:{...}, decision?:{ operation_id, accion:'aprobar'|'rechazar' } }
  adjuntos:    [ { nombre, mime, tamano, transporte_file_id, drive_file_id:null, hash } ] // drive_file_id se llena recién en PR-6
  contexto:    { post_id, thread_root_id?, respuesta_a?, ts }
  idempotency_key:  hash(transporte + post_id + edit_seq)   // dedupe en la BASE, no en memoria
}
```

### 3.2 Sobre de SALIDA (OS → canal) y notificación proactiva

Dos formas, ambas **agnósticas de Mattermost** (el OS no dice "postear en MM", dice "para esta audiencia"):

```
SobreDeSalida {              // respuesta a un evento
  destino:   { canal_slug?, thread_id?, dm_user_id? }
  cuerpo:    { texto, adjuntos_md?, deep_links:[{label,url}], acciones?:[{tipo,label,payload}] }
  meta:      { persona:'director'|'cfo'|'obras'|…, capability, model, cost, rol_objetivo }
}

NotificacionProactiva {      // alerta/briefing generado por el OS sin evento previo
  audiencia:   { canal_logico:'direccion'|'obras'|'administracion'|'compras', rol_min? }
  asunto, cuerpo, severidad:'info'|'warn'|'critico', deep_link?, adjuntos?, idempotency_key
}
```

El **mapa `canal_logico → canal MM`** vive en `channels/mattermost/`. Mañana `canal_logico:'administracion'`
se resuelve a un grupo de WhatsApp sin tocar el OS. Ese es el punto de desacople del multicanal.

---

## 4. Catálogo de capacidades — qué componente, qué contrato, qué tool, qué PR

Rutas web reales verificadas en `echegaray-os/src/app/(main)/`. Tools reales verificadas en
`echegaray-os/orquestador/lib/tools/`. Canales reales en `infra/mattermost/bootstrap/channels.txt`.

| Capacidad | Componente que lo implementa | Contrato / evento | Tool / API del OS que consume | Deep link | PR |
|---|---|---|---|---|---|
| **Bot Director IA `@os` (identidad)** | `channels/mattermost/` (cliente PAT) + bootstrap (crea bot) | — | — (identidad) | — | PR-3 (crear bot/PAT, B7) · uso PR-4 |
| **Consulta conversacional** `@os ¿cómo viene la caja?` | `channels/mattermost/` inbound (WebSocket) → `integrations/` | `tipo:mencion` → atajo `POST /ask` | `POST /ask {directive}` (Bearer) → Director/especialista | según `navigate` de la respuesta | **PR-4** |
| **Especialistas IA (routing)** | Director IA en el OS (`dispatchToSpecialist`) — **no** en el servicio | evento canónico → Director decide | tools de dominio del especialista | — | PR-4 |
| **Identidad → rol** | `integrations/` (puente de identidad) | enriquece `actor.rol` | lógica de rol que ya usa `/ask` (`rol`, `denegadoPor`) | — | **PR-4** |
| **Slash `/caja`** | `channels/mattermost/` (slash HTTP) → `events/` | `tipo:comando_slash` (0-API) | `briefing-caja-tool` / `estado-empresa-tool` | `/caja` · `/flujo-caja` | **PR-5** |
| **Slash `/obra <nombre>`** | idem | `tipo:comando_slash` | `obra.mjs` | `/control-obras` · `/obras` | PR-5 |
| **Slash `/obligaciones`** | idem | `tipo:comando_slash` | `obligaciones-tool` / `caja-vencido-tool` | `/obligaciones` | PR-5 |
| **Slash `/cobranzas`** | idem | `tipo:comando_slash` | `reclamo-cobranza-tool` | `/capital-trabajo` | PR-5 |
| **Slash `/compras`** | idem | `tipo:comando_slash` | `compras-tool` | `/compras` | PR-5 |
| **Slash `/tesoreria`** (qué pagar y cuándo) | idem | `tipo:comando_slash` | `ingenieria-financiera-tool` | `/ingenieria-financiera` | PR-5 |
| **Slash `/aprobaciones`** (listar pendientes) | `channels/mattermost/` → `integrations/` | `tipo:comando_slash` | `listPendingOperations()` (`lib/pending-ops.mjs`) | `/aprobaciones` | PR-8 |
| **Multimedia → dato** (foto comprobante, remito) | `channels/mattermost/` inbound → `integrations/` (Drive) → evento | `tipo:archivo` + `adjuntos[]` | subida a **Drive** → `buscar_comprobante` / carga a Compras con aprobación | `/compras` · `/administracion` | **PR-6** |
| **Notificación: briefing de caja 8am** | `events/` (consume productor OS) → `channels/mattermost/` | `NotificacionProactiva` | `briefing-caja-tool` | `/flujo-caja` | **PR-7** |
| **Alerta CFO** (descubierto, vto IVA/UOCRA/IERIC) | `events/` → `channels/mattermost/` | `NotificacionProactiva` (severidad) | `lib/cfo-proactivo.mjs` (`generarAccionesProactivas`, `alertasDeResumen`) | `/ingenieria-financiera` · `/obligaciones` | **PR-7** |
| **Alerta de riesgo** (desvío costo/margen del worker) | `events/` → `channels/mattermost/` | `NotificacionProactiva` → canal `obras`/`direccion` | tools de control de obra (worker) | `/control-obras` | PR-7 |
| **Aprobación Nivel E** (propuesta → botón → ejecución) | `channels/mattermost/` (attachment con acciones) + `integrations/` (pending-ops) | `NotificacionProactiva` (propuesta) → `tipo:aprobacion_decision` (click) | `enqueuePendingOperation` → `decidePendingOperation` → `operation_execute` handler | `/aprobaciones` | **PR-8** (dry-run: deep link primero) |
| **SSO Google Workspace** (identidad fuerte para aprobar) | `integrations/` + config MM | — | mapeo cuenta MM ↔ usuario OS autenticado | — | PR-8 |
| **Deep links a la web** | `integrations/` (builder) | `deep_links[]` en el sobre / campo `navigate` de `/ask` | — | `app.ecsas.com.ar/<ruta>` | transversal (desde PR-4) |
| **Workflows** (secuencias de eventos) | Work Fabric + Director IA (**no** MM Playbooks) | composición de eventos canónicos | tools según el paso | según paso | emergen desde PR-6/PR-7 |
| **`GET /health` + verificación de token compartido** | `channels/mattermost/` + `core/` | — | — | — | **PR-3** |
| **Contrato del evento canónico + tests sin red** | `core/` (+ `*.test.mjs`) | define 3.1/3.2 | — | — | **PR-3** |

---

## 5. Flujos en texto (los cuatro que importan)

### 5.1 Consulta conversacional (PR-4) — atajo `/ask`

```
persona: "@os ¿cómo viene la caja?"  (canal direccion)
  → channels/mattermost (WebSocket) detecta mención al bot
  → integrations/ resuelve actor.rol (user_id→rol); NO confía en el nombre visible
  → atajo: POST /ask { directive, userEmail } con Bearer ORQ_INTERACTIVE_TOKEN
  → OS: Director IA → CFO IA → briefing-caja-tool → { answer, navigate:'/flujo-caja', cost }
  → channels/mattermost formatea SobreDeSalida: texto + deep link app.ecsas.com.ar/flujo-caja
      · rotula "— CFO IA" (override username del bot)  · post en el thread de origen
  · si rol='no_autorizado' o denegadoPor: responde el mensaje de rol del OS, NO el dato
```

### 5.2 Comando determinístico (PR-5) — 0-API

```
persona: "/caja"  (slash command de MM)
  → MM POST (con command token) → channels/mattermost inbound
  → verifica command token (≠ Bearer OS)  → tipo:comando_slash
  → events/ mapea comando→tool (tabla §4), SIN /ask, SIN razonar: briefing-caja-tool
  → respuesta ephemeral (solo la ve quien pidió) + deep link /caja
  · costo API = 0  (mitiga R6 "costo por texto libre")
```

### 5.3 Multimedia como dato (PR-6)

```
campo sube foto de comprobante en canal compras
  → channels/mattermost inbound: tipo:archivo, adjuntos:[{transporte_file_id, hash}]
  → integrations/ descarga de MM y SUBE A DRIVE → drive_file_id  (MM NO es el almacén)
  → publica evento canónico al Work Fabric (adjunto ya en Drive)
  → Director IA → buscar_comprobante / carga a Compras (queda en pending si toca $)
  → metadatos → Supabase vía OS; binario → SOLO Drive; dedupe por hash
  → responde: "Cargado a <obra>, comprobante en Drive" + deep link /compras
```

### 5.4 Aprobación Nivel E (PR-8) — el botón nunca ejecuta

```
CFO IA prepara un pago → enqueuePendingOperation → orq.pending_operations (awaiting_approval)
  → OS emite NotificacionProactiva { audiencia: rol=direccion, propuesta + justificacion economica
       (cfo-proactivo.justificacionEconomica), deep_link:'/aprobaciones', accion:{tipo:'aprobar_operacion', operation_id} }
  → channels/mattermost posta en canal direccion (privado):
       [dry-run PR-8 inicial] botón = deep link a app.ecsas.com.ar/aprobaciones   ← la persona decide en la web (fuente de verdad)
       [operable PR-8+]       botón interactivo firmado (service key) + SSO
  → click → MM interactive POST → channels/mattermost → tipo:aprobacion_decision
  → integrations/ verifica: actor SSO-autenticado Y rol autorizado a aprobar (role-gate)
  → decidePendingOperation({ id, action:'approve', decidedBy }) → status:approved
  → OS handlers/operation_execute EJECUTA (idempotente).  MM nunca toca la plata.
  · rechazo simétrico. Toda decisión auditada. Idempotencia por operation_id.
```

---

## 6. Bots, identidad, tokens y permisos mínimos

### 6.1 Identidad

- **Un** bot account: `os` (display "Echegaray OS"), creado por **extensión del bootstrap**
  (`mmctl bot create`), owner = admin. Personas de especialistas = **override cosmético por post**
  (`username`/`icon`), **mismo account, misma PAT** (D1).
- El bot se **agrega solo a los canales que debe usar**: `direccion` (privado), `obras`,
  `administracion`, `compras`, Town Square. Nada de system-admin.

### 6.2 Modelo de seguridad de tokens (5 capas distintas, ninguna en git)

| # | Token / credencial | Dirección | Para qué | Dónde vive |
|---|---|---|---|---|
| 1 | **PAT del bot** (Mattermost) | servicio → MM | postear/leer como `@os` en sus canales | `.env` del servicio (fuera de git) |
| 2 | **Command token** (slash) | MM → servicio | verificar que el slash viene de *este* MM | `.env` del servicio; `config.patch.json` |
| 3 | **Webhook/interactive token** | MM → servicio | verificar outgoing webhook / interactive POST | `.env` del servicio |
| 4 | **`ORQ_INTERACTIVE_TOKEN`** (Bearer OS) | servicio → OS | consumir `POST /ask` y tools del OS | `worker.env` del OS + `.env` del servicio |
| 5 | **Service signing key** | interno del servicio | firmar el `payload` de los botones (integridad, anti-tamper) | `.env` del servicio |

Además (PR-6): **credenciales de la Service Account de Google** para subir a Drive — nunca al repo,
patrón vigente del OS.

**Reglas duras.** (a) Token de webhook ≠ identidad de usuario ≠ Bearer OS ≠ PAT (capas independientes).
(b) **Fail-closed**: sin token válido, el request se rechaza; el servicio no razona ni postea.
(c) **Rotables** sin redeploy del OS. (d) El bootstrap **nunca** commitea `.env.bootstrap`
(ya gitignoreado). (e) El servicio **ignora eventos generados por el propio bot** (anti-loop, R7).
(f) Permiso mínimo de la PAT: post + read en los canales asignados; **sin** gestión de usuarios,
**sin** borrado de canales.

### 6.3 Ruteo de red (sin abrir puertos)

MM (Docker) y el servicio corren en la **misma VM**. Salida servicio→MM: `127.0.0.1:8065`
(REST v4 `/api/v4/posts`) con la PAT. Entrada MM→servicio: outgoing webhooks / slash / interactive del
contenedor MM alcanzan el servicio por el **gateway del host** (`host.docker.internal` / IP del bridge)
hacia `127.0.0.1:<PUERTO_SERVICIO>`. **No se publican puertos nuevos al exterior** (regla de PR-3-PREP §3).
El servicio escucha en loopback; Caddy sigue siendo el único que mira a internet.

### 6.4 Eventos entrantes vs salientes

- **Entrantes MM → servicio:** WebSocket del bot (menciones y DM en tiempo real, preferido para `@os`) +
  **slash commands** (HTTP, para `/caja` etc.) + **interactive message actions** (HTTP, para botones de
  aprobación). Cada uno con su token (capas 2/3).
- **Salientes servicio → MM:** REST v4 (`POST /api/v4/posts`) con la PAT (capa 1): posts normales,
  **ephemeral** (respuestas de comando solo visibles para quien pidió) y **attachments con acciones**
  (propuestas de aprobación).

---

## 7. Anti-patrones a evitar (qué NO hacer)

| # | Anti-patrón | Por qué es fatal | Regla que lo prohíbe |
|---|---|---|---|
| A1 | **Cerebro en el transporte:** lógica de negocio o routing de especialistas en `channels/mattermost/` | Rompe multicanal y la regla de 3 caras; el Director IA deja de ser el único que decide | R1 · D1 |
| A2 | **Un bot por especialista** | Fragmenta la identidad única, multiplica PATs, mete routing en MM | D1 |
| A3 | **MM como fuente de verdad:** un saldo/adicional/archivo "vive" en un chat | Crea una segunda realidad; viola *una-capacidad-una-fuente* | R2 |
| A4 | **Ejecutar Nivel E desde un botón** (pagar/firmar/certificar/enviar) | Efecto económico/externo sin control humano | Regla raíz · R4 · D3 |
| A5 | **Recalcular números del OS en el servicio** | El servicio no razona; duplica lógica y diverge | Principio rector · R8 |
| A6 | **Guardar binarios en el servicio o en Supabase** en vez de Drive | Duplica datos, rompe la verdad documental | R8 |
| A7 | **MM Playbooks como motor de workflows** | Sería un segundo cerebro; los workflows son Work Fabric + Director IA | §4 workflows |
| A8 | **Confiar en el nombre visible de MM** para identidad/rol | Suplantación; el rol lo resuelve `integrations/`, no el canal | R5 |
| A9 | **Deep links que saltean el filtro por rol** | Alguien ve por el canal lo que su rol no debe ver | R5 |
| A10 | **`@os` texto libre para todo** (en vez de slash determinístico) | Quema créditos por request — falla #1 histórica del OS | R6 |
| A11 | **Bot que responde a su propio post** (loop) | Rebote infinito, satura MM y el servicio | R7 |
| A12 | **Imports internos del `orquestador/` desde el servicio** | Acopla el cerebro al canal; rompe el test de desacople | R1 · principio rector |

---

## 8. Qué entra en el PRIMER PR de integración (PR-3)

**Alcance mínimo suficiente = esqueleto desacoplado y probado. Sin `/ask`, sin comandos, sin proactivo,
sin aprobaciones, sin costo de API, sin tocar `orquestador/`.** (Confirmado por PR-3-PREPARACION §6/§7.)

1. **B1 — Contrato del evento canónico** en `core/` (§3.1/§3.2): tipos + sobre de salida + idempotencia.
2. **B2 — Adapter Mattermost** en `channels/mattermost/`: normaliza payload MM ⇄ evento canónico (aún sin
   publicar a producción; traducción pura).
3. **B3 — `GET /health` + verificación del token compartido** (capas 2/3) + arranque en loopback.
4. **B4 — Tests de traducción sin red** (`*.test.mjs`, estilo `infra/mattermost/qa/`).
5. *(Opcional, adelantable)* **B7 — Bot account + PAT** declarados en el bootstrap (su **uso** es PR-4+).

**Criterio de aceptación PR-3:** un payload real de MM entra por el adapter y sale como evento canónico
válido; `GET /health` responde; el token compartido se valida; `node --test` verde; **el diff no toca
`echegaray-os/orquestador/` ni `echegaray-os/src/`.** El cerebro queda intacto.

**Gate:** el PR-3 **no arranca sin aprobación explícita del dueño** (PR-3-PREPARACION §8): alcance,
PR-2 estable en producción, si se crea ya el bot/PAT, y qué canal de prueba se usa.

---

## 9. Mapa de PRs (contexto, no autorización)

| PR | Entrega | Este documento aporta |
|---|---|---|
| PR-3 | Esqueleto: evento canónico, adapter MM, health, tests | §3, §8 |
| PR-4 | Consulta `@os → /ask` + identidad→rol | §5.1, §4 |
| PR-5 | Comandos determinísticos `/caja`, `/obra`… (0-API) | §5.2, §4 |
| PR-6 | Multimedia → Drive → índice en Supabase | §5.3, §4 |
| PR-7 | Notificaciones proactivas (briefing, alertas CFO/riesgo) | §5, §4 |
| PR-8 | Aprobaciones Nivel E operables + SSO Workspace | §5.4, §6, D3 |
| PR-9 | systemd + backups + monitoreo del servicio | (fuera de este diseño) |

---

### Fuentes leídas (read-only, sin modificar)

`communication-service/ARCHITECTURE.md` · `communication-service/README.md` · árbol
`communication-service/src/` · `infra/mattermost/PR-3-PREPARACION.md` ·
`infra/mattermost/ACTIVACION-NIVEL-E.md` · `infra/mattermost/bootstrap/channels.txt` ·
`echegaray-os/orquestador/interactive-server.mjs` (costura `POST /ask`, rol) ·
`echegaray-os/orquestador/lib/pending-ops.mjs` · `echegaray-os/orquestador/handlers/operation_execute.mjs` ·
`echegaray-os/orquestador/lib/cfo-proactivo.mjs` · `echegaray-os/orquestador/lib/tools/` (~45 tools) ·
`echegaray-os/src/app/(main)/` (rutas web reales para deep links).
```
