# Documentación de la interfaz conversacional del OS

Índice para no leer el documento equivocado: la mitad de esta carpeta es **histórico de
construcción** y describe estados que ya no son los vigentes.

## Vigente

| Documento | Para qué |
|---|---|
| [`MODULO-ASISTENCIA.md`](./MODULO-ASISTENCIA.md) | **Arranca acá.** Arquitectura vigente, flujo, componentes, integraciones (Mattermost / Work Fabric / Sheets / JORNALES), despliegue, rollback, troubleshooting, límites conocidos y mantenimiento |
| [`DOD-ASISTENCIA.md`](./DOD-ASISTENCIA.md) | Definition of Done del módulo: los 10 criterios de cierre con su evidencia ejecutada |
| [`OPERACION-ASISTENCIA.md`](./OPERACION-ASISTENCIA.md) | Runbook del día a día: permisos, corregir una carga, conflictos, horas extra, auditoría |
| [`OPERACION-BOT-WEBSOCKET.md`](./OPERACION-BOT-WEBSOCKET.md) | Operación del transporte: bot `@os`, WebSocket saliente, tokens |

## Histórico de construcción — no describe el estado actual

| Documento | Qué quedó desactualizado |
|---|---|
| [`PR-4-ARQUITECTURA.md`](./PR-4-ARQUITECTURA.md) | Anterior al Director y al registro de especialistas |
| [`PR-4.1-PLAN-ACTIVACION.md`](./PR-4.1-PLAN-ACTIVACION.md) | Plan ya ejecutado |
| [`PR-4.1-PREPARACION-PRODUCCION.md`](./PR-4.1-PREPARACION-PRODUCCION.md) | Preparación ya ejecutada |
| [`PR-4.2-PLAN-BOT-WEBSOCKET.md`](./PR-4.2-PLAN-BOT-WEBSOCKET.md) | Plan ya ejecutado |
| [`CHECKLIST-PRUEBA-PRODUCCION.md`](./CHECKLIST-PRUEBA-PRODUCCION.md) | Completado, y describe la topología de webhook HTTP que fue reemplazada por el WebSocket |
