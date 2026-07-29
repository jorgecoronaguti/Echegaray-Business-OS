# PR-3 · Communication Service — Operación

Guía de operación del esqueleto (PR-3). Incluye configuración, cómo correr, observabilidad, manejo de
la Dead Letter, y los **checklists de despliegue y de rollback**. El servicio hoy corre 0-red / 0-DB
para tests y demo; el wiring productivo con Postgres + Work Fabric es PR-4.

---

## 1. Configuración (variables de entorno)

Ningún secreto se hardcodea ni se loguea. El wiring real las lee del entorno.

| Variable | Para qué | Notas |
|---|---|---|
| `MM_BASE_URL` | URL de la API de Mattermost | Interno: `http://mattermost:8065` (red privada). No usar el dominio público desde el server. |
| `MM_BOT_TOKEN` | Token del bot @os | Personal access token / bot token. **Obligatorio para publicar.** Si falta, `botListo()` falla cerrado. |
| `MM_BOT_USER_ID` | user_id del bot | Necesario para reaccionar y para ignorar el eco propio. Resolver una vez y cachear. |
| `MM_INCOMING_TOKEN` | Token del outgoing webhook de MM | Verificación de origen de los payloads entrantes. |
| `NEXT_PUBLIC_OS_URL` | Dominio del OS para deep links | Default `https://app.ecsas.com.ar` (dominio oficial — no `.vercel.app`). |
| `DATABASE_URL` | (PR-4) Postgres del OS | Sólo cuando se use `RepositorioPostgres`. El port se **inyecta**, no se importa. |

## 2. Correr

```bash
cd communication-service
npm test          # 41 tests (unit + integración), sin dependencias ni red
npm run demo      # demostración extremo a extremo de los 5 criterios
```

Ambos son herméticos: usan `FakeMattermost` + `RepositorioMemoria`. **No tocan producción.**

## 3. Observabilidad

- **Logs estructurados** (`observabilidad.crearLog`): una línea JSON por hop, con `correlation_id`. En
  prod el `sink` es el logger real; en test, un array.
- **Métricas** (`crearMetricas`): contadores (`evento.emitido`, `salida.publicada`, `entrada.recibida`,
  `evento.duplicado`, `handler.error`…) y observaciones (`span.publicar.ms`). `exportar()` da un
  snapshot para loguear o servir a un scrape.
- **Trazabilidad end-to-end**: cada post publicado lleva `os_correlation_id` y `os_event_id` en `props`
  — se puede seguir un hilo desde el chat hasta el evento del OS que lo originó.

## 4. Dead Letter (DLQ)

Un evento saliente que agota reintentos (6) o recibe un error permanente (4xx) va a la DLQ
(`comunicacion.dead_letter` en Postgres; `repo.deadLetter` en memoria). Operación:

1. Revisar `last_error` del ítem.
2. Corregir la causa (canal inexistente, token vencido, permiso del bot).
3. Re-encolar manualmente el evento (misma `idempotency_key` ⇒ no duplica si ya se había publicado).
4. **Alertar** cuando la DLQ crece (PR-4/PR-9: métrica + aviso al canal de dirección).

## 5. Checklist de DESPLIEGUE (cuando se active el wiring — PR-4)

> En PR-3 no hay despliegue: el servicio no se conecta a producción. Este checklist es para el día que
> PR-4 lo wire al OS.

- [ ] `MM_BOT_TOKEN` y `MM_BOT_USER_ID` cargados; `botListo()` devuelve `{ listo: true }`.
- [ ] Outgoing webhook de Mattermost creado, con `MM_INCOMING_TOKEN` compartido y apuntando al endpoint
      entrante del servicio (por la red privada / reverse proxy, no expuesto de más).
- [ ] Bot @os creado en Mattermost, invitado a los canales donde debe publicar.
- [ ] Migración `db/migrations/0001_comunicacion.sql` aplicada en **una ventana controlada**; verificado
      `schema comunicacion` presente y `claim_outbox` funcional.
- [ ] `RepositorioPostgres` wireado inyectando el pool del OS (no import directo de `db.mjs`).
- [ ] Handler entrante que publica al Work Fabric registrado (PR-4).
- [ ] Worker que corre `procesarOutbox` en loop activo (systemd — PR-9) con métricas.
- [ ] Prueba en vivo: publicar un aviso de prueba a un canal interno y ver que llega; mandar `/os ping`
      y ver `pong`.
- [ ] Verificado que **no** hay loop de eco (el bot no se responde a sí mismo).
- [ ] Deep links abren la pantalla correcta de `app.ecsas.com.ar`.

## 6. Checklist de ROLLBACK

El servicio es **aditivo y aislado**: quitarlo no afecta ni al OS ni a Mattermost como chat.

- [ ] Detener el worker de `procesarOutbox` (deja de publicar; nada se pierde: queda en el outbox).
- [ ] Desactivar/borrar el outgoing webhook en Mattermost (deja de entrar tráfico al servicio).
- [ ] (Opcional) Quitar al bot @os de los canales, o desactivarlo en System Console.
- [ ] Si se aplicó la migración y se quiere revertir: ejecutar
      `db/rollback/0001_comunicacion_down.sql` (`drop schema comunicacion cascade`). **Seguro**: ninguna
      tabla existente depende de `comunicacion`.
- [ ] Verificar que Mattermost sigue operativo como chat y que el OS (`app.ecsas.com.ar`) no se vio
      afectado — son independientes del servicio.
- [ ] El rollback es **reversible**: re-activar el webhook + el worker vuelve a publicar (idempotencia
      evita duplicar lo ya entregado).

## 7. Límites operativos (recordatorio)

- El servicio **no decide** nada de negocio. Si aparece una decisión, es un bug de arquitectura.
- **Nivel E siempre humano**: ninguna acción con efecto económico/legal/fiscal externo se ejecuta desde
  un canal.
- **Supabase = única verdad**; **Google Drive = repositorio documental** (multimedia → Drive es PR-6).
