// LO QUE ESTE TEST ATRAPA, DEFECTO POR DEFECTO.
//
// La pestaña «Materiales» estuvo veintiséis días sin dueño y su layout se congeló con TRES defectos
// que ningún test podía ver, porque el generador viejo mezclaba la grilla con la red: no había una
// función pura que evaluar.
//
//   1. EL RENGLÓN NO CERRABA. La columna decía «Total neto 2026» y no era la suma de sus doce meses:
//      medido el 09/09 sobre el archivo real, $374.194,86 en tres filas sin «Fecha de caja» estaban
//      en el total y en ningún mes. `la fila cierra por tiempo` se pone rojo si el residuo se saca.
//   2. LA MEDICIÓN PODÍA DIVERGIR de la de OBRAS. El cuadro sumaba «Total» (con IVA) mientras OBRAS
//      medía el neto: $31M de diferencia entre dos celdas que dicen la misma palabra. `los dos
//      bloques cierran en el mismo peso` lo evalúa contra los MISMOS datos, no compara texto.
//   3. LOS RÓTULOS QUE OTRA PESTAÑA LEE eran del generador y de nadie más. OBRAS aborta si no
//      encuentra «TOTAL POR OBRA» y «2 · POR OBRA» en la columna A de esta pestaña.
//
// Y el contrato de diseño se mide con su propio auditor (`auditarDiseno`), no a ojo: cero prosa,
// numeración consecutiva, encabezado de tres filas.

import test from 'node:test'
import assert from 'node:assert/strict'
import { grilla, formatosPropios, FAMILIAS_DEL_CUADRO, ROTULO_TOTAL, ROTULOS_COMPRAS } from './materiales-pestana.mjs'
import { evaluarFormula } from '../lib/evaluar-formula-sheet.mjs'
import { auditarDiseno } from '../lib/diseno-unificado.mjs'
import { REFS_OBRAS } from '../lib/obras-grilla.mjs'
import { FILA_TOTAL as ROTULO_TOTAL_OBRA } from '../lib/materiales-por-obra.mjs'
import { FILA_BLOQUE } from '../lib/control-arca-bloque.mjs'
import { SIN_FAMILIA, RUBROS_CON_FAMILIA } from '../lib/familia-material.mjs'
import { VACIO } from '../lib/preservar-anotaciones.mjs'
import { CONTADOR } from '../lib/formato-statement.mjs'

const L = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

/** Las columnas de Compras que el generador resuelve por rótulo, con las letras del archivo real. */
const COL = { neto: 'M', iva: 'N', total: 'O', familia: 'AE', fechaCaja: 'AD', fechaFactura: 'C', obra: 'J', rubro: 'AB' }
const RANGOS = Object.fromEntries(Object.entries(COL).map(([k, l]) => [k, `Compras!$${l}$4:$${l}`]))
const OBRAS = ['LA ESTRELLA', 'San Francisco']

// Seriales de Sheets: 1/1/2026 = 46023 (verificado contra el encabezado real de la pestaña).
const ENE = 46023, FEB = 46054, MAR = 46082
const CIVIL = RUBROS_CON_FAMILIA[0], MANT = RUBROS_CON_FAMILIA[1]

// ═══ EL «COMPRAS» DE PRUEBA ═══
// Cada fila es un caso que el archivo real tiene, y el comentario dice cuánto tiene que aportar. El
// esperado se calcula a mano: un control no se valida contra la información que produce.
const FILAS = [
  // obra              M          N        O          familia                     rubro   fecha de caja
  ['LA ESTRELLA', 1_000_000, 210_000, 1_210_000, 'Hierro y malla', CIVIL, ENE], //          + 1.000.000 en enero
  // SIN DISCRIMINAR: «Importe» vacío y sin IVA — el Total ES el neto (54 filas así en el real).
  ['LA ESTRELLA', '', '', 700_000, 'Cemento, cal y áridos', CIVIL, FEB], //                 +   700.000 en febrero
  ['San Francisco', 250_000, 52_500, 302_500, 'Ferretería y consumibles', MANT, MAR], //    +   250.000 en marzo
  // SIN FECHA DE CAJA: es material igual, pero no cae en ningún mes. Es el caso que hacía que el
  // renglón no cerrara — y el que la columna «Fuera de los 12 meses» tiene que mostrar.
  ['LA ESTRELLA', 300_000, 63_000, 363_000, SIN_FAMILIA, CIVIL, ''], //                     +   300.000 sin mes
  // NO ES MATERIAL: un F931 de la misma obra. Familia vacía ⇒ afuera de las dos particiones.
  ['LA ESTRELLA', '', '', 5_000_000, '', 'Nómina · Cargas sociales', ENE], //                        0
]
const TOTAL = 2_250_000
const CON_IVA_SI_ALGUIEN_VUELVE_A_SUMAR_O = 1_210_000 + 700_000 + 302_500 + 363_000

function hojaCompras(filas = FILAS) {
  const h = {}
  filas.forEach((f, i) => {
    const r = 4 + i
    h[`${COL.obra}${r}`] = f[0]; h[`${COL.neto}${r}`] = f[1]; h[`${COL.iva}${r}`] = f[2]
    h[`${COL.total}${r}`] = f[3]; h[`${COL.familia}${r}`] = f[4]; h[`${COL.rubro}${r}`] = f[5]
    h[`${COL.fechaCaja}${r}`] = f[6]
  })
  return h
}

/** La grilla armada como la arma el generador, más un evaluador de cualquiera de sus celdas. */
function pestana({ obras = OBRAS, filas = FILAS } = {}) {
  const g = grilla({ obras, rangos: RANGOS })
  const hoja = {}
  // LOS ENCABEZADOS DE MES LLEGAN COMO SHEETS LOS DEJA: la grilla los escribe «1/3/2026» y Sheets los
  // guarda como SERIAL al entrar por USER_ENTERED. Evaluarlos como texto haría fallar el EOMONTH del
  // criterio y el test estaría probando el parser del evaluador, no la fórmula.
  const serial = (t) => { const [d, m, a] = String(t).split('/').map(Number); return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000) }
  g.filas.forEach((fila, f) => fila.forEach((v, c) => {
    if (v === VACIO) return
    hoja[`${L(c)}${f + 1}`] = f + 1 === g.fCab && /^\d+\/\d+\/\d{4}$/.test(String(v)) ? serial(v) : v
  }))
  const ctx = { hoja, hojas: { Compras: hojaCompras(filas) } }
  return { g, hoja, celda: (ref) => evaluarFormula(hoja[ref], ctx) }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
test('LA REGLA: los dos bloques cierran en el mismo peso, y es el NETO', () => {
  const { g, celda } = pestana()
  const total1 = celda(`Q${g.fTot}`)
  const total2 = celda(`${L(OBRAS.length + 1)}${g.fTotObra}`)
  assert.equal(total1, TOTAL, 'el cuadro por familia no mide el neto compartido')
  assert.equal(total2, TOTAL, 'el cuadro por obra no cierra con el de familia')
  // Si alguien vuelve a sumar «Total» (con IVA), como hacía el cuadro hasta el 13/08, el número se
  // mueve $525.500 sobre este juego de datos y las dos igualdades de arriba se rompen a la vez.
  assert.notEqual(total1, CON_IVA_SI_ALGUIEN_VUELVE_A_SUMAR_O)
})

test('la fila cierra por TIEMPO: los doce meses más el residuo dan el total', () => {
  const { g, celda } = pestana()
  const meses = [...Array(12).keys()].reduce((s, m) => s + celda(`${L(1 + m)}${g.fTot}`), 0)
  assert.equal(meses, TOTAL - 300_000, 'los doce meses no pueden contener la compra sin fecha de caja')
  assert.equal(celda(`N${g.fTot}`), 300_000, '«Fuera de los 12 meses» es el residuo: sin él la fila no cierra')
  assert.equal(meses + celda(`N${g.fTot}`), celda(`Q${g.fTot}`))
})

test('la fila cierra por RUBRO: Civil más Mantenimiento dan el total', () => {
  const { g, celda } = pestana()
  assert.equal(celda(`O${g.fTot}`), 2_000_000)
  assert.equal(celda(`P${g.fTot}`), 250_000)
  assert.equal(celda(`O${g.fTot}`) + celda(`P${g.fTot}`), celda(`Q${g.fTot}`))
})

test('cada obra recibe lo suyo y «Sin obra» queda en cero', () => {
  const { g, celda } = pestana()
  assert.equal(celda(`B${g.fTotObra}`), 2_000_000, 'LA ESTRELLA')
  assert.equal(celda(`C${g.fTotObra}`), 250_000, 'San Francisco')
  assert.equal(celda(`${L(OBRAS.length + 2)}${g.fTotObra}`), 0, '«Sin obra» ≠ 0 significa una obra sin columna')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE OTRA PESTAÑA LEE. `obras-pestana.mjs` aborta si no encuentra estos dos rótulos en la
// columna A; sin este test, cambiarlos deja seis celdas de OBRAS mudas y nadie se entera.
test('los dos rótulos que la pestaña OBRAS exige están en la columna A', () => {
  const { g } = pestana()
  const colA = g.filas.map((f) => String(f[0] ?? '').trim())
  for (const r of [REFS_OBRAS.mat.filaTotal, REFS_OBRAS.mat.filaCabecera]) {
    assert.ok(colA.includes(r), `falta el rótulo «${r}»: OBRAS aborta y no publica el costo de materiales`)
  }
  assert.equal(REFS_OBRAS.mat.hoja, 'Materiales')
  assert.equal(colA[g.fTotObra - 1], ROTULO_TOTAL_OBRA)
  assert.equal(colA[g.fTot - 1], ROTULO_TOTAL)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
test('el contrato de diseño se cumple entero: cero desvíos del auditor', () => {
  const { g } = pestana()
  // Se mide la grilla como se ve: el centinela no es contenido.
  const vista = g.filas.map((f) => f.map((c) => (c === VACIO ? '' : c)))
  assert.deepEqual(auditarDiseno(vista, { pestana: 'Materiales' }), [])
})

test('el encabezado son tres filas y la tercera respira', () => {
  const { g } = pestana()
  assert.equal(g.filas[0][0], 'Materiales')
  assert.ok(String(g.filas[1][0]).startsWith('='), 'la fecha de corte tipeada envejece: la procedencia es fórmula')
  assert.ok(g.filas[2].every((c) => c === VACIO), 'la fila 3 va vacía')
  assert.ok(g.filas[0].slice(1).every((c) => c === VACIO), 'el título va solo en su fila')
})

test('el titular REFERENCIA la fila de totales, no la recalcula', () => {
  const { g, celda } = pestana()
  assert.equal(g.filas[3][0], 'COMPRADO EN MATERIALES 2026')
  assert.equal(g.filas[3][1], `=$Q$${g.fTot}`)
  assert.equal(g.filas[4][1], `=$O$${g.fTot}`)
  assert.equal(g.filas[5][1], `=$P$${g.fTot}`)
  assert.equal(celda('B4'), TOTAL, 'el titular tiene que dar el mismo número que el cuadro')
  assert.equal(celda('B5') + celda('B6'), celda('B4'), 'las dos sub-líneas son la partición del titular')
  for (const f of [3, 4, 5]) assert.equal(typeof g.filas[f][1], 'string', 'un titular con el número pegado envejece')
})

test('los bloques van 1, 2, 3 y con el rótulo exacto', () => {
  const { g } = pestana()
  const titulos = g.filas.map((f) => String(f[0] ?? '').trim()).filter((a) => /^\d+ · /.test(a))
  assert.deepEqual(titulos, [
    '1 · POR FAMILIA Y POR MES',
    '2 · POR OBRA',
    '3 · RESPALDO FISCAL — contra el libro de IVA de ARCA',
  ])
})

test('el orden de columnas es concepto → meses → importes → porcentaje', () => {
  const { g } = pestana()
  const cab = g.filas[g.fCab - 1]
  assert.equal(cab[0], 'Familia', 'el encabezado nombra su dimensión')
  for (let m = 0; m < 12; m++) assert.equal(cab[1 + m], `1/${m + 1}/2026`, 'los meses son fechas, no texto')
  assert.deepEqual(cab.slice(13, 18), ['Fuera de los 12 meses', 'Civil', 'Mantenimiento', 'Total', '% del total'])
  assert.deepEqual(g.filas[g.fCabObra - 1].slice(0, OBRAS.length + 3), ['Familia', ...OBRAS, 'Total', 'Sin obra'])
})

test('NI UN NÚMERO PEGADO en el cuerpo: todo es fórmula o rótulo', () => {
  const { g } = pestana()
  const pegados = []
  g.filas.forEach((f, i) => f.forEach((c, j) => {
    if (i + 1 === g.fCab) return // el encabezado de meses son fechas: son la dimensión, no un importe
    if (typeof c === 'number') pegados.push(`${L(j)}${i + 1}=${c}`)
  }))
  assert.deepEqual(pegados, [], 'un importe pegado deja de moverse el día que cambia el dato')
})

test('NI UNA PALABRA DE MÁS: el rótulo de la familia sin clasificar no instruye al lector', () => {
  const { g } = pestana()
  const textos = g.filas.flatMap((f) => f.map((c) => String(c ?? '')))
  assert.ok(!textos.some((t) => t.includes('falta describir')), 'el rótulo largo es una instrucción: es prosa')
  const enA = g.filas.map((f) => String(f[0] ?? '').trim())
  assert.ok(enA.includes(SIN_FAMILIA), 'la familia sin clasificar sigue listada: sacarla parte los dos totales')
  // Las mismas familias y en el mismo orden en los dos bloques: si divergen, los totales dejan de cerrar.
  assert.deepEqual(enA.slice(g.f0 - 1, g.f1), [...FAMILIAS_DEL_CUADRO])
  assert.deepEqual(enA.slice(g.f0Obra - 1, g.f1Obra), [...FAMILIAS_DEL_CUADRO])
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL FORMATO DE LA ÚLTIMA FILA DEL BLOQUE DE ARCA (09/09/2026). Desde que dejó de ser un veredicto en
// prosa, esa celda CUENTA FILAS. Con el formato de moneda que hereda de la pasada de arriba, un 3 se
// dibujaría «$3» — el mismo defecto que en agosto dibujó la cobertura del 66% como «$1».
test('la fila que cuenta filas se dibuja como contador, no como plata', () => {
  const { g } = pestana()
  const reqs = formatosPropios(9, g)
  const fila0 = g.arca0 - 1 + FILA_BLOQUE.veredicto   // índice 0-based de la fila del contador
  const sobreLaCelda = reqs.filter((q) => q.repeatCell?.range?.startRowIndex === fila0
    && q.repeatCell.range.startColumnIndex === 1 && q.repeatCell.cell?.userEnteredFormat?.numberFormat)
  assert.ok(sobreLaCelda.length, 'nadie declara el formato de la fila del contador: hereda moneda')
  assert.deepEqual(sobreLaCelda.at(-1).repeatCell.cell.userEnteredFormat.numberFormat, CONTADOR)
})

test('el ancho de la pestaña crece con las obras, no se tipea', () => {
  assert.equal(grilla({ obras: OBRAS, rangos: RANGOS }).ancho, 18)
  const muchas = Array.from({ length: 20 }, (_, i) => `Obra ${i}`)
  assert.equal(grilla({ obras: muchas, rangos: RANGOS }).ancho, 23, 'Familia + 20 obras + Total + Sin obra')
})

test('FALLA CERRADO: sin un rango resuelto no se emite una fórmula rota', () => {
  assert.throws(() => grilla({ obras: OBRAS, rangos: { ...RANGOS, familia: undefined } }), /familia/)
  // El rótulo se resuelve contra el encabezado real de Compras; acá se fija el contrato de nombres.
  assert.equal(ROTULOS_COMPRAS.familia, 'Familia de material')
  assert.equal(ROTULOS_COMPRAS.neto, 'Importe')
})
