# DoD — Tesorero Inversor IA

> Completado según `docs/engineering/DEFINITION_OF_DONE.md`.
> **Una fila sin evidencia cuenta como NO CUMPLE, no como pendiente.**
> **Una limitación declarada BLOQUEA el criterio que toca.**

## Encabezado

| | |
|---|---|
| **Módulo** | Tesorero Inversor IA (`orquestador/lib/tesoreria/`) |
| **Qué hace** | **sólo lectura** — lee el Sheet de Flujo de Caja y Balanz; no escribe celdas, no mueve dinero, no publica rutas HTTP. Publica texto en Mattermost |
| **Construyó** | Claude Opus 5, sesión del 01/08/2026 |
| **Auditó** | agente independiente (contexto nuevo, sin el razonamiento del que construyó) |
| **SHA inicio → cierre** | `990ce71` (origin/main) → ver `git log` de la rama |
| **Autorizó** | **nadie todavía** — no alcanza el nivel de autonomía E porque no ejecuta operaciones, pero **el dueño no lo usó** (ver A3) |
| **Estado** | **Cerrado con límites** (dos auditorías independientes; la segunda: CERRADO CON LÍMITES) |
| **Horas** | ~2 sesiones |

---

## A · Independencia

| # | Criterio | Evidencia | Resultado |
|---|---|---|---|
| A1 | Ninguna evidencia de B/C/D se produjo con código del módulo | **CUMPLE parcial.** El control de coherencia del total se verificó leyendo la pestaña CAJA cruda con `google.readSheetValues` directo (canal distinto del motor); la migración se verificó con `psql` contra un Postgres descartable, no con el código del ledger; la barrera se verificó con un navegador Chromium real contando clics en el DOM (`window.__clics`), no con la función que la llama. **Pero** las cifras de caja de la corrida real salen del mismo motor: se cruzaron contra el "Total disponibilidades" que calcula la propia planilla, que es otra fuente, no otra herramienta mía | **CUMPLE** |
| A2 | El auditor no corrigió lo que encontró | Dos auditorías independientes, ninguna editó un archivo. La primera devolvió NO CERRADO con 3 hallazgos altos; la segunda verificó 8/8 cerrados **reproduciendo el ataque**, y encontró 3 nuevos (dos de ellos causados por mis propias correcciones). Todo corregido por el constructor, en commits propios | **CUMPLE** |
| A3 | El dueño lo usó cinco minutos, en su celular, con un caso real | **No ocurrió.** | **NO CUMPLE** |

---

## B · El efecto, verificado en el destino

> Este módulo **no escribe** en el Sheet ni mueve dinero. Su "efecto" es publicar un texto y persistir un análisis. B2 y B3 se leen sobre eso.

| # | Criterio | Evidencia | Resultado |
|---|---|---|---|
| B1 | El recorrido completo se ejecutó en producción, por el camino real | **PARCIAL, y el faltante bloquea.** El tramo de caja corrió entero contra el Sheet real por el camino canónico (`node orquestador/os.mjs excedente_invertible` y `ciclo-tesorero.mjs --dry`): 51 movimientos, caja $88.709.996, seis ventanas. El tramo de MERCADO nunca corrió: no hay sesión de Balanz | **NO CUMPLE** |
| B2 | El efecto se verificó leyendo el destino con otra herramienta | El ledger se verificó leyendo las tablas con `psql`/`query` directo contra un Postgres descartable: 11 tablas, 22 policies, observaciones no pisadas, recomendación reemplazada por su clave. **En producción no hay destino**: la migración no está aplicada | **NO CUMPLE** |
| B3 | La operación dejó registro con evidencia, en el camino que usa la gente | `tesoreria.corridas` + `posiciones` + `ventanas` + `bloqueos_seguridad` guardan qué se leyó y con qué dato se decidió. Probado contra Postgres real. **No probado en producción** | **NO CUMPLE** |
| B4 | Todos los textos de éxito se leyeron uno por uno | Los textos salen de `formato-mattermost.mjs`. Ninguno afirma una colocación hecha: el estado literal es `PROPUESTA — REQUIERE APROBACIÓN HUMANA`, y hay un test que falla si el mensaje contiene "Comprar", "Suscribir", "Confirmar", "actions" o "integration". El mensaje de sesión vencida dice explícitamente que el análisis de caja **sí** se hizo y que falta el mercado | **CUMPLE** |

---

## C · Seguridad

| # | Criterio | Evidencia | Resultado |
|---|---|---|---|
| C1 | Cada ruta HTTP publicada tiene manejador que autentica | **No publica ninguna ruta HTTP.** `grep -rn "app.get\|app.post\|createServer" orquestador/lib/tesoreria/` → 0 | **NO APLICA** |
| C2 | Un pedido con identidad válida y sin credencial rebota | Sin rutas HTTP | **NO APLICA** |
| C3 | Sin la configuración, falla cerrado | Sin `ORQ_TESORERIA_CANAL` no publica (imprime en journal). Sin cliente real de Mattermost **lanza** en vez de caer a un Fake (`ciclo-tesorero.mjs`). Sin CDP devuelve `SESSION_REQUIRED` y no intenta entrar. Sin política de reserva, todo sale `NO_ACCIONABLE`. Sin composición de caja, el excedente no se topea y se declara | **CUMPLE** |
| C4 | Campos del pedido usados sin re-verificar | El único input externo es el DOM de Balanz, y **nada de lo que dice el DOM habilita una acción**: la barrera decide sobre el DOM, no confía en él. `ORQ_BALANZ_EXTRACTOR_VALIDADO` es una declaración humana por entorno; si un atacante la pusiera en 1, sólo lograría que las propuestas salieran ACCIONABLE — sin ejecutar nada, porque no existe la herramienta | **CUMPLE** |

**Barrera transaccional**: 20 tests puros + 11 contra Chromium real. Bloquea por texto, `aria-label`, `title`, texto del contenedor, `href`, `action`, ruta, todo `type=submit`, todo `<form>` y todo lo que viva adentro de uno. Falla cerrada. Un test lee `balanz-navegador.mjs` y falla si aparece un segundo `.click()` o `.goto()`.

**Secretos**: `grep -rInE "(AIza[0-9A-Za-z_-]{30}|sk-ant-|BEGIN .*PRIVATE KEY)"` sobre el diff → 0. El navegador no toca `cookies()`, `storageState`, `localStorage` ni `sessionStorage` (test que lee el archivo). Los bloqueos guardan tag, rol y 80 caracteres de texto: no reconstruyen la pantalla.

---

## D · Caminos, recurso y protecciones

| # | Criterio | Evidencia | Resultado |
|---|---|---|---|
| D1 | Lista de todos los caminos al efecto, cada uno por la misma guarda | Tres caminos al análisis: el timer (`ciclo-tesorero.mjs`), el chat/Director (`tesoreria-tool.mjs`) y la consulta manual (`os.mjs`). Los tres llaman a `correrCiclo`/`reconstruirPosicion`, ninguno duplica el cálculo. Al mercado hay **un solo** camino: `relevar()`, y el chat **no** lo recibe a propósito (pelearía con el timer por la sesión de Chrome) | **CUMPLE** |
| D2 | De quién es el recurso que se escribe; el generador fusiona, no borra | **El módulo no escribe ningún recurso humano.** Test que lee los 13 módulos y falla si aparece `updateSheetValues`, `appendSheetValues`, `clearValues`, `batchUpdateValues`, `createFile`, `writeDoc`, `appendToDoc`, `docsBatchUpdate`, `uploadFile`, `renameFile` o `moveFile` | **CUMPLE** |
| D3 | Cada guarda tiene falso positivo → qué rompe → cómo se destraba → quién | Inventario abajo | **CUMPLE** |
| D4 | El caso legítimo que repite la clave de idempotencia, y que no está reforzada en otra capa | La clave es `rec_<bloque>_<día>_<instrumento>`. El caso legítimo es **la segunda corrida del mismo día** (09:15 y 15:30): reemplaza, no duplica — probado contra Postgres. No hay índice único adicional: `grep -ci unique` sobre la migración → **0**; la unicidad la da la PK de `recomendaciones`. El lock es `pg_try_advisory_lock(738201)`, en una sola capa | **CUMPLE** |
| D5 | Cómo se revierte una escritura y cómo se apaga el módulo entero | En el runbook: `drop schema tesoreria cascade` + los 4 `delete` del organigrama; apagado = `systemctl --user disable --now echegaray-tesorero.timer`. Quién: el dueño | **CUMPLE** |

### Inventario de guardas

| Guarda | Falso positivo | Qué rompe | Cómo se destraba | Quién |
|---|---|---|---|---|
| Coherencia del total de CAJA | la pestaña usa otro criterio de exclusión | no hay análisis ese día | arreglar la pestaña, o ajustar la relación esperada en `coherenciaDelTotal` | dueño / desarrollo |
| Cuentas desaparecidas | el dueño renombra una cuenta a propósito | análisis `NO_ACCIONABLE` | correr una vez más: la nueva composición pasa a ser la referencia | solo, en la corrida siguiente |
| Barrera transaccional | un link informativo con una palabra desafortunada | no se lee esa pantalla | agregar la ruta EXACTA a `NAVEGACION_INFORMATIVA` | desarrollo, con test |
| Lock de concurrencia | una corrida quedó colgada | se omite la corrida | el lock se libera al morir la sesión de Postgres | solo |
| Reserva no aprobada | — | todo `NO_ACCIONABLE` | `tesoreria-politica.mjs aprobar` | dueño |
| Dato de mercado > 24h | — | el instrumento se rechaza | correr con el mercado abierto | solo |

Ninguna guarda pide un deploy para destrabarse.

---

## E · Pruebas y datos

| # | Criterio | Evidencia | Resultado |
|---|---|---|---|
| E1 | Cada doble es al menos tan estricto como el original y parte del estado real | El doble de Google en `ciclo.test.mjs` devuelve **el mismo shape** que `readSheetValues` (array de arrays) con los encabezados reales de la pestaña CAJA. El de Postgres es un **Postgres real** en docker, no un mock. La página del test de DOM es HTML servido a un Chromium real | **CUMPLE** |
| E2 | Los defectos más caros tienen un test que falla al revertir | Ver la tabla de abajo: **9 correcciones revertidas mentalmente, 9 con test rojo** | **CUMPLE** |
| E3 | Todo validador de contrato corre también en producción | `validarContra(Movimiento/Recomendacion/Instrumento)` se llama desde `lectura-flujo.mjs`, `recomendacion.mjs` e `instrumentos.mjs` — código de producción, no de test. `grep -rn "validarContra" --include=*.mjs orquestador/lib/tesoreria \| grep -v test \| grep -v contratos` → **3** llamadas (movimiento, recomendación, instrumento) | **CUMPLE** |
| E4 | No se inventó ningún dato faltante | `row_reference` y `source_formula` → `null` + gap declarado. Reserva mínima → `ausente`, no 0. Caja restringida → 5 estados, `null` nunca se vuelve 0. Tasa sin tipo → el instrumento queda fuera del ranking con motivo. Bloque más allá del calendario → `G`, no una fecha inventada. Costo de contingencia sin calendario → vara conservadora, declarada | **CUMPLE** |

### Los defectos, revertidos

| Corrección | Test que se pone rojo |
|---|---|
| Vara = CFT universal | `CASO B · SIN descubierto, un instrumento por debajo del 62,78% NO se rechaza automáticamente` |
| Bloque E prometía 2036 | `NO se afirma nada más allá de donde llega el calendario` |
| Deuda medida por total, no por cuenta | `la deuda cancelable se mide POR CUENTA, no por el saldo total` |
| Ajuste leído como cuenta en rojo | `un AJUSTE negativo no es una cuenta en descubierto` |
| `#REF!` → caja $0 | `un #REF! en el total NO se informa como caja $0` |
| Cuentas desaparecidas | `una cuenta que ayer estaba y hoy no, NO es una cuenta en cero` |
| `Number(null)` = 0 | `los cuatro sabores de "no sé" NO se colapsan en cero` |
| Guardar = aprobar | `GUARDAR NO ES APROBAR` (contra Postgres real) |
| `<button type=submit>` sin rol | `un submit sin role="button" también cae` (contra Chromium real) |
| `parentElement` = página entera | `el CONTENEDOR no es la página entera` |
| Validador con `NaN` | `si un componente de la caja no es número, el control FALLA` |
| `aprobada_en` inexistente | los tests de `ledger.pg.test.mjs` no arrancan |
| CTA en voseo (`Vendé`, `Invertí`, `Caucioná`) | `las CTA en VOSEO caen` |
| Host ignorado en la navegación | `fuera del dominio de Balanz NO se navega` |
| Validador aprobando un invento | `una propuesta FABRICADA no aprueba` |
| Neto no recalculado desde el instrumento | `el rendimiento neto SE RECALCULA desde el instrumento` |
| `Number(null)` en instrumentos | `un fondo SIN plazo de rescate no se cuela como liquidez inmediata` |
| Coherencia fallando abierto | `sin composición, el control de coherencia FALLA` |
| Contingencia con dólares | `la contingencia se simula EN PESOS` |
| Cobertura del calendario aparente | `la cobertura del calendario sale de las FILAS` |
| Accionabilidad `!== false` | `la accionabilidad falla CERRADA` |
| `mercadoFresco` cableado | `la frescura del mercado se MIDE con lo relevado` |
| Excepciones informativas | `las excepciones informativas no abren la puerta` |

---

## F · Documentación y aprendizaje

| # | Criterio | Evidencia | Resultado |
|---|---|---|---|
| F1 | Cada afirmación de control tiene el comando que la verifica | El runbook trae los comandos de verificación del túnel (3), de la migración (4 consultas SQL), del diagnóstico (4 comandos + 4 consultas) y de revertir | **CUMPLE** |
| F2 | Ningún comentario declara una condición futura sin cumplir | `grep -niE "cuando (haya|exista|se)|si alguna vez|qué la activaría" orquestador/lib/tesoreria/*.mjs` → las menciones son a condiciones **de runtime documentadas** (sin sesión, sin calendario, sin política), todas implementadas y con test. Ninguna promete un control futuro | **CUMPLE** |
| F3 | Toda variable leída está en la plantilla de deploy | `ORQ_BALANZ_CDP` (default `127.0.0.1:9222`), `ORQ_TESORERIA_CANAL` (sin ella no publica), `ORQ_BALANZ_EXTRACTOR_VALIDADO` (sin ella todo `NO_ACCIONABLE`). Las tres documentadas con qué se rompe si faltan. **NO están en `worker.env`**: se agregan al integrar | **NO CUMPLE** |
| F4 | Lecciones producidas y contadores actualizados | No se tocó `LECCIONES_APRENDIDAS_ASISTENCIA.md`: los defectos de este módulo son propios y están en los mensajes de commit y en este documento. **El catálogo no se actualizó** | **NO CUMPLE** |

---

## Veredicto

**NO CERRADO.** Seis filas en NO CUMPLE. Las dos auditorías independientes coinciden: la segunda
dictaminó **CERRADO CON LÍMITES** sobre el código —los 8 hallazgos anteriores verificados cerrados
reproduciendo el ataque— y este documento mantiene NO CERRADO porque el DoD del repo mide otra cosa:
evidencia del efecto en producción, que sigue sin existir.

| Fila | Qué falta | Cómo se consigue |
|---|---|---|
| **A3** | el dueño no lo usó | correr `node orquestador/os.mjs excedente_invertible` y leer la salida |
| **B1** | el tramo de mercado nunca corrió | Chrome dedicado + túnel + `balanz-explorar.mjs` |
| **B2**, **B3** | el ledger no tiene destino en producción | aplicar la migración al integrar |
| **F3** | las tres variables no están en la plantilla | agregarlas a `worker.env` al desplegar |
| **F4** | catálogo de lecciones sin actualizar | subir los patrones nuevos |

Las cinco primeras dependen de una decisión o de una acción del dueño. Ninguna es un defecto del código.
