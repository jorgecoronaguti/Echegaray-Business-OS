# Communication Service

Capa de comunicación **multicanal, desacoplada y event-driven** del Echegaray Business OS.

Soporta hoy **Mattermost** y está diseñado para sumar **WhatsApp Business, Email, Teams, Telegram** u
otros canales **sin modificar el núcleo del OS**.

> **Estado: PR-3 — esqueleto implementado + ajustes bloqueantes de la auditoría cerrados.** Evento
> canónico con idempotencia por intención (M1), dedup entrante atómico (M2), colas salida/entrada con
> lease durable y DLQ (M3/M4), seguridad de borde HMAC + anti-replay + auditoría (M7), puente explícito
> con `orq.events` (M10), persistencia memoria + Postgres con tests reales (M11), observabilidad, deep
> links, identidad, slash commands y bot @os (diseño). **Todavía NO conectado a los especialistas /
> Work Fabric — eso es PR-4.**
> La infraestructura de Mattermost vive en [`../infra/mattermost/`](../infra/mattermost/).
> Diseño general: [`ARCHITECTURE.md`](./ARCHITECTURE.md) · Implementación:
> [`docs/PR-3-IMPLEMENTACION.md`](./docs/PR-3-IMPLEMENTACION.md) · Auditoría:
> [`docs/AUDITORIA-PR3.md`](./docs/AUDITORIA-PR3.md) · Cierre de bloqueantes:
> [`docs/CIERRE-BLOQUEANTES-PR3.md`](./docs/CIERRE-BLOQUEANTES-PR3.md) · Operación:
> [`docs/OPERACION.md`](./docs/OPERACION.md).

## Correr

```bash
cd communication-service
npm test          # 65 tests unit + integración en memoria (hermético; 11 PG se saltean sin base)
npm run test:pg   # 11 tests de integración contra un Postgres efímero en Docker (descartable)
npm run demo      # demostración end-to-end (7/7 criterios), 0 red / 0 DB
```

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
