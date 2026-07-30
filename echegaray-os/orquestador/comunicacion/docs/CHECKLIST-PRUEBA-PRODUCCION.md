# PR-4 · Checklist de prueba controlada en producción

> **HISTÓRICO — checklist completado y superado.** La prueba se ejecutó y el sistema está en
> producción desde el 30/07/2026. Además, la topología de transporte cambió: el flujo NO usa el
> outgoing webhook HTTP que se describe abajo, sino un **bot con WebSocket saliente** (PR-4.2),
> que no expone ningún endpoint entrante. Los ítems de webhook/HMAC/endpoint de este checklist ya
> no aplican. Se conserva como registro de la puesta en marcha.
> Para operar hoy: [`MODULO-ASISTENCIA.md`](./MODULO-ASISTENCIA.md) §11–13 y
> [`OPERACION-BOT-WEBSOCKET.md`](./OPERACION-BOT-WEBSOCKET.md).

> **No ejecutar sin autorización expresa del dueño.** Este checklist prepara una prueba acotada del flujo
> `@os estado del sistema` contra el Mattermost productivo. Todo lo anterior (test vertical + demo) corre
> en Postgres descartable, sin tocar producción.

## Pre-requisitos

- [ ] Autorización expresa del dueño para la ventana de prueba.
- [ ] Backup reciente verificado (Mattermost + Postgres) — ver `infra/mattermost/backup/`.
- [ ] `MM_INCOMING_SECRET` generado y cargado **fuera del repo** (systemd EnvironmentFile / secreto).
- [ ] `MM_BOT_TOKEN` + `MM_BOT_USER_ID` del bot @os cargados; `botListo()` → `{listo:true}`.
- [ ] `MM_INCOMING_TOKEN` del outgoing webhook cargado.
- [ ] Decisión de topología de worker resuelta (worker principal con `ctx.responderComunicacion` **o**
      worker de comunicación dedicado en un stream de tareas aislado) — ver Riesgos §12 de la arquitectura.

## Puesta en marcha

- [ ] Aplicar la migración `comunicacion` en la base productiva (ventana controlada, con rollback listo).
- [ ] Verificar que el esquema `orq` está presente y sano (ya en producción).
- [ ] Crear el outgoing webhook en Mattermost, disparado por mención `@os`, apuntando al endpoint entrante
      del servicio (red privada), firmando con `MM_INCOMING_SECRET`.
- [ ] Bindear `recibir()` a la ruta HTTP entrante (transporte — PR-4.1) con verificación HMAC activa.
- [ ] Levantar el/los worker(s) (systemd), confirmar arranque limpio en logs.

## Prueba

- [ ] En un canal de prueba, un usuario autorizado escribe: `@os estado del sistema`.
- [ ] Verificar en logs: recepción → HMAC OK → evento canónico → inbox → orq.events → tarea →
      Work Fabric → outbox → post.
- [ ] La respuesta aparece **en el mismo hilo**, con datos **reales** del sistema (sin cifras inventadas).
- [ ] Repetir el mismo mensaje (o reintento del webhook): **no** se genera una segunda tarea ni un segundo
      post (dedup por `comm_event_id`).
- [ ] Firmar mal un request de prueba: se **rechaza** y queda auditado en `comunicacion.rechazos_entrantes`.

## Criterios de éxito

- [ ] Exactamente una respuesta por mensaje, en el hilo correcto.
- [ ] Sin pérdida silenciosa; sin doble publicación.
- [ ] Trazabilidad completa por `comm_event_id`/`correlation_id`.
- [ ] Producción de Mattermost y del OS sin efectos colaterales.

## Rollback inmediato (si algo falla)

- [ ] Detener el/los worker(s) (las colas retienen el estado).
- [ ] Desactivar el outgoing webhook (corta el ingreso).
- [ ] Si hace falta, quitar `comunicacion.responder` del registry y/o revertir la migración `comunicacion`.
- [ ] Confirmar que Mattermost (chat) y el OS siguen operativos e intactos.
