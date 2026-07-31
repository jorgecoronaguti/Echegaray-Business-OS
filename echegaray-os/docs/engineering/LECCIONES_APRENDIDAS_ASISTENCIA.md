# Lecciones Aprendidas — Módulo Asistencia

> **Documento vivo.** Es lectura obligatoria antes de construir cualquier módulo del Business OS.
> No es un changelog ni documentación funcional: eso vive en `orquestador/comunicacion/docs/`.
> Acá vive **por qué fallamos y qué regla nace de cada falla**.
>
> Última actualización: 31/07/2026 · Módulo de origen: Asistencia (carga de jornales en Mattermost)

---

## Resumen ejecutivo

El módulo Asistencia se construyó, se probó, se documentó, pasó un DOD firmado con ✔ en cada fila… y una auditoría independiente posterior encontró **un agujero de seguridad crítico y explotable, y un bug que rompía la función principal mientras el dueño la estaba usando**.

Esa frase es la razón de este documento.

No falló por falta de esfuerzo ni de tests: el módulo tenía 569 tests propios. Falló por **patrones de ingeniería que se repiten**, y que van a volver a aparecer en Compras, en RRHH, en Finanzas y en Obras si no quedan escritos:

1. **La verificación se hizo contra la misma información que el sistema generaba.** El control decía «se puede reconstruir quién escribió qué celda ✔» — y estuvo ciego justo para la interfaz que la gente usa. Es el mismo defecto que en el Flujo de Fondos hizo perder $292,8M invisibles: *un control que se compara contra sí mismo no es un control*.
2. **Los dobles de prueba eran más permisivos que la realidad.** El cliente real exigía `id`; el doble aceptaba cualquier cosa. Los tests pasaban en verde mientras producción tiraba `400` en cada uso.
3. **Una protección puede convertir un falso positivo en una falla permanente.** Pasó tres veces distintas, con tres mecanismos distintos.
4. **La seguridad de un borde no se ve leyendo el borde.** Se ve cruzando la configuración del proxy con el manejador. Nadie que lea sólo el código de la aplicación va a encontrar que la ruta está publicada en Internet.

Las secciones siguientes documentan **19 incidentes reales, con su evidencia**, y los convierten en reglas y en un checklist reutilizable.

---

## Línea de tiempo

Sin commits: síntoma → causa raíz → solución.

| # | Síntoma observado | Causa raíz | Solución |
|---|---|---|---|
| 1 | Se construyó una pantalla web de carga que nadie iba a abrir | Se diseñó la interfaz antes de mirar dónde trabaja la gente: el jefe de obra ya vive en Mattermost | Se descartó la pantalla; el módulo pasó a vivir dentro del chat |
| 2 | «No pude abrir la carga» al primer click | El servidor HTTP le pasaba el `Pool` pelado de `pg`, que sabe `query` pero no `withTx`; la sesión abre y confirma dentro de una transacción | Se arma el port `{query, withTx}` y el repositorio **exige las dos capacidades al construirse**, no al usarse |
| 3 | «Sorry, we could not find the page» al tocar cualquier botón de fecha | El `action_id` viaja como segmento de la URL de la API de Mattermost; con guión bajo la ruta no matchea y el 404 lo tira el **router**, antes de llegar a nosotros | Ids alfanuméricos + un validador de contrato que falla si aparece otro carácter |
| 4 | «La pestaña de JORNALES está tomada y no se puede escribir ahora» | La firma de pestaña —pensada para detectar que alguien reescribió una pestaña **nuestra**— se aplicó a una pestaña que mantienen personas, y al no coincidir la auto-candó de forma permanente | Marca `compartida: true`: la firma y el auto-candado no aplican. El candado explícito del dueño sigue aplicando |
| 5 | «Esta carga ya se registró. No se escribió dos veces» — sin haber registrado nada | La clave de idempotencia es función pura de (planilla, pestaña, fecha, obra, actor, payload) y se buscaba entre **todas** las sesiones confirmadas: dos cargas legítimamente idénticas colisionaban para siempre | Se acotó la búsqueda a la misma sesión y se quitó el índice único que además la reforzaba en la base |
| 6 | El formulario aceptaba «Trabajó: Sí · Horas: 5 · Motivo: Faltó con aviso» y lo rechazaba al guardar | Al diálogo se le pasaba el catálogo entero de motivos, sin filtrar por contexto | El tipo de excepción se elige **antes** de abrir el formulario: la combinación imposible no tiene dónde seleccionarse |
| 7 | «Submission failed with validation errors», en inglés | El cliente de Mattermost pone ese encabezado de su cosecha cuando la respuesta trae sólo `errors` por campo | Toda respuesta de error lleva además un `error` de primer nivel, en castellano |
| 8 | Un `curl` anónimo desde Internet pasaba el control de canal **y** el de permisos | La ruta de acciones la publica el proxy y no autenticaba nada: la identidad salía del payload | Secreto de integración en la query de la URL de callback, que Mattermost guarda y no le muestra al cliente |
| 9 | Se guardaba la excepción, el sistema decía OK y la lista seguía vieja | El ruteador mandaba `postId` y el cliente espera `id`: salía `PUT /posts/undefined → 400`, el error iba al log y la respuesta igual era 200 | Se corrigió el nombre y **el doble de prueba pasó a exigir `id`**, como el cliente real |
| 10 | Se podía cargar asistencia por mensaje privado al bot | La guarda de canal corría en dos de las tres vías que llegan a JORNALES | La guarda corre en las tres |
| 11 | La auditoría de una carga real no decía qué celda se tocó | El camino de botones armaba el evento a mano con cuatro campos, teniendo al lado el constructor completo | Usa `payloadConfirmacion`, el mismo que el otro camino |
| 12 | Un feriado (jornada 0 h) no dejaba abrir el formulario | Un desplegable con lista vacía; y un valor precargado que no estaba entre las opciones | Se cae a campo a mano; el `default` sólo se pone si pertenece a las opciones |
| 13 | Con la base caída el servicio se reiniciaba en bucle | El repositorio de sesiones se construía con un port nulo y tiraba en el arranque | El servicio sigue de pie y deniega; la guarda ya denegaba sola |
| 14 | Los botones de un mensaje viejo manejaban el formulario nuevo | La sesión se resuelve sólo por `user_id`; el post no se comparaba nunca | La sesión se ata al primer post que la toca; un click de otro mensaje rebota |
| 15 | Una marca de «Accidente de trabajo» quedaba para siempre | La proyección de novedades sólo hacía upsert de las que **tenían** motivo | Una carga posterior borra las de los trabajadores de esa carga que ya no tienen motivo |
| 16 | Un sábado obligaba a elegir un motivo falso | El formulario exigía motivo aunque el catálogo —la autoridad— no lo exige sin jornada conocida | El formulario coincide con el catálogo en vez de discutirle |
| 17 | Una llamada a Mattermost podía colgar el pedido para siempre | El cliente hacía `fetch` sin `AbortController` | Timeout explícito, con el patrón que ya existía en el cliente de Google |
| 18 | Si el ledger de auditoría dejaba de escribir, nadie se enteraba | El resultado del auditor se descartaba en todos los llamadores | Se avisa por log; el veredicto no cambia |
| 19 | 981 líneas de una pantalla borrada seguían en el árbol | Se eliminó la pantalla pero no lo que colgaba de ella | Se eliminaron, incluido un camino de escritura dormido |

---

## Incidentes

### 1 · Autenticación insuficiente del endpoint

**Problema.** `POST /asistencia/accion` —la ruta que ejecuta cada botón y termina escribiendo en la planilla de jornales— no verificaba **nada**. La identidad, el canal y el equipo salían del cuerpo del pedido, que lo escribe quien llama. El proxy publica el prefijo `/asistencia*` en Internet sin allowlist ni autenticación.

**Impacto.** Un pedido anónimo desde cualquier parte, con el `user_id` de una persona habilitada y el `channel_id` del canal de asistencia, pasaba el control de canal **y** el de permisos. Lo único que lo frenaba era que hubiera un formulario abierto: durante los 20 minutos en que alguien está cargando, un tercero podía elegir obra, marcar gente y escribir jornales **a nombre de esa persona**. Además, la auditoría registraba `identidad_verificada: true` para una identidad que nadie había verificado: el ledger afirmaba una comprobación que no ocurrió.

**Causa raíz.** No es que faltara una validación: es que **el modelo de amenazas se razonó sobre el código de la aplicación y no sobre el despliegue**. El módulo tenía una guarda de canal excelente, permisos, auditoría y fail-closed en todos lados — todo eso protege *a quién deja pasar*, y ninguno protege *que el que golpea la puerta sea quien dice*. La pregunta «¿qué prueba que esto viene de Mattermost?» no se había hecho para esta puerta, aunque sí para el slash command, que sí verifica su token en tiempo constante.

Contribuyó un detalle histórico: cuando se escribió la capa de sesiones, alguien previó exactamente esto y dejó escrita la primitiva criptográfica y este comentario:

> *«QUÉ LA ACTIVARÍA: botones o diálogos interactivos de Mattermost. […] recién ahí la firma pasa a proteger algo real.»*

Los botones se activaron. La firma no. **El propio código había predicho el agujero y nadie releyó esa nota al activar la condición que la disparaba.**

**Cómo se detectó.** Auditoría independiente, atacando el sistema vivo. No lo encontró un test ni una revisión de código: lo encontró un `curl` contra producción. La cadena de razonamiento fue: leer el manejador → ver que la identidad sale del payload → ir a buscar el archivo del proxy → descubrir que la ruta es pública → probarla.

**Corrección.** Un secreto compartido viaja en la query de la URL de callback (`?t=…`). Se verifica en tiempo constante, antes de la guarda de canal, y **falla cerrado en los dos sentidos**: sin secreto configurado tampoco se atiende. Se comprobó contra el servidor real que Mattermost **guarda** esa URL y **no** le manda el bloque `integration` al cliente —un GET del post con token de API devuelve las acciones sin él—, así que sólo el servidor de Mattermost puede presentarlo. Un solo lugar arma la URL, para que no pueda quedar el servidor exigiendo un secreto que los botones no llevan.

**Regla permanente.**
> **Todo borde entrante se audita contra su despliegue, no contra su código.** Antes de razonar permisos, responder: *¿qué prueba que este pedido viene de quien dice?* Si la respuesta está en el cuerpo del pedido, no hay respuesta. Y cuando un comentario del código declare una condición futura que activaría una defensa, esa condición es un ítem de checklist: al cumplirse, se relee.

---

### 2 · El post no se refrescaba (contrato roto con el cliente)

**Problema.** Después de enviar un formulario de excepción, el mensaje de la cuadrilla no se actualizaba. El jefe de obra guardaba «no vino», el sistema respondía OK, y la lista seguía mostrando el estado anterior.

**Impacto.** El operador pierde la única realimentación que tiene. No sabe si lo que cargó entró. La reacción natural —volver a cargarlo— es exactamente lo que un sistema con dinero de por medio no quiere provocar.

**Causa raíz.** El ruteador llamaba `actualizarPost({ postId, message, props })` y el cliente declara `actualizarPost({ id, message, props })`. En producción salía `PUT /api/v4/posts/undefined → 400`. **El error se capturaba, se logueaba y la respuesta HTTP igual era 200**: un fallo silencioso perfecto.

**Cómo se detectó.** La auditoría técnica lo encontró leyendo las dos firmas, y el log de producción lo confirmó — incluido un `400` a las 23:17 de esa misma noche, mientras el dueño probaba el módulo y lo daba por bueno.

**Corrección.** Se corrigió el nombre del parámetro. Y lo más importante: **el doble de prueba pasó a exigir `id`**. Antes hacía `async actualizarPost(p) { posts.push(p); return {ok:true} }` — aceptaba cualquier forma.

**Regla permanente.**
> **Un doble de prueba nunca puede ser más permisivo que el original.** Si el real desestructura un campo, el doble tiene que fallar cuando ese campo no está. Un doble laxo no prueba la frontera: la tapa. Corolario: **un fallo de una llamada externa no puede terminar en una respuesta de éxito**; o se propaga, o se le dice al usuario que no se pudo.

---

### 3 · Locks de Sheets: la protección que se volvió la falla

**Problema.** Al apretar Registrar: *«La pestaña de JORNALES está tomada y no se puede escribir ahora»*. Ninguna celda se escribía. El módulo quedó inutilizable.

**Impacto.** Función principal caída. Y peor: el mensaje sugería un problema transitorio («ahora»), cuando en realidad el estado era permanente y se agravaba solo.

**Causa raíz.** El OS tiene una firma de pestaña que detecta si alguien reescribió una pestaña **que el OS mantiene**, y ante la discrepancia la candó automáticamente. JORNALES **no** es una pestaña del OS: la mantienen personas, cambia todo el tiempo, y su firma nunca iba a coincidir. La guarda hizo exactamente lo que debía; se la había apuntado al objeto equivocado. Y el auto-candado convirtió un falso positivo en una falla que ya no se resolvía sola.

**Cómo se detectó.** El usuario, en producción, con la función principal caída.

**Corrección.** Una marca `compartida: true` en la escritura: para una pestaña de propiedad humana no se evalúa la firma ni se auto-canda. **El candado explícito del dueño sigue aplicando** — se apagó el mecanismo automático, no el control.

**Regla permanente.**
> **Toda protección automática necesita una respuesta escrita a: ¿qué pasa si se dispara por error?** Si la respuesta es «el sistema queda inutilizable hasta que alguien lo destrabe a mano», la protección está mal diseñada. Y antes de aplicar una guarda de integridad a un recurso, declarar **de quién es ese recurso**: lo que mantiene una persona no se protege igual que lo que mantiene el OS.

---

### 4 · Idempotencia demasiado global

**Problema.** *«Esta carga ya se registró. No se escribió dos veces»* — cuando no se había registrado nada.

**Impacto.** El operador se va convencido de que la asistencia quedó cargada. Es la peor clase de bug: **el sistema miente con confianza sobre un dato económico**.

**Causa raíz.** La clave de idempotencia es una función pura de (planilla, pestaña, fecha, obra, actor, desglose de horas) y se buscaba **entre todas las sesiones confirmadas de la historia**. Dos cargas legítimamente idénticas —la misma cuadrilla, las mismas horas, el mismo día— producen la misma clave. La primera quemaba la clave para siempre. Un índice único parcial en la base reforzaba la misma regla, así que el bug tenía dos capas.

**Cómo se detectó.** El usuario, en producción, intentando cargar.

**Corrección.** El alcance de la clave se acotó a la **misma sesión** —«duplicado» significa el segundo click sobre *este* formulario— y una migración quitó la unicidad del índice. Quien decide si hay que escribir no es la memoria de una clave: es la planilla releída, celda por celda. Se agregó además el estado `fallida`, para que una escritura que no entró no queme la clave.

**Regla permanente.**
> **La idempotencia protege un reintento, no la historia.** Su alcance es la unidad de trabajo (la sesión, el pedido), nunca «todo lo que pasó alguna vez». Antes de definir una clave de idempotencia, escribir el caso legítimo que produce la misma clave dos veces — si existe, el alcance está mal. Y la fuente de verdad sobre si algo hay que escribir es **el destino releído**, no un registro nuestro.

---

### 5 · Sesiones compartidas entre dos mensajes

**Problema.** Con dos mensajes de asistencia abiertos en el canal, los botones del mensaje viejo operaban sobre la sesión nueva, y encima le reapuntaban el post — con lo cual los refrescos posteriores aterrizaban en el mensaje equivocado.

**Impacto.** Dos formularios visibles, una sola realidad detrás, y el que se actualiza es el que se tocó último. El operador puede estar mirando una lista que no corresponde a lo que va a escribir.

**Causa raíz.** La sesión se resuelve **sólo por `user_id`**. Abrir una carga nueva cancela la anterior, pero el mensaje anterior se queda en el canal con sus botones vivos, y nunca se comparaba de qué post venía el click. El estado del servidor estaba bien protegido; lo que faltaba era atar ese estado a **la superficie visible** que lo representa.

**Cómo se detectó.** Auditoría funcional, reproduciéndolo en frío con los dobles del módulo.

**Corrección.** La sesión se ata al primer post que la toca. Un click de otro mensaje rebota con un texto que dice cuál es el bueno, y queda auditado.

**Regla permanente.**
> **Si una interfaz puede quedar duplicada en pantalla, el estado del servidor tiene que estar atado a una de esas copias.** Toda superficie que puede existir dos veces (un mensaje, una pestaña del navegador, un enlace) necesita identidad propia y la verificación de que es la vigente.

---

### 6 · Formularios estáticos de Mattermost

**Problema.** El pedido era: «cuando cambie Trabajó u Horas, actualizar los motivos disponibles y limpiar el que dejó de ser válido, sin esperar a Guardar». **Eso es imposible en un diálogo de Mattermost**: son estáticos, no hay evento de cambio ni forma de re-renderizarlos.

**Impacto.** Un requerimiento razonable que la plataforma no soporta. El riesgo real es aceptar el pedido, construir algo que lo simule a medias y entregar una experiencia peor que la honesta.

**Causa raíz.** Se había diseñado el formulario asumiendo interactividad que la plataforma no tiene.

**Cómo se detectó.** Leyendo el bundle del cliente de Mattermost y su documentación, al buscar cómo implementar el cambio.

**Corrección.** Se movió la decisión **antes** del formulario: en vez de un desplegable «Marcar excepción» que abre un formulario genérico, hay tres —«No vino», «Hizo menos horas», «Hizo horas extra»— y cada uno abre un formulario distinto, con sólo los motivos de su ámbito. La combinación inválida deja de existir porque no hay dónde elegirla.

**Regla permanente.**
> **Antes de diseñar una interacción, verificar qué permite la plataforma — leyendo su código o su contrato, no suponiendo.** Y cuando una plataforma no permite corregir al vuelo, la respuesta correcta no es simular la corrección: es **rediseñar para que el estado inválido no sea representable**. Prevenir por estructura le gana a validar por reglas.

---

### 7 · Validaciones que llegan tarde

**Problema.** El formulario dejaba elegir «Trabajó: Sí · Horas: 5 · Motivo: Faltó con aviso» y recién lo rechazaba al guardar.

**Impacto.** El operador descubre el error después de completar todo. En un celular, parado en la obra, eso es abandono.

**Causa raíz.** Al diálogo se le pasaba `motivos: CATALOGO` — el catálogo entero, sin filtrar por contexto. La validación de fondo era correcta; lo que faltaba era que la interfaz **conociera la misma regla** que el validador.

**Cómo se detectó.** El usuario, usándolo.

**Corrección.** La interfaz le pregunta al catálogo qué motivos corresponden a este contexto, en vez de tener una lista propia. Las horas dejaron de ser texto libre y pasaron a ser un desplegable de valores válidos: en «hizo menos», de 0,5 hasta media hora antes de la jornada; en «hizo extra», de media hora después en adelante. Así tampoco existe el 26 de un dedazo.

**Regla permanente.**
> **La interfaz no reimplementa las reglas: se las pide a la autoridad.** Una lista de opciones escrita a mano en la pantalla es una segunda fuente de verdad que va a divergir. Y **el backend nunca se relaja porque la interfaz mejoró**: la validación de fondo queda igual, la interfaz sólo deja de ofrecer lo que igual iba a ser rechazado.

*(Corolario, incidente 16: cuando la interfaz y la autoridad no coinciden, **manda la autoridad**. El formulario exigía motivo un sábado; el catálogo no lo exige sin jornada conocida. El resultado era que el jefe elegía un motivo falso, y eso quedaba guardado como falta injustificada o ART en la única tabla que responde POR QUÉ. Ensuciar el dato es peor que no exigirlo.)*

---

### 8 · Textos técnicos en inglés

**Problema.** Al rechazar un formulario, Mattermost mostraba *«Submission failed with validation errors»*.

**Impacto.** El operador no lee inglés y el mensaje no dice qué corregir. Rompe la regla de que todo mensaje del OS está en castellano rioplatense, sin jerga.

**Causa raíz.** No era nuestro texto. El cliente de Mattermost, cuando la respuesta trae **sólo** `errors` por campo, pone ese encabezado de su cosecha; si viene un `error` de primer nivel, muestra ese. Se confirmó extrayendo el bundle del cliente y leyendo la función que lo decide.

**Cómo se detectó.** El usuario lo reportó como texto técnico inaceptable.

**Corrección.** Toda respuesta de error de un diálogo lleva siempre un `error` de primer nivel en castellano, además de los errores por campo.

**Regla permanente.**
> **Un texto que el usuario ve y que nosotros no escribimos es un defecto.** Cuando aparezca uno, hay que encontrar quién lo genera —hasta leer el código del cliente si hace falta— y tomar el control, no taparlo.

---

### 9 · El `action_id` como segmento de URL

**Problema.** Los botones de fecha mostraban *«Sorry, we could not find the page»*. El pedido no llegaba nunca a nuestro servidor.

**Impacto.** Función principal inutilizable, y un síntoma que apunta al lugar equivocado: parece un problema de ruteo del proxy o de nuestro servidor.

**Causa raíz.** El `action_id` viaja como segmento de la URL de la API de Mattermost (`/api/v4/posts/{post}/actions/{action_id}`) y ese segmento sólo acepta alfanuméricos. Con `fecha_hoy` la ruta no matcheaba: el 404 lo tiraba el **router de Mattermost**, no el manejador. La pista decisiva fue distinguir los dos 404 de Mattermost — el de router y el de manejador tienen códigos distintos.

**Cómo se detectó.** Ausencia total del pedido en nuestros logs. **Que un pedido no aparezca en nuestros registros es un dato, no una falta de datos**: significa que falló antes de llegar, y manda a leer los logs del otro lado.

**Corrección.** Ids alfanuméricos, y un validador de contrato que falla si aparece cualquier otro carácter.

**Regla permanente.**
> **Cuando un pedido no aparece en nuestros logs, el problema está antes de nosotros: hay que ir a leer los logs del otro lado.** Y todo identificador que viaje dentro de una URL tiene que declarar su alfabeto en un test, no confiarse.

---

### 10 · La guarda que no corría en todas las puertas

**Problema.** Tres vías distintas llegan a escribir en JORNALES (el comando, los botones y el flujo conversacional). La guarda de canal corría en dos.

**Impacto.** Se podía cargar la asistencia por mensaje privado al bot — exactamente lo que la guarda existe para impedir: *«por privado no hay testigo, y en un canal cualquiera el dato de las personas queda donde no corresponde»*.

**Causa raíz.** Una defensa que se implementa **en los llamadores** en vez de en el recurso protegido. Cada puerta nueva tiene que acordarse de invocarla, y una se olvidó.

**Cómo se detectó.** Auditoría de seguridad, buscando todos los llamadores de la guarda y cruzándolos con todos los caminos que llegan a la escritura.

**Corrección.** La guarda corre en las tres.

**Regla permanente.**
> **Cuando existan varias puertas a la misma escritura, enumerarlas explícitamente y verificar una por una que todas pasen por el mismo control.** El test correcto no es «la guarda funciona», es **«no existe ningún camino a la escritura que la esquive»**.

---

### 11 · Auditoría insuficiente

**Problema.** El evento `written` del camino de botones —el que usa la gente— guardaba cuatro campos armados a mano. Quedaban en `null`: `celdas_modificadas` (qué celda, de qué valor a cuál, con el desglose normal/extra), `mattermost_username`, `spreadsheet_id` y todos los totales de horas. El constructor que lo hace bien existía y estaba al lado; lo usaba el otro camino.

**Impacto.** Es el incidente más grave del documento después del de seguridad, y el más difícil de ver. La documentación afirmaba como control vigente *«se puede reconstruir quién escribió qué celda, cuándo, y qué había antes ✔»*, y la rutina semanal decía *«verificar que cada escritura tenga old_value/new_value y celda»*. **Ese control estuvo ciego justo para la interfaz real**, y el ✔ se había tomado midiendo el otro camino.

**Causa raíz.** Se duplicó la construcción del evento en vez de reutilizar la existente. La duplicación no divergió con el tiempo: **nació divergente**.

**Cómo se detectó.** Consultando la tabla de auditoría real en producción y comparando filas: las cargas del camino viejo tenían `celdas_modificadas`; las del camino nuevo, `null`. Lo encontraron las dos auditorías por separado, una leyendo el código y otra mirando los datos.

**Corrección.** Se usa `payloadConfirmacion` en los dos caminos. Se agregó un test que **falla con el evento armado a mano** y pasa con el constructor. Además, los rechazos del ruteador ahora llevan `request_id`, y un fallo del propio ledger deja rastro en el log en vez de pasar inadvertido.

**Regla permanente.**
> **Un control se verifica sobre el camino que la gente usa, no sobre el que es más fácil de probar.** Si un módulo tiene dos caminos al mismo efecto, el control se mide en los dos o no está medido. Y **el registro de una operación crítica se construye en un solo lugar**: si hay dos constructores del mismo evento, uno va a quedar pobre.

---

### 12 · Timeout con Mattermost

**Problema.** El cliente hacía `fetch` sin `AbortController`, sin `signal` y sin timeout. Esas llamadas ocurren **dentro** del manejador HTTP: si Mattermost no responde, el pedido del jefe de obra queda colgado indefinidamente.

**Impacto.** Un servicio externo lento se convierte en un servicio nuestro caído, y en conexiones que nunca se liberan.

**Causa raíz.** El patrón correcto **ya existía en la casa**: el cliente de Google usa `AbortController` con su variable de entorno y devuelve un error legible. No se aplicó al cliente de Mattermost.

**Cómo se detectó.** Auditoría técnica, revisando todas las llamadas salientes desde un manejador de pedidos.

**Corrección.** Timeout explícito y configurable, con el mismo estilo que el cliente de Google. La lectura del cuerpo quedó **dentro** del mismo techo —un servidor que manda headers y después nada cuelga igual— y el timer se limpia en los tres caminos: éxito, error HTTP y excepción.

**Regla permanente.**
> **Toda llamada saliente lleva timeout explícito, y el timeout cubre también la lectura del cuerpo.** Ningún pedido de un usuario puede quedar esperando indefinidamente por un tercero. Antes de escribir un cliente nuevo, buscar el que ya existe en la casa y copiarle el patrón.

---

### 13 · Código muerto de la UI web

**Problema.** Se construyó una pantalla web de carga y después se descartó, porque la gente ya trabaja dentro de Mattermost. Sobrevivieron 981 líneas: la API de esa pantalla —**incluyendo un camino de escritura a JORNALES**—, sus dependencias, sus dobles y sus tests. Entre ellas, una función con un `ReferenceError` garantizado si alguien la llamaba.

**Impacto.** Un camino de escritura dormido es superficie de ataque y una trampa de mantenimiento. Y el DOD afirmaba *«sin rastros de la web ✔»*: la documentación decía que no estaban.

**Causa raíz.** Se eliminó la decisión (la pantalla) pero no lo que colgaba de ella. Nadie corrió la pregunta «¿quién importa esto?» sobre los archivos huérfanos.

**Cómo se detectó.** Auditoría técnica, con `grep` de importadores sobre todo el repositorio.

**Corrección.** Se eliminaron. Se conservaron a propósito los dos módulos que sí seguían vivos, y la primitiva criptográfica reservada, que está declarada como tal.

**Regla permanente.**
> **Cuando se descarta una decisión de producto, se elimina en el mismo movimiento todo lo que existía sólo para ella**, verificando con `grep` de importadores. Un camino de escritura sin llamadores no es código inofensivo: es una puerta sin vigilancia. Y **un ✔ en un DOD se toma sobre el estado real, no sobre la intención**.

---

### 14 · Concurrencia: lo que funcionó y lo que no

**Lo que funcionó** —y hay que preservarlo, porque es el mejor diseño del módulo:

- **Huella por celda.** Antes de escribir, se relee cada celda y se compara una huella que incluye **la fórmula y el valor crudo**. Si algo cambió desde que se armó el plan, se corta la operación entera. Dos personas cargando la misma obra no se pisan, y `9` → `=9` también cuenta como conflicto.
- **Confirmación de un solo uso.** `confirmar` es un `UPDATE … WHERE estado = 'abierta'`: si el jefe aprieta Registrar dos veces, la segunda pierde la carrera en la base y no escribe. No hay lógica de aplicación decidiendo esto.
- **Identidad estructural.** El cliente nunca elige una fila: manda una referencia estructural que el servidor traduce contra la planilla recién leída. Un nombre ambiguo se rechaza en vez de adivinar.

**Lo que no** — y quedó documentado como límite, no corregido:

- Entre que la sesión se marca confirmada y que la escritura ocurre hay una ventana: si el proceso muere ahí, el ledger dice `confirmed` y no se escribió nada.
- Si la verificación posterior a la escritura falla, **las celdas ya están escritas** pero el evento se audita como `failed`.

**Regla permanente.**
> **La concurrencia se resuelve en el recurso, no en la aplicación.** Comparar contra el destino releído (huella) y condicionar la transición de estado en la base (`WHERE estado = …`) es lo que funciona; coordinar con banderas en memoria, no. Y **el orden entre confirmar, auditar y escribir es una decisión de diseño que hay que escribir**: si no se puede hacer atómico, hay que declarar qué queda inconsistente y en qué ventana.

---

### 15 · Pruebas insuficientes descubiertas por la auditoría

El módulo tenía 569 tests propios y una suite de 1.565 en verde. Aun así, **ninguno de los defectos graves lo encontró un test**. Los tres motivos, todos sistemáticos:

1. **Dobles más permisivos que el original** (incidente 2). Además, el doble abría sesiones con el id del post ya puesto — algo que producción nunca hace, porque ese id recién se conoce en el primer click. Ese detalle tapaba un bug entero.
2. **Tests que codificaban el diseño viejo.** Al rediseñar el formulario, varios tests seguían afirmando el contrato anterior. Un test que hay que reescribir en cada cambio de diseño no está protegiendo el comportamiento: está congelando la implementación.
3. **Una red de seguridad desconectada.** El validador de contrato de Mattermost —que ataja exactamente los diálogos que la plataforma va a rechazar— existía, estaba bien escrito, y **sólo corría dentro de los tests**. Nunca en producción.

**Regla permanente.**
> **La cobertura no se mide en cantidad de tests sino en cuántos defectos reales podrían haber pasado igual.** Al cerrar un módulo, tomar los tres o cuatro bugs más caros y preguntar: *¿qué test habría fallado?* Si la respuesta es «ninguno», la suite mide otra cosa. Y **un validador que sólo corre en los tests no es una defensa**: si vale la pena validarlo, corre en producción.

---

## Reglas permanentes del Business OS

Cada una nace de un incidente real de arriba.

### Seguridad y confianza

1. **Nunca confiar en datos que vienen del cliente.** Del payload se lee la *intención*; la identidad, los permisos y el estado se leen del servidor. *(1)*
2. **Toda ruta que escriba datos autentica su origen antes de mirar permisos.** Si el que llama puede escribir su propia identidad, el control de permisos no controla nada. *(1)*
3. **Todo borde entrante se audita contra su despliegue**, cruzando la configuración del proxy con el manejador. La superficie pública no se ve leyendo la aplicación. *(1)*
4. **Fail-closed sin excepciones, y también cuando falta la configuración.** Un endpoint que escribe y no verifica nada es peor que uno apagado: apagado se nota enseguida. *(1)*
5. **Enumerar todas las puertas al mismo recurso** y verificar una por una que pasen por el mismo control. El test es «no existe camino que lo esquive». *(10)*
6. **Un secreto no se compara con `===`.** Tiempo constante, siempre. *(1)*

### Datos y verdad

7. **Los controles críticos no pueden validarse contra la misma información que generan.** Si el control y el dato salen del mismo camino, no hay control. *(11, y el precedente del Flujo de Fondos)*
8. **Un control se verifica sobre el camino que la gente usa**, no sobre el más fácil de probar. Dos caminos al mismo efecto: se miden los dos. *(11)*
9. **El registro de una operación crítica se construye en un solo lugar.** Dos constructores del mismo evento garantizan que uno quede pobre. *(11)*
10. **Nunca decirle al usuario que algo se guardó si no se guardó.** Distinguir «ya estaba» de «no se pudo» de «se canceló». *(4)*
11. **La fuente de verdad sobre si hay que escribir es el destino releído**, nunca un registro nuestro de lo que creemos haber hecho. *(4, 14)*
12. **Un dato que se corrige tiene que poder corregirse hacia abajo.** Si sólo se hace upsert de lo que existe, una marca falsa queda para siempre. *(15)*
13. **Nunca forzar al usuario a inventar un dato para poder avanzar.** Un campo obligatorio que no corresponde exigir ensucia la tabla que después se usa para decidir. *(16)*

### Diseño de interacción

14. **Ningún formulario debe permitir estados imposibles.** Prevenir por estructura le gana a validar por reglas: si la combinación inválida no se puede seleccionar, no hay que rechazarla. *(6, 7)*
15. **La interfaz no reimplementa las reglas: se las pide a la autoridad.** Una lista escrita a mano en la pantalla es una segunda fuente de verdad. *(7)*
16. **Cuando la interfaz y la autoridad no coinciden, manda la autoridad** — y la diferencia es un bug, no una preferencia. *(16)*
17. **El backend no se relaja porque la interfaz mejoró.** *(7)*
18. **Verificar qué permite la plataforma leyendo su contrato o su código, no suponiendo.** *(6, 9)*
19. **Todo texto que el usuario ve y que nosotros no escribimos es un defecto.** *(8)*
20. **Si una interfaz puede quedar duplicada en pantalla, el estado del servidor tiene que estar atado a una de esas copias.** *(5)*

### Robustez

21. **Toda protección automática declara qué pasa si se dispara por error.** Si la respuesta es «el sistema queda inutilizable», está mal diseñada. *(3)*
22. **Antes de proteger un recurso, declarar de quién es.** Lo que mantiene una persona no se protege como lo que mantiene el OS. *(3)*
23. **La idempotencia protege un reintento, no la historia.** Su alcance es la unidad de trabajo. Escribir el caso legítimo que repite la clave: si existe, el alcance está mal. *(4)*
24. **La concurrencia se resuelve en el recurso**: huella contra el destino releído y transiciones condicionadas en la base. *(14)*
25. **Todo endpoint externo lleva timeout explícito**, que cubre también la lectura del cuerpo, y limpia su timer en todos los caminos. *(12)*
26. **Un servicio degrada, no entra en crash-loop.** Si una dependencia falta, se sigue de pie denegando. *(13)*
27. **Un fallo de una llamada externa no puede terminar en una respuesta de éxito.** *(2)*
28. **Un fallo del sistema de auditoría deja rastro.** Nunca cambia el veredicto, pero nunca es invisible. *(11)*

### Proceso

29. **Toda auditoría intenta romper el sistema deliberadamente**, contra el sistema vivo, no leyendo código. *(1)*
30. **Ningún bug crítico se considera cerrado sin reproducirlo primero** y sin un test que falle con el código viejo. *(2, 11)*
31. **Toda mejora se valida en producción antes del cierre**, por el camino real del usuario. *(2)*
32. **Cuando un pedido no aparece en nuestros logs, el problema está antes de nosotros.** Ir a leer los logs del otro lado. *(9)*
33. **Un doble de prueba nunca es más permisivo que el original.** *(2, 15)*
34. **Un validador que sólo corre en los tests no es una defensa.** *(15)*
35. **Eliminar el código muerto en el mismo movimiento en que se descarta la decisión que lo justificaba**, verificando con `grep` de importadores. *(13)*
36. **Un ✔ en un DOD se toma sobre el estado real medido, no sobre la intención.** *(11, 13)*
37. **Cuando un comentario declara una condición futura que activaría una defensa, esa condición es un ítem de checklist.** *(1)*
38. **Antes de escribir un cliente nuevo, buscar el que ya existe en la casa y copiarle el patrón.** *(12)*

---

## Checklist de cierre de un módulo

Reutilizable para Compras, RRHH, Finanzas, Obras y cualquier módulo nuevo. Un módulo **no se cierra** con ítems sin marcar; los que no apliquen se marcan como no aplicables **con el motivo escrito**.

### Seguridad
- [ ] Enumeradas **todas** las puertas que llegan a la escritura, y verificado camino por camino que pasan por el mismo control.
- [ ] Cada borde entrante autentica su **origen** antes de evaluar permisos.
- [ ] Revisada la configuración del **proxy/despliegue**, no sólo el código: ¿qué quedó publicado?
- [ ] Listados los campos del pedido que se usan **sin re-verificar** contra el servidor. Para cada uno: ¿qué pasa si el que llama lo cambia?
- [ ] Comprobado el comportamiento **sin la configuración** (variable faltante): ¿falla abierto o cerrado?
- [ ] Secretos comparados en tiempo constante y ausentes de logs, mensajes y auditoría.
- [ ] Probados: usuario sin permiso, canal incorrecto, payload manipulado, reenvío del mismo pedido, formulario vencido.

### Datos y auditoría
- [ ] La operación crítica deja registro **con evidencia**, no con un resumen: qué se tocó, qué había antes, qué quedó.
- [ ] Ese registro se construye en **un solo lugar** y se verificó **en el camino que usa la gente**.
- [ ] Los rechazos se auditan con su motivo distinguible y su identificador de pedido.
- [ ] Un fallo del propio ledger deja rastro.
- [ ] Un dato derivado se puede **corregir hacia abajo** (borrar lo que dejó de aplicar), no sólo hacia arriba.
- [ ] Ningún mensaje afirma un resultado económico que no ocurrió.

### Concurrencia e idempotencia
- [ ] Escrito el caso legítimo que produce **la misma clave de idempotencia dos veces**. Si existe, el alcance está mal.
- [ ] Doble click y ráfaga de acciones probados: una sola mutación.
- [ ] Dos usuarios sobre el mismo recurso probados.
- [ ] La decisión de escribir se toma contra el **destino releído**.
- [ ] Escrito qué queda inconsistente si el proceso muere entre confirmar, auditar y escribir.

### Robustez
- [ ] Toda llamada saliente con timeout explícito, que cubre la lectura del cuerpo y limpia su timer.
- [ ] Probado el arranque **sin la base** y sin cada dependencia: ¿degrada o entra en crash-loop?
- [ ] Ninguna protección automática puede dejar el sistema inutilizable ante un falso positivo.
- [ ] Ningún error de una llamada externa termina en una respuesta de éxito.
- [ ] Revisados los `catch`: ninguno se traga algo que el usuario necesitaría saber.

### Interacción
- [ ] Ningún formulario permite seleccionar una combinación que después se rechaza.
- [ ] Las opciones que ofrece la interfaz salen de la autoridad del dominio, no de una lista propia.
- [ ] Todos los textos son nuestros y están en castellano rioplatense: buscado explícitamente texto en inglés del cliente/plataforma.
- [ ] Probados los casos de borde reales del negocio: feriado, sábado, día sin calibrar, cuadrilla vacía, fecha futura.
- [ ] Probado desde celular y desde escritorio.

### Código
- [ ] `grep` de importadores sobre todo lo que quedó huérfano al descartar una decisión; eliminado.
- [ ] Sin caminos de escritura sin llamadores.
- [ ] Límites del proyecto respetados (archivos ≤500 líneas, funciones ≤50) o justificados por escrito.
- [ ] Sin utilidades duplicadas; si una validación se repite en capas, escrito cuál es la autoritativa y por qué la repetición es deliberada.

### Pruebas
- [ ] Cada doble de prueba es **al menos tan estricto** como el original que reemplaza, y refleja el estado inicial real de producción.
- [ ] Los tres bugs más caros del módulo tienen un test que **falla con el código viejo** — verificado revirtiendo.
- [ ] Todo validador de contrato corre también en producción.
- [ ] Suite completa, typecheck y lint en verde.

### Cierre
- [ ] Flujo completo validado **en producción**, por el camino real del usuario.
- [ ] Logs revisados después del despliegue: sin errores nuevos, y con lo necesario para diagnosticar (identificador de pedido y de correlación).
- [ ] Servicios reiniciados verificados: activos y sin reinicios.
- [ ] Documentación actualizada, incluidas **las limitaciones que no se corrigieron**, sin disfrazarlas.
- [ ] Plantillas de entorno declaran **todas** las variables nuevas, incluidas las que hacen fallar en silencio si faltan.
- [ ] Este documento actualizado con lo que se aprendió.

---

## Auditoría del proceso

### ¿Qué hicimos bien?

- **El núcleo de escritura.** La huella por celda, la identidad estructural en vez de coordenadas y la confirmación condicionada en la base son diseño de primer nivel. Ninguna auditoría les encontró un agujero, y resolvieron problemas que la mayoría de los sistemas resuelven mal.
- **Fail-closed como criterio, no como excepción.** Canal, permiso e identidad deniegan cuando no se pueden verificar. Eso limitó el daño de varios incidentes.
- **Comentarios que explican el porqué.** Buena parte de la reconstrucción de este documento salió de comentarios del propio código. Es una inversión que se pagó sola.
- **Auditar con dos ojos independientes, uno funcional y otro técnico.** Convergieron en el mismo hallazgo por caminos distintos, lo que le dio confianza al diagnóstico.
- **Reproducir antes de corregir.** Ningún bug se dio por entendido sin verlo fallar primero.

### ¿Qué hicimos mal?

- **Dimos por cerrado un módulo con un agujero crítico y una función principal rota.** El DOD tenía ✔ en filas que no se habían medido sobre el camino real.
- **Construimos una pantalla web antes de preguntar dónde trabaja la gente.** Costó el desarrollo, el descarte y 981 líneas de código muerto que sobrevivieron meses.
- **Duplicamos la construcción del evento de auditoría** teniendo el constructor correcto al lado.
- **Escribimos dobles de prueba a la medida de lo que queríamos probar**, no de lo que hace el original.
- **Dejamos una defensa escrita y desconectada** (el validador de contrato) y una primitiva criptográfica con una nota que decía exactamente cuándo había que activarla. Se cumplió la condición y nadie la releyó.

### ¿Qué podríamos haber detectado antes?

Casi todo, con dos preguntas hechas al empezar:

1. **«¿Qué prueba que este pedido viene de quien dice?»** — encontraba el incidente crítico el primer día.
2. **«Si este módulo tiene dos caminos al mismo efecto, ¿medí los dos?»** — encontraba la auditoría pobre y la guarda faltante.

Y con una tercera al cerrar: **«¿qué test habría fallado?»** para cada bug encontrado.

### ¿Qué proceso faltó?

- Una **auditoría adversaria obligatoria antes del cierre**, hecha por alguien que no construyó el módulo y que ataca el sistema vivo. Fue lo que encontró todo lo grave, y llegó tarde.
- Un **inventario explícito de las puertas** a cada escritura, mantenido en la documentación del módulo.
- Una **revisión del despliegue** —qué quedó publicado, con qué autenticación— como paso separado de la revisión del código.

### ¿Qué automatización conviene crear?

Por orden de valor:

1. **Un test que enumere los caminos a la escritura** y falle si alguno no invoca la guarda. Convierte la regla 5 en algo que no se puede olvidar.
2. **Un chequeo de que todo endpoint publicado por el proxy tiene autenticación declarada** — cruzar la configuración del proxy con los manejadores registrados.
3. **Un test que compare los dobles con las firmas reales** que reemplazan: si el original desestructura un campo que el doble ignora, falla.
4. **Un auditor de completitud del ledger**: dado un evento de escritura, verificar que trae la evidencia mínima (celda, valor anterior, valor nuevo, autor). Corriendo periódicamente sobre datos reales, habría gritado la misma noche.
5. **Un chequeo de código muerto** que liste exports sin importadores en los módulos del OS.
6. **Un chequeo de que toda variable de entorno leída está declarada en la plantilla de deploy**, y viceversa.

### ¿Qué test debería existir para que este tipo de bug nunca vuelva a producción?

Uno por familia, y los cuatro son baratos:

- **Suplantación**: un pedido con la identidad de un usuario habilitado, **sin credencial de origen**, tiene que ser rechazado. Si pasa, falla el test.
- **Evidencia de la escritura**: el evento de una carga real tiene que traer celda, valor anterior y valor nuevo. Este test se escribió y **falla con el código que estaba en producción**.
- **Fidelidad de los dobles**: el doble del cliente externo exige exactamente los campos que el original desestructura.
- **Inventario de puertas**: la lista de caminos que llegan a la escritura es explícita, y cada uno pasa por la guarda.

---

## Cómo usar este documento

- **Antes de empezar un módulo**: leer las *Reglas permanentes*. Son 38 y se leen en diez minutos.
- **Durante**: cuando aparezca una decisión parecida a un incidente de acá, seguir la regla y no volver a razonarla de cero.
- **Al cerrar**: correr el *Checklist de cierre* entero, con nombre y fecha.
- **Después de cada incidente nuevo**, en cualquier módulo: agregarlo con la misma estructura (problema, impacto, causa raíz, cómo se detectó, corrección, regla permanente). Un incidente que no deja una regla se va a repetir.
