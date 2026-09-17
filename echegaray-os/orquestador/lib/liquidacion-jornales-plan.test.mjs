// Cada test prueba un defecto medido el 15/09/2026 contra «JORNALES» y la base: si se revierte el
// arreglo, se pone rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  columnasEditadasEnApp, excluidasParaBase, fechasFueraDeQuincena, marcarSuperpuestas, observacionDeCarga, planDeHoja,
  separarSalteadas, sqlLineaEditada,
} from './liquidacion-jornales-plan.mjs'
import { columnasDelBloque, ROTULOS_OFICINA } from './liquidacion-jornales.mjs'

const HOY = new Date('2026-09-15T12:00:00Z')

// ── «Obreros 26», 2ª de marzo: rótulos arriba de las fechas y filas BAJA al final del bloque ──────
function obrero(n, nombre, { total, banco = '', adelanto = '', efectivo, horas = '10', vh = '$100' }) {
  const p = []
  p[0] = n; p[1] = nombre; p[21] = horas; p[22] = vh
  p[23] = banco; p[25] = adelanto; p[26] = efectivo; p[27] = total
  return p
}
function grillaMarzo({ aguirreEfectivo = '$86.652', aguirreTotal = '$86.652', aguirreHoras = '10', aguirreVh = '$100' } = {}) {
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
    obrero('BAJA', 'Leandro Aguirre', { total: aguirreTotal, banco: '$383.347,94', efectivo: aguirreEfectivo, horas: aguirreHoras, vh: aguirreVh }),
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

test('--incluir-bajas: la BAJA con persona entra, la que no tiene persona sigue declarada, y la rota queda afuera SIN voltear la quincena', () => {
  // El defecto (15/09/2026): Aguirre, f192, bloqueaba la 2ª de marzo entera — 21 líneas legibles afuera por una.
  // MUTACIÓN QUE LO PONE ROJO: sacar la rama `baja_ilegible` de motivoDeExclusion (vuelve a ser bloqueante).
  const rota = planDeHoja({ grid: grillaMarzo(), anio: 2026, hoy: HOY, resolver, incluirBajas: true }).quincenas[0].control
  assert.equal(rota.cierra, true, 'una BAJA ilegible no voltea la quincena')
  assert.deepEqual(rota.bloqueantes, [])
  assert.deepEqual(rota.cargables.map((l) => l.nombre), ['Aguero Cristian', 'Ruben Palacio'], 'Aguirre NO se carga: no se sabe cuánto es')
  assert.deepEqual(rota.excluidas.map((l) => [l.nombre, l.motivo]), [['Pablo Ramos', 'sin_persona'], ['Leandro Aguirre', 'baja_ilegible']])
  assert.equal(rota.montoExcluido, 504000 + 86652, 'el importe declarado de Aguirre es su TOTAL de la planilla')
  assert.equal(rota.totalCargable + rota.montoExcluido, rota.totalSheet)
  assert.match(excluidasParaBase(rota)[1].detalle, /no cierra/)
  assert.match(observacionDeCarga('Obreros 26', rota), /1 fila\(s\) marcadas BAJA no se cargaron porque su plata no cierra/)

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

// ═══ LA PLANILLA NO LE GANA A LO QUE YA DIJO UNA PERSONA EN LA BASE (auditoría 15/09/2026) ═══
// MUTACIÓN QUE PONE ESTO ROJO: que `separarSalteadas` deje pasar todo, o quitar cualquier condición.
test('separarSalteadas: se saltea lo cerrado por alguien, lo sellado, lo reabierto y lo abierto editado a mano', () => {
  const qs = ['01', '02', '03', '04', '05', '06', '07'].map((m) => ({ desde: `2026-${m}-01`, hasta: `2026-${m}-15` }))
  const k = (m) => `obreros|2026-${m}-01|2026-${m}-15`
  const estados = new Map([
    // Las 16 de obreros de hoy: cerradas por ESTE script el 09/09, sin firma ni sello → se recargan.
    [k('01'), { estado: 'cerrada', cerrada_por: null, lineas_manuales: 0, lineas_selladas: 0, reaperturas: 0 }],
    [k('02'), { estado: 'cerrada', cerrada_por: 'u-jorge', lineas_manuales: 0, lineas_selladas: 0, reaperturas: 0 }],
    [k('03'), { estado: 'cerrada', cerrada_por: null, lineas_manuales: 0, lineas_selladas: 3, reaperturas: 0 }],
    [k('04'), { estado: 'abierta', cerrada_por: null, lineas_manuales: 0, lineas_selladas: 0, reaperturas: 1 }],
    [k('05'), { estado: 'abierta', cerrada_por: null, lineas_manuales: 2, lineas_selladas: 0, reaperturas: 0 }],
    [k('06'), { estado: 'abierta', cerrada_por: null, lineas_manuales: 0, lineas_selladas: 0, reaperturas: 0 }],
    // 07: no existe en la base → se carga.
  ])
  const { aCargar, salteadas } = separarSalteadas(qs, 'obreros', estados)
  assert.deepEqual(aCargar.map((q) => q.desde.slice(5, 7)), ['01', '06', '07'])
  assert.deepEqual(salteadas.map((q) => [q.desde.slice(5, 7), q.salteada]), [
    ['02', 'cerrada por u-jorge'],
    ['03', 'sellada (3 línea/s)'],
    ['04', 'reabierta 1 vez/veces'],
    ['05', 'abierta con 2 línea(s) editadas en la app'],
  ])
  // El estado es por grupo: la misma quincena de oficina no hereda el cierre de obreros.
  assert.equal(separarSalteadas(qs.slice(1, 2), 'oficina', estados).aCargar.length, 1)
})

// ═══ LA GUARDA MIRA TODAS LAS CELDAS EDITABLES, NO SIETE TIPEADAS (15/09/2026) ═══
// La 1ª de septiembre decía «1 línea editada» y eran 2: Agüero tenía `horas_recibo_manual` = 50.
// MUTACIONES QUE PONEN ESTO ROJO: volver a una lista fija de siete, u olvidar `efectivo_redondeado`.
test('sqlLineaEditada: sale de las columnas de la base y cubre negro_manual, horas_recibo_manual y efectivo_redondeado', async () => {
  const deLaBase = ['id', 'horas', 'cobra', 'horas_manual', 'cobra_manual', 'negro_manual', 'horas_recibo_manual',
    'valor_hora_recibo_manual', 'horas_negro_manual', 'efectivo_redondeado', 'pagado_banco', 'pagado_efectivo',
    'formulas', 'sellado_en', 'total']
  const sql = sqlLineaEditada(deLaBase)
  for (const c of ['negro_manual', 'horas_recibo_manual', 'valor_hora_recibo_manual', 'horas_negro_manual',
    'efectivo_redondeado', 'horas_manual', 'pagado_banco', 'pagado_efectivo']) {
    assert.match(sql, new RegExp(`l\\.${c} is not null`), c)
  }
  // `formulas` NO PUEDE ENTRAR: es `not null default '{}'`, así que `is not null` sería verdadero en TODAS las
  // filas y la guarda dejaría de cargar una sola quincena desde JORNALES.
  for (const c of ['horas', 'cobra', 'total', 'sellado_en', 'formulas']) assert.doesNotMatch(sql, new RegExp(`l\\.${c} is not null`), c)
  assert.throws(() => sqlLineaEditada(['id', 'horas']), /NO cargo nada/)
  assert.deepEqual(columnasEditadasEnApp(['x_manual; drop table y', 'ok_manual']), ['ok_manual'])
  // Una sola definición: toda celda que la web guarda (COLUMNA_DE) la reconoce la guarda.
  const { COLUMNA_DE } = await import('../../src/features/administracion/services/liquidacionOverrides.ts')
  const deLaWeb = Object.values(COLUMNA_DE)
  assert.deepEqual(columnasEditadasEnApp(deLaWeb), [...deLaWeb].sort())
})

test('BAJA con el TOTAL de la planilla mal: si Hs × $/h cierra exacto con lo pagado, entra por Hs × $/h y se declara (Aguirre, dueño 15/09)', () => {
  // f192 real: 94 h × $5.000 = 470.000 = BANCO 383.347,94 + EFECTIVO 86.652,06; la celda TOTAL dice 86.652,06.
  // MUTACIÓN QUE LO PONE ROJO: sacar la rama `porHoras` de lineasDelBloque → Aguirre vuelve a `baja_ilegible`.
  const grid = grillaMarzo({ aguirreEfectivo: '$86.652,06', aguirreTotal: '$86.652,06', aguirreHoras: '94', aguirreVh: '$5.000' })
  const c = planDeHoja({ grid, anio: 2026, hoy: HOY, resolver, incluirBajas: true }).quincenas[0].control
  assert.equal(c.cierra, true)
  const aguirre = c.cargables.find((l) => l.nombre === 'Leandro Aguirre')
  assert.ok(aguirre, 'Aguirre se carga')
  assert.equal(aguirre.cobra, 470000)
  assert.equal(aguirre.total, 470000)
  assert.equal(aguirre.porBanco, 383347.94)
  assert.equal(aguirre.enEfectivo, 86652.06)
  assert.equal(aguirre.totalDeLaPlanilla, 86652.06)
  assert.deepEqual(c.excluidas.map((l) => [l.nombre, l.motivo]), [['Pablo Ramos', 'sin_persona']])
  assert.equal(c.totalCargable + c.montoExcluido, c.totalSheet)
  assert.match(observacionDeCarga('Obreros 26', c), /Fila \d+ Leandro Aguirre: TOTAL de la planilla 86652\.06 ≠ Hs × \$\/h 470000/)
  // Sin --incluir-bajas sigue afuera como «baja», ahora con el importe corregido.
  const sinBajas = planDeHoja({ grid, anio: 2026, hoy: HOY, resolver }).quincenas[0].control
  assert.deepEqual(sinBajas.excluidas.map((l) => [l.nombre, l.motivo, l.cobra]), [['Pablo Ramos', 'baja', 504000], ['Leandro Aguirre', 'baja', 470000]])
  // Una pizca de diferencia y NO se corrige: la coincidencia tiene que ser exacta.
  const casi = grillaMarzo({ aguirreEfectivo: '$86.600', aguirreTotal: '$86.652,06', aguirreHoras: '94', aguirreVh: '$5.000' })
  const r = planDeHoja({ grid: casi, anio: 2026, hoy: HOY, resolver, incluirBajas: true }).quincenas[0].control
  assert.deepEqual(r.excluidas.map((l) => l.motivo), ['sin_persona', 'baja_ilegible'])
})

// ── Lo pagado desde JORNALES (dueño, 17/09/2026): sólo huecos, sólo sobre la línea idéntica ──────────
import { pagadoDeLaPlanilla, observacionConPagado, MARCA_PAGADO_JORNALES } from './liquidacion-jornales-plan.mjs'

const baseLinea = (x = {}) => ({
  horas: 97, valor_hora: 4500, cobra: 436500, adelanto: 0, ya_transferido: 0, por_banco: 260000, en_efectivo: 176500,
  pagado_banco: null, pagado_efectivo: null, pagada_en: null, ...x,
})
const filaPlanilla = (x = {}) => ({
  horas: 97, valorHora: 4500, cobra: 436500, adelanto: 0, yaTransferido: 0, porBanco: 260000, enEfectivo: 176500, motivo: null, ...x,
})

test('pagado: banco = ya transferido + por banco; efectivo = adelanto + en efectivo', () => {
  assert.deepEqual(pagadoDeLaPlanilla(baseLinea(), [filaPlanilla()]), { pagado_banco: 260000, pagado_efectivo: 176500 })
  const b = baseLinea({ cobra: 674190, adelanto: 0, ya_transferido: 200000, por_banco: 230240.12, en_efectivo: 243949.88, horas: 99, valor_hora: 6810 })
  const s = filaPlanilla({ cobra: 674190, yaTransferido: 200000, porBanco: 230240.12, enEfectivo: 243949.88, horas: 99, valorHora: 6810 })
  assert.deepEqual(pagadoDeLaPlanilla(b, [s]), { pagado_banco: 430240.12, pagado_efectivo: 243949.88 })
})

test('pagado: lo registrado en la app NO se pisa (banco, efectivo o la marca pagada)', () => {
  for (const x of [{ pagado_banco: 0 }, { pagado_efectivo: 5 }, { pagada_en: '2026-09-16' }]) {
    assert.match(pagadoDeLaPlanilla(baseLinea(x), [filaPlanilla()]).motivo, /ya registrado/)
  }
})

test('pagado: si la base difiere de la planilla no se completa', () => {
  const r = pagadoDeLaPlanilla(baseLinea({ horas: 96 }), [filaPlanilla()])
  assert.match(r.motivo, /difiere.*horas/)
  assert.match(pagadoDeLaPlanilla(baseLinea(), [filaPlanilla({ porBanco: 0, enEfectivo: 436500 })]).motivo, /por banco, en efectivo/)
  assert.match(pagadoDeLaPlanilla(baseLinea({ adelanto: null }), [filaPlanilla()]).motivo, /adelanto/)
})

test('pagado: sin fila, fila excluida o repetida → sin dato, nunca un cero', () => {
  assert.match(pagadoDeLaPlanilla(baseLinea(), []).motivo, /no la trae/)
  assert.match(pagadoDeLaPlanilla(baseLinea(), [filaPlanilla({ motivo: 'baja' })]).motivo, /excluye \(baja\)/)
  assert.match(pagadoDeLaPlanilla(baseLinea(), [filaPlanilla(), filaPlanilla()]).motivo, /2 veces/)
  assert.match(pagadoDeLaPlanilla(null, [filaPlanilla()]).motivo, /sin línea/)
})

test('pagado: una cadena que no suma lo que cobra no se afirma', () => {
  const b = baseLinea({ cobra: 500000 })
  assert.match(pagadoDeLaPlanilla(b, [filaPlanilla({ cobra: 500000 })]).motivo, /no cierra/)
})

test('pagado: un lado negativo (banco que trae más que la quincena) no se afirma', () => {
  const b = baseLinea({ horas: 106, valor_hora: 9500, cobra: 1007000, por_banco: 1365000, en_efectivo: -358000 })
  const s = filaPlanilla({ horas: 106, valorHora: 9500, cobra: 1007000, porBanco: 1365000, enEfectivo: -358000 })
  assert.match(pagadoDeLaPlanilla(b, [s]).motivo, /negativo/)
})

test('observación: agrega la marca una sola vez y conserva lo que había', () => {
  const una = observacionConPagado('Cargada desde JORNALES.', 14, '17/09/2026')
  assert.ok(una.startsWith('Cargada desde JORNALES. ') && una.includes(MARCA_PAGADO_JORNALES) && una.includes('14 línea(s)'))
  assert.equal(observacionConPagado(una, 3, '18/09/2026'), una)
  assert.ok(observacionConPagado(null, 1, 'x').startsWith(MARCA_PAGADO_JORNALES))
})
