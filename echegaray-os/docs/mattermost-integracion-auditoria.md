# Integración de Mattermost con el Echegaray Business OS — Auditoría Técnica y Plan

> **Estado: HISTÓRICO — el plan de este documento YA SE EJECUTÓ.** Mattermost está en producción
> desde entonces: el bot `@os` vive por WebSocket, con Director, especialistas, slash commands,
> acciones interactivas y carga de asistencia. Se conserva como registro de la auditoría que
> originó el trabajo, no como plan pendiente.
>
> El encabezado original decía "No implementado", y así quedó cuatro días después de que estuviera
> andando: quien lo leyera concluiría que no hay nada hecho.
>
> _Texto original de 2026-07-28, sin cambios de acá para abajo:_
> Fecha de auditoría: 2026-07-28 · VM `echegaray-os` (64.176.22.159) · Auditor: OS.

---

## 0. Resumen ejecutivo y veredicto

**¿La VM soporta Mattermost Team Edition sin afectar el Business OS? Sí, con holgura, para el tamaño real de la empresa (6 personas + campo).** Hay 4,8 GiB de RAM disponible, 121 GB de disco libre, load 0,32 y 4 vCPU. Mattermost + su Postgres para <15 usuarios consume ~1–1,5 GiB en régimen. No hay contención con la base de datos del OS porque **la base del OS es Supabase Cloud (remota)** — Mattermost usaría su **propio** Postgres local, aislado.

**El hallazgo que define el diseño:** el OS **ya expone la superficie inbound** que Mattermost necesita. `orquestador/interactive-server.mjs` responde `POST /ask { directive } → { answer, model, cost }` con auth Bearer, y su propio comentario dice que es *"la base que consume la extensión de Chrome (y mañana WhatsApp / el cockpit)"*. Mattermost es exactamente ese "mañana". Por lo tanto:

> **El Mattermost Gateway NO razona, NO recalcula, NO duplica ninguna lógica de negocio. Traduce eventos de Mattermost → `POST /ask` (o el tool correspondiente) → formatea la respuesta de vuelta al canal.** Esto respeta la regla raíz *una-capacidad-una-fuente* y la arquitectura de 3 caras (web + chat + Claude Code sobre un núcleo).

**Los tres riesgos reales a resolver antes de habilitarlo** (detallados en §9), ninguno bloqueante:
1. **La exposición pública hoy es frágil**: un túnel *quick* de Cloudflare efímero (`cloudflared --url http://localhost:8790`, URL aleatoria que muere al reiniciar). Mattermost necesita **hostname estable** (las apps móviles y el push lo exigen). Hay que pasar a un **named tunnel** con hostname fijo.
2. **`next-server` escucha en `0.0.0.0:3123`** (todas las interfaces) — potencialmente alcanzable directo por IP pública, saltando Cloudflare. Verificar/cerrar con `ufw` antes de sumar otro servicio expuesto.
3. **Ni el OS ni (a futuro) Mattermost están bajo systemd** con arranque garantizado ni backup programado. Mattermost sí debe entrar como servicio administrado (Docker Compose + `restart: unless-stopped`) desde el día uno.

---

## 1. Auditoría de infraestructura (datos reales medidos)

### 1.1 Host y recursos

| Recurso | Valor real (2026-07-28) | Lectura |
|---|---|---|
| SO | Ubuntu 26.04 LTS (kernel 7.0, x86_64) | Moderno, soportado |
| CPU | 4 vCPU Intel Xeon Cascadelake (2 cores × 2 threads) | Suficiente; load 0,32 (ocioso) |
| RAM | 7,2 GiB total · 2,5 usados · **4,8 disponibles** · 27 MiB shared | Holgura para +1,5 GiB de Mattermost |
| Swap | 8,0 GiB (1,0 en uso) | Colchón sano |
| Disco | `/dev/vda2` 150 GB · 23 usados · **121 libres (16 %)** | Amplio para buffer de multimedia |
| Uptime | 18 días · load 0,32 / 0,20 / 0,19 | Estable |
| Node / npm | v24.18.0 / 11.16.0 | Al día |

> **Nota de honestidad sobre la RAM:** buena parte de los 2,5 GiB usados hoy son el **VSCode Server + tsserver + Claude Code** (dev-time, ~1,5 GiB entre todos), no la app en régimen. El `next-server` en sí ocupa muy poco. En estado productivo puro la holgura es aún mayor. Aun así, se recomienda **cap de memoria por contenedor** para que Mattermost nunca compita con el OS.

### 1.2 Contenedores y orquestación

- **Docker 29.1.3**, **Compose 2.40.3** (plugin) — ambos presentes y sanos.
- **Un solo contenedor** definido: `orq-store` (`postgres:16-alpine`) — **Exited hace 2 semanas**. No es la base viva del OS.
- Imágenes presentes: `postgres:16-alpine`, `supabase/edge-runtime:v1.74.2`.
- **La base de datos productiva del OS es Supabase Cloud** (`https://<proj>.supabase.co`), remota y administrada. → **Mattermost no comparte base con el OS**; lleva su propio Postgres en un contenedor aislado. Cero riesgo de contención o de mezclar datos.

### 1.3 Red, exposición y reverse proxy

Puertos en escucha (medido con `ss -tulpn`):

| Puerto | Bind | Proceso | Observación |
|---|---|---|---|
| 22 | `0.0.0.0` / `[::]` | sshd | OK (fail2ban activo) |
| **3123** | **`0.0.0.0`** | `next-server v16` | ⚠️ Escucha en **todas** las interfaces |
| 20090 | `127.0.0.1` | node (VSCode ext host) | local |
| 20241 / udp 33422 | `127.0.0.1` / `*` | cloudflared | túnel |
| 46549 | `127.0.0.1` | code-server (VSCode remote) | local |
| 35301 | `127.0.0.1` | node | local |

- **No hay nginx ni Caddy.** No hay reverse proxy tradicional.
- **La exposición se hace por Cloudflare Tunnel**, pero en modo **quick/efímero**: `cloudflared tunnel --url http://localhost:8790 --no-autoupdate`. Esto genera una URL `*.trycloudflare.com` **aleatoria y no persistente**, y hoy apunta a `localhost:8790` que **no tiene listener** (la app real está en `:3123`). Es un montaje de desarrollo, no de producción.
- **Firewall:** `ufw` instalado (estado no leído — requiere sudo interactivo), **fail2ban activo**. Postura básica correcta pero **sin verificar reglas**.

### 1.4 systemd, backups, resiliencia

- **No hay unit de systemd** para el OS (ni `next`, ni `orq:worker`, ni `interactive-server`). El comentario del código dice que `interactive-server` *"corre como servicio systemd aparte"*, pero **ninguna unit así está cargada** — hoy corre como proceso de usuario suelto (`next-server`, etime 2 días). **Gap de resiliencia preexistente del OS**, no de Mattermost.
- **No hay cron de backup** (crontab de `jorge` vacío; `/etc/cron.d` sólo trae `e2scrub_all`). Existen snapshots a nivel app (`.caja-backup-*.json`) y el directorio `echegaray-os/backups`, pero **no hay disciplina de backup de infraestructura**. La base viva (Supabase) tiene su propio backup administrado; la VM no.

### 1.5 La costura de integración que ya existe (clave)

- **`orquestador/interactive-server.mjs`**: servidor HTTP con `POST /ask { directive, fileId?, fast? } → { answer, model, cost }` y `GET /health`, auth `Bearer <INTERACTIVE_TOKEN>`, CORS abierto, cae al briefing 0-API si no hay cerebro (`cerebroDisponible()`). **Es la puerta pensada para superficies de chat.**
- **~45 tools de dominio ya contratadas** en `orquestador/lib/tools/` (caja, obligaciones, cobranzas, P&L, jornales, compras, obra, ingeniería financiera, etc.). El gateway las alcanza **a través del OS**, sin tocarlas.
- **`worker.mjs`** (`orq:worker`) es el razonamiento profundo 24×7 (Work Fabric). El gateway **no** habla con el worker directo: encola por los caminos normales del OS cuando hace falta trabajo asíncrono.

**Conclusión de arquitectura:** no hay que construir un cerebro nuevo para Mattermost. Hay que construir un **traductor de protocolo** (Mattermost ⇄ OS) delgado.

---

## 2. Arquitectura propuesta

### 2.1 Principio rector

Mattermost es **una cara más** del OS (la cara de conversación humana del equipo), al mismo nivel que la web y la extensión. **No es un sistema paralelo.** Todo lo que "sabe" o "decide" lo delega al núcleo por `interactive-server`. Todo archivo que recibe termina en la fuente de verdad que ya existe (Drive + Supabase), no en un silo nuevo.

### 2.2 Dónde corre cada cosa

```
┌─────────────────────────── VM echegaray-os (Ubuntu 26.04) ───────────────────────────┐
│                                                                                        │
│  Cloudflare Named Tunnel (hostname estable, TLS terminado por Cloudflare)              │
│      ├── chat.ecsas.com.ar        → mattermost:8065   (contenedor)                     │
│      └── (os.ecsas… existente)    → next-server:3123                                   │
│                                                                                        │
│  ┌─ Docker Compose (nuevo, aislado) ─────────────┐   ┌─ Procesos OS (ya existen) ──┐  │
│  │  mattermost      (Team Edition)  :8065  local │   │  next-server        :3123    │  │
│  │  mattermost-db   (postgres:16-alpine) local   │   │  orq:worker (Work Fabric)    │  │
│  │  volúmenes: ./data ./config ./logs ./plugins  │   │  interactive-server :PORT    │  │
│  └───────────────────────────────────────────────┘   │      POST /ask  (la costura) │  │
│                                                        └──────────────────────────────┘  │
│  ┌─ mattermost-gateway (nuevo, Node, local) ─────────────────────────────────────────┐ │
│  │  • recibe outgoing webhooks / slash commands / WebSocket de Mattermost            │ │
│  │  • valida token, resuelve identidad (persona → rol OS)                            │ │
│  │  • traduce a POST /ask del interactive-server  ó  a un tool contract              │ │
│  │  • pipeline de adjuntos → Drive (drive-write) → índice en Supabase                │ │
│  │  • responde al canal (incoming webhook / API REST de Mattermost)                  │ │
│  └────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                        │
│  Cola de aprobación Nivel E (ya existe: pending_operations) — el gateway NUNCA         │
│  ejecuta plata/contratos solo; deja la acción para aprobación humana.                  │
└────────────────────────────────────────────────────────────────────────────────────────┘
             │                                   │
             ▼                                   ▼
     Supabase Cloud (verdad OS)          Google Workspace @ecsas.com.ar
     (obras, caja, obligaciones…)        (Drive = archivos, Sheets, Docs)
```

### 2.3 Integraciones (cada una a su dueño de dato, sin duplicar)

| Con qué se integra | Cómo | Dueño del dato |
|---|---|---|
| **Work Fabric / OS** | Gateway → `POST /ask` del `interactive-server`; trabajo asíncrono por `orq.enqueue_task` (caminos normales) | `interactive-server.mjs`, `worker.mjs` |
| **Supabase** | Sólo a través del OS (nunca el gateway escribe tablas de negocio directo). Índice de archivos en una tabla nueva `mensajeria_adjuntos` (metadatos, no duplica el dato) | vistas/funciones ya existentes |
| **Google Drive** | Reusar `orquestador/lib/tools/drive-write.mjs` y el cliente `google.mjs` (SA `@ecsas.com.ar`) para depositar adjuntos | `drive-write.mjs` |
| **Google Workspace (SSO)** | Mattermost soporta **GitLab/SAML/OpenID**. Con Workspace: **OIDC vía Google** (o mantener e-mail+password en la fase 1 y sumar SSO después) | Google OIDC |

**Regla no negociable:** el gateway **consume** el OS. Si alguna vez recalcula por su cuenta un número que el OS ya da (un saldo, una deuda), es un bug de arquitectura, no una feature.

---

## 3. Mattermost Gateway — diseño del servicio

### 3.1 Ubicación en el repo

```
orquestador/
└── mensajeria/                      ← nuevo módulo, hermano de interactive-server
    ├── gateway.mjs                  ← servidor HTTP: recibe webhooks/slash de Mattermost
    ├── mattermost-client.mjs        ← cliente REST+WS de Mattermost (postear, subir, leer)
    ├── traductor.mjs                ← evento MM → directiva OS → respuesta formateada
    ├── identidad.mjs                ← usuario MM → persona/rol OS (reusa lib/identity.mjs)
    ├── adjuntos.mjs                 ← pipeline archivo → Drive → índice Supabase
    ├── comandos/                    ← un archivo por slash command (/caja, /obra, /pago…)
    │   ├── caja.mjs
    │   ├── obra.mjs
    │   └── ...
    └── mensajeria.test.mjs          ← tests de traducción y de comandos (sin red real)
```

Se ubica **dentro de `orquestador/`** porque comparte `config.mjs`, `logger.mjs`, `db.mjs`, `google.mjs`, `identity.mjs` y las tools — reuso directo, cero duplicación.

### 3.2 APIs, eventos y canales de comunicación

Mattermost ofrece cuatro mecanismos; se usan así:

| Mecanismo MM | Uso en el gateway | Por qué |
|---|---|---|
| **Slash commands** (`/caja`, `/obra`, `/pago`) | Comandos estructurados con respuesta directa | Verbos explícitos, bajo costo, sin ambigüedad |
| **Outgoing webhooks** | Menciones a `@os` en canales → directiva libre → `POST /ask` | Conversación natural con el OS |
| **Incoming webhooks / REST** | El OS/gateway **postea** al canal (alertas del CFO, briefing de caja 8am, vencimientos) | Reusa los reportes automáticos ya existentes |
| **WebSocket API** | (Fase posterior) escuchar eventos en vivo, adjuntos, reacciones | Sólo cuando haga falta tiempo real |
| **Bot Accounts + Personal Access Token** | Identidad del OS dentro de Mattermost | Estándar de MM para integraciones |

### 3.3 Contrato interno

```
Evento Mattermost (slash | webhook | mención)
   → gateway valida token compartido (constante, no del usuario)
   → identidad.mjs: user_id MM  →  persona/rol OS (Dirección | Operaciones | Admin | Campo)
   → traductor.mjs:
        • comando conocido  → tool contract directo (rápido, determinístico, 0-API si aplica)
        • texto libre       → POST /ask { directive, fileId? }  (razonamiento)
   → respuesta { answer, model, cost }  → formateo Markdown de Mattermost
   → mattermost-client postea la respuesta en el canal/hilo original
   → si la acción es Nivel E (pagar, firmar, enviar externo): NO se ejecuta;
     se deja en pending_operations y se responde "queda para tu aprobación".
```

### 3.4 Autenticación (tres capas distintas, no confundir)

1. **Usuario ⇄ Mattermost**: login de la persona (e-mail/clave en fase 1; **OIDC Google Workspace** en fase 2).
2. **Mattermost ⇄ Gateway**: **token compartido** por webhook/slash (constante en `worker.env`), verificado en cada request. No es la identidad del usuario.
3. **Gateway ⇄ OS (`interactive-server`)**: el `Bearer <INTERACTIVE_TOKEN>` que ya existe.

La identidad **de negocio** (qué rol tiene y qué puede ver) la resuelve `identidad.mjs` mapeando el `user_id` de Mattermost a la persona del OS — **no** se confía en el nombre visible.

### 3.5 Manejo de archivos

Ver §5 (multimedia) — el gateway es quien orquesta el pipeline, reusando `drive-write.mjs`.

---

## 4. Seguridad

| Dimensión | Diseño |
|---|---|
| **Exposición** | Sólo por **Cloudflare Named Tunnel** (hostname estable). Mattermost escucha **`127.0.0.1:8065`**, nunca `0.0.0.0`. TLS lo termina Cloudflare. |
| **Cerrar lo ya abierto** | Verificar `ufw`: permitir 22 y bloquear el acceso público directo a `3123` (que hoy bindea `0.0.0.0`). Ningún puerto de app nuevo se publica al host. |
| **Autenticación** | Fase 1: e-mail+clave con política fuerte + MFA de Mattermost. Fase 2: **SSO OIDC con Google Workspace @ecsas.com.ar** (una sola identidad para toda la empresa). |
| **Permisos** | Esquema de equipos/canales de Mattermost + mapeo de rol OS en `identidad.mjs`. El OS **filtra por rol** lo que responde (Dirección ve todo; Campo ve lo suyo). |
| **Secretos** | Todos en `worker.env` (fuera de git, ya es el patrón). Tokens de bot y webhooks nunca en código ni en el repo. |
| **Aislamiento** | Mattermost + su Postgres en su **propia red Docker**, sin acceso a la base del OS (que además es remota). Cap de CPU/memoria por contenedor. |
| **Auditoría** | Logs de Mattermost + logs del gateway (`logger.mjs`). Toda acción que toca plata/contratos queda registrada en `pending_operations` con quién la pidió. |
| **Nivel E** | **Ninguna acción con efecto económico/contractual/fiscal/externo se ejecuta desde el chat.** Se prepara y se deja para aprobación humana explícita. Regla raíz, no configurable. |
| **fail2ban** | Ya activo para SSH; evaluar jail para el endpoint de login de Mattermost. |

---

## 5. Multimedia — flujo de archivos

**Objetivo:** una foto de obra, un audio, un PDF de comprobante o un remito que alguien manda por Mattermost **termina en Google Drive (verdad documental) e indexado en Supabase (metadato consultable)** — no queda atrapado en un chat.

```
Persona sube archivo a Mattermost (foto/audio/video/PDF/doc)
   → Mattermost lo guarda en su storage local (buffer caliente: ./data, 121 GB libres)
   → evento (webhook/WS) despierta al gateway con file_id + metadata
   → adjuntos.mjs:
        1. descarga el archivo de Mattermost por su API
        2. lo sube a Drive con drive-write.mjs (a la carpeta del data room que
           corresponda: obra, comprobantes, legajos… según canal/comando)
        3. registra el metadato en Supabase (tabla nueva `mensajeria_adjuntos`:
           id, drive_file_id, canal, autor, obra?, tipo, fecha, hash) — NO el binario
        4. (si aplica) dispara la capacidad del OS que corresponde:
             • foto de comprobante → buscar_comprobante / carga a Compras (con aprobación)
             • foto de obra        → adjunta a la obra / avance
             • audio               → (fase posterior) transcripción → directiva
   → responde en el hilo: "guardado en Drive · indexado · [link]"
```

**Reglas de almacenamiento:**
- **Mattermost storage = buffer**, no archivo definitivo. La **verdad es Drive** (política del OS: *Drive es conocimiento/verdad documental; Supabase es verdad estructurada*).
- **Deduplicación por hash** para no subir dos veces el mismo comprobante (mismo problema ya resuelto en el importador del banco).
- **Nada de binarios en Supabase** — sólo metadatos y el `drive_file_id`.
- Storage local de Mattermost con **límite de tamaño de archivo** y política de retención (purga del buffer una vez confirmado en Drive).

---

## 6. Integración con la IA (Director, CFO, Compras, Obras, RRHH…)

Los especialistas **ya existen** en el OS (Work Fabric: Director IA + 11 especialistas; personas como `advise.finance` = CFO). El gateway **no crea especialistas nuevos**: los **invoca** por los caminos que ya existen.

| Interacción | Cómo se resuelve | Sin romper qué |
|---|---|---|
| Pregunta libre en un canal (`@os ¿cómo viene la caja?`) | `POST /ask` → el ruteo de dominio del OS elige la persona/skill (CFO, Obras…) | El ruteo ya vive en el OS; el gateway no decide dominio |
| Slash command de dominio (`/caja`, `/obra La Estrella`) | Tool contract determinístico (0-API cuando se puede) | Reusa `briefing-caja-tool`, `obra.mjs`, etc. |
| Alerta proactiva al canal (CFO detecta descubierto; vencimiento IVA) | El OS **postea** por incoming webhook usando los reportes automáticos existentes | Reusa `reportes-automaticos-y-comunicaciones` |
| Trabajo profundo (análisis, conciliación) | Se **encola** en Work Fabric; el resultado vuelve al hilo cuando está | Camino normal del worker, no un canal paralelo |
| Acción Nivel E (pagar, certificar, enviar) | Se prepara y se deja en `pending_operations`; el chat sólo notifica y pide aprobación | Política de riesgo raíz |

**Modelo de canales ⇄ especialistas** (propuesta inicial, §7): cada canal temático conversa naturalmente con el especialista dueño de ese dominio, pero **cualquier** canal puede invocar a `@os` y el ruteo interno elige. No se cablea un especialista por canal de forma rígida.

**Costo/créditos:** el chat cae con gracia a capacidad **0-API/briefing** cuando no hay cerebro (ya implementado: `cerebroDisponible()` + modo sin cerebro). Los comandos determinísticos (caja, obligaciones, P&L) **no consumen créditos**. Sólo el texto libre razona. Esto protege el gasto — que ya fue la falla #1 histórica del OS.

---

## 7. UX — canales, comandos, notificaciones

### 7.1 Estructura de canales inicial (mínima, se expande con uso real)

| Canal | Para qué | Especialista natural |
|---|---|---|
| `# dirección` | Decisiones, briefing diario, alertas de caja/margen | Director IA + CFO |
| `# obras` | Avance, pedidos, incidencias por obra (hilos por obra activa) | Obras IA |
| `# administración` | Comprobantes, ARCA, obligaciones, cobranzas | Admin + CFO |
| `# compras` | Pedidos de materiales, proveedores | Compras IA |
| `# campo` | Baja burocracia: reportar y recibir; fotos, jornales | (routing automático) |
| `# os-alertas` | Sólo salida: el OS postea (vencimientos, descubierto, frescura de datos) | — |

Arranque austero: **no crear 20 canales**. Empezar con Dirección, Obras, Administración y Campo; el resto según necesidad demostrada.

### 7.2 Comandos (slash) — verbos explícitos

```
/caja                 → briefing de caja de hoy (0-API)
/obra <nombre>        → salud de la obra (costo, margen, avance)
/pago <proveedor>     → prepara la recomendación de pago (Nivel E → aprobación)
/vencimientos         → qué vence en 7/30 días
/comprobante          → sube foto y la carga (con aprobación)
/pedido <material>    → registra pedido de materiales
/os <pregunta libre>  → razonamiento (usa /ask)
```

### 7.3 Botones, formularios, notificaciones

- **Mensajes interactivos** de Mattermost (botones "Aprobar / Rechazar / Ver detalle") para la **cola Nivel E**: el CFO propone un pago, el dueño aprueba con un botón → recién ahí se ejecuta. Esto convierte `pending_operations` en algo operable desde el celular.
- **Formularios (dialogs)** para captura estructurada (registrar un adicional, un pedido) sin planillas.
- **Notificaciones**: push nativo de Mattermost (requiere hostname estable — ver §9). Briefing de caja 8am y alertas del CFO llegan al canal correspondiente.

---

## 8. Plan de implementación — PRs pequeños, en orden

Ninguno se ejecuta ahora. Cada uno es independiente y reversible; el orden respeta dependencias.

### PR-1 · Infra base de Mattermost (Docker Compose, aislado)
- **Objetivo:** levantar Mattermost Team Edition + su Postgres en Compose, escuchando **sólo en `127.0.0.1:8065`**, con volúmenes y `restart: unless-stopped`. Sin exponer aún.
- **Archivos:** `infra/mattermost/docker-compose.yml`, `infra/mattermost/.env.example`, `infra/mattermost/README.md`. (Ningún archivo del OS.)
- **Riesgos:** consumo de RAM. Mitigar con `mem_limit`.
- **Pruebas:** `docker compose up`, `curl 127.0.0.1:8065/api/v4/system/ping` → `OK`; `free -h` antes/después.
- **Aceptación:** Mattermost responde en localhost, el OS (`:3123`, worker) sigue intacto, RAM disponible > 3 GiB.

### PR-2 · Exposición estable (Cloudflare Named Tunnel) + cierre de puertos
- **Objetivo:** hostname fijo `chat.ecsas.com.ar` → `mattermost:8065` por named tunnel; verificar `ufw` y cerrar acceso público directo a `3123`.
- **Archivos:** `infra/cloudflared/config.yml` (rutas), doc de DNS. Sin código de app.
- **Riesgos:** tocar el túnel puede afectar la exposición actual del OS. Mitigar: named tunnel **nuevo**, no reemplaza el quick tunnel hasta validar.
- **Pruebas:** acceso HTTPS externo al hostname; confirmar que `3123` ya no responde por IP pública.
- **Aceptación:** Mattermost accesible por hostname estable con TLS; OS sin cambios de disponibilidad.

### PR-3 · Gateway esqueleto (health + echo)
- **Objetivo:** `orquestador/mensajeria/gateway.mjs` levanta, valida token, responde a un slash `/ping` con "pong". Aún sin lógica de negocio.
- **Archivos:** `orquestador/mensajeria/gateway.mjs`, `mattermost-client.mjs`, `mensajeria.test.mjs`; script `orq:gateway` en `package.json`.
- **Riesgos:** bajos (servicio nuevo aislado).
- **Pruebas:** `node --test`; slash `/ping` en un canal de prueba.
- **Aceptación:** ida y vuelta MM ⇄ gateway con token válido; `orq:test` verde.

### PR-4 · Traductor → `interactive-server` (`@os` pregunta libre)
- **Objetivo:** mención a `@os` → `POST /ask` → respuesta formateada en el hilo. Identidad→rol con `identidad.mjs`.
- **Archivos:** `traductor.mjs`, `identidad.mjs` (reusa `lib/identity.mjs`), tests.
- **Riesgos:** costo de API por texto libre. Mitigar: rate-limit por usuario, caída a 0-API sin cerebro.
- **Pruebas:** preguntar "¿cómo viene la caja?" y validar contra `briefing-caja`.
- **Aceptación:** respuesta correcta, con rol respetado, costo registrado.

### PR-5 · Comandos determinísticos de dominio (`/caja`, `/obra`, `/vencimientos`)
- **Objetivo:** slash commands que llaman tools existentes (0-API donde se pueda).
- **Archivos:** `comandos/*.mjs`, tests.
- **Riesgos:** bajos (reuso de tools ya testeadas).
- **Pruebas:** cada comando contra su fuente única; comparar con la web.
- **Aceptación:** mismos números que la web y el chat actual (una fuente).

### PR-6 · Pipeline de multimedia → Drive → índice Supabase
- **Objetivo:** adjunto en MM → Drive (`drive-write`) → `mensajeria_adjuntos`; dedupe por hash.
- **Archivos:** `adjuntos.mjs`, migración `supabase/migrations/*_mensajeria_adjuntos.sql` (tabla nueva con RLS), tests.
- **Riesgos:** permisos de la SA de Google; tamaño de archivos. Mitigar: límites y validación de tipo.
- **Pruebas:** subir foto/PDF, verificar en Drive y en la tabla; re-subir el mismo → no duplica.
- **Aceptación:** archivo en Drive + metadato en Supabase + link de vuelta en el hilo.

### PR-7 · Alertas proactivas al canal (CFO, vencimientos, briefing 8am)
- **Objetivo:** el OS postea por incoming webhook reusando reportes automáticos.
- **Archivos:** enganche en `reportes-automaticos-y-comunicaciones` (canal MM como destino nuevo), config.
- **Riesgos:** ruido/spam. Mitigar: umbrales y frecuencia configurables; canal `# os-alertas` dedicado.
- **Pruebas:** disparar el briefing y una alerta de descubierto; verificar formato.
- **Aceptación:** llega al canal correcto, accionable, sin duplicar la web.

### PR-8 · Cola Nivel E operable (botones Aprobar/Rechazar) + SSO Google (opcional)
- **Objetivo:** mensajes interactivos sobre `pending_operations`; aprobación con botón ejecuta el paso ya preparado. Sumar OIDC Workspace.
- **Archivos:** `comandos/aprobaciones.mjs`, config OIDC de Mattermost, tests.
- **Riesgos:** **el más alto — toca el gatillo de Nivel E.** Mitigar: doble confirmación, sólo roles autorizados, log completo, y arranque en modo "dry-run" (notifica pero no ejecuta) hasta validar.
- **Pruebas:** proponer un pago, aprobar en dry-run, verificar que NO se ejecutó; recién con validación explícita, habilitar.
- **Aceptación:** ninguna ejecución sin aprobación humana trazada; SSO funcionando.

### PR-9 · systemd + backup + monitoreo
- **Objetivo:** unit(s) para el gateway; healthcheck; backup del Postgres de Mattermost y de `./data`; alerta si algo cae.
- **Archivos:** `infra/mattermost/backup.sh`, `infra/systemd/*.service`, cron.
- **Riesgos:** bajos.
- **Pruebas:** matar el contenedor y ver que reinicia; restaurar un backup en un dir de prueba.
- **Aceptación:** arranque garantizado, backup verificable, alerta de caída.

---

## 9. Riesgos técnicos y mitigaciones

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| R1 | **Exposición efímera actual** (quick tunnel, URL aleatoria) — Mattermost necesita hostname estable para móvil/push/SSO | Alta | Named Cloudflare Tunnel con hostname fijo (PR-2) antes de usar la app en serio |
| R2 | **`next-server` en `0.0.0.0:3123`** posiblemente alcanzable por IP pública saltando Cloudflare | Alta | Verificar `ufw`, cerrar acceso directo, bindear a localhost (PR-2) |
| R3 | **Presión de RAM** si Mattermost + Postgres + dev-tools coinciden | Media | `mem_limit` por contenedor; en régimen el dev-load no está |
| R4 | **Nivel E disparado desde el chat** (pagar/firmar por botón) | Alta | Dry-run inicial, doble confirmación, sólo roles autorizados, log; nunca auto-ejecuta (PR-8) |
| R5 | **Costo de API** por texto libre en canales | Media | Comandos determinísticos 0-API; rate-limit; caída a briefing sin cerebro |
| R6 | **Duplicación de datos** (el gateway guardando lo que el OS ya tiene) | Media | Regla dura: el gateway consume el OS; `mensajeria_adjuntos` guarda metadatos, no binarios ni cálculos |
| R7 | **Sin backup ni systemd** (gap preexistente del OS que Mattermost heredaría) | Media | PR-9: systemd + backup del Postgres de MM y del buffer de archivos |
| R8 | **Fuga de identidad/permisos** (alguien ve lo que no le toca) | Alta | Mapeo rol OS en `identidad.mjs`; el OS filtra por rol; SSO Workspace (PR-8) |
| R9 | **Actualizaciones de Mattermost** que rompan el gateway (API v4) | Baja | Pin de versión de imagen; tests de contrato del cliente MM |
| R10 | **Adjuntos grandes / storage** llenando disco | Baja | 121 GB libres + límite de tamaño + purga del buffer post-Drive |

---

## 10. Decisiones que necesito de vos (antes de cualquier PR)

1. **Hostname y dominio:** ¿`chat.ecsas.com.ar`? ¿Se puede crear el DNS en Cloudflare para el named tunnel?
2. **Login fase 1:** ¿arrancamos con e-mail+clave (rápido) y sumamos SSO Google Workspace en PR-8, o querés SSO desde el día uno?
3. **Alcance del piloto:** ¿arrancamos con Dirección (vos + el otro socio) y un canal de Obras, y recién después Campo/Administración?
4. **Nivel E por chat:** ¿habilitamos los botones de aprobación de pagos desde el celular (PR-8), o esa etapa la dejamos afuera del alcance inicial y el chat sólo informa?
5. **Multimedia:** ¿qué carpeta del data room es el destino por defecto de cada tipo (comprobantes, fotos de obra, remitos)?

---

### Apéndice — comandos de auditoría ejecutados (reproducibles, read-only)

`uname -a` · `free -h` · `df -h` · `nproc`/`lscpu` · `uptime` · `docker ps -a` · `docker images` · `docker compose version` · `systemctl list-units --type=service` · `ss -tulpn` · `ps -eo …` · `pgrep -af node` · `crontab -l` · `ls /etc/cron.d` · inspección de `orquestador/interactive-server.mjs`, `package.json`, `orquestador/lib/tools/`. Ningún comando modificó estado.
