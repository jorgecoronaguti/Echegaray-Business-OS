# Auditoría técnica del PR-3 · Communication Layer

> Revisión crítica e independiente, como Principal Software Architect externo, **antes** de conectar el
> Communication Service con el Business OS (PR-4). Sólo lectura: no se implementó ningún cambio. Los
> hallazgos están verificados contra el código de la rama `feature/pr3-communication-layer` (commit
> `7b4fc6b`), con archivo y línea.

Alcance revisado: arquitectura, separación de responsabilidades, acoplamiento, contrato canónico,
versionado, idempotencia, outbox, retries, DLQ, observabilidad, correlation IDs, seguridad,
persistencia, escalabilidad, performance, concurrencia, compatibilidad con adapters futuros
(Slack/Teams/Discord/Email/WhatsApp/Telegram) y con el OS (Director IA, especialistas, Work Fabric,
Scheduler, Supabase), mantenibilidad y riesgos futuros. Validaciones ejecutadas: `npm test`
(41 pass / 0 fail) y `npm run demo` (6/6 criterios) — reproducen el circuito, pero **no ejercitan** las
rutas concurrentes ni la implementación Postgres (ver B/C).

---

## A. Fortalezas de la arquitectura

1. **Ports & Adapters bien aplicado.** El core no importa Mattermost; el adapter no importa el OS; el
   repositorio es un puerto con dos implementaciones. Verificado: 0 imports desde `core/` hacia
   `channels/mattermost/`, y el repo Postgres recibe el pool **inyectado** en vez de importar
   `orquestador/db.mjs` (`src/events/repositorio-postgres.mjs:80-86`). El desacople que exige
   `ARCHITECTURE.md` se sostiene.
2. **Contrato canónico como frontera única.** El sobre es cerrado (con `Object.freeze`) y `data` es
   abierto: el diseño correcto para versionar sin romper. La dirección (`inbound`/`outbound`) se deriva
   del tipo y `validarEvento` detecta manipulación (`eventos-canonicos.mjs:130-141`). Buen instinto de
   seguridad de contrato.
3. **Patrón Transactional Outbox reconocido y reusado.** El motor separa emitir (auditar+encolar) de
   entregar (`procesarOutbox`), con reintentos/backoff/DLQ como funciones **puras** testeables sin
   infraestructura (`outbox.mjs`). Reproduce el patrón ya probado del Work Fabric (`orq.events`).
4. **Auditabilidad de primera.** Log append-only con trigger que prohíbe update/delete
   (`db/migrations/0001_comunicacion.sql`), `correlation_id`/`causation_id` heredados, y `props` con
   `os_correlation_id` que permiten seguir un hilo del chat al evento del OS. La cadena causal es real y
   está testeada.
5. **Fail-closed en credenciales.** `botListo()` no publica sin token (`integrations/bot-os.mjs`). Buen
   default de seguridad.
6. **Higiene de código.** Todos los archivos < 500 líneas, funciones cortas, nombres claros, comentarios
   que explican el *por qué*. Idempotencia de reintentos y DLQ con cobertura de test explícita.
7. **Diseño listo para multicanal en su forma general.** Agregar un canal es implementar `PuertoAdapter`
   en `channels/x/`. La forma es correcta (aunque el *contenido* del contrato tiene sesgo chat — ver B7).

## B. Debilidades detectadas

> Verificadas con archivo:línea. Ninguna invalida la arquitectura; varias son correctness/reliability
> que deben resolverse **antes** de wirear el Work Fabric encima.

- **B1 · Idempotency-key por defecto es un hash de contenido → suprime mensajes legítimos repetidos.**
  `construirEvento` deriva la clave de `type + campos escalares de data`
  (`eventos-canonicos.mjs:107-108, 122-131`). Dos avisos salientes idénticos y legítimos (mismo canal y
  texto, en días distintos) producen la **misma** clave; el segundo se descarta silenciosamente en
  `emitir` (`communication-service.mjs:72-77`). Para salientes, la clave debe ser por *intención de
  emisión* (el `id` del evento, o una clave de negocio explícita), no por contenido.
- **B2 · Dedup entrante no atómico (TOCTOU).** `recibir` hace `vistoAntes()` y luego `registrarEvento()`
  como dos pasos, y **descarta** el resultado de `registrarEvento` (`communication-service.mjs:147-153`).
  Dos entrantes idénticos intercalados pasan ambos el chequeo y **despachan dos veces**. La única
  garantía de unicidad (el `unique(idempotency_key)` de la base) no se usa para decidir el despacho.
- **B3 · La ingesta entrante no tiene reintento ni DLQ.** Si un handler falla, `_despachar` lo captura,
  loguea y sigue (`communication-service.mjs:163-170`): la reacción se **pierde**. Hoy es inocuo (los
  handlers son de juguete), pero en PR-4 el handler encola al Work Fabric — si el Fabric está caído, el
  mensaje del usuario se pierde sin redelivery. La salida tiene outbox; la entrada no.
- **B4 · El claim del outbox no es durable → doble entrega bajo concurrencia.** `claim_outbox` es
  `SELECT … FOR UPDATE SKIP LOCKED` sin cambiar el estado de la fila
  (`db/migrations/0001_comunicacion.sql`, función `claim_outbox`). En `RepositorioPostgres.tomarPendientes`
  corre como query suelta; el lock se libera al confirmar esa query, mucho antes de publicar y llamar a
  `actualizarSalida`. Dos workers (o dos ticks solapados) toman las **mismas** filas `pendiente` y
  publican dos veces. Como `crearPost` de Mattermost **no** es idempotente, esto son posts duplicados. El
  repo en memoria tampoco marca in-flight (`repositorio-memoria.mjs:44-54`): sólo funciona por ser
  monohilo.
- **B5 · Asimetría del puerto de repositorio (abstracción con fugas).** En memoria, `registrarEvento`
  audita y `encolarSalida` encola. En Postgres, `comunicacion.emit` hace **las dos cosas** y
  `encolarSalida` es un no-op (`repositorio-postgres.mjs:34-40`). Además `registrarEvento` de Postgres
  **siempre** devuelve `insertado: true` (hace `emit` y luego `select 1 … where idempotency_key`, que
  siempre encuentra la fila — `repositorio-postgres.mjs:22-30`): la rama "duplicado ignorado" de `emitir`
  queda muerta en Postgres. Dos implementaciones del mismo puerto con semántica distinta: romperá al
  cambiar de una a otra.
- **B6 · Idempotencia entrante degrada de forma insegura sin `post_id`/`trigger_id`.** El adapter usa
  `post_id` (mensajes) y `trigger_id` (comandos) como clave natural, pero si el webhook no los envía cae
  a `canal+texto` / `comando+texto+user` (`channels/mattermost/mattermost-adapter.mjs:110-118, 121-129`):
  dos mensajes o comandos legítimos iguales (`/os ping` dos veces) colisionan y el segundo se pierde.
- **B7 · El contrato canónico tiene forma de chat, no de "cualquier canal".** `data` transporta
  `channel_id`, `root_id`, `emoji`, `post_id` — conceptos de Mattermost/Slack. Email no tiene canal ni
  reacción; WhatsApp es 1:1 por teléfono; Telegram usa chat_id. El sobre es agnóstico, pero el `data` y
  varios `TIPOS` (`reaccion.agregar`, `comando.invocado`) no mapean a Email/WhatsApp. La afirmación
  "multicanal" es cierta en estructura, parcial en contrato.
- **B8 · Dos mecanismos de outbox/event-log en el sistema.** El OS ya tiene `orq.events` +
  `orq.emit_event` (transactional outbox). PR-3 introduce `comunicacion.eventos` + `comunicacion.emit`.
  Es defendible para un servicio standalone, pero PR-4 debe definir explícitamente el puente (¿un evento
  entrante se convierte en un `orq.event`?) para no tener dos fuentes de verdad de eventos compitiendo.
- **B9 · `aCanonico` es síncrono.** `puerto-adapter.mjs:` la interfaz es sync. Adapters futuros
  (Email/IMAP, WhatsApp con descarga de media) necesitarán normalización asíncrona. Cambiar el contrato
  del puerto ahora es barato; después de tener 3 adapters, es un breaking change.
- **B10 · Cobertura desigual.** Sin tests: `repositorio-postgres`, `identidad`, `slash-commands`,
  `bot-os`, `observabilidad`. Justo la implementación Postgres (la que irá a producción) y el registro de
  comandos no tienen prueba. Además `RegistroComandos` está **aislado**: nadie lo referencia todavía (por
  diseño de PR-3, pero sin siquiera un test de humo del despachador).

## C. Riesgos técnicos

| # | Riesgo | Probabilidad | Impacto | Disparador |
|---|---|---|---|---|
| C1 | **Posts duplicados en el chat** por claim no durable (B4) | Alta al correr ≥2 workers o ticks solapados | Alto (ruido, pérdida de confianza) | PR-9 (worker en loop) o cualquier reintento concurrente |
| C2 | **Pérdida de mensajes del usuario** por falta de DLQ entrante (B3) | Media | Alto (una consulta/aprobación se evapora) | PR-4, si el Work Fabric o el handler fallan |
| C3 | **Supresión silenciosa de avisos legítimos** por idempotency de contenido (B1/B6) | Media | Alto (el OS "cree" que avisó y no avisó) | Cualquier aviso recurrente idéntico (recordatorios, alertas repetidas) |
| C4 | **Doble reacción** por dedup entrante no atómico (B2) | Baja-media | Medio | Reintentos del webhook de Mattermost |
| C5 | **Divergencia memoria↔Postgres** por puerto con fugas (B5) | Alta al activar Postgres | Medio | PR-4 (swap a `RepositorioPostgres`) |
| C6 | **Suplantación de webhooks entrantes** — token compartido, comparación no constante, sin HMAC ni allowlist; los rechazos por token se cuentan como "ignorada", no se auditan (`communication-service.mjs:137-139`) | Media | Alto (inyección de comandos/mensajes falsos al OS) | Al exponer el endpoint entrante |
| C7 | **Fuga de IDs internos** (`os_event_id`, `os_correlation_id`) en `props` visibles del post (`mattermost-adapter.mjs:69-71`) | Alta | Bajo | Siempre |
| C8 | **Crecimiento ilimitado del outbox** (filas `publicado` nunca se archivan) | Media | Bajo-medio | Volumen sostenido |
| C9 | **Reescritura del contrato** al integrar Email/WhatsApp (B7) o al volver `aCanonico` async (B9) | Alta | Medio | Segundo/tercer adapter |
| C10 | **Sin garantía de orden por conversación** — un reintento puede quedar detrás de un mensaje posterior del mismo hilo | Baja | Bajo | Reintentos con tráfico alto |

## D. Mejoras recomendadas antes de PR-4

> **Bloqueantes** = deben resolverse antes de conectar el Work Fabric/producción. Ninguna es un refactor
> arquitectónico: son correcciones localizadas dentro de la estructura ya aprobada.

| ID | Mejora | Impacto | Esfuerzo | Riesgo del cambio | Prioridad | Justificación técnica |
|---|---|---|---|---|---|---|
| **M1** | Idempotency-key saliente = `event.id` por defecto, o exigir clave de negocio explícita; hash de contenido sólo para entrantes con clave natural | Alto | Bajo | Bajo | **P0 · Bloqueante** | Elimina C3: hoy el OS puede "creer" que avisó sin haber avisado. La clave debe representar la intención de emisión, no el texto. |
| **M2** | Gatear el despacho entrante en el **insert atómico** (`registrarEvento` devuelve `insertado`; despachar sólo si `true`), eliminar el `vistoAntes` previo | Alto | Bajo | Bajo | **P0 · Bloqueante** | Cierra el TOCTOU C4 usando la unicidad que la base ya garantiza, en vez de un check-then-act. |
| **M3** | Outbox/DLQ **de ingesta**: persistir el evento entrante y reintentar el handler con backoff; si agota, a DLQ entrante | Alto | Medio | Medio | **P0 · Bloqueante** | Sin esto, en PR-4 un Work Fabric caído pierde mensajes del usuario (C2). La entrada necesita la misma garantía que la salida. |
| **M4** | Claim **durable** del outbox: dentro de la tx de claim, `UPDATE … SET estado='publicando', lease_until=now()+X … RETURNING` (o marcar y liberar por lease). Igual en el repo memoria | Alto | Medio | Medio | **P0 · Bloqueante** (antes de correr ≥1 worker real) | Cierra C1 (doble entrega). `crearPost` no es idempotente: el claim debe sobrevivir hasta confirmar la publicación. |
| **M5** | Unificar la semántica del puerto: `registrarEvento` reporta `insertado` real (`ON CONFLICT DO NOTHING RETURNING`/`xmax`), y una sola implementación encola (no `emit` + `encolarSalida` a la vez) | Medio | Bajo | Bajo | **P1** | Cierra C5: el puerto debe comportarse igual en memoria y en Postgres o el swap de PR-4 sorprende. |
| **M6** | Exigir `post_id`/`trigger_id` en entrantes (o rechazar de forma explícita) en vez de degradar a clave por contenido | Medio | Bajo | Bajo | **P1** | Cierra la mitad de C3 (comandos/mensajes repetidos legítimos). |
| **M7** | Seguridad del endpoint entrante: firma **HMAC** + comparación en tiempo constante + allowlist de IP en el reverse proxy; **auditar** (no sólo contar) los rechazos | Alto | Medio | Bajo | **P1** (antes de exponer el endpoint) | Cierra C6: el token de un outgoing webhook es débil; sin firma, cualquiera que lo obtenga inyecta al OS. |
| **M8** | Volver `PuertoAdapter.aCanonico` **async** ahora | Medio | Bajo | Bajo | **P1** | Evita un breaking change del contrato cuando entren Email/WhatsApp (C9/B9). Barato hoy, caro después. |
| **M9** | Abstraer el direccionamiento del contrato: `conversacion`/`destinatario` en `data` en vez de `channel_id`/`post_id`; marcar qué `TIPOS` son universales vs. específicos de chat | Medio | Medio | Medio | **P2** | Cierra C9/B7: hace real la promesa multicanal para Email/WhatsApp/Telegram. Puede diferirse al primer adapter no-chat. |
| **M10** | Definir el **puente** `comunicacion.eventos` ↔ `orq.events` (quién es fuente de verdad; si el entrante se materializa como `orq.event`) | Medio | Bajo (diseño) | Bajo | **P1** (decisión antes de PR-4) | Cierra B8: dos outbox sin contrato explícito llevan a divergencia de eventos. |
| **M11** | Cobertura faltante: `repositorio-postgres` (contra un Postgres efímero), `identidad`, `slash-commands`, `bot-os`, `observabilidad` | Medio | Medio | Bajo | **P1** | La implementación que va a producción (Postgres) hoy no tiene prueba. |
| **M12** | No publicar `os_event_id`/`os_correlation_id` en `props` visibles del post (usar metadata no expuesta o cifrar) | Bajo | Bajo | Bajo | **P2** | Cierra C7 (fuga de IDs internos). |
| **M13** | Retención/archivado del outbox (`publicado` → tabla histórica o purga por edad); limpieza equivalente en el repo memoria | Bajo | Bajo | Bajo | **P2** | Cierra C8 (crecimiento ilimitado). |
| **M14** | Mover el mapa de rutas de `deep-links` al lado del OS o a configuración | Bajo | Bajo | Bajo | **P2** | El servicio conoce la estructura de URLs interna del OS — un acoplamiento que `ARCHITECTURE.md` pide evitar. |
| **M15** | Garantía de orden por `correlation_id` en el outbox (procesar en orden dentro de un hilo; no adelantar reintentos), o documentar el trade-off aceptado | Bajo | Medio | Bajo | **P2** | Cierra C10; relevante sólo con tráfico alto por conversación. |

---

## DICTAMEN FINAL

### PR-3 APROBADO CON AJUSTES MENORES

**Fundamento.** La arquitectura es correcta y **no requiere refactor**: Ports & Adapters, contrato
canónico como frontera única, Transactional Outbox, desacople estricto verificado (sin imports cruzados,
pool inyectado) y auditabilidad real. Es la base correcta sobre la cual construir PR-4.

Los defectos encontrados (idempotencia de contenido en salientes, dedup entrante no atómico, ausencia de
DLQ de ingesta, claim de outbox no durable, asimetría del puerto Postgres, seguridad del webhook) son
**correcciones localizadas dentro de la estructura existente**, no un rediseño. Por eso el dictamen es
"ajustes menores" y no "refactor".

**Condición de integración.** "Menores" es en superficie de código, no en criticidad: **M1–M4, M7, M10 y
M11 son bloqueantes para PR-4** — si se wirea el Work Fabric sobre el estado actual, habrá posts
duplicados (C1), pérdida de mensajes del usuario (C2/C3) y exposición del endpoint entrante (C6). El
resto (M5, M6, M8, M9, M12–M15) puede planificarse con PR-4/PR-5 según prioridad.

**Conforme a la instrucción, no se implementó ninguno de estos cambios.** Quedan documentados a la espera
de autorización expresa para avanzar. Sin push, sin merge, sin tocar WT-1 ni la rama estable; todo dentro
de `feature/pr3-communication-layer`.
