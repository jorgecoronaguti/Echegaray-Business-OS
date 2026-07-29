# PR-3 — Documento de preparación (Communication Service · adapter Mattermost)

> **Estado: PREPARACIÓN. Nada implementado. Este documento NO es una autorización.**
> El PR-3 **no arranca sin aprobación explícita del dueño** (ver §8). Es el cierre técnico del PR-2
> (Mattermost operativo + expuesto + módulo web `/comunicacion`) y el punto de partida acordado para
> el PR-3, sin escribir una sola línea de código de PR-3.
> Autor: OS (Worktree D, PR-2). Fecha: 2026-07-29.

---

## 0. Propósito y encuadre en la misión

El PR-3 es el primer tramo donde el Business OS empieza a **hablar** con el equipo por un canal nuevo
(Mattermost) sin dejar de ser el **único cerebro**. Antes de escribir nada, la pregunta de la misión:

> *¿Cómo contribuye esto a que Echegaray cotice/ejecute/cobre mejor, proteja margen y caja, y reduzca
> trabajo manual — y cuál es la forma de mayor impacto de resolverlo?*

Respuesta que gobierna todo el documento: el valor no está en "tener chat" (eso ya lo da el PR-2).
El valor está en que **el trabajo llegue a donde está la gente** (obra, celular, campo) con **la menor
burocracia posible** y que **lo que la gente informa vuelva al OS como dato**, sin planillas nuevas ni
un segundo sistema de verdad. El chat es **transporte**. El cerebro, la decisión y la verdad siguen en
el OS, en Supabase y en Drive. Cualquier diseño que viole esto es un bug de arquitectura, no una feature.

**Nota de coherencia (leer antes de diseñar el PR-3).** La auditoría original
(`echegaray-os/docs/mattermost-integracion-auditoria.md`, §3) proponía el traductor **dentro** de
`orquestador/mensajeria/`. El PR-1 **revisó y superó** esa decisión: el traductor vive **desacoplado**
en `communication-service/` (ver `communication-service/ARCHITECTURE.md`), como servicio multicanal
event-driven, no como módulo del orquestador. **El diseño vigente es el desacoplado.** Este documento
sigue el ARCHITECTURE.md del PR-1; donde cita la auditoría, es por su análisis de infraestructura y de
la costura `POST /ask`, que siguen válidos.

---

## 1. Arquitectura final post-PR2

### 1.1 Lo que ya funciona hoy (plano de transporte, PR-2)

```
  persona (navegador / app móvil Mattermost)
      │  HTTPS + WSS
      ▼
  edge Cloudflare  ── túnel SALIENTE ──►  cloudflared (VM, systemd restart=always)
                                              │  HTTP (loopback)
                                              ▼
                                    127.0.0.1:8065  Mattermost TE  ◄─┐ red Docker aislada
                                              │                      │ echegaray-mattermost-net
                                              ▼                      │
                                    echegaray-mm-db (postgres:16)  ──┘  (SIN puerto publicado)
```

- Exposición real = **Cloudflare Tunnel saliente** a `https://chat.ecsas.com.ar`. **No hay Caddy ni
  nginx** en esta VM (auditoría §1.3). Mattermost escucha **solo en loopback**; cero puertos entrantes.
  La zona `ecsas.com.ar` queda en DonWeb (un solo CNAME `chat → <UUID>.cfargotunnel.com`).
- Base de Mattermost **aislada** (su propio Postgres, sin puerto). La verdad estructurada del OS sigue
  en **Supabase Cloud** (remota). Mattermost **no comparte base** con el OS.
- La web del OS ya tiene el módulo **`/comunicacion`** (`echegaray-os/src/app/(main)/comunicacion/page.tsx`):
  tarjeta de lanzamiento que abre `chat.ecsas.com.ar` en pestaña nueva (Mattermost bloquea el iframe por
  defecto; el embed queda detrás de env opt-in). Es **enlace**, no integración de datos.

### 1.2 Lo que el PR-3 introduce (plano de integración, aún inexistente)

El PR-3 agrega el **Communication Service** como servicio **desacoplado** entre el canal y el cerebro.
La regla es que el cerebro **no se entera de que existe Mattermost**: recibe eventos canónicos.

```
  Mattermost  ──(webhook / slash / WebSocket)──►  ┌── Communication Service (NUEVO, PR-3) ──┐
                                                   │  channels/mattermost/  adapter          │
                                                   │     · normaliza payload MM → evento     │
                                                   │  core/  evento canónico + contratos     │
                                                   │  events/  publicación al Work Fabric    │
                                                   │  integrations/  puente POST /ask, Drive │
                                                   └──────────────────┬──────────────────────┘
                                                                      │  evento canónico
                                                                      ▼
                          ┌───────────────── Business OS = ÚNICO CEREBRO ─────────────────┐
                          │  interactive-server  POST /ask  (la costura que YA existe)     │
                          │  Work Fabric (worker.mjs)  →  Director IA decide               │
                          │  especialistas (CFO, Obras, Compras…) + ~45 tools de dominio   │
                          └───────────────┬───────────────────────────┬────────────────────┘
                                          ▼                           ▼
                              Supabase Cloud (verdad             Google Drive (verdad
                              estructurada: caja, obras…)         documental: adjuntos)
```

- **Sin acople estructural.** El Communication Service se comunica con el OS por **interfaces**
  (`POST /ask` con `Bearer`, contratos de tools, cliente Google), **no** por imports internos del
  orquestador. Vive fuera de `echegaray-os/orquestador/`.
- **Event-driven, no "todo es POST /ask".** Un archivo subido, un botón, un formulario, una foto →
  **evento canónico** que el **Director IA** enruta. Solo la pregunta conversacional pura (`@os ¿cómo
  viene la caja?`) puede tomar el atajo `POST /ask` por latencia.
- **Multicanal por diseño.** Mañana WhatsApp/Email/Teams/Telegram son **otro adapter** en
  `channels/`, sin tocar el core ni el OS. Un solo cerebro, muchas caras.

---

## 2. Componentes y su estado real

| Componente | Ubicación | Estado hoy (post-PR2) | Rol en PR-3 |
|---|---|---|---|
| **Mattermost TE** | `infra/mattermost/docker-compose.yml` (`echegaray-mm-app`, `127.0.0.1:8065`) | **Operativo.** TE, loopback, `restart: unless-stopped`, cap CPU/mem, logs rotados. | Fuente de eventos y destino de respuestas. **No cambia.** |
| **Postgres de MM** | `echegaray-mm-db` (`postgres:16-alpine`, sin puerto) | **Operativo, aislado.** Red `echegaray-mattermost-net`. | Interno a MM. El PR-3 **no lo toca**. |
| **Exposición pública** | `infra/mattermost/cloudflared/` (config.yml, service) | **Operativo.** Túnel saliente → `chat.ecsas.com.ar`, HTTPS+WSS. **No es Caddy: es Cloudflare Tunnel.** | Transporte. Habilita webhooks entrantes de MM al servicio (ver §3). |
| **Bootstrap declarativo** | `infra/mattermost/bootstrap/` (bootstrap.sh, config.patch.json, channels.txt) | **Operativo, idempotente** vía `mmctl --local`. Crea admin, equipo, canales. | Base para declarar bots/webhooks/tokens del PR-3 (extender, no reinventar). |
| **Canales iniciales** | `bootstrap/channels.txt` | **Declarados:** `direccion` (priv), `obras`, `administracion`, `compras`. Town Square = anuncios. | Destinos de eventos y de posteo proactivo (PR-7). |
| **QA read-only** | `infra/mattermost/qa/` (CHECKLIST-PRODUCCION, pruebas.sh, rollback-test) | **Operativo.** Verificación sin efectos. | Patrón a replicar para QA del servicio. |
| **Web `/comunicacion`** | `echegaray-os/src/app/(main)/comunicacion/page.tsx` + nav en layout | **Operativo.** Tarjeta de lanzamiento (link), embed opt-in. | Sin cambio en PR-3 (sigue siendo la puerta humana a MM). |
| **Communication Service** | `communication-service/src/{core,channels,events,integrations}/` | **Esqueleto reservado (PR-1). Solo `.gitkeep`. Sin lógica.** Carpetas de canal: mattermost, whatsapp, email, teams, telegram. | **Aquí se construye el PR-3**: adapter Mattermost + evento canónico + health. |
| **Costura `POST /ask`** | `orquestador/interactive-server.mjs` (auditoría §1.5) | **Ya existe.** `POST /ask {directive}→{answer,model,cost}`, `Bearer`, caída 0-API sin cerebro. | Interfaz de consumo. El servicio la **usa**, no la modifica. |
| **Work Fabric + tools** | `orquestador/worker.mjs`, `orquestador/lib/tools/` (~45) | **Ya existen.** | El servicio publica eventos / invoca tools **por interfaz**. No los duplica. |

**Lo que NO existe todavía (no inventar):** ningún adapter, ningún bot de Mattermost creado, ninguna
tabla `mensajeria_adjuntos`, ningún endpoint del Communication Service, ningún webhook configurado en
MM apuntando al servicio. El PR-3 los crea; hoy son cero.

---

## 3. Dependencias técnicas para PR-3

Precondiciones que el PR-3 asume resueltas o debe resolver antes de codificar:

1. **PR-2 estable en producción.** Túnel `chat.ecsas.com.ar` levantado (requiere los 2 pasos del dueño:
   `cloudflared tunnel login` + CNAME en DonWeb) y bootstrap corrido. Sin esto no hay a qué conectar.
2. **Identidad del OS dentro de Mattermost.** Crear un **bot account + Personal Access Token** (estándar
   MM para integraciones) vía extensión del bootstrap. El token es secreto — nunca al repo.
3. **Ruta entrante hacia el servicio.** El servicio escucha en **loopback**; los outgoing webhooks/slash
   de MM deben alcanzarlo. Como MM y el servicio corren en la misma VM, la ruta es interna (localhost),
   **sin abrir puertos nuevos**. Definir puerto local del servicio y `ALLOW_UNTRUSTED_INTERNAL` / URLs
   de webhook en `config.patch.json`.
4. **Token compartido webhook ⇄ servicio.** Constante en el `.env` del servicio (fuera de git),
   verificada en cada request. **Distinta** de la identidad del usuario y del `Bearer` del OS.
5. **Acceso a la costura del OS.** `INTERACTIVE_TOKEN` y URL del `interactive-server` disponibles para el
   servicio (por env), sin importar internals del orquestador.
6. **Contrato del evento canónico.** Definir en `core/` el tipo `{ tipo, canal, actor, contenido,
   adjuntos, contexto, idempotency_key }` (ARCHITECTURE.md §"evento canónico") — es la pieza central del PR-3.
7. **Mapeo identidad→rol.** `user_id` de MM → persona/rol OS (Dirección/Operaciones/Admin/Campo). Reusa
   la lógica de identidad que ya existe en el OS; el servicio **no** confía en el nombre visible.
8. **Runtime y salud.** Node ya está en la VM (v24). Definir `GET /health` del servicio y cómo se
   supervisa (systemd es PR-9, pero el health debe existir desde PR-3).
9. **QA sin red real.** Tests de traducción payload MM → evento canónico **sin** llamar a MM ni al OS
   (mismo criterio que la auditoría §3.1: `*.test.mjs` sin red).

**Dependencia de decisión (no técnica):** el alcance del PR-3 (ver §7) y su aprobación explícita.

---

## 4. Riesgos (anti-patrones a evitar)

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| R1 | **Acoplar el cerebro a Mattermost.** Que el OS "sepa" de MM (imports, lógica MM dentro del orquestador). Rompe el multicanal y la regla de 3 caras. | **Alta** | El servicio habla por **interfaces** (`/ask`, tools, evento canónico). Cero imports internos del orquestador. El OS solo ve **eventos canónicos**. Test de arquitectura: quitar MM no debe tocar el cerebro. |
| R2 | **Mattermost como fuente de verdad.** Que un dato "viva" en un chat (un saldo, un adicional, un archivo) y no en Supabase/Drive. Crea una segunda realidad — viola *una-capacidad-una-fuente*. | **Alta** | MM = **buffer/transporte**. Todo archivo → **Drive**; todo metadato → **Supabase** (vía OS). El servicio **nunca** recalcula un número del OS ni retiene el binario como definitivo. |
| R3 | **Seguridad de tokens/bots.** Token de bot, webhook o `Bearer` filtrados = acceso a postear/leer como el OS. | **Alta** | Secretos solo en `.env`/`worker.env` (fuera de git, patrón vigente). Token de webhook ≠ identidad de usuario ≠ `Bearer` OS (3 capas distintas). Rotación posible. Bootstrap nunca commitea `.env.bootstrap`. |
| R4 | **Ejecutar Nivel E desde el chat.** Pagar/firmar/certificar/enviar por un botón. | **Alta** | **Prohibido por regla raíz.** El servicio **prepara** y deja en la cola de aprobación (`pending_operations`); jamás ejecuta plata/contrato/fisco externo. Botones operables recién en un PR posterior (PR-8) y en dry-run. |
| R5 | **Fuga de identidad/permisos.** Que alguien vea por el canal lo que su rol no debe ver. | **Alta** | El OS **filtra por rol** lo que responde; el mapeo `user_id→rol` lo hace el servicio y el OS lo respeta. Canal `direccion` es privado. |
| R6 | **Costo de API por texto libre.** Cada mención `@os` razonando quema créditos (falla #1 histórica del OS). | **Media** | Comandos determinísticos **0-API** para lo frecuente; texto libre razona solo cuando hace falta; caída a briefing sin cerebro (`cerebroDisponible()`); rate-limit por usuario. |
| R7 | **Rate limits / rebote de webhooks.** MM o el servicio saturados por volumen o loops (bot que responde a su propio post). | **Media** | Idempotencia por `idempotency_key`; el servicio **ignora** eventos generados por el propio bot; backpressure/cola; límites de MM configurados. |
| R8 | **Duplicación de datos.** El servicio guardando lo que el OS ya tiene (cálculos, binarios en Supabase). | **Media** | Regla dura: el servicio **consume** el OS. `mensajeria_adjuntos` guarda **metadatos + `drive_file_id`**, nunca binarios ni cálculos. Dedupe por hash. |
| R9 | **Cambios de API de Mattermost** que rompan el adapter. | **Baja** | Pin de versión de imagen (ya en compose); tests de contrato del adapter; el desacople limita el blast radius al `channels/mattermost/`. |
| R10 | **Resiliencia (systemd/backup)** — gap preexistente del OS que el servicio heredaría. | **Media** | Health desde PR-3; systemd + backups programados es PR-9 (no bloquea PR-3, se planifica). |

---

## 5. Oportunidades (por qué vale la pena, atado a la misión)

- **Bot del Director IA que publica en canales.** El OS deja de esperar que alguien entre a la web:
  postea el **briefing de caja 8am**, alertas del **CFO** (descubierto, vencimiento IVA/UOCRA/IERIC),
  frescura de datos — en `direccion`/`administracion`. *Impacto: protege caja, anticipa problemas,
  reduce revisión manual.*
- **Alertas del Work Fabric hacia el equipo correcto.** Un desvío de costo/margen detectado por el
  worker llega al canal `obras`/`direccion` cuando todavía es gestionable, no en el post-mortem.
  *Impacto: alerta temprana = protege margen (regla raíz de control económico).*
- **Ingesta de mensajes como eventos.** Lo que campo/obra informa (foto de comprobante, remito, avance,
  pedido, incidencia) entra como **evento canónico** → Drive + Supabase + la capacidad que corresponda
  (`buscar_comprobante`, carga a Compras con aprobación, adjunto a la obra). *Impacto: menos burocracia
  para campo, el dato deja de perderse en un chat, aumenta trazabilidad.*
- **Multicanal por el mismo servicio.** WhatsApp/Email/Teams/Telegram = otro adapter, mismo cerebro.
  El proveedor/cliente que solo usa WhatsApp queda cubierto sin construir otro sistema. *Impacto:
  capacidad desbloqueada a costo marginal, sin duplicar.*
- **Aprobaciones operables desde el celular (futuro, PR-8).** La cola Nivel E deja de ser una pantalla:
  el CFO propone un pago, el dueño aprueba con un botón (en dry-run primero). *Impacto: acelera
  decisiones sin perder el control humano.*

---

## 6. Backlog priorizado para PR-3 (impacto × esfuerzo)

Prioridad = **impacto en la misión (margen/caja/decisión/menos trabajo manual) ÷ esfuerzo y riesgo.**
El alcance **mínimo suficiente** del PR-3 (según ARCHITECTURE.md §"Mapa de PRs": *"Esqueleto del
servicio: adapter Mattermost, evento canónico, health"*) son B1–B4. B5–B7 son la antesala del valor
(PR-4/5), se listan para ordenar el camino, **no** para meterlos en PR-3.

| # | Ítem | Impacto | Esfuerzo | En PR-3 | Por qué |
|---|---|---|---|---|---|
| B1 | **Contrato del evento canónico** en `core/` (`{tipo,canal,actor,contenido,adjuntos,contexto,idempotency_key}`) | Alto (es el cimiento de todo el multicanal) | Bajo | **Sí** | Sin el contrato, nada aguas abajo es estable. Primero. |
| B2 | **Adapter Mattermost** en `channels/mattermost/`: normaliza payload MM ⇄ evento canónico | Alto | Medio | **Sí** | Es la razón de ser del PR-3. Desacopla MM del cerebro (mitiga R1). |
| B3 | **`GET /health` + arranque + validación de token compartido** (webhook ⇄ servicio) | Alto (seguridad + operabilidad) | Bajo | **Sí** | Health y verificación de token son piso de seguridad (R3) y de PR-9. |
| B4 | **Tests de traducción sin red** (`*.test.mjs`) + QA read-only estilo `infra/mattermost/qa/` | Alto (confianza, evita regresiones) | Bajo | **Sí** | El OS solo da por buena una capacidad testeada. Barato y protege. |
| B5 | **Puente de identidad** `user_id MM → rol OS` en `integrations/` | Alto (habilita filtrado por rol, R5) | Medio | Preferente si entra | Necesario apenas haya respuestas; puede ser PR-3 tardío o PR-4. |
| B6 | **Atajo consulta** `@os` → `POST /ask` → respuesta formateada | Alto (primer valor visible) | Medio | **No (PR-4)** | Depende de B1–B5. Trae costo de API (R6): se maneja aparte. |
| B7 | **Bot account + Personal Access Token** declarados en bootstrap | Medio (dependencia de B6/PR-7) | Bajo | Parcial | Crear la identidad del bot puede adelantarse; su uso es PR-4+. |

**Fuera del PR-3, explícito:** comandos de dominio `/caja` `/obra` (PR-5), multimedia→Drive→Supabase
(PR-6), alertas proactivas (PR-7), botones Nivel E + SSO (PR-8), systemd/backup (PR-9). No adelantar.

---

## 7. Estrategia recomendada para PR-3

**Qué construir primero y por qué.** Construir el **esqueleto desacoplado y probado**, no la primera
respuesta vistosa. Orden: **B1 (evento canónico) → B2 (adapter) → B3 (health + token) → B4 (tests)**.
Recién con ese piso, el PR-4 enchufa `@os → /ask` y se empieza a ver valor. Esto respeta *"primero
conseguir que funcione, después repetible, después automatizar"* y evita construir sobre un contrato
inestable.

**Principios no negociables que el PR-3 debe encarnar:**

1. **Una capacidad, una fuente.** Ningún número que el OS ya da se recalcula en el servicio. Ningún
   dato nace en Mattermost como verdad. Verdad estructurada = Supabase; verdad documental = Drive.
2. **Mattermost es transporte, no cerebro ni fuente de verdad.** El servicio traduce y enruta; **el
   Director IA decide**. Si el servicio "decide" algo de negocio, es un bug de arquitectura.
3. **Desacople real.** El cerebro no importa código del canal. Prueba: eliminar `channels/mattermost/`
   no debe requerir tocar `orquestador/`. Agregar WhatsApp = un adapter nuevo, cero cambios en el core.
4. **Nivel E siempre humano.** Nada con efecto económico/contractual/fiscal externo se ejecuta desde un
   canal en el PR-3 (ni en PR-4/5). Se prepara y queda para aprobación.
5. **Costo bajo control.** El esqueleto del PR-3 **no** consume API (es traducción y health). El texto
   libre que razona llega en PR-4 con sus mitigaciones (0-API por defecto, rate-limit, caída a briefing).

**Criterio de aceptación del PR-3:** un payload real de Mattermost entra por el adapter, sale como
evento canónico válido según el contrato de `core/`; `GET /health` responde; el token compartido se
valida; `node --test` verde; y **nada del `orquestador/` fue modificado**. El OS sigue intacto.

**Medición (¿funcionó?):** (a) tests de traducción pasan sin red; (b) el diff no toca `orquestador/`
ni `echegaray-os/src/` (desacople demostrado); (c) health disponible; (d) cero secretos en el repo.

---

## 8. Gate de aprobación — el PR-3 NO arranca sin el dueño

**Este documento no habilita a construir.** El PR-3 toca la superficie que conecta el equipo con el
cerebro; su ejecución requiere **aprobación explícita del dueño** sobre, como mínimo:

1. **Alcance del PR-3:** ¿esqueleto B1–B4 solamente, o se incluye B5 (identidad→rol)?
2. **Confirmar PR-2 estable** en producción (túnel + bootstrap corridos) antes de empezar.
3. **Identidad del bot:** ¿se crea ya el bot account + PAT en el bootstrap (B7), o se difiere a PR-4?
4. **Piloto:** ¿qué canal se usa para las primeras pruebas de traducción (sugerido: uno de prueba, no
   `direccion`)?

Hasta que esas respuestas existan, el estado es **preparación**. Ninguna de las capacidades de PR-4 en
adelante (respuestas, comandos, multimedia, alertas, aprobaciones) se toca sin su propio PR y su propia
aprobación. La regla raíz manda: **el Nivel E y toda ejecución externa siguen requiriendo autorización
humana explícita.**

---

### Fuentes leídas para este documento (read-only, sin modificar)

`communication-service/ARCHITECTURE.md` · `communication-service/README.md` ·
`communication-service/src/` (árbol: core, channels/{mattermost,whatsapp,email,teams,telegram}, events,
integrations — solo `.gitkeep`) · `infra/mattermost/README.md` ·
`infra/mattermost/cloudflared/config.yml` · `infra/mattermost/bootstrap/{README.md,channels.txt}` ·
`infra/mattermost/qa/` · `echegaray-os/src/app/(main)/comunicacion/page.tsx` ·
`echegaray-os/docs/mattermost-integracion-auditoria.md` (análisis de infra + costura `POST /ask`;
su ubicación del gateway fue superada por el diseño desacoplado del PR-1).
