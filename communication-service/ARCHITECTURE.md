# Communication Service — Arquitectura

> **Estado:** estructura reservada (PR-1). **Sin lógica implementada todavía.** Este documento fija
> el diseño para que los PRs siguientes lo construyan sin improvisar. No hay código de negocio acá.

## Qué es

El **Communication Service** es la capa de comunicación **multicanal y desacoplada** del Echegaray
Business OS. Reemplaza al concepto de "Mattermost Gateway" de la auditoría por un servicio **genérico**:
soporta hoy Mattermost y mañana WhatsApp Business, Email, Microsoft Teams, Telegram u otros canales
**sin modificar el núcleo del OS**.

## Qué NO es (límites duros)

- **No es un cerebro.** No razona, no decide, no recalcula ningún número de negocio. El único cerebro
  es el Business OS (Director IA + Work Fabric + especialistas).
- **No contiene lógica de negocio.** Ni reglas de caja, ni de obras, ni de cobranzas. Traduce y enruta.
- **No es parte del orquestador.** Vive fuera de `echegaray-os/orquestador/`. Reutiliza código del OS
  cuando corresponde (cliente Google, contratos de tools, `/ask`), pero **no se acopla estructuralmente**
  al módulo del orquestador: se comunica con el OS por sus interfaces, no por imports internos profundos.
- **No es fuente de verdad.** Los archivos terminan en Google Drive; los metadatos, en Supabase (vía OS).
  Mattermost es sólo el buffer/canal.

## Principio rector: event-driven, no "todo es POST /ask"

La auditoría asumía que cada interacción era una consulta conversacional (`POST /ask`). **Eso se corrige
acá.** El Communication Service transforma **cualquier** interacción de un canal en un **evento canónico**
del Work Fabric, y es el **Director IA** quien decide cómo procesarlo.

Interacciones que se vuelven eventos (no todas son preguntas):

- mensaje de texto · archivo · foto · audio · video · botón · reacción · formulario/dialog ·
  aprobación/rechazo de una operación · edición · borrado · unión/salida de un canal.

```
Canal (Mattermost / WhatsApp / Email / Teams / Telegram)
   │  webhook · WebSocket · API entrante
   ▼
┌─ Communication Service (independiente del OS) ────────────────────────────┐
│  1. Adapter del canal        → normaliza el payload propio del canal      │
│  2. Evento canónico          → { tipo, canal, actor, contenido, adjuntos, │
│                                  contexto, idempotency_key }              │
│  3. Publicación              → lo emite como EVENTO del Work Fabric        │
│  4. (atajo) consulta simple  → puede usar POST /ask del interactive-server │
│                                cuando es una pregunta conversacional pura │
└───────────────────────────────────────────────────────────────────────────┘
   ▼                                            ▼
Work Fabric  ──►  Director IA decide  ──►  especialista / tool / acción
   │                                                    │
   ▼                                                    ▼
resultado / respuesta  ──►  Communication Service  ──►  vuelve al canal de origen
```

- **Camino principal — eventos:** todo lo que no es una pregunta trivial (un archivo subido, un botón de
  aprobación, un formulario, una foto de comprobante) entra al Work Fabric como evento. El Director IA
  enruta al especialista correcto. Esto respeta *"toda decisión pasa por el Director IA, el Work Fabric y
  los especialistas existentes"*.
- **Camino secundario — consultas:** una pregunta conversacional pura (`@os ¿cómo viene la caja?`) puede
  seguir usando `POST /ask` del `interactive-server` por latencia, cuando no requiere orquestación.
- **Nivel E siempre humano:** ninguna acción con efecto económico/contractual/fiscal/externo se ejecuta
  desde un canal. Se prepara y queda para aprobación humana explícita (la cola `pending_operations` del OS).

## Estructura de carpetas (reservada en PR-1)

```
communication-service/
├── README.md                 # qué es y estado
├── ARCHITECTURE.md           # este documento
└── src/
    ├── core/                 # bus de eventos, tipos del evento canónico, contratos (futuro)
    ├── channels/             # un adapter por canal — traduce ⇄ evento canónico
    │   ├── mattermost/       # primer canal (PR-3+)
    │   ├── whatsapp/         # futuro
    │   ├── email/            # futuro
    │   ├── teams/            # futuro
    │   └── telegram/         # futuro
    ├── events/               # publicación/consumo de eventos del Work Fabric (futuro)
    └── integrations/         # puentes hacia el OS: /ask, Drive, tools (reuso, sin acople profundo)
```

Cada canal es un **adapter intercambiable**: implementa la misma interfaz (recibir → normalizar a evento
canónico; y formatear ← resultado del OS). Agregar WhatsApp mañana es escribir `channels/whatsapp/`, sin
tocar el core ni el OS.

## Mapa de PRs (contexto)

| PR | Entrega |
|---|---|
| **PR-1** (este) | Infraestructura de Mattermost + esta estructura reservada. Sin lógica. |
| PR-2 | Exposición pública estable (Cloudflare named tunnel) + cierre de puertos. |
| PR-3 | Esqueleto del servicio: adapter Mattermost, evento canónico, health. |
| PR-4 | Camino de consulta (`@os` → `/ask`) e identidad→rol. |
| PR-5 | Comandos determinísticos de dominio (`/caja`, `/obra`…) vía tools existentes. |
| PR-6 | Multimedia → Google Drive → índice en Supabase. |
| PR-7 | Eventos proactivos del OS hacia los canales (briefing, alertas del CFO). |
| PR-8 | Aprobaciones Nivel E operables (botones) + SSO Google Workspace. |
| PR-9 | systemd + backups programados + monitoreo. |
