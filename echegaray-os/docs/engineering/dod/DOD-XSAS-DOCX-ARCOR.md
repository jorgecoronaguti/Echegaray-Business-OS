# DoD — XSAS · Planilla del cliente, documentos de Word y versiones del mismo contrato

> Completado según `docs/engineering/DEFINITION_OF_DONE.md`.
> **Una fila sin evidencia cuenta como NO CUMPLE, no como pendiente.**
> **Una limitación declarada BLOQUEA el criterio que toca.**

## Encabezado

| | |
|---|---|
| **Módulo** | XSAS · lectura semántica de planillas en formato del cliente y de documentos de Word (`orquestador/lib/conocimiento/{planilla-semantica,practica-cotizacion-cliente,documento-proyecto,documento-version,contrastar-documento}.mjs`, `orquestador/lib/plano/documental.mjs`, `orquestador/lib/ingesta/docx.mjs`, `orquestador/scripts/{estudiar-documentos-word,estudiar-cotizaciones-drive,xsas-contrastar-documentos,biblioteca-sellar-clase-documental}.mjs`) |
| **Qué hace** | **lee** Drive (nunca escribe una planilla ni un Sheet) y **escribe tres artefactos del repo**: `biblioteca.json`, `hallazgos-cotizaciones.json`, `documentos-word.json`. No toca el Sheet de Flujo de Caja, no toca Postgres, no publica rutas HTTP, no mueve dinero |
| **Construyó** | Claude Opus 5, rama `feat/xsas-docx-arcor` |
| **Auditó** | cuatro auditorías independientes de cierre, con contexto nuevo; las cuatro dieron FAIL y las cuatro verificaron por mutación sobre las funciones reales |
| **SHA** | base `f915bcd2` → ver `git log feat/xsas-docx-arcor` |
| **Autorizó** | **nadie todavía**. No alcanza nivel de autonomía E, pero **el dueño no lo usó** y hay una decisión suya pendiente (Límite 1) |
| **Estado** | **Cerrado con límites** — nueve, escritos abajo |

---

## A · Independencia

| # | Criterio | Método | Evidencia | Resultado |
|---|---|---|---|---|
| A1 | Ninguna evidencia se produjo con código del módulo | Enumerar el canal de cada fila | Los conteos del artefacto se leen con `JSON.parse` desde un script aparte, no con `inventario()`. El cruce «archivos que enseñaron una práctica ↔ su etapa» se arma leyendo `biblioteca.json` crudo. **Excepción declarada:** las cinco métricas del umbral (B2 abajo) se calculan con `clavesDeLectura`, que ES el módulo — no hay otro canal para «qué frases comparten dos documentos» sin reimplementar el lector | **CUMPLE parcial** |
| A2 | El auditor no corrigió lo que encontró | `git log --stat` | Las cuatro auditorías devolvieron veredicto y hallazgos; ninguna editó un archivo | CUMPLE |
| A3 | El dueño lo usó cinco minutos con un caso real | Su texto | **No ocurrió.** Y hay una decisión suya bloqueando (Límite 1) | **NO CUMPLE** |

---

## B · El efecto, verificado en el destino

| # | Criterio | Método | Evidencia | Resultado |
|---|---|---|---|---|
| B1 | El recorrido completo se ejecutó por el camino real | Corrida de los dos comandos | `estudiar-documentos-word.mjs` y `estudiar-cotizaciones-drive.mjs --refrescar`, los dos con exit 0 sobre el corpus real, desde la base de `main`. Salida en el cuerpo de este documento | CUMPLE |
| B2 | El efecto se verificó leyendo el destino | `JSON.parse` sobre los artefactos | `biblioteca v11 · 170 documentos · 649 conocimientos` → `cotizacion 396 · documento-proyecto 141 · cotizacion_cliente 97 · cuadrilla 15`; `huecos FALTA_DATO 196 · CONFLICTO 2`; `hallazgos-cotizaciones.json` con 500 hallazgos y los bloques `controles` y `corrida` | CUMPLE |
| B3 | La deduplicación tiene efecto medible | Antes/después en el destino | El contrato de Quattropani pasó de **46 + 46** conocimientos a **46 + 1**: `documento-proyecto` bajó de 187 a 141. Las 33 frases comunes entran una vez | CUMPLE |
| B4 | Lo que difiere entre las dos versiones NO se resolvió solo | Lectura de los huecos | Los 2 huecos `CONFLICTO` conservan las dos citas, las dos fuentes y `quienLoTiene: "el dueño"`. La cláusula «Saldo: el monto restante es de (U$S 31500 + IVA)» está declarada, no elegida ni descartada | CUMPLE |
| B5 | La ficha de un documento refleja lo que se logró con él | Cruce en el artefacto | `archivos fuente de una práctica cotizacion_cliente: 33 · figuran NO_LEIDO: 0 · figuran ESTUDIADO: 33`. `NO_LEIDO` quedó en 13, y los 13 con motivo real (11 cómputos sin columna de precio, 2 `.docx` que son sólo imágenes) | CUMPLE |

---

## C · Pruebas: cada control puede dar rojo

> **Un test que arma su propia estructura y después le pregunta a la función si la estructura es como
> se armó no prueba nada.** Es como pasó B1 entero con la suite en verde, y por eso esta sección
> lista la mutación de cada control, no su nombre.

| Mutación aplicada a la fuente real | Test que se pone rojo |
|---|---|
| `claveDeFrase` deja de normalizar la composición Unicode | el ruido de exportación NO es una diferencia… |
| `claveDeFrase` «normaliza más» y saca los números | el ruido de exportación NO es una diferencia… |
| `PROPORCION_MINIMA_DE_TAMANO = 0` | NEGATIVO: un anexo corto contenido ENTERO… |
| `MINIMO_FRASES_PARA_COMPARAR = 0` | NEGATIVO: con pocas frases NO se compara… |
| `SOLAPE_MISMO_DOCUMENTO = 0` | NEGATIVO: dos contratos DISTINTOS que comparten el machote… |
| `conflictosDeVersion` deja de declarar | deduplicar NO es elegir una versión… |
| `soloLoNuevo` devuelve todo | las 45 frases comunes entran UNA vez… |
| se saca el `normalize('NFC')` del borde | 3 tests |
| la clave del conocimiento vuelve al ORDINAL | la clave sale del CONTENIDO de la cláusula… |
| **el CABLEADO pasa la lectura entera en vez de `soloLoNuevo(...)`** | **CABLEADO: la segunda versión no vuelve a grabar… (+1)** |
| **el CABLEADO no busca versión previa** | **CABLEADO: … (3 tests)** |
| **el CABLEADO deja de declarar el conflicto** | **CABLEADO: la divergencia sale como hueco CONFLICTO…** |
| **el CABLEADO toma cualquier documento anterior como versión** | **CABLEADO: … (4 tests)** |
| **la clave del hueco pierde el documento** | **CABLEADO: … con la obra en la clave** |

Las cinco últimas son las que **faltaban**: las cuatro funciones estaban probadas por separado y el
bucle que las usa no tenía un solo test. Las tres primeras de esas cinco sobrevivían con la suite en
verde, y con una de ellas la cláusula de U$S 31.500 desaparecía del artefacto.

---

## D · Los números que justifican el umbral

> **DATO REAL**, corrido con las funciones del módulo sobre las lecturas cacheadas del pipeline
> (47 documentos distintos, 1.081 pares).

| | contención | Jaccard | proporción |
|---|---|---|---|
| el par real (las dos copias del contrato) — 34 de 35 frases | **0,971** | 0,944 | 1,000 |
| el par siguiente (dos contratos con el mismo machote) | **0,455** | 0,125 | 0,324 |
| pares en la zona [0,60 – 0,85) | **ninguno** | | |

**Sobre este corpus las dos métricas dan el mismo veredicto** — con Jaccard 0,944, por encima del
corte, el resultado de hoy sería idéntico. La razón para elegir contención no es el par que ya
tenemos sino cuánto aguanta cada una (**CÁLCULO**, no medición): sobre 35 frases con `k` cláusulas
cambiadas de cada lado, Jaccard deja de reconocer la misma revisión en `k = 3` (0,842) y contención
aguanta hasta `k = 5` (0,857).

---

## LOS NUEVE LÍMITES

> No son pendientes. Cada uno **bloquea** el criterio que toca.

**1 · Hay dos versiones del contrato de Quattropani y difieren en el saldo. Es del dueño.**
Una dice «Saldo: el monto restante es de (U$S 31500 + IVA)» y la otra omite el monto. El sistema lo
declara como `CONFLICTO` y **no elige**. Hasta que el dueño decida cuál rige, las dos siguen vivas
aportando frases. Bloquea **A3** y cualquier uso del contrato como fuente de alcance.

**2 · El umbral está ejercitado por 10 pares, no por mil.**
De los 47 documentos del corpus **sólo 5 llegan a 8 frases**, el mínimo para comparar. «No hay ningún
par en la zona gris» es cierto y es débil: está dicho sobre 10 pares comparables, uno verdadero y
nueve negativos. Bloquea la generalización de **D**.

**3 · La deduplicación es POR CORRIDA; el almacén acumula por slug del NOMBRE.**
Bajo qué documento quedan las 33 frases comunes lo decide el orden en que Drive los devuelve
(`inventario-drive.mjs`, `order by path, name`). Es estable mientras nadie mueva ni renombre el
archivo. El día que alguien lo mueva, las frases entran bajo el otro slug, ninguna clave choca —son
claves distintas— y **el duplicado vuelve en silencio**. Hay un test que fija que el orden no cambia
*cuánto* entra, y que sí cambia *bajo qué documento*. No está resuelto.

**4 · La detección de versiones mira frases con categoría, no el texto entero.**
Dos versiones que difieran sólo en párrafos que ningún extractor categoriza se verían idénticas y su
divergencia no se declararía. No sé cuántos casos hay.

**5 · Un anexo de ≥8 frases cuyo tamaño sea ≥60 % del contrato se declararía versión suya.**
Es el borde de la guarda de tamaño. Está fijado en un test negativo, no resuelto.

**6 · El cruce exclusión↔cómputo nunca corrió con un cómputo real.**
Sin `--con-computo` los ítems son `[]`. No hay ningún cómputo offline en el repo y el caché sólo
guarda hashes. El hallazgo más caro del circuito está verificado con casos sintéticos.

**7 · 97 de las 111 líneas de cierre no dan coeficiente legible.**
Todas declaradas con su motivo, pero es la mayoría. No se investigó si es límite del lector o de las
planillas: haría falta abrir tres o cuatro y mirarlas.

**8 · 12 planillas siguen sin leerse**, cada una con su motivo en el bloque `corrida`. Una es un
Google Sheet nativo que el circuito todavía no exporta.

**9 · Se tocó código compartido de `main`.**
`biblioteca.mjs` (la ficha de documento avanza), `practica-historica.mjs` (la advertencia nombra su
corpus) y `plano/documental.mjs` — este último con un cambio de comportamiento para consumidores
preexistentes: `claseDocumental` ya no devuelve `PLIEGO` por descarte sino `SIN_CLASIFICAR` (peso 8,
debajo de `PLANILLA` 5 y `REFERENCIA` 6), y con eso cambian `documental.mjs:175` (`ingerir`, el peso
de los hechos) y `capacidades.mjs:237` (`filaRol` devuelve `null` y esos documentos pierden su fila
de ROL). Probado a nivel unitario, no a nivel de esos consumidores. (`documento-proyecto.mjs` NO va
en esta lista: es nuevo de esta rama, no existe en `main`.)

---

## Comandos y salidas

```
node orquestador/scripts/estudiar-documentos-word.mjs
  DETECTADO 57 · PARSEADO 54 · INTERPRETADO 14 · INTEGRADO_PROYECTO 14 · FALLO 3
  COPIA DUPLICADA  1 de 57
  OTRA VERSIÓN     1 de 57 · 34 frase(s) en común (97 %) · 2 divergencias CONFLICTO
  ✓ biblioteca v10 · DOCUMENTO_PROYECTO 141 · huecos FALTA_DATO 196 · CONFLICTO 2

node orquestador/scripts/estudiar-cotizaciones-drive.mjs --refrescar
  114 planillas candidatas · 64 plantilla interna · 38 formato del cliente · 12 no leídas
  ✓ biblioteca v11 · 649 conocimientos · PRACTICA_HISTORICA_ECSAS 287 CANDIDATO

npm run orq:test   exit 0
npm run typecheck  exit 0
npx eslint .       exit 0
```
