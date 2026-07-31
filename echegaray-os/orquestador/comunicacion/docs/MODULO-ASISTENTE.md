# Asistente conversacional del OS — MVP

> Estado: probado contra el entorno REAL el 31/07/2026 (migración aplicada, identidades
> sembradas, las seis frases ejecutadas de punta a punta). **No desplegado.**
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
| `identidades` **(ya existía, se extendió)** | Mattermost ↔ OS ↔ Google de una misma persona. Sin esto, "Rodrigo" es texto libre, y hay dos. |
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
node --test 'orquestador/**/*.test.mjs'      # 1.784 pruebas, sin base ni red
node orquestador/comunicacion/test-pr4.mjs   # las verticales, contra un Postgres descartable
```

Las verticales levantan un Postgres efímero en Docker, le aplican los esquemas reales
(`orq` + `comunicacion` + esta migración) y recorren el camino completo. Es lo que destapó
que `comunicacion.identidades` ya existía: contra dobles, todo pasaba.

## Las tres identidades de Google del OS

El OS no tiene una cuenta de Google: tiene tres, y cada flujo usa la que le corresponde.
Mezclarlas no rompe nada de forma visible — sigue funcionando, con la cuenta equivocada.

| Identidad | Valor | Con qué se arma | Quién la usa |
|---|---|---|---|
| **Institucional** | `service_account` | `googleDelOs()` | asistencia: lectura y escritura de JORNALES |
| **Institucional** | `service_account` | `makeGoogleClient({scopes: WRITE_SCOPES})` | el pipeline de Sheets (Flujo de Fondos, Proveedores, Caja…) |
| **Operadora** | `operator_oauth` | `getTokenFor(await operadorEmail())` | `specialist`, `operation_execute`, `interactive-server`, scripts de sync |
| **Personal** | `user_oauth` | `googleDe({identidad})` del asistente | Calendar y Tasks de cada persona |

Las dos primeras filas son la misma identidad armada por dos caminos: el pipeline no pasa por
`googleDelOs()`, construye su cliente directo. Coinciden en la cuenta, que es lo que importa.

La institucional es **el Service Account, explícito**. No es una preferencia estética: la
protección de ediciones de Drive reconoce al OS por el `gserviceaccount.com` del historial
(`lib/historial-ediciones.mjs`), así que la cuenta con la que el OS escribe es lo que le
permite distinguir su propia escritura de una edición del dueño.

Para JORNALES en particular hay que ser exacto, porque es fácil exagerar el riesgo: la
asistencia escribe con `compartida: true`, y `evaluarBloqueadas` sale antes de llegar a la
firma cuando ese flag está puesto — así que hoy **el auto-candado no se dispara sobre
JORNALES aunque cambiara la identidad**. Lo que sí cambiaría, y alcanza para no tocarlo sin
autorización, es que el historial de Drive de una planilla que administración mira todos los
días pasaría a decir el nombre de una persona en vez del robot, y que cualquier pestaña que
este cliente escriba en el futuro **sin** `compartida` sí se auto-candaría. Sin error y sin
log, en los dos casos.

La personal **nunca cae al Service Account**. Cuando la persona no conectó su Google, el
cliente queda marcado `propia:false` y `permiteEfectoExterno()` bloquea la acción. Crear el
evento de Rodrigo con la cuenta de servicio "funciona" —devuelve id y todo— y Rodrigo no ve
nada: un efecto en la cuenta equivocada es peor que un fallo, porque no se nota. Pasó de
verdad el 31/07/2026, con "creame una tarea para llamar a Santander".

### El defecto que lo destapó, y cómo quedó arreglado

`googleDelOs()` llamaba `operadorEmail()` **sin `await`**. Como es `async`, `op` era una
Promise siempre verdadera; `accessTokenFor` consultaba la base por el literal
`"[object promise]"`, no encontraba fila, devolvía `null` y `makeGoogleClient` caía en
silencio al Service Account. Un defecto escrito mal cuyo resultado era, por accidente, el
correcto para JORNALES — la peor clase de código sano: el día que alguien agregara el `await`
"obvio", el candado se rompía.

El arreglo **no fue agregar el `await`**: fue volver la identidad institucional explícita.
`googleDelOs()` construye el cliente de Service Account a propósito, sin `getToken`, y lo
marca con `IDENTIDAD_OS` para que cualquiera pueda preguntarle con qué cuenta quedó
(`identidadDe`, `describirIdentidad`). Lo que antes dependía de que un bug se mantuviera
intacto, ahora es un contrato con pruebas.

### Cómo se verifica

```bash
# regresión pura (sin base, sin red): fija la identidad de cada flujo
node --test 'orquestador/lib/google-identidad*.test.mjs'

# la resolución de cuenta contra un Postgres REAL y descartable
docker run -d --rm --name pg-goo -e POSTGRES_PASSWORD=x -p 55443:5432 postgres:16-alpine
PG_TEST_URL=postgres://postgres:x@127.0.0.1:55443/postgres \
  node --test orquestador/lib/google-identidad.integracion.test.mjs
docker rm -f pg-goo
```

Sin `PG_TEST_URL`, la de integración se saltea; y si la URL huele a producción, se niega a
correr. La prueba que importa se llama *"googleDelOs() escribe como la cuenta institucional
(service_account) — JORNALES depende de esto"*: si alguien cambia sin querer la identidad con
la que el OS escribe asistencia, esa se pone en rojo antes de que el candado se entere.

### El inspector

Para mirar el estado real —qué cuenta usaría hoy cada flujo, en el entorno que sea— hay un
script de **sólo lectura**, que no escribe ni crea nada en Google y no imprime ningún token:

```bash
node orquestador/scripts/auditar-identidad-google.mjs
node orquestador/scripts/auditar-identidad-google.mjs --personas jorge@ecsas.com.ar,rodrigo@ecsas.com.ar
```

Devuelve una tabla con la lectura institucional de Drive, la escritura de JORNALES, el
Calendar y las Tasks de cada persona, el caso de quien no conectó su Google, y la cuenta
operadora resuelta — más el aviso explícito si la escritura institucional dejó de ser la
cuenta de servicio.

Del lado del asistente, lo que ya estaba resuelto sigue igual: **resuelve su propia cuenta de
Google desde la identidad de quien pide** (`router.mjs` → `googleDe`) y no hereda el cliente
del handler. Personal IA sigue recibiendo el cliente institucional, que para escribir jornadas
*como el OS* es exactamente lo correcto.

## Lo que este módulo NO resuelve todavía

Dicho acá para que no haya que descubrirlo usándolo:

- **Sólo hay dos personas en Mattermost** (jorge y rodrigo). Un recordatorio cruzado a
  cualquier otro nombre responde "no lo tengo registrado" — que es lo correcto, pero
  significa que el equipo de campo todavía no está en el chat.
- **Calendar y Tasks exigen que cada uno conecte SU cuenta.** Si no, la capacidad no se
  ofrece: crear el evento con la cuenta operadora del OS le confirmaría a alguien una
  reunión que no va a ver.
- **Un evento con invitados manda invitaciones reales por mail.** Es la única superficie del
  módulo con efecto hacia afuera de la empresa.
- **Los recordatorios se publican directo por el cliente de Mattermost**, no por el outbox:
  tienen su propio ledger de entregas y su propio reintento. No son la respuesta a un
  mensaje, así que no tienen un `comm_event_id` con el que entrar al outbox.
