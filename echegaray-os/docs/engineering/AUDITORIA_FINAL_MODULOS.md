# Auditoría Final de Módulos

> **Proceso obligatorio antes de cerrar cualquier módulo del Echegaray Business OS.**
> Ninguna regla de este documento es una buena práctica traída de afuera: **cada una existe porque hubo un incidente real**, y cada una cita el incidente que la originó.
>
> **Cierre de módulo, no cierre de obra.** En el `CLAUDE.md` raíz «cierre» significa cierre **de obra** —un evento de negocio con post-mortem propio—. Este documento habla de otra cosa: cuándo un **módulo del OS** está terminado. Cada vez que diga «cierre», dice cierre de módulo.
>
> Fuente de los incidentes: [LECCIONES_APRENDIDAS_ASISTENCIA.md](LECCIONES_APRENDIDAS_ASISTENCIA.md). Las referencias `[n]` remiten a la línea numerada de su línea de tiempo; las `Pn`, a sus patrones.
> Los criterios de aceptación viven en [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md). Este documento define **cómo se audita**; ese, **qué tiene que ser cierto**.

---

## Objetivo

El módulo Asistencia se construyó, se probó con 448 tests propios, se documentó y firmó un DOD con ✔ en cada fila. Después una auditoría independiente le encontró **un agujero de seguridad explotable** —un `curl` anónimo desde Internet pasaba el control de canal y el de permisos `[27]`— y **un bug que rompía la función principal mientras el dueño la usaba y la daba por buena** `[28]`.

De los treinta y ocho defectos registrados, **los que encontró un test son cero**.

Este proceso existe para que ese resultado no se repita en Compras, RRHH, Finanzas ni Obras. No agrega ceremonia: agrega las etapas que faltaban, y elimina la que no servía —el checklist de ✔ que se marcaba a sí mismo.

**Cuándo aplica.** A todo módulo que escriba datos, mueva dinero, toque una obligación laboral o fiscal, o publique un borde accesible desde fuera de la máquina. Un módulo de sólo lectura corre el proceso reducido que se indica al final.

---

## Principio rector

Un módulo **no** queda cerrado porque compile, porque pasen los tests, porque tenga documentación o porque el DoD esté marcado. El módulo de Asistencia cumplía las cuatro cosas la noche en que estaba roto y abierto a Internet.

> **Un módulo queda cerrado únicamente cuando existe evidencia verificable por un tercero de que puede operar correctamente en producción.**

Tres consecuencias que mandan sobre todo lo demás:

1. **La evidencia es del efecto, no del intento.** La celda escrita en la planilla, la fila en la base, el evento de auditoría con su contenido. No la pantalla que dijo que sí `[28]`.
2. **La evidencia la produce alguien que no escribió el código.** Ver *Independencia*.
3. **Una afirmación sin evidencia adjunta cuenta como incumplida.** No como pendiente: como incumplida.

---

## Independencia

> **Regla obligatoria: ningún módulo lo cierra quien lo construyó.**

En Asistencia, la misma inteligencia escribió el código, escribió los tests, escribió el DOD y se puso los ✔. **No hubo ningún par de ojos que no tuviera interés en que el módulo estuviera terminado.** Ése es el hallazgo estructural del proyecto, y explica los defectos mejor que cualquier regla técnica.

### Los cuatro roles

| Rol | Quién | Qué hace | Qué NO puede hacer |
|---|---|---|---|
| **Construye** | La sesión o agente que desarrolla el módulo | Escribe código, tests y documentación funcional. Declara los límites que conoce | Firmar su propio cierre. Marcar su propia evidencia |
| **Audita** | Una sesión o agente **distinto**, sin haber escrito una línea del módulo | Corre las cinco auditorías de abajo **intentando romper el sistema**. Produce hallazgos con evidencia | Corregir lo que encuentra (separar hallazgo de corrección evita el sesgo de «lo arreglo y ya está») |
| **Valida** | Quien despliega y prueba **contra producción real** | Ejecuta el recorrido del usuario y **verifica el efecto en el destino**. Guarda la evidencia | Validar mirando la pantalla en vez del destino `[28]` |
| **Autoriza** | **El dueño**, siempre | Declara el cierre. Acepta explícitamente los límites que quedan abiertos | Delegarlo mientras el módulo tenga efecto económico, fiscal, laboral o externo |

**Por qué el dueño autoriza y no puede delegarse.** El `CLAUDE.md` raíz define que el Nivel E —ejecutar con efecto económico, contractual, fiscal, laboral, legal o comunicacional externo— requiere autorización humana explícita. Cerrar un módulo que escribe jornales *es* habilitar ese nivel. No es una formalidad: es la misma regla que ya rige el resto del OS.

**Por qué el auditor no corrige.** En Asistencia el que encontraba un defecto lo arreglaba en el acto, y dos veces la corrección introdujo el defecto siguiente —una a los once minutos, otra a los veintitrés `[11]` `[14]` `P11`. Separar los roles no es burocracia: es lo que obliga a mirar qué más depende de lo que se toca.

**Si no hay dos sesiones disponibles.** El auditor puede ser la misma persona o agente en una sesión nueva **sin el contexto de la construcción**, trabajando sólo contra el repositorio y el sistema vivo, y con la consigna explícita de romperlo. Es un sustituto pobre pero real: la mayoría de los hallazgos graves de Asistencia salieron de atacar producción, no de recordar cómo se había escrito el código.

---

## Evidencia

**Queda eliminado el checklist de ✔.** El DOD de Asistencia estaba marcado al 100% y afirmaba tres controles falsos, entre ellos *«se puede reconstruir quién escribió qué celda, cuándo, y qué había antes ✔»* — un control que estuvo **ciego justo para la interfaz que usa la gente** `[30]`, porque el ✔ se había tomado midiendo el otro camino.

Todo punto se documenta con cinco columnas:

| Ítem | Evidencia | Método de validación | Fecha | Resultado |
|---|---|---|---|---|
| Qué se afirma | El dato concreto que lo prueba | Cómo se obtuvo, reproducible por otro | Cuándo | CUMPLE / NO CUMPLE / NO APLICA + motivo |

**Qué cuenta como evidencia.** Un identificador de test que falla al revertir la corrección. Una consulta contra la base de producción con su resultado. Una línea de log con su marca de tiempo. Un `curl` con su respuesta. Un rango de celdas leído del destino. La salida de un `grep` sobre todo el repositorio.

**Qué NO cuenta.** «Revisado». «Probado». «Funciona». «Se verificó». La suite en verde — Asistencia tenía 1.568 tests en verde la noche del agujero: **el número de tests no fue una defensa, fue lo que sostuvo el ✔**.

**Regla de la evidencia circular.** Ninguna evidencia puede producirse con el mismo código que generó lo que se verifica. Si el módulo escribe con una función, el control lee el destino con una consulta independiente y compara. Es el defecto que en el Flujo de Fondos hizo perder $292,8M invisibles y que se repitió acá `[30]` — *un control que se compara contra sí mismo no es un control*.

---

## Auditoría funcional

La ejecuta el rol **Audita**, sobre el sistema desplegado. Su consigna no es verificar que anda: es **encontrar el camino por el que se rompe**.

| Qué se revisa | Qué se busca exactamente | De dónde sale |
|---|---|---|
| **Flujo completo** | Recorrerlo entero como el usuario, hasta ver el efecto en el destino | `[28]` |
| **Caminos alternativos** | Enumerar **todas** las puertas de entrada al efecto y recorrer cada una. En Asistencia eran cuatro, y una no pasaba por la guarda `[29]` | `P6` |
| **Cancelaciones** | Cancelar en cada paso; que el estado quede coherente y el mensaje diga la verdad | *sin incidente propio: se cubre por el patrón del mensaje que miente* |
| **Reintentos** | Reintentar después de un error: ¿el sistema deja? En Asistencia el mensaje decía «volvé a intentar» al lado de un botón que ya no podía funcionar | `[7]` `[20]` |
| **Errores** | Provocar el fallo de cada dependencia externa y leer **el texto que ve el usuario** | `[7]` |
| **Concurrencia** | Dos usuarios sobre el mismo recurso; doble click; ráfaga de acciones | `✱14` |
| **Estados inválidos** | Intentar llegar a un estado que el sistema considera imposible. Si se puede, el diseño está mal, no la validación | `[23]` |
| **UX** | ¿El formulario deja elegir algo que después se rechaza? ¿Hay texto que no escribimos nosotros? | `[23]` `[24]` |
| **Formularios** | Cada opción ofrecida tiene que venir de la autoridad del dominio, no de una lista escrita en la pantalla | `[34]` `P8` |
| **Permisos** | Un usuario sin permiso, por cada puerta | `[29]` |
| **Sesiones** | Sesión ajena, vencida, inexistente, y **dos interfaces abiertas a la vez** | `[33]` |
| **Producción** | Todo lo anterior contra el sistema real, no contra dobles | `[19]` `[27]` |

**Casos de borde del negocio.** Antes de auditar hay que listar los **cinco estados de borde de este módulo** y probarlos. En Asistencia eran feriado, sábado, día sin jornada calibrada, cuadrilla vacía y fecha futura — y dos de ellos rompían el formulario `[31]`. Traducciones: en Compras, nota de crédito con signo negativo, comprobante sin CUIT, proveedor nuevo, duplicado del mismo número, período fiscal cerrado. En Finanzas, saldo negativo, dos monedas, cheque endosado, mes cerrado. En RRHH, alta a mitad de quincena, baja, categoría sin convenio.

**Mirar, no sólo leer.** Siete defectos de Asistencia sólo aparecieron **mirando** la interfaz: un atributo que perdía contra una regla de CSS dejaba 48 controles a la vista en una cuadrilla de 16; un aviso de éxito se borraba solo `[13]` `P7`. Ninguna suite estática los vio. Si el módulo tiene interfaz, se mira, en celular y en escritorio.

---

## Auditoría técnica

| Qué se revisa | Qué se busca exactamente | De dónde sale |
|---|---|---|
| **Código muerto** | `grep` de importadores sobre todo lo huérfano. En Asistencia sobrevivieron 981 líneas de una pantalla descartada, **con un camino de escritura vivo y sin puerta delante** | `[26]` |
| **Deuda técnica** | La que bloquea al módulo siguiente, no la cosmética. Se registra con su costo, no se arrastra en silencio | *heredado: el propio módulo registró 553 líneas como «registrado, no forzado»* |
| **Duplicaciones** | El evento de auditoría, la validación de entrada y el cliente externo tienen **exactamente un constructor cada uno**, verificado con `grep` | `[30]` |
| **Contratos** | Cada llamada a un módulo ajeno usa los nombres de parámetro que el original desestructura. `postId` contra `id` costó `PUT /posts/undefined` durante horas | `[28]` |
| **Logs** | ¿Alcanzan para diagnosticar sin reproducir? ¿Llevan identificador de pedido y de correlación? ¿Imprimen datos personales o secretos? | `[22]` `[36]` |
| **Timeouts** | Toda llamada saliente, con techo que **cubre también la lectura del cuerpo** y limpia su timer en éxito, error y excepción | `[35]` |
| **Locks** | ¿Algún camino deja un lock tomado si tira una excepción? ¿Hay algún bloqueo que se tome solo y **no se libere solo**? | `[19]` `P5` |
| **Rollback** | Qué queda a medias si el proceso muere entre confirmar, auditar y escribir. Si no puede ser atómico, se escribe la ventana | `✱14` |
| **Idempotencia** | Escribir el caso legítimo que produce la misma clave dos veces. Y verificar que la regla **no está reforzada en otra capa** (índice, restricción, caché) | `[7]` `[20]` `[21]` |
| **Observabilidad** | Un fallo del propio sistema de auditoría **deja rastro**. En Asistencia el ledger podía dejar de escribir sin una línea de log | `[36]` |
| **Mantenibilidad** | Archivos ≤500 líneas y funciones ≤50, o justificado por escrito. Sin inversión de capas | *heredado del `CLAUDE.md` técnico, no de un incidente* |

**La pregunta que atrapa la familia entera.** *¿Este defecto está en el módulo, o una capa más abajo?* Cinco defectos de Asistencia vivían fuera: en el portón central de escritura, en el driver de Postgres, en el firewall del host, en los logs de Mattermost `P3`. Un test del módulo no podía verlos.

---

## Auditoría de seguridad

**Es obligatorio intentar romper el sistema**, contra el sistema vivo. La auditoría de seguridad de Asistencia no encontró nada leyendo código: encontró el agujero crítico con un `curl` `[27]`.

| Qué se revisa | Qué se busca exactamente | De dónde sale |
|---|---|---|
| **Autenticación** | Por cada prefijo publicado, **archivo y línea del manejador que autentica el origen**. Un prefijo sin línea es un hallazgo, no una pendiente | `[27]` |
| **Autorización** | Que el permiso se evalúe **después** de probar la identidad. Antes de eso no controla nada | `[27]` |
| **Spoofing** | Mandar un pedido con la identidad de un usuario habilitado **sin credencial de origen**. Tiene que rebotar | `[27]` |
| **Replay** | Reenviar el mismo pedido: una sola mutación | `✱14` |
| **Manipulación de payloads** | Listar **cada campo del pedido que se usa sin re-verificar contra el servidor** y responder qué pasa si el que llama lo cambia | `[27]` |
| **Validaciones** | Que la última palabra la tenga el núcleo, no la interfaz, y que no se haya relajado al mejorar la pantalla | `[23]` |
| **Callbacks** | Un callback entrante de una plataforma externa **no trae identidad por sí solo**. Qué prueba que viene de quien dice | `[27]` |
| **Secretos** | Ausentes de logs, mensajes de error y auditoría. Comparados en tiempo constante | `[27]` |
| **Permisos** | Probar cada puerta con un usuario sin permiso | `[29]` |
| **Exposición accidental** | Qué devuelve un error interno: ¿nombres de tablas, rutas, stacks? | `[7]` — un error del driver de Postgres filtró nombres de tablas internas al chat |
| **Endpoints públicos** | **Abrir la configuración del proxy y listar los prefijos publicados.** La superficie pública no se ve leyendo la aplicación | `[27]` |
| **Timeouts** | Techo de cuerpo, de tiempo y de conexión en el borde entrante | `[35]` |

**La pregunta que ordena todo el capítulo**, y que en Asistencia nadie hizo para una de las puertas:

> **Antes de preguntar «¿puede esta persona?», hay que poder responder «¿es esta persona?».**

**Y una trampa específica del ledger.** Ningún campo de auditoría puede afirmar una verificación que el código no hace. En Asistencia la auditoría registraba `identidad_verificada: true` para una identidad que nadie había verificado `[27]`.

---

## Auditoría en producción

Es la etapa que en Asistencia no existía y que habría atrapado casi todo lo grave.

**Qué debe verificarse, sin excepción:**

1. **El recorrido completo del usuario**, por el camino real, en el sistema real.
2. **El efecto en el destino.** Leer la celda, la fila o el registro que se acaba de escribir, **con una herramienta distinta de la que escribió**. Que el usuario diga que anduvo no prueba que anduvo `[28]`.
3. **El registro de auditoría de esa operación**, con su contenido: qué se tocó, qué había antes, qué quedó. Y verificado **en el camino que usa la gente** `[30]`.
4. **Los logs posteriores al despliegue**: cero errores nuevos, y con identificador de pedido y de correlación.
5. **Los servicios**: activos y sin reinicios.
6. **El comportamiento sin la configuración**: sacar la variable y comprobar que falla cerrado. Cuatro variables de Asistencia apagaban el módulo en silencio — el sistema arrancaba, publicaba, respondía 200 y no hacía nada `[37]` `P10`.
7. **Un intento de suplantación**, que tiene que rebotar `[27]`.

**Qué evidencia se guarda:** el identificador del registro escrito y su lectura posterior; la consulta al ledger con su salida; las líneas de log relevantes con marca de tiempo; la respuesta del intento de suplantación; el estado de los servicios.

**Qué no puede omitirse nunca:**

- La verificación **en el destino**, no en la pantalla.
- La prueba **sin la configuración**.
- El intento de **suplantación**.
- La **limpieza** de lo que la prueba haya creado.

**Cómo se prueba sin ensuciar datos reales.** Asistencia lo resolvió bien y hay que copiarlo: se diseñó un caso con **efecto cero** —una carga cuyo plan no escribía ninguna celda— para ejercitar el recorrido entero sin tocar el dato. Cuando no exista un caso de efecto cero, se prueba sobre un registro cuyo valor ya coincide con el que se va a escribir. **Nunca se valida con un script aislado que simule el éxito**: se valida por el mismo camino que usa la persona.

---

## Auditoría documental

Verifica que **la documentación describa el sistema real y no uno imaginado**. En Asistencia, la documentación afirmó cinco veces un control que no existía `P2`, y dos de esas veces con doce horas de diferencia, en archivos distintos, sobre el mismo control inexistente.

| Qué se busca | Cómo | De dónde sale |
|---|---|---|
| **Controles inexistentes** | Por cada afirmación de control, exigir el comando que la verifica. Sin comando, se borra la afirmación o se construye el control | `[8]` `[30]` |
| **Afirmaciones falsas** | Releer los encabezados de cada módulo contra su propio código, empezando por los que declaran quién puede hacer qué | `[4]` |
| **Documentación obsoleta** | Toda decisión revertida deja texto atrás. Buscar el nombre de lo eliminado en comentarios, plantillas y configuración | `[12]` `[26]` |
| **Rutas eliminadas** | Cruzar lo que la configuración del proxy dice que publica contra lo que el servicio efectivamente atiende | `[26]` |
| **Comentarios muertos** | Un comentario que describe un diseño anterior es una afirmación falsa con otro formato | `[4]` |
| **Variables de entorno** | Toda variable leída está en la plantilla, y toda variable de la plantilla se lee. Con **qué se rompe si falta** | `[37]` |
| **Límites declarados** | Los que quedan abiertos están escritos **sin disfrazarlos**, y el que autoriza los acepta explícitamente | `✱14` |

**El artefacto que inventó este proyecto y hay que generalizar:** un **guard-test de veracidad documental** — un test que falla si aparece un llamador productivo de una primitiva que la documentación declara inactiva, *para que activarla obligue a corregir el texto en vez de dejarlo mintiendo*. En Asistencia se escribió uno y se probó contra un canario.

---

## Auditoría de aprendizaje

Un módulo cerrado que no deja aprendizaje no está cerrado: está abandonado. Al cierre se produce, obligatoriamente:

1. **Lecciones aprendidas**, con la estructura de [LECCIONES_APRENDIDAS_ASISTENCIA.md](LECCIONES_APRENDIDAS_ASISTENCIA.md): problema, impacto, causa raíz, cómo se detectó, corrección, regla.
2. **Patrones**, cruzados contra el *Catálogo* de este documento. Si un patrón ya existe, **se le sube el contador**; si es nuevo, se agrega con su descripción, detección, prevención y automatización futura.
3. **Reglas permanentes**, clasificadas según el estándar del `CLAUDE.md` raíz: **A** observación aislada · **B** recurrencia · **C** patrón probable · **D** conocimiento interno validado · **E** regla operativa aprobada. Una A **nunca** se convierte en regla general sin validación explícita del dueño.
4. **Automatizaciones futuras**, al backlog, con el patrón que cada una cierra.
5. **Tests que faltaban**: para los tres defectos más caros, el test que habría fallado. Verificado revirtiendo la corrección.

**El umbral que dispara acción.** Cuando un patrón llega a **cinco apariciones**, deja de ser una lección escrita y pasa a ser una automatización obligatoria en el backlog. Escribir la lección no alcanzó: *«un doble que no respeta el contrato del original no prueba, tapa»* estaba escrito en un commit **y volvió a pasar tres veces después** `P4`.

---

## Qué protege cada bloqueante, en plata

Ninguna capacidad del OS se justifica sola: tiene que decir qué margen protege, qué caja, qué riesgo. Los ocho bloqueantes del DoD, traducidos:

| Bloqueante | Qué protege |
|---|---|
| Firma de quien no construyó | La etapa de mayor rendimiento medido: **14 de 38 defectos**, incluido un agujero explotable |
| Autenticación del origen | Que un tercero escriba jornales a nombre de un habilitado. **Un jornal falso es salario liquidado de más y costo imputado a la obra equivocada** |
| Inventario de caminos al efecto | Que una puerta nueva entre sin control al mismo dato |
| Registro medido en el camino real | Sin evidencia celda por celda **no se puede reconstruir ni corregir un error de liquidación**: los eventos viejos no se recuperan |
| Doble no más permisivo | La falsa confianza: 4 defectos vivos con la suite en verde |
| Comportamiento sin configuración | Que el módulo arranque, responda 200 y **no haga nada**, sin que nadie se entere |
| Validación mirando el destino | Que el operador se vaya convencido de que cargó cuando no cargó |
| Cómo se revierte | Que un dato mal escrito en una planilla compartida **no tenga vuelta atrás** |

La cadena que protegen es la misma: **jornal → salario UOCRA → costo de obra → margen → caja**. Un error acá no se ve hasta que el margen de la obra ya está mal.

---

## Criterios de cierre

Un módulo se declara cerrado cuando **las cinco auditorías tienen su evidencia** y el dueño autoriza. No antes, y por ninguna otra razón.

**Frases prohibidas en un cierre**, porque las cuatro fueron ciertas en Asistencia la noche en que estaba roto: *«parece funcionar»*, *«todo OK»*, *«ya está»*, *«los tests pasan»*.

**Los estados de un módulo, el estado de excepción para cuando aprieta el plazo, y el proceso reducido de sólo lectura viven en el [DoD](DEFINITION_OF_DONE.md)**, que es el artefacto que se completa. Acá sólo el criterio: **«cerrado con límites» es el estado normal y honesto** — Asistencia cerró así, con cuatro límites escritos. Un módulo sin límites declarados es sospechoso: casi siempre significa que no se buscaron.

**Qué obliga a reabrir:** cualquier defecto que contradiga una evidencia registrada, cualquier hallazgo de seguridad, y cualquier caso en que el sistema haya afirmado algo que no pasó.

---

## Catálogo de patrones

**Vive en un solo lugar**: la sección *Los patrones* de [LECCIONES_APRENDIDAS_ASISTENCIA.md](LECCIONES_APRENDIDAS_ASISTENCIA.md), con su numeración `P1`–`P16` y su frecuencia medida. Tener dos catálogos con numeraciones distintas garantizaba que los contadores se desincronizaran en el segundo módulo — y son los contadores los que disparan trabajo obligatorio.

**Al cerrar un módulo:** cruzar los hallazgos contra ese catálogo, **subir el contador** del patrón que se repitió o **agregar el patrón nuevo** con su descripción, cómo detectarlo, cómo prevenirlo y qué automatización lo cerraría. La columna «cómo detectarlo» tiene que contener **un comando o un barrido**; donde no exista, se escribe *«sin detección automática — se busca a mano en tal paso»*, que es honesto.

**El umbral:** un patrón que llega a **cinco apariciones** deja de ser lección escrita y pasa a automatización obligatoria en el backlog. Escribir la lección no alcanzó — *«un doble que no respeta el contrato del original no prueba, tapa»* estaba en un commit **y volvió a pasar tres veces después**.

---

## Automatizaciones recomendadas

Sólo documentadas. Cada una cierra un patrón del catálogo y ninguna se implementa en este incremento.

| Prioridad | Automatización | Cierra | Qué haría |
|---|---|---|---|
| 1 | **Test de inventario de puertas** | P10 | La lista de caminos al efecto crítico es explícita; falla si alguno no pasa por la guarda |
| 2 | **Auditor de completitud del ledger** | P2 | Dado un evento de escritura, verifica que trae la evidencia mínima. Sobre datos reales |
| 3 | **Test de suplantación** | P8 del catálogo de seguridad | Un pedido con identidad válida y sin credencial de origen tiene que rebotar |
| 4 | **Detector de rutas sin autenticación** | P1 seguridad | Cruza los prefijos publicados por el proxy con los manejadores; falla si hay uno público sin autenticación declarada |
| 5 | **Detector de llamadas sin timeout** | `[35]` | Marca todo `fetch` sin `AbortController` en código que corre dentro de un manejador de pedidos |
| 6 | **Test de fidelidad de dobles** | P4 | Falla si el original desestructura un campo que el doble ignora |
| 7 | **Detector de contratos usados sólo por tests** | P5 | Exports cuyos únicos llamadores están en `*.test.*` |
| 8 | **Detector de código muerto** | P7 | Exports sin importadores |
| 9 | **Cruce de variables de entorno** | P11 | Toda variable leída está declarada y viceversa |
| 10 | **Detector de endpoints sin auditoría** | `[30]` | Manejadores que escriben y no emiten evento |
| 11 | **Detector de documentación inconsistente** | P3 | Afirmaciones de control sin comando de verificación asociado |

**Criterio de construcción.** Se construye la automatización de un patrón cuando llega a **cinco apariciones**, o antes si su costo es menor a una hora. No se construyen todas juntas: cada una tiene que justificar su existencia con el defecto que evita, igual que cualquier otra capacidad del OS.

---

## El DOD anterior queda superado

`orquestador/comunicacion/docs/DOD-ASISTENCIA.md` sigue en el repositorio con su veredicto «MÓDULO ASISTENCIA — CERRADO». **Queda marcado como SUPERADO**: se conserva como evidencia histórica —su §3, §13 y §17 tienen evidencia genuina que el formato nuevo aprovecha— pero **su veredicto no vale**, y el módulo se re-cierra con el DoD nuevo. Dejarlo vigente incumpliría la fila F1 de este mismo proceso.

---

## Integración con el proceso de desarrollo

El flujo oficial de un módulo del Business OS pasa a ser:

```
ENTENDER EL PROCESO REAL  →  CONSTRUIR  →  AUDITAR (independiente)  →  CORREGIR
        →  VALIDAR EN PRODUCCIÓN  →  APRENDER  →  AUTORIZAR EL CIERRE
```

**Reglas del flujo:**

1. **No hay merge final sin las cinco auditorías con su evidencia.** El [DoD](DEFINITION_OF_DONE.md) es el artefacto que las recoge.
2. **Auditar y corregir son dos pasos, y los hace gente distinta.**
3. **Validar en producción es obligatorio y se hace mirando el destino.**
4. **El aprendizaje se produce antes de autorizar**, no después. Un módulo cerrado sin lecciones vuelve a auditoría.
5. **El dueño autoriza**, y acepta explícitamente cada límite abierto.

**Proceso reducido y estado de excepción**: los define el [DoD](DEFINITION_OF_DONE.md), fila por fila. No se asumen: se escriben con su motivo.

**Qué se hereda del `CLAUDE.md` raíz y no se repite acá:** la clasificación A–E del aprendizaje, el principio de que el Nivel E requiere autorización humana explícita, la prohibición de fabricar datos, y los límites de código. Este documento los aplica; no los redefine.

---

*Este proceso nació de los 38 incidentes del módulo Asistencia (30–31/07/2026). Cada regla cita el suyo. Si una regla de acá no se puede rastrear a un incidente real, sobra: borrala.*

---

## Registro · Cierre funcional post-auditoría + addendum Horas Hombre (21–22/08/2026)

| Campo | Valor |
|---|---|
| Módulo | Circuito productivo completo (cascada XLSM · estándar versionado · conversión con fechas · HH/causas · aprendizaje · forecast · cómputo) + pantallas 04/10/20/21/24/27 + mobile M01/M05 + seguridad económica/drive_index/auditoría + períodos HH + consolidación §31 |
| Construyó | 15 agentes ejecutores en worktrees, coordinados por la sesión 6f1ea72c (21–22/08) |
| Auditó | `auditor-de-cierre` con contexto nuevo — **RECHAZÓ** el primer cierre (candado del congelado con cuatro puertas abiertas: INSERT de partida, DELETE de cabecera, re-parentado, descongelado a mano) reproduciendo los ataques como `authenticated` real; corregido con `20260822T1200` y sus contraejemplos convertidos en tests |
| SHA | `49b73432` → el commit de cierre de esta fila |
| Evidencia | caso controlado 13/13 (`orquestador/lib/caso-controlado-circuito.pg.test.mjs`, evidencia impresa + rollback) · suite 8.359/0 · build verde · QA visual 56 capturas, 22 combos, 0 errores de consola · sondas en vivo de cada migración con rol asumido |
| Límites aceptados y abiertos | forecast económico sin dato real que calcular (cotizaciones reales = 0) · aprendizaje sin muestra real (job 11:20 corre desde hoy; siembra XLSM sin mapeo de tarea a propósito) · cadena de migraciones NO re-aplicable en base virgen (helper de dos épocas la esquiva en la viva) · pantallas del circuito (8 campos, configurador, botones 17) sin QA visual propio · `campo` lee estructura de costos vía vistas nuevas (decisión del dueño) |
| **Valida / Autoriza** | **PENDIENTE DEL DUEÑO** — A3: usar el circuito cinco minutos, en su celular, con un caso real; y aceptar por escrito los límites de arriba. Además: confirmar `monto_contratado` de san-francisco ($204.361.104) contra el contrato — la bitácora registró 26 escrituras de prueba sin sesión que el enmascarado no permite reconstruir |
