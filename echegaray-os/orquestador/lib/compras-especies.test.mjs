import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ESPECIES, ESPECIES_CON_NUMERO, ESPECIE_POR_ENCABEZADO, IMPORTE, FECHA, FIELDS, FILA0,
  celdasSinNumberFormat, encabezadosSinEspecie, especiesDeEncabezado, letra, normalizarRotulo,
  requestsDeFormatoCompras,
} from './compras-especies.mjs'
import { clasificarRequest, CLASE } from './clasificar-request.mjs'
import { parseFecha, parseMonto } from './cash-briefing.mjs'

// EL ENCABEZADO REAL DE `Compras` (fila 3), leído del archivo el 15/08/2026. Trae los dos rótulos
// repetidos que ya documenta `libro-extractores-compras.mjs`: "Rubro de caja" en AB y AC, "Orden de
// pago (OS)" en AG y AH.
const ENCABEZADO_REAL = [
  'ID', 'Categoría', 'Fecha factura', 'Fecha factura (mes)', 'Proveedor', 'Modalidad', 'Tipo',
  'N° Comprobante', 'Unidad de Negocio', 'Cliente / Asignación', 'Detalles / Obra', 'Concepto',
  'Importe', 'IVA', 'Total', 'Tipo pago', 'Fecha prevista de pago (día)', 'Fecha prevista de pago (mes)',
  'Total o Parcial', 'Monto Pagado', 'Monto Parcial 1', 'Fecha prevista de pago 2', 'Monto Parcial 2',
  'Estado', 'Tipo de Costo', 'Estado pago', 'Estado Carga', 'Rubro de caja', 'Rubro de caja',
  'Fecha de caja', 'Familia de material', 'Sub-rubro de estructura', 'Orden de pago (OS)',
  'Orden de pago (OS)', 'Orden sin fecha (OS)', '¿Proveedor comercial? (OS)',
  '¿Comprobante repetido? (OS)', 'Saldo pendiente (OS)', 'CUIT (OS)', 'Tramo de vencimiento (OS)',
]

const IDX = Object.fromEntries(['M', 'T', 'AD', 'AC', 'S', 'D', 'L'].map((l) => {
  let n = 0
  for (const ch of l) n = n * 26 + (ch.charCodeAt(0) - 64)
  return [l, n - 1]
}))

/**
 * LA PESTAÑA COMO ESTÁ HOY, en la forma exacta que devuelve `readSheetUserFormats`.
 *
 * Reproduce el defecto medido: `AD4` (el ancla de la ARRAYFORMULA) con su `DATE/dd/mm/yyyy`, y todo
 * el DERRAME de abajo sin `numberFormat`. Más las celdas sueltas de `T` y la de `M`.
 */
function formatosDeHoy(alto = 60) {
  const filas = []
  for (let f = 0; f < alto; f++) {
    const fila = ENCABEZADO_REAL.map(() => ({ formato: {} }))
    if (f + 1 >= FILA0) {
      fila[IDX.M] = { formato: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } } }
      fila[IDX.T] = { formato: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } } }
      // AD: sólo el ancla lleva formato. El derrame no hereda nada — la causa de las 699.
      if (f + 1 === FILA0) fila[IDX.AD] = { formato: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' } } }
    }
    filas.push(fila)
  }
  filas[7][IDX.T] = { formato: {} }        // T8=124751 sin formato
  filas[22][IDX.T] = { formato: {} }       // T23=6590,71 sin formato
  filas[40][IDX.M] = { formato: {} }       // el caso de M163
  return filas
}

/** Aplica los `repeatCell` sobre la grilla de fixture, como haría Sheets. */
function aplicar(requests, filas) {
  const out = filas.map((f) => f.map((c) => ({ formato: { ...(c.formato || {}) } })))
  for (const { repeatCell: r } of requests) {
    for (let f = r.range.startRowIndex; f < r.range.endRowIndex && f < out.length; f++) {
      for (let c = r.range.startColumnIndex; c < r.range.endColumnIndex; c++) {
        out[f][c] = { formato: { ...r.cell.userEnteredFormat } }
      }
    }
  }
  return out
}

// ═══ EL DEFECTO ═══

test('EL DEFECTO: el derrame de la ARRAYFORMULA de AD queda sin numberFormat — sólo el ancla lo tiene', () => {
  const especies = especiesDeEncabezado(ENCABEZADO_REAL)
  const huecos = celdasSinNumberFormat(especies, formatosDeHoy(60))
  const enAD = huecos.filter((h) => h.letra === 'AD')
  // 60 filas de grilla, datos desde la 4 → 57 celdas de AD, y sólo AD4 tiene formato.
  assert.equal(enAD.length, 56, 'el derrame de AD tiene que aparecer entero como hueco')
  assert.equal(enAD[0].fila, 5, 'el hueco arranca en AD5, justo debajo del ancla')
  assert.ok(huecos.some((h) => h.letra === 'T' && h.fila === 8))
  assert.ok(huecos.some((h) => h.letra === 'T' && h.fila === 23))
  assert.ok(huecos.some((h) => h.letra === 'M' && h.fila === 41))
})

test('LA CURA: formatear la columna entera —ancla y derrame— no deja una sola celda de plata o fecha cruda', () => {
  const especies = especiesDeEncabezado(ENCABEZADO_REAL)
  const req = requestsDeFormatoCompras(1666326819, especies, { hastaFila: 60 })
  const despues = aplicar(req, formatosDeHoy(60))
  assert.deepEqual(celdasSinNumberFormat(especies, despues), [])
})

test('la cobertura llega al FONDO DE LA GRILLA, no a la última fila con datos: mañana el dueño tipea ahí', () => {
  const especies = especiesDeEncabezado(ENCABEZADO_REAL)
  const req = requestsDeFormatoCompras(1666326819, especies, { hastaFila: 1155 })
  const ad = req.find((r) => r.repeatCell.range.startColumnIndex === IDX.AD)
  assert.equal(ad.repeatCell.range.startRowIndex, FILA0 - 1)
  assert.equal(ad.repeatCell.range.endRowIndex, 1155)
})

// ═══ NINGÚN REQUEST PUEDE TOCAR UN VALOR ═══

test('todo request emitido es INOCUO para la guarda: la máscara fields no nombra un solo valor', () => {
  const especies = especiesDeEncabezado(ENCABEZADO_REAL)
  const req = requestsDeFormatoCompras(1666326819, especies, { hastaFila: 1155 })
  assert.ok(req.length >= 30)
  for (const r of req) {
    assert.equal(clasificarRequest(r).clase, CLASE.INOCUO, JSON.stringify(r.repeatCell.range))
    assert.equal(Object.keys(r.repeatCell.cell).join(','), 'userEnteredFormat')
    assert.ok(!/userEnteredValue|\bnote\b/.test(r.repeatCell.fields))
  }
  assert.equal(FIELDS.includes('userEnteredValue'), false)
})

test('no se emite un solo request para una columna sin encabezado: formatear lo que nadie declaró es el defecto', () => {
  const req = requestsDeFormatoCompras(1, especiesDeEncabezado(['Importe', '', 'Total']), { hastaFila: 10 })
  assert.deepEqual(req.map((r) => r.repeatCell.range.startColumnIndex), [0, 2])
})

// ═══ LA DECLARACIÓN DE CADA COLUMNA ═══

test('el encabezado real no deja ninguna columna sin especie, repetidos incluidos', () => {
  assert.deepEqual(encabezadosSinEspecie(ENCABEZADO_REAL), [])
  const e = especiesDeEncabezado(ENCABEZADO_REAL)
  assert.equal(e.filter((x) => x === null).length, 0)
  // "Rubro de caja" está dos veces (AB y AC) y las dos tienen que salir formateadas igual.
  assert.equal(e[27], 'texto')
  assert.equal(e[28], 'texto')
})

test('una columna nueva sin declarar se NOMBRA, no cae en un default silencioso', () => {
  const conNueva = [...ENCABEZADO_REAL, 'Retención sufrida (OS)']
  assert.deepEqual(encabezadosSinEspecie(conNueva), [{ col: 40, letra: 'AO', rotulo: 'Retención sufrida (OS)' }])
  assert.equal(especiesDeEncabezado(conNueva)[40], null)
})

test('las columnas que el archivo declara mal hoy quedan declaradas por lo que SON', () => {
  const e = especiesDeEncabezado(ENCABEZADO_REAL)
  assert.equal(e[IDX.S], 'texto', 'S dice "Total"/"Parcial": hoy está en CURRENCY')
  assert.equal(e[IDX.AC], 'texto', 'AC dice "Servicios recurrentes": hoy está en DATE')
  assert.equal(e[IDX.D], 'texto', 'D es el TEXTO "ene-26" que devuelve una fórmula: hoy está en DATE')
  assert.equal(e[IDX.AD], 'fecha')
  assert.equal(ESPECIE_POR_ENCABEZADO.get(normalizarRotulo('Saldo pendiente (OS)')), 'importe')
  assert.equal(ESPECIE_POR_ENCABEZADO.get(normalizarRotulo('N° Comprobante')), 'texto')
})

test('el encabezado con espacios de más o distinta caja sigue resolviendo', () => {
  const e = especiesDeEncabezado(['  MONTO   PAGADO ', 'fecha de caja'])
  assert.deepEqual(e, ['importe', 'fecha'])
})

// ═══ LOS PATRONES, CONTRA LOS LECTORES QUE LOS PARSEAN ═══

test('el patrón de importe conserva los centavos: sacarlos haría leer 54.043 donde hay 54.043,44', () => {
  assert.ok(IMPORTE.pattern.includes('#,##0.00'))
  // Es el texto que `sync-caja-nucleo`, `cash-flow-rehacer` y `cruce-banco` reciben y parsean.
  assert.equal(parseMonto('$54.043,44'), 54043.44)
  assert.equal(parseMonto('$54.043'), 54043)
})

test('la cláusula del cero es segura para parseMonto: la raya vale cero, no NaN', () => {
  assert.ok(IMPORTE.pattern.endsWith(';"—"'))
  assert.equal(parseMonto('—'), 0)
  // El negativo va entre paréntesis, y parseMonto ya lee el paréntesis como el signo.
  assert.equal(parseMonto('($54.043,44)'), -54043.44)
  assert.equal(IMPORTE.pattern.includes('[RED]'), false, 'el rojo es del control, no del número')
})

test('EL EFECTO ECONÓMICO: una fecha sin formato es un serial que parseFecha descarta', () => {
  // Es lo que `cruce-banco.mjs` hace con `Compras!AD` leída SIN UNFORMATTED_VALUE: hoy 699 filas
  // quedan afuera de la comparación de egresos banco↔Compras sin un solo error en pantalla.
  assert.equal(parseFecha('46027'), null)
  assert.ok(parseFecha('29/06/2026') instanceof Date)
  assert.equal(FECHA.pattern, 'dd/mm/yyyy')
  // El patrón que se reemplaza también se sigue leyendo: nadie que lea hoy deja de leer mañana.
  assert.ok(parseFecha('2/1/2026') instanceof Date)
})

// ═══ EL VOCABULARIO ═══

test('toda especie declara alineación y ajuste; sólo las de número declaran numberFormat', () => {
  for (const [nombre, e] of Object.entries(ESPECIES)) {
    assert.ok(e.horizontalAlignment, `${nombre} sin alineación`)
    assert.ok(e.wrapStrategy, `${nombre} sin wrapStrategy`)
  }
  // Plata a la derecha y prosa a la izquierda: no se puede declarar importe y alinear como texto.
  assert.equal(ESPECIES.importe.horizontalAlignment, 'RIGHT')
  assert.equal(ESPECIES.texto.horizontalAlignment, 'LEFT')
})

test('NINGUNA especie de texto declara TEXT: una fórmula tipeada ahí se guardaría como string', () => {
  // `Z` son 1.136 fórmulas fila por fila y `D` 877. Con `@` puesto, arrastrar una hacia abajo desde la
  // planilla deja el texto `=IF(...)` en la celda en vez de evaluarla. El formato tiene que ser seguro
  // para la persona que tipea, no sólo para la API.
  assert.equal(ESPECIES.texto.numberFormat, undefined)
  assert.equal(ESPECIES.textoLargo.numberFormat, undefined)
})

test('la máscara igual nombra numberFormat: es lo que BORRA el CURRENCY de S y el DATE de AC', () => {
  // Un campo nombrado en `fields` y ausente en el recurso se borra: la columna vuelve a "Automático".
  // Sin esto, declarar la especie `texto` no limpiaría nada y S seguiría dibujando plata.
  assert.ok(FIELDS.includes('userEnteredFormat.numberFormat'))
  const req = requestsDeFormatoCompras(1, especiesDeEncabezado(['Total o Parcial']), { hastaFila: 10 })
  assert.equal(req.length, 1)
  assert.ok(req[0].repeatCell.fields.includes('userEnteredFormat.numberFormat'))
  assert.equal(req[0].repeatCell.cell.userEnteredFormat.numberFormat, undefined)
})

test('el texto largo se ve: WRAP, porque con la vecina ocupada OVERFLOW no derrama, desaparece', () => {
  const e = especiesDeEncabezado(ENCABEZADO_REAL)
  assert.equal(e[IDX.L], 'textoLargo')
  assert.equal(ESPECIES.textoLargo.wrapStrategy, 'WRAP')
  assert.equal(ESPECIES.texto.wrapStrategy, 'OVERFLOW_CELL')
})

test('toda especie de ESPECIES_CON_NUMERO existe y ninguna es TEXT', () => {
  for (const n of ESPECIES_CON_NUMERO) {
    assert.ok(ESPECIES[n], `${n} no está en el vocabulario`)
    assert.notEqual(ESPECIES[n].numberFormat.type, 'TEXT')
  }
  assert.equal(ESPECIES_CON_NUMERO.includes('texto'), false)
})

test('letra() ubica las columnas de dos letras, que es donde vive el defecto grande', () => {
  assert.equal(letra(29), 'AD')
  assert.equal(letra(37), 'AL')
})
