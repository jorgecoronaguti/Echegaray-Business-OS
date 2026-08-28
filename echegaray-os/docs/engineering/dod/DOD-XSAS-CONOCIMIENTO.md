# DoD — XSAS · Controles históricos de cotización

> Completado según `docs/engineering/DEFINITION_OF_DONE.md`.
> **Una fila sin evidencia cuenta como NO CUMPLE, no como pendiente.**
> **Una limitación declarada BLOQUEA el criterio que toca.**

## Encabezado

| | |
|---|---|
| **Módulo** | XSAS · conocimiento de cotización (`orquestador/lib/conocimiento/`, `orquestador/scripts/{estudiar-cotizaciones-drive,dataset-hallazgos,migrar-practicas-historicas}.mjs`) |
| **Qué hace** | **lee** Drive (sólo lectura, nunca escribe una planilla) y **escribe tres artefactos del repo**: `biblioteca.json`, `hallazgos-cotizaciones.json`, `dataset-hallazgos.json`. No toca el Sheet de Flujo de Caja, no toca Postgres, no publica rutas HTTP, no mueve dinero |
| **Construyó** | Claude Opus 5, rama `feat/xsas-controles-historicos` |
| **Auditó** | dos auditorías independientes de cierre (contexto nuevo); la segunda verificó por mutación |
| **SHA inicio → cierre** | `0780cf41` → ver `git log feat/xsas-controles-historicos` |
| **Autorizó** | **nadie todavía**. No alcanza nivel de autonomía E (no hay efecto externo), pero **el dueño no lo usó** y la corrida contra el corpus real no se rehizo |
| **Estado** | **Cerrado con límites** — ocho, escritos abajo como límites |
| **Horas** | 1 sesión |

---

## A · Independencia

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| A1 | Ninguna evidencia se produjo con código del módulo | Enumerar el canal de cada fila | El ×4 metálico se cruza contra `dataset-hallazgos.json` leído con `JSON.parse` desde el test, no con las funciones del módulo. El efecto de la migración se midió con `python3 -c "json.load(...)"` sobre `biblioteca.json`, no con `inventario()`. Las guardas de punto de entrada se miden ejecutando el proceso aparte y comparando el `sha256` de los artefactos. **Excepción declarada:** los estados de los 14 controles se prueban por la ruta de producción `bytes → leerArchivo → estudiarTanda`, que ES el módulo — no hay otro canal posible sin abrir las `.xlsm` a mano (ver Límite 3) | 28/08/2026 | **CUMPLE parcial** |
| A2 | El auditor no corrigió lo que encontró | `git log --stat` | Las dos auditorías devolvieron veredicto y hallazgos; ninguna editó un archivo. Todo lo corrigió el constructor en commits propios | 28/08/2026 | CUMPLE |
| A3 | El dueño lo usó cinco minutos con un caso real | Su texto | **No ocurrió.** El comando que lo pondría delante del dueño (`estudiar-cotizaciones-drive.mjs`) no se corrió: sale a Drive y reescribe la base de conocimiento | 28/08/2026 | **NO CUMPLE** |

---

## B · El efecto, verificado en el destino

> El destino de este módulo son tres archivos JSON del repo. B1–B3 se leen sobre eso.

| # | Criterio | Método | Evidencia | Fecha | Resultado |
|---|---|---|---|---|---|
| B1 | El recorrido completo se ejecutó en producción por el camino real | Corrida del comando real | **Sólo para la migración.** `node orquestador/scripts/migrar-practicas-historicas.mjs` corrió entero sobre la base real: `antes {"EXPERIENCIA_ECSAS":190,"INVESTIGACION":15}` → `✓ biblioteca v9: {"REEMPLAZADO":190,"CANDIDATO":15}`. **El estudio NO se corrió** (Límite 1) | 28/08/2026 | **NO CUMPLE** |
| B2 | El efecto se verificó leyendo el destino con otra herramienta | Lectura del archivo con otra herramienta | `python3` sobre `biblioteca.json`: `estados Counter({'REEMPLAZADO': 190, 'CANDIDATO': 15})`, `huecos 190`, y una entrada leída entera: `{"clave": "cotizacion.plantilla.hoja.gastosma", "procedencia": "EXPERIENCIA_ECSAS", "estado": "REEMPLAZADO", "reemplazadoPor": "k:e1698c03a3167553", "reemplazadoEn": "2026-08-28"}` — la procedencia **no** se reescribió | 28/08/2026 | CUMPLE |
| B3 | La operación dejó registro con evidencia | Consulta al registro | Cada entrada retirada conserva su `id`, su `procedencia` original, `reemplazadoPor` y `reemplazadoEn`; y cada clave retirada deja un `hueco` FALTA_DATO que dice dónde va a vivir su reemplazo y quién lo tiene. Verificado con `saber()` en test: `encontrados: 0`, `huecos: 1` | 28/08/2026 | CUMPLE |
| B4 | Todos los textos de éxito se leyeron uno por uno | La lista | El comando de migración imprime `✓ biblioteca v9: {…}` **después** de `guardar()`, y `no hay nada que retirar: la base ya está migrada` sólo cuando la lista es vacía —verificado corriéndolo dos veces—. El estudio imprime `LA TANDA PASA` / `LA TANDA NO PASA` derivado de `paso()`, y enumera los controles que no pudieron mirar con su motivo: ningún texto dice «limpio» sin haber mirado | 28/08/2026 | CUMPLE |

---

## C · Seguridad

| # | Criterio | Evidencia | Resultado |
|---|---|---|---|
| C1 | Rutas HTTP | No publica ninguna. `grep -rn "app.get\|app.post\|createServer" orquestador/lib/conocimiento/` → 0 | **NO APLICA** |
| C2 | Suplantación | Sin rutas HTTP | **NO APLICA** |
| C3 | Sin configuración, falla cerrado | Sin credenciales de Google el estudio **aborta**; no cae a un doble. `--dry` no escribe nada. Los tres comandos tienen guarda de punto de entrada con `pathToFileURL(...).href`: importarlos no los ejecuta | CUMPLE |
| C4 | Campos usados sin re-verificar | La única entrada externa son los bytes de las planillas de Drive, y **nada de lo que dicen habilita una acción**: producen conocimiento marcado CANDIDATO, con `valor: null` cuando sale de un defecto | CUMPLE |

---

## D · Caminos, recurso y protecciones

| # | Criterio | Evidencia | Resultado |
|---|---|---|---|
| D1 | Todos los caminos al efecto pasan por la misma guarda | Tres comandos escriben los artefactos y los tres tienen la misma guarda de punto de entrada, con test: importar no ejecuta (sha256 de los artefactos sin cambio) y ejecutar desde una ruta CON ESPACIOS sí arranca. Verificado devolviendo la guarda frágil: rojo | CUMPLE |
| D2 | De quién es el recurso, y el generador fusiona en vez de borrar | Los tres artefactos los mantiene el propio OS, **no personas**. `incorporar()` agrega y nunca saca; `fusionarHallazgos()` fusiona entre corridas; la migración **retira con `reemplazar()` y no borra**: las 190 entradas siguen en el archivo. Ninguno de los tres comandos toca un Google Sheet | CUMPLE |
| D3 | Guardas automáticas: falso positivo → qué rompe → cómo se destraba | La única guarda automática es la cobertura: un control que no pudo mirar devuelve NO_SE_PUDO_MIRAR y **rompe el `paso()`** de la tanda. Falso positivo posible: una hoja legible que el lector no entiende. Qué rompe: la tanda no pasa. Cómo se destraba: se arregla el lector — **no hay bandera para forzar el verde, y es a propósito** | CUMPLE |
| D4 | El caso legítimo que repite la clave de idempotencia | El estudio es idempotente por hash de contenido; un archivo modificado en Drive **sí** se reestudia (test). El `id` de un conocimiento es `huella({clave, procedencia, version})`: dos corridas producen el mismo id y `incorporar()` no duplica. La regla **no** está reforzada en otra capa: no hay índice ni restricción de base, es sólo el `Map` por id | CUMPLE |
| D5 | Cómo se revierte y cómo se apaga | Los tres artefactos están versionados en git: `git checkout <sha> -- orquestador/datos/conocimiento/` revierte cualquier corrida (se usó durante este trabajo). Apagar el módulo es no correr los comandos: no hay timer, ni worker, ni ruta que los dispare | CUMPLE |

---

## E · Pruebas y datos

| # | Criterio | Evidencia | Resultado |
|---|---|---|---|
| E1 | Cada doble es al menos tan estricto como el original | El fixture arma un `.xlsx` REAL con `XLSX.write` y lo hace pasar por `leerArchivo` — la misma ruta que un archivo de Drive. Los cuatro defectos que aparecieron construyendo el circuito (valor cacheado de la celda en error, rango que no empieza en A1, `cellFormula:false`, `Number('')`) viven en ese tramo, y un objeto armado a mano los saltearía | CUMPLE |
| E2 | Los defectos caros tienen un test que falla al revertir | **Verificado uno por uno, revirtiendo:** `miroTodo` → rojo sólo en «4 de 5 cotizaciones ilegibles» · `cobertura: necesitaCeldas` → rojo sólo en «sin FÓRMULAS» · `y(necesitaOferta, necesitaPresupuesto)` → rojo en «ningún renglón tiene los tres números» y en «NULL no es cero» · `coeficiente: 40` → rojo en el cruce contra el dataset · texto de exclusividad restaurado → rojo en «el ×4 no es exclusivo» · guarda `file://${…}` → rojo en «arranca DESDE UNA RUTA CON ESPACIOS» | CUMPLE |
| E3 | Todo validador corre también en producción | `pasarControles()` lo llama `estudiarTanda`, que es el camino del comando real; el artefacto publica el bloque `controles` con los tres estados. `grep` de llamadores fuera de `*.test.*`: `estudio-cotizaciones.mjs:172`. **Lo que NO corrió es el comando entero sobre el corpus** (Límite 1) | **CUMPLE parcial** |
| E4 | No se inventó ningún dato | Es la columna vertebral del módulo: `sinMirar` con su motivo por control, `huecos` FALTA_DATO por cada práctica retirada, `valor: null` en todo lo que sale de un defecto con el motivo escrito al lado, `verificadoEn: null` + `porQueNoSeVerifico` en el caso metálico que declaró el dueño | CUMPLE |

---

## F · Documentación y aprendizaje

| # | Criterio | Evidencia | Resultado |
|---|---|---|---|
| F1 | Cada afirmación de control tiene el comando que la verifica | Este documento: cada fila trae el comando o la lectura. Los ocho límites de abajo traen la medición que los sostiene | CUMPLE |
| F2 | Ningún comentario declara una condición futura sin cumplir | Los comentarios que anuncian futuro son dos y están cumplidos o declarados: «lo produce la próxima corrida del estudio» (Límite 1) y «a contrastar con T1180–T1185» (objetivo del caso metálico, no una condición del código) | CUMPLE |
| F3 | Variables de entorno cruzadas en las dos direcciones | El módulo lee las credenciales de Google que ya usa el resto del OS; no agrega ninguna variable nueva | CUMPLE |
| F4 | Lecciones producidas | **NO CUMPLE** — no se agregó ninguna lección a `LECCIONES_APRENDIDAS_ASISTENCIA.md`. Las tres que valen la pena están escritas en los encabezados del código y en este documento, que no es donde el catálogo las busca | **NO CUMPLE** |

---

## Comandos y salidas

```
node --test 'orquestador/lib/conocimiento/*.test.mjs' orquestador/scripts/estudiar-cotizaciones-drive.test.mjs
  ℹ tests 230 · pass 230 · fail 0

npm run typecheck                      → exit 0 (tsc --noEmit, sin salida)
npx eslint orquestador/lib/conocimiento orquestador/scripts/{dataset-hallazgos,estudiar-cotizaciones-drive,migrar-practicas-historicas}.mjs
                                       → exit 0, sin hallazgos

node orquestador/scripts/migrar-practicas-historicas.mjs
  antes: {"EXPERIENCIA_ECSAS":190,"INVESTIGACION":15}
  a retirar: 190 · con reemplazo ya presente: 0
  ✓ biblioteca v9: {"REEMPLAZADO":190,"CANDIDATO":15}

node orquestador/scripts/migrar-practicas-historicas.mjs --dry   (segunda vez)
  a retirar: 0 · no hay nada que retirar: la base ya está migrada
```

`npm run orq:test` completo **no se corrió**: la suite ataca Supabase y hay agentes en paralelo; lo que se corrió es el área entera, que es donde vive todo el cambio.

---

## LOS OCHO LÍMITES

> No son pendientes. Cada uno **bloquea** el criterio que toca, y está escrito acá y no al lado de un ✔.

**1 · ~~El estudio nunca se volvió a correr sobre el corpus~~ — LEVANTADO el 28/08/2026 en `feat/xsas-docx-arcor`.**
Este límite dejó de ser cierto y **un límite que dejó de ser cierto miente igual que un criterio marcado sin evidencia**, así que se corrige acá en vez de dejarlo. El estudio se corrió con `--refrescar` sobre el corpus real. En disco hoy: `hallazgos-cotizaciones.json` **tiene** el bloque `controles` (y además el bloque `corrida`), **500** hallazgos, y la biblioteca tiene **287 prácticas vivas** como `PRACTICA_HISTORICA_ECSAS` · `CANDIDATO` — no cero. Los 196 huecos `FALTA_DATO` siguen ahí; son los que declara cada documento, no las prácticas retiradas. Detalle y evidencia en `DOD-XSAS-DOCX-ARCOR.md`.

**2 · ~~Los tres controles de planilla nunca corrieron sobre el corpus real~~ — LEVANTADO PARCIALMENTE el 28/08/2026.**
Ya corrieron. `CELDA_EN_ERROR` encuentra de verdad: en la corrida del 28/08 salieron hallazgos ALTA sobre siete planillas —«MESSINA · Cotizaciones» con 558 celdas en error en 6 hojas, «LA ESTRELLA · CIERRE PERIMETRAL» con 773—. Lo que **sigue sin evidencia sobre el corpus** es `FORMULA_SOBRE_CELDA_ROTA` y `RENGLON_INCOHERENTE`: no dispararon, y no se investigó si es porque no hay casos o porque el Límite 4 los tapa. Bloquea **B1** sólo para esas dos reglas.

**3 · Ninguna planilla `.xlsm` real se abrió para cruzar los `celda_o_rango` que el dataset publica.**
El dataset dice «hoja Presupuesto · filas 19 a 25» y nadie abrió ese archivo en Excel para confirmar que ahí está lo que dice. La cadena entera se verificó contra el artefacto, que salió del mismo lector. Bloquea **A1**.

**4 · El lector de referencias de fórmula es un regex y hay dos cosas que no ve.**
Medido: `referenciasDe('SUM(Total_Costos)')` → `[]` (un nombre definido no se resuelve, así que una fórmula que dependa de un rango con nombre **nunca** va a detectarse como apoyada en una celda rota); `referenciasDe('[Libro2.xlsx]Hoja1!A1')` → `[{"hoja":"Hoja1",…}]`, es decir, lo lee como `Hoja1` **de este libro** — puede producir tanto un falso negativo como un falso positivo. Bloquea el alcance de `formula-sobre-celda-rota`.

**5 · `CLASE_POR_TIPO` mapea los 14 tipos a `ERROR_HISTORICO`, y dos de las cinco clases no las usa nadie.**
`DECISION_COMERCIAL` y `CONOCIMIENTO_TECNICO` sólo aparecen en su definición y en un test que enumera la lista: `grep -rn` no encuentra un solo lugar que las asigne. La taxonomía del pedido está declarada pero no clasificada — todo hallazgo sale como error histórico aunque sea una decisión comercial deliberada.

**6 · `patrones()` no exige cotizaciones distintas: dos hallazgos de la MISMA planilla ya forman «patrón».**
`if (g.casos.length < minimo) continue` cuenta casos, no planillas, y `cotizaciones` se calcula pero sólo se informa. Una planilla con el mismo rótulo roto en dos filas genera un candidato de aprendizaje que dice «existe inconsistencia histórica». **No se corrigió a propósito**: cambiar el corte altera qué candidatos entran a la biblioteca en la próxima corrida, y eso hay que medirlo contra el corpus —que es justamente lo que el Límite 1 dice que no se hizo—. Hacerlo a ciegas cambiaría el aprendizaje publicado sin poder ver el efecto.

---

## Veredicto

### Límite 7 — la corrección más importante del cierre no tiene test que la proteja

La regla ya no se saltea cuando la cobertura es cero: **encontrar nunca miente; lo que necesita
cobertura es la AUSENCIA**. Eso tiene efecto medible. Tanda con todas las OFERTAs ilegibles y un
renglón del Presupuesto que declara 99999 donde 10 × 100 × 1 = 1000:

    codigo actual  ->  mirados=0 · estado=HALLAZGO · 1 hallazgo
    atajo viejo    ->  mirados=0 · estado=NO_SE_PUDO_MIRAR · 0 hallazgos

**Y es reversible sin que nada se ponga rojo**: la auditoría devolvió el atajo
(`cobertura.mirados > 0 ? regla() : []`) y la suite entera quedó verde. Falta el negative test en
`orquestador/lib/conocimiento/controles-cotizacion.test.mjs`. Mientras no exista, esta corrección
está viva por costumbre, no por control — que es exactamente lo que este módulo existe para evitar.

### Límite 8 — `deduceDeLaAusencia` frena por TANDA, y el comentario dice otra cosa

`controles-cotizacion.mjs:152` afirma «sin cobertura no puede afirmar ni siquiera el defecto», pero
`controles-cotizacion.mjs:206` evalúa `cobertura.mirados === 0` sobre el AGREGADO de la tanda, no
sobre cada cotización. Medido: tanda de 3 con una sola oferta con fórmulas →
`iva-escrito-a-mano: estado HALLAZGO, mirados 1, sinMirar 2`, y el hallazgo ALTA con monto sale de
`c1.xlsx`, que **ese mismo control declaró que no pudo mirar**.

Sobre el corpus de hoy no cambia nada: la única fila de `IVA_ESCRITO_A_MANO` es de un archivo que sí
tiene fórmulas. El día que llegue una planilla sin fórmulas entre otras que sí las tienen, se publica
un rojo sobre un archivo declarado ilegible.

**Cerrado con límites**, y **no cerrado** en el sentido fuerte del `CLAUDE.md`: no hay evidencia del efecto sobre el corpus real (B1), el dueño no lo usó (A3) y el catálogo de lecciones no se actualizó (F4). Lo que sí está probado, por mutación, es que ninguno de los 14 controles puede declararse limpio sobre lo que no pudo mirar, y que los tres comandos no se ejecutan al importarlos.

**Siguiente paso concreto:** el dueño decide si se corre `node orquestador/scripts/estudiar-cotizaciones-drive.mjs` sobre las 237 cotizaciones. Esa corrida repone las 190 prácticas con la procedencia correcta, publica por primera vez los tres estados sobre el corpus real y contesta los Límites 1 y 2 de una sola vez.
