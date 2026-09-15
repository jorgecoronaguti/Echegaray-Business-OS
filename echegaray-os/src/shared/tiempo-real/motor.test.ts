import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG_DE_REFRESCO as CFG } from './planDeRefresco.ts'
import { REVISAR_DIFERIDO_MS, crearMotor } from './motor.ts'

/** Un mundo falso: reloj manual, temporizadores que corren al avanzar, foco y pestaña que se mueven a mano. */
function mundo() {
  let t = 0
  let seq = 0
  const timers = new Map<number, { en: number; fn: () => void }>()
  const m = { refrescos: 0, editando: false, oculta: false }
  const motor = crearMotor({
    refrescar: () => { m.refrescos++ },
    ahora: () => t,
    azar: () => 0,
    entorno: () => ({ editando: m.editando, oculta: m.oculta }),
    programar: (fn, ms) => { const id = ++seq; timers.set(id, { en: t + ms, fn }); return id },
    cancelar: (id) => { timers.delete(id as number) },
  })
  const avanzar = (ms: number) => {
    const fin = t + ms
    for (;;) {
      const prox = [...timers.entries()].filter(([, x]) => x.en <= fin).sort((a, b) => a[1].en - b[1].en)[0]
      if (!prox) break
      timers.delete(prox[0]); t = prox[1].en; prox[1].fn()
    }
    t = fin
  }
  return { m, motor, avanzar }
}

const HH = { tabla: 'registros_hh', op: 'UPDATE' }

test('un aviso de una tabla declarada refresca una vez, pasado el silencio', () => {
  const { m, motor, avanzar } = mundo()
  motor.registrar(['registros_hh'])
  motor.alAviso(HH)
  avanzar(CFG.silencioMs - 1)
  assert.equal(m.refrescos, 0)
  avanzar(1)
  assert.equal(m.refrescos, 1)
  avanzar(60_000)
  assert.equal(m.refrescos, 1)
})

test('una tabla que la pantalla no declaró no refresca nada', () => {
  const { m, motor, avanzar } = mundo()
  motor.registrar(['registros_hh'])
  motor.alAviso({ tabla: 'clientes', op: 'INSERT' })
  avanzar(60_000)
  assert.equal(m.refrescos, 0)
})

test('diez pantallas declaradas y una ráfaga de avisos: UN refresco', () => {
  const { m, motor, avanzar } = mundo()
  motor.registrar(['registros_hh'])
  motor.registrar(['registros_hh', 'liquidacion_linea'])
  for (let i = 0; i < 10; i++) { motor.alAviso(HH); avanzar(100) }
  avanzar(10_000)
  assert.equal(m.refrescos, 1)
})

test('con el foco en un campo NO se refresca; al salir del foco, sí, sin esperar la revisión periódica', () => {
  const { m, motor, avanzar } = mundo()
  motor.registrar(['registros_hh'])
  m.editando = true
  motor.alAviso(HH)
  avanzar(60_000)
  assert.equal(m.refrescos, 0, 'la interfaz no se mueve mientras se trabaja')
  m.editando = false
  motor.alPoderRefrescar()
  assert.equal(m.refrescos, 1)
})

test('una celda que termina de editarse sin focusout se atiende en la revisión periódica', () => {
  const { m, motor, avanzar } = mundo()
  motor.registrar(['registros_hh'])
  m.editando = true
  motor.alAviso(HH)
  avanzar(5000)
  m.editando = false
  avanzar(REVISAR_DIFERIDO_MS)
  assert.equal(m.refrescos, 1)
})

test('pestaña oculta: se difiere y se refresca al volver', () => {
  const { m, motor, avanzar } = mundo()
  motor.registrar(['registros_hh'])
  m.oculta = true
  motor.alAviso(HH)
  avanzar(30_000)
  assert.equal(m.refrescos, 0)
  m.oculta = false
  motor.alPoderRefrescar()
  assert.equal(m.refrescos, 1)
})

test('reconexión: la primera suscripción no refresca; volver después de una caída refresca una vez', () => {
  const { m, motor, avanzar } = mundo()
  motor.registrar(['registros_hh'])
  motor.alEstadoDelCanal('SUBSCRIBED')
  avanzar(10_000)
  assert.equal(m.refrescos, 0)
  motor.alEstadoDelCanal('CHANNEL_ERROR')
  motor.alEstadoDelCanal('TIMED_OUT')
  motor.alEstadoDelCanal('SUBSCRIBED')
  avanzar(10_000)
  assert.equal(m.refrescos, 1)
  motor.alEstadoDelCanal('SUBSCRIBED')
  avanzar(10_000)
  assert.equal(m.refrescos, 1, 'un SUBSCRIBED repetido sin caída en el medio no es reconexión')
})

test('sin pantallas declaradas, ni avisos ni reconexiones refrescan; al desregistrar deja de escuchar', () => {
  const { m, motor, avanzar } = mundo()
  const soltar = motor.registrar(['registros_hh'])
  soltar()
  motor.alAviso(HH)
  motor.alEstadoDelCanal('CLOSED')
  motor.alEstadoDelCanal('SUBSCRIBED')
  avanzar(60_000)
  assert.equal(m.refrescos, 0)
})

test('detenido (se desmontó el marco) no refresca lo que quedó programado', () => {
  const { m, motor, avanzar } = mundo()
  motor.registrar(['registros_hh'])
  motor.alAviso(HH)
  motor.detener()
  avanzar(60_000)
  assert.equal(m.refrescos, 0)
})
