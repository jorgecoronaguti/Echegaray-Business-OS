# Asistente conversacional del OS — MVP

> Estado: integrado en `feature/mattermost-assistant-integration`. **No desplegado.**
> El despliegue (merge a `main`, actualizar el árbol de deploy y reiniciar servicios)
> requiere autorización explícita del dueño.

## Qué es

El bot `@os` ya recibía lenguaje natural y ya sabía derivar un mensaje al especialista
correcto. Lo que faltaba era que además **resolviera pedidos personales**: encontrar un
archivo, acordarse de algo, agendar una reunión, anotar un pendiente.

Eso es este módulo. Se escribe en Mattermost como se le habla a una persona —sin comandos,
sin barras, sin sintaxis— y el OS ejecuta.

```
Buscame el contrato de Quattropani.
Recordame cargar saldos todos los lunes a las 8.
Recordale a Rodrigo buscar las llaves el jueves que viene a las 20.
Agendá una reunión con Rodrigo mañana a las 9.
Creame una tarea para llamar a Santander el viernes.
¿Qué sabés hacer?
```

## Qué NO es

No es un chatbot aparte. **No hay un segundo bot, ni un segundo router, ni una segunda cola,
ni una segunda forma de autenticar.** Todo entra por el camino que ya existía:

```
Mattermost ──WS──▶ mattermost-ws-consumer ──▶ inbox ──▶ ingesta-os ──▶ orq.tasks (lane comunicacion)
                                                                            │
                                            worker-comunicacion ◀───────────┘
                                                    │
                                       handlers/comunicacion.mjs
                                                    │
                                            director.mjs  ──▶  especialistas/asistente.mjs
                                                                        │
                                                        asistente/router.mjs
                                                          │        │        │
                                                   interpretar  registro  capacidades/
                                                                            │
                                              drive · recordatorio · calendar · tasks · ayuda
                                                                            │
                                                                       outbox ──▶ Mattermost
```

La IA **interpreta**. Las capacidades, los permisos, la ejecución, la persistencia, la
programación y la auditoría son del OS.

## Las cuatro decisiones que gobiernan el módulo

### 1. Una sola lista de capacidades

El router y la ayuda dinámica leen del **mismo** registro (`asistente/registro.mjs`, con
descubrimiento por directorio). No hay una lista de ayuda escrita a mano en ningún lado.
Es lo que impide el defecto clásico: una ayuda que promete lo que el router no sabe hacer.

`habilitada` es una **función**, no un booleano: una capacidad que depende de Google está
habilitada sólo si esa cuenta está conectada. Por eso `¿qué sabés hacer?` nunca ofrece algo
que va a fallar.

### 2. Las fechas no las calcula el modelo

`asistente/tiempo.mjs` resuelve "mañana a las 10", "el jueves que viene a las 20", "dentro
de dos horas" con calendario, 0 API y tests anclados a un instante fijo. Los modelos erran
día-de-semana con una frecuencia que acá no se tolera: un recordatorio entregado el jueves
equivocado no se nota hasta que ya pasó.

Y cuando la frase es genuinamente ambigua —"el jueves que viene" dicho un lunes— el módulo
**declara la ambigüedad** en vez de elegir, y el asistente pregunta una vez.

### 3. El costo de API es una decisión de diseño, no un efecto secundario

- `¿qué sabés hacer?` → **0 llamadas** (se arma desde el registro).
- Los casos masivos (`recordame…`, `agendá…`, `creá una tarea…`, `buscame…`) → **0 llamadas**
  (los reconoce la gramática determinística).
- Sólo lo que el camino determinístico no pudo clasificar llega al modelo: **una** llamada,
  prompt compacto (mensaje actual + catálogo de una línea por capacidad + esquema de salida),
  temperatura 0, tokens acotados, salida validada con Zod.
- **Nunca** viaja el historial del canal, ni datos de la empresa, ni tablas.
- Sin `ANTHROPIC_API_KEY`, sin crédito o con salida inválida → intención `desconocido` y una
  respuesta honesta. Nunca una capacidad adivinada.

### 4. Nada se afirma sin evidencia

Un resultado `ok: true` sin evidencia (id del evento, id de la tarea, id del recordatorio,
enlace del archivo) es un bug, y hay un test que lo fija. El asistente no dice "listo" hasta
tener el identificador de lo que creó.

## Persistencia

Todo en el schema `comunicacion` (migración `20260731140000_asistente_conversacional.sql`),
aditivo y aislado. Sin RLS, igual que el resto del schema: no está expuesto a PostgREST, se
accede sólo desde el worker por `DATABASE_URL`.

| Tabla | Para qué |
|---|---|
| `identidades` | Mattermost ↔ OS ↔ Google de una misma persona. Sin esto, "Rodrigo" es texto libre, y hay dos. |
| `recordatorios` | Los recordatorios internos. Cadencia en el mismo formato que `orq.schedules`. |
| `recordatorio_entregas` | Historial **y** llave de no-duplicación por ocurrencia `(recordatorio, momento)`. |
| `asistente_pendientes` | La aclaración a medio camino. Como máximo una abierta por persona. |
| `asistente_ejecuciones` | Un `(mensaje, capacidad)` se ejecuta una vez. Es lo que impide que un reintento cree un segundo evento de Calendar. |

## Idempotencia: tres barreras, tres cosas distintas

1. **El mensaje** — `dedupe_key = comm:<comm_event_id>` en `orq.tasks`, más el dedup por
   `post.id` del consumidor WS. Un webhook repetido no genera dos tareas. *(Ya existía.)*
2. **El efecto externo** — `asistente_ejecuciones (comm_event_id, capacidad)`. Un reintento
   *dentro* de la tarea (lease vencido, otro worker) no crea un segundo evento ni una
   segunda tarea de Google.
3. **La entrega del recordatorio** — `recordatorio_entregas (recordatorio_id, programada_para)`.
   Un recurrente no puede entregar dos veces el mismo lunes a las 8, ni saltearse uno.

## Recordatorios: por qué son del OS y no de Google

Un recordatorio no es un compromiso de agenda (Calendar) ni un pendiente (Tasks): es *el OS
hablándole a una persona en un momento*. Si viviera en Google, el OS no podría entregarlo por
Mattermost ni saber si la entrega entró. Por eso tiene tabla propia, estado propio y su
entrega la hace el worker de comunicación, que es el único proceso con el cliente de
Mattermost y el pool de la base.

Los tres verbos se separan por gramática, y ante duda real se pregunta:

| Se dice | Va a |
|---|---|
| recordame · avisame · recordale · avisale | recordatorio interno del OS |
| agendá · creá un evento · poné en el calendario | Google Calendar |
| creá una tarea · agregá como tarea | Google Tasks |

## Identidad y permisos

La identidad viene de Mattermost (conexión WebSocket autenticada del bot) y se resuelve
contra `comunicacion.identidades`. **Un nombre que no está en esa tabla no existe**: el
asistente no inventa usuarios ni manda un recordatorio a alguien que no pudo identificar.

Para actuar sobre Google, el OS usa la cuenta del **que pide** si autorizó la suya
(`orq.google_tokens`); si no autorizó, se lo dice. Nunca actúa en la cuenta de un tercero.

## Operación

El módulo corre dentro de servicios que ya existen; **no agrega procesos**:

- `echegaray-comunicacion-ws` — entrada (sin cambios).
- `echegaray-comunicacion-worker` — interpretación, ejecución, publicación **y entrega de
  recordatorios** (paso nuevo dentro del tick, con su propio intervalo).

### Sembrar identidades

```bash
node orquestador/scripts/asistente-identidades.mjs --dry-run   # muestra qué haría
node orquestador/scripts/asistente-identidades.mjs             # aplica
```

### Verificar sin tocar producción

```bash
node --test 'orquestador/comunicacion/**/*.test.mjs'
```
