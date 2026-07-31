# Definition of Done — Echegaray Business OS

> **DoD oficial.** Reemplaza a todo checklist de ✔ anterior, empezando por `orquestador/comunicacion/docs/DOD-ASISTENCIA.md`, que estaba marcado al 100% y afirmaba tres controles falsos — ese documento queda **SUPERADO**, se conserva como evidencia histórica y su veredicto «CERRADO» no vale.
>
> El proceso que produce estas evidencias: [AUDITORIA_FINAL_MODULOS.md](AUDITORIA_FINAL_MODULOS.md). Los incidentes y el catálogo de patrones: [LECCIONES_APRENDIDAS_ASISTENCIA.md](LECCIONES_APRENDIDAS_ASISTENCIA.md); `[n]` remite a su línea de tiempo de 38 incidentes.
>
> **Cómo se usa:** copiar a `docs/engineering/dod/DOD-<MÓDULO>.md`, completar fila por fila, archivar.
>
> **Cuánto cuesta: 6 a 8 horas** para un módulo que escribe datos. Está dicho para que se planifique, no para que se saltee. Si no entra, existe el estado de excepción del final — con piso, vencimiento y apagado real.

---

## La regla que hace distinto a este DoD

Un criterio **no se marca: se prueba**. Cinco columnas: **Criterio · Método · Evidencia · Fecha · Resultado** (`CUMPLE` / `NO CUMPLE` / `NO APLICA` + motivo).

**Una fila sin evidencia cuenta como NO CUMPLE.** No como pendiente.

**Una limitación declarada BLOQUEA el criterio que toca.** Es el defecto que hundió al DOD anterior: se declaró terminado **tres veces en dos horas y diecisiete minutos**, y las tres veces escribió al lado la limitación que lo invalidaba —*«no se escribió ninguna celda nueva en JORNALES»*— y el veredicto se tomó sobre los ✔. La primera escritura real ocurrió ocho horas después, y trajo la caída de la función principal.

**Evidencia válida:** un test que falla al revertir la corrección · una consulta a producción con su salida · una línea de log con su marca de tiempo · un `curl` con su respuesta · el valor leído del destino · la salida de un `grep`.

**Evidencia inválida:** «revisado», «probado», «funciona». Y **la suite en verde** — que es justo lo que ya valida el portero automático del proyecto (suite, typecheck y lint), las tres cosas que **no detectaron ni uno solo de los 38 defectos**.

**La evidencia no se produce con el código del módulo.** Si el módulo escribe con una función, el control lee el destino con otra herramienta. Un control que se compara contra sí mismo no es un control `[30]`.

> **Dos palabras que acá significan otra cosa.** «Cierre» es **cierre de módulo**, no cierre de obra. Y «E» es el **grado de aprendizaje E** (regla aprobada) o el **nivel de autonomía E** (efecto externo, firma del dueño): siempre se nombran completas.

---

## Encabezado

| | |
|---|---|
| **Módulo** | |
| **Qué hace** | escribe datos / mueve dinero / obligación laboral o fiscal / publica una ruta HTTP / sólo lectura |
| **Construyó** | |
| **Auditó** | |
| **SHA de inicio de auditoría → SHA de cierre** | |
| **Autorizó** *(el agente auditor; el dueño si alcanza el nivel de autonomía E)* | |
| **Estado** | En auditoría / Desplegado bajo excepción / Cerrado con límites / Cerrado |
| **Horas** | |

---

## A · Independencia — 3 filas

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| A1 | **Ninguna evidencia de B, C ni D se produjo con código escrito para este módulo.** Canales admitidos: logs de producción, consulta a la base, respuesta HTTP, lectura del destino con otra herramienta | Enumerar el canal usado en cada fila de B, C y D | | | |
| A2 | **El auditor no corrigió lo que encontró**: entre el SHA de inicio y el de cierre no hay commits suyos sobre archivos del módulo | `git log --stat <sha1>..<sha2>` | | | |
| A3 | **El dueño lo usó cinco minutos**, en su celular, con un caso real y un día raro, y escribió qué vio | Su texto, tal cual | | | |

> **Por qué A1 no dice «otra persona».** Con una IA construyendo, «otra sesión» no se puede probar y esta fila se auto-certificaría — el defecto exacto que vino a matar. Lo que sí se prueba es de dónde salió la evidencia, y es lo que importaba: los defectos graves no los encontró alguien que ignoraba el código, los encontró **alguien mirando canales distintos del que escribió**.
> **Por qué A3.** Nueve de los 38 defectos los encontró el dueño usándolo. Es el mejor rendimiento por minuto de todo el proyecto y no costaba nada.

---

## B · El efecto, verificado en el destino — 4 filas

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| B1 | El recorrido completo se ejecutó **en producción, por el camino real** del usuario | Recorrido manual o script que usa el mismo endpoint que la persona | | | |
| B2 | El efecto se verificó **leyendo el destino** con otra herramienta | Valor leído de la celda / fila / registro, con su identificador | | | |
| B3 | La operación dejó **registro con evidencia** (qué se tocó, qué había antes, qué quedó), medido **en el camino que usa la gente** | Consulta al registro de auditoría con su salida, y el camino identificado | | | |
| B4 | **Todos los textos de éxito** se leyeron uno por uno: ninguno afirma algo que puede no haber pasado | La lista, y la prueba de al menos uno con la escritura fallando | | | |

> **B1–B2:** el dueño usó Asistencia, vio responder OK y estaba rota — salía `PUT /posts/undefined → 400`, el error iba al log y la respuesta era 200 `[28]`. **Que el usuario diga que anduvo no prueba que anduvo.**
> **B3:** el DOD viejo afirmaba «se puede reconstruir quién escribió qué celda ✔» y el control estaba ciego para la interfaz real `[30]`. Los eventos de esa ventana **no se recuperan**.
> **B4:** *«un mensaje que afirma algo que no pasó»* es el patrón más frecuente del proyecto — **seis apariciones**.
> **Cómo probar sin ensuciar:** un caso de **efecto cero**, o un registro cuyo valor ya coincide. **Nunca un script aislado que simule el éxito.**

---

## C · Seguridad — 4 filas

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| C1 | Cada ruta HTTP publicada por el proxy tiene **archivo:línea del manejador que autentica el origen**. Una ruta sin línea es un hallazgo | Configuración del proxy + `grep` de los manejadores | | | |
| C2 | Un pedido con identidad válida y **sin credencial de origen** rebota | Intento de suplantación, con su respuesta | | | |
| C3 | **Sin la configuración, falla cerrado** *(módulos que escriben)* | Arranque sin la variable, con la respuesta obtenida | | | |
| C4 | Están listados **los campos del pedido usados sin re-verificar** contra el servidor, con qué pasa si el que llama los cambia | La lista, con su análisis | | | |

> Un `curl` anónimo desde Internet pasaba el control de canal y el de permisos, porque la identidad salía del payload `[27]`. **Antes de preguntar «¿puede esta persona?», hay que poder responder «¿es esta persona?».**

---

## D · Caminos, recurso y protecciones — 5 filas

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| D1 | Está escrita la **lista de todos los caminos** que llegan al efecto, y **cada uno** pasa por la misma guarda | Un intento por camino, con su respuesta | | | |
| D2 | **De quién es el recurso que se escribe**: si lo mantienen personas, se protege la unidad mínima (celda, fila) y **el generador fusiona, no borra** | Declaración del dueño del recurso + prueba de que una edición humana sobrevive a una corrida | | | |
| D3 | Cada guarda automática tiene su fila: **falso positivo → qué se rompe → cómo se destraba → quién puede**. Si el destrabe pide un deploy, la guarda no se activa sola | Inventario de guardas | | | |
| D4 | Está escrito **el caso legítimo que repite la clave de idempotencia**, y que la regla **no está reforzada en otra capa** (índice, restricción, caché) | Análisis + `grep` de migraciones | | | |
| D5 | Está escrito **cómo se revierte** una escritura y **cómo se apaga el módulo entero**, con quién puede hacerlo | Los dos procedimientos | | | |

> **D2 es la fila que este OS más necesita y la que no existía.** El riesgo dominante del proyecto no es un endpoint: es **escribir sobre artefactos que mantienen personas** — el auto-candado de JORNALES `[19]`, la pestaña de Proveedores borrada, las pérdidas de trabajo del dueño en el Flujo de Caja.
> **D4:** la misma protección se corrigió **tres veces en tres capas** `[7]` `[20]` `[21]`; arreglarla arriba no cerró nada porque abajo la reforzaba.

---

## E · Pruebas y datos — 4 filas

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| E1 | Cada doble es **al menos tan estricto** como el original y parte del **estado inicial real** de producción | Comparación doble ↔ firma real | | | |
| E2 | Los defectos más caros tienen un test que **falla al revertir la corrección** | Verificado revirtiendo, con la salida | | | |
| E3 | Todo validador de contrato corre **también en producción** | `grep` de llamadores fuera de `*.test.*` | | | |
| E4 | **No se inventó ningún dato que falta**: lo ausente se declara, lo ambiguo se rechaza, y ningún campo obligatorio fuerza al usuario a inventarlo | Lista de los datos ausentes y qué hace el módulo con cada uno | | | |

> **E1:** *«un doble que no respeta el contrato del original no prueba, tapa»* — cuatro apariciones, incluida la que rompía la función principal.
> **E4:** es el único patrón **positivo** del proyecto, con seis apariciones — y el más fácil de erosionar cuando aprieta el plazo.

---

## F · Documentación y aprendizaje — 4 filas

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| F1 | Cada afirmación de control en la documentación tiene **el comando que la verifica**, o se borró | Lista de afirmaciones con su comando | | | |
| F2 | **Ningún comentario declara una condición futura sin cumplir.** Si ya se cumplió, se releyó y se actuó | `grep` de «qué la activaría / cuando / si alguna vez» en los comentarios del módulo | | | |
| F3 | Toda variable leída está en la plantilla de deploy **con qué se rompe si falta**, y viceversa | Cruce en las dos direcciones | | | |
| F4 | Lecciones producidas y **contadores del catálogo actualizados** en `LECCIONES_APRENDIDAS_ASISTENCIA.md` | El documento, con los patrones subidos o agregados | | | |

> **F2 cuesta dos minutos y habría evitado el agujero de seguridad más caro del proyecto**: el código había escrito *«QUÉ LA ACTIVARÍA: botones o diálogos interactivos […] recién ahí la firma pasa a proteger algo real»*. Los botones se activaron. La firma no `[27]`.

---

## Filas heredadas, no nacidas de un incidente

Se cumplen igual, pero es honesto decir de dónde vienen: **la firma del dueño cuando el módulo alcanza el nivel de autonomía E** (lo exige el `CLAUDE.md` raíz) · **archivos ≤500 líneas y funciones ≤50** (regla del `CLAUDE.md` técnico, con precedente de desviación aceptada: `asistencia-consultas.mjs`, 553 líneas, «registrado, no forzado») · **suite, typecheck y lint en verde** con `node --test` (dato administrativo: ya lo valida el portero automático).

---

## Estados

| Estado | Qué significa |
|---|---|
| **En auditoría** | El código no se toca salvo por un hallazgo |
| **Desplegado bajo excepción** | Ver abajo |
| **Cerrado con límites** | Opera en producción; hay `NO CUMPLE` escritos y aceptados |
| **Cerrado** | Sin `NO CUMPLE` y **sin límites abiertos** |

Cerrar sin límites declarados es sospechoso: casi siempre significa que no se buscaron. **Obliga a reabrir:** cualquier defecto que contradiga una evidencia registrada, cualquier hallazgo de seguridad, y cualquier caso en que el sistema haya afirmado algo que no pasó. La evidencia contradicha se marca como falsa **y se conserva**.

### Desplegado bajo excepción

Porque un viernes a las 18 con la quincena encima, un proceso sin válvula no se relaja: se rompe mintiendo, que es como murió el DOD anterior.

**Piso que nunca se saltea — 7 filas, ~90 minutos:** `A1` · `B2` · `C1` · `C2` · `C3` · `D1` · `D2`. Son las que mapean a los dos incidentes que costaron de verdad: el endpoint abierto a Internet y la función principal rota mientras el dueño la daba por buena.

**Vencimiento:** fecha escrita en la que el DoD completo se termina. **Si se pasa, el módulo se apaga** — no se discute; el mecanismo es instantáneo y está en D5.

**Y una línea del dueño:** «despliego con X sin auditar porque Y».

---

## Proceso reducido — sólo lectura

Completa **A1, A3, B1–B2 adaptados** (lo mostrado coincide con la fuente, leída aparte), **C1, C4, E1, E4, F1, F3, F4**. Se saltan B3–B4, C2–C3, D y E2–E3, **escribiendo el motivo**. Ojo con C3: en sólo lectura, negar por una variable faltante deja al dueño sin datos — ahí se degrada avisando.

---

## Cómo se lee una fila bien hecha

Del cierre de Asistencia. Evidencia que un tercero puede reproducir:

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| C2 | Un pedido sin credencial de origen rebota | `POST` al endpoint público con el identificador de un habilitado y el del canal oficial, sin secreto | `{"ephemeral_text":"No pude verificar que este pedido venga de Mattermost."}` — y con el secreto llega al paso siguiente | 31/07/2026 | CUMPLE |
| B3 | La operación deja registro con evidencia | Consulta a `comunicacion.v_asistencia_auditoria` sobre el evento de escritura | `celdas_modificadas` con celda, valor anterior, valor nuevo y desglose normal/extra; autor presente | 31/07/2026 | CUMPLE |
| D5 | Está escrito qué queda inconsistente si el proceso muere | Análisis del orden confirmar → auditar → escribir | El registro puede decir `confirmed` sin que se haya escrito; y si la verificación posterior falla, **las celdas ya están escritas** y el evento se audita como fallido | 31/07/2026 | **NO CUMPLE** — límite aceptado |

La tercera fila es la que enseña: **un `NO CUMPLE` explícito y aceptado vale más que un ✔ falso.**

---

*24 filas, nacidas de los 38 incidentes de Asistencia (30–31/07/2026). Un criterio que no se pueda rastrear a un incidente o declararse heredado, sobra.*
