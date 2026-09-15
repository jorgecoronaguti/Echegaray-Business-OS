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
//
// ═══ DESDE EL 14/09/2026 EL CONTRATO SE DECLARA POR RÓTULO, NO POR LETRA ═══
//
// El dueño insertó «Obra» en Compras L: todo desde «Concepto» se corre una letra. La declaración de
// abajo nombra cada columna por su rótulo (y los dos repetidos por ocurrencia); la letra sale de la
// fila de rótulos VIVA con `contratoContra(encabezado)`. El cargador usa ESO. Los exports estáticos
// (`CONTRATO`, `GRUPOS_FORMULA`, `LETRAS_*`) son el mismo contrato resuelto contra el encabezado de
// referencia del 25/08 (`encabezados-referencia.mjs`), para los tests y los scripts de diagnóstico
// que todavía no leen el Sheet — no para escribir.

import { ubicarColumna } from '../columnas-por-encabezado.mjs'
import { COMPRAS_2508 } from '../encabezados-referencia.mjs'

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

const N = NATURALEZA

/**
 * LA PESTAÑA, COLUMNA POR COLUMNA, POR RÓTULO. `rotulo` es el texto EXACTO de la fila 3; `ocurrencia`
 * separa los dos rótulos repetidos; `clave` es la llave de `COL` en `carga-comprobantes.mjs`; `rol`
 * marca lo que el cargador escribe desde el comprobante. `opcional`: la columna puede no existir
 * todavía (la «Obra», antes de la inserción) y entonces no está en el contrato resuelto.
 *
 * Las notas de cada columna (por qué Q pegada es normal, por qué T y X las pisa el cargador, por qué
 * AG es un fósil vivo) están en el historial de este archivo y en `contrato-columnas.test.mjs`.
 */
export const DECLARACION = Object.freeze([
  { rotulo: 'ID', naturaleza: N.FORMULA_FILA, clave: 'id' },
  { rotulo: 'Categoría', naturaleza: N.CARGADOR, rol: 'categoria', clave: 'categoria' },
  { rotulo: 'Fecha factura', naturaleza: N.CARGADOR, rol: 'fecha', clave: 'fecha' },
  { rotulo: 'Fecha factura (mes)', naturaleza: N.FORMULA_FILA, clave: 'mes' },
  { rotulo: 'Proveedor', naturaleza: N.CARGADOR, rol: 'proveedor', clave: 'proveedor' },
  { rotulo: 'Modalidad', naturaleza: N.CARGADOR, rol: 'modalidad', clave: 'modalidad' },
  { rotulo: 'Tipo', naturaleza: N.CARGADOR, rol: 'tipo', clave: 'tipo' },
  { rotulo: 'N° Comprobante', naturaleza: N.CARGADOR, rol: 'numero', clave: 'numero' },
  // I/J/K las completa el dueño con su desplegable, PERO el cargador las escribe cuando la
  // imputación viene explícita en el comprobante. No son fórmula: escribirlas no destruye nada.
  { rotulo: 'Unidad de Negocio', naturaleza: N.CARGADOR, rol: 'unidad', clave: 'unidad' },
  { rotulo: 'Cliente / Asignación', naturaleza: N.CARGADOR, rol: 'obra', clave: 'obra' },
  { rotulo: 'Detalles / Obra', naturaleza: N.CARGADOR, rol: 'detalle', clave: 'detalle' },
  // LA COLUMNA NUEVA (14/09/2026): la obra codificada (OB-#### · nombre, ES-ADM, ES-TAL, «Sin obra –
  // cliente»). La escribe el cargador cuando la obra es segura; si no, la pregunta.
  { rotulo: 'Obra', naturaleza: N.CARGADOR, rol: 'obraFila', clave: 'obraFila', opcional: true },
  { rotulo: 'Concepto', naturaleza: N.CARGADOR, rol: 'concepto', clave: 'concepto' },
  { rotulo: 'Importe', naturaleza: N.CARGADOR, rol: 'neto', clave: 'neto' },
  { rotulo: 'IVA', naturaleza: N.CARGADOR, rol: 'iva', clave: 'iva' },
  { rotulo: 'Total', naturaleza: N.FORMULA_FILA, clave: 'total' },
  { rotulo: 'Tipo pago', naturaleza: N.CARGADOR, rol: 'formaPago', clave: 'formaPago' },
  // Q DERIVA LA FECHA PREVISTA; tiene un serial pegado en 524 de 897 filas desde el origen: es el
  // vencimiento real que pone una persona. Quien la «repare» en masa borra 353 vencimientos reales.
  { rotulo: 'Fecha prevista de pago (día)', naturaleza: N.FORMULA_FILA, clave: 'prevDia' },
  { rotulo: 'Fecha prevista de pago (mes)', naturaleza: N.FORMULA_FILA, clave: 'prevMes' },
  { rotulo: 'Total o Parcial', naturaleza: N.CARGADOR, rol: 'totalParcial', clave: 'totalParcial' },
  // T ES FÓRMULA (`=IF(F="pago";O;0)`) Y EL CARGADOR LA PISA. Ver `pisaElCargador`.
  { rotulo: 'Monto Pagado', naturaleza: N.FORMULA_FILA, pisaElCargador: true, rol: 'pagado', clave: 'pagado' },
  { rotulo: 'Monto Parcial 1', naturaleza: N.FORMULA_FILA, clave: 'parcial1' },
  { rotulo: 'Fecha prevista de pago 2', naturaleza: N.PERSONA, clave: 'prevFecha2' },
  { rotulo: 'Monto Parcial 2', naturaleza: N.PERSONA, clave: 'parcial2' },
  // X TAMBIÉN ES FÓRMULA Y TAMBIÉN LA PISA.
  { rotulo: 'Estado', naturaleza: N.FORMULA_FILA, pisaElCargador: true, rol: 'estado', clave: 'estado' },
  { rotulo: 'Tipo de Costo', naturaleza: N.PERSONA, clave: 'tipoCosto' },
  { rotulo: 'Estado pago', naturaleza: N.FORMULA_FILA, clave: 'estadoPago' },
  { rotulo: 'Estado Carga', naturaleza: N.PERSONA, clave: 'estadoCarga' },
  // Los dos «Rubro de caja» son ARRAYFORMULA vivas: la 1.ª alimenta a AE y a AJ.
  { rotulo: 'Rubro de caja', ocurrencia: 1, naturaleza: N.ARRAYFORMULA },
  { rotulo: 'Rubro de caja', ocurrencia: 2, naturaleza: N.ARRAYFORMULA, clave: 'rubroCaja' },
  { rotulo: 'Fecha de caja', naturaleza: N.ARRAYFORMULA, clave: 'fechaCaja' },
  { rotulo: 'Familia de material', naturaleza: N.ARRAYFORMULA, clave: 'familia' },
  { rotulo: 'Sub-rubro de estructura', naturaleza: N.ARRAYFORMULA, clave: 'subRubro' },
  // Los dos «Orden de pago (OS)» NO son la misma fórmula: la 1.ª es la versión anterior al corrimiento
  // del 14/08 que quedó viva. Se estampa igual: hacerla desaparecer es decisión del dueño.
  { rotulo: 'Orden de pago (OS)', ocurrencia: 1, naturaleza: N.FORMULA_FILA },
  { rotulo: 'Orden de pago (OS)', ocurrencia: 2, naturaleza: N.FORMULA_FILA, clave: 'ordenPago' },
  { rotulo: 'Orden sin fecha (OS)', naturaleza: N.FORMULA_FILA, clave: 'ordenSinFecha' },
  { rotulo: '¿Proveedor comercial? (OS)', naturaleza: N.ARRAYFORMULA, clave: 'comercial' },
  { rotulo: '¿Comprobante repetido? (OS)', naturaleza: N.ARRAYFORMULA },
  { rotulo: 'Saldo pendiente (OS)', naturaleza: N.ARRAYFORMULA },
  { rotulo: 'CUIT (OS)', naturaleza: N.ARRAYFORMULA },
  { rotulo: 'Tramo de vencimiento (OS)', naturaleza: N.ARRAYFORMULA },
].map((c) => Object.freeze(c)))

/**
 * LAS COLUMNAS DEL DUEÑO: la regla del repo «AC/AD/AE/AF/AJ nunca se tocan», por RÓTULO. Después de
 * la inserción de «Obra» son AD/AE/AF/AG/AK: una lista de letras las habría dejado desprotegidas.
 */
export const COLUMNAS_DEL_DUENO = Object.freeze([
  Object.freeze({ rotulo: 'Rubro de caja', ocurrencia: 2 }), 'Fecha de caja', 'Familia de material',
  'Sub-rubro de estructura', '¿Proveedor comercial? (OS)',
])

/** Las columnas que calcula el OS (AB, AK, AL, AM, AN antes de la inserción). Tampoco se escriben. */
export const COLUMNAS_DEL_OS = Object.freeze([
  Object.freeze({ rotulo: 'Rubro de caja', ocurrencia: 1 }), '¿Comprobante repetido? (OS)',
  'Saldo pendiente (OS)', 'CUIT (OS)', 'Tramo de vencimiento (OS)',
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

/** Las letras de una lista de rótulos contra un encabezado. Falla si falta alguno. */
export function letrasDe(declaraciones, encabezado) {
  return declaraciones.map((d) => ubicarColumna(encabezado, d, 'Compras').letra)
}

/**
 * EL CONTRATO CONTRA LA FILA DE RÓTULOS VIVA: cada entrada con su `letra`, en orden de columna. Un
 * rótulo obligatorio que falta aborta (la pestaña cambió y el cargador no escribe a ciegas); uno
 * opcional que falta queda afuera.
 */
export function contratoContra(encabezado) {
  const faltan = []
  const out = []
  for (const c of DECLARACION) {
    try {
      const col = ubicarColumna(encabezado, c, 'Compras')
      if (col) out.push(Object.freeze({ ...c, letra: col.letra }))
    } catch (e) { faltan.push(e.message) }
  }
  if (faltan.length) throw new Error(`el contrato de Compras no coincide con la pestaña:\n${faltan.join('\n')}`)
  return Object.freeze(out.sort((a, b) => indiceDe(a.letra) - indiceDe(b.letra)))
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
 * TODO LO QUE SE DERIVA DEL CONTRATO RESUELTO. Se deriva, no se mantiene a mano.
 *
 * `COLUMNAS_A_ESTAMPAR` EXCLUYE las que el cargador pisa a propósito (`pisaElCargador`): el cargador
 * escribe primero los valores y estampa las fórmulas después, así que meter `T` o `X` acá borraría el
 * monto pagado y el estado recién escritos.
 */
export function derivar(contrato) {
  const deNaturaleza = (n) => contrato.filter((c) => c.naturaleza === n).map((c) => c.letra)
  const estampar = contrato.filter((c) => c.naturaleza === N.FORMULA_FILA && !c.pisaElCargador).map((c) => c.letra)
  const escribibles = contrato.filter((c) => c.naturaleza === N.CARGADOR || c.pisaElCargador).map((c) => c.letra)
  return Object.freeze({
    COLUMNAS_A_ESTAMPAR: Object.freeze(estampar),
    GRUPOS_FORMULA: Object.freeze(tramosContiguos(estampar).map((t) => Object.freeze(t))),
    LETRAS_ARRAYFORMULA: Object.freeze(deNaturaleza(N.ARRAYFORMULA)),
    LETRAS_ESCRIBIBLES: Object.freeze(escribibles),
    letrasIndebidas: (letras) => letrasIndebidas(letras, contrato),
  })
}

/** `COL` del cargador (clave → letra) para un contrato resuelto. */
export function colDelCargador(contrato) {
  return Object.fromEntries(contrato.filter((c) => c.clave).map((c) => [c.clave, c.letra]))
}

/** El contrato contra el encabezado de REFERENCIA (25/08). Sólo tests y diagnóstico: el que escribe usa `contratoContra`. */
export const CONTRATO = contratoContra(COMPRAS_2508)
const REF = derivar(CONTRATO)
export const COLUMNAS_A_ESTAMPAR = REF.COLUMNAS_A_ESTAMPAR
export const GRUPOS_FORMULA = REF.GRUPOS_FORMULA
export const LETRAS_ARRAYFORMULA = REF.LETRAS_ARRAYFORMULA
export const LETRAS_ESCRIBIBLES = REF.LETRAS_ESCRIBIBLES

/** La entrada del contrato para esa letra, o `null` si la columna no está declarada. */
export function columna(letra, contrato = CONTRATO) {
  const L = String(letra ?? '').toUpperCase()
  return contrato.find((c) => c.letra === L) ?? null
}

/** Las letras de una naturaleza, en orden de columna. */
export function letrasPorNaturaleza(naturaleza, contrato = CONTRATO) {
  return contrato.filter((c) => c.naturaleza === naturaleza).map((c) => c.letra)
}

/**
 * ¿QUÉ LETRAS DE ESTE LOTE NO SE PUEDEN ESCRIBIR? El portón del cargador, en una función pura. Con
 * el contrato VIVO: después de la inserción, `AD` es «Fecha de caja» y `AC` es el 1.º «Rubro de caja».
 *
 * @param {string[]} letras las columnas que un lote quiere escribir
 * @returns {{letra:string, motivo:string}[]} vacío si todas se pueden escribir
 */
export function letrasIndebidas(letras = [], contrato = CONTRATO) {
  const escribibles = contrato.filter((c) => c.naturaleza === N.CARGADOR || c.pisaElCargador).map((c) => c.letra)
  const mal = []
  for (const l of letras) {
    const L = String(l ?? '').toUpperCase()
    if (escribibles.includes(L)) continue
    const c = columna(L, contrato)
    if (!c) { mal.push({ letra: L, motivo: 'no está en el contrato de columnas de Compras' }); continue }
    if (c.naturaleza === N.ARRAYFORMULA) {
      mal.push({ letra: L, motivo: `«${c.rotulo}» es ARRAYFORMULA desde la fila 4: escribir ahí parte el derrame de la columna entera` })
    } else if (c.naturaleza === N.FORMULA_FILA) {
      mal.push({ letra: L, motivo: `«${c.rotulo}» es fórmula por fila: un valor encima deja de recalcularse cuando cambia lo que la alimenta` })
    } else {
      mal.push({ letra: L, motivo: `«${c.rotulo}» la completa una persona con su desplegable` })
    }
  }
  return mal
}
