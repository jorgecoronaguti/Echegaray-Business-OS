// LA DERIVACIÓN — el defecto que atrapan estos tests: publicar un monto de plata sin la cuenta que
// lo produce. El dueño rechazó tres informes por esto.
//
// Si alguien saca la derivación de la ventana, o la deja de cerrar contra el monto publicado, o borra
// la explicación de por qué la ventana larga tiene menos, estos tests se ponen rojos.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  derivacionDeVentana, origenDeMovimiento, agruparMovimientos, porQueBajaConElPlazo,
} from './derivacion-excedente.mjs'
import { saldoCorrido, ventanaDeExcedente, excedentePorVentana } from './excedente-ventana.mjs'
import { formatoDerivacion, formatoExcedentePorPlazo } from './formato-mattermost.mjs'

/**
 * Un calendario chico pero con la forma del real: un pago grande temprano (el que hunde el piso) y
 * cobranzas después. Es el patrón medido el 03/08/2026 — los cheques de Alumetal el 05/08.
 */
function calendario(n = 91) {
  const dias = []
  for (let i = 0; i < n; i += 1) {
    const fecha = new Date(Date.UTC(2026, 7, 3 + i)).toISOString().slice(0, 10)
    const movimientos = []
    if (i === 2) movimientos.push({ tipo: 'egreso', monto: 42372423, categoria: 'cheque', origen: 'Cheques Emitidos', proveedor: 'Alumetal' })
    if (i === 20) movimientos.push({ tipo: 'ingreso', monto: 26468251, categoria: 'cobranza', origen: 'Cobranzas (Cash Flow)', cliente: 'ARCOR' })
    if (i === 45) movimientos.push({ tipo: 'egreso', monto: 7139352, categoria: 'impuesto', origen: 'Compras (pendiente de pago)', detalle: 'IVA' })
    if (i === 60) movimientos.push({ tipo: 'ingreso', monto: 42561885, categoria: 'cobranza', origen: 'Cobranzas (Cash Flow)', cliente: 'ARCOR' })
    dias.push({
      fecha,
      ingresos: movimientos.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0),
      egresos: movimientos.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0),
      movimientos,
    })
  }
  return dias
}

const INSUMOS = {
  saldoInicial: 97738164, vencido: 0, valoresADepositar: 10290000, diasAcreditacion: 3,
  reserva: 41004461, restringidaFueraDelCalendario: 0, factorIngresos: 0.5,
}

test('DEFECTO · el monto publicado ahora viene con su cuenta, y la cuenta CIERRA', () => {
  const dias = calendario()
  const v = ventanaDeExcedente({ ...INSUMOS, dias, hasta: 90 })
  assert.equal(v.estado, 'ok')
  assert.equal(v.derivacion.estado, 'ok', 'la ventana tiene que traer su derivación')
  // La identidad exacta: Σ(términos) = piso, y piso − restringida − reserva = el monto que se publica.
  assert.equal(v.derivacion.chequeo.coincide, true,
    `los términos suman ${v.derivacion.chequeo.suma_terminos} y el piso es ${v.derivacion.chequeo.piso}`)
  assert.equal(v.derivacion.chequeo.monto_coincide, true)
  assert.equal(v.derivacion.monto_maximo, v.monto_maximo)
})

test('cada término lleva la coordenada donde ir a mirarlo: pestaña y criterio', () => {
  const dias = calendario()
  const v = ventanaDeExcedente({ ...INSUMOS, dias, hasta: 90 })
  for (const t of v.derivacion.terminos) {
    assert.ok(t.origen?.fuente, `el término "${t.concepto}" no dice de dónde sale`)
    assert.ok(t.origen?.criterio, `el término "${t.concepto}" no dice con qué criterio se filtró`)
  }
  const cheques = v.derivacion.terminos.find((t) => /cheques firmados/.test(t.concepto))
  assert.equal(cheques.origen.pestana, 'Cheques Emitidos')
  assert.match(cheques.origen.criterio, /DEBITADO/)
  const caja = v.derivacion.terminos.find((t) => /caja líquida/.test(t.concepto))
  assert.equal(caja.origen.pestana, 'CAJA')
})

test('el escenario adverso castiga SÓLO las cobranzas, y el cuadro lo dice', () => {
  const dias = calendario()
  const v = ventanaDeExcedente({ ...INSUMOS, dias, hasta: 90, factorIngresos: 0.5 })
  const cobranza = v.derivacion.terminos.find((t) => /cobranzas/.test(t.concepto))
  if (cobranza) {
    assert.equal(cobranza.monto, Math.round(cobranza.bruto * 0.5))
    assert.match(cobranza.concepto, /50%/)
  }
  const egreso = v.derivacion.terminos.find((t) => t.signo === '−' && t.bruto)
  assert.equal(egreso.monto, -egreso.bruto, 'un egreso no se paga a la mitad')
})

test('DEFECTO · por qué a 90 días hay MENOS que a 1 día — sin esto parece un error del sistema', () => {
  const dias = calendario()
  const vs = excedentePorVentana({ ...INSUMOS, dias, ventanas: [1, 30, 90] })
  const por = porQueBajaConElPlazo(vs)
  assert.equal(por.hay_caida, true)
  assert.ok(por.caida > 0)
  // La caída tiene que estar EXPLICADA por el día de tensión, no sólo enunciada.
  assert.match(por.texto, /2026-08-05/)
  assert.match(por.texto, /no es un error/)
  // Y el piso sólo puede bajar con el plazo: la ventana larga contiene a la corta.
  const pisos = vs.map((v) => v.piso)
  for (let i = 1; i < pisos.length; i += 1) assert.ok(pisos[i] <= pisos[i - 1])
})

test('el índice del día de tensión existe: sin él la suma se corre un día y el cuadro no cierra', () => {
  const dias = calendario()
  const c = saldoCorrido({ ...INSUMOS, dias, hasta: 90 })
  assert.equal(Number.isInteger(c.indice_tension), true)
  assert.equal(dias[c.indice_tension].fecha, c.fecha_tension)
})

test('el peor momento ANTES de que se mueva un peso también cierra (índice −1)', () => {
  // Un calendario que sólo suma: el piso es el saldo de arranque y no hay ningún movimiento adentro.
  const dias = Array.from({ length: 31 }, (_, i) => ({
    fecha: `2026-08-${String(3 + i).padStart(2, '0')}`, ingresos: 1000, egresos: 0,
    movimientos: [{ tipo: 'ingreso', monto: 1000, categoria: 'cobranza', origen: 'Cobranzas (Cash Flow)' }],
  }))
  const v = ventanaDeExcedente({ dias, hasta: 30, saldoInicial: 1e6, reserva: 0, factorIngresos: 1 })
  assert.equal(v.derivacion.indice_tension, -1)
  assert.equal(v.derivacion.chequeo.coincide, true)
  assert.equal(v.derivacion.chequeo.monto_coincide, true)
})

test('un descuadre entre el detalle y el total diario se DECLARA, no se tapa', () => {
  const dias = [{ fecha: '2026-08-03', ingresos: 0, egresos: 5000, movimientos: [] }] // egreso sin movimiento
  for (let i = 1; i <= 30; i += 1) dias.push({ fecha: `2026-09-${String(i).padStart(2, '0')}`, ingresos: 0, egresos: 0, movimientos: [] })
  const v = ventanaDeExcedente({ dias, hasta: 30, saldoInicial: 1e6, reserva: 0 })
  assert.notEqual(v.derivacion.chequeo.descuadre_calendario, 0)
  assert.ok(v.derivacion.terminos.some((t) => /DESCUADRE/.test(t.concepto)))
  // Y aun con descuadre declarado, el cuadro cierra contra el piso: el término lo absorbe explícito.
  assert.equal(v.derivacion.chequeo.coincide, true)
})

test('el mensaje publica la derivación, no sólo el resultado', () => {
  const dias = calendario()
  const vs = excedentePorVentana({ ...INSUMOS, dias, ventanas: [30, 90] })
  const texto = formatoExcedentePorPlazo({
    ventanas_por_plazo: vs, reserva_preservada: INSUMOS.reserva,
    por_que_baja_con_el_plazo: porQueBajaConElPlazo(vs),
  })
  assert.match(texto, /Cómo se determina el colocable/)
  assert.match(texto, /caja líquida en pesos/)
  assert.match(texto, /reserva mínima aprobada/)
  assert.match(texto, /Cheques Emitidos/)
})

test('si el cuadro NO cierra, el mensaje lo grita en vez de publicar un número sin defensa', () => {
  const roto = {
    estado: 'ok', dias: 30, terminos: [{ signo: '+', concepto: 'caja', monto: 100, origen: { fuente: 'CAJA', criterio: 'x' } }],
    cierre: [], chequeo: { suma_terminos: 100, piso: 999, coincide: false, monto_coincide: false },
    resto_de_la_ventana: { neto_al_vencimiento: 0, nota: 'x' },
  }
  assert.match(formatoDerivacion(roto), /EL CUADRO NO CIERRA/)
})

test('DEFECTO · lo vencido se abre por fuente: mandar a Compras un número de Postgres es peor que no dar coordenada', () => {
  // Encontrado contra la corrida real del 03/08/2026: los $4.700.000 de caja comprometida salían de
  // `obligacion_resumen` y el cuadro los atribuía a Compras, que no tenía una sola fila vencida.
  const dias = calendario()
  const v = ventanaDeExcedente({
    ...INSUMOS, dias, hasta: 90, vencido: 4700000,
    vencidoDetalle: { vencido_fiscal: 4700000, vencido_comercial: 0 },
  })
  const fiscal = v.derivacion.terminos.find((t) => /obligaciones fiscales y laborales ya vencidas/.test(t.concepto))
  assert.ok(fiscal, 'falta el término de lo vencido fiscal')
  assert.equal(fiscal.origen.fuente, 'Postgres')
  assert.match(fiscal.origen.criterio, /obligacion_resumen/)
  assert.equal(v.derivacion.terminos.some((t) => /deuda comercial vencida/.test(t.concepto)), false, 'no hay deuda comercial vencida: no se inventa el término')
  assert.equal(v.derivacion.chequeo.coincide, true)

  // Con las dos fuentes, salen las dos líneas y cada una con su pestaña.
  const dos = ventanaDeExcedente({
    ...INSUMOS, dias, hasta: 90, vencido: 5000000,
    vencidoDetalle: { vencido_fiscal: 3000000, vencido_comercial: 2000000 },
  })
  assert.equal(dos.derivacion.terminos.find((t) => /deuda comercial vencida/.test(t.concepto)).origen.pestana, 'Compras')
  assert.equal(dos.derivacion.chequeo.coincide, true)

  // Y si el desglose no explica el total, el resto NO se reparte a ojo: se declara como no explicado.
  const hueco = ventanaDeExcedente({
    ...INSUMOS, dias, hasta: 90, vencido: 5000000,
    vencidoDetalle: { vencido_fiscal: 1000000, vencido_comercial: 0 },
  })
  const resto = hueco.derivacion.terminos.find((t) => /lo ya vencido y sin pagar/.test(t.concepto))
  assert.equal(resto.monto, -4000000)
  assert.match(resto.origen.criterio, /no explica/)
  assert.equal(hueco.derivacion.chequeo.coincide, true)
})

test('un origen no mapeado se declara DESCONOCIDO en vez de inventarle una pestaña', () => {
  const o = origenDeMovimiento('Planilla nueva de alguien')
  assert.equal(o.fuente, 'DESCONOCIDO')
  assert.equal(o.pestana, null)
  assert.match(o.criterio, /no mapeado/)
})

test('agruparMovimientos reconstruye el agregado del calendario', () => {
  const dias = calendario(10)
  const { agregado, suma_movimientos: suma } = agruparMovimientos(dias, 9, 1)
  assert.equal(agregado, suma)
})

test('sin recorrido válido la derivación dice sin_dato — no devuelve un cuadro vacío que parezca bueno', () => {
  const d = derivacionDeVentana({ corrido: { estado: 'sin_dato', motivo: 'el calendario cubre 3 días' } })
  assert.equal(d.estado, 'sin_dato')
  assert.match(d.motivo, /3 días/)
})
