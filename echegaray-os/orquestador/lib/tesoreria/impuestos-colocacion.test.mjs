// LOS IMPUESTOS DE UNA COLOCACIÓN — el defecto que atrapan estos tests: publicar un rendimiento como
// si sacar la plata del banco fuera gratis.
//
// Si alguien saca el descuento del impuesto al cheque, o rellena una alícuota desconocida con cero, o
// publica un neto sin su bruto, estos tests se ponen rojos.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  impuestosDeColocacion, parametrosFiscales, medirLey25413, leyDeCheque,
  LEY_25413_DECLARADA, TRATAMIENTO, CLAVE_POLITICA_FISCAL, DESCONOCIDO,
} from './impuestos-colocacion.mjs'
import { filaDeInstrumento, tablaDeVentana } from './tabla-instrumentos.mjs'
import { evaluarContraVentana } from './comparar.mjs'
import { normalizarInstrumento } from './instrumentos.mjs'
import { formatoTablaInstrumentos, formatoImpuestos, desgloseDeRendimiento } from './formato-mattermost.mjs'

const HOY = new Date('2026-08-03T12:00:00Z')

/** El caso que decide: 30 días al 23,5% TNA — el impuesto se lleva más de la mitad de la ganancia. */
const TREINTA_DIAS_235 = ((1 + 0.235 / 12) ** (12 * 30 / 365)) - 1

test('DEFECTO · un rendimiento sin impuestos es una estimación optimista, no un resultado', () => {
  const r = impuestosDeColocacion({
    capital: 10000000, rendimientoBrutoPeriodo: TREINTA_DIAS_235,
    categoria: 'caucion', parametros: parametrosFiscales({}),
  })
  assert.equal(r.estado, 'ok')
  // 1,2% del capital: las dos puntas de la Ley 25.413.
  assert.ok(Math.abs(r.costo_fiscal_periodo - 0.012) < 1e-9, `descontó ${r.costo_fiscal_periodo}`)
  assert.equal(r.total_conocido_pesos, 120000)
  // Y el neto tiene que ser MENOS DE LA MITAD del bruto: ése es el punto del informe.
  assert.ok(r.neto_pesos < r.bruto_pesos / 2, `bruto ${r.bruto_pesos} · neto ${r.neto_pesos}`)
})

test('DEFECTO · una alícuota desconocida NO se rellena con cero, y el neto no se llama neto', () => {
  const p = parametrosFiscales({})
  assert.equal(p.iibb.estado, DESCONOCIDO)
  assert.equal(p.iibb.valor, null, 'un DESCONOCIDO con valor 0 afirma que no paga')
  assert.equal(p.ganancias.estado, DESCONOCIDO)
  assert.equal(p.ganancias.valor, null)
  // Y cada uno trae la pregunta concreta que hay que hacer, no un "consultar al contador".
  assert.match(p.iibb.pregunta, /IIBB|Ingresos Brutos/i)
  assert.match(p.ganancias.pregunta, /Ganancias/i)

  const r = impuestosDeColocacion({ capital: 1e7, rendimientoBrutoPeriodo: 0.05, categoria: 'caucion', parametros: p })
  assert.equal(r.completo, false)
  assert.match(r.etiqueta_neto, /SÓLO de los impuestos conocidos/)
  assert.equal(r.pendientes.length, 2)
})

test('con las alícuotas aprobadas, el neto se llama neto y Ganancias muerde DESPUÉS de IIBB', () => {
  const p = parametrosFiscales({ politica: { valor: { iibb_intereses: 0.05, ganancias_marginal: 0.35 }, aprobada_por: 'Jorge' } })
  assert.equal(p.iibb.estado, 'conocido')
  const r = impuestosDeColocacion({ capital: 1e7, rendimientoBrutoPeriodo: 0.10, categoria: 'caucion', parametros: p })
  assert.equal(r.completo, true)
  assert.equal(r.etiqueta_neto, 'neto de impuestos')
  const ganancias = r.cargas.find((c) => /Ganancias/.test(c.concepto))
  // Base de Ganancias = bruto (10%) − cheque (1,2%) − IIBB (0,5%) = 8,3% del capital.
  assert.ok(Math.abs(ganancias.peso_sobre_capital - 0.083 * 0.35) < 1e-9, `dio ${ganancias.peso_sobre_capital}`)
  // El resultado antes de Ganancias se publica aparte: es lo que pidió el dueño.
  assert.ok(Math.abs(r.rendimiento_antes_de_ganancias_periodo - 0.083) < 1e-9)
})

test('DEFECTO · con capital 0 (tabla de referencia) la alícuota sigue siendo la misma', () => {
  // Calculando en pesos, un capital de 0 daba 0 de impuesto y la tabla de referencia mostraba
  // rendimientos brutos con cara de netos. La cuenta va en fracciones justamente por esto.
  const r = impuestosDeColocacion({ capital: 0, rendimientoBrutoPeriodo: 0.05, categoria: 'lecap', parametros: parametrosFiscales({}) })
  assert.ok(Math.abs(r.costo_fiscal_periodo - 0.012) < 1e-9)
  assert.ok(Math.abs(r.rendimiento_neto_periodo - (0.05 - 0.012)) < 1e-9)
})

test('las familias tributan distinto, y el plazo fijo NO se afirma sin evidencia', () => {
  for (const cat of ['caucion', 'money_market', 'lecap']) {
    assert.equal(TRATAMIENTO[cat].puntas, 2, `${cat} debería pagar las dos puntas`)
  }
  assert.equal(TRATAMIENTO.plazo_fijo.puntas, null, 'el plazo fijo en el mismo banco no se puede afirmar')
  const pf = impuestosDeColocacion({ capital: 1e7, rendimientoBrutoPeriodo: 0.05, categoria: 'plazo_fijo', parametros: parametrosFiscales({}) })
  assert.ok(pf.pendientes.some((x) => /25.413/.test(x.concepto)), 'el plazo fijo tiene que declarar el impuesto al cheque como pendiente')
  // La naturaleza de la renta también cambia, y eso puede dar vuelta el ranking en Ganancias.
  assert.notEqual(TRATAMIENTO.money_market.renta, TRATAMIENTO.caucion.renta)
  assert.notEqual(TRATAMIENTO.lecap.renta, TRATAMIENTO.caucion.renta)
  // Una familia sin tratamiento declarado no se asume exenta.
  const raro = impuestosDeColocacion({ capital: 1e7, rendimientoBrutoPeriodo: 0.05, categoria: 'cripto', parametros: parametrosFiscales({}) })
  assert.ok(raro.pendientes.some((x) => /25.413/.test(x.concepto)))
})

test('DEFECTO · sin medición contra el banco, el impuesto al cheque SE SIGUE DESCONTANDO', () => {
  // La primera versión dejaba la alícuota en DESCONOCIDO cuando no podía medirla, y entonces no se
  // restaba nada: el defecto volvía por la puerta de atrás y en silencio. Una medición que falla
  // degrada la CONFIANZA, nunca el monto.
  const sinMedir = leyDeCheque(null)
  assert.equal(sinMedir.estado, 'conocido')
  assert.deepEqual(sinMedir.valor, LEY_25413_DECLARADA)
  assert.equal(sinMedir.verificacion.estado, 'sin_verificar')
  const r = impuestosDeColocacion({ capital: 1e7, rendimientoBrutoPeriodo: 0.05, categoria: 'caucion', parametros: parametrosFiscales({ medicion: null }) })
  assert.equal(r.total_conocido_pesos, 120000)
})

test('si el banco cobró algo distinto de la ley, manda LO QUE COBRÓ y el conflicto se declara', () => {
  const conflictiva = {
    estado: 'conflictiva', medida: { debito: 0.009, credito: 0.006 },
    motivo: 'el banco cobró 0,9000% al débito', fuente: 'banco_movimientos',
  }
  const l = leyDeCheque(conflictiva)
  assert.equal(l.verificacion.estado, 'conflictiva')
  assert.deepEqual(l.valor, conflictiva.medida)
  assert.match(l.fuente, /SE USA LO QUE EL BANCO COBRÓ/)
})

test('la verificación coincide con la ley y entonces la alícuota queda verificada', () => {
  const l = leyDeCheque({ estado: 'verificada', medida: { debito: 0.006, credito: 0.006 }, fuente: 'banco_movimientos', base: {}, ventana: {} })
  assert.equal(l.verificacion.estado, 'verificada')
  assert.match(l.fuente, /el cargo real del banco/)
})

test('medirLey25413 sin base suficiente dice sin_dato — no inventa una tasa efectiva', async () => {
  const q = async () => ({ rows: [{ debitos: 100, creditos: 50, imp_debito: 1, imp_credito: 0, desde: null, hasta: null }] })
  const m = await medirLey25413(q)
  assert.equal(m.estado, 'sin_dato')
  assert.equal(await medirLey25413(null).then((x) => x.estado), 'sin_dato')
})

test('medirLey25413 detecta el conflicto entre lo declarado y lo cobrado', async () => {
  const q = async () => ({ rows: [{ debitos: 1e8, creditos: 1e8, imp_debito: 1e8 * 0.009, imp_credito: 1e8 * 0.006, desde: '2026-05-28', hasta: '2026-08-03' }] })
  const m = await medirLey25413(q)
  assert.equal(m.estado, 'conflictiva')
  assert.match(m.motivo, /0,9000%|0.9000%/)
})

// ════════════════════════════════════════════════════════════════════════════
// EL CABLEADO: el impuesto tiene que llegar hasta el ranking y hasta el mensaje
// ════════════════════════════════════════════════════════════════════════════

const CAUCION = normalizarInstrumento({
  nombre: 'CAUCION PESOS 30D', moneda: 'ARS', plazo_rescate_dias: 0, liquidacion_dias: 0,
  tasa: { tipo: 'tna', valor: 0.235, naturaleza: 'contractual' }, emisor: 'BYMA',
  categoria: 'caucion',
}, { observadoEn: HOY.toISOString() })

test('DEFECTO · la fila de la tabla descuenta impuestos y publica el bruto al lado del neto', () => {
  const f = filaDeInstrumento(CAUCION, { dias: 30, monto: 10000000, hurdlePeriodo: 0, hurdleAnual: 0.6278 })
  assert.ok(f.rendimiento_antes_de_impuestos_periodo > f.rendimiento_neto_periodo, 'el neto tiene que ser menor que el bruto')
  assert.ok(Math.abs(f.impuestos_periodo - 0.012) < 1e-9)
  assert.equal(f.impuestos_en_pesos, 120000)
  assert.equal(f.bruto_en_pesos, Math.round(1e7 * f.rendimiento_antes_de_impuestos_periodo))
  assert.equal(f.impuestos_completos, false, 'faltan IIBB y Ganancias: no es un neto completo')
  assert.match(f.etiqueta_neto, /SÓLO de los impuestos conocidos/)
})

test('DEFECTO · el ranking ORDENA después de impuestos, no antes', () => {
  const ventana = { bloque: 'C', moneda: 'ARS', dias_libres: 30, monto_maximo: 1e7, referencia: { hurdle_periodo: 0, explicacion: 'x' } }
  const r = evaluarContraVentana(CAUCION, ventana, { valor: 0.6278 })
  assert.equal(r.excluido, false)
  assert.ok(Math.abs(r.rendimiento_antes_de_impuestos_periodo - r.rendimiento_neto_periodo - 0.012) < 1e-9)
  assert.equal(r.ganancia_neta_estimada, Math.round(1e7 * r.rendimiento_neto_periodo))
})

test('DEFECTO · contra la vara del descubierto (62,78%) nada pasa, y el motivo NOMBRA los impuestos', () => {
  // La referencia que manda: $1.506,85 por día por millón. Un 23,5% TNA no le llega ni de cerca, y
  // menos todavía después del 1,2% del capital.
  const ventana = {
    bloque: 'C', moneda: 'ARS', dias_libres: 30, monto_maximo: 1e7,
    referencia: { hurdle_periodo: ((1.6278) ** (30 / 365)) - 1, explicacion: 'CFT del acuerdo N°00007' },
  }
  const r = evaluarContraVentana(CAUCION, ventana, { valor: 0.6278 })
  assert.equal(r.excluido, true)
  assert.match(r.motivo, /impuestos sobre el capital/)
})

test('DEFECTO · sin cálculo de impuestos la tabla NO publica un neto', () => {
  const tabla = tablaDeVentana([CAUCION], { dias_libres: 30, monto_maximo: 1e7, referencia: { hurdle_periodo: 0 } }, { hurdleAnual: 0.6278 })
  const texto = formatoTablaInstrumentos(tabla)
  assert.match(texto, /Impuestos contemplados/)
  assert.match(texto, /Ley 25\.413/)
  assert.match(texto, /Bruto en \$/)
  assert.match(texto, /Neto en \$/)
  // La vara del descubierto va EN la tabla, no en una nota al pie.
  assert.match(texto, /Vara a superar/)

  // Y si una fila llega sin impuestos, se dice — no se imprime un bruto con cara de neto.
  const rota = { ...tabla, viables: [{ ...(tabla.viables[0] ?? tabla.descartadas[0]), impuestos: null, viable: true }] }
  assert.match(formatoTablaInstrumentos(rota), /SIN IMPUESTOS CALCULADOS/)
})

test('la tabla declara qué alícuotas faltan con la pregunta exacta, y qué queda fuera de alcance', () => {
  const texto = formatoImpuestos(parametrosFiscales({}), 1e7)
  assert.match(texto, /DESCONOCIDO/)
  assert.match(texto, /Lo que falta para poder llamarlo NETO/)
  assert.match(texto, /Fuera del alcance/)
  // Sobre $10M, el impuesto al cheque son $120.000 y se dice en pesos.
  assert.match(texto, /\$120\.000/)
})

test('sin parámetros fiscales el formateador AVISA en vez de callarse', () => {
  assert.match(formatoImpuestos(null), /no calculó impuestos/)
})

test('DEFECTO · el desglose de la propuesta muestra el bruto y cada descuento por separado', () => {
  const fiscal = impuestosDeColocacion({ capital: 1e7, rendimientoBrutoPeriodo: 0.05, categoria: 'caucion', parametros: parametrosFiscales({}) })
  const lineas = desgloseDeRendimiento({
    monto_maximo: 1e7, impuestos: fiscal, rendimiento_antes_de_impuestos_periodo: 0.05,
    rendimiento_neto_periodo: fiscal.rendimiento_neto_periodo, ganancia_neta_estimada: fiscal.neto_pesos,
  }).join('\n')
  assert.match(lineas, /Rendimiento bruto del período/)
  assert.match(lineas, /Ley 25\.413/)
  assert.match(lineas, /el resultado REAL es menor/)

  // Una propuesta sin cálculo de impuestos no puede presentar un neto.
  const sin = desgloseDeRendimiento({ monto_maximo: 1e7, rendimiento_neto_periodo: 0.05 }).join('\n')
  assert.match(sin, /SIN IMPUESTOS CALCULADOS/)
})

test('la clave de la política fiscal existe y es una sola', () => {
  assert.equal(CLAVE_POLITICA_FISCAL, 'fiscal_colocaciones')
})
