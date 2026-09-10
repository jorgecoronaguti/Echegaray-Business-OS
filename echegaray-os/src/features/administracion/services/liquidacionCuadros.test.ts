import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quincenaDe } from './quincena.ts'
import {
  armarCuadros, girosDe, periodoDeRecibo,
  type DatosDeCuadros, type FilaAdelanto, type FilaTarifa, type PersonaDeLiquidacion,
} from './liquidacionCuadros.ts'
import { estadoDeCierre } from './liquidacionCierre.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//  1. Que la misma persona aparezca en dos cuadros con dos importes. Es cómo se paga dos veces, y
//     ya pasó en producción el 31/08/2026 con Jofre y Sosa (quincena Y liquidación final).
//  2. Que un giro de $200.000 redondos —un adelanto— se lea como el pago del recibo. El lote se
//     reconoce por el IMPORTE, que coincide peso por peso con el neto; la fecha sola no distingue.
//  3. Que el cuadro se llene de gente que no cobra esta quincena, y «sin tarifa» deje de señalar el
//     caso que hay que resolver antes de pagar.

const Q = quincenaDe('2026-09-05')

const persona = (id: string, nombre: string, cuil: string | null): PersonaDeLiquidacion =>
  ({ id, nombre, cuil, enLaEmpresa: true })

const porHora = (persona_id: string, valor_hora: number): FilaTarifa =>
  ({ persona_id, desde: '2026-09-01', valor_hora, neto_mensual: null, origen: 'sheet:_J_OBREROS' })

const base = (extra: Partial<DatosDeCuadros> = {}): DatosDeCuadros => ({
  quincena: Q,
  personas: [],
  tarifas: [],
  horas: new Map(),
  recibos: [],
  adelantos: [],
  redondeos: new Map(),
  ...extra,
})

test('el período del recibo se arma de la quincena, no de la fecha de hoy', () => {
  assert.equal(periodoDeRecibo(quincenaDe('2026-09-05')), 'Q1-09/2026')
  assert.equal(periodoDeRecibo(quincenaDe('2026-09-20')), 'Q2-09/2026')
  assert.equal(periodoDeRecibo(quincenaDe('2026-12-31')), 'Q2-12/2026')
})

test('el giro que coincide con el recibo es el LOTE; el de $200.000 redondos no', () => {
  const adelantos: FilaAdelanto[] = [
    { cuil: '20', fecha: '2026-09-03', importe: 200000, concepto: 'QUINCENA' },
    { cuil: '20', fecha: '2026-09-12', importe: 192887.48, concepto: 'QUINCENA' },
  ]
  const g = girosDe(Q, adelantos, '20', 'QUINCENA', 192887.48)
  assert.equal(g.giroEnElLote, true)
  assert.equal(g.yaTransferido, 200000, 'el redondo es lo que ya había salido antes')
})

test('sin recibo no hay lote: TODO lo girado es «ya transferido»', () => {
  const g = girosDe(
    Q, [{ cuil: '20', fecha: '2026-09-03', importe: 200000, concepto: 'QUINCENA' }], '20', 'QUINCENA', null,
  )
  assert.equal(g.giroEnElLote, false)
  assert.equal(g.yaTransferido, 200000)
})

test('dos giros del mismo importe que el recibo: uno es el lote, el otro no', () => {
  const g = girosDe(Q, [
    { cuil: '20', fecha: '2026-09-12', importe: 100, concepto: 'QUINCENA' },
    { cuil: '20', fecha: '2026-09-13', importe: 100, concepto: 'QUINCENA' },
  ], '20', 'QUINCENA', 100)
  assert.equal(g.giroEnElLote, true)
  assert.equal(g.yaTransferido, 100, 'el segundo NO paga el mismo recibo otra vez')
})

test('los giros de otro concepto no se mezclan', () => {
  const g = girosDe(Q, [
    { cuil: '20', fecha: '2026-09-03', importe: 300000, concepto: 'LIQUIDACION_FINAL' },
  ], '20', 'QUINCENA', null)
  assert.equal(g.yaTransferido, 0, 'lo de una liquidación final no se resta de la quincena')
})

test('quien tiene liquidación final en la ventana NO aparece también en el cuadro de obreros', () => {
  const cuadros = armarCuadros(base({
    personas: [persona('p1', 'JOFRE ALBERTO ISMAEL', '203')],
    tarifas: [porHora('p1', 5000)],
    horas: new Map([['p1', { horas: 46, presentesSinHoras: 0 }]]),
    recibos: [{ cuil: '203', periodo: 'FINAL', neto: 330430.68, fecha_pago: '2026-09-04' }],
    adelantos: [{ cuil: '203', fecha: '2026-09-02', importe: 300000, concepto: 'LIQUIDACION_FINAL' }],
  }))
  const obreros = cuadros.find((c) => c.grupo === 'obreros')!
  const final = cuadros.find((c) => c.grupo === 'final')!
  assert.equal(obreros.lineas.length, 0, 'tener horas no es cobrar la quincena')
  assert.equal(final.lineas.length, 1)
  assert.equal(final.lineas[0].cobra, 660861.36, 'la mitad blanca por dos')
  assert.equal(final.lineas[0].yaTransferido, 300000)
  assert.equal(final.lineas[0].total, 360861.36)
})

test('oficina va a su cuadro por tener neto mensual, aunque tenga horas cargadas', () => {
  const cuadros = armarCuadros(base({
    personas: [persona('o1', 'MALDONADO BATISTA EMILIANO MIGUEL', '203592')],
    tarifas: [{
      persona_id: 'o1', desde: '2026-09-01', valor_hora: null, neto_mensual: 1800000,
      origen: 'acuerdo:SUELDO_NETO_OFICINA',
    }],
    horas: new Map([['o1', { horas: 80, presentesSinHoras: 0 }]]),
  }))
  const linea = cuadros.find((c) => c.grupo === 'oficina')!.lineas[0]
  assert.equal(linea.cobra, 1800000)
  // LAS HORAS NO SE PUBLICAN EN OFICINA. Maldonado tiene asistencia cargada como todos, pero su
  // sueldo no sale de multiplicarlas: «80 h» al lado de $1.800.000 invita a una cuenta que no existe.
  assert.equal(linea.horas, null)
  assert.equal(cuadros.find((c) => c.grupo === 'obreros')!.lineas.length, 0)
})

test('quien no tiene tarifa por hora NI movimiento en la ventana no es una fila vacía', () => {
  const cuadros = armarCuadros(base({
    personas: [persona('p9', 'ALGUIEN QUE NO COBRA ESTA QUINCENA', '999')],
  }))
  assert.equal(cuadros.find((c) => c.grupo === 'obreros')!.lineas.length, 0)
})

test('el que TIENE horas y no tiene tarifa sí entra, y la fila dice «sin tarifa»', () => {
  const cuadros = armarCuadros(base({
    personas: [persona('p8', 'CASTILLO CARLOS', null)],
    horas: new Map([['p8', { horas: 115, presentesSinHoras: 2 }]]),
  }))
  const obreros = cuadros.find((c) => c.grupo === 'obreros')!
  assert.equal(obreros.lineas.length, 1)
  assert.equal(obreros.lineas[0].sinTarifa, true)
  assert.equal(obreros.lineas[0].cobra, null, 'nunca $ 0')
  assert.equal(obreros.presentesSinHoras, 2)
})

test('el adelanto en efectivo se declara SIN FUENTE en los tres cuadros', () => {
  // nomina_adelanto es una fila por movimiento BANCARIO: el efectivo entregado en mano no deja
  // movimiento. Si esta declaración desaparece, la pantalla resta un cero mudo y paga de más.
  for (const c of armarCuadros(base())) assert.equal(c.adelantoSinFuente, true, c.grupo)
})

test('el redondeo guardado viaja a la línea y no toca el efectivo calculado', () => {
  const cuadros = armarCuadros(base({
    personas: [persona('p1', 'AGUERO CRISTIAN', '202')],
    tarifas: [porHora('p1', 5974)],
    horas: new Map([['p1', { horas: 116, presentesSinHoras: 0 }]]),
    redondeos: new Map([['p1', 412000]]),
  }))
  const l = cuadros.find((c) => c.grupo === 'obreros')!.lineas[0]
  assert.equal(l.cobra, 692984)
  assert.equal(l.enEfectivo, 692984)
  assert.equal(l.efectivoRedondeado, 412000)
})

// ═══ LA QUINCENA REAL TIENE OFICINA, Y CON OFICINA EL CIERRE NO SE HABILITABA ═══
//
// Este test recorre la cadena entera —personas + tarifas + horas → `armarCuadros` →
// `estadoDeCierre`— porque el defecto no se veía en ninguna de las dos puntas por separado: los
// cuadros armaban bien la línea de Oficina (COBRA = el neto) y el cierre la rechazaba igual por no
// tener valor hora. Si se revierte el arreglo, esto se pone rojo.

const mensual = (persona_id: string, neto_mensual: number): FilaTarifa =>
  ({ persona_id, desde: '2026-09-01', valor_hora: null, neto_mensual, origen: 'acuerdo con el dueño' })

test('con una persona de Oficina (neto mensual) la quincena PUEDE cerrar', () => {
  const cuadros = armarCuadros(base({
    personas: [persona('p1', 'Aguero Cristian', '20'), persona('o1', 'Maldonado Ana Laura', '27')],
    tarifas: [porHora('p1', 5250), mensual('o1', 1800000)],
    horas: new Map([['p1', { horas: 96, presentesSinHoras: 0 }]]),
  }))
  const oficina = cuadros.find((c) => c.grupo === 'oficina')!
  assert.equal(oficina.lineas.length, 1)
  assert.equal(oficina.lineas[0].valorHora, null, 'Oficina no tiene valor hora: cobra un neto')
  assert.equal(oficina.lineas[0].netoMensual, 1800000)
  assert.equal(oficina.lineas[0].sinTarifa, false, 'un neto mensual cargado ES una tarifa')

  const e = estadoDeCierre(cuadros.flatMap((c) => c.lineas))
  assert.equal(e.puedeCerrar, true, e.pendientes.map((x) => x.texto).join(' · '))
  assert.equal(e.personas, 2)
  assert.equal(e.totalSellado, 2304000)
})

test('la misma persona de Oficina SIN tarifa cargada bloquea el cierre por «sin tarifa»', () => {
  const cuadros = armarCuadros(base({
    personas: [persona('p1', 'Aguero Cristian', '20'), persona('o1', 'Maldonado Ana Laura', '27')],
    tarifas: [porHora('p1', 5250)],
    horas: new Map([
      ['p1', { horas: 96, presentesSinHoras: 0 }],
      ['o1', { horas: 90, presentesSinHoras: 0 }],
    ]),
  }))
  const e = estadoDeCierre(cuadros.flatMap((c) => c.lineas))
  assert.equal(e.puedeCerrar, false)
  assert.equal(e.pendientes[0].clave, 'sin-tarifa')
  assert.match(e.pendientes[0].texto, /Maldonado Ana Laura/)
})
