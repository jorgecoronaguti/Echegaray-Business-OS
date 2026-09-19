// LA REGLA DEL MEDIO DE PAGO CORREGIDO — probada sin base.
//
// MUTACIONES QUE PONEN ESTE ARCHIVO EN ROJO:
//   · tocar una línea marcada «pagada» o con cuentas escritas a mano (es de una persona).
//   · dejar afuera a una línea sin lo pagado registrado (una baja): la decisión es sobre la quincena entera.
//   · escribir otra cosa que banco 0 / efectivo = cobra.
//   · pisar la observación en vez de agregarle la traza, o una traza sin el «antes» de cada línea.
//   · dar por escrito lo que la relectura no confirma.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bancoQueSeCorrige, diferenciasTrasEscribir, observacionDeMedio, planDePagoEnEfectivo } from './liquidacion-medio-de-pago.mjs'

const JUNIO = [
  // registrado por banco (JORNALES): pasa a efectivo por el total
  { persona_id: 'carlos', nombre: 'GONZALEZ CARLOS SAMUEL', cobra: '416000.00', por_banco: '216000.00', pagado_banco: '216000.00', pagado_efectivo: '200000.00', pagada_en: null, formulas: {} },
  // baja, sin lo pagado registrado: entra igual, y la traza lo dice
  { persona_id: 'abel', nombre: 'GONZALES ABEL VALENTIN', cobra: '376000.00', por_banco: '176000.00', pagado_banco: null, pagado_efectivo: null, pagada_en: null, formulas: {} },
  // ya en efectivo por el total: nada que cambiar
  { persona_id: 'aguero', nombre: 'AGUERO CRISTIAN DOMINGO', cobra: '469800.00', por_banco: '0.00', pagado_banco: '0.00', pagado_efectivo: '469800.00', pagada_en: null, formulas: {} },
  // marcada pagada por una persona: no se toca
  { persona_id: 'marcada', nombre: 'MARCADA', cobra: '100000.00', por_banco: '50000.00', pagado_banco: '50000.00', pagado_efectivo: '50000.00', pagada_en: '2026-09-16T10:00:00Z', formulas: {} },
  // con cuentas escritas: no se toca
  { persona_id: 'formula', nombre: 'CON CUENTA', cobra: '100000.00', por_banco: '50000.00', pagado_banco: '50000.00', pagado_efectivo: '50000.00', pagada_en: null, formulas: { pagadoEfectivo: '=25000*2' } },
  // sin cobra: no hay importe que dar por pagado
  { persona_id: 'sincobra', nombre: 'SIN COBRA', cobra: null, por_banco: '0.00', pagado_banco: null, pagado_efectivo: null, pagada_en: null, formulas: {} },
]

test('BANCO → 0 Y EFECTIVO = COBRA, para la registrada y para la baja sin registro; el resto queda como está', () => {
  const plan = planDePagoEnEfectivo(JUNIO)
  assert.deepEqual(plan.cambios.map((c) => c.persona_id), ['carlos', 'abel'])
  const carlos = plan.cambios[0]
  assert.deepEqual(carlos.despues, { pagado_banco: 0, pagado_efectivo: 416000 }, 'MUTACIÓN: otra cosa que banco 0 / efectivo = cobra')
  assert.deepEqual(carlos.antes, { pagado_banco: 216000, pagado_efectivo: 200000, por_banco: 216000 })
  assert.equal(carlos.sinRegistroPrevio, false)
  const abel = plan.cambios[1]
  assert.deepEqual(abel.despues, { pagado_banco: 0, pagado_efectivo: 376000 })
  assert.equal(abel.sinRegistroPrevio, true, 'la baja sin registro se dice como tal')
  assert.deepEqual(plan.sinCambio.map((x) => x.persona_id), ['aguero'])
  assert.deepEqual(plan.noSeTocan.map((x) => x.persona_id), ['marcada', 'formula', 'sincobra'], 'MUTACIÓN: pisar lo que escribió una persona')
  assert.match(plan.noSeTocan[0].motivo, /marcada pagada el 2026-09-16/)
  // EL BANCO QUE SE CORRIGE: lo registrado en Carlos, la foto en Abel (que no tenía registro).
  assert.equal(bancoQueSeCorrige(plan), 392000)
})

test('LA TRAZA SE AGREGA A LA OBSERVACIÓN Y DICE EL ANTES DE CADA LÍNEA', () => {
  const plan = planDePagoEnEfectivo(JUNIO)
  const antes = "Cargada desde JORNALES 'Obreros 26'. Pagado completado desde JORNALES el 17/9/2026."
  const obs = observacionDeMedio(antes, plan, { fecha: '2026-09-18', motivo: 'decisión del dueño 18/09' })
  assert.ok(obs.startsWith(antes), 'MUTACIÓN: pisar la observación borra la historia de la carga')
  assert.match(obs, /corregido el 18\/9\/2026 por decisión del dueño 18\/09/)
  assert.match(obs, /se pagó en EFECTIVO, no por banco/)
  assert.match(obs, /en 2 línea\(s\); banco corregido \$392\.000/)
  assert.match(obs, /GONZALEZ CARLOS SAMUEL: banco \$216\.000 → \$0, efectivo \$200\.000 → \$416\.000/)
  assert.match(obs, /GONZALES ABEL VALENTIN: banco \$176\.000 → \$0, efectivo sin registro → \$376\.000 \(sin registro previo\)/)
  assert.match(obs, /La foto sellada \(por_banco, en_efectivo\) no se toca/)
  assert.equal(observacionDeMedio(null, plan, { fecha: '2026-09-18', motivo: 'x' }).startsWith('Medio de pago'), true)
})

test('LA TRAZA NO AFIRMA UNA EVIDENCIA QUE NADIE MIRÓ: el Santander sólo aparece si se lo pasa', () => {
  const plan = planDePagoEnEfectivo(JUNIO)
  const sin = observacionDeMedio(null, plan, { fecha: '2026-09-18', motivo: 'el dueño confirma pago en mano' })
  assert.doesNotMatch(sin, /Santander|certificado/, 'MUTACIÓN: texto fijo fabrica una verificación bancaria')
  const con = observacionDeMedio(null, plan, {
    fecha: '2026-09-18', motivo: 'x', evidencia: 'el certificado del Santander no tiene acreditaciones de esta quincena' })
  assert.match(con, /EFECTIVO, no por banco \(el certificado del Santander no tiene acreditaciones de esta quincena\)\./)
})

test('LA RELECTURA MANDA: lo que la base no devolvió como se escribió, no se da por escrito', () => {
  const plan = planDePagoEnEfectivo(JUNIO)
  assert.deepEqual(diferenciasTrasEscribir(plan, [
    { persona_id: 'carlos', pagado_banco: '0.00', pagado_efectivo: '416000.00' },
    { persona_id: 'abel', pagado_banco: '0.00', pagado_efectivo: '376000.00' },
  ]), [])
  const malas = diferenciasTrasEscribir(plan, [
    { persona_id: 'carlos', pagado_banco: '216000.00', pagado_efectivo: '200000.00' },
  ])
  assert.deepEqual(malas.map((m) => m.persona_id), ['carlos', 'abel'], 'MUTACIÓN: dar por escrito sin releer')
  assert.match(malas[0].motivo, /leído banco \$216\.000/)
  assert.equal(malas[1].motivo, 'no se releyó')
})
