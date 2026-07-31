# Lecciones Aprendidas — Módulo Asistencia

> **Lectura obligatoria antes de construir cualquier módulo del Business OS.**
> Se actualiza después de cada incidente. Si leés esto y encontraste uno nuevo, agregalo.
>
> No es un changelog ni documentación funcional — eso vive en `orquestador/comunicacion/docs/`.
> Acá vive **por qué fallamos, cuántas veces fallamos igual, y qué regla nace de cada falla**.
>
> Base factual: 86 commits, 44 incidentes reconstruidos del historial, los comentarios del código, los dos documentos del módulo y la auditoría independiente del 30–31/07/2026.

---

## Resumen ejecutivo

**El módulo lo construyó una IA, lo probó la misma IA, escribió su propio DOD y se puso los ✔ a sí misma.** Después una auditoría independiente le encontró un agujero de seguridad explotable —un `curl` anónimo desde Internet pasaba el control de canal y el de permisos— y un bug que rompía la función principal mientras el dueño la usaba y la daba por buena.

Ese es el hallazgo estructural, y explica los 44 incidentes mejor que cualquier regla técnica de las que siguen: **no hubo ningún par de ojos que no tuviera interés en que el módulo estuviera terminado.**

El segundo dato es igual de incómodo: **de los defectos graves, los que encontró un test son cero.** Los encontró el dueño usando el sistema, o una auditoría atacándolo. La suite tenía 448 tests propios (los archivos de prueba del módulo, medidos con `node --test` sobre ellos) y 1.568 en total, todos en verde. El número de tests no fue una defensa: fue lo que sostuvo el ✔.

**Qué está en juego.** La asistencia es la entrada de las horas hombre, que es una de las diez capacidades centrales de la empresa. Un jornal mal cargado no es un error de pantalla: es salario UOCRA mal liquidado, costo mal imputado a la obra, y margen de obra falso. Contamina la cadena PRODUCCIÓN → COSTO → RESULTADO → CAJA completa, y lo hace en silencio, porque nadie audita a mano una planilla de jornales.

**Qué costó equivocarse.** La función principal estuvo caída dos veces la misma noche. Una pantalla web se construyó y se descartó en 45 minutos (2.042 líneas), y 981 líneas suyas —con un camino de escritura vivo— sobrevivieron 7 horas 20 más. El endpoint estuvo abierto a Internet desde que existieron los botones hasta que lo cerró la auditoría.

**Lo que se repite.** Doce patrones, con su frecuencia medida. Los seis peores:

| Patrón | Veces | Qué produce |
|---|---|---|
| Un mensaje al usuario afirma algo que no pasó | **6** | El operador se va convencido de que cargó, y no cargó |
| La documentación afirma un control que no existe | **5** | Un ✔ que nadie puede desmentir hasta que se rompe |
| El defecto está una o dos capas más abajo (o afuera) que el síntoma | **5** | Horas buscando en el archivo equivocado |
| Un doble de prueba más permisivo que el original | **4** | La suite en verde sobre un defecto vivo |
| Una protección que convierte un falso positivo en una falla permanente | **4** | El sistema se autobloquea y no se destraba solo |
| Un camino nuevo no hereda las defensas del viejo | **4** | La puerta nueva entra sin control |

Ninguno es un error de programación. Todos son errores de método, y por eso cruzan de módulo: van a reaparecer en Compras, RRHH, Finanzas y Obras.

**Si sólo hay tiempo para cinco reglas**, son estas: R1 (quién cierra), R2 (autenticar el origen), R3 (el efecto verificado en el destino, no el OK del usuario), R4 (medir el control en el camino real), R5 (el doble no más permisivo que el original).

---

## Los patrones

Esta es la parte reutilizable. Los incidentes son la evidencia.

### P1 · Un mensaje que afirma algo que no pasó — 6 veces

«✅ Asistencia registrada · Celdas actualizadas: 0» sin haber escrito nada. «Esta carga ya se registró» con la celda vacía. Un obrero que trabajó mostrado como «ausente (0)» porque la celda tenía `#REF!`. Un resumen con **datos verdaderos del día equivocado** —se preguntó por el 32/13 y contestó el 30/07—, que es la peor variante porque el jefe no tiene forma de sospechar. Un HTTP 200 mientras el mensaje quedaba sin actualizar.

El sistema no falla: **miente con confianza**. En un módulo con dinero de por medio, una mentira tranquila es peor que un error ruidoso.

### P2 · La documentación afirmaba un control que no existía — 5 veces

Un encabezado declaraba «sólo dos jefes de obra pueden cargar» treinta líneas arriba del código que dejaba pasar a cualquiera. Una migración decía que el worker vencía las sesiones: **no la llamaba nadie**, y el caso que el TTL tenía que cubrir —el jefe que se va y no vuelve— era exactamente el que no cubría. Dos archivos distintos, con doce horas de diferencia, declaraban que las acciones viajaban firmadas cuando la función de firma no tenía un solo llamador. El DOD daba por cumplidos tres controles falsos.

La documentación que miente es peor que la ausente: **impide que alguien vaya a mirar**.

El proyecto inventó la contramedida correcta y hay que generalizarla: un **guard-test cuyo objeto es la veracidad de un documento** — falla si aparece un llamador productivo de una primitiva declarada inactiva, *para que activarla obligue a corregir el texto en vez de dejarlo mintiendo*. Probado contra un canario.

### P3 · El defecto está una o dos capas más abajo, o afuera — 5 veces

El error estaba en los logs de Mattermost, no en los nuestros. Estaba en el portón central de escritura, no en el módulo — «un defecto que ningún test del módulo podía ver, porque no estaba en el módulo». Estaba en el driver de Postgres, que devolvía una fecha como objeto. Estaba en el firewall del host, no en la configuración de Docker que se había culpado primero — y esa hipótesis falsa había durado 23 minutos como solución adoptada.

De acá salió la herramienta de diagnóstico más útil del proyecto: **que un pedido no aparezca en nuestros logs es un dato, no una falta de datos.** En el incidente de los botones de fecha, esa sola observación descartó tres hipótesis.

### P4 · Un doble de prueba más permisivo que el original — 4 veces

El proyecto lo escribió con sus palabras —**«Un doble que no respeta el contrato del original no prueba, tapa»**— y volvió a pasar tres veces después de escribirlo. Un fake que no evaluaba fórmulas. Un doble que leía un objeto donde el real espera un número, con lo cual **la jornada parcial nunca exigía motivo**: seis horas sobre nueve pasaban sin explicación, que es justo el dato por el que existe el módulo. Un cliente falso que aceptaba cualquier forma de parámetro mientras producción tiraba `PUT /posts/undefined → 400` durante horas.

El caso más sutil: el doble abría sesiones con el id del mensaje **ya puesto**, algo que producción nunca hace porque ese id recién se conoce en el primer click. Ese detalle del estado inicial tapaba un bug entero.

### P5 · Una protección que se vuelve una falla permanente — 4 veces

También lo nombró el proyecto, en una migración: **«una protección que convierte un falso positivo en una falla PERMANENTE en vez de una molestia pasajera»**. La firma de pestaña auto-candó JORNALES. Una clave de idempotencia bloqueó una carga legítima *para siempre*. Un índice único reforzaba lo mismo desde la base. Y una clave quemada antes de saber si la celda entró producía «esa carga ya estaba registrada» con las celdas vacías.

Lo más instructivo: **la misma protección se corrigió tres veces en doce horas, en tres capas distintas** (estado de sesión → alcance de la búsqueda → índice de la base). Arreglarla arriba no cerró nada porque la de abajo lo reforzaba.

### P6 · Un camino nuevo no hereda las defensas del viejo — 4 veces

**«Un camino nuevo hacia el mismo efecto no hereda las defensas del viejo: hay que ir a buscarlas una por una. Las tres cosas que faltaban existían y estaban a un import de distancia.»**

La interfaz de botones no autenticaba, y el slash command sí. El flujo conversacional era la única de las tres puertas sin guarda de canal. La interfaz de botones armaba la auditoría a mano mientras el camino viejo usaba el constructor completo. El servidor HTTP era el único lugar que pasaba el pool crudo de Postgres, cuando el worker, el conector y los handlers ya lo armaban bien.

### P7 · Defectos que sólo aparecen mirando, no leyendo — 7 en 2 bloques

Dos secciones del DOD se titulan así. En la pantalla web, un atributo `hidden` perdía contra una regla de CSS y dejaba **48 controles a la vista** en una cuadrilla de 16. Un «Listo» se borraba solo, y la pantalla muda significa en uso diario **apretar Registrar dos veces**. Un desplegable salía sin texto. Ninguna suite estática los vio.

La contramedida adoptada es la correcta: los tests que nacen de un defecto visual **atacan la causa —que sí es texto— en vez de renderizar**, y se verifica que fallan al sacar la regla que los provoca.

### P8 · La interfaz le discute a la regla de negocio — 2 veces

El formulario ofrecía combinaciones que el núcleo siempre rechaza: corregía después en vez de prevenir antes. Y exigía motivo un sábado, cuando el catálogo —la autoridad— no lo exige sin jornada conocida; el jefe elegía uno falso, y eso quedaba guardado como falta injustificada o ART en la única tabla que responde POR QUÉ.

### P9 · Un test que codificaba el diseño viejo — 2 veces

Un test protegía el comportamiento defectuoso de la idempotencia y hubo que reemplazarlo. Y el código muerto de la pantalla web **tenía tests propios**: eso es lo que lo mantenía verde en cada corrida sin que nadie notara que ya no lo importaba nadie.

### P10 · Configuración que apaga el sistema en silencio — 4 veces

Cuatro variables de entorno faltantes o mal documentadas, todas con el mismo síntoma: **el sistema arranca, publica, responde 200 — y no hace nada**. El jefe escribe el comando y no pasa nada, sin ningún error que explique por qué. Ninguna es detectable por un test: viven en plantillas `.env.example`.

### P11 · Regresión introducida por la corrección anterior — 2 veces

Un defecto se introdujo **once minutos** después de la corrección que lo causó. Otra corrección revirtió una solución adoptada **veintitrés minutos antes** — con la justificación escrita en los dos commits, que es lo que hay que hacer. La velocidad de corrección es una ventaja hasta que se vuelve la fuente de los defectos siguientes.

### P12 · Nunca inventar el dato que falta — 6 veces, y salió bien

El único patrón positivo. Se sembraron 14 feriados **sólo donde dos fuentes coinciden**, porque «una fecha equivocada precargaría a toda la empresa en franco un día laborable», y hay un test que falla si alguien agrega los que faltan sin verificar. Una fórmula como `=9-2,5+2` no se descompone: «inventar una descomposición ahí sería precisión falsa». Con homónimos, «se rechaza en vez de elegir por azar». Una celda vacía no es un 0: contarla como ausencia «inventaría faltas que nadie registró». Sin jornada conocida el campo vuelve a texto libre. Y no se agregaron jefes de obra al canal porque no hay fuente confiable de identidades: «inventarlos habría sido peor».

Es el patrón que más incidentes evitó y el más fácil de erosionar cuando aprieta el plazo.

---

## Línea de tiempo

Numeración canónica: las reglas y los incidentes citan **estos** números. `[✱]` marca los que tienen sección desarrollada.

| # | Síntoma | Causa raíz | Lo detectó |
|---|---|---|---|
| 1 | Escribir 8 h un martes: 1 h por persona por día de error silencioso, que la planilla arrastra hasta el cash flow | La jornada completa se trató como constante y no lo es (9 h lun–jue, 8 h vie, sábado sin moda) | Censo del archivo real |
| 2 | La huella de celda habría reventado al persistirse | El separador era un byte NUL y Postgres lo rechaza en `jsonb` | Revisión previa al deploy |
| 3 | Las horas extra quedaban fuera del sistema | Criterio «prudente y falso»: se trató toda fórmula como intocable, cuando de 3.415 celdas sólo 27 tienen fórmula y casi todas son horas extra | Censo del archivo real |
| 4 | El módulo entero se apagaba | Permisos estrictos + tabla vacía se leyó como denegación total | Revisión |
| 5 | Una fecha imposible se contestaba con los números de hoy | El parser marcaba «tiene fecha» al ver algo con forma de fecha y la dejaba nula | Validación contra el archivo real |
| 6 | Toda consulta con fecha caía en el año 2000; «ayer» contestaba con los datos de hoy | Faltaba pasar el contexto ISO entre capas | Revisión |
| 7 | «✅ Asistencia registrada · Celdas actualizadas: 0» y el reintento bloqueado para siempre **[✱4]** | La clave se quemaba antes de saber si la celda entró | Auditoría interna |
| 8 | Las sesiones abandonadas no vencían nunca | La migración decía que el worker lo hacía; no lo hacía **(P2)** | Revisión |
| 9 | Preguntar en el canal devolvía la respuesta por privado | «Privado» se leyó como «siempre por DM» | Prueba en el canal |
| 10 | «quién faltó ayer» abría el formulario de carga | Esas palabras no estaban entre los temas de pregunta | Prueba en el canal |
| 11 | Y después buscó a una persona llamada «falto» | Regresión de 10, once minutos después **(P11)** | Prueba en el canal |
| 12 | Se construyó una pantalla web que nadie iba a abrir **[✱13]** | Se diseñó la interfaz antes de mirar dónde trabaja la gente | Decisión del dueño |
| 13 | 48 controles a la vista en una cuadrilla de 16; el «Listo» se borraba solo **(P7)** | `hidden` perdía contra una regla de CSS; el aviso se ponía antes de recargar | **Mirando** una captura real |
| 14 | Caddy no alcanzaba al servidor del host | El firewall descartaba lo que venía de los bridges de Docker; la primera causa culpada era falsa **(P3)** | Medición en las dos direcciones |
| 15 | La jornada parcial nunca exigía motivo: 6 h sobre 9 sin explicación | El doble leía un objeto donde el real espera un número **(P4)** | Auditoría |
| 16 | El desplegable de obras salía sin texto | El núcleo devuelve `etiqueta`/`personas` y la UI necesita `nombre`/`cantidad` | **Los logs de Mattermost** |
| 17 | «Esa fecha no existe» al elegir obra | Postgres devuelve la fecha como objeto y se la pasaba por `String()` | Llamando al endpoint real |
| 18 | «No pude abrir la carga» al primer click | El servidor pasaba el pool pelado, sin `withTx` **(P6)** | Validación previa a la primera escritura |
| 19 | «La pestaña de JORNALES está tomada» **[✱3]** | La firma de pestaña se aplicó a una pestaña de propiedad humana y la auto-candó **(P5)** | **El dueño, en la primera carga real** |
| 20 | «Esta carga ya se registró» sin haber registrado **[✱4]** | Clave de idempotencia buscada en toda la historia **(P5)** | El dueño |
| 21 | Y el UPDATE moría con violación de clave única | El índice reforzaba lo mismo desde la base **(P5)** | El dueño |
| 22 | «Sorry, we could not find the page» **[✱9]** | El identificador de acción con guión bajo no matchea la ruta de la API **(P3)** | Prueba manual; **la ausencia de logs** |
| 23 | Combinaciones inválidas aceptadas hasta el Guardar **[✱7]** | Se pasaba el catálogo entero de motivos **(P8)** | El dueño |
| 24 | «Submission failed with validation errors» **[✱8]** | Texto del cliente de Mattermost, no nuestro | El dueño |
| 25 | Una marca de ART quedaba para siempre | La proyección sólo hacía upsert de lo que tenía motivo | Auditoría |
| 26 | 981 líneas de la pantalla borrada seguían vivas, con un camino de escritura **[✱13]** | Se eliminó la decisión, no lo que colgaba de ella **(P9)** | Auditoría |
| 27 | Un `curl` anónimo pasaba canal y permisos **[✱1]** | La ruta es pública y la identidad salía del payload **(P6)** | **Auditoría atacando producción** |
| 28 | Se guardaba la excepción y la lista seguía vieja **[✱2]** | `postId` contra `id`: `PUT /posts/undefined` **(P1, P4)** | Auditoría + log de producción |
| 29 | Se podía cargar por mensaje privado al bot **[✱10]** | La guarda corría en dos de las tres puertas **(P6)** | Auditoría |
| 30 | La auditoría real no decía qué celda se tocó **[✱11]** | Evento armado a mano teniendo el constructor al lado **(P6)** | Auditoría + datos de producción |
| 31 | Un feriado no dejaba abrir el formulario | Desplegable vacío y valor precargado fuera de opciones | Auditoría |
| 32 | Crash-loop con la base caída | El repositorio se construía con un port nulo | Auditoría |
| 33 | Los botones de un mensaje viejo manejaban el nuevo **[✱5]** | La sesión se resuelve sólo por usuario | Auditoría |
| 34 | Un sábado obligaba a inventar un motivo **(P8)** | El formulario exigía lo que el catálogo no exige | Auditoría |
| 35 | Una llamada a Mattermost podía colgar el pedido **[✱12]** | `fetch` sin `AbortController` **(P6)** | Auditoría |
| 36 | Si el ledger dejaba de escribir, nadie se enteraba | El resultado del auditor se descartaba en todos los llamadores | Auditoría |
| 37 | Cuatro variables que apagaban el módulo en silencio **(P10)** | Plantillas de deploy incompletas o mentirosas | Auditoría |
| 38 | El validador que conoce el alfabeto de los `action_id` **seguía sin correr en producción** | Se conectó la mitad: el de diálogos sí, el de mensajes no **(P2)** | **Verificar este documento** |

El 38 lo encontró la verificación cruzada de **este mismo documento** contra el código: la regla R32 estaba incumplida en el momento de escribirla. Se corrigió con el documento — el único cambio de código de este trabajo.

**Detectados por un test: ninguno.** Nueve por el dueño usándolo, catorce por auditorías, el resto por censos del archivo real, revisión o mediciones.

> **Fechas.** Los commits del bloque nocturno están fechados 30/07; varios comentarios del código fechan los mismos hechos el 31/07. La sesión cruzó la medianoche. Donde importe, manda `git log`.

---

## Incidentes

Sólo los que dejan una lección no obvia. Los demás viven en la tabla y ahí alcanzan.

### ✱1 · Autenticación insuficiente del endpoint *(línea 27)*

`orquestador/comunicacion/asistencia-accion.mjs` · `servidor-asistencia.mjs` · `secreto-compartido.mjs`

**Problema.** `POST /asistencia/accion` —la ruta que ejecuta cada botón y termina escribiendo jornales— no verificaba nada. Identidad, canal y equipo salían del cuerpo del pedido. El proxy publica ese prefijo en Internet sin autenticación.

**Impacto.** Un pedido anónimo con el identificador de una persona habilitada pasaba el control de canal **y** el de permisos. Durante los 20 minutos que vive un formulario abierto, un tercero podía escribir jornales a nombre de esa persona.

**Causa raíz.** El modelo de amenazas se razonó sobre el código de la aplicación, no sobre el despliegue. Guarda de canal, permisos, auditoría y fail-closed deciden *a quién se deja pasar*; ninguno verifica *que el que golpea sea quien dice*. La pregunta se había hecho para el slash command —que sí valida su token— y no para esta puerta **(P6)**.

Lo más incómodo: al escribir la capa de sesiones alguien previó esto, dejó la primitiva criptográfica lista y anotó *«QUÉ LA ACTIVARÍA: botones o diálogos interactivos de Mattermost […] recién ahí la firma pasa a proteger algo real»*. Los botones se activaron. La firma no. **El código predijo el agujero y nadie releyó la nota al cumplirse su condición.**

**Y una consecuencia peor que el agujero.** La auditoría registraba `identidad_verificada: true` para una identidad que nadie había verificado. **Un campo del ledger afirmaba una comprobación que el código no hacía.**

**Corrección.** Un secreto compartido viaja en la query de la URL de callback, se compara en tiempo constante antes de la guarda de canal, y falla cerrado también cuando falta la configuración. Se comprobó contra el servidor real que Mattermost guarda esa URL y **no** le manda el bloque de integración al cliente, así que sólo su servidor puede presentarlo. Un solo lugar arma la URL: si cada puerta armara la suya, alcanzaría con que una se olvidara el secreto para que sus botones murieran **en producción y en ningún test**.

### ✱2 · El post no se refrescaba *(línea 28)*

`asistencia-mm/cliente.mjs` · `asistencia-mm/dobles-de-prueba.mjs`

El ruteador llamaba `actualizarPost({ postId, … })` y el cliente declara `{ id, … }`. Salía `PUT /api/v4/posts/undefined → 400`. **El error se capturaba, se logueaba, y la respuesta HTTP igual era 200.** El jefe guardaba «no vino», el sistema decía OK, la lista seguía igual — y la reacción natural es volver a cargarlo.

El log de producción tiene un `400` a las 23:17 de esa noche, **mientras el dueño probaba el módulo y lo daba por bueno**. De acá sale la regla R3: el OK del usuario no prueba nada.

Se corrigió el nombre, y sobre todo **el doble pasó a exigir `id`** y a abrir sesiones sin el id del mensaje, como hace producción **(P4)**.

### ✱3 · Locks de Sheets: la protección que se volvió la falla *(línea 19)*

`orquestador/lib/guarda-escritura.mjs` · `lib/tools/jornales-asistencia.mjs`

Al apretar Registrar: *«La pestaña de JORNALES está tomada y no se puede escribir ahora»*. Ninguna celda se escribía, y el mensaje sugería algo transitorio cuando el estado era permanente.

La secuencia real, leída contra producción y contra la base: a las 14:13 el OS escribe y **sella** la firma de la pestaña. Entre las 14:13 y las 22:26 una persona edita la planilla —vacía una celda, pone otra en `"0"`— y la firma diverge. A las 22:26 el dueño aprieta Registrar: la guarda ve la diferencia y **auto-canda** la pestaña. Desde ese momento bloqueaba todo intento siguiente.

La guarda funcionó. **El error fue no preguntarse de quién es la pestaña antes de apuntársela**: `Obreros 26` la editan personas todos los días por diseño, así que su firma siempre difiere, y eso no es evidencia de conflicto: es el estado normal.

El defecto vivía **fuera del módulo**, en el portón central de escritura: ningún test del módulo podía verlo **(P3)**. Se corrigió con una marca `compartida` que apaga la firma y el auto-candado —**no** el candado explícito del dueño— y los tests nuevos interceptan sólo la base y corren el candado y la firma **reales**: no se simula la decisión, se simula la base.

> Lección del DOD: *«una protección de pestaña propia no sirve para una pestaña compartida — ahí se protege la CELDA»*.

### ✱4 · Idempotencia demasiado global *(líneas 7, 20, 21)*

`orquestador/comunicacion/asistencia-sesion.mjs` · migración `20260731020000`

*«Esta carga ya se registró. No se escribió dos veces»* — sin haber registrado nada.

La clave es función pura de (planilla, pestaña, fecha, obra, actor, horas) y se buscaba entre **todas** las sesiones confirmadas de la historia. Evidencia de producción: una sesión de las 11:51 dejó la clave tomada, después **una persona vació la celda a mano**, y la carga nueva caía como duplicada.

Se corrigió **tres veces en doce horas, en tres capas** —estado `fallida` para que lo que no entró no cuente; alcance acotado a la misma sesión; migración que quitó la unicidad del índice— porque cada capa reforzaba la anterior **(P5)**. La migración se auto-diagnosticó: *«es la misma familia de defecto que el auto-candado de pestaña»*.

El principio que quedó: **quien decide si hay que escribir es la planilla**, no la memoria de una clave.

### ✱5 · Sesiones compartidas entre dos mensajes *(línea 33)*

La sesión se resuelve sólo por usuario. Abrir una carga nueva cancela la anterior, pero el mensaje anterior se queda en el canal con sus botones vivos: operaban sobre la sesión nueva y **le reapuntaban el mensaje**, así que los refrescos posteriores aterrizaban en el equivocado.

Faltaba atar el estado del servidor **al mensaje concreto que la persona está mirando**. Ahora la sesión se ata al primero que la toca y un click de otro rebota diciendo cuál es el bueno.

### ✱7 · Validaciones que llegan tarde *(línea 23)*

`asistencia-mm/mensaje.mjs` · `lib/asistencia-motivos.mjs`

El formulario aceptaba «Trabajó: Sí · Horas: 5 · Motivo: Faltó con aviso» y lo rechazaba recién al guardar. La causa concreta: al diálogo se le pasaba `motivos: d.motivos.CATALOGO` — el catálogo entero, sin filtrar por contexto.

**No se arregla refrescando**: un diálogo de Mattermost es estático, no hay evento de cambio ni forma de re-renderizarlo. Se diseñó la interacción sin leer qué permite la plataforma; el requerimiento era razonable, el error fue prometerlo. La respuesta correcta no era simular la corrección sino **rediseñar para que el estado inválido no sea representable**: el tipo de excepción se elige *antes* del formulario, y las horas pasaron de texto libre a un desplegable de valores válidos — así tampoco existe el 26 de un dedazo.

**El backend quedó exactamente igual**, y se verificó: su diff estaba vacío y sigue rechazando la combinación inválida.

### ✱8 · Textos técnicos en inglés *(línea 24)*

*«Submission failed with validation errors»* no era nuestro texto. El cliente de Mattermost, cuando la respuesta trae **sólo** errores por campo, pone ese encabezado; si viene un error de primer nivel, muestra ese. Se confirmó **leyendo el código del propio cliente** **(P3)**.

### ✱9 · El identificador de acción como segmento de URL *(línea 22)*

Los botones de fecha mostraban *«Sorry, we could not find the page»* — y el selector de obra, **en el mismo mensaje**, andaba.

El identificador viaja como segmento de la URL de la API de Mattermost y ese segmento sólo acepta alfanuméricos. Con guión bajo la ruta no matchea. La evidencia decisiva fueron cuatro llamadas al mismo mensaje con el mismo token: un id válido devuelve 200; uno inexistente devuelve el 404 **del manejador**; uno con guión bajo devuelve el 404 **del router**. Dos 404 distintos prueban que el problema es el carácter.

**La pista inicial fue la ausencia de logs**, que descartó de un saque las tres hipótesis equivocadas: no era el backend, ni el ruteo del proxy, ni una URL vieja de la pantalla eliminada **(P3)**.

### ✱10 · La guarda que no corría en todas las puertas *(línea 29)*

`orquestador/comunicacion/asistencia-guarda.mjs`

El conteo exacto importa: **cuatro puertas de entrada** (comando, mención, botones y `asistencia por chat`), **tres lugares donde corre la guarda** (el comando y la mención comparten uno) y **dos caminos que escriben**. La guarda corría en dos de los tres lugares, así que por el camino conversacional se podía cargar por mensaje privado al bot — exactamente lo que existe para impedir: *«por privado no hay testigo»*.

Es una defensa implementada **en los llamadores** en vez de en el recurso: cada puerta nueva tiene que acordarse de invocarla, y una se olvidó **(P6)**.

### ✱11 · Auditoría insuficiente *(línea 30)*

`orquestador/lib/asistencia-auditoria.mjs` (`payloadConfirmacion`) · `asistencia-mm/acciones.mjs`

El evento de escritura del camino de botones —el que usa la gente— se armaba a mano, campo por campo. Quedaban en `null` la evidencia celda por celda, el nombre de quien cargó, la planilla y los totales de horas. El constructor que lo hace bien existía y lo usaba el otro camino **(P6)**.

Es el incidente más difícil de ver del proyecto. El DOD afirmaba *«se puede reconstruir quién escribió qué celda, cuándo, y qué había antes ✔»* y la rutina semanal decía *«mirar `old_value`/`new_value` y la celda exacta»*. **Ese control estuvo ciego justo para la interfaz real**, y el ✔ se había tomado midiendo el otro camino. En palabras del DOD: *«la rutina semanal controlaba un campo que para esas cargas siempre estaba vacío, y nadie lo notó porque el control se comparaba contra sí mismo»*.

Es el mismo defecto que en el Flujo de Fondos hizo perder $292,8M invisibles. **Los eventos anteriores a la corrección no se pueden reconstruir.**

Se detectó **consultando la tabla en producción y comparando filas**: las cargas del camino viejo tenían la evidencia; las del nuevo, `null`. El test que quedó falla con el evento armado a mano y pasa con el constructor.

### ✱12 · Timeout con Mattermost *(línea 35)*

`communication-service/src/channels/mattermost/mattermost-cliente.mjs`

`fetch` sin `AbortController`, dentro del manejador HTTP: si Mattermost no responde, el pedido del jefe queda colgado indefinidamente. **El patrón correcto ya existía en la casa** —el cliente de Google usa `AbortController` con su variable de entorno y devuelve un error legible— y no se aplicó **(P6)**.

La lectura del cuerpo quedó **dentro** del mismo techo: un servidor que manda headers y después nada cuelga igual.

### ✱13 · La pantalla web: construida, descartada, y su cadáver *(líneas 12, 26)*

Se construyó una pantalla web de carga con 73 tests, se probó en producción y se descartó en **45 minutos**, con esta razón: *«Un supervisor no tiene que salir de Mattermost para registrar asistencia»*. Se borraron 2.042 líneas, y también la tabla en producción — *«sin dueño, una tabla vacía sólo confunde al próximo»*.

Bien hecho: los 44 tests que cubrían validaciones, motivos, horas, idempotencia y concurrencia **no colgaban de la pantalla sino del servicio**, y el arnés pasó a llamarlo en proceso sin reescribir una sola aserción.

Mal hecho: sobrevivieron **981 líneas durante 7 horas 20**, incluyendo un camino de escritura a la planilla **sin ninguna puerta viva delante** y una función con un error garantizado si alguien la llamaba. Código muerto con acceso a la fuente de verdad es *«una trampa esperando que alguien lo reconecte porque ya estaba»*. Y **tenía tests propios: eso es lo que lo mantenía verde** en cada corrida **(P9)**.

**La lección más cara es anterior a todo esto**: se diseñó la interfaz antes de preguntar dónde trabaja la gente. La respuesta estaba disponible desde el primer día.

### ✱14 · Concurrencia: lo que funcionó

Se documenta porque hay que **preservarlo**, y porque es lo que hay que traducir a otros módulos.

- **Huella por celda.** Antes de escribir se relee cada celda y se compara una huella que incluye la fórmula y el valor crudo. Cortó cargas simultáneas de dos personas sobre la misma obra sin perder una escritura, y `9` → `=9` también cuenta como conflicto.
- **Confirmación de un solo uso.** Confirmar es un `UPDATE … WHERE estado = 'abierta'`: el segundo click pierde la carrera **en la base**, no en la aplicación.
- **Identidad estructural.** El cliente nunca elige una fila: manda una referencia que el servidor traduce contra la planilla recién leída. Un nombre ambiguo **se rechaza en vez de adivinar** **(P12)**.

**Lo que quedó abierto y hay que saber:** entre que la sesión se marca confirmada y que la escritura ocurre hay una ventana en la que el ledger dice `confirmed` sin que se haya escrito; y **si la verificación posterior falla, las celdas ya están escritas** pero el evento se audita como `failed` — el jefe lee que no se pudo y la celda está cargada.

---

## Reglas permanentes del Business OS

Clasificadas según el estándar del `CLAUDE.md` raíz: **C** patrón probable · **D** conocimiento interno validado · **E** regla operativa aprobada. Una **A** (observación aislada) no entra acá. El número entre paréntesis remite a la línea de tiempo; la P, al patrón.

### Quién y cómo se cierra

**R1 — Ningún módulo lo cierra quien lo construyó.** El cierre lo firma alguien —persona o agente— que no escribió el código y que ataca el sistema vivo, no que lee. Sin eso, el DOD es una autoevaluación. `D` *(hallazgo estructural)*

**R2 — Toda ruta que escriba datos autentica su origen antes de mirar permisos.** Operable: abrir la configuración del proxy, listar todos los prefijos publicados, y para cada uno escribir el archivo y la línea del manejador que autentica el origen. **Un prefijo sin línea es un hallazgo, no una pendiente.** `E` *(27)*

**R3 — Que el usuario diga que anduvo no prueba que anduvo.** La prueba es el efecto verificado en el destino: la celda escrita, la fila en la base, el evento con evidencia. Toda validación en producción se cierra **mirando el destino, no la pantalla**. `E` *(28)*

**R4 — Un control se verifica sobre el camino que usa la gente.** Si hay dos caminos al mismo efecto, se miden los dos o no está medido. `E` *(30, P6)*

**R5 — Un doble nunca es más permisivo que el original, ni parte de un estado inicial que producción no produce.** Si el real desestructura un campo, el doble falla cuando falta. Y toda corrección se valida **por mutación**: revertirla tiene que hacer fallar el test. `E` *(P4, cuatro apariciones)*

### Verdad del dato

**R6 — El control de una escritura se corre con una herramienta que no comparte código con el que escribió.** Si el control usa la misma función que generó el dato, no es control: es un eco. Concreto: si el módulo escribe con `X`, el control lee el destino con una consulta independiente y compara. `E` *(30; precedente Flujo de Fondos)*

**R7 — Ningún campo de auditoría afirma una verificación que el código no hace.** Si el ledger dice `verificada`, hay una línea que la verificó. `E` *(27)*

**R8 — Un mensaje de éxito se emite después de comprobar el efecto y describe lo que pasó.** «Ya estaba», «no se pudo» y «se canceló» nunca comparten texto, y un fallo de una llamada externa **nunca** termina en una respuesta de éxito. `E` *(P1, seis apariciones)*

**R9 — El registro de una operación crítica se construye en un solo lugar.** Verificable con `grep` del nombre del constructor. `E` *(30)*

**R10 — La fuente de verdad sobre si hay que escribir es el destino releído**, no un registro nuestro de lo que creemos haber hecho. `E` *(20, ✱14)*

**R11 — Todo dato derivado se puede corregir hacia abajo**: una carga posterior borra lo que dejó de aplicar, no sólo agrega. `D` *(25)*

**R12 — Nunca inventar el dato que falta**: declararlo, rechazar antes que adivinar, y nunca forzar al usuario a inventarlo para poder avanzar. `E` *(P12, seis apariciones)*

### Diseño

**R13 — Antes de construir una interfaz, preguntar dónde trabaja hoy quien la va a usar**, y llevar el sistema ahí. `D` *(12)*

**R14 — Ningún formulario permite estados imposibles.** Cuando la plataforma no deja corregir al vuelo, la respuesta no es simular la corrección: es rediseñar para que el estado inválido **no sea representable**. `E` *(23)*

**R15 — La interfaz le pide las reglas a la autoridad del dominio; cuando no coinciden, manda la autoridad** y la diferencia es un bug, no una preferencia. El backend no se relaja porque la interfaz mejoró. `E` *(23, 34, P8)*

**R16 — Verificar qué permite la plataforma leyendo su contrato o su código.** Todo identificador que viaje en una URL declara su alfabeto en un test. `E` *(22, 23)*

**R17 — Todo texto que el usuario ve y que nosotros no escribimos es un defecto.** `E` *(24)*

**R18 — Si una interfaz puede quedar duplicada en pantalla, el estado del servidor se ata a una copia** y verifica que es la vigente. `D` *(33)*

**R19 — Una interfaz se mira antes de darla por buena**, y el test que nace de un defecto visual ataca la causa —que sí es texto— en vez de renderizar. `E` *(13, P7)*

### Robustez

**R20 — Cada guarda automática tiene escrita una fila: falso positivo → qué queda roto → cómo se destraba → quién puede destrabarlo.** Si el destrabe requiere un deploy o una migración, la guarda no se activa automáticamente. `E` *(19, P5)*

**R21 — Antes de proteger un recurso, declarar de quién es.** Lo que mantiene una persona no se protege como lo que mantiene el OS: ahí se protege la unidad mínima (la celda, la fila), no el contenedor. `E` *(19)*

**R22 — Si una regla vive en varias capas, se corrige en todas a la vez.** Una sobreviviente reinstala el defecto. `E` *(7, 20, 21)*

**R23 — La idempotencia protege un reintento, no la historia.** Su alcance es la unidad de trabajo; antes de definir una clave, escribir el caso legítimo que la repite. Si existe, el alcance está mal. `E` *(20)*

**R24 — La concurrencia se resuelve en el recurso**: comparar contra el destino releído y condicionar la transición de estado en la base. Coordinar con banderas en memoria, no. `E` *(✱14)*

**R25 — Toda llamada saliente lleva timeout explícito que cubre la lectura del cuerpo** y limpia su timer en todos los caminos. Todo cliente nuevo se escribe listando primero los que ya hay: si el nuevo no tiene timeout, reintento o log y el viejo sí, es un bug, no una decisión de diseño. `E` *(35)*

**R26 — Un servicio degrada, no entra en crash-loop.** Si una dependencia falta, sigue de pie denegando. `E` *(32)*

**R27 — Un fallo del sistema de auditoría deja rastro**, aunque no cambie el veredicto. `D` *(36)*

### Proceso y memoria

**R28 — Al agregar una puerta a un efecto existente, listar las defensas del camino viejo una por una.** El test correcto no es «la guarda funciona»: es **«no existe camino al efecto que la esquive»**, con la lista de caminos escrita. `E` *(P6, cuatro apariciones)*

**R29 — Cuando un pedido no aparece en nuestros logs, el problema está antes de nosotros**: ir a leer los logs del otro lado. `E` *(22, P3)*

**R30 — Toda afirmación de control en la documentación necesita un comando que la verifique o un guard-test que la sostenga.** Un ✔ se toma sobre el estado real medido. `E` *(P2, cinco apariciones)*

**R31 — Cuando un comentario declara la condición futura que activaría una defensa, esa condición es un ítem de checklist.** `D` *(27)*

**R32 — Un validador que sólo corre en los tests no es una defensa.** Y un test verde sobre código que nadie importa es señal de **código muerto**, no de cobertura. `E` *(26, 31)*

**R33 — Eliminar el código muerto en el mismo movimiento en que se descarta lo que lo justificaba**, verificando importadores con `grep`. `E` *(26)*

**R34 — Después de corregir algo, revisar en la misma sesión qué depende de lo que se tocó.** `D` *(11, 14, P11)*

**R35 — Cuando un commit nombra un patrón, ese patrón sale del mensaje de commit y entra acá o en un test el mismo día.** «Un doble que tapa» estaba escrito y volvió a pasar tres veces. `E` *(P4)*

**R36 — Antes de habilitar una escritura, escribir cómo se revierte y quién puede hacerlo.** `D` *(faltante detectado en la revisión)*

> **Cuándo NO aplican.** «Fail-closed» (R2, R26) vale para todo lo que **escribe**; en un módulo de sólo lectura, negar por una variable faltante deja al dueño sin datos y es peor que degradar avisando. R19 no aplica a módulos sin interfaz. Toda excepción se escribe con su motivo.

---

## Traducción a otros destinos

El módulo escribe en una planilla que mantienen personas. Casi todo lo de arriba se traduce, pero no solo:

| En Asistencia (Google Sheets) | En Postgres | En una API externa |
|---|---|---|
| Huella por celda antes de escribir | Columna de versión: `UPDATE … WHERE actualizado_at = $1` | ETag / `If-Match` |
| Pestaña compartida con personas | Tabla con filas de origen humano y filas generadas: la marca de origen decide qué se puede pisar | Recursos que el tercero también modifica |
| El destino releído decide si hay que escribir | `SELECT` antes del `INSERT`, no memoria de la aplicación | `GET` antes del `PUT` |
| «De quién es la pestaña» | «De quién es la fila» | «De quién es el recurso» |
| Auto-candado de pestaña | Cualquier bloqueo que se tome solo y no se libere solo | Circuit breaker que no se cierra |

Los estados de borde también se traducen. En Asistencia son feriado, sábado, día sin calibrar, cuadrilla vacía y fecha futura. En **Compras**: nota de crédito con signo negativo, comprobante sin CUIT, proveedor nuevo, duplicado del mismo número, período fiscal cerrado. En **Finanzas**: saldo negativo, dos monedas, cheque endosado, mes cerrado. En **RRHH**: alta a mitad de quincena, baja, categoría sin convenio.

---

## Checklist de cierre

**Un ítem no se marca con ✔: se marca con la evidencia que lo prueba** — el nombre del test, la consulta contra producción, la línea de log, el `curl` que rebotó. Un ítem sin evidencia escrita cuenta como no cumplido. Esta es la corrección directa al DOD anterior, que estaba 100% marcado y era falso.

### Bloqueantes — sin estos ocho no se cierra nada

| # | Ítem | Evidencia | Fecha |
|---|---|---|---|
| 1 | El cierre lo firma alguien que **no construyó** el módulo *(R1)* | | |
| 2 | Cada prefijo publicado por el proxy tiene archivo:línea que **autentica el origen** *(R2)* | | |
| 3 | Lista escrita de **todos los caminos al efecto crítico**, y cada uno pasa por la guarda *(R28)* | | |
| 4 | El registro de la escritura, **medido en el camino que usa la gente**, trae la evidencia mínima *(R4, R6)* | | |
| 5 | Los dobles **exigen el contrato del original** y parten del estado inicial real *(R5)* | | |
| 6 | Probado el comportamiento **sin la configuración**: falla cerrado *(R2, P10)* | | |
| 7 | Flujo validado en producción **mirando el destino**, no la pantalla *(R3)* | | |
| 8 | Escrito **cómo se revierte** una escritura mal hecha y quién puede hacerlo *(R36)* | | |

### Si aplica — y si no, con el motivo escrito

**Seguridad.** Campos del pedido usados sin re-verificar, listados con qué pasa si el que llama los cambia · secretos ausentes de logs, mensajes y auditoría · probados: usuario sin permiso, ámbito incorrecto, payload manipulado, reenvío, formulario vencido.

**Datos.** Rechazos auditados con motivo distinguible e identificador de pedido · un fallo del ledger deja rastro · todo derivado se corrige hacia abajo · **revisados uno por uno los textos de éxito**: ninguno afirma algo que puede no haber pasado.

**Concurrencia.** Escrito el caso legítimo que repite la clave de idempotencia · verificado que la regla **no está reforzada en otra capa** (índice, restricción, caché) · doble click y ráfaga: una sola mutación · dos usuarios sobre el mismo recurso · escrito qué queda inconsistente si el proceso muere entre confirmar, auditar y escribir.

**Robustez.** Timeout en toda llamada saliente, que cubre la lectura del cuerpo · arranque probado sin cada dependencia · cada guarda automática con su fila de destrabe *(R20)* · cada `catch` hace una de tres: re-lanza, cambia la respuesta al usuario, o lleva un comentario que explica por qué es seguro tragárselo — no hay una cuarta.

**Interacción.** Verificado dónde trabaja hoy quien lo va a usar · ningún formulario ofrece lo que después se rechaza · las opciones salen de la autoridad del dominio · textos nuestros y en castellano, buscado explícitamente texto de la plataforma · listados y probados los **5 estados de borde del negocio de este módulo** · la interfaz se miró, en celular y escritorio.

**Código.** `grep` de importadores sobre lo huérfano; eliminado · sin caminos al efecto crítico sin llamadores · el evento de auditoría, la validación de entrada y el cliente externo tienen **exactamente un constructor cada uno**, verificado con `grep`.

**Pruebas.** Los tres bugs más caros tienen un test que **falla al revertir la corrección** — verificado, no supuesto · todo validador de contrato corre también en producción. *(Suite, typecheck y lint en verde son dato administrativo: la evidencia son los dos ítems anteriores.)*

**Cierre.** Logs revisados post-deploy, con identificadores de pedido y correlación · servicios activos sin reinicios · documentación actualizada **incluidas las limitaciones no corregidas** · plantillas de entorno con todas las variables nuevas y qué se rompe si faltan · este documento actualizado.

---

## Lo que hay que construir

Backlog real, priorizado. Cada ítem convierte una regla en algo que no se puede olvidar.

1. **Test de inventario de puertas** — la lista de caminos al efecto crítico es explícita y falla si alguno no pasa por la guarda. *(R28)*
2. **Auditor de completitud del ledger** — dado un evento de escritura, verificar que trae la evidencia mínima. Corriendo sobre datos reales, habría gritado la misma noche. *(R4, R6)*
3. **Test de suplantación** — un pedido con la identidad de un usuario habilitado **sin credencial de origen** tiene que ser rechazado. *(R2)*
4. **Chequeo de endpoints publicados** — cruzar la configuración del proxy con los manejadores; falla si hay ruta pública sin autenticación declarada. *(R2)*
5. **Test de fidelidad de dobles** — si el original desestructura un campo que el doble ignora, falla. *(R5)*
6. **Guard-tests de veracidad documental**, generalizando el que ya existe. *(R30)*
7. **Chequeo de código muerto** — exports sin importadores. *(R33)*
8. **Chequeo de variables de entorno** — toda variable leída está en la plantilla y viceversa. *(P10)*

---

## Qué hicimos mal

- **Dimos por cerrado un módulo con un agujero crítico y la función principal rota**, con un DOD que se puso los ✔ a sí mismo.
- **Construimos una pantalla web antes de preguntar dónde trabaja la gente**, y dejamos su cadáver con un camino de escritura vivo durante siete horas.
- **Repetimos patrones que ya habíamos escrito.** «Un doble que no respeta el contrato del original no prueba, tapa» estaba en un commit **y volvió a pasar tres veces después**. Escribir la lección no alcanza si no se convierte en checklist o en test — de ahí R35.
- **Duplicamos el constructor del evento de auditoría** teniendo el correcto a un import de distancia.
- **Dejamos una defensa escrita y desconectada**, con una nota que decía exactamente cuándo activarla. Se cumplió la condición y nadie la releyó.
- **Documentamos dos veces el mismo control inexistente**, con doce horas y dos archivos de diferencia.

**¿Qué podríamos haber detectado antes?** Cinco de los treinta y siete, con dos preguntas hechas al empezar: *«¿qué prueba que este pedido viene de quien dice?»* y *«¿este módulo tiene dos caminos al mismo efecto? ¿medí los dos?»*. **Los otros treinta y dos necesitaban a alguien atacando el sistema vivo, o mirando el archivo real.** Esa es la conclusión honesta: no había forma de razonarlos desde el escritorio.

Lo único del proceso que hay que preservar deliberadamente: **los comentarios que explican el porqué**. Este documento se reconstruyó casi entero de ellos.

---

## Cómo usar este documento

- **Antes de empezar un módulo**: leé *Los patrones* y las reglas R1 a R5. Quince minutos.
- **Durante**: cuando una decisión se parezca a un patrón de acá, seguí la regla en vez de volver a razonarla.
- **Al cerrar**: corré el checklist, **con evidencia escrita en cada fila**, y que lo firme alguien que no lo construyó.
- **Después de cada incidente nuevo**, en cualquier módulo: agregalo a la línea de tiempo y, si repite un patrón, **subile el contador**. Un patrón que sube de 4 a 5 es la señal de que hace falta una automatización, no otra lección escrita.

> Un incidente que no deja una regla se va a repetir. Una regla que no deja un test o un ítem de checklist, también.
