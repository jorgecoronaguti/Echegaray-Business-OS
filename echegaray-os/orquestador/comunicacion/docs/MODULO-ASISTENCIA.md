# Módulo Asistencia — documentación definitiva

> Estado: **v3 en producción** desde el 30/07/2026.
> **Todo ocurre dentro de Mattermost.** La v2 tuvo una pantalla web: fue una dirección
> equivocada y se retiró por completo. Un supervisor no sale de Mattermost para cargar.
> Este documento reemplaza a cualquier descripción anterior del módulo. Los documentos
> `PR-4.1-*`, `PR-4.2-*` y `PR-4-ARQUITECTURA.md` son **histórico de construcción**: describen
> cómo se llegó acá, no cómo funciona hoy.
> El runbook operativo del día a día (comandos, permisos, corregir una carga) vive en
> [`OPERACION-ASISTENCIA.md`](./OPERACION-ASISTENCIA.md) y sigue vigente.

---

## 1. Qué resuelve

El jefe de obra anota la asistencia en papel; alguien de administración la vuelca a la planilla
JORNALES; los errores aparecen en la quincena. El módulo permite que la asistencia se cargue y
se consulte **desde el celular, escribiendo en castellano**, con la escritura en la planilla real
hecha por código determinístico y auditada celda por celda.

Contribución a la misión: menos trabajo humano de recarga, el dato de HH llega antes y con
trazabilidad, y la línea de jornales del cash flow deja de depender de un volcado manual.

## 2. Principio de diseño — dónde está permitida la IA y dónde no

Es la regla que gobierna todo el módulo y la razón de su arquitectura:

| Decisión | Quién la toma |
|---|---|
| Qué especialista atiende el mensaje | **Director** (determinístico primero, modelo sólo si hay ambigüedad) |
| Qué significa `3 ausente` | Gramática del especialista — **código** |
| Qué fila corresponde al trabajador | **Código** (identidad estructural sobre la planilla releída) |
| Qué columna corresponde a la fecha | **Código** (`jornales-estructura.mjs`) |
| Cuántas horas se guardan | **Código** (`horas-extra.mjs`, normalización + validación) |
| Cómo se conserva una fórmula | **Código** (fingerprint de celda + fórmula preservada) |
| Cómo se resuelve una colisión | **Código** (concurrencia optimista, re-lectura + re-resolución) |
| Cómo se aplica la idempotencia | **Código** (clave estable SHA-256, acotada a la sesión; quién decide si hay que escribir es la planilla releída) |

**Ningún modelo se interpone entre una marca del jefe y la modificación de una celda.** El modelo,
cuando interviene, sólo elige destinatario dentro de una lista cerrada de especialistas
registrados; si no hay motor disponible no adivina, responde el catálogo.

---

## 3. Arquitectura

```
  Jefe de obra
      │  mensaje en #asistencia (canal privado) o DM a @os
      ▼
┌──────────────────────────────────────────────────────────────────┐
│ TRANSPORTE — mattermost-ws-consumer.mjs        (systemd: …-ws)   │
│ WebSocket SALIENTE. Sin endpoint HTTP publicado. CERO Anthropic. │
└──────────────────────────────────────────────────────────────────┘
      │  mapearAPayload()
      ▼
┌──────────────────────────────────────────────────────────────────┐
│ COMMUNICATION SERVICE — conector.mjs                             │
│ dedup, identidad, comunicacion.inbox, orq.emit_event,            │
│ orq.enqueue_task(lane 'comunicacion')                            │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│ WORK FABRIC — worker-comunicacion.mjs          (systemd: …-worker)│
│ claim_task(queue='comunicacion') → handlers/comunicacion.mjs     │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│ DIRECTOR — director.mjs      (genérico: no nombra ningún dominio)│
│ 1 reclamo del especialista · 2 área del canal · 3 modelo · 4 cat.│
└──────────────────────────────────────────────────────────────────┘
      │  especialistas/personal.mjs   (área `personas`, agente `rrhh`)
      ▼
┌──────────────────────────────────────────────────────────────────┐
│ SKILL — asistencia-flujo.mjs (máquina de estados, determinística)│
│  asistencia-sesion · asistencia-ui · asistencia-permisos ·       │
│  asistencia-auditoria · asistencia-consultas                     │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│ ADAPTADOR JORNALES — lib/tools/jornales-asistencia.mjs           │
│ + lib/jornales-estructura.mjs (grilla) + lib/horas-extra.mjs     │
└──────────────────────────────────────────────────────────────────┘
      │  Google Sheets API v4 · batchUpdateValues atómico
      ▼
   Planilla JORNALES  ──▶  auditoría (orq events + v_asistencia_auditoria)
      │
      ▼
   comunicacion.outbox ──▶ respuesta EN EL MISMO CANAL, en el hilo del post
```

Ese es el camino del **texto**. Los **clicks** del mensaje interactivo entran por otro proceso
y no pasan por el Director ni por el worker:

```
  Jefe de obra toca un botón
      │  POST /api/v4/posts/{post_id}/actions/{action_id}   (cliente → Mattermost)
      ▼
  Mattermost llama la URL de callback que guardó, con su secreto en la query
      │  POST https://chat.ecsas.com.ar/asistencia/accion?t=…   (Caddy → socket unix)
      ▼
  servidor-asistencia.mjs → asistencia-accion.mjs
      │  SECRETO → GUARDA DE CANAL → ruteador (asistencia-mm/acciones.mjs)
      ▼
  núcleo (jornales-asistencia.mjs) ──▶ JORNALES + auditoría
      │
      ▼
  el MISMO post, reescrito (`update`, o `PUT /posts/{id}` tras un diálogo)
```

### Por qué el Director no sabe de asistencia

Asistencia es **el primer especialista registrado**, no un caso privilegiado. El registro
(`registro-especialistas.mjs`) descubre `especialistas/*.mjs` leyendo el directorio: agregar
Compras es agregar un archivo, sin tocar el Director ni el handler. Dos tests leen el código
fuente del Director y del handler y **fallan si vuelven a nombrar un dominio** o si aparece un
`switch`.

---

## 3bis. La carga, dentro de Mattermost

`@os asistencia` **en el canal #asistencia** publica UN mensaje interactivo. Elegir la obra
**reescribe ese mismo mensaje** con la cuadrilla. Registrar escribe. No hay conversación que
crezca hacia abajo: hay un mensaje que cambia.

**Caso normal: dos clicks.** Elegir la obra → Registrar.

| Paso | Qué ve el jefe |
|---|---|
| `@os asistencia` | Fecha (hoy) con `Hoy` / `Ayer` / `Otra fecha…`, y el desplegable de obras |
| Elige la obra | La cuadrilla entera, presente con la jornada del día, con su resumen |
| `No vino` · `Hizo menos horas` · `Hizo horas extra` | Un **diálogo** de esa persona con **sólo** los campos y los motivos que ese tipo de novedad admite |
| `Registrar` | Se escribe, se audita y el mensaje queda confirmado |

Las excepciones son lo único que se toca: el default es el caso normal, y el default es
silencioso — presente completo lleva un guion al margen, la excepción grita.

### El tipo de excepción se elige ANTES de abrir el formulario

Antes había **un solo** botón, `Marcar excepción`, que abría **un solo** formulario con
«¿Trabajó? Sí/No», «Horas» y «Motivo» — y el desplegable de motivos traía el **catálogo entero**
(`motivos: d.motivos.CATALOGO`), sin filtrar por contexto. Se podía elegir
«Trabajó: Sí · Horas: 5 · Motivo: Faltó con aviso», y la combinación **recién se rechazaba al
guardar**. La validación era correcta; la experiencia, no: corregía después en vez de prevenir
antes.

**Por qué no se arregla refrescando el formulario.** Los diálogos interactivos de Mattermost son
**estáticos**: no hay evento de cambio ni forma de re-renderizar el formulario cuando el usuario
toca un campo. No existe "actualizar los motivos al cambiar Trabajó". La única manera nativa de
que no se pueda elegir una combinación inválida es decidir el **tipo** de excepción **antes** de
abrir el diálogo, y abrir un formulario que ya sólo contenga lo compatible.

Por eso el desplegable único se reemplaza por **tres**, uno por cada ámbito que el backend ya
distingue:

| Botón | Qué pregunta el diálogo | Motivos que ofrece |
|---|---|---|
| **No vino** | Motivo + Aclaración. Las horas son 0: **no se preguntan** | Sólo los de ausencia: Faltó sin avisar, Faltó con aviso, Enfermedad, Accidente, Permiso, Licencia especial, Vacaciones, Suspensión, Franco/feriado, Lluvia, Obra parada, Paro, Otro |
| **Hizo menos horas** | Horas (desplegable con los valores **por debajo** de la jornada del día) + Motivo + Estuvo en otra obra + Aclaración | Sólo los de jornada parcial: Llegó tarde, Se retiró antes, Lluvia, Obra parada, Paro, Enfermedad, Accidente de trabajo, Accidente in itinere, Permiso, Otro |
| **Hizo horas extra** | Horas (desplegable con los valores **por encima** de la jornada) + Aclaración | **Ninguno**: las horas extra las calcula el núcleo y el catálogo no ofrece ningún motivo para ellas |

Con eso, **ninguna combinación que el formulario puede producir es inválida**: no se puede elegir
un motivo de ausencia con horas trabajadas, ni un motivo de jornada parcial con la jornada
completa o con horas extra.

**El texto en inglés.** Cuando el diálogo devolvía sólo errores por campo (`errors`), Mattermost
mostraba su texto por defecto, «Submission failed with validation errors». Se verificó leyendo el
propio cliente de Mattermost: si la respuesta trae un `error` de primer nivel, muestra **ese**
texto; si no, usa el default en inglés. Ahora toda respuesta de error del diálogo lleva también
una frase en castellano, así que el texto en inglés ya no aparece.

**Lo que no cambió, a propósito.** La validación del backend
(`lib/asistencia-motivos.mjs` → `validarNovedad`) quedó **exactamente igual**: sigue siendo la
última palabra y sigue rechazando cualquier combinación inválida que llegue por otro camino.
Tampoco cambiaron la escritura en JORNALES, los permisos, la auditoría ni la idempotencia.

**La lección, que vale para cualquier UI interactiva futura.** Cuando la interfaz no puede
reaccionar a lo que el usuario elige —y un diálogo de Mattermost no puede—, hay que partir la
pregunta en **antes**: elegir primero el tipo de novedad y abrir un formulario que ya sólo pueda
producir combinaciones válidas. Prevenir antes en vez de corregir después.

### Lo que Mattermost permite y lo que no (auditado en 11.8.4, no supuesto)

| Capacidad | Estado | Consecuencia |
|---|---|---|
| Attachments con acciones | **SÍ** | Es la UI |
| Actualizar el post desde una acción | **SÍ** | El mensaje se reescribe |
| Diálogo modal (`trigger_id`) | **SÍ**, tope **5 elementos** | Desde que hay un formulario por tipo, el más largo («Hizo menos horas») usa **4**: horas, motivo, otra obra y aclaración. Queda un lugar libre, no cinco |
| Reaccionar dentro del diálogo a un cambio de campo | **NO** | El diálogo es **estático**: no hay evento de cambio ni re-render. El tipo de excepción se elige **antes** de abrirlo, y cada diálogo trae sólo lo compatible |
| Texto propio de error al rechazar un `dialog_submission` | **SÍ**, con un `error` de primer nivel | Sólo con `errors` por campo, Mattermost muestra su default en inglés «Submission failed with validation errors» |
| Actualizar el post desde un `dialog_submission` | **NO** | Tras el diálogo, el post se refresca por API |
| `POST /posts/ephemeral` | **NO — 403** | El bot no es admin; los avisos salen por `ephemeral_text` de la acción |
| Crear `/asistencia` | **NO** | El bot es `system_user`. La puerta es `@os asistencia` |
| Markdown en el texto del attachment | **NO fiable** | La jerarquía se hace con `title` y `fields` |

### La ruta HTTP no es una pantalla

Mattermost **exige** una URL de callback para sus botones: `POST /asistencia/accion`. Nadie
abre un navegador — el jefe toca el mensaje en el canal y Mattermost llama al OS. El servicio
escucha en un **socket unix** (el firewall del host descarta lo que viene de los bridges de
Docker) y Caddy lo publica bajo el dominio que ya sirve Mattermost.

### Esa ruta está en Internet: el secreto de la integración

Caddy publica `/asistencia/accion` en el dominio público, y **la identidad del que carga sale
del payload** (`user_id`, `channel_id`), que lo escribe quien llama. Mientras el endpoint no
verificó nada, un `curl` anónimo con el `user_id` de alguien habilitado y el `channel_id` del
canal de asistencia **pasaba el control de canal y el de permisos** y quedaba a un paso de
escribir jornales a nombre de esa persona. Ni el canal ni el permiso defienden nada si la
identidad la pone el atacante: era la única de las puertas que no presentaba credencial — el
slash command ya presentaba su token.

Hoy el pedido tiene que presentar un **secreto de integración** (`ASISTENCIA_ACCION_SECRETO`),
y la verificación corre **antes** que la guarda de canal:

- **Dónde viaja**: en la query (`?t=…`) de la URL de callback. Mattermost guarda esa URL en su
  base y **no se la manda al cliente** — verificado contra el servidor real: los posts llegan
  sin el bloque `integration`, ni siquiera pidiéndolos con un token de API. Sólo el servidor de
  Mattermost la conoce.
- **Un solo lugar la arma** (`secreto-compartido.mjs` → `urlAccionDeEntorno`), y lo usan las
  tres puertas que publican botones: el slash command, la mención `@os asistencia` y el
  re-render de cada click. Si cada una armara la suya, alcanzaría con que una se olvidara el
  secreto para que sus botones murieran en producción y en ningún test.
- **Se compara en tiempo constante** (`timingSafeEqual`), no con `===`: el tiempo de respuesta
  de una comparación que corta en el primer byte distinto permite adivinar el secreto de a un
  carácter.
- **Falla cerrado en los dos sentidos**: sin la variable configurada el endpoint **deniega
  todo**. Un endpoint que escribe jornales sin verificar nada es peor que uno apagado —
  apagado se nota enseguida; abierto, recién cuando aparece una carga que nadie hizo.

La variable es **obligatoria en los dos entornos**: en `asistencia-http.env` (el servicio que
atiende los clicks) y en `comunicacion.env` (el worker, que publica los botones de la mención).
Si están distintas, el mensaje se publica y **ningún botón responde**. Ver §11.

El rechazo queda auditado como cualquier otro: familia `token`, con `error_code`
`secreto_sin_configurar` o `secreto_invalido`. Al usuario no se le dice cuál de los dos.

### La tarjeta del slash command la publica el BOT, nunca `in_channel`

**Hallazgo del 03/08/2026, medido en producción.** El servicio logueaba `no se pudo actualizar
el post` y Mattermost contestaba `PUT /posts/{id} → 403: You do not have the appropriate
permissions`, dos veces seguidas, con el jefe cargando.

La causa no estaba en el pedido: estaba en **de quién es el post**. `/asistencia` respondía con
`response_type: 'in_channel'`, y un slash command respondido así crea el post **a nombre de
quien tipeó el comando**, no del bot. El bot (`os`, `is_bot: true`, rol `system_user`) no tiene
`edit_others_posts`, así que **ningún** refresco por API sobre esa tarjeta podía funcionar —
nunca, no de a ratos.

Por qué no se veía en los botones: un click se refresca devolviendo `{update: …}` en el cuerpo
de la respuesta, y eso Mattermost lo aplica sin mirar quién es el dueño del post. Los
**diálogos** (excepción guiada, «Aplicar lo mismo a…») vuelven por la API. Resultado: la marca
**se guardaba** y la tarjeta **no se redibujaba**. El jefe veía la lista vieja, creía que no
se había guardado, y volvía a cargar. La mención `@os asistencia` nunca tuvo el problema porque
ahí el post lo publica el bot desde el principio.

La corrección: el comando recibe el cliente de Mattermost y publica la tarjeta con
`crearPost` — el post es del bot y se puede reescribir siempre. El slash command contesta 200
sin cuerpo. El `id` del post nuevo se ata a la sesión (`root_post_id`) en el mismo arranque, así
que `postDe(sesion)` resuelve desde el primer momento y el refresco ya no depende de que alguien
haya tocado un botón antes. Si `crearPost` falla, la sesión se cierra y la persona recibe un
efímero que dice que no se registró nada.

Lección general: **quién es el autor del post decide qué se puede hacer después con él.** Una
respuesta que "se ve igual" en el canal puede ser de otro dueño.

### El `id` de una acción viaja dentro de una URL de Mattermost

Cuando el jefe toca un botón, el cliente llama a
`POST /api/v4/posts/{post_id}/actions/{action_id}`. El `id` de la acción **no es una etiqueta
interna nuestra**: es un segmento de esa URL, y **el router de Mattermost sólo acepta ids
alfanuméricos** en ese lugar. Un id con guión bajo (o con guión medio) no matchea la ruta:
Mattermost contesta su propio 404 de router y **la petición nunca llega al Business OS**.

Por eso todo id de acción del módulo es alfanumérico (`fechahoy`, `fechaayer`, `fechaotra`,
`obra`, …). El servidor **nunca rutea por el `id`**: rutea por `context.paso`. El id existe para
Mattermost, no para nosotros. `contrato-mattermost.mjs` exige que todo id de acción sea
alfanumérico, y hay un test que recorre todos los mensajes del módulo: un botón nuevo con guión
bajo no puede volver a llegar a producción.

**Cómo se descubrió (30/07/2026).** El mensaje se publicaba bien, pero apretar cualquiera de los
tres botones de fecha (`Hoy`, `Ayer`, `Otra fecha…`) mostraba «Sorry, we could not find the
page.», mientras que el desplegable de obra y el botón `Registrar`, **en el mismo mensaje**,
funcionaban. Los tres botones de fecha tenían el id con guión bajo: `fecha_hoy`, `fecha_ayer`,
`fecha_otra`. En los logs del servicio no había **una sola línea** — y esa ausencia era la pista:
no era el backend, ni el ruteo de Caddy, ni una URL vieja de la pantalla web eliminada.

Cuatro llamadas al mismo post, con el mismo token, lo probaron:

| `id` enviado | Respuesta | Qué significa |
|---|---|---|
| `obra` — alfanumérico, existe en el post | HTTP 200 `{"status":"OK"}` | La ruta matchea y la acción existe |
| `noexisteaqui` — alfanumérico, no existe | HTTP 404 `api.post.do_action.action_id.app_error` | La ruta matchea: **el handler corrió** y dijo "esa acción no está" |
| `fecha_hoy` — guión bajo | HTTP 404 `api.context.404.app_error` | «Sorry, we could not find the page»: **el router ni matcheó** |
| `fecha-hoy` — guión medio | HTTP 404 `api.context.404.app_error` | Lo mismo |

El contraste entre los **dos 404 distintos** es lo que prueba que el problema es el **carácter**
del id y no la existencia de la acción.

La corrección fue cambiar los tres ids a `fechahoy`, `fechaayer` y `fechaotra`. No cambió nada
más: mismo tipo de botón, mismo endpoint `/asistencia/accion`, mismo `context`, misma sesión,
mismo backend.

Dos lecciones, que valen para cualquier UI interactiva futura:

- El alfabeto de un identificador que viaja dentro de una URL ajena **lo decide el dueño de esa
  URL**, no nosotros.
- Un defecto que **no deja rastro en los logs del propio sistema** es señal de que la falla
  ocurre **antes** de llegar: hay que ir a mirar los logs del otro lado.

### Lo que el camino de botones hacía distinto del camino viejo

La UI de Mattermost llegó después que el flujo conversacional y, sin proponérselo, se
construyó tres cosas propias donde ya había una. Ninguna se veía desde afuera:

**El post no se refrescaba después de un diálogo.** El ruteador le pasaba al cliente `postId` y
el cliente espera `id`: salía `PUT /posts/undefined → 400`, el error quedaba en el log y la
respuesta al jefe era 200 igual. El jefe guardaba la excepción, el sistema decía OK y **la
lista seguía mostrando lo viejo**. Ahora el nombre es el que el cliente espera, y el id del
post se guarda en la sesión **apenas se conoce** — así «Otra fecha…» como primer click (un
diálogo, que no trae `post_id`) también deja el mensaje al día en vez de mostrar las obras del
día anterior.

**La auditoría de la escritura se armaba a mano.** El evento `written` del camino de botones
guardaba cuatro campos, mientras el camino conversacional usaba `payloadConfirmacion`. Toda
carga hecha desde la UI real quedaba **sin `celdas_modificadas`** —qué celda, de qué valor a
cuál, cuánto normal y cuánto extra— y sin `mattermost_username`: justo lo que hay que mirar
para auditar una carga. Hoy los dos caminos usan el mismo constructor. Los rechazos del
ruteador, además, llevan `request_id`, que antes sólo llevaban los de la puerta.

**Tres mensajes decían algo que no había pasado.** «Esta carga ya se registró» salía también
cuando la sesión se había cerrado entre que se leyó y que se quiso confirmar —un Cancelar desde
otro dispositivo, un vencimiento—: ahí **no se escribió nada** y el jefe se iba convencido de
que la asistencia estaba cargada. Ahora ese caso dice que no se escribió y cómo volver a
cargar. Tras un fallo de escritura el post ya **no ofrece «Registrar»** (la sesión quedó
cerrada como fallida: el botón sólo podía contestar «este formulario ya se cerró»). Y cambiar
de obra avisa que **se borraron las excepciones marcadas**, que es lo que siempre hizo.

### La puerta

`asistencia-guarda.mjs` corre **antes que nada**: antes de abrir sesión, de leer la planilla y
de gastar una consulta de permisos. Rechaza DM, grupos, otros canales y los pedidos que traen
dos versiones del canal. El canal oficial sale de `comunicacion.canales_area` — no está en el
código, y hay un test que falla si aparece un id de Mattermost literal.

Corre en **las tres vías que llegan a JORNALES**: el slash command / la mención
(`asistencia-inicio.mjs`), cada click del mensaje interactivo (`asistencia-accion.mjs`) y el
flujo conversacional (`asistencia-flujo.mjs`). La conversacional era la única que no la
consultaba: se podía cargar la asistencia por **mensaje privado al bot**, justo lo que la
guarda existe para impedir. El permiso solo no alcanza — dice **quién** puede, no **desde
dónde**.

Desactivar el binding apaga la carga sin desplegar código.

### Lo que la puerta rechaza también queda anotado

Un rechazo silencioso es un problema que nadie ve: el jefe de obra queda con la sensación de
que "el bot no anda", Dirección no se entera de que alguien intentó cargar sin permiso, y si
mañana aparece un intento desde un canal que no corresponde no hay con qué reconstruirlo.
Por eso **todo intento rechazado emite el evento `personal.asistencia.denied`**.

No hay tabla nueva ni sistema nuevo: se usa el auditor que ya existe
(`asistencia-auditoria.mjs` → `crearAuditor` → `orq.emit_event`, el ledger append-only del
Work Fabric), y se consulta por la misma vista de siempre,
`comunicacion.v_asistencia_auditoria`. La vista toma todo lo que empieza con
`personal.asistencia.`, así que el rechazo entra sin tocarla: `evento`, `status`,
`error_code`, `mattermost_user_id`, `mattermost_username` y `correlation_id` ya son columnas;
el resto se lee del `payload`.

Casos que quedan auditados:

| Familia | Qué pasó |
|---|---|
| Permiso | Intento sin permiso de carga |
| Canal | Intento desde un canal que no es el oficial |
| Canal | Intento desde un mensaje privado o desde un grupo |
| Token | Falta el token del slash command |
| Token | El token no es válido |
| Identidad | El pedido llegó sin identidad de plataforma |
| Payload | El payload es inválido |
| Sesión | La sesión no existe |
| Sesión | La sesión venció |
| Sesión | La sesión es de otra persona |
| Formulario | El diálogo llegó inválido |

Qué queda registrado en cada uno: timestamp, tipo de evento, `status: "denied"`, `origen`
(`slash_command` · `accion` · `dialogo`), `motivo` — la familia del rechazo —, `error_code`
con el detalle exacto (`sin_permiso`, `canal_no_es_el_oficial`, `token_invalido`,
`sesion_vencida`…), `mattermost_user_id` y `mattermost_username` cuando existan, `channel_id`,
`team_id`, y `correlation_id` / `request_id` cuando existan.

Qué **nunca** se registra: tokens, secretos, el contenido completo del payload, ni datos
sensibles. Vale acá la misma regla que en el resto de la auditoría — se guarda la evidencia de
qué pasó, no una copia de lo que entró.

La única diferencia observable es la auditoría. Los mensajes que ve el jefe de obra, los
permisos y el flujo **no cambian**: quien podía cargar sigue cargando igual, y quien no podía
lee exactamente el mismo texto que antes.

## 4. Flujo completo de un mensaje

### 4.1 Registrar asistencia (escritura)

| # | Escribe el jefe | Hace el OS |
|---|---|---|
| 1 | `asistencia` | Abre sesión (TTL). Lista las **obras del día**, releídas de la planilla |
| 2 | `obra 3` | Lista la **cuadrilla de esa obra**, releída, numerada |
| 3 | `1 presente` · `2 ausente` · `3 parcial 6` · `1 extra 2` | Registra la marca **en la sesión**, no en la planilla |
| 4 | `revisar` | Preview: celda, valor actual, valor propuesto, cuántas se crean / modifican / no cambian |
| 5 | `confirmar` | Re-lee, re-resuelve por identidad estructural, escribe **todo o nada**, audita y responde |

Comandos auxiliares: `ayuda`, `cancelar`, `deshacer` (quita una marca de la sesión).

Salvaguardas en el paso 5: fingerprint de cada celda contra lo leído; si cambió, se aborta sin
escribir. Fórmula con `#ERROR!` → celda protegida. Nombre ambiguo sin referencia → se rechaza en
vez de elegir fila. Nada escribible → no-op declarado. Falla la escritura → la sesión se cierra
como `fallida` y la clave de idempotencia se libera.

### 4.2 Consultar (sólo lectura)

`asistencia de hoy` · `asistencia de ayer` · `asistencia del 17/01` · `quién trabajó ayer` ·
`quién faltó ayer` · `asistencia de la obra Messinas` · `asistencia de Quiroga Sebastian` ·
`horas extra del 17/01`.

No abren sesión ni tocan la planilla. Fecha imposible → lo dice (`No entendí la fecha «32/13»`).
Persona inexistente → lista los trabajadores reales, no inventa.

---

## 5. Componentes

### Communication Layer (genérico — no es del módulo)

| Archivo | Responsabilidad |
|---|---|
| `mattermost-ws-consumer.mjs` | Transporte WebSocket saliente. Cero Anthropic |
| `conector.mjs` | Dedup, identidad, inbox, alta de tarea en el lane |
| `worker-comunicacion.mjs` | Worker 24×7 del lane `comunicacion` |
| `handlers/comunicacion.mjs` | Handler genérico: Director → especialista → outbox |
| `director.mjs` | Única autoridad de ruteo. No nombra dominios |
| `registro-especialistas.mjs` | Descubrimiento por directorio + validación de contrato |
| `razonar-ruteo.mjs` | Elección por modelo dentro de lista cerrada (Haiku, 24 tokens) |
| `scripts-canales.mjs` | Instalador idempotente de canal + binding + mensaje fijado |

### Especialista Personal/RRHH (el módulo)

| Archivo | Responsabilidad |
|---|---|
| `especialistas/personal.mjs` | Contrato: `slug personal`, `agentSlug rrhh`, `area personas`. Gramática y despacho |
| `asistencia-guarda.mjs` | La puerta: de qué canal se puede cargar. Corre primero en las tres vías |
| `asistencia-inicio.mjs` | Abre la sesión y devuelve el mensaje interactivo (`@os asistencia`) |
| `asistencia-flujo.mjs` | Máquina de estados del registro **por conversación** |
| `asistencia-sesion.mjs` | Sesiones en Postgres, TTL, una abierta por persona, idempotencia |
| `asistencia-ui.mjs` | Parsing de comandos y render de las respuestas de la vía conversacional |
| `asistencia-consultas.mjs` | Consultas de sólo lectura (gramática + render) |
| `asistencia-permisos.mjs` | Modo abierto/estricto, `PERMISO_ASISTENCIA_WRITE` |
| `asistencia-auditoria.mjs` | Eventos (incluido el rechazo), payload de confirmación, sanitización de errores |
| `lib/asistencia-motivos.mjs` | Catálogo de motivos y `validarNovedad` — la última palabra |
| `lib/asistencia-novedades.mjs` | Proyección consultable del porqué (`comunicacion.asistencia_novedades`) |
| `lib/asistencia-servicio/fechas.mjs` · `mapeo.mjs` | Fechas operativas y traducción núcleo ↔ UI. Es lo único que sobrevivió de la pantalla web |

### UI dentro de Mattermost

| Archivo | Responsabilidad |
|---|---|
| `servidor-asistencia.mjs` | El servicio HTTP: socket unix, lectura del entorno, armado del secreto y de la URL de callback |
| `comando-asistencia.mjs` | Puerta del slash command (verifica su token) y publica la tarjeta **con el bot**, nunca `in_channel` |
| `asistencia-accion.mjs` | Cableado de `POST /asistencia/accion`: **secreto → guarda → ruteador**, y el gancho que proyecta las novedades |
| `secreto-compartido.mjs` | Comparación en tiempo constante y la única URL de callback con secreto |
| `asistencia-mm/acciones.mjs` | El ruteador: qué hace cada click. Se prueba entero sin red ni base |
| `asistencia-mm/mensaje.mjs` | Los attachments y los diálogos (uno por tipo de excepción) |
| `asistencia-mm/dialogos.mjs` | Lo que vuelve de un diálogo → novedad válida; motivos por tipo; error en castellano |
| `asistencia-mm/operaciones.mjs` | Traducción de la intención de la UI a las funciones del núcleo. Único camino de escritura |
| `asistencia-mm/cliente.mjs` | **La frontera**: los dos únicos pedidos que salen a Mattermost (abrir diálogo, reescribir el post) |
| `asistencia-mm/contrato-mattermost.mjs` | Valida el mensaje y el diálogo antes de mandarlos (ids alfanuméricos, topes, opciones) |

### Adaptador a JORNALES

| Archivo | Responsabilidad |
|---|---|
| `lib/tools/jornales-asistencia.mjs` | Contexto, listados, `planificarAsistencia`, `registrarAsistencia` |
| `lib/jornales-estructura.mjs` | Grilla real: bloques, filas, columnas por fecha, `ref` estructural |
| `lib/horas-extra.mjs` | Normalización de horas, estados, fórmula `=9+2` |
| `lib/espejo-jornales.mjs` | Espejo de la planilla en Postgres (lectura rápida) |

---

## 6. Integración con Mattermost

- Bot **`@os`**, un solo bot general para todo el OS. No hay un bot de asistencia.
- Transporte de **mensajes**: WebSocket **saliente**, sin endpoint HTTP entrante. Los **clicks**
  sí llegan por HTTP: `POST /asistencia/accion`, publicado en Internet por Caddy y autenticado
  con `ASISTENCIA_ACCION_SECRETO`. Mattermost no ofrece otra forma de atender un botón.
- Canal operativo: **`#asistencia`**, privado (`type P`).
  - `channel_id` `md5677yrtidztd7453rj6hxxmc` · `team_id` `51cbwfboatbudgk36cqdug8oor`.
  - **El `channel_id` no está en el código.** Vive en `comunicacion.canales_area`, atado al área
    `personas`. Hay un test que falla si aparece un literal con forma de id de Mattermost.
- La respuesta se publica **en el mismo canal, en el hilo del post original**. Un dato reservado
  sólo se desvía a DM cuando el canal no es el canal operativo de esa área.
- Instalación / reinstalación idempotente del canal: `scripts-canales.mjs`.

## 7. Integración con Work Fabric

- Lane dedicado `comunicacion` (`orq.route_task_queue` + `orq.claim_task(queue)`): el worker de
  comunicación no roba tareas de finanzas y el worker general no roba las de comunicación.
  Probado con dos workers concurrentes.
- Tipo de tarea `comunicacion.responder`. Trazabilidad por `correlation_id` de punta a punta:
  inbox → evento → tarea → outbox → `platform_ref` (post real de Mattermost).
- El especialista declara `agentSlug` contra `orq.agents` y `skillDe(intencion)` contra
  `orq.capabilities` (`personal.consultar_asistencia`, `personal.registrar_asistencia`).

## 8. Integración con Google Sheets

- Cliente `makeGoogleClient`; OAuth con `refresh_token` en `orq.google_tokens`. Refrescarlo
  necesita `GOOGLE_OAUTH_CLIENT_ID/SECRET`, que están en `worker.env` — por eso el worker lo carga.
- Escritura **atómica**: un solo `batchUpdateValues` con todas las celdas del plan. Todo o nada.
- Se preserva la fórmula existente cuando corresponde; nunca se pisa una celda con `#ERROR!`.
- **Regla 0 / candado de pestaña**: si la pestaña está tomada por `sheet_pestanas_bloqueadas`, la
  escritura se rechaza con el motivo visible. El módulo no desactiva la protección.

### La unidad protegida es la celda, no la pestaña

Toda escritura del OS sobre un Sheet pasa por el portón central de escritura
(`lib/guarda-escritura.mjs` → `guardarEscritura` → `evaluarBloqueadas`), que protege dos cosas
distintas: el **candado** explícito (`sheet_pestanas_bloqueadas`) y la **firma de pestaña**
(`lib/firma-tab.mjs` → `firmaGuardia`), que compara la firma de **toda** la pestaña (`A1:BZ`)
contra la última que selló el OS.

La firma está pensada para las pestañas que el OS **genera enteras** — las del Flujo de Caja.
Ahí, que la firma difiera significa exactamente una cosa: el dueño la editó, no la pises.

`Obreros 26` de JORNALES no es una de ésas. Es una pestaña que **las personas editan todos los
días por diseño**, y donde el OS sólo escribe celdas sueltas. Su firma **siempre** difiere, y
esa diferencia no es evidencia de conflicto: es el estado normal de la pestaña.

Por eso `registrarAsistencia` le pasa al portón la bandera explícita **`compartida: true`** —
escritura quirúrgica celda a celda sobre una pestaña que el OS no genera. Con esa bandera el
portón sigue aplicando el cinturón **"vacío sobre lleno"** y el **candado explícito** (la
voluntad del dueño manda siempre), pero **no** aplica la firma de pestaña, **no** auto-canda y
**no** sella. Para todos los demás escritores el comportamiento no cambió en absoluto.

Lo que protege la escritura de asistencia es más fuerte y más fino que la firma: antes de
escribir se **relee la celda destino** y se compara su huella con la que tenía al planificar
(concurrencia optimista, §4.1). Si cambió, se aborta **toda** la operación y se le muestran al
jefe de obra los valores actuales. Protege la celda, que es lo que importa, en vez de la
pestaña entera.

**Cómo se descubrió.** En la primera prueba real desde Mattermost (30/07/2026), con fecha, obra,
cuadrilla y excepciones ya elegidas, apretar Registrar respondía «La pestaña de JORNALES está
tomada y no se puede escribir ahora», y no se escribía ninguna celda. La secuencia, con horas
reales de San Juan: a las **14:13:15** el OS escribió una celda y **selló** la firma de
`Obreros 26`; entre las 14:13 y las 22:26 una persona editó la planilla (entre otras cosas,
`R477` pasó de `9` a vacía y `R464` quedó en `"0"`) y la firma divergió; a las **22:26:24**
`firmaGuardia` recalculó la firma, vio que difería, concluyó "la editaste", **auto-candó la
pestaña** (fila en `sheet_pestanas_bloqueadas` con `bloqueada_por: 'auto'`) y el portón descartó
la escritura. Desde ese momento el candado automático bloqueaba **todo** intento siguiente: la
asistencia quedaba muerta de forma permanente, sin que nadie hubiera candado nada a propósito.
El candado automático falso que el defecto dejó sobre `Obreros 26` se borró.

Dos lecciones, que valen para cualquier escritor futuro:

- Una protección pensada para una pestaña **de la que el OS es dueño** no se puede aplicar tal
  cual a una pestaña **compartida con personas**: ahí la unidad que se protege es la **celda**.
- Una protección que **se auto-canda** convierte un falso positivo en una **falla permanente**,
  no en una molestia pasajera.

## 9. JORNALES

- Estructura por bloques (obra) × filas (trabajador) × columnas (fecha). La resolución es
  **estructural**, no posicional: se re-lee y se re-resuelve antes de escribir, así un rango
  desplazado o una fila insertada no corren la celda.
- Homónimos en la misma obra van a filas distintas; un nombre ambiguo sin referencia se rechaza.
- La jornada completa **no es una constante**: se toma de la planilla (ver §5 de
  `OPERACION-ASISTENCIA.md`).
- Horas extra: se escriben como fórmula (`=9+2`), y el plan **declara** cuántas extras se borran.

## 10. Base de datos

| Objeto | Migración |
|---|---|
| lane `comunicacion`, `route_task_queue`, `claim_task(queue)` | `20260729180000_orq_comunicacion_lane.sql` |
| `comunicacion.permisos_skill` | `20260730130000_asistencia_mattermost.sql` |
| `comunicacion.asistencia_sesiones` (+ una-abierta, idempotencia) | idem |
| `comunicacion.vencer_sesiones_asistencia()` | idem |
| `comunicacion.v_asistencia_auditoria` | idem |
| `comunicacion.canales_area` (FK → `public.area_canonica`) | `20260730160000_comunicacion_canales_area.sql` |

Las tres son **aditivas**. Cada una tiene su rollback en `orquestador/db/rollback/`.

## 11. Despliegue

Corre como **user-units de systemd** (sin sudo), sobre un worktree de despliegue dedicado —
nunca sobre el árbol de trabajo:

```
WorkingDirectory=/home/jorge/echegaray-os/app/.claude/worktrees/deploy-comunicacion/echegaray-os
```

| Unit | Proceso | Anthropic |
|---|---|---|
| `echegaray-comunicacion-ws.service` | consumidor WebSocket | **NO** (verificado en `/proc/<pid>/environ`) |
| `echegaray-comunicacion-worker.service` | worker del lane | Sí, sólo para el ruteo del Director |
| `echegaray-asistencia-http.service` | callback de las acciones de Mattermost | **NO** |

```bash
# desplegar una versión nueva
git -C .claude/worktrees/deploy-comunicacion/echegaray-os fetch origin && \
git -C .claude/worktrees/deploy-comunicacion/echegaray-os checkout <sha>
systemctl --user daemon-reload
systemctl --user restart echegaray-comunicacion-worker echegaray-comunicacion-ws \
                        echegaray-asistencia-http
systemctl --user status echegaray-comunicacion-ws --no-pager | head -5
```

Secretos en `~/.config/echegaray-orq/*.env`, `chmod 600`, **nunca en git**.

### Variables que no pueden faltar ni diferir

| Variable | Dónde | Si falta |
|---|---|---|
| `ASISTENCIA_ACCION_SECRETO` | **`asistencia-http.env` Y `comunicacion.env`**, con el **mismo valor** | Falla cerrado: el mensaje se publica y **ningún botón responde**. Si están distintas, igual. El servicio lo avisa al arrancar (`sin ASISTENCIA_ACCION_SECRETO: las acciones interactivas se van a denegar`) |
| `ASISTENCIA_ACCION_URL` | ídem | Se cae al default `https://chat.ecsas.com.ar/asistencia/accion` |
| `MM_SLASH_TOKEN_ASISTENCIA` | `asistencia-http.env` | El slash command queda apagado y no pasa nada al escribirlo |
| `MM_FETCH_TIMEOUT_MS` | opcional, donde corra el cliente de Mattermost | Default **30 s**. Es un techo por llamada: sin él, un Mattermost que no contesta dejaba colgado el pedido del jefe para siempre |

Las dos primeras van en los dos archivos porque son **dos procesos distintos**: el worker
publica los botones de la mención `@os asistencia` y el servicio HTTP atiende el click. El
worker arma la URL con su copia del secreto; el servicio la verifica con la suya.

⚠️ `orquestador/comunicacion/deploy/env.example` —la plantilla de `comunicacion.env`— todavía
**no declara** `ASISTENCIA_ACCION_SECRETO` ni `ASISTENCIA_ACCION_URL`. Quien arme un
`comunicacion.env` desde esa plantilla se queda sin botones y sin pista de por qué.

## 12. Rollback

Por orden de reversibilidad, del más barato al más caro:

1. **Apagar el módulo sin tocar nada más** — desactivar el binding del canal:
   `update comunicacion.canales_area set activo = false where channel_id = '…';`
   El canal deja de rutear a personal; el resto del OS sigue igual.
2. **Volver a la versión anterior** — `git checkout <sha_anterior>` en el worktree de despliegue
   + `restart` de las dos units. El tag `asistencia-v1.0` marca esta versión exacta.
3. **Apagar la conversación entera** — `systemctl --user stop echegaray-comunicacion-ws`. Deja de
   entrar tráfico; nada se pierde (el inbox no recibe).
4. **Revertir el esquema** — scripts en `orquestador/db/rollback/`, en orden inverso.
   ⚠️ El rollback de asistencia **también dropea `comunicacion.permisos_skill`**, que es
   compartida. Ver §14.

Las escrituras ya hechas en JORNALES **no se revierten solas**: se corrigen desde la planilla o
volviendo a cargar el valor correcto (el módulo escribe el valor final, no un delta).

## 13. Troubleshooting

| Síntoma | Dónde mirar | Causa habitual |
|---|---|---|
| El bot no responde nada | `journalctl --user -u echegaray-comunicacion-ws -n 50` | WS caído o sin `hello` de autenticación |
| Entra pero no contesta | `select * from orq.tasks where queue='comunicacion' order by id desc` | Worker parado, o tarea en `failed` |
| `Invalid RootId parameter` en outbox | `comunicacion.outbox`, `last_error` | Se respondió en el hilo de un post que no existe |
| Responde el catálogo en vez de atender | tabla `comunicacion.canales_area` | Binding del canal inactivo o ausente |
| Un botón dice «Sorry, we could not find the page» y **no hay nada en los logs del OS** | El `id` de esa acción, y los logs de Mattermost | El `id` no es alfanumérico: el router de Mattermost descarta la petición antes de que llegue al OS. Ver §3bis |
| El diálogo rechaza en inglés: «Submission failed with validation errors» | La respuesta del `dialog_submission` | Volvió sólo con `errors` por campo y sin `error` de primer nivel: Mattermost usa su texto por defecto. Toda respuesta de error del diálogo debe llevar también la frase en castellano. Ver §3bis |
| El diálogo ofrece un motivo que no corresponde al tipo de excepción | El botón que lo abrió y los motivos que se le pasan | Un diálogo tiene que traer **sólo** los motivos de su ámbito (`No vino` → ausencia, `Hizo menos horas` → parcial, `Hizo horas extra` → ninguno). Ver §3bis |
| `⚠️ La pestaña … está tomada` | `sheet_pestanas_bloqueadas` | Candado **explícito** de la Regla 0. **No desactivarlo**: es la voluntad del dueño |
| Lo mismo, pero la fila dice `bloqueada_por='auto'` | idem, y §8 | Candado **automático** de la firma de pestaña. Sobre una pestaña compartida como `Obreros 26` es un falso positivo: la escritura de asistencia va con `compartida: true` y no debería llegar ahí. Si aparece, hay un escritor que no pasa la bandera |
| Escribe pero no aparece | `comunicacion.v_asistencia_auditoria` | Mirar `celdas_modificadas` (`old_value`/`new_value`) y la celda exacta. Si el evento es de una carga hecha por botones **anterior al 30/07/2026**, ese campo está en `null` y no hay nada que mirar: el camino de botones no lo llenaba |
| El mensaje se publica pero **ningún botón hace nada** (ni error visible) | `journalctl --user -u echegaray-asistencia-http`, y los dos `.env` | Falta `ASISTENCIA_ACCION_SECRETO`, o el del worker y el del servicio no coinciden. Falla cerrado a propósito. Ver §11 |
| Guardó la excepción en el diálogo pero **el mensaje sigue mostrando lo viejo** | Log del servicio: `no se pudo actualizar el post` | La reescritura del post falló (Mattermost caído, post borrado, token sin permiso). La carga **no se pierde** por eso; el refresco no tumba la acción |
| El diálogo no abre y no hay error del lado del jefe | Log del servicio: `diálogo inválido, no se manda` | `contrato-mattermost.mjs` lo atajó (un desplegable sin opciones, un `default` fuera de la lista). Mattermost no da error útil: no abre y listo |
| "Ya hay una carga abierta" | `comunicacion.asistencia_sesiones` | Sesión previa sin cerrar; expira sola por TTL o `cancelar` |
| "No me deja cargar" y no se sabe por qué | `comunicacion.v_asistencia_auditoria` con `status='denied'` | El `error_code` dice el motivo exacto: `sin_permiso`, `canal_no_es_el_oficial`, `token_invalido`, `secreto_invalido`, `secreto_sin_configurar`, `sesion_vencida`… |
| Los botones de un mensaje viejo cambian la carga **del mensaje nuevo** | `comunicacion.asistencia_sesiones` | No hay vínculo post↔sesión: la sesión se resuelve por `user_id`. Ver límite #14 |
| Ruteo raro en DM | — | Sin binding de canal, decide el modelo; si no hay crédito, catálogo |

Diagnóstico sin tocar producción: `node orquestador/scripts/asistencia-dry-run.mjs` (no escribe).

## 14. Límites conocidos

Los 1–13 son **deliberados** y están medidos; los tres primeros bloquean **al segundo
especialista operativo**. Los 14–17 **no son elecciones**: son agujeros reales que la auditoría
del 30/07/2026 encontró y **no** corrigió. Ninguno bloquea la operación de hoy, pero los 14 y
16 pueden hacer que el jefe de obra vea una cosa y la planilla diga otra.

1. **Sesiones con nombre de asistencia.** `comunicacion.asistencia_sesiones` es del módulo, no
   genérica. El índice "una sesión abierta por persona" es **global**: dos especialistas con
   formulario simultáneo chocarían. Falta `comunicacion.sesiones` con `agent_slug`.
2. **Permisos con nombre de asistencia.** `ORQ_ASISTENCIA_PERMISOS` y `PERMISO_ASISTENCIA_WRITE`
   deberían ser permisos por *capability* (`ORQ_COMM_PERMISOS_MODO`).
3. **Respuesta síncrona.** El handler responde dentro de la tarea. Un especialista lento
   necesitaría respuesta diferida encadenando `orq.tasks`.
4. **Rollback acoplado**: el down-script de asistencia dropea `permisos_skill`, compartida.
5. **Auditoría con vista propia** (`v_asistencia_auditoria`) en vez de una genérica por skill.
6. **Las tools no están expuestas a la web ni a Claude Code**: hoy sólo las consume el flujo
   conversacional. Falta el `asistenciaTools(google)` compartido.
7. **En `#asistencia`, un mensaje que nadie reclama va a personal** (por área del canal). Es
   correcto ahí, pero significa que `hola` abre el formulario.
8. **Miembros del canal pendientes de definición humana**: hoy están `@os` y `jorge`. No se
   agregaron jefes de obra porque no hay fuente confiable de identidades
   (`comunicacion.identidades` vacía). Inventarlos habría sido peor.
9. **`asistencia-consultas.mjs` tiene 553 líneas**, por encima del límite de 500 del CLAUDE.md.
   Partirlo es un refactor con riesgo de comportamiento; queda registrado, no forzado.
10. **`/asistencia` todavía no existe en Mattermost.** El bot no puede crearlo (rol
    `system_user`). La puerta es `@os asistencia`, que hace exactamente lo mismo. Crear el
    comando es un clic de un administrador y sólo agrega el autocompletado.
11. **Motivo, aclaración y obra realizada viven en Postgres, no en la planilla**
    (`comunicacion.asistencia_novedades`). La celda de JORNALES sigue recibiendo sólo horas:
    escribir texto ahí rompería las sumas de la quincena. Quien mire la planilla ve las horas,
    no el porqué. Reflejarlos en el Sheet exige antes averiguar cómo lo codifica hoy la leyenda
    (FALTA / TARDANZA / ENFERMEDAD), y eso no se adivina.
    La proyección **se corrige hacia abajo**: una carga posterior borra las novedades de los
    trabajadores **de esa carga** que ya no tienen motivo. Antes una marca de ART quedaba para
    siempre aunque la carga se corrigiera. El alcance es sólo las personas que vinieron en esa
    carga: cargar 3 de una cuadrilla de 12 no dice nada sobre las otras 9.
12. **La confirmación viaja por el `context` del cliente.** Es una salvaguarda de UX, no una
    frontera de seguridad: la misma persona puede apretar el botón igual. Y es **una sola**:
    ese `confirmar` concede a la vez **sobrescribir** una carga existente y **reemplazar una
    fórmula** que no se pudo interpretar — dos permisos distintos que el jefe no puede dar por
    separado. Lo que sí es frontera es el secreto de la integración, la guarda de canal y los
    permisos, que corren en el servidor.
13. **Feriados 2026 cargados: 16 + 6 días no laborables.** Güemes (17/06) y Soberanía Nacional (20/11) quedaron fuera
    a propósito: son trasladables y las fuentes discrepan por el Decreto 614/2025. Hay un test
    que falla si alguien los siembra sin verificarlos. Faltan los provinciales de San Juan.
14. **No hay vínculo post↔sesión.** La sesión se resuelve **sólo por `user_id`**: el `post_id`
    se guarda, pero para saber a qué post volver, no para decidir sobre qué sesión opera el
    click. Con dos mensajes de asistencia abiertos de la misma persona, **los botones del viejo
    operan sobre la sesión nueva** — y el mensaje viejo puede llegar a mostrar una obra que ya
    no es la de la carga en curso. El índice "una sesión abierta por persona" reduce el daño,
    no lo elimina: el mensaje viejo sigue en el canal con sus botones vivos.
15. **Un día sin jornada calibrada obliga a cargar a mano.** Un sábado, o cualquier día que la
    planilla no defina, no da contra qué armar el desplegable de horas: cada persona que no
    hizo la jornada normal hay que marcarla una por una y escribirle las horas a mano
    (inventar una jornada para poder ofrecer opciones sería fabricar el dato). Además el
    formulario de «Hizo menos horas» **exige motivo siempre**, aunque sin jornada conocida el
    catálogo no lo exigiría: es un campo obligatorio del diálogo, no una regla del catálogo.
    Un feriado (jornada 0 h) cae en lo mismo: el campo de horas se vuelve texto libre — antes
    de eso el desplegable quedaba vacío y **el formulario no abría**.
16. **Si la verificación posterior a la escritura falla, las celdas ya se escribieron.**
    `registrarAsistencia` escribe en batch y después relee para verificar. Si esa relectura no
    coincide, devuelve `verificacion_fallida` y el evento se audita como `failed` — pero **la
    planilla ya tiene los valores**. El jefe lee que no se pudo y la celda está cargada. Ante
    ese código hay que mirar la planilla antes de volver a cargar.
17. **El resultado de la auditoría no se mira.** Todos los `auditar(...)` son fire-and-forget
    (`.catch(() => {})` o sin await del resultado), por diseño: la auditoría no puede voltear
    una carga ni un rechazo. La contracara es que si el ledger dejara de escribir, la carga
    seguiría funcionando y **nadie se enteraría** hasta que alguien buscara un evento y no
    estuviera. No hay alarma sobre eso.

## 15. Mantenimiento

**Rutina**

- Semanal: revisar `comunicacion.outbox` en estado `dead` y el DLQ del lane.
- Semanal: `select * from comunicacion.v_asistencia_auditoria order by ts desc limit 50` — que
  cada escritura tenga `old_value`/`new_value` y celda. Este control **estuvo ciego** para todo
  lo cargado por la UI de botones hasta el 30/07/2026: ese camino armaba el evento a mano y
  dejaba `celdas_modificadas` en `null` (ver §3bis). Los eventos anteriores a esa fecha no se
  pueden reconstruir; de acá en adelante, un `written` sin celdas es un defecto, no un vacío
  esperable.
- Semanal: la misma vista con `status='denied'` — un rechazo repetido de la misma persona es
  un permiso que falta, y un rechazo por canal que se repite es alguien cargando donde no va.
  Se mira para actuar, no para archivar.
- Mensual: verificar que las sesiones expiradas se estén venciendo
  (`comunicacion.vencer_sesiones_asistencia()`).

**Cuando cambia la planilla**

Si JORNALES cambia de estructura (columnas, bloques, encabezados), lo primero que se rompe es
`jornales-estructura.mjs`. Correr `orquestador/scripts/asistencia-dry-run.mjs`: si la celda
propuesta no es la esperada, la estructura cambió — **no ajustar a mano el offset**, corregir el
resolvedor estructural y su test.

**Cuando se agrega un especialista nuevo**

No se toca este módulo ni el Director. Se agrega `especialistas/<nuevo>.mjs` cumpliendo el
contrato, se le crea su canal con `scripts-canales.mjs`, y se resuelven antes los límites 1–3.

**Tests**

```bash
node --test orquestador/comunicacion/*.test.mjs orquestador/comunicacion/asistencia-mm/*.test.mjs \
     orquestador/lib/asistencia-*.test.mjs orquestador/lib/asistencia-servicio/*.test.mjs \
     orquestador/lib/jornales*.test.mjs orquestador/lib/tools/jornales-asistencia.test.mjs
node orquestador/comunicacion/test-pr4.mjs   # integración, Postgres efímero en Docker
```

Sin `orquestador/comunicacion/asistencia-mm/*.test.mjs` el comando **no prueba la UI de
Mattermost**, que es por donde carga el jefe de obra.
