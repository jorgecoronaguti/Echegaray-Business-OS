// LA COMPARACIÓN AL DETALLE, Y EL TECHO DE CORDURA DE UNA TASA.
//
// El dueño rechazó dos veces el resultado porque "no me da opciones de instrumentos a invertir
// analizados al detalle". Un ganador sin la tabla obliga a confiar; la tabla deja auditar.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  tablaDeVentana, tablaComparativa, filaDeInstrumento, describirLiquidez, teaATna,
  FAMILIAS_OBLIGATORIAS, DESCONOCIDO,
} from './tabla-instrumentos.mjs'
import { normalizarInstrumento, tasaCreible, TEA_MAXIMA_CREIBLE } from './instrumentos.mjs'
import { compararAlternativas } from './comparar.mjs'

const OBS = { observadoEn: '2026-08-03T12:00:00.000Z' }
const CFT = 0.6278 // el acuerdo N°00007 del Santander, verificado contra el cargo real

const VENTANA = { bloque: 'C', titulo: 'Excedente de 8 a 30 días', moneda: 'ARS', dias_libres: 30, monto_maximo: 8156879 }

const inst = (o) => normalizarInstrumento({ cotizado_en: OBS.observadoEn, moneda: 'ARS', ...o }, OBS)

// ════════════════════════════════════════════════════════════════════════════
// EL TECHO DE CORDURA — la TIR de 95.739.511.996% que existe de verdad en Balanz
// ════════════════════════════════════════════════════════════════════════════

test('DEFECTO · una TIR imposible NO puede ganar el ranking: se declara sospechosa', () => {
  // El número es real: una ON de Plaza Logística en UVA lo publica hoy. Ninguna validación del módulo
  // le ponía techo a una tasa, y el ranking ordena por rendimiento — así que ganaba sola.
  const absurda = tasaCreible(957395119.96)
  assert.equal(absurda.creible, false)
  assert.equal(absurda.sospechosa, true)
  assert.match(absurda.motivo, /techo de cordura/)
  assert.equal(tasaCreible(TEA_MAXIMA_CREIBLE).creible, true, 'el techo es inclusivo: 1000% todavía pasa')
  assert.equal(tasaCreible(TEA_MAXIMA_CREIBLE + 0.01).creible, false)

  const universo = [
    inst({ nombre: 'Lecap S31O5', categoria: 'lecap', plazo_rescate_dias: 0, liquidacion_dias: 1, tasa: { tipo: 'tea', valor: 0.95, naturaleza: 'indicativa' } }),
    inst({ nombre: 'Letra fantasma', categoria: 'lecap', plazo_rescate_dias: 0, liquidacion_dias: 0, tasa: { tipo: 'tir', valor: 957395119.96, naturaleza: 'indicativa' } }),
  ]
  const cmp = compararAlternativas(universo, [{ ...VENTANA, referencia: { hurdle_periodo: 0.04, modo: 'cft', explicacion: 'x' } }], { valor: CFT })
  const ganador = cmp.rankings[0].ranking[0]
  assert.equal(ganador.instrumento, 'Lecap S31O5', 'gana la creíble, no la que publica un disparate')
  const excluida = cmp.rankings[0].excluidos.find((e) => e.instrumento === 'Letra fantasma')
  assert.ok(excluida, 'la sospechosa no desaparece: se excluye CON motivo')
  assert.equal(excluida.sospechosa, true)
})

test('la fila de una tasa sospechosa conserva el número publicado, para poder mirarlo', () => {
  const f = filaDeInstrumento(
    inst({ nombre: 'ON rota', categoria: 'on', plazo_rescate_dias: 0, tasa: { tipo: 'tir', valor: 957395119.96, naturaleza: 'indicativa' } }),
    { dias: 30, monto: 1000000, hurdlePeriodo: 0.04, hurdleAnual: CFT },
  )
  assert.equal(f.tea, null, 'no se publica como si fuera una TEA usable')
  assert.equal(f.tea_publicada_sospechosa, 957395119.96)
  assert.equal(f.viable, false)
  assert.ok(f.que_lo_invalida.some((m) => /techo de cordura/.test(m)))
})

// ════════════════════════════════════════════════════════════════════════════
// LA TABLA — lo que tiene que traer cada opción
// ════════════════════════════════════════════════════════════════════════════

test('cada opción viable trae TNA, TEA, plazo, liquidez, riesgo, mínimo, cuánto rinde en pesos y qué la invalida', () => {
  const t = tablaDeVentana([
    inst({ nombre: 'Balanz Money Market', categoria: 'money_market', plazo_rescate_dias: 0, liquidacion_dias: 0, tasa: { tipo: 'tna', valor: 0.72, naturaleza: 'indicativa' } }),
  ], VENTANA, { hurdleAnual: CFT })
  const f = t.viables[0]
  assert.ok(f, 'una TNA del 72% capitaliza por encima del CFT: tiene que entrar')
  assert.equal(f.tna_declarada, 0.72)
  assert.equal(f.tna_equivalente, null, 'si el bróker la declaró, no se inventa una equivalente')
  assert.ok(f.tea > 0.72, 'la TEA de una TNA del 72% mensualizada es mayor que la TNA')
  assert.equal(f.plazo_dias, 30)
  assert.match(f.liquidez, /T\+0/)
  assert.equal(f.dias_vuelta, 0)
  assert.ok(Array.isArray(f.riesgos) && f.riesgos.length)
  assert.equal(f.monto_minimo, DESCONOCIDO, 'ninguna pantalla de Balanz publica el mínimo: se declara, no se supone')
  assert.equal(f.rinde_en_pesos, Math.round(VENTANA.monto_maximo * f.rendimiento_neto_periodo))
  assert.deepEqual(f.que_lo_invalida, [])
  // La vara del descubierto va EN la tabla, con su equivalente en pesos.
  assert.equal(t.vara.anual, CFT)
  assert.ok(t.vara.periodo > 0)
  assert.equal(t.vara.en_pesos, Math.round(VENTANA.monto_maximo * t.vara.periodo))
  assert.match(t.vara.explicacion, /descubierto/)
})

test('una TNA no declarada se calcula desde la TEA y se MARCA como cálculo', () => {
  const f = filaDeInstrumento(
    inst({ nombre: 'X', categoria: 'lecap', plazo_rescate_dias: 0, liquidacion_dias: 1, tasa: { tipo: 'tea', valor: 0.9, naturaleza: 'indicativa' } }),
    { dias: 30, monto: 1000000, hurdlePeriodo: 0.04, hurdleAnual: CFT },
  )
  assert.equal(f.tna_declarada, null)
  assert.ok(Math.abs(teaATna(0.9) - f.tna_equivalente) < 1e-12)
  assert.equal(f.tipo_tasa, 'tea')
})

test('las cuatro familias obligatorias se informan SIEMPRE: lo que falta dice DESCONOCIDO', () => {
  const t = tablaDeVentana([
    inst({ nombre: 'Caución 30 días', categoria: 'caucion', plazo_rescate_dias: 30, tasa: { tipo: 'tna', valor: 0.55, naturaleza: 'indicativa' } }),
  ], VENTANA, { hurdleAnual: CFT })
  const familias = t.familias_sin_dato.map((f) => f.categoria).sort()
  assert.deepEqual(familias, ['lecap', 'money_market', 'plazo_fijo'])
  assert.ok(t.familias_sin_dato.every((f) => f.estado === DESCONOCIDO))
  // El plazo fijo tiene un motivo propio: no cotiza en Balanz. Sin tasa declarada no se estima.
  const pf = t.familias_sin_dato.find((f) => f.categoria === 'plazo_fijo')
  assert.match(pf.motivo, /no cotiza en Balanz/)
  assert.equal(FAMILIAS_OBLIGATORIAS.length, 4)
})

test('lo que no entra se devuelve CON el motivo, y se dice por qué NO las otras', () => {
  const t = tablaDeVentana([
    inst({ nombre: 'MM bueno', categoria: 'money_market', plazo_rescate_dias: 0, liquidacion_dias: 0, tasa: { tipo: 'tea', valor: 1.2, naturaleza: 'indicativa' } }),
    inst({ nombre: 'MM flojo', categoria: 'money_market', plazo_rescate_dias: 0, liquidacion_dias: 0, tasa: { tipo: 'tea', valor: 0.9, naturaleza: 'indicativa' } }),
    inst({ nombre: 'Plazo fijo 90', categoria: 'plazo_fijo', plazo_rescate_dias: 90, tasa: { tipo: 'tna', valor: 0.9, naturaleza: 'contractual' } }),
    inst({ nombre: 'CEDEAR AAPL', categoria: 'cedear', plazo_rescate_dias: 2, tasa: { tipo: 'tea', valor: 2, naturaleza: 'indicativa' } }),
    inst({ nombre: 'Caución USD', categoria: 'caucion', moneda: 'USD', plazo_rescate_dias: 7, tasa: { tipo: 'tna', valor: 0.0211, naturaleza: 'indicativa' } }),
  ], VENTANA, { hurdleAnual: CFT })

  assert.equal(t.recomendacion.instrumento, 'MM bueno', 'ordena por rendimiento neto')
  assert.equal(t.viables[1].instrumento, 'MM flojo')
  const motivo = (n) => t.descartadas.find((f) => f.instrumento === n)?.que_lo_invalida.join(' | ')
  assert.match(motivo('Plazo fijo 90'), /vuelve en 90 días y la ventana es de 30/)
  assert.match(motivo('CEDEAR AAPL'), /no es apta para caja operativa/)
  assert.match(motivo('Caución USD'), /USD y la ventana es en pesos/)
  // "Por qué NO las otras" incluye tanto a las que perdieron como a las descartadas.
  const porque = t.por_que_no_las_otras.map((x) => x.instrumento)
  assert.ok(porque.includes('MM flojo') && porque.includes('CEDEAR AAPL'))
  assert.match(t.veredicto, /superan/)
})

test('sin ninguna alternativa que gane, el veredicto dice que la mejor colocación es no endeudarse', () => {
  const t = tablaDeVentana([
    inst({ nombre: 'MM pobre', categoria: 'money_market', plazo_rescate_dias: 0, liquidacion_dias: 0, tasa: { tipo: 'tea', valor: 0.30, naturaleza: 'indicativa' } }),
  ], { ...VENTANA, referencia: null }, { hurdleAnual: CFT })
  assert.equal(t.viables.length, 0)
  assert.equal(t.recomendacion, null)
  assert.match(t.veredicto, /no entrar en descubierto/)
  // Y la fila igual existe con su número: se descarta, no se esconde.
  assert.equal(t.descartadas[0].instrumento, 'MM pobre')
  assert.ok(t.descartadas[0].rendimiento_neto_periodo > 0)
})

test('la liquidez se describe en palabras: un plazo fijo NO se desarma antes', () => {
  assert.match(describirLiquidez({ categoria: 'plazo_fijo', plazo_rescate_dias: 30 }).texto, /NO se puede desarmar/)
  assert.match(describirLiquidez({ categoria: 'caucion', plazo_rescate_dias: 7 }).texto, /a su vencimiento/)
  assert.match(describirLiquidez({ categoria: 'money_market', plazo_rescate_dias: 0, liquidacion_dias: 0 }).texto, /mismo día/)
  const conCastigo = describirLiquidez({ categoria: 'fci_renta_fija', plazo_rescate_dias: 1, liquidacion_dias: 1, costos: { salida_anticipada: 0.005 } })
  assert.match(conCastigo.texto, /0,50%|0\.50%/)
  assert.equal(conCastigo.dias_vuelta, 2)
  // Sin plazo de rescate NO se asume liquidez.
  assert.equal(describirLiquidez({ categoria: 'money_market' }).texto, DESCONOCIDO)
})

test('tablaComparativa devuelve una tabla por ventana, también con monto cero', () => {
  const r = tablaComparativa(
    [inst({ nombre: 'MM', categoria: 'money_market', plazo_rescate_dias: 0, liquidacion_dias: 0, tasa: { tipo: 'tea', valor: 1.1, naturaleza: 'indicativa' } })],
    [{ dias_libres: 30, monto_maximo: 0, moneda: 'ARS' }, { dias_libres: 90, monto_maximo: 0, moneda: 'ARS' }],
    { hurdleAnual: CFT },
  )
  assert.equal(r.tablas.length, 2)
  // Con monto 0 la comparación sigue siendo información: se ve la tasa y se ve la vara.
  assert.equal(r.tablas[0].viables[0].rinde_en_pesos, 0)
  assert.ok(r.tablas[0].viables[0].tea > 0)
  assert.ok(r.tablas[0].vara.periodo > 0)
})
