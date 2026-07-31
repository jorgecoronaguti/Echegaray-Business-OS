// Tests de la fecha de pago de la quincena. Herméticos: núcleo puro, sin red ni base.
//
// ═══ EL HUECO QUE ESTOS TESTS TAPAN ═══
//
// Hasta hoy NO existía un solo test que verificara EN QUÉ MES O SEMANA del cash flow cae una quincena.
// La fecha de caja era la de cierre —"HASTA = fecha de pago", decía el comentario— y era falsa: el
// extracto del Santander prueba que la quincena que cerró el 15/07 se pagó el 17/07 y la que cerró el
// 30/06 se pagó el 01/07. Sin esta red, alguien vuelve a filtrar por `Hasta` y la plata cambia de mes
// sin que nada se rompa.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aFecha, iso, sumarDiasHabiles, diasHabilesEntre, lotesDeHaberes, pagoDeQuincena,
  desfaseObservado, mesDe, semanaDe, formulaSePagaEl, fechaDeCajaDeQuincena,
  DESFASE_HABILES_DEFAULT, VENTANA_BANCO_DIAS, NATURALEZA_SUELDOS, PARAMETROS,
} from './jornales-fecha-pago.mjs'

// Los lotes REALES del extracto 01/07→31/07 (naturaleza "Sueldos" en _BANCO_RAW).
const MOVS = [
  { fecha: '2026-07-01', concepto: 'Pago haberes - 260701507', importe: -1938254.35, naturaleza: 'Sueldos' },
  { fecha: '2026-07-01', concepto: 'Pago haberes - 260701507', importe: -1807057.16, naturaleza: 'Sueldos' },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -217100, naturaleza: 'Sueldos' },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -252350, naturaleza: 'Sueldos' },
  { fecha: '2026-07-17', concepto: 'Pago de haberes por cci', importe: -252200, naturaleza: 'Sueldos' },
  { fecha: '2026-07-20', concepto: 'Pago de servicios - Imp.afip', importe: -4859763.28, naturaleza: 'AFIP' },
]
const LOTES = lotesDeHaberes(MOVS)

test('EL CASO DEL DUEÑO: la quincena que cierra el 31/07 se paga la semana que viene', () => {
  // 31/07/2026 es VIERNES. El primer día hábil siguiente es el lunes 03/08 — no el sábado.
  const r = pagoDeQuincena('2026-07-31', [], { desfaseHabiles: DESFASE_HABILES_DEFAULT })
  assert.equal(iso(r.pago), '2026-08-03', 'un viernes + 1 hábil es el lunes, no el sábado')
  assert.equal(r.origen, 'parametro', 'el banco todavía no lo pagó: sale del parámetro')
  // Y eso la mueve de mes Y de semana: es exactamente lo que había que reflejar.
  assert.equal(mesDe('2026-07-31'), '2026-07-01')
  assert.equal(mesDe(r.pago), '2026-08-01', 'la captura la columna de AGOSTO, no la de julio')
  assert.equal(semanaDe('2026-07-31'), '2026-07-27')
  assert.equal(semanaDe(r.pago), '2026-08-03', 'y la semana del 03/08, no la del 27/07')
})

test('CUANDO EL BANCO YA LO PROBÓ, MANDA EL BANCO (no el parámetro)', () => {
  // La quincena que cerró el 15/07 se pagó el 17/07: dos días hábiles, no uno.
  const q15 = pagoDeQuincena('2026-07-15', LOTES)
  assert.equal(iso(q15.pago), '2026-07-17')
  assert.equal(q15.origen, 'banco')
  assert.equal(q15.diasHabiles, 2)
  assert.equal(q15.lote.movimientos, 3, 'los tres movimientos del 17/07 son UN lote')
  // La que cerró el 30/06 se pagó el 01/07.
  const q30 = pagoDeQuincena('2026-06-30', LOTES)
  assert.equal(iso(q30.pago), '2026-07-01')
  assert.equal(q30.origen, 'banco')
  assert.equal(q30.diasHabiles, 1)
})

test('LO QUE EL DUEÑO ESCRIBE A MANO MANDA SOBRE TODO', () => {
  // Es la regla de oro del archivo, y acá es además la única forma de cargar un dato que todavía no
  // existe: si él decide pagar el miércoles 05/08 en vez del lunes, eso vale.
  const r = pagoDeQuincena('2026-07-31', LOTES, { manual: '2026-08-05' })
  assert.equal(iso(r.pago), '2026-08-05')
  assert.equal(r.origen, 'manual')
  assert.equal(r.diasHabiles, 3)
  // Incluso contra un lote del banco: si él corrigió, el banco no lo sobreescribe.
  const c = pagoDeQuincena('2026-07-15', LOTES, { manual: '2026-07-20' })
  assert.equal(r.origen, 'manual')
  assert.equal(iso(c.pago), '2026-07-20')
})

test('UN LOTE DEL MISMO DÍA DEL CIERRE ES DE LA QUINCENA ANTERIOR', () => {
  // El 30/06 hay cierre de quincena y también un lote de haberes: ése paga la quincena de la primera
  // mitad de junio, no la que cierra ese día. Tomarlo daría desfase CERO — el defecto que esto arregla.
  const lotes = lotesDeHaberes([{ fecha: '2026-06-30', concepto: 'Pago haberes', importe: -100, naturaleza: 'Sueldos' }])
  const r = pagoDeQuincena('2026-06-30', lotes, { desfaseHabiles: 1 })
  assert.notEqual(iso(r.pago), '2026-06-30', 'no puede pagarse el mismo día que cierra')
  assert.equal(iso(r.pago), '2026-07-01')
  assert.equal(r.origen, 'parametro')
})

test('LA VENTANA EVITA QUE UNA QUINCENA VIEJA SE APROPIE DE UN LOTE LEJANO', () => {
  // Una quincena de enero no se pagó con el lote de julio. Sin ventana, el primer lote se lo llevaba.
  const r = pagoDeQuincena('2026-01-15', LOTES, { ventanaDias: VENTANA_BANCO_DIAS })
  assert.equal(r.origen, 'parametro')
  assert.equal(iso(r.pago), iso(sumarDiasHabiles(aFecha('2026-01-15'), DESFASE_HABILES_DEFAULT)))
  assert.ok(VENTANA_BANCO_DIAS > 0 && VENTANA_BANCO_DIAS < 20, 'la ventana es corta a propósito')
})

test('SÓLO LOS LOTES DE SUELDOS CUENTAN, Y UN DÍA ES UN LOTE', () => {
  // El pago de AFIP del 20/07 no es un lote de haberes y no puede fijar la fecha de pago.
  assert.ok(LOTES.every((l) => iso(l.fecha) !== '2026-07-20'), 'el pago de AFIP quedó afuera')
  assert.equal(NATURALEZA_SUELDOS, 'Sueldos')
  // Quince transferencias del mismo día son UN pago, no quince.
  assert.equal(LOTES.length, 2, 'dos lotes: 01/07 y 17/07')
  assert.equal(LOTES.find((l) => iso(l.fecha) === '2026-07-17').movimientos, 3)
  assert.equal(Math.round(LOTES.find((l) => iso(l.fecha) === '2026-07-01').total), 3745312)
  // Y sin naturaleza declarada, cae al concepto (las capturas de pantalla no traen naturaleza).
  assert.equal(lotesDeHaberes([{ fecha: '2026-07-17', concepto: 'Pago haberes - x', importe: -1 }]).length, 1)
})

test('LOS DÍAS HÁBILES SALTAN EL FIN DE SEMANA', () => {
  assert.equal(iso(sumarDiasHabiles(aFecha('2026-07-31'), 1)), '2026-08-03') // viernes → lunes
  assert.equal(iso(sumarDiasHabiles(aFecha('2026-07-15'), 2)), '2026-07-17') // miércoles → viernes
  assert.equal(iso(sumarDiasHabiles(aFecha('2026-06-30'), 1)), '2026-07-01') // martes → miércoles
  assert.equal(diasHabilesEntre(aFecha('2026-07-15'), aFecha('2026-07-17')), 2)
  assert.equal(diasHabilesEntre(aFecha('2026-06-30'), aFecha('2026-07-01')), 1)
})

test('EL DESFASE SE MIDE, NO SE SUPONE', () => {
  const obs = desfaseObservado([{ hasta: '2026-06-30' }, { hasta: '2026-07-15' }], LOTES)
  assert.equal(obs.length, 2)
  assert.deepEqual(obs.map((o) => o.diasHabiles).sort(), [1, 2], 'medido en el extracto: 1 y 2 hábiles')
  assert.ok(obs.every((o) => o.origen === 'banco'), 'las dos las probó el banco')
})

test('LA FÓRMULA ES es-AR Y CON RANGO ABIERTO', () => {
  const f = formulaSePagaEl('B60')
  assert.ok(f.startsWith('='))
  assert.ok(f.includes(';'), 'separador es-AR')
  assert.ok(!/\(\s*[^;()]*,[^;()]*\)/.test(f.replace(/"[^"]*"/g, '')), 'ninguna coma como separador de argumentos')
  assert.ok(!/\$A\$4:\$A\$\d/.test(f), 'el rango del extracto no lleva fila final')
  assert.equal((f.match(/\(/g) || []).length, (f.match(/\)/g) || []).length, 'paréntesis balanceados')
  assert.ok(f.includes('>B60') && !f.includes('>=B60'), 'estrictamente posterior al cierre')
})

test('EL FALLBACK A `HASTA` NO ES OPCIONAL', () => {
  // Si la celda de pago quedara vacía, la línea del cash flow devolvería CERO para esa quincena y el
  // cuadro seguiría cuadrando con menos plata. Una línea en cero sin avisar es el peor resultado.
  const e = fechaDeCajaDeQuincena('JORNALES_REAL_PAGO', 'JORNALES_REAL_HASTA')
  assert.equal(e, 'IF(ISNUMBER(JORNALES_REAL_PAGO);JORNALES_REAL_PAGO;JORNALES_REAL_HASTA)')
})

test('los dos parámetros viven en la pestaña, no en el código', () => {
  assert.equal(PARAMETROS.length, 2)
  for (const p of PARAMETROS) {
    assert.ok(p.rango && p.rotulo && p.nota, 'cada parámetro se explica')
    assert.ok(Number.isFinite(p.valor))
  }
  assert.equal(DESFASE_HABILES_DEFAULT, 1)
  assert.match(PARAMETROS[0].nota, /MEDIDO/)
})

test('una fecha ilegible no inventa un pago', () => {
  assert.equal(aFecha(''), null)
  assert.equal(aFecha('no es fecha'), null)
  assert.equal(iso(null), null)
  const r = pagoDeQuincena(null, LOTES)
  assert.equal(r.pago, null, 'sin cierre no hay fecha de pago inventada')
  assert.equal(mesDe(null), null)
  assert.equal(semanaDe(null), null)
})
