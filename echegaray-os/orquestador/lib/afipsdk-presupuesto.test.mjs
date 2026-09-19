// Tests del presupuesto de automatizaciones. Herméticos, con la cuota REAL de la cuenta al 31/07/2026.
import test from 'node:test'
import assert from 'node:assert/strict'
import { alcanzaElCupo, leerCuota, explicar, POR_CORRIDA, RESERVA_MANUAL } from './afipsdk-presupuesto.mjs'

// Lo que devolvió la API de la cuenta el 31/07: plan free, límite 10, usadas 10.
const HOY = { usadas: 10, limite: 10 }

test('EL CASO DE HOY: el cupo está agotado y NO se llama a la API', () => {
  const v = alcanzaElCupo(HOY)
  assert.equal(v.alcanza, false)
  assert.equal(v.disponible, 0)
  assert.match(v.motivo, /AGOTADO/)
  assert.match(v.motivo, /se factura/, 'dice por qué importa: cada llamada de más se paga')
})

test('una corrida del sync consume DOS: libro R y libro E', () => {
  assert.equal(POR_CORRIDA, 2)
  // Con 4 libres y 2 de reserva, quedan 2 usables: alcanza para UNA corrida y no para dos.
  assert.equal(alcanzaElCupo({ usadas: 6, limite: 10 }).alcanza, true)
  assert.equal(alcanzaElCupo({ usadas: 6, limite: 10 }, { necesita: 4 }).alcanza, false)
})

test('LA RESERVA ES PARA ÉL: un timer no se puede comer el último cupo', () => {
  // 2 libres, 2 reservadas → un timer NO corre.
  const timer = alcanzaElCupo({ usadas: 8, limite: 10 })
  assert.equal(timer.alcanza, false)
  assert.match(timer.motivo, /reservadas para uso manual/)
  // Pero una corrida MANUAL sí: la reserva existe justamente para eso.
  const manual = alcanzaElCupo({ usadas: 8, limite: 10 }, { manual: true })
  assert.equal(manual.alcanza, true)
  assert.equal(RESERVA_MANUAL, 2)
})

test('LA CUENTA QUE ME FALTÓ HACER: diario no entra en el plan free', () => {
  // Ésta es la aritmética que justifica el freno. 2 por corrida contra 10 por período:
  const limite = 10
  const alMes = (corridasPorMes) => corridasPorMes * POR_CORRIDA
  assert.ok(alMes(1) <= limite, 'mensual entra: 2')
  assert.ok(alMes(4) <= limite, 'semanal entra: 8')
  assert.ok(alMes(30) > limite * 5, 'diario es seis veces el límite: 60')
  // Y con la reserva, semanal en un mes de 5 semanas queda justo en el borde: el freno lo agarra.
  assert.equal(alcanzaElCupo({ usadas: 8, limite }).alcanza, false)
})

test('si no se puede leer el cupo, NO se llama: gastar a ciegas es peor', async () => {
  assert.equal(explicar(null, {}).includes('gastar a ciegas'), true)
  // leerCuota devuelve null sin token, y el llamador tiene que tratarlo como "no alcanza".
  assert.equal(await leerCuota({}), null)
})

test('leerCuota extrae exactamente los campos que decide, del proyecto real', async () => {
  const respuesta = [{
    id: '659c6009', role: 'owner',
    project: {
      automation_billing_plan: 'free', current_period_automation_usage: 10, automation_limit: 10,
      subscription_current_period_start: '2026-07-10T20:19:23+00:00',
      subscription_current_period_end: '2026-08-10T20:19:23+00:00',
      request_limit: 1000, pdf_limit: 100,
    },
  }]
  const cuota = await leerCuota({ accountToken: 'x', fetch: async () => ({ ok: true, json: async () => respuesta }) })
  assert.deepEqual(cuota, { usadas: 10, limite: 10, plan: 'free', desde: '2026-07-10', hasta: '2026-08-10' })
  const texto = explicar(cuota, alcanzaElCupo(cuota))
  assert.match(texto, /10\/10/)
  assert.match(texto, /2026-07-10→2026-08-10/)
})

test('un 401 o una respuesta rara devuelven null, no un cupo inventado', async () => {
  assert.equal(await leerCuota({ accountToken: 'x', fetch: async () => ({ ok: false }) }), null)
  assert.equal(await leerCuota({ accountToken: 'x', fetch: async () => ({ ok: true, json: async () => ({}) }) }), null)
  assert.equal(await leerCuota({ accountToken: 'x', fetch: async () => ({ ok: true, json: async () => [] }) }), null)
})
