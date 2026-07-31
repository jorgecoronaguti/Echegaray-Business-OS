# Definition of Done — Echegaray Business OS

> **DoD oficial del proyecto.** Reemplaza a todo checklist de ✔ anterior, empezando por el del módulo Asistencia, que estaba marcado al 100% y afirmaba tres controles falsos.
>
> El proceso que produce estas evidencias está en [AUDITORIA_FINAL_MODULOS.md](AUDITORIA_FINAL_MODULOS.md). Los incidentes que originan cada criterio, en [LECCIONES_APRENDIDAS_ASISTENCIA.md](LECCIONES_APRENDIDAS_ASISTENCIA.md); las referencias `[n]` remiten a su línea de tiempo.
>
> **Cómo se usa:** se copia este archivo a `docs/engineering/dod/DOD-<MÓDULO>.md`, se completa fila por fila, y se archiva firmado. Un DoD sin completar no es un DoD: es una intención.

---

## La regla que hace distinto a este DoD

Un criterio **no se marca: se prueba**. Cada fila lleva cinco columnas y ninguna es opcional:

| Columna | Qué va |
|---|---|
| **Criterio** | Qué se afirma |
| **Evidencia** | El dato concreto que lo prueba, **reproducible por un tercero** |
| **Método** | Cómo se obtuvo esa evidencia |
| **Fecha** | Cuándo |
| **Resultado** | `CUMPLE` · `NO CUMPLE` · `NO APLICA` + motivo escrito |

**Una fila sin evidencia cuenta como NO CUMPLE.** No como pendiente.

**Evidencia válida:** el nombre de un test que falla al revertir la corrección · una consulta a producción con su salida · una línea de log con su marca de tiempo · un `curl` con su respuesta · el valor leído del destino · la salida de un `grep` sobre todo el repositorio.

**Evidencia inválida:** «revisado», «probado», «funciona», «se verificó», y **la suite en verde** — Asistencia tenía 1.568 tests pasando la noche en que estaba rota y abierta a Internet.

**Regla de la evidencia circular.** Ninguna evidencia se produce con el mismo código que generó lo que se verifica. Si el módulo escribe con una función, el control lee el destino con una consulta independiente y compara `[30]`.

---

## Encabezado del DoD

| | |
|---|---|
| **Módulo** | |
| **Efecto** | escribe datos / mueve dinero / obligación laboral o fiscal / sólo lectura |
| **Construyó** | |
| **Auditó** *(no puede ser quien construyó)* | |
| **Validó en producción** | |
| **Autorizó el cierre** *(el dueño)* | |
| **Estado final** | En auditoría / Cerrado con límites / Cerrado |
| **Proceso aplicado** | Completo / Reducido *(y por qué)* |

---

## A · Independencia y autorización

*Sin estas tres filas no se evalúa nada más.*

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| A1 | Quien firma la auditoría **no escribió una línea** del módulo | Nombre del rol auditor, distinto del constructor | | | |
| A2 | El dueño **autorizó explícitamente** el cierre y aceptó cada límite abierto | Autorización registrada, con la lista de límites que aceptó | | | |
| A3 | Los límites que quedan abiertos están **escritos sin disfrazarlos** | Sección de límites del módulo, con su riesgo declarado | | | |

> **Por qué.** En Asistencia la misma inteligencia escribió el código, los tests y el DOD, y se puso los ✔. No hubo ningún par de ojos sin interés en que estuviera terminado.

---

## B · El efecto, verificado en el destino

*El corazón del DoD. Si estas filas no están, el módulo no se cerró: se dio por cerrado.*

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| B1 | El recorrido completo del usuario se ejecutó **en producción, por el camino real** | Recorrido manual o script que usa el mismo endpoint que la persona | | | |
| B2 | El efecto se verificó **leyendo el destino** con una herramienta distinta de la que escribió | Valor leído de la celda / fila / registro, con su identificador | | | |
| B3 | La operación dejó **registro con evidencia**: qué se tocó, qué había antes, qué quedó | Consulta al ledger con su salida | | | |
| B4 | Ese registro se verificó **en el camino que usa la gente**, no en el más fácil de probar | Identificación del camino medido, y de los otros caminos si existen | | | |
| B5 | Se limpió lo que la prueba haya creado | Confirmación del borrado | | | |

> **Por qué B1 y B2.** El dueño usó Asistencia, vio responder OK y estaba rota: salía `PUT /posts/undefined → 400`, el error iba al log y la respuesta era 200 igual `[28]`. **Que el usuario diga que anduvo no prueba que anduvo.**
> **Por qué B4.** El DOD afirmaba «se puede reconstruir quién escribió qué celda ✔» y ese control estaba ciego justo para la interfaz real `[30]`.
> **Cómo probar sin ensuciar:** un caso de **efecto cero** (un plan que no escribe ninguna celda) o un registro cuyo valor ya coincide con el que se va a escribir. **Nunca un script aislado que simule el éxito.**

---

## C · Seguridad

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| C1 | Cada prefijo publicado tiene **archivo:línea del manejador que autentica el origen** | Configuración del proxy + `grep` de los manejadores | | | |
| C2 | Un pedido con identidad válida y **sin credencial de origen** rebota | Intento de suplantación con su respuesta | | | |
| C3 | Están listados **todos los campos del pedido usados sin re-verificar**, con qué pasa si el que llama los cambia | Lista con su análisis | | | |
| C4 | El comportamiento **sin la configuración** falla cerrado | Arranque sin la variable, con la respuesta obtenida | | | |
| C5 | Probados: usuario sin permiso, ámbito incorrecto, payload manipulado, reenvío, formulario vencido | Un intento por caso, con su respuesta | | | |
| C6 | Ningún secreto aparece en logs, mensajes de error ni auditoría | `grep` sobre logs y sobre el payload de auditoría | | | |
| C7 | Ningún campo de auditoría afirma una verificación que el código no hace | Revisión del constructor del evento | | | |

> **Por qué.** Un `curl` anónimo desde Internet pasaba el control de canal y el de permisos, porque la identidad salía del payload `[27]`. **Antes de preguntar «¿puede esta persona?», hay que poder responder «¿es esta persona?».**

---

## D · Caminos y puertas

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| D1 | Está escrita la **lista de todos los caminos** que llegan al efecto crítico | Enumeración explícita | | | |
| D2 | **Cada uno** pasa por la misma guarda, verificado camino por camino | Un intento por camino con su respuesta | | | |
| D3 | Si se agregó una puerta a un efecto existente, se listaron **las defensas del camino viejo** una por una | Lista comparada | | | |

> **Por qué.** «Un camino nuevo hacia el mismo efecto no hereda las defensas del viejo: hay que ir a buscarlas una por una. Las tres cosas que faltaban existían y estaban a un import de distancia» `[29]`.

---

## E · Concurrencia, idempotencia y rollback

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| E1 | Está escrito **el caso legítimo que produce la misma clave de idempotencia dos veces** | Análisis; si existe, el alcance está mal | | | |
| E2 | La regla de idempotencia **no está reforzada en otra capa** (índice, restricción, caché) | `grep` + revisión de migraciones | | | |
| E3 | Doble click y ráfaga: **una sola mutación** | Prueba con su resultado | | | |
| E4 | Dos usuarios sobre el mismo recurso: sin pisarse | Prueba con su resultado | | | |
| E5 | La decisión de escribir se toma contra **el destino releído** | Ubicación de la relectura | | | |
| E6 | Está escrito **qué queda inconsistente** si el proceso muere entre confirmar, auditar y escribir | Ventana declarada | | | |
| E7 | Está escrito **cómo se revierte** una escritura mal hecha y quién puede hacerlo | Procedimiento de reversión | | | |

> **Por qué E1 y E2.** La misma protección se corrigió **tres veces en doce horas, en tres capas** `[7]` `[20]` `[21]`: arreglarla arriba no cerró nada porque la de abajo la reforzaba.
> **Por qué E7.** Un módulo que escribe en una planilla compartida con personas tiene que responder «¿y cómo lo saco?» antes de habilitarse.

---

## F · Robustez

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| F1 | Toda llamada saliente tiene timeout que **cubre la lectura del cuerpo** y limpia su timer en éxito, error y excepción | Revisión del cliente | | | |
| F2 | El arranque **sin cada dependencia** degrada; no entra en crash-loop | Prueba de arranque con la dependencia caída | | | |
| F3 | Cada guarda automática tiene su fila: **falso positivo → qué se rompe → cómo se destraba → quién puede** | Inventario de guardas | | | |
| F4 | Ningún error de una llamada externa termina en respuesta de éxito | Revisión de los `catch` | | | |
| F5 | Cada `catch` hace una de tres: re-lanza, cambia la respuesta al usuario, o lleva un comentario que explica por qué es seguro tragárselo | `grep` de `catch` con su clasificación | | | |
| F6 | Un fallo del propio sistema de auditoría **deja rastro** | Prueba forzando el fallo del ledger | | | |

> **Por qué F3.** La firma de pestaña auto-candó JORNALES y convirtió un falso positivo en una falla permanente `[19]`. **Si el destrabe requiere un deploy o una migración, la guarda no se activa automáticamente.**

---

## G · Interacción *(si el módulo tiene interfaz)*

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| G1 | Se verificó **dónde trabaja hoy** quien lo va a usar, antes de elegir la superficie | Constancia de la decisión | | | |
| G2 | Ningún formulario ofrece algo que después se rechaza | Prueba de la combinación inválida: no se puede seleccionar | | | |
| G3 | Las opciones ofrecidas salen de **la autoridad del dominio**, no de una lista propia | Ubicación de la fuente | | | |
| G4 | Todos los textos son nuestros y están en castellano rioplatense | Búsqueda explícita de texto de la plataforma | | | |
| G5 | Se listaron y probaron **los cinco estados de borde del negocio** de este módulo | Los cinco, con su resultado | | | |
| G6 | La interfaz **se miró**, en celular y en escritorio | Captura o descripción de lo observado | | | |

> **Por qué G1.** Se construyó una pantalla web y se descartó a los 45 minutos: la gente ya trabajaba dentro de Mattermost `[12]`.
> **Por qué G6.** Siete defectos sólo aparecieron mirando: un atributo perdía contra una regla de CSS y dejaba 48 controles a la vista en una cuadrilla de 16 `[13]`.
> **Estados de borde por dominio.** Asistencia: feriado, sábado, día sin calibrar, cuadrilla vacía, fecha futura. Compras: nota de crédito con signo negativo, comprobante sin CUIT, proveedor nuevo, duplicado del mismo número, período fiscal cerrado. Finanzas: saldo negativo, dos monedas, cheque endosado, mes cerrado. RRHH: alta a mitad de quincena, baja, categoría sin convenio.

---

## H · Código y contratos

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| H1 | `grep` de importadores sobre todo lo huérfano; eliminado | Salida del `grep` | | | |
| H2 | Sin caminos al efecto crítico **sin llamadores** | `grep` | | | |
| H3 | El evento de auditoría, la validación de entrada y el cliente externo tienen **exactamente un constructor cada uno** | `grep` del nombre de cada uno | | | |
| H4 | Las llamadas a módulos ajenos usan **los nombres que el original desestructura** | Revisión de firmas | | | |
| H5 | Archivos ≤500 líneas y funciones ≤50, o justificado por escrito | Medición | | | |

> **Por qué H1.** Sobrevivieron 981 líneas de una pantalla descartada, **con un camino de escritura vivo y sin puerta delante** `[26]`.
> **Por qué H4.** `postId` contra `id` produjo `PUT /posts/undefined` durante horas, con respuesta 200 `[28]`.

---

## I · Pruebas

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| I1 | Cada doble es **al menos tan estricto** como el original y parte del **estado inicial real** de producción | Comparación doble ↔ firma real | | | |
| I2 | Los tres defectos más caros tienen un test que **falla al revertir la corrección** | Verificado revirtiendo, con la salida | | | |
| I3 | Todo validador de contrato corre **también en producción** | `grep` de sus llamadores fuera de `*.test.*` | | | |
| I4 | Suite, typecheck y lint en verde | Salida | | | |

> **Por qué I4 va último y no vale por sí solo.** Es dato administrativo. La evidencia son I1, I2 e I3: de los defectos graves de Asistencia, **los que encontró un test son cero**.
> **Por qué I3.** El validador que conocía el alfabeto de los identificadores de acción —el defecto que dejó los botones en «Sorry, we could not find the page»— corrió **sólo dentro de los tests** hasta que la auditoría documental lo destapó.

---

## J · Documentación

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| J1 | Cada afirmación de control tiene **el comando que la verifica**, o se borró | Lista de afirmaciones con su comando | | | |
| J2 | No quedan rutas, pantallas ni decisiones eliminadas descritas como vigentes | Búsqueda del nombre de lo eliminado en comentarios, plantillas y configuración | | | |
| J3 | Toda variable leída está en la plantilla de deploy **con qué se rompe si falta**, y viceversa | Cruce en las dos direcciones | | | |
| J4 | Los límites abiertos están escritos sin disfrazarlos | Sección de límites | | | |

> **Por qué.** La documentación afirmó cinco veces un control inexistente `P2`, dos de ellas sobre el mismo control con doce horas de diferencia. **La documentación que miente es peor que la ausente: impide que alguien vaya a mirar.**

---

## K · Aprendizaje

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| K1 | Lecciones aprendidas producidas, con causa raíz y regla por incidente | Documento | | | |
| K2 | Patrones cruzados contra el catálogo: contador subido o patrón nuevo agregado | Catálogo actualizado | | | |
| K3 | Reglas clasificadas **A–E** según el estándar del `CLAUDE.md` raíz | Clasificación por regla | | | |
| K4 | Automatizaciones futuras al backlog, con el patrón que cierran | Backlog | | | |
| K5 | Todo patrón que llegó a **cinco apariciones** tiene su automatización en el backlog como obligatoria | Revisión de contadores | | | |

---

## Cómo se lee una fila bien hecha

Ejemplo real del cierre de Asistencia. Así se ve una evidencia que un tercero puede reproducir:

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| C2 | Un pedido con identidad válida y sin credencial de origen rebota | `POST` al endpoint público con el identificador de un usuario habilitado y el del canal oficial, sin secreto | `{"ephemeral_text":"No pude verificar que este pedido venga de Mattermost."}` — y el mismo pedido **con** el secreto llega al paso siguiente | 31/07/2026 | CUMPLE |
| B3 | La operación deja registro con evidencia | Consulta a `comunicacion.v_asistencia_auditoria` sobre el evento de escritura | `celdas_modificadas` con celda, `old_value`, `new_value` y desglose normal/extra; `mattermost_username` presente | 31/07/2026 | CUMPLE |
| E6 | Está escrito qué queda inconsistente si el proceso muere | Análisis del orden confirmar → auditar → escribir | Ventana declarada: el ledger puede decir `confirmed` sin que se haya escrito; y si la verificación posterior falla, **las celdas ya están escritas** y el evento se audita como fallido | 31/07/2026 | **NO CUMPLE** — límite aceptado por el dueño |

La tercera fila es la más importante del ejemplo: **un `NO CUMPLE` explícito y aceptado vale más que un ✔ falso.** Así se cierra «con límites», que es el estado normal y honesto.

---

## Estados y reapertura

| Estado | Qué significa |
|---|---|
| **En auditoría** | El código no se toca salvo por un hallazgo |
| **Cerrado con límites** | Opera en producción; hay `NO CUMPLE` escritos y **aceptados por el dueño** |
| **Cerrado** | Sin filas en `NO CUMPLE` |
| **Reabierto** | Apareció un defecto que **contradice una evidencia registrada**. La evidencia contradicha se marca como falsa **y se conserva**, no se borra |

Un módulo sin límites declarados es sospechoso: casi siempre significa que no se buscaron.

**Obliga a reabrir:** cualquier defecto que contradiga una evidencia registrada · cualquier hallazgo de seguridad · cualquier caso en que el sistema haya afirmado algo que no pasó.

---

## Proceso reducido *(módulos de sólo lectura)*

Un módulo que sólo lee completa **A, B1–B2 adaptados (verificar que lo mostrado coincide con la fuente), G, I, J y K**, y de seguridad **C1, C4, C6**. Se saltan D, E y F2–F6 **escribiendo el motivo en el encabezado**. No se asume: se declara.

---

*Este DoD nació de los 37 incidentes del módulo Asistencia (30–31/07/2026). Cada criterio cita el suyo. Un criterio que no se puede rastrear a un incidente real sobra: borralo.*
