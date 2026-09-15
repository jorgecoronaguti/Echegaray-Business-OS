// Cada test prueba un defecto medido el 15/09/2026 contra «JORNALES» y la base: si se revierte el
// arreglo, se pone rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  excluidasParaBase, fechasFueraDeQuincena, marcarSuperpuestas, observacionDeCarga, planDeHoja,
} from './liquidacion-jornales-plan.mjs'
import { columnasDelBloque, ROTULOS_OFICINA } from './liquidacion-jornales.mjs'

const HOY = new Date('2026-09-15T12:00:00Z')

// ── «Obreros 26», 2ª de marzo: rótulos arriba de las fechas y filas BAJA al final del bloque ──────
function obrero(n, nombre, { total, banco = '', adelanto = '', efectivo }) {
  const p = []
  p[0] = n; p[1] = nombre; p[21] = '10'; p[22] = '$100'
  p[23] = banco; p[25] = adelanto; p[26] = efectivo; p[27] = total
  return p
}
function grillaMarzo({ aguirreEfectivo = '$86.652', aguirreTotal = '$86.652' } = {}) {
  const rot = []
  rot[21] = 'Hs'; rot[22] = '$/h'; rot[23] = 'BANCO'; rot[25] = 'ADELANTO'; rot[26] = 'EFECTIVO'; rot[27] = 'TOTAL'
  const fechas = []
  fechas[5] = '16/3'; fechas[6] = '17/3'; fechas[17] = '31/3'
  return [
    rot, fechas,
    obrero('1', 'Aguero Cristian', { total: '$1.000', efectivo: '$1.000' }),
    obrero('2', 'Ruben Palacio', { total: '$355.500', adelanto: '$100.000', efectivo: '$255.500' }),
    obrero('BAJA', 'Pablo Ramos', { total: '$504.000', efectivo: '$504.000' }),
    // f192 real: BANCO 383.347,94 + EFECTIVO 86.652 contra un TOTAL de 86.652 — la cadena no cierra.
    obrero('BAJA', 'Leandro Aguirre', { total: aguirreTotal, banco: '$383.347,94', efectivo: aguirreEfectivo }),
  ]
}
const IDS = { 'aguero cristian': 'p-aguero', 'palacio ruben': 'p-palacios', 'aguirre leandro': 'p-aguirre' }
const resolver = (l) => (IDS[l.clave] ? { persona: { id: IDS[l.clave], nombre: l.nombre }, via: 'exacta' } : { persona: null, via: 'sin-persona' })

test('LAS FILAS BAJA SE LEEN: por defecto quedan afuera CON su importe, y la quincena ya no dice «completa»', () => {
  // El defecto: detectarQuincenas cortaba el bloque en la primera BAJA, $2.330.852 no existían para
  // la carga y `monto_excluido` declaraba 0.
  const { quincenas } = planDeHoja({ grid: grillaMarzo(), anio: 2026, hoy: HOY, resolver })
  assert.equal(quincenas.length, 1)
  const c = quincenas[0].control
  assert.deepEqual(c.cargables.map((l) => l.nombre), ['Aguero Cristian', 'Ruben Palacio'])
  assert.deepEqual(c.excluidas.map((l) => [l.nombre, l.motivo]), [['Pablo Ramos', 'baja'], ['Leandro Aguirre', 'baja']])
  assert.equal(c.montoExcluido, 504000 + 86652)
  assert.equal(c.completa, false)
  // Una BAJA con la cadena rota NO voltea la quincena: no se carga, pero se nombra con su detalle.
  assert.equal(c.cierra, true)
  assert.match(excluidasParaBase(c)[1].detalle, /no cierra/)
  // El invariante: lo cargable más lo declarado afuera es todo lo que la planilla suma.
  assert.equal(c.totalCargable + c.montoExcluido, c.totalSheet)
  assert.match(observacionDeCarga('Obreros 26', c), /2 fila\(s\) marcadas BAJA no se cargaron/)
})

test('--incluir-bajas: la BAJA con persona entra, la que no tiene persona sigue declarada, y la rota voltea la quincena', () => {
  const rota = planDeHoja({ grid: grillaMarzo(), anio: 2026, hoy: HOY, resolver, incluirBajas: true }).quincenas[0].control
  assert.equal(rota.cierra, false, 'Aguirre no cierra: cargarla sería afirmar una plata que no se sabe cuánto es')
  assert.deepEqual(rota.bloqueantes.map((l) => l.nombre), ['Leandro Aguirre'])

  const sana = grillaMarzo({ aguirreEfectivo: '$86.652,06', aguirreTotal: '$470.000' })
  const c = planDeHoja({ grid: sana, anio: 2026, hoy: HOY, resolver, incluirBajas: true }).quincenas[0].control
  assert.equal(c.cierra, true)
  assert.deepEqual(c.cargables.map((l) => l.nombre), ['Aguero Cristian', 'Ruben Palacio', 'Leandro Aguirre'])
  assert.deepEqual(c.excluidas.map((l) => [l.nombre, l.motivo]), [['Pablo Ramos', 'sin_persona']])
  assert.equal(c.montoExcluido, 504000)
  assert.equal(c.bajasCargadas, 1)
  assert.equal(c.totalCargable + c.montoExcluido, c.totalSheet)
  assert.match(observacionDeCarga('Obreros 26', c), /Incluye 1 fila\(s\) marcadas BAJA/)
})

// ── «Oficina 26»: rótulos en la fila 1 de la pestaña, bloques con la quincena repetida ──────────
function oficinista(n, nombre, { hs, vh, banco = '', recibo, semana }) {
  const p = []
  p[0] = n; p[1] = nombre; p[20] = hs; p[21] = vh; p[22] = banco; p[23] = ''; p[24] = recibo; p[25] = semana
  return p
}
function grillaOficina() {
  const rot = ['x', 'OBRERO']
  rot[20] = 'DIAS / HORAS'; rot[21] = '$ HORA'; rot[22] = 'BANCO'; rot[23] = 'ADELANTO'; rot[24] = 'TOTAL RECIBO'; rot[25] = 'TOTAL SEMANA'
  const f = (...d) => { const r = []; d.forEach((x, i) => { r[4 + i] = x }); return r }
  return [
    rot, [],
    f('2/2', '3/2', '4/2'), //                                                             fila 3
    oficinista('1', 'Emi Maldonado', { hs: '96,0', vh: '$8.125', recibo: '$780.000', semana: '$780.000' }),
    // Banco giró el mes entero: TOTAL RECIBO negativo y la cadena cierra igual (fila 7 real).
    oficinista('2', 'Ignacio Nievas', { hs: '72,0', vh: '$6.250', banco: '$543.982,19', recibo: '-$93.982,19', semana: '$450.000' }),
    [],
    f('2/2', '3/2', '4/2'), // bajo MARZO, encabezado de febrero copiado                     fila 7
    oficinista('1', 'Emi Maldonado', { hs: '92,0', vh: '$8.125', recibo: '$747.500', semana: '$747.500' }),
    [],
    f('1/4', '2/3', '3/4'), // «2/3» tipeado en medio de abril                               fila 10
    oficinista('1', 'Emi Maldonado', { hs: '105,0', vh: '$8.125', recibo: '$853.125', semana: '$853.125' }),
  ]
}
const resolverOficina = (l) => ({ persona: { id: `p-${l.clave}`, nombre: l.nombre }, via: 'exacta' })

test('OFICINA 26 SE LEE: sus rótulos están en la fila 1 de la pestaña y TOTAL RECIBO es el efectivo', () => {
  const g = grillaOficina()
  const bloque = { inicio: 4, fin: 5, filaFecha: 3 }
  // El defecto: con los rótulos de Obreros, o sin mirar la fila 1, Oficina no tiene ni un bloque cargable.
  assert.ok(columnasDelBloque(g, bloque).faltan.length > 0)
  assert.ok(columnasDelBloque(g, bloque, { filaRotulos: 1 }).faltan.length > 0, 'los rótulos de Obreros no leen Oficina')
  assert.ok(columnasDelBloque(g, bloque, { rotulos: ROTULOS_OFICINA }).faltan.length > 0, 'sin la fila 1 no hereda nada')
  assert.deepEqual(columnasDelBloque(g, bloque, { rotulos: ROTULOS_OFICINA, filaRotulos: 1 }).cols,
    { horas: 20, valorHora: 21, porBanco: 22, adelanto: 23, enEfectivo: 24, cobra: 25, yaTransferido: [] })
  const { quincenas } = planDeHoja({ grid: g, anio: 2026, hoy: HOY, resolver: resolverOficina, rotulos: ROTULOS_OFICINA, filaRotulos: 1 })
  const nievas = quincenas[0].control.cargables.find((l) => l.nombre === 'Ignacio Nievas')
  assert.equal(nievas.incompleta, null)
  assert.equal(nievas.enEfectivo, -93982.19)
  // A centavos: la columna es numeric(14,2) y su CHECK compara round(…, 2); en JS la resta da 449999,99999.
  assert.equal(Math.round(nievas.total * 100) / 100, 450000)
})

test('DOS BLOQUES CON LA MISMA QUINCENA: una línea por persona (la del primero) y la repetida se declara', () => {
  const { quincenas, avisos } = planDeHoja({ grid: grillaOficina(), anio: 2026, hoy: HOY, resolver: resolverOficina, rotulos: ROTULOS_OFICINA, filaRotulos: 1 })
  assert.deepEqual(quincenas.map((q) => q.desde), ['2026-02-01', '2026-04-01'])
  const feb = quincenas[0]
  assert.deepEqual(feb.bloques, [4, 8])
  // El defecto: el upsert por (quincena, persona) dejaba en silencio la línea del ÚLTIMO bloque.
  const maldo = feb.control.cargables.filter((l) => l.nombre === 'Emi Maldonado')
  assert.equal(maldo.length, 1)
  assert.equal(maldo[0].cobra, 780000)
  assert.equal(maldo[0].fila, 4)
  const [repetida] = excluidasParaBase(feb.control)
  assert.deepEqual(repetida, { nombre: 'Emi Maldonado', importe: 747500, motivo: 'bloque_superpuesto', fila: 8 })
  assert.equal(feb.control.totalCargable + feb.control.montoExcluido, feb.control.totalSheet)
  assert.ok(avisos.some((a) => /2 bloques con la misma quincena \(filas 4, 8\)/.test(a)))
  // La quincena del bloque con «2/3» sale de la primera fecha escrita, y el tipeo se declara.
  assert.equal(quincenas[1].desde, '2026-04-01')
  assert.ok(avisos.some((a) => /trae 2\/3 fuera de 2026-04-01\.\.2026-04-15/.test(a)))
})

test('marcarSuperpuestas: sin persona resuelta, la clave del nombre también identifica la repetición', () => {
  const l = marcarSuperpuestas([{ fila: 1, clave: 'a b' }, { fila: 2, clave: 'a b' }, { fila: 3, clave: 'c d' }])
  assert.deepEqual(l.map((x) => x.superpuesta ?? null), [null, 1, null])
})

test('fechasFueraDeQuincena: el bloque que se pasa un día (4/5..16/5) no es un tipeo', () => {
  const rango = { desde: '2026-05-01', hasta: '2026-05-15' }
  assert.deepEqual(fechasFueraDeQuincena([['4/5', '15/5', '16/5']], { filaFecha: 1 }, rango, 2026), [])
  assert.deepEqual(fechasFueraDeQuincena([['4/5', '2/3', '16/5']], { filaFecha: 1 }, rango, 2026), ['2/3'])
})
