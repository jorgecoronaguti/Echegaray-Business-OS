// EL CONTRATO DE COLUMNAS DE LA PESTAÑA "Compras" — UNA SOLA VERDAD, A→AN.
//
// ═══ POR QUÉ EXISTE (25/08/2026) ═══
//
// Esta verdad vivía repartida en tres lugares y en la costumbre: `GRUPOS_FORMULA` decía cuáles se
// estampan, la cabecera de `comunicacion/comprobantes/escritura.mjs` decía "AC/AD/AE/AF/AJ son
// ARRAYFORMULA y no se tocan", y el comentario de `carga-comprobantes.mjs` decía otra parte. Tres
// listas que nadie cruzaba nunca, y por lo tanto tres listas que se fueron separando de la pestaña.
//
// Medido contra el Sheet vivo el 25/08/2026 (`Compras!A800:AN895` con `readSheetGrid`, que devuelve
// fórmula y valor de cada celda, más la fila 893 —vacía— que es la plantilla pura):
//   · `GRUPOS_FORMULA` declaraba 8 columnas con fórmula por fila. Son DOCE: le faltaban `U` (fórmula
//     en 89 de 96 filas del bloque) y `AG` (96 de 96), y nombraba el tramo `AH:AI` arrancando una
//     columna tarde.
//   · La cabecera de `escritura.mjs` declaraba 5 ARRAYFORMULA. Son DIEZ: faltaban `AB`, `AK`, `AL`,
//     `AM` y `AN`. Escribir aunque sea `""` en cualquiera de ellas parte el derrame de la columna
//     entera desde la fila 4 — no rompe una fila, rompe la columna.
//
// Lo que este archivo NO es: una descripción bonita. Es de acá de donde salen `GRUPOS_FORMULA` y la
// lista de letras que el cargador tiene permitido escribir. Cambiar el contrato cambia el
// comportamiento; que se separe de la pestaña lo caza `contrato-columnas.test.mjs` (la medición
// congelada) y `scripts/reparar-formulas-compras.mjs` (que abre el Sheet vivo y no escribe nada).
//
// ═══ LA DISTINCIÓN QUE MANDA: FÓRMULA POR FILA vs ARRAYFORMULA ═══
//
// Las dos se ven igual desde afuera —una celda con un número que nadie tipeó— y se tratan al revés:
//   · FÓRMULA POR FILA vive en cada celda. Nace copiándose de la fila de arriba (`PASTE_FORMULA`) y
//     hay que estamparla en cada fila nueva o la fila queda muda.
//   · ARRAYFORMULA vive UNA sola vez, en la fila 4, y derrama sola hacia abajo. Estamparla en la
//     fila nueva la duplicaría; escribirle un valor encima la MATA para toda la columna.
//
// ═══ Y LA TERCERA CATEGORÍA, LA INCÓMODA: LA FÓRMULA QUE EL CARGADOR PISA ═══
//
// `T` (Monto Pagado) y `X` (Estado) son fórmula en la plantilla Y el cargador les escribe un valor
// encima. Eso no está declarado en ningún lado y es exactamente lo que el dueño reportó el 25/08.
// Acá se declara con nombre (`pisaElCargador`) para que sea visible y para que el test la congele:
// una pisada nueva que nadie declaró rompe el test. La decisión de si esas dos pisadas se sacan es
// del dueño —cambia lo que llega al Cash Flow—, y hasta que la tome el comportamiento no se toca.
// Lo que sí cambia: `GRUPOS_FORMULA` se deriva EXCLUYENDO las pisadas, porque estampar la fórmula
// después de escribir el valor borraría el valor recién escrito.

/** Qué es cada celda de esta columna en la fila de datos. Es el eje del contrato. */
export const NATURALEZA = Object.freeze({
  /** Fórmula que vive en CADA celda y se estampa copiando de la fila modelo. */
  FORMULA_FILA: 'formula_por_fila',
  /** Una sola fórmula en la fila 4 que derrama la columna entera. NUNCA se escribe. */
  ARRAYFORMULA: 'arrayformula',
  /** Valor que escribe el cargador desde el comprobante. */
  CARGADOR: 'cargador',
  /** Valor que completa una persona (desplegable estricto o texto libre). */
  PERSONA: 'persona',
})

/**
 * LA PESTAÑA, COLUMNA POR COLUMNA. `rotulo` es el texto EXACTO de la fila 3 leído el 25/08/2026: si
 * el dueño renombra un encabezado, el contrato deja de coincidir y hay que venir acá — que es
 * justamente lo que se quiere, porque un rótulo que cambia suele ser una columna que cambió de
 * significado.
 *
 * `rol` enlaza con la clave de `COL` en `carga-comprobantes.mjs` para las columnas que el cargador
 * escribe: es el puente entre "qué dato del comprobante" y "qué letra del Sheet".
 */
export const CONTRATO = Object.freeze([
  { letra: 'A', rotulo: 'ID', naturaleza: NATURALEZA.FORMULA_FILA },
  { letra: 'B', rotulo: 'Categoría', naturaleza: NATURALEZA.CARGADOR, rol: 'categoria' },
  { letra: 'C', rotulo: 'Fecha factura', naturaleza: NATURALEZA.CARGADOR, rol: 'fecha' },
  { letra: 'D', rotulo: 'Fecha factura (mes)', naturaleza: NATURALEZA.FORMULA_FILA },
  { letra: 'E', rotulo: 'Proveedor', naturaleza: NATURALEZA.CARGADOR, rol: 'proveedor' },
  { letra: 'F', rotulo: 'Modalidad', naturaleza: NATURALEZA.CARGADOR, rol: 'modalidad' },
  { letra: 'G', rotulo: 'Tipo', naturaleza: NATURALEZA.CARGADOR, rol: 'tipo' },
  { letra: 'H', rotulo: 'N° Comprobante', naturaleza: NATURALEZA.CARGADOR, rol: 'numero' },
  // I/J/K las completa el dueño con su desplegable, PERO el cargador las escribe cuando la
  // imputación viene explícita en el comprobante (la anotación a mano). No son fórmula: escribirlas
  // no destruye nada, sólo ahorra un tipeo. Por eso `cargador` y no `persona`.
  { letra: 'I', rotulo: 'Unidad de Negocio', naturaleza: NATURALEZA.CARGADOR, rol: 'unidad' },
  { letra: 'J', rotulo: 'Cliente / Asignación', naturaleza: NATURALEZA.CARGADOR, rol: 'obra' },
  { letra: 'K', rotulo: 'Detalles / Obra', naturaleza: NATURALEZA.CARGADOR, rol: 'detalle' },
  { letra: 'L', rotulo: 'Concepto', naturaleza: NATURALEZA.CARGADOR, rol: 'concepto' },
  { letra: 'M', rotulo: 'Importe', naturaleza: NATURALEZA.CARGADOR, rol: 'neto' },
  { letra: 'N', rotulo: 'IVA', naturaleza: NATURALEZA.CARGADOR, rol: 'iva' },
  { letra: 'O', rotulo: 'Total', naturaleza: NATURALEZA.FORMULA_FILA },
  { letra: 'P', rotulo: 'Tipo pago', naturaleza: NATURALEZA.CARGADOR, rol: 'formaPago' },
  // Q DERIVA LA FECHA PREVISTA DE LA MODALIDAD: `=IF(F="pago";C;"Pendiente")`. El cargador NO la
  // escribe —verificado por construcción en `valoresInput`— y sin embargo tiene un serial pegado
  // encima en 524 de las 897 filas de la pestaña, **arrancando en la fila 4**: desde el origen, años
  // antes de que existiera el cargador. En 353 de esas 524 la fecha es DISTINTA de la que la fórmula
  // daría — es el vencimiento real del echeq o del cheque, que ni la fórmula ni el cargador pueden
  // saber, y lo pone una persona. Q pegada es el estado normal de esta pestaña, no un daño: quien
  // "repare" esta columna en masa borra 353 vencimientos reales. Medido el 25/08/2026 con
  // `scripts/reparar-formulas-compras.mjs`.
  { letra: 'Q', rotulo: 'Fecha prevista de pago (día)', naturaleza: NATURALEZA.FORMULA_FILA },
  { letra: 'R', rotulo: 'Fecha prevista de pago (mes)', naturaleza: NATURALEZA.FORMULA_FILA },
  { letra: 'S', rotulo: 'Total o Parcial', naturaleza: NATURALEZA.CARGADOR, rol: 'totalParcial' },
  // T ES FÓRMULA (`=IF(F="pago";O;0)`) Y EL CARGADOR LA PISA. Ver `pisaElCargador` abajo.
  { letra: 'T', rotulo: 'Monto Pagado', naturaleza: NATURALEZA.FORMULA_FILA, pisaElCargador: true, rol: 'pagado' },
  { letra: 'U', rotulo: 'Monto Parcial 1', naturaleza: NATURALEZA.FORMULA_FILA },
  { letra: 'V', rotulo: 'Fecha prevista de pago 2', naturaleza: NATURALEZA.PERSONA },
  { letra: 'W', rotulo: 'Monto Parcial 2', naturaleza: NATURALEZA.PERSONA },
  // X TAMBIÉN ES FÓRMULA Y TAMBIÉN LA PISA: `=IF($E="";"";IF(ABS(N($T)+N($W)-N($O))<1;"Pagado";…))`.
  { letra: 'X', rotulo: 'Estado', naturaleza: NATURALEZA.FORMULA_FILA, pisaElCargador: true, rol: 'estado' },
  { letra: 'Y', rotulo: 'Tipo de Costo', naturaleza: NATURALEZA.PERSONA },
  { letra: 'Z', rotulo: 'Estado pago', naturaleza: NATURALEZA.FORMULA_FILA },
  { letra: 'AA', rotulo: 'Estado Carga', naturaleza: NATURALEZA.PERSONA },
  // AB y AC comparten rótulo desde el corrimiento del 14/08 y las DOS son ARRAYFORMULA vivas. AB no
  // figuraba en ninguna lista de intocables: es la que alimenta a AE y a AJ.
  { letra: 'AB', rotulo: 'Rubro de caja', naturaleza: NATURALEZA.ARRAYFORMULA },
  { letra: 'AC', rotulo: 'Rubro de caja', naturaleza: NATURALEZA.ARRAYFORMULA },
  { letra: 'AD', rotulo: 'Fecha de caja', naturaleza: NATURALEZA.ARRAYFORMULA },
  { letra: 'AE', rotulo: 'Familia de material', naturaleza: NATURALEZA.ARRAYFORMULA },
  { letra: 'AF', rotulo: 'Sub-rubro de estructura', naturaleza: NATURALEZA.ARRAYFORMULA },
  // AG/AH comparten rótulo y NO son la misma fórmula: AG apunta a $AC/$AI y AH a $AD/$AJ. AG es la
  // versión anterior al corrimiento del 14/08 que quedó viva al lado de la corregida. Se declara
  // como está —fórmula por fila en 96 de 96— y se estampa igual que las otras: hacerla desaparecer
  // es decisión del dueño, y una fila nueva sin AG sería una inconsistencia distinta, no un arreglo.
  { letra: 'AG', rotulo: 'Orden de pago (OS)', naturaleza: NATURALEZA.FORMULA_FILA },
  { letra: 'AH', rotulo: 'Orden de pago (OS)', naturaleza: NATURALEZA.FORMULA_FILA },
  { letra: 'AI', rotulo: 'Orden sin fecha (OS)', naturaleza: NATURALEZA.FORMULA_FILA },
  { letra: 'AJ', rotulo: '¿Proveedor comercial? (OS)', naturaleza: NATURALEZA.ARRAYFORMULA },
  { letra: 'AK', rotulo: '¿Comprobante repetido? (OS)', naturaleza: NATURALEZA.ARRAYFORMULA },
  { letra: 'AL', rotulo: 'Saldo pendiente (OS)', naturaleza: NATURALEZA.ARRAYFORMULA },
  { letra: 'AM', rotulo: 'CUIT (OS)', naturaleza: NATURALEZA.ARRAYFORMULA },
  { letra: 'AN', rotulo: 'Tramo de vencimiento (OS)', naturaleza: NATURALEZA.ARRAYFORMULA },
])

/** Letra de columna → índice 0. 'A'→0, 'AA'→26. */
export function indiceDe(letra) {
  let n = 0
  for (const ch of String(letra).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Índice 0 → letra. Inversa de `indiceDe`. */
export function letraDe(i) {
  let n = Number(i)
  let s = ''
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 }
  return s
}

/** La entrada del contrato para esa letra, o `null` si la columna no está declarada. */
export function columna(letra) {
  const L = String(letra ?? '').toUpperCase()
  return CONTRATO.find((c) => c.letra === L) ?? null
}

/** Las letras de una naturaleza, en orden de columna. */
export function letrasPorNaturaleza(naturaleza) {
  return CONTRATO.filter((c) => c.naturaleza === naturaleza).map((c) => c.letra)
}

/**
 * Agrupa letras sueltas en tramos contiguos `[desde, hasta]`, para pedirle a Google un `copyPaste`
 * por tramo en vez de uno por columna. `['Q','R','U']` → `[['Q','R'], ['U','U']]`.
 */
export function tramosContiguos(letras = []) {
  const idx = [...new Set(letras.map((l) => indiceDe(l)))].sort((a, b) => a - b)
  const tramos = []
  for (const i of idx) {
    const ultimo = tramos[tramos.length - 1]
    if (ultimo && i === ultimo[1] + 1) ultimo[1] = i
    else tramos.push([i, i])
  }
  return tramos.map(([a, b]) => [letraDe(a), letraDe(b)])
}

/**
 * LOS TRAMOS DE FÓRMULA POR FILA QUE SE ESTAMPAN EN CADA CARGA. Se derivan, no se mantienen a mano.
 *
 * Se EXCLUYEN las que el cargador pisa a propósito (`pisaElCargador`): el cargador escribe primero
 * los valores y estampa las fórmulas después, así que meter `T` o `X` acá borraría el monto pagado y
 * el estado que se acaban de escribir. Mientras esas dos pisadas sigan siendo el comportamiento
 * acordado, sus columnas no pueden estar en esta lista — y el día que el dueño decida sacarlas,
 * borrar `pisaElCargador` las mete acá solas.
 */
export const COLUMNAS_A_ESTAMPAR = Object.freeze(
  CONTRATO.filter((c) => c.naturaleza === NATURALEZA.FORMULA_FILA && !c.pisaElCargador).map((c) => c.letra),
)

/** Los tramos contiguos de `COLUMNAS_A_ESTAMPAR`, listos para `copyPaste`. */
export const GRUPOS_FORMULA = Object.freeze(tramosContiguos([...COLUMNAS_A_ESTAMPAR]).map((t) => Object.freeze(t)))

/** Las ARRAYFORMULA. Escribir cualquier cosa en ellas —incluso `""`— parte el derrame de la columna. */
export const LETRAS_ARRAYFORMULA = Object.freeze(letrasPorNaturaleza(NATURALEZA.ARRAYFORMULA))

/** Las letras que el cargador tiene permitido escribir, incluidas las dos pisadas declaradas. */
export const LETRAS_ESCRIBIBLES = Object.freeze(
  CONTRATO.filter((c) => c.naturaleza === NATURALEZA.CARGADOR || c.pisaElCargador).map((c) => c.letra),
)

/**
 * ¿QUÉ LETRAS DE ESTE LOTE NO SE PUEDEN ESCRIBIR? El portón del cargador, en una función pura.
 *
 * Existe porque el defecto de una columna pisada no se ve: la celda queda con un número plausible y
 * el error viaja por fórmula hasta el Cash Flow y la app. Un `Object.keys()` contra esta lista lo
 * caza en el proceso, antes de que salga el pedido a Google.
 *
 * @param {string[]} letras las columnas que un lote quiere escribir
 * @returns {{letra:string, motivo:string}[]} vacío si todas se pueden escribir
 */
export function letrasIndebidas(letras = []) {
  const mal = []
  for (const l of letras) {
    const L = String(l ?? '').toUpperCase()
    if (LETRAS_ESCRIBIBLES.includes(L)) continue
    const c = columna(L)
    if (!c) { mal.push({ letra: L, motivo: 'no está en el contrato de columnas de Compras' }); continue }
    if (c.naturaleza === NATURALEZA.ARRAYFORMULA) {
      mal.push({ letra: L, motivo: `«${c.rotulo}» es ARRAYFORMULA desde la fila 4: escribir ahí parte el derrame de la columna entera` })
    } else if (c.naturaleza === NATURALEZA.FORMULA_FILA) {
      mal.push({ letra: L, motivo: `«${c.rotulo}» es fórmula por fila: un valor encima deja de recalcularse cuando cambia lo que la alimenta` })
    } else {
      mal.push({ letra: L, motivo: `«${c.rotulo}» la completa una persona con su desplegable` })
    }
  }
  return mal
}
