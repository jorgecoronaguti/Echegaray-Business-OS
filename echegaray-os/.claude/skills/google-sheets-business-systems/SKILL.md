---
name: google-sheets-business-systems
description: "Criterio profesional de nivel experto para diseñar, auditar y operar Google Sheets como sistemas de negocio reales (finanzas, tesorería, control de gestión, obras, presupuestos, compras, proveedores, cobranzas, HH, productividad, avance, certificaciones, adicionales, equipos). Activar SIEMPRE antes de tocar un Sheet real de Echegaray -- lectura, escritura o rediseño. Nunca improvisar una fórmula aislada cuando el archivo merece tratarse como un sistema."
allowed-tools: Read, Bash, WebSearch, WebFetch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "No aplica (dominio técnico) -- hereda criterio de negocio de finanzas-tesoreria-construccion, contabilidad-constructoras, costos-presupuestacion, gestion-empresarial-riesgos según el dominio del Sheet"
---

# Google Sheets como Sistemas de Negocio

## Propósito

Tratar cada Google Sheet real de Echegaray como lo que es: un sistema operativo de negocio temporal o permanente, no una hoja de cálculo suelta. Esta skill aporta el criterio de arquitectura, fórmulas, modelado financiero, UX y controles para que cualquier lectura, edición o rediseño de un Sheet real sea profesional -- nunca una fórmula improvisada aislada. Decide el *cómo* técnico de construir/mejorar un Sheet; el *qué dato hace falta y por qué* lo sigue decidiendo la skill de dominio de negocio correspondiente (`finanzas-tesoreria-construccion`, `contabilidad-constructoras`, `costos-presupuestacion`, `gestion-empresarial-riesgos`, etc.).

## Alcance

Cubre: arquitectura de spreadsheets (separación captura/cálculo/control/presentación), selección de fórmulas, modelado financiero (devengado vs. percibido), UX operativa, controles de calidad de dato, performance, protocolo obligatorio de auditoría antes de editar, y el criterio de cuándo un Sheet debe migrar (parcial o totalmente) al Business OS/Supabase.

No cubre: qué dato de negocio hace falta capturar o qué decisión soporta (skill de dominio), ni el mecanismo de integración con una API externa una vez que el dato ya sale de Sheets (`integraciones-apis-sistemas-externos`), ni cómo leer un archivo Drive por primera vez sin tocarlo (`discovery-drive-echegaray`/`lectura-drive-documentos-multiformato`).

## Preguntas profesionales que debe hacer

1. ¿Para qué existe este Sheet, quién lo usa, con qué frecuencia, y qué decisión soporta hoy? (nunca asumir el propósito por el nombre del archivo -- ya hay precedente real de nombres desalineados, ver `discovery-drive-echegaray`)
2. ¿Qué pestañas son captura (dato que una persona escribe), cuáles son cálculo (fórmulas), y cuáles son presentación (dashboard/resumen)? ¿Están mezcladas hoy?
3. ¿Cuál es la fuente primaria de cada dato, y qué otras pestañas/archivos son derivadas o espejo (`IMPORTRANGE`) de esa fuente? Nunca tratar un espejo como si fuera una segunda fuente independiente.
4. ¿El archivo se abre y edita en simultáneo por otra persona? Si sí, cualquier escritura mía corre riesgo real de colisión en ambos sentidos -- verificar el historial de revisiones antes y después de escribir, no asumir que el archivo está "quieto".
5. ¿Qué fórmula es la más simple que resuelve el caso? (SUMIFS/COUNTIFS antes que QUERY; QUERY antes que un LAMBDA propio; nunca INDIRECT sin justificación explícita)
6. ¿Este cálculo es devengado o percibido? Nunca mezclar P&L (devengado) con Cash Flow (percibido) en la misma columna sin distinguirlo explícitamente.
7. ¿Qué controles de calidad de dato faltan (duplicados, fechas inválidas, importes inconsistentes, relaciones rotas) y quién los va a mirar?
8. ¿Este Sheet debería seguir existiendo tal cual, o una parte ya debería vivir en el Business OS/Supabase?

## Protocolo obligatorio antes de editar un Sheet real

No negociable, en este orden, siempre:

### A. Entender
Para qué existe, quién lo usa, con qué frecuencia, qué decisiones soporta, qué inputs recibe, qué outputs produce, qué otras fuentes dependen de él. Si no se sabe, preguntar antes de tocar -- no inventar el propósito.

### B. Auditar
Revisar el archivo **completo**, no solo la pestaña visible: todas las pestañas, estructura, fórmulas reales (no el texto convertido por un conector -- ver Errores frecuentes), rangos, validaciones, formatos, Apps Script si existe, dependencias entre pestañas y archivos (`IMPORTRANGE`), fuentes externas, errores reales, duplicaciones, cuellos de botella. Usar `spreadsheets().get()` con `fields=sheets.data.rowData.values.effectiveValue` para detectar `errorValue` reales, y `valueRenderOption=FORMULA` para ver la fórmula real detrás de cualquier valor sospechoso.

### C. Diseñar
Antes de escribir una sola celda: problema, arquitectura propuesta, qué se mantiene, qué se elimina, qué se simplifica, qué se automatiza, qué impacto tiene, cómo se valida. No hay "arreglo rápido" sin este paso para cualquier cambio que no sea trivial (agregar una fila, un dato puntual).

### D. Implementar
Vía API. Nunca un cambio destructivo sin posibilidad clara de reversión. Antes de escribir en cualquier rango que no sea "agregar fila al final de una tabla ya identificada", **leer ese rango exacto primero y confirmar que está vacío** -- nunca asumir vacío por estar lejos del contenido conocido (lección real, ver Historial de aprendizaje).

### E. Verificar
Después de cada escritura: releer el rango modificado, confirmar que la fórmula real (no solo el valor) es la esperada, confirmar que no quedó ningún `errorValue`, comprobar arrastre horizontal/vertical si corresponde, comprobar separadores de fórmula regionales, comprobar casos borde (celdas vacías, texto donde se esperaba número), comprobar que ninguna dependencia de otra pestaña se rompió.

### F. Validar con números reales
No dar una mejora por terminada porque "la fórmula parece correcta". Comparar contra el dato fuente, contra un total conocido, contra una muestra a mano, contra un período ya conocido. Un resultado que "se ve razonable" no es un resultado verificado.

## es-AR: la trampa que ya rompió el OS cuatro veces (no es un detalle)

**Todo el Drive de Echegaray está en español Argentina.** Esto no es cosmético: cambia la sintaxis de las fórmulas y ya causó errores reales en producción.

- **Separador de argumentos = `;` (punto y coma), NO coma.** Porque la coma es el separador decimal. `=SUMA(A1;B1)` — con coma da error.
- **Decimal = coma, miles = punto**: `$1.234.567,89`. Un número escrito con punto decimal entra como texto y **rompe toda fórmula que lo sume**.
- **Fechas DD/MM/YYYY.** Una fecha en formato US entra como texto o como el día equivocado (07/05 puede ser 7 de mayo o 5 de julio: el error es silencioso y no se nota hasta que el total no cierra).
- **Nombres de función en español** en la UI (SUMA, SI, BUSCARV, CONTAR.SI) aunque la API acepte los ingleses.
- **REGLA OPERATIVA**: después de escribir una fórmula por API, **releer la celda y verificar que no devuelva `#ERROR!` / `#¿NOMBRE?`**. Escribir sin verificar es cómo se dejan planillas rotas en silencio.
- **Un valor que debía ser número y entró como texto no da error visible**: el total simplemente lo ignora. Si un total "no cierra por poco", sospechar de esto antes que de la fórmula.

## Fórmulas que escalan (y las que se rompen al crecer)

- **ARRAYFORMULA** es la diferencia entre una planilla que aguanta y una que se rompe: una sola fórmula en la fila de encabezado que se aplica a toda la columna, en vez de arrastrar la misma fórmula 2.000 veces. Ventajas: no se "pierde" al insertar filas, no queda una fila sin fórmula, y se corrige en un solo lugar. Combinada con `SI(fila_vacía; ""; cálculo)` evita llenar de ceros las filas vacías.
- **Preferir funciones de rango completo** (SUMAR.SI.CONJUNTO / SUMIFS, CONTAR.SI.CONJUNTO, QUERY) sobre construcciones fila a fila.
- **BUSCARV es frágil**: se rompe al insertar una columna. Preferir **ÍNDICE+COINCIDIR** o **BUSCARX/XLOOKUP** — no dependen de la posición numérica de la columna.
- **LET** para no repetir el mismo subcálculo cinco veces dentro de una fórmula larga: más rápido y mucho más legible al auditar.
- **Nunca hardcodear un número dentro de una fórmula** (una alícuota, un tipo de cambio, un porcentaje de margen): va a una celda de parámetros con etiqueta, y la fórmula la referencia. Un número enterrado en una fórmula es imposible de auditar y nadie recuerda de dónde salió.

## IFERROR: la función más abusada de todas

Envolver todo en `SI.ERROR(...; 0)` es la forma más común de **esconder un problema en vez de resolverlo**.

- Un `#N/A` está diciendo algo real: "esta clave no existe en la tabla destino". Convertirlo en 0 hace que un total dé bien y sea falso.
- Regla: **usar SI.ERROR solo cuando el error es esperado y conocido** (ej. división por cero en un ratio cuando el denominador legítimamente puede ser 0), y **nunca** para tapar una búsqueda que falla.
- Al auditar un Sheet ajeno, **buscar los SI.ERROR y preguntarse qué están tapando**. Es donde suelen esconderse las diferencias que nadie explica.

## Celdas combinadas: el asesino silencioso de las planillas de datos

En una **tabla de datos**, las celdas combinadas rompen ordenar, filtrar, tablas dinámicas, fórmulas de rango y la escritura por API (ya causó fallas reales en este OS).

- **En zonas de datos: nunca combinar.** Si hace falta un efecto visual de agrupación, usar formato (bordes, color, negrita) o "Centrar en la selección" — se ve igual y no rompe nada.
- Combinar es aceptable **solo** en encabezados de presentación de un dashboard que nadie va a ordenar ni procesar.
- Una tabla que hay que "desarmar" antes de poder usarla no es una tabla: es un informe impreso guardado en una planilla.

## Integridad: proteger lo que no se debe tocar

- **Rangos protegidos** sobre las celdas de fórmula y los parámetros: evita que alguien pise una fórmula con un número escrito a mano — el modo más común de romper un modelo sin que nadie se entere.
- **Validación de datos** (listas desplegables) en toda columna categórica: obra, proveedor, estado, tipo. Sin ella aparecen "San Francisco", "san francisco" y "S. Francisco" como tres cosas distintas, y ningún resumen vuelve a cerrar.
- **Rangos con nombre** para los parámetros clave: una fórmula que dice `Parametros!Alicuota_IVA` se audita sola; una que dice `$B$47` no.
- **Formato condicional** para que el error se vea: montos negativos, fechas vencidas, celdas que deberían tener dato y están vacías.

## Cómo auditar un Sheet ajeno (protocolo de diagnóstico)

Antes de tocar una celda, entender qué se está mirando:

1. **Mapear las pestañas**: cuáles son entrada, cuáles cálculo, cuáles presentación. Si están mezcladas, ese ya es el hallazgo principal.
2. **Buscar los números pegados a mano donde debería haber fórmula** — el defecto más frecuente y el que más silenciosamente miente.
3. **Rastrear una cifra clave de punta a punta** (ej. el total de un dashboard) hasta su origen. Si el rastro se corta en un número escrito a mano, el modelo no es confiable.
4. **Buscar errores visibles y ocultos**: `#REF!`, `#N/A`, `#VALOR!`, y los `SI.ERROR` que los tapan.
5. **Verificar consistencia de rangos**: fórmulas que suman `A2:A500` en una tabla que ya tiene 700 filas — el clásico total que se queda corto sin avisar.
6. **Contrastar totales por dos caminos independientes** (SUMAR.SI.CONJUNTO vs. QUERY vs. tabla dinámica). Si no coinciden, hay un supuesto escondido. *Este control ya evitó una alarma falsa real en el Flujo de Caja.*
7. **Revisar filas y columnas ocultas**: suelen contener el ajuste manual que nadie documentó.

## Arquitectura de spreadsheets

- **Separación captura / cálculo / presentación**: nunca calcular directamente sobre la pestaña donde alguien escribe a mano -- eso hace que romper una fórmula sea un accidente de un click. Estructura de referencia (adaptar, no copiar literal): datos crudos/captura → cálculos → dashboard/presentación. Si un Sheet ya mezcla las tres capas (como varios de los reales de Echegaray), no es motivo para reconstruir todo de cero -- es motivo para no agregar más mezcla nueva encima.
- **Fuente primaria vs. derivada**: antes de tratar dos pestañas como "dos fuentes que hay que reconciliar", confirmar si una es en realidad un espejo (`IMPORTRANGE`) de la otra -- ya pasó en este archivo real (`CF_COB`/`CF_GAS` del P&L son puro espejo de `02_Cobranzas`/`Compras` del Cash Flow, no datos propios).
- **Claves únicas**: cualquier ledger de movimientos reales necesita una columna ID estable para poder deduplicar y para que una futura sincronización con el OS tenga con qué comparar.
- **Evitar duplicación de captura**: si dos pestañas (o dos archivos) capturan el mismo hecho de negocio por separado (ej. cobros en Cash Flow y en Control de Gastos), es una duplicación real que hay que nombrar explícitamente, no asumir que se reconcilia sola.
- **Trazabilidad**: todo dato cargado a mano declara fecha, fuente y quién lo cargó -- sin esto, un saldo "de hoy" puede en realidad ser de hace tres semanas sin que nadie lo note.
- **Protección**: rangos con fórmulas críticas (paneles, pivots, cálculos consolidados) deberían protegerse (Datos → Proteger rangos) con advertencia o restricción, para que una edición manual normal del día a día no los pise por accidente -- esto es best practice estándar de Google Sheets, no una idea propia.
- **Interoperabilidad con Supabase/OS**: diseñar pensando en que, si este dato migra, necesita un ID estable, un origen declarado y una fecha real -- el patrón `origen`/`fuente_legacy` ya usado en el esquema del OS es el que hay que anticipar.

## Selección de fórmulas (criterio, no catálogo)

No usar una fórmula más compleja si una más simple y mantenible resuelve el mismo caso:

| Necesidad | Preferir | Antes que |
|---|---|---|
| Sumar/contar con condición simple (1-3 criterios fijos) | `SUMIFS`/`COUNTIFS` | `QUERY`/`SUMPRODUCT` |
| Tabla resumen cruzada (fila × columna) reutilizable | Tabla dinámica nativa (Insertar → Tabla dinámica) | `QUERY` armada a mano |
| Selección/filtrado de filas con condición | `QUERY` o `FILTER` | fórmulas fila por fila arrastradas |
| Búsqueda de un valor por clave | `INDEX`/`MATCH` o `XLOOKUP` | `VLOOKUP` (más frágil ante columnas insertadas) |
| Cálculo intermedio repetido dentro de una fórmula larga | `LET` | repetir la misma subfórmula varias veces |
| Lógica reutilizable en todo el archivo | Función con nombre (`Datos → Funciones con nombre`) | copiar/pegar la misma fórmula larga en cada celda |
| Traer datos de otro archivo | `IMPORTRANGE`, pero con patrón de "hoja caché" (ver abajo) | múltiples `IMPORTRANGE` sueltos por el archivo |
| Referencia dinámica a un rango/hoja por nombre | Justificar explícitamente antes de usar `INDIRECT` | usar `INDIRECT` por comodidad |

**Patrón de hoja caché para `IMPORTRANGE`** (evidencia real: performance se degrada notablemente después de 10-15 `IMPORTRANGE` en el mismo archivo, y cada `IMPORTRANGE` trae rangos abiertos completos): un solo `IMPORTRANGE` por fuente externa, en una pestaña dedicada, y el resto del archivo referencia esa pestaña local con `QUERY`/`FILTER` -- nunca repetir `IMPORTRANGE` de la misma fuente en múltiples pestañas. Confirmado en este archivo real: `CF_COB` y `CF_GAS` del P&L ya siguen (sin saberlo) este patrón correcto -- un solo `IMPORTRANGE` por pestaña hacia Cash Flow.

**Rangos cerrados, no abiertos**: cada 20.000 filas vacías incluidas en un rango abierto (`A:A` en vez de `A1:A1000`) puede sumar ~1 segundo de cálculo. Usar rangos cerrados (`A5:C1000`) salvo que el archivo sea chico y no importe.

**Trampa de locale real (verificada en este archivo)**: los Sheets de Echegaray usan configuración regional en español/Argentina -- el separador de argumentos de fórmula es `;`, no `,`. Toda fórmula generada por API debe usar `;`, y todo texto en fórmulas/UI debe estar en español, porque ese es el idioma real del archivo.

**Trampa real de comparación de texto con emoji/caracteres especiales**: `SUMIFS`/`COUNTIFS`/`SUMIF` con un criterio de texto que contiene un emoji (ej. `"✅ Pagado"`) puede fallar silenciosamente a devolver el resultado esperado sin marcar error -- devuelve un número, pero el número está mal, porque la comparación de criterio no matchea todas las filas esperadas. Verificado en este archivo real: una fórmula `SUMIFS` con ese criterio devolvió un total muy distinto al mismo cálculo hecho con `QUERY` sobre el mismo dato. Antes de confiar en un `SUMIFS`/`COUNTIFS` con texto no trivial (emoji, tildes, mayúsculas mezcladas), validar con `COUNTIF` puntual que el conteo de coincidencias es el esperado, o preferir `QUERY`/`FILTER` que sí demostraron matchear correctamente el mismo criterio.

## Modelado financiero

**Regla absoluta, ya establecida en el `CLAUDE.md` raíz**: P&L = devengado. Cash Flow = percibido. Nunca mezclar ambos criterios en la misma columna o el mismo total.

Distinguir siempre, explícitamente, en cualquier ledger financiero: fecha económica (devengamiento) vs. fecha de factura vs. fecha de vencimiento vs. fecha de pago vs. fecha de cobro. Un ledger real de Echegaray (`02_Cobranzas`) ya modela bien esta distinción (`Fecha de Venta`, `Fecha cobro` exacta, `Fecha cobro` por mes, `Estado`, `Probabilidad %`, `Monto ponderado`) -- es el estándar a imitar en otras pestañas que no lo tienen.

Nunca sumar cobros "esperados" sin ponderar por probabilidad real de cobro cuando esa información existe (`Monto ponderado`) -- sumar el bruto sobreestima la posición de caja proyectada.

Cheques/eCheq: un cheque emitido no es dinero ya debitado. El saldo bancario disponible real = saldo de banco − cheques emitidos no debitados − consumos de tarjeta no debitados. Ya construido en `Caja`/`RESUMEN` de Cash Flow -- replicar este patrón en cualquier otro cálculo de disponibilidad real.

Pagos parciales: un ledger de compras/gastos que separa "Monto Pagado" de "Monto Parcial" en columnas distintas necesita sumar ambas para el saldo realmente pendiente -- sumar solo una de las dos subestima o sobreestima la deuda real (hallazgo pendiente de terminar de verificar en `Compras`, ver Historial de aprendizaje).

## UX de Sheets operativos

- Inputs (celdas para escribir) visualmente distintos de fórmulas -- color de fondo o de fuente distinto, no solo "se sabe de memoria".
- Dropdowns (`Datos → Validación de datos`) para cualquier campo de estado/categoría con valores fijos -- basados en un rango con nombre, no tipeados a mano en cada validación, para que agregar una opción nueva no obligue a editar la validación en cada celda.
- Encabezados congelados, columnas en orden lógico (identificación → fecha → monto → estado), estados con color/emoji consistente si el archivo ya usa ese patrón (no inventar uno nuevo en paralelo).
- Minimizar información técnica (fórmulas, IDs internos) en la vista que usa la persona operativa -- eso va en una pestaña de cálculo separada, no en la misma vista de captura.
- Evitar que la persona operativa tenga que scrollear a una columna lejana para ver un dato que usa todos los días.

## Controles de calidad de dato

Evaluar en cualquier planilla crítica: duplicados (via `COUNTIF`/`UNIQUE` comparando cantidad de filas), fechas inválidas o fuera de rango razonable, importes inconsistentes (negativos donde no corresponde, ceros sospechosos), relaciones rotas (una obra/cliente referenciado que no existe en el maestro), pagos superiores a la obligación, cobros superiores a lo facturado, gastos sin obra u obra sin categoría, vencidos vs. pendientes, diferencias de conciliación entre dos fuentes del mismo hecho.

Preferir formato condicional + `COUNTIF` para detectar duplicados en curso (proceso continuo) antes que una revisión manual puntual.

## Performance

Antes de agregar una fórmula nueva a un archivo grande, evaluar: ¿es de columna completa (`A:A`) pudiendo ser un rango cerrado?, ¿es volátil (`NOW()`, `HOY()`, `ALEATORIO()`) sin necesidad real?, ¿hay ya un `IMPORTRANGE` de esa misma fuente en otra pestaña que se puede reutilizar en vez de duplicar?, ¿el mismo `QUERY` ya existe en otro lado?, ¿hace falta fila por fila o alcanza una tabla dinámica/`QUERY` agregado?, ¿hay una dependencia circular?, ¿el tamaño esperado de filas justifica Apps Script en vez de fórmulas nativas?, ¿esta lógica ya debería vivir en el OS/Supabase en vez de en el Sheet?

## Colisión de edición concurrente (hallazgo real, no teórico)

Estos archivos son usados en vivo por Rodrigo/Jorge mientras se los audita o edita. Antes y después de cualquier sesión de edición, revisar el historial de revisiones (`drive.revisions().list`) para confirmar si hubo un guardado de otra persona en el medio -- una edición humana concurrente puede pisar contenido agregado, y viceversa. Esto no se resuelve evitando editar el archivo real (es el archivo que la empresa usa), se resuelve verificando el historial como rutina, no como excepción.

## Errores frecuentes

- Confiar en el snippet de texto de un conector (Drive) para afirmar que una fórmula está rota -- el snippet puede renderizar mal una tabla de Excel con referencias estructuradas o una referencia a libro externo, mostrando `#REF!` donde el archivo real, abierto con `openpyxl`/Sheets API, calcula bien. Siempre verificar con `data_only=True` (Excel) o `effectiveValue` (Sheets API) antes de afirmar una fórmula rota.
- Asumir que dos números distintos que deberían "coincidir" son un bug -- primero verificar si representan conceptos legítimamente distintos (ej. deuda actual vs. proyectada, monto parcial vs. total) antes de tratarlo como inconsistencia.
- Escribir en un rango "lejano" sin leerlo primero -- una tabla dinámica u otro contenido puede expandirse ahí sin que sea evidente a simple vista.
- Usar `,` como separador de argumentos en un archivo con configuración regional en español -- falla con "Formula parse error" aunque la sintaxis sea válida en inglés.
- Confiar en `SUMIFS`/`COUNTIFS` con criterio de texto con emoji sin validar el conteo -- puede devolver un número plausible pero incorrecto.
- Usar `append()`/`INSERT_ROWS` sobre una tabla que tiene contenido en las mismas filas en otras columnas (ej. un panel de resumen al lado de un ledger) -- inserta filas y desplaza ese contenido, rompiendo referencias que apuntaban a la fila original.
- No revisar el historial de revisiones antes/después de editar un archivo que otra persona usa en simultáneo.

## Información necesaria

- Estructura real de tabs/columnas del archivo (nunca asumida, siempre leída).
- Fórmulas reales detrás de cualquier valor que se vaya a usar como base de un cálculo nuevo.
- Historial de revisiones reciente antes de escribir.
- Quién usa el archivo, con qué frecuencia, y si hay una sesión de edición concurrente probable.

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| El cálculo es de caja/tesorería/capital de trabajo | `finanzas-tesoreria-construccion` |
| El cálculo es de resultado devengado/P&L | `contabilidad-constructoras` |
| El cálculo es de costos/presupuesto de obra | `costos-presupuestacion` |
| El cálculo es de riesgo/concentración de cliente o proveedor | `gestion-empresarial-riesgos` |
| Se decide migrar una parte del Sheet al OS | `integraciones-apis-sistemas-externos` |
| Es la primera lectura de un archivo nunca visto | `discovery-drive-echegaray` / `lectura-drive-documentos-multiformato` |

## Sistema de fuentes

1. **Conocimiento profesional estable**: principios de arquitectura de spreadsheets, selección de fórmulas, controles de calidad -- no cambian con el tiempo.
2. **Documentación oficial de Google (cambiante)**: soporte de Google Docs Editors, comportamiento de funciones (`QUERY`, `LAMBDA`, funciones con nombre, `IMPORTRANGE`), límites de la API de Sheets -- verificar antes de asumir un límite o comportamiento específico como vigente.
3. **Documentación interna de Echegaray**: los archivos reales ya auditados (Cash Flow, P&L, Control de Gastos) son el precedente concreto de qué patrones ya existen y funcionan, y cuáles están rotos.
4. **Datos estructurados del OS**: el patrón `origen`/`fuente_legacy` ya usado en el esquema (ver `integraciones-apis-sistemas-externos`).
5. **Experiencia histórica de esta sesión**: ver Historial de aprendizaje.
6. **Interpretación profesional**: lectura del caso concreto.
7. **Recomendación**: la solución más simple, robusta y mantenible que sea suficiente -- nunca la más sofisticada posible.

## Política de fuentes externas y protocolo de vigencia

Antes de diseñar o corregir una capacidad importante de un Sheet (no un ajuste puntual), verificar con `WebSearch` documentación oficial actual de Google Sheets/Apps Script y comparar alternativas -- no depender solo de conocimiento interno. Registrar fecha de consulta. Los límites de rendimiento, el comportamiento de funciones nuevas (`LAMBDA`, funciones con nombre, `MAP`/`BYROW`/`BYCOL`) y las mejores prácticas de la comunidad cambian con las versiones de Sheets.

## Jurisdicción aplicable

No tiene jurisdicción normativa propia -- es un dominio técnico. Cuando el contenido del Sheet es financiero, contable, de costos o de riesgo, hereda el criterio de negocio de la skill de dominio correspondiente; esta skill no decide qué es correcto en términos de negocio, decide cómo construirlo/auditarlo bien en Sheets.

## Límites de certeza

No puede afirmar que una fórmula está rota sin verificar el valor real (`effectiveValue`) o la fórmula real (`FORMULA` render), nunca a partir de un snippet de texto convertido. No puede afirmar que dos cifras distintas son una inconsistencia sin antes descartar que representen conceptos legítimamente distintos. No puede garantizar que una escritura no colisionó con una edición humana concurrente sin revisar el historial de revisiones antes y después.

## Gaps de conocimiento conocidos (primera versión)

No se probó todavía la creación de validaciones de datos (dropdowns) ni de protección de rangos vía la API de Sheets en un archivo real de Echegaray -- se investigó y describió el criterio (ver arriba) pero la primera aplicación real queda pendiente. No se evaluó todavía si algún cálculo de este archivo justifica Apps Script en vez de fórmulas nativas.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

## Historial de aprendizaje (append-only, más reciente arriba)

- **2026-07-09 (c)** — Auditoría integral + corrección del Flujo de Caja. Tres reglas nuevas: (1) **Al cambiar la métrica de las filas de detalle de un bloque (ej. neto→bruto), buscar primero las filas "catch-all" definidas como `total − detalle`** — una fila de ajuste que evaluaba 0 con la métrica vieja se vuelve basura silenciosa con la nueva (caso real: "Otros ingresos" = neto_total − B7 − B8 pasó de $0 a −$47M cuando B7/B8 pasaron a bruto; se detectó solo porque la validación pre-definida no cerró). (2) **`values().batchUpdate` NO es atómico ante un error de parseo de rango a mitad de la lista** — asumir que pudo haber escritura parcial y re-verificar las celdas ya enviadas, no solo reintentar. (3) **Validar el criterio de monto contra la fuente fiscal oficial cuando exista** (TOTAL Bruto de cobranzas coincidió exactamente con el Libro IVA Ventas del mes — $24.200.000 IMOTOR); un criterio de caja que no coincide con el comprobante fiscal es sospechoso. Además: los formatos condicionales por API en archivo es_AR requieren separador `;` en CUSTOM_FORMULA (nombres de función en inglés sí se aceptan). Clasificación: **D** (todo reproducido con evidencia directa el mismo día).

- **2026-07-09 (b)** — Sesión de consolidación de Sueldos y su propagación a `04_CFSemanal`/`05_CFMensual`/`RESUMEN`. Seis reglas nuevas validadas con evidencia directa: (1) **Reemplazo por ancla en SUMIFS**: para agregar criterios a la misma fórmula en 52 columnas, reemplazar por un ancla de texto único común a todas — el ancla NUNCA incluye el paréntesis de cierre (incluirlo rompió la sintaxis en el primer intento), y antes de reemplazar verificar `formula.count(ancla)` == valor esperado (acá 2, porque cada fórmula tenía dos ramas SUMIFS). (2) **Redistribuir sin mover el total**: al mover un concepto de una fila a otra dentro de un mismo Total, definir ANTES la validación "total agregado idéntico al centavo antes/después" y verificarla — es la única prueba de que no se perdió ni duplicó dinero (verificado: Total Egresos $537.787.030,53 exacto antes y después). (3) **Filas espaciadoras en blanco dentro de un rango SUM existente** son el lugar más seguro para agregar una fila nueva: cero riesgo de desalinear el total, cero `insertDimension`. (4) **`insertDimension` de COLUMNA a mitad de hoja desplaza TODA la hoja**, incluyendo cuadros no relacionados arriba/abajo — si hay más de una tabla en la hoja, expandir `columnCount` y agregar al final, nunca insertar en el medio (incidente real revertido con `deleteDimension`). (5) **Escaneo de errores post-escritura obligatorio** sobre todo el rango tocado (`#ERROR!`, `#N/A`, `#REF!`, `#DIV/0!`) — un reemplazo masivo de fórmulas puede romper sintaxis en silencio. (6) **IMPORTRANGE entre spreadsheets requiere un clic humano único en navegador real** ("Allow access") — no es bypasseable por API/cuenta de servicio con ningún permiso (`errorValue.message: "Please use a desktop web browser to connect this sheet."`); dejar la pestaña helper visible y dar instrucciones de clic, no prometer sincronización automática. Bonus de tooling: en heredocs bash `<< 'PYEOF'`, `'\$'` en Python queda como secuencia literal de 2 caracteres y el `replace` de `$` falla en silencio (bug recurrido dos veces) — usar `'$'` sin backslash. Clasificación: **D. conocimiento interno validado** (todo reproducido y corregido con evidencia directa en la misma sesión).

- **2026-07-09** — Comparar dos modelos que deberían describir la misma realidad (`04_CFSemanal` vs `05_CFMensual`, mismo Cash Flow) reveló, en secuencia, bugs reales que ninguna auditoría aislada de un solo archivo hubiera encontrado: (1) una fórmula de "Caja inicial" corregida antes en la sesión solo se había extendido a 12 de 53 columnas; (2) la fila de alerta comparaba contra una fila de texto (emoji) en vez de la fila numérica -- nunca se disparaba, en las 53 semanas; (3) la columna "Total" del año sumaba egresos solo hasta la semana 13 de 53, arrastrada sin actualizar desde que el archivo se extendió; (4) **doble conteo real de $243.357.324**: una fila "catch-all" (sin filtro por unidad de negocio) y las filas específicas por unidad de negocio capturaban las mismas 191 filas de compras porque la primera no excluía las categorías ya cubiertas por las segundas; (5) una fila ("Financiero/deuda") leía de una pestaña marcada DEPRECADA en vez de la fuente real; (6) un valor pegado a mano cortaba la cadena de arrastre semana a semana, generando un salto artificial de ~$122M en una sola semana. Después de corregir los seis, el cierre de año proyectado pasó de "-$110M sin fundamento claro" a **-$123.951.492 verificado y coincidente entre ambos modelos** -- monetariamente muy distinto (~$240M+ de diferencia) al que mostraba el archivo roto. **Regla nueva**: cuando existan dos vistas (semanal/mensual, resumen/detalle) que describan el mismo hecho económico, compararlas activamente es una técnica de auditoría en sí misma -- la discrepancia entre ambas es señal, no ruido a ignorar. Clasificación: **D. conocimiento interno validado** (seis bugs reales, reproducidos y corregidos con evidencia directa el mismo día).

- **2026-07-09** — Diagnostiqué una celda como "texto tipeado a mano" solo porque `valueRenderOption=FORMULA` y `FORMATTED_VALUE` no mostraban una fórmula visible. Era falso: eran celdas de salida de una tabla dinámica real (6 pivots reales en `RESUMEN` de Cash Flow, cada uno filtrado por un estado de negocio distinto -- Cuenta Corriente, no debitado, Pendiente, Proyectado). El campo `pivotTable` solo aparece si se lo pide explícitamente en el `fields` mask de `spreadsheets().get()` (`fields='sheets.data.rowData.values.pivotTable'`) -- ni `FORMULA` ni `FORMATTED_VALUE` lo revelan. **Regla nueva**: antes de afirmar que una celda con valor pero sin fórmula visible es "manual/estática/frágil", pedir el campo `pivotTable` explícitamente para descartar que sea la salida de un pivot. Clasificación: **D. conocimiento interno validado** (reproducido y confirmado con evidencia directa el mismo día).

- **2026-07-09** — Sesión de auditoría profunda de `Flujo de Caja - Cash Flow` (archivo real, 11+1 pestañas). Aprendizajes reales incorporados arriba: (1) el snippet de texto del conector de Drive puede mostrar `#REF!` falso sobre una tabla de Excel con referencias estructuradas -- verificado que el archivo real calculaba bien; (2) `SUMIFS`/`COUNTIFS` con criterio de texto con emoji puede devolver un total incorrecto sin marcar error -- verificado comparando contra `QUERY` sobre el mismo dato; (3) `append()`/`INSERT_ROWS` desplazó un panel de resumen que vivía en las mismas filas que un ledger, rompiendo sus referencias -- causa raíz: panel y ledger no deben compartir el rango de filas donde se anticipan inserciones futuras; (4) una tabla dinámica creada por API tiene tamaño dinámico no anticipable a simple vista -- escribir contenido "debajo" sin leer primero el rango completo generó dos colisiones reales; (5) Rodrigo guardó una edición del archivo mientras se auditaba/escribía, y esa edición borró parte de contenido agregado en la misma sesión -- confirmado comparando revisiones de Drive antes/después; (6) el archivo usa configuración regional española (`;` como separador de fórmula), no inglesa. Clasificación: **C. patrón probable** para (1)/(2)/(6) (ya verificados dos veces cada uno en este archivo), **D. conocimiento interno validado** para (3)/(4)/(5) porque se reprodujeron y corrigieron con evidencia directa en la misma sesión.

## Relación con el OS

- **Áreas**: transversal -- sirve a cualquier área que dependa de un Sheet real (Administración/Finanzas hoy, pero el mismo criterio aplica a HH, Compras, Obras cuando se audite esos Sheets).
- **Capacidades existentes**: ninguna migración completa todavía; el patrón `origen`/`fuente_legacy` del OS es el destino de referencia si una parte de un Sheet migra.
- **Centro de Acción**: candidato futuro para alertas de "archivo no actualizado" o "dato faltante crítico" (ej. `Caja` sin cargar) una vez que exista una sincronización real.
- **Dashboard**: no aporta alertas propias hoy -- las auditorías de esta skill retroalimentan `finanzas-tesoreria-construccion`/`gestion-empresarial-riesgos` cuando encuentran un hallazgo de negocio real.
- **Post Mortem**: no aplica directamente.
- **Memoria del proyecto**: cualquier hallazgo de negocio real encontrado auditando un Sheet (no un patrón técnico) se documenta en la skill de dominio correspondiente, no acá -- acá solo vive el criterio técnico de cómo se construyó/verificó.
- **Futuros agentes/automatización**: la verificación de fórmulas/errores (clase A, determinística) es automatizable. Cualquier decisión de "qué número es el correcto" ante una discrepancia de negocio real requiere confirmación humana (clase E) -- nunca se resuelve solo.

## Prohibido

No afirmar que una fórmula está rota sin verificar el valor/fórmula real. No escribir en un rango sin leerlo primero para confirmar que está vacío. No usar `,` como separador de fórmula en un archivo con configuración regional española. No tratar dos cifras distintas como inconsistencia sin descartar que sean conceptos legítimamente distintos. No usar una fórmula compleja (`QUERY`, `LAMBDA`, `SUMPRODUCT`) cuando una más simple (`SUMIFS`, tabla dinámica nativa) resuelve el mismo caso. No dar una mejora por terminada sin validarla contra un número real conocido.
