// LA ESPECIE DE CADA COLUMNA DE `COMPRAS` — el formato sale de lo que la columna ES, no de una lista.
//
// ═══ EL DEFECTO QUE ESTO CIERRA (15/08/2026) ═══
//
// `Compras` es la pestaña donde el dueño tipea todos los días y la de mayor volumen de defectos de
// formato del archivo. Medido sobre el archivo real con `readSheetUserFormats`:
//
//   · `AD · Fecha de caja`: **699 celdas** (AD5 a AD779) con `numberFormat: undefined`, dibujando el
//     serial pelado — `AD5=46027`, `AD6=46027`. `AD4` sí tiene `DATE/dd/mm/yyyy`.
//   · `T · Monto Pagado`: 18 celdas sin formato (`T8=124751`, `T23=6590,71`, `T144=321249,63`…).
//   · `M163=105790,921`: una celda suelta sin formato en la columna de Importe.
//   · Columnas de TEXTO declaradas numéricas: `S · Total o Parcial` en CURRENCY (521 celdas que dicen
//     "Total"/"Parcial"), `AC · Rubro de caja` en DATE (871 celdas que dicen "Servicios
//     recurrentes"), `AE`/`AF` en NUMBER, `I · Unidad de Negocio` en CURRENCY, `D` en DATE cuando sus
//     877 celdas son el TEXTO que devuelve una fórmula. Y `G`/`H`/`K` con celdas sueltas en DATE.
//
// ═══ LA CAUSA DE LAS 699: EL VALOR VA SÓLO AL ANCLA, EL FORMATO TIENE QUE IR A TODO EL DERRAME ═══
//
// `AD` no la llena nadie fila por fila: es una `ARRAYFORMULA` anclada en `AD4` que escribe
// `scripts/rubro-caja-sheet.mjs`. Ese script hace lo correcto con el VALOR —"nunca se escribe el
// derrame de una ARRAYFORMULA, sólo su ancla"— y por simetría hizo lo mismo con el FORMATO: pone
// `numberFormat` en `AD4` y en ninguna otra. **El derrame no hereda el formato del ancla.** Cada celda
// derramada tiene `userEnteredFormat` vacío, y una fecha sin formato de fecha es un entero.
//
// La regla del derrame vale para el valor y se INVIERTE para el formato:
//
//     EL VALOR VA SÓLO AL ANCLA. EL FORMATO VA A TODA LA COLUMNA, ANCLA Y DERRAME.
//
// Y NO ES COSMÉTICO. `scripts/cruce-banco.mjs` lee `Compras!A4:AD` sin `UNFORMATTED_VALUE` y filtra
// con `parseFecha(f[29])`, cuyo regex es `^\d{1,2}/\d{1,2}/\d{2,4}$`: contra `"46027"` devuelve
// `null`. Las 699 filas mal formateadas quedan AFUERA de la comparación de egresos banco↔Compras, sin
// un solo error en pantalla. El formato de esta pestaña es entrada de un control económico.
//
// ═══ POR QUÉ EL ENCABEZADO Y NO EL ESCRITOR ═══
//
// En `obras-especies.mjs` la regla es "quien ESCRIBE el valor declara su ESPECIE, en la misma línea",
// porque allá el generador es dueño de cada celda. Acá no: `Compras` la tipea el dueño, la completa
// AppSheet y la derraman seis ARRAYFORMULA distintas. Ninguna celda tiene un escritor único que pueda
// declarar nada. Lo que SÍ tiene dueño y significado estable es la COLUMNA, y su nombre está escrito
// en la fila 3 — que es además el contrato que `compras-columnas.mjs` ya obliga a usar en todo el
// repo ("por su encabezado, nunca por su letra"). Así que acá **el encabezado declara la especie**, y
// el formato sigue siendo una proyección del dato, no una lista de rangos que alguien mantiene.
//
// LA COBERTURA ES TOTAL, Y ESO ES LA MITAD DE LA CURA: de la fila 4 hasta el fondo de la grilla,
// columna por columna, celdas vacías incluidas. Un formato que nadie repone es estado que sobrevive
// para siempre — así es como 699 celdas quedaron crudas. Un encabezado que no está en la tabla de
// abajo NO se adivina: `encabezadosSinEspecie` lo devuelve y el test lo nombra.
//
// ═══ NINGÚN REQUEST DE ACÁ PUEDE TOCAR UN VALOR ═══
//
// Todo sale como `repeatCell` con una máscara `fields` que sólo nombra `userEnteredFormat.*`.
// `clasificar-request.mjs` los clasifica INOCUO por esa máscara, y el test lo verifica request por
// request. En esta pestaña un valor cambiado es plata del negocio: la garantía tiene que ser
// estructural, no una promesa.

import { letra, normalizarRotulo } from './compras-columnas.mjs'

export { letra, normalizarRotulo }

// ═══ LOS PATRONES ═══
//
// EN UN PATRÓN EL DECIMAL ES `.` Y EL DE MILES ES `,`, SIEMPRE — el locale es_AR del archivo los
// dibuja después. Es la misma trampa que documenta `formato-statement.mjs` y que ya convirtió un
// `0,00" ×"` en "003".

/**
 * IMPORTE: se conservan el "$" y los DOS DECIMALES, y es una decisión contra la convención de
 * `formato-statement.mjs` (`MONEDA_CUERPO` = `#,##0;(#,##0);"—"`, sin unidad y sin centavos).
 *
 * Ese patrón es para un ESTADO FINANCIERO —una pestaña de cierre, donde el "$" se declara una vez en
 * el total y los centavos son ruido—. `Compras` no es un estado: es el LIBRO de comprobantes, no
 * tiene fila de total, y sus importes se cruzan contra una factura que trae centavos.
 *
 * Y hay una razón que no es de gusto: `scripts/sync-caja-nucleo.mjs`, `cash-flow-rehacer.mjs` y
 * `cruce-banco.mjs` leen columnas de plata de `Compras` SIN `UNFORMATTED_VALUE` y las pasan por
 * `parseMonto`, que reconstruye el número desde el texto dibujado. Sacar los decimales del patrón
 * haría que `$54.043,44` se dibuje `$54.043` y que esos tres scripts lean 54.043: una deriva de
 * centavos sobre 850 filas producida por un cambio "de formato". El "$" y el `.00` se quedan.
 *
 * LO QUE SÍ SE ADOPTA es la CLÁUSULA DEL CERO y el paréntesis del negativo. `parseMonto("—")`
 * devuelve 0 —lo verifica el test—, así que la raya es segura para esos mismos lectores, y un cero
 * deja de leerse igual que un dato que todavía no llegó. El `[RED]` de los patrones viejos se va:
 * regla 4 de `formato-statement`, el rojo es del control, no del número — y en `Compras` un negativo
 * es una nota de crédito legítima, no una alarma.
 */
export const IMPORTE = { type: 'CURRENCY', pattern: '"$"#,##0.00;("$"#,##0.00);"—"' }

/**
 * FECHA: `dd/mm/yyyy` para toda la pestaña. Hoy conviven `d/M/yyyy` (C, Q y la cola de AD) con
 * `dd/mm/yyyy` (el ancla de AD): la propia columna AD tiene dos patrones adentro, así que unificar no
 * es opcional. Se elige el que ya declara el escritor del OS (`rubro-caja-sheet.mjs`) y el que no
 * puede leerse al revés. `parseFecha` acepta los dos (`\d{1,2}`), así que ningún lector cambia.
 */
export const FECHA = { type: 'DATE', pattern: 'dd/mm/yyyy' }

/** MES de vencimiento (`R`): se conserva `mmmm" "yy` — "junio 26" es lo que el dueño lee hoy. */
export const MES = { type: 'DATE', pattern: 'mmmm" "yy' }

/** Un contador es un contador: ni "$", ni miles, ni decimales. El cero, raya. */
export const ENTERO = { type: 'NUMBER', pattern: '0;(0);"—"' }

// ═══ UNA COLUMNA DE TEXTO NO SE DECLARA `TEXT`: SE LE SACA EL FORMATO ═══
//
// La reacción obvia a "S está en CURRENCY y dice Total/Parcial" es declararla `TEXT` (`@`). Sería un
// error, y de los caros: en Sheets, una fórmula TIPEADA A MANO sobre una celda con formato de texto
// plano **se guarda como el string `=IF(...)` en vez de evaluarse**. No es teoría sobre esta pestaña:
// `Z · Estado pago` son 1.136 fórmulas fila por fila, `D` son 877, y `AB`/`AC`/`AE`/`AF`/`AJ`/`AL` son
// derrames de ARRAYFORMULA. El día que el dueño agregue una fila y arrastre la fórmula de Z hacia
// abajo, con `@` puesto le quedaría el texto de la fórmula en la celda. Habríamos cambiado un defecto
// que no se ve por uno que rompe la pestaña.
//
// Las escrituras por API no corren ese riesgo (mandan `formulaValue` explícito), pero acá el que
// tipea es una persona, y el formato tiene que ser seguro para ella.
//
// Así que la especie de texto NO trae `numberFormat`, y la máscara `FIELDS` lo nombra igual: un campo
// nombrado en la máscara y ausente en el recurso **se BORRA**. La columna vuelve a "Automático", que
// es la declaración correcta para una columna que lleva texto y a veces una fórmula. La cobertura
// sigue siendo total —cada corrida REPONE el estado, y reponer acá es limpiar—: así se van el
// CURRENCY de `S` e `I`, el DATE de `AC` y `D`, y el NUMBER de `AE`/`AF`.

// ═══ POR QUÉ `K` Y `L` VAN CON `WRAP`, Y CUÁL ES SU COSTO ═══
//
// Medido: 74 celdas de texto libre no entran en su columna y 65 de ellas tienen la celda vecina
// OCUPADA, así que con `OVERFLOW_CELL` —el que tienen hoy— no derraman: no se recortan, DESAPARECEN.
// El peor es `L460`, 133 caracteres ("Boleta 5715127 · período 2026/06 · 22 trabajadores · base
// $1.482.692,40 · 1% $14.826,92 + act. $265,70 · Mercado Pago op. 171255712158") en 275 px donde
// entran ~43. Es la trazabilidad de un pago, invisible.
//
// Las tres opciones y por qué gana `WRAP`: `OVERFLOW_CELL` deja 65 celdas invisibles; `CLIP` las deja
// invisibles y encima sin ningún indicio; `WRAP` las muestra enteras. No hay una cuarta: ningún
// formato entra 476 caracteres en 275 px sin crecer para abajo.
//
// EL COSTO ES REAL Y HAY QUE DECIRLO: las ~74 filas afectadas crecen en alto, algunas a diez líneas,
// en una pestaña de 852 filas que el dueño recorre todos los días. Se acota a `K` y `L` —las únicas
// dos columnas de texto libre— y no se toca ninguna otra. Si el dueño prefiere la altura pareja, la
// vuelta atrás es cambiar `textoLargo` por `texto` acá abajo: una línea.
//
// Y lo de fondo NO es de formato: un "Concepto" de 476 caracteres es una lista de ítems metida en una
// celda. Eso se arregla en el proceso de carga, no con `wrapStrategy`.

/**
 * EL VOCABULARIO. Cada especie decide las tres cosas que dibujan una celda, y las tres salen de la
 * misma declaración: no se puede declarar plata y que quede alineada como prosa.
 *
 *   · `texto`       rótulos, desplegables y columnas de fórmula. SIN `numberFormat` a propósito (ver
 *                   arriba). `OVERFLOW_CELL` porque con `CLIP` no se recorta: DESAPARECE, y en una
 *                   columna de texto corto el derrame no molesta a nadie.
 *   · `textoLargo`  las dos columnas de texto libre (`K · Detalles / Obra`, `L · Concepto`). El
 *                   porqué —y el costo— está en el bloque de arriba.
 *   · `importe` · `fecha` · `mes` · `entero`.
 */
export const ESPECIES = Object.freeze({
  texto: { horizontalAlignment: 'LEFT', wrapStrategy: 'OVERFLOW_CELL' },
  textoLargo: { horizontalAlignment: 'LEFT', wrapStrategy: 'WRAP' },
  importe: { numberFormat: IMPORTE, horizontalAlignment: 'RIGHT', wrapStrategy: 'CLIP' },
  fecha: { numberFormat: FECHA, horizontalAlignment: 'CENTER', wrapStrategy: 'CLIP' },
  mes: { numberFormat: MES, horizontalAlignment: 'CENTER', wrapStrategy: 'CLIP' },
  entero: { numberFormat: ENTERO, horizontalAlignment: 'RIGHT', wrapStrategy: 'CLIP' },
})

/** Las especies que exigen `numberFormat` de número o fecha. El auditor las usa para decidir. */
export const ESPECIES_CON_NUMERO = Object.freeze(['importe', 'fecha', 'mes', 'entero'])

/**
 * QUÉ ES CADA COLUMNA, POR SU ENCABEZADO DE LA FILA 3.
 *
 * Hay encabezados REPETIDOS en el archivo real —"Rubro de caja" en AB y AC, "Orden de pago (OS)" en
 * AG y AH, ya documentado en `libro-extractores-compras.mjs`—. Por eso el mapa es rótulo→especie y no
 * rótulo→columna: dos columnas con el mismo nombre son la misma cosa y reciben el mismo formato, en
 * vez de que un `findIndex` se quede con la primera y deje la otra sin formatear.
 *
 * Las que sorprenden, y por qué:
 *   · `D · Fecha factura (mes)` es TEXTO: sus 877 celdas las produce una fórmula que devuelve
 *     "ene-26", no una fecha. Hoy está declarada DATE, que es una declaración falsa.
 *   · `H · N° Comprobante` es TEXTO: "11-079782" no es una fecha, y hoy hay 8 celdas en DATE.
 *   · `S · Total o Parcial` es TEXTO: dice "Total"/"Parcial", y hoy está entera en CURRENCY. Eso es
 *     lo que hace que un `"$ -"` tipeado a mano no se distinga de un cero.
 *   · `AL · Saldo pendiente (OS)` es plata, no un contador: hoy está en NUMBER.
 */
export const ESPECIE_POR_ENCABEZADO = Object.freeze(new Map([
  ['ID', 'entero'],
  ['Categoría', 'texto'],
  ['Fecha factura', 'fecha'],
  ['Fecha factura (mes)', 'texto'],
  ['Proveedor', 'texto'],
  ['Modalidad', 'texto'],
  ['Tipo', 'texto'],
  ['N° Comprobante', 'texto'],
  ['Unidad de Negocio', 'texto'],
  ['Cliente / Asignación', 'texto'],
  ['Detalles / Obra', 'textoLargo'],
  ['Concepto', 'textoLargo'],
  ['Importe', 'importe'],
  ['IVA', 'importe'],
  ['Total', 'importe'],
  ['Tipo pago', 'texto'],
  ['Fecha prevista de pago (día)', 'fecha'],
  ['Fecha prevista de pago (mes)', 'mes'],
  ['Total o Parcial', 'texto'],
  ['Monto Pagado', 'importe'],
  ['Monto Parcial 1', 'importe'],
  ['Fecha prevista de pago 2', 'fecha'],
  ['Monto Parcial 2', 'importe'],
  ['Estado', 'texto'],
  ['Tipo de Costo', 'texto'],
  ['Estado pago', 'texto'],
  ['Estado Carga', 'texto'],
  ['Rubro de caja', 'texto'],
  ['Fecha de caja', 'fecha'],
  ['Familia de material', 'texto'],
  ['Sub-rubro de estructura', 'texto'],
  ['Orden de pago (OS)', 'entero'],
  ['Orden sin fecha (OS)', 'entero'],
  ['¿Proveedor comercial? (OS)', 'entero'],
  ['¿Comprobante repetido? (OS)', 'texto'],
  ['Saldo pendiente (OS)', 'importe'],
  ['CUIT (OS)', 'texto'],
  ['Tramo de vencimiento (OS)', 'texto'],
].map(([r, e]) => [normalizarRotulo(r), e])))

/** La primera fila de datos: arriba hay título (1), agrupador (2) y encabezado (3). */
export const FILA0 = 4

/**
 * LA ESPECIE DE CADA COLUMNA, resuelta contra el encabezado leído.
 *
 * Una columna sin encabezado (las que sobran al final de la grilla) NO se adivina: se devuelve `null`
 * y no se emite ningún request para ella. Formatear una columna que nadie declaró es exactamente el
 * gesto que este archivo viene a eliminar.
 *
 * @param {any[]} encabezado la fila 3 tal como se leyó
 * @returns {(string|null)[]} una especie —o `null`— por columna
 */
export function especiesDeEncabezado(encabezado = []) {
  return (encabezado || []).map((r) => {
    const k = normalizarRotulo(r)
    if (!k) return null
    return ESPECIE_POR_ENCABEZADO.get(k) ?? null
  })
}

/**
 * ¿QUÉ COLUMNA TIENE ENCABEZADO Y NO TIENE ESPECIE? — el control que impide que el defecto vuelva.
 *
 * El día que alguien agregue una columna a `Compras`, o le cambie el nombre a una, esto la devuelve y
 * el test la nombra. La alternativa —caer en un default— es una adivinanza que se dibuja como un dato.
 *
 * @returns {{col:number, letra:string, rotulo:string}[]}
 */
export function encabezadosSinEspecie(encabezado = []) {
  const out = []
  ;(encabezado || []).forEach((r, i) => {
    const k = normalizarRotulo(r)
    if (!k || ESPECIE_POR_ENCABEZADO.has(k)) return
    out.push({ col: i, letra: letra(i), rotulo: String(r) })
  })
  return out
}

/**
 * ¿QUÉ CELDA DE IMPORTE O DE FECHA QUEDA SIN `numberFormat`? — el defecto mirado de frente.
 *
 * Es el auditor que se pone rojo con el archivo de hoy (699 + 18 + 1) y verde con la pestaña
 * formateada. Se le pasa lo que devuelve `readSheetUserFormats` —el formato ENTRADO, no el efectivo—
 * porque el efectivo incluye lo que Google deduce de una fórmula y taparía justo el agujero.
 *
 * Sólo mira columnas cuya especie EXIGE número (`ESPECIES_CON_NUMERO`): en una columna de texto la
 * ausencia de `numberFormat` no dibuja nada mal.
 *
 * @param {(string|null)[]} especies salida de `especiesDeEncabezado`
 * @param {{formato?:{numberFormat?:object}}[][]} filas `filas` de `readSheetUserFormats`, desde la 1
 * @param {{desdeFila?:number}} [opts] primera fila de datos, 1-based
 * @returns {{fila:number, col:number, letra:string, especie:string}[]}
 */
export function celdasSinNumberFormat(especies = [], filas = [], { desdeFila = FILA0 } = {}) {
  const out = []
  for (let f = desdeFila - 1; f < filas.length; f++) {
    for (let c = 0; c < especies.length; c++) {
      if (!ESPECIES_CON_NUMERO.includes(especies[c])) continue
      if (filas[f]?.[c]?.formato?.numberFormat) continue
      out.push({ fila: f + 1, col: c, letra: letra(c), especie: especies[c] })
    }
  }
  return out
}

/** La máscara: nombra SÓLO `userEnteredFormat.*`, así ningún request de acá puede tocar un valor. */
export const FIELDS = 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.wrapStrategy'

/**
 * LOS REQUESTS DE FORMATO: uno por columna declarada, cubriendo TODA la columna de una sola vez.
 *
 * Un `repeatCell` por columna y no uno por celda: 40 columnas × 1.155 filas son 46.200 celdas, y un
 * pedido por celda haría que el lote pese más que la pestaña. Como la especie es de la columna
 * entera, el tramo contiguo es la columna entera — no hay nada que agrupar.
 *
 * `hastaFila` es el ALTO DE LA GRILLA, no la última fila con datos: las filas de abajo son donde el
 * dueño va a tipear mañana, y si no llevan formato el próximo importe sale crudo igual que los 699.
 *
 * @param {number} sheetId
 * @param {(string|null)[]} especies
 * @param {{desdeFila?:number, hastaFila:number}} opts
 * @returns {object[]} requests `repeatCell`
 */
export function requestsDeFormatoCompras(sheetId, especies = [], { desdeFila = FILA0, hastaFila } = {}) {
  if (!Number.isInteger(hastaFila) || hastaFila < desdeFila) return []
  const req = []
  especies.forEach((e, c) => {
    const fmt = ESPECIES[e]
    if (!fmt) return
    req.push({
      repeatCell: {
        range: { sheetId, startRowIndex: desdeFila - 1, endRowIndex: hastaFila, startColumnIndex: c, endColumnIndex: c + 1 },
        cell: { userEnteredFormat: fmt },
        fields: FIELDS,
      },
    })
  })
  return req
}
