import test from 'node:test'
import assert from 'node:assert/strict'
import { decidirDespliegue, RECHAZO, unidadesARepuntar, UNIDADES_DE_DESARROLLO, DAEMONS } from './despliegue.mjs'

test('un commit que no está en origin/main NO llega a producción', () => {
  const d = decidirDespliegue({ objetivo: 'abc', desplegado: 'zzz', estaEnMain: false })
  assert.equal(d.avanza, false)
  assert.equal(d.motivo, RECHAZO.NO_ESTA_EN_MAIN)
})

test('un checkout productivo con cambios sin commitear frena el despliegue y NOMBRA los archivos', () => {
  const d = decidirDespliegue({ objetivo: 'abc', desplegado: 'zzz', estaEnMain: true, sucios: [' M orquestador/worker.mjs'] })
  assert.equal(d.avanza, false)
  assert.equal(d.motivo, RECHAZO.ARBOL_SUCIO)
  assert.deepEqual(d.sucios, [' M orquestador/worker.mjs'])
})

test('desplegar lo que ya está desplegado no es un error, es un no-op', () => {
  const d = decidirDespliegue({ objetivo: 'abc', desplegado: 'abc', estaEnMain: true })
  assert.equal(d.avanza, false)
  assert.equal(d.motivo, RECHAZO.YA_DESPLEGADO)
})

test('--forzar redespliega el mismo commit', () => {
  assert.equal(decidirDespliegue({ objetivo: 'abc', desplegado: 'abc', estaEnMain: true, forzar: true }).avanza, true)
})

test('volver a un commit anterior de main es un despliegue válido y se declara rollback', () => {
  const d = decidirDespliegue({ objetivo: 'viejo', desplegado: 'nuevo', estaEnMain: true })
  assert.equal(d.avanza, true)
  assert.equal(d.esRollback, true)
})

test('sin commit objetivo no se despliega nada', () => {
  assert.equal(decidirDespliegue({ objetivo: null, estaEnMain: true }).motivo, RECHAZO.SIN_OBJETIVO)
})

test('el control remoto de Claude Code se queda en el árbol de desarrollo', () => {
  const unidades = [
    { nombre: 'echegaray-orq-worker.service', texto: 'WorkingDirectory=/home/jorge/echegaray-os/app/echegaray-os' },
    { nombre: 'echegaray-claude-remote.service', texto: 'WorkingDirectory=/home/jorge/echegaray-os/app/echegaray-os' },
    { nombre: 'otra.service', texto: 'WorkingDirectory=/otro/lado' },
  ]
  const r = unidadesARepuntar(unidades, { dirDesarrollo: '/home/jorge/echegaray-os/app/echegaray-os' })
  assert.deepEqual(r, ['echegaray-orq-worker.service'])
  assert.ok(UNIDADES_DE_DESARROLLO.includes('echegaray-claude-remote.service'))
})

test('los daemons a reiniciar no incluyen ningún oneshot de timer', () => {
  for (const u of DAEMONS) assert.ok(!/sync|health|cleanup|vigilancia|schedules|ciclo|sonda/.test(u), u)
})
