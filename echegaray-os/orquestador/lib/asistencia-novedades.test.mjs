// La proyección consultable del porqué. Sin base: doble del `port` que registra el SQL.

import test from 'node:test'
import assert from 'node:assert/strict'
import { guardarNovedades } from './asistencia-novedades.mjs'

/** Doble del pool: guarda cada consulta y sus parámetros. */
function portDoble({ falla = null } = {}) {
  const consultas = []
  return {
    consultas,
    async query(sql, params) {
      consultas.push({ sql, params })
      if (falla && consultas.length === falla) throw new Error('duplicate key value violates unique constraint')
      return { rows: [] }
    },
  }
}

const BASE = {
  fecha: '2026-07-30',
  claveObra: 'MESSINAS|BASES DE TANQUE',
  jornada: 9,
  actor: { plataforma_user_id: 'u1', plataforma_username: 'jorge' },
  correlationId: '11111111-1111-1111-1111-111111111111',
}
const nov = (extra = {}) => ({
  ref: 'b1f10', nombre: 'Navarro Matias', presente: false, horas: 0,
  motivo: 'enfermedad', aclaracion: null, obra_realizada: null,
  falta_injustificada: false, art: false, paraliza_obra: false, ...extra,
})

test('una jornada completa SIN motivo no genera fila', async () => {
  const port = portDoble()
  const r = await guardarNovedades(port, { ...BASE, novedades: [{ ref: 'b1f1', presente: true, horas: 9, motivo: null }] })
  assert.equal(r.guardadas, 0)
  assert.equal(port.consultas.length, 0, 'el 95% de los casos no es una excepción: no se escribe')
})

test('guarda la novedad con su motivo y su jornada de referencia', async () => {
  const port = portDoble()
  const r = await guardarNovedades(port, { ...BASE, novedades: [nov()] })
  assert.equal(r.guardadas, 1)
  const { sql, params } = port.consultas[0]
  assert.match(sql, /insert into comunicacion\.asistencia_novedades/)
  assert.equal(params[0], '2026-07-30')
  assert.equal(params[7], 'enfermedad')
  assert.equal(params[6], 9, 'la jornada vigente viaja: sin ella no se puede releer el juicio')
})

test('paraliza_obra llega a la columna — es lo que separa personas de producción', async () => {
  const port = portDoble()
  await guardarNovedades(port, { ...BASE, novedades: [nov({ motivo: 'lluvia', presente: true, paraliza_obra: true })] })
  const { params } = port.consultas[0]
  assert.equal(params[12], true, 'sin este mapeo la columna queda en false para siempre')
  assert.equal(params[10], false, 'lluvia no es falta injustificada')
})

test('el accidente marca ART', async () => {
  const port = portDoble()
  await guardarNovedades(port, { ...BASE, novedades: [nov({ motivo: 'accidente', art: true, aclaracion: 'se cortó la mano' })] })
  const { params } = port.consultas[0]
  assert.equal(params[11], true)
  assert.equal(params[8], 'se cortó la mano')
})

test('corregir una carga PISA la fila, no agrega otra', async () => {
  const port = portDoble()
  await guardarNovedades(port, { ...BASE, novedades: [nov()] })
  assert.match(port.consultas[0].sql, /on conflict \(fecha_operativa, clave_obra, trabajador_ref\) do update/)
  assert.match(port.consultas[0].sql, /actualizado_at = now\(\)/)
})

test('una aclaración vacía se guarda como null, no como cadena vacía', async () => {
  const port = portDoble()
  await guardarNovedades(port, { ...BASE, novedades: [nov({ aclaracion: '   ', obra_realizada: '' })] })
  const { params } = port.consultas[0]
  assert.equal(params[8], null)
  assert.equal(params[9], null)
})

test('si una novedad falla, NO arrastra la carga: se informa y se sigue', async () => {
  const port = portDoble({ falla: 2 })
  const r = await guardarNovedades(port, { ...BASE, novedades: [nov(), nov({ ref: 'b1f11' })] })
  assert.equal(r.guardadas, 1, 'la primera entró')
  assert.ok(r.error, 'el fallo se informa')
  assert.ok(!/insert into/i.test(r.error), 'el error no devuelve el SQL crudo')
})

test('sin port no explota: la carga ya está escrita en la planilla', async () => {
  const r = await guardarNovedades(null, { ...BASE, novedades: [nov()] })
  assert.equal(r.guardadas, 0)
})

test('el origen queda registrado: por dónde entró la carga', async () => {
  const port = portDoble()
  await guardarNovedades(port, { ...BASE, novedades: [nov()], origen: 'mattermost' })
  assert.equal(port.consultas[0].params[13], 'mattermost')
})
