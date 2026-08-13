// EL TEST QUE CIERRA LA DIVERGENCIA DE "MATERIALES".
//
// El dueño, 13/08/2026: *"el mismo concepto de materiales sea familia o individual no pueden diferir
// de ninguna manera"*. Lo que probaba el repo hasta hoy era que cada pestaña tenía la fórmula que su
// propio test esperaba — y las dos pasaban en verde midiendo cosas distintas: OBRAS el neto,
// Materiales el total con IVA. Un test de forma no puede ver eso; sólo puede verlo un test que
// EVALÚE las dos fórmulas sobre los mismos datos y compare los dos números.
//
// Por eso acá no se compara texto contra texto: se arma un "Compras" de mentira con los casos que el
// archivo real tiene (compra con IVA discriminado, compra sin discriminar, material sin clasificar,
// gasto que no es material, otra obra), se corren las dos pestañas como las corre el generador y se
// exige que el número de OBRAS sea EL MISMO que el de la fila "TOTAL POR OBRA" de Materiales.

import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluarFormula } from './evaluar-formula-sheet.mjs'
import { netoDeFila, sumaNetaSheet, esMaterialSheet, netoDeFilaCruda } from './costo-materiales.mjs'
import { bloqueMaterialesPorObra, FILA_TOTAL } from './materiales-por-obra.mjs'
import { grillaObras, REFS_OBRAS, ANCHO_OBRAS } from './obras-grilla.mjs'
import { obrasConMateriales } from './obras-con-materiales.mjs'
import { SIN_FAMILIA, RUBROS_CON_FAMILIA } from './familia-material.mjs'
import { OBRAS_FUTURAS } from './obras-datos.mjs'

// ═══ EL "COMPRAS" DE PRUEBA ═══
// Cada fila es un caso que el archivo real tiene, y el comentario dice cuánto tiene que aportar al
// costo de materiales de LA ESTRELLA. El total esperado se calcula a mano, no con la fórmula que se
// está probando: un control no se valida contra la información que produce.
const OBRA = 'LA ESTRELLA'
const FILAS = [
  // obra          importe(M)   iva(N)   total(O)  familia(AE)              rubro(AB)
  [OBRA, 1_000_000, 210_000, 1_210_000, 'Hierro y malla', RUBROS_CON_FAMILIA[0]], // + 1.000.000
  [OBRA, 400_000, 84_000, 484_000, 'Hierro y malla', RUBROS_CON_FAMILIA[0]], //     +   400.000
  // SIN DISCRIMINAR: "Importe" vacío y sin IVA — el Total ES el neto. En el archivo real son 54
  // filas por $55.990.869; tomarlas como 0 las borraría, tomar su Total con IVA no existe (no tienen).
  [OBRA, '', '', 700_000, 'Cemento, cal y áridos', RUBROS_CON_FAMILIA[0]], //       +   700.000
  // MATERIAL QUE NADIE DESCRIBIÓ: sigue siendo material. Si se cayera del cuadro, el total por obra
  // dejaría de cerrar con el total por familia — que es el control que la pestaña publica.
  [OBRA, 300_000, 63_000, 363_000, SIN_FAMILIA, RUBROS_CON_FAMILIA[0]], //          +   300.000
  // MANTENIMIENTO es material igual que Civil: son los dos rubros con familia.
  [OBRA, 250_000, 52_500, 302_500, 'Ferretería y consumibles', RUBROS_CON_FAMILIA[1]], // + 250.000
  // NO ES MATERIAL: un F931 de la misma obra. Familia vacía ⇒ afuera de las dos caras.
  [OBRA, '', '', 5_000_000, '', 'Nómina · Cargas sociales'], //                            0
  // OTRA OBRA: no puede filtrarse a la fila de LA ESTRELLA.
  ['San Francisco', 900_000, 189_000, 1_089_000, 'Hierro y malla', RUBROS_CON_FAMILIA[0]], // 0
]
const ESPERADO = 1_000_000 + 400_000 + 700_000 + 300_000 + 250_000
const CON_IVA_VIEJO = 1_210_000 + 484_000 + 700_000 + 363_000 + 302_500

/** El "Compras" como lo lee el evaluador: una celda por columna real de la planilla. */
function hojaCompras(filas = FILAS) {
  const { cliente, neto, iva, total, familia, desde } = REFS_OBRAS.cmp
  const h = {}
  filas.forEach((f, i) => {
    const r = desde + i
    h[`${cliente}${r}`] = f[0]; h[`${neto}${r}`] = f[1]; h[`${iva}${r}`] = f[2]
    h[`${total}${r}`] = f[3]; h[`${familia}${r}`] = f[4]; h[`AB${r}`] = f[5]
  })
  return h
}

/** Los rangos abiertos de Compras, con las letras que resuelve el escritor. */
const RANGOS = {
  neto: `Compras!$${REFS_OBRAS.cmp.neto}$4:$${REFS_OBRAS.cmp.neto}`,
  iva: `Compras!$${REFS_OBRAS.cmp.iva}$4:$${REFS_OBRAS.cmp.iva}`,
  total: `Compras!$${REFS_OBRAS.cmp.total}$4:$${REFS_OBRAS.cmp.total}`,
  familia: `Compras!$${REFS_OBRAS.cmp.familia}$4:$${REFS_OBRAS.cmp.familia}`,
  obra: `Compras!$${REFS_OBRAS.cmp.cliente}$4:$${REFS_OBRAS.cmp.cliente}`,
}

/** Las familias que la pestaña Materiales lista, en el orden en que las escribe el generador. */
const FAMILIAS = ['Hierro y malla', 'Cemento, cal y áridos', 'Ferretería y consumibles']

/** La sección "POR OBRA" armada como la arma el generador, y evaluada contra el Compras de prueba. */
function pestanaMateriales({ obras = [OBRA, 'San Francisco'], filas = FILAS } = {}) {
  const filaCabecera = 1
  const b = bloqueMaterialesPorObra({
    obras, familias: [...FAMILIAS, SIN_FAMILIA], sinFamilia: SIN_FAMILIA, rangos: RANGOS, filaCabecera,
  })
  const grid = [b.cabecera, ...b.detalle, b.total]
  const hoja = {}
  grid.forEach((fila, f) => fila.forEach((v, c) => { hoja[`${String.fromCharCode(65 + c)}${f + 1}`] = v }))
  const ctx = { hoja, hojas: { Compras: hojaCompras(filas) } }
  const filaTotal = grid.length
  assert.equal(hoja[`A${filaTotal}`], FILA_TOTAL, 'la fila que OBRAS cita por rótulo tiene que existir')
  return {
    porObra: (i) => evaluarFormula(hoja[`${String.fromCharCode(66 + i)}${filaTotal}`], ctx),
    sinObra: evaluarFormula(hoja[`${String.fromCharCode(65 + obras.length + 2)}${filaTotal}`], ctx),
    total: evaluarFormula(hoja[`${String.fromCharCode(65 + obras.length + 1)}${filaTotal}`], ctx),
  }
}

/** La celda "Materiales (neto)" de OBRAS para un cliente, evaluada contra el mismo Compras. */
function pestanaObras({ cliente = OBRA, filas = FILAS } = {}) {
  const g = grillaObras({ obras: OBRAS_FUTURAS, clientes: [cliente] })
  const [f0] = g.fClientes
  const celda = g.filas[f0 - 1][6] // G = "Materiales (neto)"
  assert.equal(g.filas[f0 - 1][0], cliente)
  assert.equal(g.filas[0].length, ANCHO_OBRAS)
  return { celda, valor: evaluarFormula(celda, { hoja: {}, hojas: { Compras: hojaCompras(filas) } }) }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
test('LA REGLA: las dos pestañas dan EXACTAMENTE el mismo costo de materiales por obra', () => {
  const obras = pestanaObras()
  const mat = pestanaMateriales()
  assert.equal(obras.valor, ESPERADO, 'OBRAS mide el neto')
  assert.equal(mat.porObra(0), ESPERADO, 'la pestaña Materiales mide lo mismo')
  assert.equal(obras.valor, mat.porObra(0), 'y por eso no pueden diferir')
  // El criterio viejo de Materiales daba este otro número. Si alguien vuelve a "Total" (O), la
  // igualdad de arriba se rompe y este test dice exactamente cuánto se movió.
  assert.notEqual(ESPERADO, CON_IVA_VIEJO)
  assert.equal(CON_IVA_VIEJO - ESPERADO, 409_500, 'la diferencia era el IVA de compras: crédito fiscal, no costo')
})

test('la otra obra no se filtra, y el control "Sin obra" cierra en cero', () => {
  const mat = pestanaMateriales()
  assert.equal(mat.porObra(1), 900_000, 'San Francisco entra por su neto, no por el de LA ESTRELLA')
  assert.equal(mat.total, ESPERADO + 900_000)
  // "Sin obra" mide la plata de esa familia que ninguna columna se llevó: con todas las obras
  // listadas tiene que dar cero. Es el control que descubrió a Quattropani.
  assert.equal(mat.sinObra, 0)
})

test('una obra que falta en las columnas la delata el control, no el silencio', () => {
  const mat = pestanaMateriales({ obras: [OBRA] })
  assert.equal(mat.sinObra, 900_000, 'lo que no tiene columna aparece en "Sin obra" — y ahora en neto')
})

test('EL DEFECTO, EN FRÍO: sumar "Total" en vez del neto rompe la igualdad', () => {
  // La fórmula que la pestaña Materiales tenía antes, tal cual: SUMIFS del Total con IVA.
  const vieja = `=SUMIFS(${RANGOS.total};${RANGOS.familia};"<>";${RANGOS.obra};"${OBRA}")`
  const conIva = evaluarFormula(vieja, { hoja: {}, hojas: { Compras: hojaCompras() } })
  assert.equal(conIva, CON_IVA_VIEJO)
  assert.notEqual(conIva, pestanaObras().valor, 'era esto lo que el dueño veía distinto en dos pestañas')
})

test('las filas sin "Importe" entran por Total − IVA, no como cero ni con IVA', () => {
  // La fila sin discriminar aporta sus $700.000 enteros: es el caso de las 54 filas reales por $56M.
  const sinEsaFila = FILAS.filter((f) => f[3] !== 700_000)
  assert.equal(pestanaObras({ filas: sinEsaFila }).valor, ESPERADO - 700_000)
  assert.equal(pestanaMateriales({ filas: sinEsaFila }).porObra(0), ESPERADO - 700_000)
  // Y un CERO tipeado no es un vacío: no se le aplica Total − IVA.
  assert.equal(netoDeFila({ neto: 0, iva: 21_000, total: 121_000 }), 0)
  assert.equal(netoDeFila({ neto: '', iva: 0, total: 121_000 }), 121_000)
  assert.equal(netoDeFila({ neto: 100_000, iva: 21_000, total: 121_000 }), 100_000)
})

test('el material SIN CLASIFICAR sigue siendo material en las dos caras', () => {
  const sinEse = FILAS.filter((f) => f[4] !== SIN_FAMILIA)
  assert.equal(pestanaObras({ filas: sinEse }).valor, ESPERADO - 300_000)
  assert.equal(pestanaMateriales({ filas: sinEse }).porObra(0), ESPERADO - 300_000)
})

test('el universo es el mismo: "familia no vacía" y no una lista de rubros', () => {
  // Verificado contra el archivo vivo (13/08/2026): 0 filas con familia y sin rubro de material, y 0
  // con rubro de material y sin familia. La columna de familia YA es la proyección del rubro.
  assert.equal(esMaterialSheet('X'), 'X;"<>"')
  const soloNoMaterial = FILAS.filter((f) => !f[4])
  assert.equal(pestanaObras({ filas: soloNoMaterial }).valor, 0, 'un F931 de la obra no es material')
  assert.equal(pestanaMateriales({ filas: soloNoMaterial }).porObra(0), 0)
})

test('el ORDEN de las columnas se decide con el mismo criterio que muestran las celdas', () => {
  // Ordenar por el total con IVA mientras las celdas muestran el neto es una tercera medición del
  // mismo concepto, escondida donde nadie la mira.
  const crudas = FILAS.map((f) => {
    const fila = []
    fila[9] = f[0]; fila[12] = f[1]; fila[13] = f[2]; fila[14] = f[3]; fila[30] = f[4]; fila[28] = f[5]
    return fila
  })
  const monto = (v) => Number(v) || 0
  const obras = obrasConMateriales(crudas, { rubros: RUBROS_CON_FAMILIA, monto })
  assert.deepEqual(obras, [OBRA, 'San Francisco'])
  assert.equal(netoDeFilaCruda(crudas[2], { monto, colNeto: 12, colIva: 13, colTotal: 14 }), 700_000)
})

test('una fórmula con un rango sin resolver NO se emite: parsea distinto y Sheets la rechaza', () => {
  assert.throws(() => sumaNetaSheet({ neto: undefined, iva: 'a', total: 'b', criterios: 'c' }),
    /"neto" tiene que ser un rango/)
  assert.throws(() => bloqueMaterialesPorObra({ obras: [], familias: [], rangos: RANGOS, filaCabecera: 0 }),
    /filaCabecera/)
})
