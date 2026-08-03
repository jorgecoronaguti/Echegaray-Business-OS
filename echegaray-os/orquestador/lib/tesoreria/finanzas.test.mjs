// LAS DECISIONES FINANCIERAS DEL TESORERO — probadas contra los errores que cuestan plata.
//
// Cada test de acá reproduce un error real de tesorería, no un caso feliz. El más importante es el
// primero: con la cuenta en descubierto, cualquier propuesta de inversión es una pérdida disfrazada.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { EVIDENCIA, evidenciaCombinada, bloquePorDias, CONFIANZA } from './contratos.mjs'
import { enDescubierto, clasificarCuentas, coherenciaDelTotal, cuentasQueDesaparecieron } from './posicion-caja.mjs'
import { tasaDeReferencia, deudaCancelable, MODO } from './costo-liquidez.mjs'
import {
  estadoReserva, modelarCajaRestringida, evaluarAccionabilidad, ESTADO_POLITICA,
} from './politicas.mjs'
import { resumirHorizonte, ventanaSinPerforar, ESCENARIOS, proyectarLiquidez } from './proyeccion-liquidez.mjs'
import { calcularExcedente, tasaDeCorte, rendimientoPeriodo } from './excedente.mjs'
import {
  aTea, tnaATea, periodoATea, normalizarInstrumento, categorizar, esAptoTesoreria, porcentajeArg,
  plazoLiquidacion, numeroArg, separadorDecimal, extraerDeTabla, extraerDeTarjetas, cotizadoEn,
} from './instrumentos.mjs'
import { compararAlternativas, evaluarContraVentana, liquidezCompatible, costoTotal, rendimientoDelPeriodo } from './comparar.mjs'
import { evaluarRiesgo, evaluarConcentracion, PERFILES } from './riesgo.mjs'
import { frescuraDeMercado } from './ciclo.mjs'
import { generarRecomendaciones, recomendarAplicarADeuda, estaVencida } from './recomendacion.mjs'
import { validarRecomendacion, validarLote, esNumero } from './validar.mjs'
import { registrarCorreccion, esConfirmacionReal, proponerCambioPolitica, TIPO_CORRECCION } from './aprendizaje.mjs'
import { esCambioMaterial, formatoPropuesta } from './formato-mattermost.mjs'
import { idMovimiento, detectarDuplicados, estaComprometido, vencidoComercialDe, PESTANAS_PROHIBIDAS } from './lectura-flujo.mjs'

const DIR = dirname(fileURLToPath(import.meta.url))
const HOY = new Date('2026-08-01T10:00:00Z')

// ════════════════════════════════════════════════════════════════════════════
// LA REGLA CENTRAL
// ════════════════════════════════════════════════════════════════════════════

test('CASO A · con descubierto utilizado, cancelar la línea es la vara y una colocación inferior se rechaza', () => {
  const ventana = {
    bloque: 'C', moneda: 'ARS', dias_libres: 30, monto_maximo: 10000000,
    referencia: tasaDeReferencia({
      dias: 30, monto: 10000000, deuda: 10000000, cft: 0.6278,
      dias_calendario: [{ fecha: 'd', ingresos: 0, egresos: 0 }], cajaInicial: 10000000, interesDia: () => 0,
    }),
  }
  assert.equal(ventana.referencia.modo, MODO.CANCELACION_DEUDA)
  const inst = normalizarInstrumento({
    nombre: 'FCI Money Market Pesos', moneda: 'ARS', plazo_rescate_dias: 0, liquidacion_dias: 0,
    tasa: { tipo: 'tea', valor: 0.40, naturaleza: 'indicativa' }, costos: { comision: 0 },
  }, { observadoEn: HOY.toISOString() })
  const r = evaluarContraVentana(inst, ventana, { valor: 0.6278 })
  assert.equal(r.excluido, true)
  assert.match(r.motivo, /cancelar descubierto rinde/)
})

test('CASO B · SIN descubierto, un instrumento por debajo del 62,78% NO se rechaza automáticamente', () => {
  // Es la corrección central. Con la cuenta en positivo y sin riesgo de déficit, exigirle el CFT del
  // acuerdo a una colocación de 30 días rechazaba todo y dejaba la plata rindiendo cero.
  const ventana = {
    bloque: 'C', moneda: 'ARS', dias_libres: 30, monto_maximo: 10000000,
    referencia: tasaDeReferencia({
      dias: 30, monto: 10000000, deuda: 0, cft: 0.6278, cajaInicial: 50000000, reserva: 0,
      dias_calendario: Array.from({ length: 31 }, (_, i) => ({ fecha: `d${i}`, ingresos: 0, egresos: 0 })),
      interesDia: () => 0,
    }),
  }
  assert.equal(ventana.referencia.modo, MODO.COSTO_OPORTUNIDAD)
  assert.equal(ventana.referencia.hurdle_periodo, 0, 'sin deuda ni riesgo de déficit la vara es cero neto')
  const inst = normalizarInstrumento({
    nombre: 'FCI Money Market Pesos', moneda: 'ARS', plazo_rescate_dias: 0, liquidacion_dias: 0,
    tasa: { tipo: 'tea', valor: 0.40, naturaleza: 'indicativa' }, costos: { comision: 0 },
  }, { observadoEn: HOY.toISOString() })
  const r = evaluarContraVentana(inst, ventana, { valor: 0.6278 })
  assert.equal(r.excluido, false, 'un 40% anual con la caja en positivo es una colocación legítima')
  assert.equal(r.modo_vara, MODO.COSTO_OPORTUNIDAD)
  assert.ok(r.exceso_sobre_corte > 0)
})

test('CASO C · si inmovilizar provoca déficit, el costo del descubierto entra a la comparación', () => {
  // El día 10 sale un pago grande: inmovilizar deja la caja en rojo y eso cuesta, día por día.
  const cal = Array.from({ length: 31 }, (_, i) => ({ fecha: `d${i}`, ingresos: 0, egresos: i === 10 ? 9000000 : 0 }))
  const ref = tasaDeReferencia({
    dias: 30, monto: 8000000, deuda: 0, cft: 0.6278, cajaInicial: 10000000, reserva: 0,
    dias_calendario: cal, factorIngresos: 1,
    interesDia: (saldo) => Math.abs(saldo) * 0.6278 / 365,
  })
  assert.equal(ref.modo, MODO.CONTINGENCIA)
  assert.ok(ref.hurdle_periodo > 0, 'el costo esperado del descubierto tiene que subir la vara')
  assert.equal(ref.contingencia.dias_en_rojo, 21) // del día 10 al 30 inclusive
  assert.equal(ref.evidencia, EVIDENCIA.INFERENCIA, 'sale de un escenario declarado, no de un hecho')
  assert.match(ref.explicacion, /escenario adverso/)
})

test('el costo de contingencia NO se inventa: sin calendario cae a la vara conservadora y lo dice', () => {
  const ref = tasaDeReferencia({ dias: 30, monto: 5000000, deuda: 0, cft: 0.6278, dias_calendario: [] })
  assert.equal(ref.confianza, CONFIANZA.BAJA)
  assert.match(ref.explicacion, /sin calendario/)
  assert.ok(Math.abs(ref.hurdle_periodo - ref.cft_periodo) < 1e-12, 'sin poder simular se aplica el CFT, que es el lado seguro')
})

test('el CFT anual NUNCA se compara contra un retorno de pocos días sin convertir', () => {
  const ref = tasaDeReferencia({
    dias: 7, monto: 1000000, deuda: 1000000, cft: 0.6278,
    dias_calendario: [{ fecha: 'd', ingresos: 0, egresos: 0 }], cajaInicial: 1000000, interesDia: () => 0,
  })
  // 62,78% anual en 7 días son ~0,93%, no 62,78%.
  const esperado = (1.6278) ** (7 / 365) - 1
  assert.ok(Math.abs(ref.hurdle_periodo - esperado) < 1e-12)
  assert.ok(ref.hurdle_periodo < 0.01, 'si diera 0,62 estaríamos comparando un año contra una semana')
})

test('la deuda cancelable se mide POR CUENTA, no por el saldo total', () => {
  // Una cuenta corriente en rojo con efectivo en la caja fuerte da un total positivo, y el banco
  // cobra el descubierto igual. Mirar sólo el total hacía invisible ese costo.
  const comp = clasificarCuentas([
    { cuenta: 'Santander · cta cte ARS', saldo: -8000000 },
    { cuenta: 'Caja en pesos', saldo: 20000000 },
  ])
  const d = deudaCancelable(comp, 12000000)
  assert.equal(d.monto, 8000000)
  assert.equal(d.por_cuenta.length, 1)
  assert.equal(d.evidencia, EVIDENCIA.DATO)
  // Sin composición sólo queda el total, y se declara como inferencia.
  assert.equal(deudaCancelable(null, -3000000).evidencia, EVIDENCIA.INFERENCIA)
  assert.equal(deudaCancelable(null, 5000000).monto, 0)
})

test('la tasa de corte del acuerdo sigue siendo un HECHO verificado — pero ya no es el piso universal', async () => {
  const c = await tasaDeCorte()
  assert.equal(c.valor, 0.6278)
  assert.equal(c.evidencia, EVIDENCIA.HECHO)
  assert.match(c.fuente, /costo-descubierto/)
})

test('un instrumento que supera la vara entra y trae su exceso', () => {
  const ventana = {
    bloque: 'C', moneda: 'ARS', dias_libres: 30, monto_maximo: 10000000,
    referencia: tasaDeReferencia({
      dias: 30, monto: 10000000, deuda: 10000000, cft: 0.6278,
      dias_calendario: [{ fecha: 'd', ingresos: 0, egresos: 0 }], cajaInicial: 10000000, interesDia: () => 0,
    }),
  }
  const inst = normalizarInstrumento({
    nombre: 'Lecap a 30 días', moneda: 'ARS', plazo_rescate_dias: 0, liquidacion_dias: 1,
    tasa: { tipo: 'tea', valor: 0.90, naturaleza: 'contractual' }, costos: { comision: 0.001 },
  }, { observadoEn: HOY.toISOString() })
  const r = evaluarContraVentana(inst, ventana, { valor: 0.6278 })
  assert.equal(r.excluido, false)
  assert.ok(r.exceso_sobre_corte > 0)
  assert.equal(r.ganancia_neta_estimada, Math.round(10000000 * r.rendimiento_neto_periodo))
})

// ════════════════════════════════════════════════════════════════════════════
// PERCIBIDO vs DEVENGADO, Y LO QUE NO ES CAJA
// ════════════════════════════════════════════════════════════════════════════

test('un egreso fechado está comprometido; un ingreso nunca lo está', () => {
  assert.equal(estaComprometido({ tipo: 'egreso' }), true)
  assert.equal(estaComprometido({ tipo: 'ingreso' }), false)
})

test('el piso invertible sale del MÍNIMO del período, no del saldo final', () => {
  // Caso clásico: termina el mes con $10M pero el día 5 se pagan sueldos y toca $1M.
  // El calendario tiene que CUBRIR el horizonte: pedir 30 días con 3 filas ahora es `sin_dato`.
  const dias = Array.from({ length: 31 }, (_, i) => ({
    fecha: `2026-08-${String(i + 1).padStart(2, '0')}`,
    ingresos: i === 19 ? 9000000 : 0,
    egresos: i === 4 ? 9000000 : 0,
  }))
  const h = resumirHorizonte(dias, 30, ESCENARIOS.base, 10000000)
  assert.equal(h.saldo_final, 10000000)
  assert.equal(h.saldo_minimo, 1000000)
  assert.equal(h.piso_invertible, 1000000, 'invertir $10M dejaría a la empresa sin pagar sueldos')
  assert.equal(h.fecha_mayor_tension, '2026-08-05')
})

test('el escenario adverso castiga los COBROS, nunca posterga los pagos solo', () => {
  const dias = Array.from({ length: 8 }, (_, i) => ({
    fecha: `2026-08-0${i + 1}`, ingresos: i === 0 ? 10000000 : 0, egresos: i === 0 ? 5000000 : 0,
  }))
  const base = resumirHorizonte(dias, 7, ESCENARIOS.base, 0)
  const adv = resumirHorizonte(dias, 7, ESCENARIOS.adverso, 0)
  assert.equal(base.ingresos, 10000000)
  assert.equal(adv.ingresos, 5000000)
  assert.equal(adv.egresos, base.egresos, 'los egresos son compromisos: no se reducen en el adverso')
})

test('la ventana de inmovilización corta el día que perforaría la reserva', () => {
  const dias = [
    { fecha: 'd1', ingresos: 0, egresos: 0 },
    { fecha: 'd2', ingresos: 0, egresos: 0 },
    { fecha: 'd3', ingresos: 0, egresos: 4000000 },
  ]
  const v = ventanaSinPerforar(dias, 3000000, 5000000, 1000000)
  assert.equal(v.corta_en, 'd3')
  assert.equal(v.dias_libres, 2)
})

test('las cobranzas por cobrar NO suman al excedente y eso queda declarado en la salida', () => {
  // Se verifica sobre el contrato del módulo: el campo existe y dice el criterio.
  const src = readFileSync(join(DIR, 'posicion-caja.mjs'), 'utf8')
  assert.match(src, /excluido_por_no_percibido/)
  assert.match(src, /no es caja hasta que se acredita/)
})

test('sin reserva mínima APROBADA, el número no se llama excedente y nada es accionable', () => {
  assert.equal(estadoReserva(null).estado, ESTADO_POLITICA.AUSENTE)
  // Guardar la política NO la aprueba: sin `aprobada_por` sigue siendo una propuesta.
  const guardada = estadoReserva({ valor: { monto: 5000000, metodo: 'piso_mas_egresos' }, creada_en: '2026-08-01' })
  assert.equal(guardada.estado, ESTADO_POLITICA.PROPUESTA)
  assert.match(guardada.motivo, /guardarla no es aprobarla/)
  const aprobada = estadoReserva({ valor: { monto: 5000000 }, aprobada_por: 'jorge', vigente_desde: '2026-08-01' })
  assert.equal(aprobada.estado, ESTADO_POLITICA.APROBADA)
  assert.equal(aprobada.monto, 5000000)

  const sinPolitica = evaluarAccionabilidad({ reserva: estadoReserva(null), restringida: modelarCajaRestringida(null), extractorValidado: true, mercadoFresco: true })
  assert.equal(sinPolitica.accionable, false)
  assert.equal(sinPolitica.etiqueta, 'techo_tecnico_preliminar')
  assert.equal(sinPolitica.estado_recomendacion, 'NO_ACCIONABLE')

  assert.equal(enDescubierto(-1), true)
  assert.equal(enDescubierto(0), false)
  assert.equal(enDescubierto(null), false)
})

// ════════════════════════════════════════════════════════════════════════════
// TASAS: EL ERROR QUE NO SE VE
// ════════════════════════════════════════════════════════════════════════════

test('TNA y TEA no son lo mismo, y la conversión es la correcta', () => {
  assert.ok(Math.abs(tnaATea(0.60, 12) - 0.7959) < 0.001)
  assert.equal(aTea({ tipo: 'tea', valor: 0.5 }), 0.5)
  assert.ok(Math.abs(aTea({ tipo: 'tna', valor: 0.60 }) - 0.7959) < 0.001)
})

test('un rendimiento HISTÓRICO nunca se anualiza para comparar: devuelve null', () => {
  assert.equal(aTea({ tipo: 'rendimiento_historico', valor: 0.03, periodo_dias: 30 }), null)
  assert.equal(aTea({ tipo: 'variacion_precio', valor: 0.12 }), null)
})

test('un rendimiento de período SÍ se anualiza, pero sólo si trae los días', () => {
  assert.ok(Math.abs(periodoATea(0.05, 30) - ((1.05) ** (365 / 30) - 1)) < 1e-9)
  assert.equal(aTea({ tipo: 'rendimiento_periodo', valor: 0.05 }), null, 'sin período no se puede anualizar')
})

test('un instrumento sin tipo de tasa queda excluido en vez de entrar con un número dudoso', () => {
  const inst = normalizarInstrumento({
    nombre: 'Fondo Money Market Pesos', plazo_rescate_dias: 0, liquidacion_dias: 0,
    tasa: { tipo: 'rendimiento_historico', valor: 0.35, naturaleza: 'historica' }, costos: { comision: 0 },
  }, { observadoEn: HOY.toISOString() })
  const r = evaluarContraVentana(inst, { bloque: 'B', moneda: 'ARS', dias_libres: 7, monto_maximo: 1e6 }, { valor: 0.6278 })
  assert.equal(r.excluido, true)
  assert.match(r.motivo, /no se puede llevar a efectiva anual sin inventar/)
})

test('los porcentajes y plazos se leen en formato argentino', () => {
  assert.ok(Math.abs(porcentajeArg('TNA 62,78%') - 0.6278) < 1e-9)
  assert.ok(Math.abs(porcentajeArg('1.234,50%') - 12.345) < 1e-9)
  assert.equal(porcentajeArg('sin datos'), null)
  assert.equal(plazoLiquidacion('Liquidez T + 2'), 2)
})

// ════════════════════════════════════════════════════════════════════════════
// LIQUIDEZ, RIESGO Y APTITUD
// ════════════════════════════════════════════════════════════════════════════

test('rescate + liquidación: un T+0 que liquida T+2 NO sirve para una ventana de 1 día', () => {
  const r = liquidezCompatible({ plazo_rescate_dias: 0, liquidacion_dias: 2 }, 1)
  assert.equal(r.compatible, false)
  assert.match(r.motivo, /vuelve en 2 días/)
})

test('sin plazo de rescate conocido, la liquidez NO se asume compatible', () => {
  assert.equal(liquidezCompatible({}, 30).compatible, false)
})

test('un CEDEAR no es apto para caja operativa por más que rinda', () => {
  assert.equal(esAptoTesoreria('cedear'), false)
  assert.equal(esAptoTesoreria('money_market'), true)
  assert.equal(categorizar('Balanz Money Market Clase A'), 'money_market')
  assert.equal(categorizar('Algo raro'), 'otro')
})

test('el riesgo bloquea por iliquidez y por dato viejo, y no promedia', () => {
  const viejo = { id: 'x', categoria: 'money_market', plazo_rescate_dias: 0, liquidacion_dias: 0, observado_en: '2026-07-01T00:00:00Z', cotizado_en: '2026-07-01T00:00:00Z', emisor: 'Balanz' }
  const r = evaluarRiesgo(viejo, PERFILES.caja_operativa, { ahora: HOY })
  assert.equal(r.apto, false)
  assert.ok(r.bloqueantes.some((b) => /horas/.test(b)), 'una tasa de hace un mes no puede usarse')

  const ilíquido = { id: 'y', categoria: 'lecap', plazo_rescate_dias: 5, liquidacion_dias: 1, observado_en: HOY.toISOString(), cotizado_en: HOY.toISOString(), emisor: 'Tesoro' }
  const r2 = evaluarRiesgo(ilíquido, PERFILES.caja_operativa, { ahora: HOY })
  assert.equal(r2.apto, false)
  assert.ok(r2.bloqueantes.some((b) => /vuelve en 6 días/.test(b)))
})

test('la concentración se evalúa sobre el conjunto, no sobre cada propuesta', () => {
  const c = evaluarConcentracion([{ instrumento: 'A', monto_maximo: 9 }, { instrumento: 'B', monto_maximo: 1 }])
  assert.equal(c.nivel, 'medio')
  assert.match(c.hallazgos[0].detalle, /90%/)
})

// ════════════════════════════════════════════════════════════════════════════
// RECOMENDACIÓN Y VALIDACIÓN INDEPENDIENTE
// ════════════════════════════════════════════════════════════════════════════

function escenarioConExcedente() {
  const ventana = {
    bloque: 'C', titulo: 'Excedente de 8 a 30 días', monto_maximo: 10000000, moneda: 'ARS',
    fecha_inicial: '2026-08-01', fecha_limite: '2026-08-31', dias_libres: 30,
    reserva_preservada: 2000000, obligaciones_cubiertas: ['impuesto: $1.000.000'],
    condiciones_invalidez: ['si entra un pago no previsto'], confianza: CONFIANZA.MEDIA, motivo: null,
    // El default de accionabilidad pasó a fail-closed: hay que decir `true`, no basta con no decir false.
    accionable: true, estado_recomendacion: 'ACCIONABLE',
    referencia: { hurdle_periodo: 0, modo: 'costo_oportunidad', explicacion: 'sin deuda ni riesgo de déficit' },
  }
  const inst = normalizarInstrumento({
    nombre: 'Lecap S31O5', moneda: 'ARS', plazo_rescate_dias: 0, liquidacion_dias: 1,
    tasa: { tipo: 'tea', valor: 1.2, naturaleza: 'contractual' },
    costos: { comision: 0.001 }, emisor: 'Tesoro Nacional',
  }, { observadoEn: HOY.toISOString() })
  const corte = { valor: 0.6278, evidencia: EVIDENCIA.HECHO }
  const comparacion = compararAlternativas([inst], [ventana], corte)
  const riesgos = { [inst.id]: evaluarRiesgo(inst, PERFILES.caja_operativa, { ahora: HOY }) }
  const gen = generarRecomendaciones(comparacion, [ventana], {
    hoy: HOY, tasa_de_corte: corte, riesgos, accionable: true,
    fuente_caja: 'Flujo de Caja', fuente_mercado: 'Balanz',
  })
  const posicion = {
    estado: 'ok', en_descubierto: false, caja_real: 20000000, caja_comprometida: 6000000,
    caja_restringida: 0, caja_minima: 2000000, techo_tecnico_preliminar: 12000000, accionable: true, estado_recomendacion: 'ACCIONABLE',
    composicion: { ars_liquida: 20000000, moneda_extranjera: 0, valores_a_depositar: 0, sin_clasificar: 0 },
    confianza: CONFIANZA.MEDIA, fecha: '01/08/2026', fuente: 'cash-briefing',
  }
  const excedente = { estado: 'ok', ventanas: [ventana], tasa_de_corte: corte, deuda_cancelable: { monto: 0 } }
  return { ventana, inst, comparacion, gen, posicion, excedente }
}

test('la propuesta trae monto, horizonte, riesgos, condiciones de invalidez y estado de aprobación', () => {
  const { gen } = escenarioConExcedente()
  assert.equal(gen.propuestas.length, 1)
  const p = gen.propuestas[0]
  assert.equal(p.estado, 'PROPUESTA — REQUIERE APROBACIÓN HUMANA')
  assert.ok(p.condiciones_invalidez.length >= 2)
  assert.ok(p.monto_maximo > 0)
  assert.ok(p.vence_en)
})

test('la validación independiente aprueba una propuesta consistente', () => {
  const { gen, posicion, excedente, inst } = escenarioConExcedente()
  const v = validarRecomendacion(gen.propuestas[0], { posicion, excedente, instrumentos: [inst], ahora: HOY })
  assert.equal(v.aprobada, true, `falló: ${v.fallas.join(' | ')}`)
})

test('la validación RECHAZA si la propuesta usa más plata de la que hay libre', () => {
  const { gen, posicion, excedente, inst } = escenarioConExcedente()
  const rota = { ...gen.propuestas[0], monto_maximo: 99000000 }
  const v = validarRecomendacion(rota, { posicion, excedente, instrumentos: [inst], ahora: HOY })
  assert.equal(v.aprobada, false)
  assert.ok(v.fallas.some((f) => /sin_caja_comprometida/.test(f)))
})

test('la validación RECHAZA si la aritmética no reproduce — no confía en el número declarado', () => {
  const { gen, posicion, excedente, inst } = escenarioConExcedente()
  const rota = { ...gen.propuestas[0], ganancia_neta_estimada: 999999999 }
  const v = validarRecomendacion(rota, { posicion, excedente, instrumentos: [inst], ahora: HOY })
  assert.equal(v.aprobada, false)
  assert.ok(v.fallas.some((f) => /aritmetica/.test(f)))
})

test('la validación RECHAZA una propuesta vencida', () => {
  const { gen, posicion, excedente, inst } = escenarioConExcedente()
  const manana = new Date(HOY.getTime() + 48 * 3600 * 1000)
  const v = validarRecomendacion(gen.propuestas[0], { posicion, excedente, instrumentos: [inst], ahora: manana })
  assert.equal(v.aprobada, false)
  assert.ok(v.fallas.some((f) => /no_vencida/.test(f)))
  assert.equal(estaVencida(gen.propuestas[0], manana), true)
})

test('la validación RECHAZA si hay deuda cancelable sin aplicar', () => {
  const { gen, posicion, excedente, inst } = escenarioConExcedente()
  const v = validarRecomendacion(gen.propuestas[0], {
    posicion, excedente: { ...excedente, deuda_cancelable: { monto: 4000000 } }, instrumentos: [inst], ahora: HOY,
  })
  assert.equal(v.aprobada, false)
  assert.ok(v.fallas.some((f) => /deuda_primero/.test(f)))
})

test('la validación RECHAZA una propuesta NO_ACCIONABLE por más que la aritmética cierre', () => {
  const { gen, posicion, excedente, inst } = escenarioConExcedente()
  const noAccionable = { ...gen.propuestas[0], accionable: false, bloqueos_accionabilidad: ['reserva mínima ausente'] }
  const v = validarRecomendacion(noAccionable, { posicion, excedente, instrumentos: [inst], ahora: HOY })
  assert.equal(v.aprobada, false)
  assert.ok(v.fallas.some((f) => /accionable/.test(f)))
})

test('validarLote separa publicables de rechazadas y NUNCA descarta en silencio', () => {
  const { gen, posicion, excedente, inst } = escenarioConExcedente()
  const lote = [gen.propuestas[0], { ...gen.propuestas[0], id: 'rota', monto_maximo: 99e9 }]
  const r = validarLote(lote, { posicion, excedente, instrumentos: [inst], ahora: HOY })
  assert.equal(r.publicables.length, 1)
  assert.equal(r.rechazadas.length, 1)
  assert.ok(r.rechazadas[0].fallas.length)
})

test('la recomendación de aplicar a deuda trae el rendimiento equivalente y el ahorro diario', () => {
  const rec = recomendarAplicarADeuda({ caja_real: -10000000, fuente: 'cash-briefing' }, { valor: 0.6278 }, HOY)
  assert.equal(rec.tipo, 'aplicar_a_deuda')
  assert.equal(rec.monto_maximo, 10000000)
  assert.ok(rec.ahorro_diario_estimado > 0)
  assert.equal(rec.estado, 'PROPUESTA — REQUIERE APROBACIÓN HUMANA')
})

// ════════════════════════════════════════════════════════════════════════════
// APRENDIZAJE CONTROLADO
// ════════════════════════════════════════════════════════════════════════════

test('"gracias" NO es una confirmación y no aprende nada', () => {
  for (const t of ['gracias', 'ok', 'dale', 'perfecto', '👍']) {
    const c = esConfirmacionReal(t, { propuesta_id: 'rec_1' })
    assert.equal(c.confirma, false, `"${t}" se tomó como confirmación`)
  }
})

test('sin propuesta abierta, ni un "sí" explícito confirma nada', () => {
  assert.equal(esConfirmacionReal('sí, confirmo', {}).confirma, false)
  assert.equal(esConfirmacionReal('sí, confirmo', { propuesta_id: 'x' }).confirma, true)
})

test('una política financiera NUNCA se aplica sola, ni confirmada', () => {
  const r = registrarCorreccion({
    tipo: TIPO_CORRECCION.POLITICA, texto: 'sí, confirmo: reserva mínima $5.000.000',
    propuesta_id: 'rec_1', autor: 'jorge',
  })
  assert.equal(r.clase, 'E')
  assert.equal(r.aplicable_automaticamente, false)
  assert.equal(r.requiere_aprobacion, true)
})

test('una corrección de DATO confirmada sí se aplica sola, y sin confirmar no', () => {
  const conf = registrarCorreccion({ tipo: TIPO_CORRECCION.DATO, texto: 'sí, el saldo es $3M', propuesta_id: 'r1' })
  assert.equal(conf.aplicable_automaticamente, true)
  const sin = registrarCorreccion({ tipo: TIPO_CORRECCION.DATO, texto: 'gracias', propuesta_id: 'r1' })
  assert.equal(sin.aplicable_automaticamente, false)
})

test('proponerCambioPolitica siempre queda pendiente de aprobación explícita', () => {
  const p = proponerCambioPolitica({ clave: 'reserva_minima', valor_propuesto: 5000000, autor: 'jorge' })
  assert.equal(p.aplicable_automaticamente, false)
  assert.match(p.estado, /REQUIERE APROBACIÓN EXPLÍCITA/)
})

// ════════════════════════════════════════════════════════════════════════════
// PUBLICACIÓN Y CONTRATOS
// ════════════════════════════════════════════════════════════════════════════

test('sólo se publica un cambio material', () => {
  const base = { en_descubierto: false, excedente: 10000000, mejor_tasa: 0.05, mejor_instrumento: 'X' }
  assert.equal(esCambioMaterial(base, base).publicar, false)
  assert.equal(esCambioMaterial(base, null).publicar, true)
  assert.equal(esCambioMaterial({ ...base, en_descubierto: true }, base).publicar, true)
  assert.equal(esCambioMaterial({ ...base, excedente: 0 }, base).publicar, true)
  assert.equal(esCambioMaterial({ ...base, excedente: 10400000 }, base).publicar, false)
  assert.equal(esCambioMaterial({ ...base, mejor_instrumento: 'Y' }, base).publicar, true)
})

test('el mensaje NO trae instrucciones de ejecución ni botones', () => {
  const { gen, posicion } = escenarioConExcedente()
  const txt = formatoPropuesta(gen.propuestas[0], posicion, {})
  assert.match(txt, /PROPUESTA — REQUIERE APROBACIÓN HUMANA/)
  for (const prohibido of ['Comprar', 'Suscribir', 'Confirmar', 'actions', 'integration']) {
    assert.equal(txt.includes(prohibido), false, `el mensaje contiene "${prohibido}"`)
  }
})

test('la evidencia combinada es la PEOR de las partes, nunca la mejor', () => {
  assert.equal(evidenciaCombinada(EVIDENCIA.HECHO, EVIDENCIA.ESTIMACION), EVIDENCIA.ESTIMACION)
  assert.equal(evidenciaCombinada(EVIDENCIA.DATO, EVIDENCIA.CALCULO), EVIDENCIA.CALCULO)
  assert.equal(evidenciaCombinada(), EVIDENCIA.SIN_DATO)
})

test('los bloques de horizonte cubren los días sin huecos', () => {
  assert.equal(bloquePorDias(0), 'A')
  assert.equal(bloquePorDias(1), 'A')
  assert.equal(bloquePorDias(2), 'B')
  assert.equal(bloquePorDias(7), 'B')
  assert.equal(bloquePorDias(8), 'C')
  assert.equal(bloquePorDias(30), 'C')
  assert.equal(bloquePorDias(31), 'D')
  assert.equal(bloquePorDias(90), 'D')
  assert.equal(bloquePorDias(365), 'E')
  assert.equal(bloquePorDias(-1), 'G')
})

test('el id de un movimiento es estable y los duplicados se detectan', () => {
  const m = { origen: 'Cobranzas', fecha: new Date('2026-08-01'), monto: 1000, cliente: 'ACME', categoria: 'cobranza' }
  assert.equal(idMovimiento(m), idMovimiento({ ...m }))
  const a = { movement_id: 'x', amount: 1, counterparty: 'A' }
  assert.equal(detectarDuplicados([a, a, a]).length, 1, 'se reporta una vez, no dos')
  assert.equal(detectarDuplicados([a]).length, 0)
})

test('las pestañas prohibidas por el dueño están declaradas', () => {
  assert.deepEqual(PESTANAS_PROHIBIDAS, ['08_CONTROL_CLIENTE', 'P&L'])
})

// ════════════════════════════════════════════════════════════════════════════
// EL AGENTE NO ESCRIBE EL SHEET
// ════════════════════════════════════════════════════════════════════════════

test('ningún módulo de tesorería llama a una función de escritura de Google', () => {
  const escrituras = ['updateSheetValues', 'appendSheetValues', 'clearValues', 'batchUpdateValues',
    'createFile', 'writeDoc', 'appendToDoc', 'docsBatchUpdate', 'uploadFile', 'renameFile', 'moveFile']
  const archivos = ['lectura-flujo.mjs', 'posicion-caja.mjs', 'proyeccion-liquidez.mjs', 'excedente.mjs',
    'instrumentos.mjs', 'comparar.mjs', 'riesgo.mjs', 'recomendacion.mjs', 'validar.mjs',
    'aprendizaje.mjs', 'ciclo.mjs', 'formato-mattermost.mjs', 'contratos.mjs']
  for (const f of archivos) {
    const src = readFileSync(join(DIR, f), 'utf8')
    for (const w of escrituras) {
      assert.equal(src.includes(w), false, `${f} usa ${w}: esta entrega es SOLO LECTURA sobre el Sheet`)
    }
  }
})

test('proyectarLiquidez degrada sin dato en vez de devolver ceros', () => {
  const r = proyectarLiquidez({ estado: 'sin_dato', motivo: 'no hay Sheet' })
  assert.equal(r.estado, 'sin_dato')
  assert.equal(r.evidencia, EVIDENCIA.SIN_DATO)
})

test('el costo total sólo suma lo conocido y lo dice', () => {
  assert.deepEqual(costoTotal({ costos: {} }), { total: 0, conocido: false, componentes: 0 })
  const c = costoTotal({ costos: { comision: 0.01, spread: 0.002 } })
  assert.equal(c.conocido, true)
  assert.ok(Math.abs(c.total - 0.012) < 1e-9)
})

test('rendimientoPeriodo y rendimientoDelPeriodo son la misma aritmética', () => {
  assert.ok(Math.abs(rendimientoPeriodo(0.6278, 30) - rendimientoDelPeriodo(0.6278, 30)) < 1e-12)
})

test('sin instrumentos, el comparador devuelve confianza nula y lo dice', () => {
  const r = compararAlternativas([], [{ bloque: 'B', moneda: 'ARS', dias_libres: 7, monto_maximo: 1e6, titulo: 'x' }], { valor: 0.6278 })
  assert.equal(r.confianza, CONFIANZA.NULA)
  assert.match(r.rankings[0].veredicto, /ninguna alternativa supera/)
})

// ════════════════════════════════════════════════════════════════════════════
// LO QUE ENCONTRÓ LA CORRIDA REAL DEL 01/08 — dos defectos, dos tests
// ════════════════════════════════════════════════════════════════════════════

test('NO se afirma nada más allá de donde llega el calendario (el bloque E prometía 2036)', async () => {
  // El calendario proyecta 90 días. El bloque E ("más de 90") devolvía una ventana con fecha límite a
  // diez años, calculada con el piso de los 90: decía que $80M estaban libres hasta 2036 porque el
  // modelo no ve los sueldos de 2027. No los ve porque no llega, no porque no existan.
  const posicion = {
    estado: 'ok', en_descubierto: false, caja_real: 100000000, caja_comprometida: 0,
    caja_restringida: 0, caja_minima: 0, techo_tecnico_preliminar: 100000000, accionable: true, estado_recomendacion: 'ACCIONABLE', confianza: CONFIANZA.MEDIA,
  }
  const proy = {
    estado: 'ok',
    escenarios: { adverso: { horizontes: [0, 2, 7, 15, 30, 60, 90].map((d) => ({ dias: d, estado: 'ok', piso_invertible: 80000000 })) } },
  }
  // La cobertura sale de las FILAS del calendario, no del mayor horizonte que dijo "ok": 91 filas = 90 días.
  const cal = Array.from({ length: 91 }, (_, i) => ({ fecha: `d${i}`, ingresos: 0, egresos: 0, movimientos: [] }))
  const r = await calcularExcedente(posicion, proy, { hoy: HOY, dias: cal })
  const e = r.ventanas.find((v) => v.bloque_solicitado === 'E')
  assert.ok(e, 'el bloque E tiene que aparecer, aunque sea para decir que no se sabe')
  assert.equal(e.bloque, 'G', 'más allá de la cobertura del calendario no se puede afirmar un excedente')
  assert.match(e.motivo, /90 días/)

  // Y el bloque D, que sí entra, no puede prometer más días de los que el calendario proyecta.
  const d = r.ventanas.find((v) => v.bloque === 'D')
  assert.ok(d.dias_libres <= 90)
  assert.equal(d.fecha_limite, '2026-10-30')
})

test('la deuda comercial vencida sale de los movimientos ya leídos, no de una segunda lectura', () => {
  const flujo = {
    movimientos: [
      { status: 'vencido', direction: 'out', sheet_name: 'Compras', amount: 5351225 },
      { status: 'vencido', direction: 'out', sheet_name: 'Compras', amount: 1000000 },
      { status: 'pendiente', direction: 'out', sheet_name: 'Compras', amount: 900 },
      { status: 'vencido', direction: 'out', sheet_name: 'Cheques Emitidos', amount: 700 },
      { status: 'vencido', direction: 'in', sheet_name: 'Compras', amount: 500 },
    ],
  }
  const v = vencidoComercialDe(flujo)
  assert.equal(v.monto, 6351225)
  assert.equal(v.n, 2)
  assert.equal(vencidoComercialDe({ movimientos: [] }), null, 'sin vencidos es null, no un cero que parezca dato')
})

test('los dólares y los cheques en cartera NO financian una colocación en pesos', () => {
  // El control independiente contra la pestaña CAJA (01/08) mostró que el "total disponibilidades"
  // de $126,19M incluye U$S 15.581 y $10,29M de valores a depositar. Recomendar todo eso a T+0 en
  // pesos sería contar plata que está en otra moneda y plata que todavía no entró.
  const c = clasificarCuentas([
    { cuenta: 'Caja en pesos', saldo: 15194864 },
    { cuenta: 'Caja en dólares', saldo: 22285427 },
    { cuenta: 'Santander · cta cte ARS', saldo: 87913839 },
    { cuenta: 'Santander · cta cte USD', saldo: 863768 },
    { cuenta: 'Valores a depositar', saldo: 10290000 },
    { cuenta: 'Movimientos posteriores al corte del extracto', saldo: -67612 },
  ])
  assert.equal(c.moneda_extranjera, 22285427 + 863768)
  assert.equal(c.valores_a_depositar, 10290000)
  assert.equal(c.ars_liquida, 15194864 + 87913839 - 67612)
  assert.equal(c.sin_clasificar, 0, 'una cuenta sin clasificar es un hueco: hay que verlo')
  // Y un hallazgo del control del 01/08 que conviene dejar fijado: la suma de las cuentas da
  // $136.480.286, pero el "Total disponibilidades" de la pestaña es $126.190.287 — exactamente
  // $10.290.000 menos, que son los valores a depositar. **La pestaña ya los excluye del total**, así
  // que el OS no los está contando como caja. Si algún día ese delta deja de coincidir con los
  // valores a depositar, cambió el criterio de la pestaña y hay que mirarlo.
  const sumaCuentas = c.ars_liquida + c.moneda_extranjera + c.valores_a_depositar + c.sin_clasificar
  assert.equal(sumaCuentas, 136480286)
  assert.equal(sumaCuentas - 126190287, c.valores_a_depositar - 1) // -1: el total de la pestaña redondea
})

test('si un componente de la caja no es número, el control FALLA — no pasa por accidente', () => {
  // Regresión del 01/08: `caja_restringida` pasó de número a modelo y el validador hacía
  // `caja_real - ... - {objeto}` = NaN. `monto <= NaN` es false, así que rechazaba todo: parecía
  // funcionar y en realidad estaba roto. Un control que acierta por accidente no es un control.
  const { gen, posicion, excedente, inst } = escenarioConExcedente()
  const rota = { ...posicion, caja_comprometida: undefined }
  const v = validarRecomendacion(gen.propuestas[0], { posicion: rota, excedente, instrumentos: [inst], ahora: HOY })
  assert.equal(v.aprobada, false)
  assert.ok(v.fallas.some((f) => /no es un número/.test(f)), `motivo real: ${v.fallas.join(' | ')}`)
})

test('el validador lee el monto restringido del MODELO, no del objeto entero', () => {
  const { gen, posicion, excedente, inst } = escenarioConExcedente()
  const conModelo = { ...posicion, caja_restringida: { monto_a_restar: 0, restricted_cash_status: 'known_zero' } }
  const v = validarRecomendacion(gen.propuestas[0], { posicion: conModelo, excedente, instrumentos: [inst], ahora: HOY })
  assert.equal(v.aprobada, true, `falló: ${v.fallas.join(' | ')}`)
})

test('el validador topea por la parte líquida en pesos, no por el total', () => {
  const { gen, posicion, excedente, inst } = escenarioConExcedente()
  // Misma caja total, pero casi toda en dólares: la propuesta deja de ser financiable.
  const enDolares = { ...posicion, composicion: { ars_liquida: 3000000, moneda_extranjera: 17000000, valores_a_depositar: 0, sin_clasificar: 0 } }
  const v = validarRecomendacion(gen.propuestas[0], { posicion: enDolares, excedente, instrumentos: [inst], ahora: HOY })
  assert.equal(v.aprobada, false)
  assert.ok(v.fallas.some((f) => /sin_caja_comprometida/.test(f)))
})

test('un AJUSTE negativo no es una cuenta en descubierto', () => {
  // Corrida real del 01/08: la fila "Movimientos posteriores al corte del extracto" vale -$67.612 y
  // el agente la leyó como descubierto utilizado, con las tres cuentas del banco en positivo. Un
  // descubierto inventado sube la vara al CFT y hace descartar toda colocación razonable.
  // Las tres filas son las reales de la pestaña CAJA al 01/08.
  const comp = clasificarCuentas([
    { cuenta: 'Santander · cta cte ARS', saldo: 87913839 },
    { cuenta: 'Caja en pesos', saldo: 15194864 },
    { cuenta: 'Movimientos posteriores al corte del extracto', saldo: -67612 },
  ])
  assert.equal(deudaCancelable(comp, 103041091).monto, 0, 'no hay ninguna CUENTA en rojo')
  // Pero el ajuste sigue contando para el total en pesos: no se descarta, sólo no se lee como deuda.
  assert.equal(comp.ars_liquida, 87913839 + 15194864 - 67612)
  assert.equal(comp.detalle.find((c) => /Movimientos/.test(c.cuenta)).es_ajuste, true)
  // Y una cuenta de verdad en rojo sí se detecta.
  const conRojo = clasificarCuentas([{ cuenta: 'Santander · cta cte ARS', saldo: -8000000 }])
  assert.equal(deudaCancelable(conRojo, -8000000).monto, 8000000)
})

test('un #REF! en el total NO se informa como caja $0', () => {
  // Pasó de verdad el 01/08, mientras corría el agente: la pestaña CAJA se rompió, `parseMonto('#REF!')`
  // devolvió 0, y el OS informó "caja hoy $0" con cara de hecho. Cero no es "no sé".
  const rota = clasificarCuentas([
    { cuenta: 'Santander · cta cte ARS', saldo: 87913839 },
    { cuenta: 'Santander · cta cte USD', saldo: 863768 },
    { cuenta: 'Valores a depositar', saldo: 10290000 },
    { cuenta: 'Movimientos posteriores al corte del extracto', saldo: -67612 },
  ])
  const c = coherenciaDelTotal(0, rota)
  assert.equal(c.coherente, false)
  assert.match(c.motivo, /#REF!|fórmula rota/)
  assert.equal(c.esperado, 88709995)
})

test('el control acepta la relación REAL: el total excluye los valores a depositar', () => {
  // Verificado a mano contra la pestaña el 01/08: suma de cuentas $136.480.286, total $126.190.287,
  // diferencia exacta = los $10.290.000 de valores a depositar.
  const sana = clasificarCuentas([
    { cuenta: 'Caja en pesos', saldo: 15194864 },
    { cuenta: 'Caja en dólares', saldo: 22285427 },
    { cuenta: 'Santander · cta cte ARS', saldo: 87913839 },
    { cuenta: 'Santander · cta cte USD', saldo: 863768 },
    { cuenta: 'Valores a depositar', saldo: 10290000 },
    { cuenta: 'Movimientos posteriores al corte del extracto', saldo: -67612 },
  ])
  assert.equal(coherenciaDelTotal(126190287, sana).coherente, true)
  // Y un total inflado en más de la tolerancia tampoco pasa.
  assert.equal(coherenciaDelTotal(200000000, sana).coherente, false)
})

test('una cuenta que ayer estaba y hoy no, NO es una cuenta en cero', () => {
  // El 01/08, con el #REF! arreglado a medias, "Caja en pesos" y "Caja en dólares" quedaron en `—`.
  // El total volvió a ser coherente con lo legible y el control de coherencia pasó — bien, porque el
  // total ya no mentía. Pero la caja quedó subvaluada en ~$37M: dos cuentas simplemente no estaban.
  const ayer = clasificarCuentas([
    { cuenta: 'Caja en pesos', saldo: 15194864 },
    { cuenta: 'Caja en dólares', saldo: 22285427 },
    { cuenta: 'Santander · cta cte ARS', saldo: 87913839 },
  ])
  const hoy = clasificarCuentas([{ cuenta: 'Santander · cta cte ARS', saldo: 87913839 }])
  const faltan = cuentasQueDesaparecieron(hoy, ayer)
  assert.equal(faltan.length, 2)
  assert.equal(faltan[0].saldo_anterior, 15194864)
  // Sin historial no se puede afirmar nada: no se inventa una alarma.
  assert.deepEqual(cuentasQueDesaparecieron(hoy, null), [])
  // Y una cuenta que estaba en CERO y desaparece no es una alarma: no había plata ahí.
  const conCero = clasificarCuentas([{ cuenta: 'Santander · cta cte ARS', saldo: 87913839 }, { cuenta: 'Cuenta vieja', saldo: 0 }])
  assert.deepEqual(cuentasQueDesaparecieron(hoy, conCero), [])
})

test('un pico de $1 por redondeo NO es una contingencia', () => {
  // Corrida real: la ventana se calcula para tocar el piso exacto y el punto flotante la deja $1
  // abajo. El modo salía "contingencia" con costo $0 — una etiqueta alarmante sobre ruido. Una vara
  // que grita cuando no pasa nada entrena a ignorarla.
  const cal = Array.from({ length: 31 }, (_, i) => ({ fecha: `d${i}`, ingresos: 0, egresos: i === 10 ? 1 : 0 }))
  const ref = tasaDeReferencia({
    dias: 30, monto: 1000000, deuda: 0, cft: 0.6278, cajaInicial: 1000000, dias_calendario: cal,
    factorIngresos: 1, interesDia: (s) => Math.abs(s) * 0.6278 / 365,
  })
  assert.ok(ref.contingencia.dias_en_rojo > 0, 'la simulación sí toca el rojo')
  assert.equal(ref.contingencia.costo, 0, 'pero el costo no llega a un peso')
  assert.equal(ref.modo, MODO.COSTO_OPORTUNIDAD, 'entonces no es una contingencia')
  assert.equal(ref.hurdle_periodo, 0)
})

// ════════════════════════════════════════════════════════════════════════════
// LO QUE ENCONTRÓ LA AUDITORÍA DE CIERRE — el validador aprobaba un invento
// ════════════════════════════════════════════════════════════════════════════

test('una propuesta FABRICADA no aprueba: cuatro controles pasaban por ausencia de campo', () => {
  const rec = {
    id: 'inventada', bloque: 'C', instrumento: 'Fantasma', instrumento_id: 'no-existe',
    monto_maximo: 1000, moneda: 'ARS', horizonte_dias: 30,
    rendimiento_neto_periodo: 0.001, ganancia_neta_estimada: 1,
    reserva_preservada: null, plazo_rescate_dias: null, accionable: true,
    fuente_caja: 'x', fuente_mercado: 'y', datos_faltantes: [],
    vence_en: new Date(HOY.getTime() + 3600e3).toISOString(),
  }
  const posicion = {
    estado: 'ok', en_descubierto: false, caja_real: 1e7, caja_comprometida: 0,
    caja_restringida: { monto_a_restar: 0 }, caja_minima: 0, composicion: { ars_liquida: 1e7 },
  }
  const excedente = {
    ventanas: [{ bloque: 'C', moneda: 'ARS', dias_libres: 30, monto_maximo: 1e6, referencia: {} }],
    tasa_de_corte: { valor: 0.6278 }, deuda_cancelable: { monto: 0 },
  }
  const v = validarRecomendacion(rec, { posicion, excedente, instrumentos: [], ahora: HOY })
  assert.equal(v.aprobada, false)
  for (const regla of ['reserva_preservada', 'rescate_compatible', 'supera_vara', 'instrumento_existe']) {
    assert.ok(v.fallas.some((f) => f.startsWith(regla)), `${regla} pasó: ${v.fallas.join(' | ')}`)
  }
})

test('el rendimiento neto SE RECALCULA desde el instrumento, no se cree lo declarado', () => {
  // El chequeo aritmético comparaba `monto × neto = ganancia`: dos campos de la propuesta contra sí
  // mismos. Un neto inflado diez veces aprobaba con cero fallas.
  const inst = normalizarInstrumento({
    nombre: 'Lecap S31O5', moneda: 'ARS', plazo_rescate_dias: 0, liquidacion_dias: 1,
    tasa: { tipo: 'tea', valor: 0.90, naturaleza: 'contractual' }, costos: { comision: 0.001 },
    emisor: 'Tesoro',
  }, { observadoEn: HOY.toISOString() })
  const ventana = {
    bloque: 'C', moneda: 'ARS', dias_libres: 30, monto_maximo: 1e6,
    referencia: { hurdle_periodo: 0, modo: 'costo_oportunidad' },
  }
  const posicion = {
    estado: 'ok', en_descubierto: false, caja_real: 1e7, caja_comprometida: 0,
    caja_restringida: { monto_a_restar: 0 }, caja_minima: 0, composicion: { ars_liquida: 1e7 },
  }
  const excedente = { ventanas: [ventana], tasa_de_corte: { valor: 0.6278 }, deuda_cancelable: { monto: 0 } }
  const base = {
    id: 'r', bloque: 'C', instrumento: inst.nombre, instrumento_id: inst.id,
    monto_maximo: 1e6, moneda: 'ARS', horizonte_dias: 30, plazo_rescate_dias: 1,
    reserva_preservada: 0, accionable: true, fuente_caja: 'x', fuente_mercado: 'y',
    datos_faltantes: [], vence_en: new Date(HOY.getTime() + 3600e3).toISOString(),
  }
  const fuentes = { posicion, excedente, instrumentos: [inst], ahora: HOY }

  // El neto verdadero del instrumento a 30 días.
  const real = (1.9 ** (30 / 365)) - 1 - 0.001
  const ok = validarRecomendacion({ ...base, rendimiento_neto_periodo: real, ganancia_neta_estimada: Math.round(1e6 * real) }, fuentes)
  assert.equal(ok.aprobada, true, `la propuesta correcta no pasó: ${ok.fallas.join(' | ')}`)

  // El mismo instrumento, con el neto inflado diez veces y la ganancia coherente con la mentira.
  const inflado = real * 10
  const mal = validarRecomendacion({ ...base, rendimiento_neto_periodo: inflado, ganancia_neta_estimada: Math.round(1e6 * inflado) }, fuentes)
  assert.equal(mal.aprobada, false, 'un neto inflado 10x aprobó')
  assert.ok(mal.fallas.some((f) => f.startsWith('neto_reproducible')), mal.fallas.join(' | '))
})

test('esNumero no se deja engañar por la coerción', () => {
  assert.equal(esNumero(null), false)
  assert.equal(esNumero(undefined), false)
  assert.equal(esNumero(''), false)
  assert.equal(esNumero('  '), false)
  assert.equal(esNumero([]), false)
  assert.equal(esNumero(true), false)
  assert.equal(esNumero(NaN), false)
  assert.equal(esNumero(0), true, 'un cero SÍ es un número')
  assert.equal(esNumero('12.5'), true)
})

test('sin composición, el control de coherencia FALLA — no pasa por no poder cruzar', () => {
  // Fallaba abierto en su forma total: sin composición devolvía `coherente: true`. El control creado
  // para que un #REF! no se informe como caja $0 se caía del lado cómodo justo cuando la pestaña
  // estaba del todo ilegible. "No se puede cruzar" no es "está bien": es no saber.
  assert.equal(coherenciaDelTotal(126190287, null).coherente, false)
  assert.equal(coherenciaDelTotal(0, { ars_liquida: 0, moneda_extranjera: 0, valores_a_depositar: 0, sin_clasificar: 0, detalle: [] }).coherente, false)
  // Total 0 y cuentas 0: dos ceros que coinciden no son un cruce.
  const todoCero = clasificarCuentas([{ cuenta: 'Santander · cta cte ARS', saldo: 0 }])
  const r = coherenciaDelTotal(0, todoCero)
  assert.equal(r.coherente, false)
  assert.match(r.motivo, /no se pudo leer/)
})

test('la contingencia se simula EN PESOS: los dólares no tapan un déficit en pesos', async () => {
  // El techo ya se topeaba con `ars_liquida`; la simulación del riesgo arrancaba del total —dólares
  // incluidos— así que creía que había más pesos de los que hay y devolvía una vara más baja.
  const cal = Array.from({ length: 31 }, (_, i) => ({ fecha: `d${i}`, ingresos: 0, egresos: i === 10 ? 30000000 : 0, movimientos: [] }))
  const proy = { estado: 'ok', escenarios: { adverso: { horizontes: [0, 2, 7, 15, 30].map((d) => ({ dias: d, estado: 'ok', piso_invertible: 25000000 })) } } }
  const base = {
    estado: 'ok', caja_real: 50000000, caja_comprometida: 0, caja_minima: 0,
    techo_tecnico_preliminar: 25000000, accionable: true, confianza: CONFIANZA.MEDIA,
  }
  const conDolares = await calcularExcedente(
    { ...base, composicion: { ars_liquida: 20000000, moneda_extranjera: 30000000, valores_a_depositar: 0, sin_clasificar: 0, detalle: [{ cuenta: 'x', saldo: 20000000, clase: 'ars_liquida' }] } },
    proy, { hoy: HOY, dias: cal },
  )
  const sinComposicion = await calcularExcedente({ ...base, composicion: null }, proy, { hoy: HOY, dias: cal })
  const varaC = conDolares.ventanas.find((v) => v.bloque === 'C')?.referencia?.hurdle_periodo ?? 0
  const varaS = sinComposicion.ventanas.find((v) => v.bloque === 'C')?.referencia?.hurdle_periodo ?? 0
  assert.ok(varaC > varaS, `mirando sólo los pesos la vara tiene que ser MAYOR: ${varaC} vs ${varaS}`)
})

test('la cobertura del calendario sale de las FILAS, no del horizonte que dijo "ok"', async () => {
  // `resumirHorizonte` devolvía `ok` con cualquier array no vacío, así que con 11 días el horizonte
  // de 90 salía ok y la cobertura daba 90 igual: el control se validaba contra sí mismo.
  const proy = { estado: 'ok', escenarios: { adverso: { horizontes: [0, 2, 7, 15, 30, 60, 90].map((d) => ({ dias: d, estado: 'ok', piso_invertible: 9e7 })) } } }
  const posicion = {
    estado: 'ok', caja_real: 1e8, caja_comprometida: 0, caja_minima: 0,
    techo_tecnico_preliminar: 1e8, accionable: true, confianza: CONFIANZA.MEDIA, composicion: null,
  }
  const corto = Array.from({ length: 11 }, (_, i) => ({ fecha: `d${i}`, ingresos: 0, egresos: 0, movimientos: [] }))
  const r = await calcularExcedente(posicion, proy, { hoy: HOY, dias: corto })
  const d = r.ventanas.find((v) => v.bloque_solicitado === 'D') ?? r.ventanas.find((v) => v.bloque === 'D')
  assert.equal(d.bloque, 'G', 'con 11 días no se puede afirmar nada a 31-90')
  assert.match(d.motivo, /10 días/)
})

test('resumirHorizonte no afirma un piso sobre días que no miró', () => {
  const corto = Array.from({ length: 11 }, (_, i) => ({ fecha: `d${i}`, ingresos: 0, egresos: 0 }))
  assert.equal(resumirHorizonte(corto, 90, ESCENARIOS.adverso, 1e8).estado, 'sin_dato')
  assert.equal(resumirHorizonte(corto, 7, ESCENARIOS.adverso, 1e8).estado, 'ok')
})

// ════════════════════════════════════════════════════════════════════════════
// SEGUNDA AUDITORÍA — dos correcciones no tenían quién las protegiera
// ════════════════════════════════════════════════════════════════════════════

test('un fondo SIN plazo de rescate no se cuela como liquidez inmediata', () => {
  // El auditor revirtió las tres líneas de esta corrección y la suite quedó VERDE: publicaba $44,3M
  // en un fondo cuyo plazo de rescate no se conoce, declarándolo T+0. No había ni un test.
  for (const sinPlazo of [null, undefined, '', NaN]) {
    const i = normalizarInstrumento({
      nombre: 'FCI Money Market Opaco', moneda: 'ARS',
      plazo_rescate_dias: sinPlazo, liquidacion_dias: sinPlazo,
      tasa: { tipo: 'tea', valor: 1.5, naturaleza: 'indicativa' }, costos: { comision: 0 }, emisor: 'X',
    }, { observadoEn: HOY.toISOString() })

    assert.equal(i.plazo_rescate_dias, null, `${String(sinPlazo)} se convirtió en un número`)
    assert.ok(i.campos_faltantes.includes('plazo_rescate_dias'), 'tiene que declararse faltante')
    assert.equal(liquidezCompatible(i, 30).compatible, false, 'la guarda de liquidez estaba muerta para null')
    assert.equal(evaluarRiesgo(i, PERFILES.caja_operativa, { ahora: HOY }).apto, false)
    // Y no llega al ranking, por más que rinda 150%.
    const r = evaluarContraVentana(i, { bloque: 'C', moneda: 'ARS', dias_libres: 30, monto_maximo: 1e6, referencia: { hurdle_periodo: 0 } }, { valor: 0.6278 })
    assert.equal(r.excluido, true)
  }
  // Un T+0 declarado de verdad SÍ pasa: la guarda no puede bloquear lo legítimo.
  const bueno = normalizarInstrumento({
    nombre: 'FCI Money Market', moneda: 'ARS', plazo_rescate_dias: 0, liquidacion_dias: 0,
    tasa: { tipo: 'tea', valor: 1.5, naturaleza: 'indicativa' }, costos: { comision: 0 }, emisor: 'X',
  }, { observadoEn: HOY.toISOString() })
  assert.equal(liquidezCompatible(bueno, 30).compatible, true)
  assert.equal(evaluarRiesgo(bueno, PERFILES.caja_operativa, { ahora: HOY }).apto, true)
})

test('la accionabilidad falla CERRADA: sin decir true, no es accionable', () => {
  // Era `!== false`, así que un `undefined` daba accionable = true. El auditor lo revirtió y la suite
  // siguió verde: la única compuerta de accionabilidad tenía el default del lado peligroso.
  const inst = normalizarInstrumento({
    nombre: 'Lecap S31O5', moneda: 'ARS', plazo_rescate_dias: 0, liquidacion_dias: 1,
    tasa: { tipo: 'tea', valor: 1.2, naturaleza: 'contractual' }, costos: { comision: 0.001 }, emisor: 'Tesoro',
  }, { observadoEn: HOY.toISOString() })
  const corte = { valor: 0.6278 }
  const armar = (accionableVentana, accionableCtx) => {
    const ventana = {
      bloque: 'C', titulo: 'x', monto_maximo: 1e6, moneda: 'ARS', dias_libres: 30,
      reserva_preservada: 0, obligaciones_cubiertas: [], condiciones_invalidez: [],
      confianza: CONFIANZA.MEDIA, motivo: null, accionable: accionableVentana,
      referencia: { hurdle_periodo: 0, modo: 'costo_oportunidad' },
    }
    return generarRecomendaciones(compararAlternativas([inst], [ventana], corte), [ventana], {
      hoy: HOY, tasa_de_corte: corte, riesgos: { [inst.id]: evaluarRiesgo(inst, PERFILES.caja_operativa, { ahora: HOY }) },
      accionable: accionableCtx, fuente_caja: 'x', fuente_mercado: 'y',
    }).propuestas[0]
  }
  assert.equal(armar(undefined, undefined).accionable, false, 'undefined no puede significar sí')
  assert.equal(armar(true, undefined).accionable, false)
  assert.equal(armar(undefined, true).accionable, false)
  assert.equal(armar(true, true).accionable, true, 'con las dos en true sí')
  assert.equal(armar(undefined, undefined).etiqueta_monto, 'techo_tecnico_preliminar')
})

test('la frescura del mercado se MIDE con lo relevado, no se cablea', () => {
  // Estaba fija en `false` en el entrypoint, y ningún archivo del repo la ponía en true: con todo lo
  // demás aprobado, las cuatro propuestas salían NO_ACCIONABLE por "no hay datos frescos". Una
  // compuerta que nadie puede abrir no es una compuerta: es una pared.
  const ahora = new Date('2026-08-01T12:00:00Z')
  assert.equal(frescuraDeMercado([], ahora).fresco, false)
  // ═══ SE MIDE `cotizado_en`, NO `observado_en` ═══
  // `observado_en` lo estampa el propio extractor con la hora de la corrida: medirlo era un espejo
  // —daba 0,0 h siempre— y con un solo candidato parseado la compuerta quedaba abierta para siempre.
  const conHora = (iso) => ({ cotizado_en: iso, cotizado_precision: 'minuto' })
  assert.equal(frescuraDeMercado([conHora('basura')], ahora).fresco, false)
  assert.equal(frescuraDeMercado([conHora('2026-08-01T11:00:00Z')], ahora).fresco, true)
  assert.equal(frescuraDeMercado([conHora('2026-07-30T11:00:00Z')], ahora).fresco, false)
  // Y un instrumento recién observado pero SIN fecha de cotización no es fresco: es sin fecha.
  const sinFecha = frescuraDeMercado([{ observado_en: ahora.toISOString(), cotizado_en: null }], ahora)
  assert.equal(sinFecha.fresco, false)
  assert.match(sinFecha.motivo, /no declara|ninguno/)
  // ═══ LA COMPUERTA PREGUNTA "¿HAY DATOS DE HOY?", NO "¿ESTÁ TODO FRESCO?" ═══
  //
  // Medir por el eslabón más VIEJO deja el conjunto rehén de cualquier especie ilíquida —en el
  // relevamiento real había una ON cotizada por última vez el 20/11/2018— que además ya está
  // excluida una por una por `riesgo.mjs`, que bloquea todo lo de más de 24 h. Eso cierra la
  // compuerta para siempre, que es el otro modo de control inútil.
  const mezcla = frescuraDeMercado([
    conHora('2026-08-01T11:55:00Z'), conHora('2026-07-29T00:00:00Z'),
  ], ahora)
  assert.equal(mezcla.fresco, true, 'hay un dato de hace 5 minutos: sí se puede decidir con el mercado de hoy')
  // Pero el viejo NO se esconde: se cuenta, y es lo que después baja la confianza de la propuesta.
  assert.equal(mezcla.viejos, 1)
  assert.match(mezcla.motivo, /1 con dato viejo/)
  // Y si NINGUNO es de hoy, la compuerta cierra aunque haya cien instrumentos.
  assert.equal(frescuraDeMercado([
    conHora('2026-07-30T11:00:00Z'), conHora('2026-07-29T00:00:00Z'),
  ], ahora).fresco, false)
})

test('BLOQUEANTE · con una pantalla que sólo publica FECHA, la vara son DÍAS HÁBILES', () => {
  // ═══ EL DEFECTO QUE INTRODUJO EL ARREGLO ANTERIOR ═══
  //
  // Las seis tablas reales de Balanz traen la columna "Hora" con una FECHA sin hora del día
  // ("31/07/2026"). Parseada a medianoche y medida en horas contra un máximo de 6, la respuesta es
  // NO desde las 06:00 — y el timer del Tesorero corre 09:15 y 15:30. La compuerta pasó de estar
  // siempre abierta (el espejo) a no poder abrirse nunca (la pared): el mismo defecto de diseño.
  //
  // A las 09:15 de un lunes el mercado NO ABRIÓ: el último precio que existe es el del viernes, y
  // exigirle uno de hoy es exigir un dato que no puede existir.
  const soloFecha = (y, m, d) => ({ cotizado_en: new Date(y, m, d).toISOString(), cotizado_precision: 'dia' })
  const lunes0915 = new Date(2026, 7, 3, 9, 15)
  const lunes1530 = new Date(2026, 7, 3, 15, 30)

  assert.equal(frescuraDeMercado([soloFecha(2026, 6, 31)], lunes0915).fresco, true, 'el viernes es el último cierre: es el dato vigente')
  assert.equal(frescuraDeMercado([soloFecha(2026, 7, 3)], lunes1530).fresco, true, 'y una cotización de hoy también')
  // Pero un dato del miércoles anterior SÍ está viejo: la tolerancia es de UN día hábil, no de la semana.
  const vieja = frescuraDeMercado([soloFecha(2026, 6, 29)], lunes0915)
  assert.equal(vieja.fresco, false)
  assert.match(vieja.motivo, /día\(s\) hábil\(es\)/)
  // Y el riesgo por instrumento usa la MISMA vara: si no, bloquearía el precio del viernes un lunes.
  const delViernes = {
    id: 'x', categoria: 'money_market', plazo_rescate_dias: 0, liquidacion_dias: 0, emisor: null,
    observado_en: lunes0915.toISOString(), ...soloFecha(2026, 6, 31),
  }
  assert.equal(evaluarRiesgo(delViernes, PERFILES.caja_operativa, { ahora: lunes0915 }).apto, true)
  const delMiercoles = { ...delViernes, ...soloFecha(2026, 6, 29) }
  assert.equal(evaluarRiesgo(delMiercoles, PERFILES.caja_operativa, { ahora: lunes0915 }).apto, false)
})

test('BLOQUEANTE · no saber el emisor no puede vetar un money market', () => {
  // ═══ EL DEFECTO ═══
  // Ningún extractor escribe `emisor` —Balanz no publica la administradora en la grilla— y la marca
  // `contraparte` vivía en la familia `instrumento`. Resultado sobre las pantallas reales: los 142
  // instrumentos aptos daban `apto:false`, y 22 de ellos con `bloqueantes: []`, o sea sin un solo
  // motivo escrito. El módulo no podía producir una propuesta y no decía por qué.
  const sinEmisor = {
    id: 'mm', categoria: 'money_market', plazo_rescate_dias: 0, liquidacion_dias: 0, emisor: null,
    cotizado_en: HOY.toISOString(), cotizado_precision: 'minuto', observado_en: HOY.toISOString(),
  }
  const r = evaluarRiesgo(sinEmisor, PERFILES.caja_operativa, { ahora: HOY })
  assert.equal(r.apto, true, 'un money market no se veta por un dato que el bróker no publica')
  // Pero se sigue reportando: es un hueco nuestro y tiene que verse.
  assert.ok(r.hallazgos.some((x) => x.tipo === 'contraparte'))
  assert.equal(r.nivel, 'medio', 'el nivel REPORTADO lo refleja aunque no vete')
  assert.equal(r.max_riesgo_perfil, 'bajo', 'y el techo del perfil viaja, para poder escribir el motivo')
})

// ════════════════════════════════════════════════════════════════════════════
// LA PANTALLA REAL DE BALANZ — datos capturados con sesión el 02/08/2026
// ════════════════════════════════════════════════════════════════════════════

/**
 * Las filas de abajo NO están inventadas: salen de `clientes.balanz.com/app/cotizaciones/*` leídas
 * por CDP desde el Chrome dedicado, con la sesión del dueño abierta. Se conservan textuales —con su
 * cabecera, su `⏎` entre ticker y nombre, y sus guiones— porque cada rareza de formato costó un
 * defecto.
 */
const TABLA_BONOS_REAL = {
  cabecera: ['Ticker', 'Nombre', 'Plazo', 'Hora', 'Precio', 'Var(%)', 'Var', 'TIR', 'Volumen'],
  filas: [
    ['AE38', 'BONO REP. ARGENTINA USD STEP UP 2038', '24hs', '31/07/2026', '1.250,00', '0,00%', '0,00', '9.3%', '6.918.918.474'],
    ['AE38C', 'BONO REP. ARGENTINA USD STEP UP 2038', '24hs', '31/07/2026', '0,792', '0,00%', '0,00', '-', '2.201.718'],
  ],
}
const TABLA_LETRAS_REAL = {
  cabecera: ['Ticker', 'Nombre', 'Plazo', 'Hora', 'Precio', 'Var(%)', 'Var', 'TNA', 'Volumen'],
  filas: [
    ['S14G6', 'LETRA DEL TESORO NACIONAL CAPITALIZABLE EN PESOS VTO. 14/08/2026', '24hs', '31/07/2026', '1,0727', '0,00%', '0,00', '23,16%', '49.128.611.494'],
  ],
}
const TABLA_CAUCIONES_REAL = {
  cabecera: ['Ticker', 'Nombre', 'Plazo', 'Hora', 'TNA', 'Var(%)', 'Var', 'Volumen'],
  filas: [
    ['DOLAR', 'DOLARES', '72hs', '31/07/2026', '2.11', '0,00%', '0,00', '1.037.184.028'],
    ['PESOS', 'CAUCION PESOS', '72hs', '31/07/2026', '10', '0,00%', '0,00', '8.449.076.556.363'],
  ],
}

test('el punto NO siempre es separador de miles: la TIR real del AE38 es 9,3%, no 3%', () => {
  // ═══ EL DEFECTO ═══
  // Balanz escribe la TIR con punto decimal ("9.3%") y el precio con coma ("1.250,00"), en la misma
  // fila. La regex vieja exigía grupos de miles de 3 dígitos, así que sobre "9.3%" no matcheaba el
  // "9" y capturaba el "3" suelto: devolvía 0.03. Un bono que rinde 9,3% informado como 3% se
  // descarta solo, y nadie se entera de que se descartó por un parser.
  assert.ok(Math.abs(porcentajeArg('9.3%') - 0.093) < 1e-9, 'la TIR con punto decimal se lee mal')
  assert.ok(Math.abs(porcentajeArg('23,16%') - 0.2316) < 1e-9, 'y la TNA con coma tiene que seguir andando')
  // El otro lado: el punto SÍ es miles cuando vienen tres dígitos justos.
  assert.equal(numeroArg('1.250,00'), 1250)
  assert.equal(numeroArg('1.234.567'), 1234567)
  assert.equal(numeroArg('49.128.611.494'), 49128611494)
  // Y el caso que la caución en dólares expuso: "2.11" es 2,11, no 211.
  assert.equal(numeroArg('2.11'), 2.11)
  // Un grupo de miles nunca arranca con cero: "0.792" es cero coma algo, no setecientos noventa y dos.
  assert.equal(numeroArg('0.792'), 0.792)
  assert.equal(numeroArg('0,792'), 0.792, 'y así es como lo escribe Balanz de verdad')
  // Un guion es "no hay dato", nunca cero.
  assert.equal(numeroArg('-'), null)
  assert.equal(numeroArg(''), null)
  assert.equal(numeroArg(null), null)
})

test('separadorDecimal declara qué hace con cada forma, incluida la ambigua', () => {
  assert.equal(separadorDecimal('1.250,00'), 'coma')
  assert.equal(separadorDecimal('23,16'), 'coma')
  assert.equal(separadorDecimal('9.3'), 'punto')
  assert.equal(separadorDecimal('2.11'), 'punto')
  assert.equal(separadorDecimal('1.234.567'), 'miles')
  assert.equal(separadorDecimal('0.792'), 'punto', 'un grupo de miles no arranca con cero')
  assert.equal(separadorDecimal('10'), 'ninguno')
  // El único ambiguo de verdad: en es-AR es nueve mil trescientos. Se resuelve así y se declara.
  assert.equal(separadorDecimal('9.300'), 'miles')
})

test('la tabla REAL de bonos: TIR 9,3%, moneda USD, y el guion NO es cero', () => {
  const { instrumentos } = extraerDeTabla(TABLA_BONOS_REAL, { url: '/app/cotizaciones/bonos' })
  assert.equal(instrumentos.length, 2)
  const [ae38, ae38c] = instrumentos
  assert.equal(ae38.ticker, 'AE38')
  assert.equal(ae38.tasa.tipo, 'tir')
  assert.ok(Math.abs(ae38.tasa.valor - 0.093) < 1e-9)
  assert.equal(ae38.precio, 1250)
  // Sin columna de moneda, el default silencioso era ARS — para un bono que dice USD en el nombre.
  assert.equal(ae38.moneda, 'USD', 'un bono en dólares no puede quedar etiquetado en pesos')
  // "Plazo 24hs" es la liquidación: es lo que decide cuándo vuelve la plata.
  assert.equal(ae38.liquidacion_dias, 1)
  // Y la fila sin TIR queda SIN tasa, no con tasa 0.
  assert.equal(ae38c.tasa, null)
  assert.ok(ae38c.campos_faltantes.includes('tasa'))
})

test('la tabla REAL de letras: la Lecap entra al universo de tesorería con su TNA', () => {
  const { instrumentos } = extraerDeTabla(TABLA_LETRAS_REAL, { url: '/app/cotizaciones/letras' })
  const [s14g6] = instrumentos
  assert.equal(s14g6.ticker, 'S14G6')
  assert.equal(s14g6.categoria, 'lecap')
  assert.equal(esAptoTesoreria(s14g6.categoria), true)
  assert.equal(s14g6.tasa.tipo, 'tna')
  assert.ok(Math.abs(s14g6.tasa.valor - 0.2316) < 1e-9)
  assert.equal(s14g6.moneda, 'ARS')
})

test('la tabla REAL de cauciones: la de dólares es USD y rinde 2,11%, no 211%', () => {
  const { instrumentos } = extraerDeTabla(TABLA_CAUCIONES_REAL, { url: '/app/cotizaciones/cauciones' })
  const [dolar, pesos] = instrumentos
  // Las dos trampas de esta pantalla juntas: la tasa viene con punto decimal y SIN signo %, y la
  // moneda no tiene columna. Antes: caución en dólares al 211% TNA etiquetada en pesos. Con el
  // descubierto al 62,78%, una tasa así habría ganado cualquier ranking.
  assert.equal(dolar.moneda, 'USD')
  assert.ok(Math.abs(dolar.tasa.valor - 0.0211) < 1e-9, `TNA leída: ${dolar.tasa.valor}`)
  assert.equal(pesos.moneda, 'ARS')
  assert.ok(Math.abs(pesos.tasa.valor - 0.10) < 1e-9)
  assert.equal(pesos.categoria, 'caucion')
})

test('las variaciones de un fondo NO son su tasa: sólo el rótulo TNA lo es', () => {
  // La tarjeta real de Balanz, tal como la devuelve `leerTarjetasDeFondos`. En la pantalla del
  // 02/08/2026 sólo 2 de 10 fondos declaraban TNA; los otros ocho traen únicamente variaciones
  // pasadas. Anualizar el "Anual 44,21%" de un fondo de renta fija y llamarlo tasa sería fabricar
  // una expectativa: el número es plausible, entra al ranking y gana.
  const TARJETAS_REALES = [
    {
      nombre: 'Money Market Pesos', plazo_rescate_texto: 'Inmediato', moneda_texto: 'ARS',
      perfil: 'Conservador', tipo: 'Mercado de Dinero', horizonte: 'Corto plazo',
      tna_texto: 'TNA: +17,81%',
      variaciones: { diaria: '0,05%', semanal: '0,32%', mensual: '1,40%', anual: '28,17%' },
    },
    {
      nombre: 'Ahorro corto plazo', plazo_rescate_texto: '24hs', moneda_texto: 'ARS',
      perfil: 'Conservador', tipo: 'Renta Fija', horizonte: 'Corto plazo',
      tna_texto: null,
      variaciones: { diaria: '0,20%', semanal: '0,25%', mensual: '1,76%', anual: '44,21%' },
    },
    {
      nombre: 'Crédito Privado', plazo_rescate_texto: '24hs', moneda_texto: 'ARS',
      perfil: 'Moderado', tipo: 'Renta Fija', horizonte: 'Corto plazo',
      tna_texto: null,
      variaciones: { diaria: '0,11%', semanal: '0,47%', mensual: '2,06%', anual: '-' },
    },
  ]
  const inst = extraerDeTarjetas(TARJETAS_REALES, { url: '/app/cotizaciones/fondos' })
  assert.equal(inst.length, 3)

  const [mm, ahorro, credito] = inst
  assert.equal(mm.categoria, 'money_market', 'la categoría sale del campo "Tipo" de la tarjeta')
  assert.equal(mm.tasa.tipo, 'tna')
  assert.ok(Math.abs(mm.tasa.valor - 0.1781) < 1e-9)
  assert.equal(mm.plazo_rescate_dias, 0, '"Inmediato" es rescate a 0 días')
  assert.equal(mm.riesgo_declarado, 'Conservador')

  // EL CASO QUE IMPORTA: 44,21% anual a la vista y NINGUNA tasa.
  assert.equal(ahorro.tasa, null, 'un rendimiento histórico no puede convertirse en tasa')
  assert.ok(ahorro.campos_faltantes.includes('tasa_no_declarada_en_pantalla'))
  assert.equal(ahorro.variaciones_historicas.anual, '44,21%', 'pero el histórico se conserva como evidencia')
  assert.equal(ahorro.plazo_rescate_dias, 1, '"24hs" es rescate a 1 día')
  assert.equal(ahorro.categoria, 'fci_renta_fija')

  // Y un "-" en la variación anual sigue siendo un guion, no un cero.
  assert.equal(credito.variaciones_historicas.anual, '-')
  assert.equal(credito.tasa, null)
})

test('82 cauciones distintas no pueden compartir el mismo id', () => {
  // ═══ EL DEFECTO ═══
  // La pantalla real devuelve 164 filas de caución y TODAS se llaman igual: el "ticker" es PESOS o
  // DOLAR, y lo que las distingue es el plazo. Con el id armado sólo desde el ticker, 82 cauciones
  // de pesos —de 3 a 90 días, del 10% al 17% TNA— colapsaban en un único `bz_pesos`. Y el id es la
  // clave con la que el ledger guarda las observaciones y con la que se arma la clave estable de una
  // recomendación: 82 tasas escribiéndose sobre la misma fila, y una propuesta aprobada "a la
  // caución en pesos" sin poder decir a qué plazo.
  const TABLA = {
    cabecera: ['Ticker', 'Nombre', 'Plazo', 'Hora', 'TNA', 'Var(%)', 'Var', 'Volumen'],
    filas: [
      ['PESOS', 'CAUCION PESOS', '72hs', '31/07/2026', '10', '0,00%', '0,00', '8.449.076.556.363'],
      ['PESOS', 'CAUCION PESOS', '96hs', '31/07/2026', '14,50', '0,00%', '0,00', '1.000'],
      ['PESOS', 'CAUCION PESOS', '120hs', '31/07/2026', '15,10', '0,00%', '0,00', '1.000'],
    ],
  }
  const { instrumentos } = extraerDeTabla(TABLA, { url: '/app/cotizaciones/cauciones' })
  const ids = instrumentos.map((i) => i.id)
  assert.equal(new Set(ids).size, 3, `ids colisionados: ${ids.join(', ')}`)

  // Y en una caución, la columna "Plazo" ES cuándo vuelve la plata. Sin esto las 82 quedaban
  // excluidas por "no se conoce el plazo de rescate" — el instrumento de corto plazo más usado del
  // mercado local, descartado entero por un campo que la pantalla sí declara.
  assert.deepEqual(instrumentos.map((i) => i.plazo_rescate_dias), [3, 4, 5])
  assert.ok(Math.abs(instrumentos[1].tasa.valor - 0.145) < 1e-9)
})

test('en una LETRA el "Plazo" es liquidación, y el rescate queda en null declarado', () => {
  // El otro lado del mismo criterio. En una letra "24hs" es cuándo se liquida la compra, no cuándo
  // vuelve el capital: eso pasa al VENCIMIENTO, que esta tabla no trae como columna. Inferirlo del
  // nombre ("VTO. 14/08/2026") sería adivinar una fecha que decide una inversión.
  const TABLA = {
    cabecera: ['Ticker', 'Nombre', 'Plazo', 'Hora', 'Precio', 'Var(%)', 'Var', 'TNA', 'Volumen'],
    filas: [['S14G6', 'LETRA DEL TESORO NACIONAL CAPITALIZABLE EN PESOS VTO. 14/08/2026', '24hs', '31/07/2026', '1,0727', '0,00%', '0,00', '23,16%', '49.128.611.494']],
  }
  const [l] = extraerDeTabla(TABLA, { url: '/app/cotizaciones/letras' }).instrumentos
  assert.equal(l.liquidacion_dias, 1, 'la liquidación sí sale de "24hs"')
  assert.equal(l.plazo_rescate_dias, null, 'el rescate NO se inventa desde la liquidación')
  assert.ok(l.campos_faltantes.includes('plazo_rescate_dias'), 'y se declara faltante')
})

// ════════════════════════════════════════════════════════════════════════════
// LOS HALLAZGOS DE LA AUDITORÍA DE CIERRE
// ════════════════════════════════════════════════════════════════════════════

test('BLOQUEANTE · la frescura no puede medirse contra el reloj del propio proceso', () => {
  // ═══ EL DEFECTO ═══
  // Los tres extractores estampaban `observado_en = ahora` y `frescuraDeMercado` medía la antigüedad
  // contra ese mismo `ahora`: devolvía 0,0 h SIEMPRE. Un control comparándose contra la información
  // que él mismo produce — un espejo. Con eso, un solo candidato parseado (incluso una línea del
  // ticker de la portada) certificaba "mercado fresco" y la compuerta quedaba abierta para siempre.
  const ahora = new Date('2026-08-02T12:00:00Z')
  const reciénLeído = { observado_en: ahora.toISOString(), cotizado_en: null }
  const f = frescuraDeMercado([reciénLeído], ahora)
  assert.equal(f.fresco, false, 'leerlo recién no lo hace fresco: lo hace fresco que el mercado lo haya cotizado recién')
  assert.equal(f.sin_fecha, 1)

  // Y el dato existe en la pantalla: es la columna "Hora", que se estaba tirando.
  const TABLA = {
    cabecera: ['Ticker', 'Nombre', 'Plazo', 'Hora', 'TNA', 'Var(%)', 'Var', 'Volumen'],
    filas: [['DOLAR', 'DOLARES', '72hs', '05/05/2026', '2.5', '0,00%', '0,00', '1.000']],
  }
  const [viejo] = extraerDeTabla(TABLA, { url: '/x', observadoEn: ahora.toISOString() }).instrumentos
  assert.equal(viejo.cotizado_en, cotizadoEn('05/05/2026'))
  assert.equal(frescuraDeMercado([viejo], ahora).fresco, false, 'una cotización de hace tres meses no es fresca')
  // Que es exactamente lo que pasaba en la pantalla real: 114 de 164 cauciones cotizaban en otra
  // fecha y todas se informaban como "de hace 0,0 horas".
})

test('cotizadoEn lee la fecha de la pantalla y devuelve null cuando no la hay', () => {
  assert.equal(cotizadoEn('31/07/2026').slice(0, 10), '2026-07-31')
  assert.equal(cotizadoEn('5/5/26').slice(0, 10), '2026-05-05')
  assert.equal(cotizadoEn('-'), null, 'un guion no es una fecha, y tampoco es hoy')
  assert.equal(cotizadoEn(''), null)
  assert.equal(cotizadoEn(null), null)
  assert.equal(cotizadoEn('no es fecha'), null)
})

test('ALTO · una moneda ASUMIDA no compite: el campo faltante ahora excluye de verdad', () => {
  // El comentario del extractor prometía que el instrumento quedaba "fuera del ranking" y
  // `moneda_no_declarada_en_pantalla` no lo leía nadie: aparecía una sola vez en el repo, donde se
  // escribe. En la tabla real de letras son 52 de 65 sin columna de moneda, y entre ellas la punta
  // en dólares de una especie que también cotiza en pesos: entraría a una ventana en pesos con una
  // tasa en dólares, que es el error que `comparar.mjs` declara como el más caro posible.
  const inst = normalizarInstrumento({
    nombre: 'LETRA CAPITALIZABLE', moneda: 'ARS', plazo_rescate_dias: 0, liquidacion_dias: 1,
    tasa: { tipo: 'tea', valor: 1.2, naturaleza: 'indicativa' }, costos: { comision: 0 }, emisor: 'Tesoro',
    cotizado_en: HOY.toISOString(), campos_faltantes: ['moneda_no_declarada_en_pantalla'],
  }, { observadoEn: HOY.toISOString() })
  const r = evaluarContraVentana(inst, {
    bloque: 'C', moneda: 'ARS', dias_libres: 30, monto_maximo: 1e6, referencia: { hurdle_periodo: 0 },
  }, { valor: 0.6278 })
  assert.equal(r.excluido, true)
  assert.match(r.motivo, /no declara la moneda/)
})

test('MEDIO · el plazo de la caución no se cuenta dos veces', () => {
  // `liquidezCompatible` SUMA rescate + liquidación. Escribir la columna "Plazo" en los dos campos
  // duplicaba el tiempo: una caución a 20 días se informaba como "vuelve en 40" y quedaba excluida
  // de una ventana de 30 en la que entra, con un motivo además falso.
  const TABLA = {
    cabecera: ['Ticker', 'Nombre', 'Plazo', 'Hora', 'TNA', 'Var(%)', 'Var', 'Volumen'],
    filas: [['PESOS', 'CAUCION PESOS', '20 días', '31/07/2026', '25,00', '0,00%', '0,00', '1.000']],
  }
  const [c] = extraerDeTabla(TABLA, { url: '/x', observadoEn: HOY.toISOString() }).instrumentos
  assert.equal(c.plazo_rescate_dias, 20)
  assert.equal(c.liquidacion_dias, 0, 'el plazo ya se contó como rescate: la liquidación no lo repite')
  assert.equal(liquidezCompatible(c, 30).compatible, true, 'una caución a 20 días entra en una ventana de 30')
  // Y el id sigue distinguiendo por plazo aunque la liquidación sea 0 — el arreglo de arriba había
  // reintroducido la colisión (`bz_pesos-0d` para las 82).
  const dos = extraerDeTabla({
    cabecera: TABLA.cabecera,
    filas: [TABLA.filas[0], ['PESOS', 'CAUCION PESOS', '30 días', '31/07/2026', '26,00', '0,00%', '0,00', '1.000']],
  }, { url: '/x', observadoEn: HOY.toISOString() }).instrumentos
  assert.notEqual(dos[0].id, dos[1].id)
})

test('ALTO · un relevamiento truncado no habilita a accionar', () => {
  // El flag `relevamiento_completo` existía y no llegaba a ninguna decisión: no bajaba la confianza,
  // no salía en el mensaje, no quedaba en la traza. En la corrida real corporativos y cedears
  // agotaron el tope con 320 filas cada uno — el ciclo habría elegido "la mejor alternativa del
  // mercado" sobre un universo cortado, sin una sola marca.
  const base = {
    reserva: { estado: 'aprobada', monto: 1e6, aprobador: 'Jorge' },
    restringida: { bloquea_accionable: false },
    extractorValidado: true,
    mercadoFresco: true,
  }
  assert.equal(evaluarAccionabilidad({ ...base, mercadoCompleto: true }).accionable, true)
  const parcial = evaluarAccionabilidad({ ...base, mercadoCompleto: false })
  assert.equal(parcial.accionable, false)
  assert.ok(parcial.bloqueos.some((b) => /truncado/.test(b)))
})

test('el unit del Tesorero carga el archivo donde vive el token del bot', () => {
  // ═══ EL DEFECTO, ENCONTRADO AL DESPLEGAR ═══
  //
  // `ciclo-tesorero.mjs` resuelve el cliente de Mattermost con `resolverCliente()`, que falla CERRADO
  // si falta `MM_BOT_TOKEN` —nunca cae a un Fake—. Esa variable vive en `comunicacion.env`, y el unit
  // sólo cargaba `worker.env`. La primera corrida productiva murió con:
  //
  //   [tesorero] error: conector: cliente Mattermost REAL requerido — falta MM_BOT_TOKEN (fail-closed)
  //
  // El agente no habría publicado nunca, y habría fallado igual cada mañana a las 09:15. Ningún test
  // lo cubría porque el ciclo se prueba con un publicador inyectado.
  const unit = readFileSync(join(DIR, '..', '..', 'systemd', 'echegaray-tesorero.service'), 'utf8')
  assert.match(unit, /EnvironmentFile=.*worker\.env/, 'sin worker.env no hay DATABASE_URL')
  assert.match(unit, /EnvironmentFile=-?.*comunicacion\.env/, 'sin comunicacion.env el agente no puede publicar')
  // Y el timer NO se habilita solo: encenderlo es una decisión aparte y deliberada.
  const install = readFileSync(join(DIR, '..', '..', 'systemd', 'install.sh'), 'utf8')
  assert.ok(!/^\s*systemctl\s+--user\s+enable[^\n]*tesorero/m.test(install),
    'el instalador NO puede encender el timer del Tesorero por su cuenta')
})
