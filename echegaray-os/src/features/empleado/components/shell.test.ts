import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contextoActivo, inicialesDe } from './shell-logica.ts'

test('una subpantalla mantiene encendido SU contexto', () => {
  // El defecto que atrapa: con una comparación exacta, entrar a «Mis horas» apaga los tres tabs y la
  // barra deja de decir dónde estás — que es lo único que la barra hace.
  assert.equal(contextoActivo('/mi-informacion/horas'), '/mi-informacion')
  assert.equal(contextoActivo('/mi-trabajo/tareas/abc'), '/mi-trabajo')
  assert.equal(contextoActivo('/hoy'), '/hoy')
  assert.equal(contextoActivo('/obras'), null)
})

test('«/mi-trabajo» no enciende «/mi-trabajo-de-otro»', () => {
  assert.equal(contextoActivo('/mi-trabajoso'), null)
})

test('las iniciales salen del nombre, y si no hay, del email', () => {
  assert.equal(inicialesDe('Juan Morales', null), 'JM')
  assert.equal(inicialesDe(null, 'jmorales@ecsas.com.ar'), 'JE')
  assert.equal(inicialesDe(null, null), '—')
})
