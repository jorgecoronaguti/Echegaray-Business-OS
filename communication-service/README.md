# Communication Service

Capa de comunicación **multicanal, desacoplada y event-driven** del Echegaray Business OS.

Soporta hoy **Mattermost** y está diseñado para sumar **WhatsApp Business, Email, Teams, Telegram** u
otros canales **sin modificar el núcleo del OS**.

> **Estado: estructura reservada (PR-1). Sin lógica implementada.**
> La infraestructura de Mattermost vive en [`../infra/mattermost/`](../infra/mattermost/).
> El diseño completo está en [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Reglas que gobiernan este servicio

- **No es el cerebro.** El único cerebro es el Business OS (Director IA + Work Fabric + especialistas).
- **No contiene lógica de negocio.** Traduce interacciones de canales en **eventos** y enruta resultados.
- **No se acopla al orquestador.** Reutiliza interfaces del OS (`POST /ask`, contratos de tools, cliente
  Google), no sus internals.
- **Event-driven.** Cualquier interacción (mensaje, archivo, foto, audio, video, botón, reacción,
  formulario, aprobación) se transforma en un evento del Work Fabric para que el Director IA decida.
  Las consultas conversacionales pueden seguir usando `POST /ask` cuando corresponde.
- **Google Drive** = repositorio documental oficial. **Supabase** = única verdad estructurada.
- **Nivel E siempre humano.** Ninguna acción con efecto económico/legal/fiscal externo se ejecuta desde
  un canal: se prepara y queda para aprobación explícita.

## Estructura

```
src/
├── core/           bus de eventos + tipos del evento canónico (futuro)
├── channels/       un adapter por canal (mattermost, whatsapp, email, teams, telegram)
├── events/         publicación/consumo de eventos del Work Fabric (futuro)
└── integrations/   puentes hacia el OS (/ask, Drive, tools) — reuso sin acople profundo
```

Construcción por PRs: ver la tabla en [`ARCHITECTURE.md`](./ARCHITECTURE.md#mapa-de-prs-contexto).
