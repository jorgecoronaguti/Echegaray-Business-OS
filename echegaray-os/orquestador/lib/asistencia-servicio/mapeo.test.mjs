// Traducción núcleo ↔ pantalla y registro de idempotencia. Todo puro.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ESTADO } from '../horas-extra.mjs'
import { SIN_CAMBIO, MOTIVO } from '../tools/jornales-asistencia.mjs'
import { mensajeDeMotivo, mapearObras, resolverJornada, mapearPersona, marcaDe, extrasDe } from './mapeo.mjs'
import { crearRegistroMemoria } from './idempotencia.mjs'

const J9 = { horas: 9, origen: 'calibrado', requiere_manual: false, feriado: false }

test('todo motivo del núcleo tiene una frase en castellano, sin códigos sueltos', () => {
  for (const clave of Object.values(MOTIVO)) {
    const m = mensajeDeMotivo(clave, { fecha: '2026-07-30' })
    assert.ok(m.length > 10, clave)
    assert.ok(!m.includes('_'), `«${m}» filtra el código ${clave}`)
  }
  assert.match(mensajeDeMotivo(MOTIVO.SIN_PERSONAL, { fecha: '2026-07-30' }), /no tiene personal cargado .* 30\/07\/2026/)
  assert.match(mensajeDeMotivo('algo_que_no_existe'), /No se pudo completar/)
})

test('las obras se muestran con la etiqueta del bloque, no con la clave normalizada', () => {
  assert.deepEqual(
    mapearObras([{ clave: 'javiersanchez|revoque', etiqueta: 'JAVIER SANCHEZ · Revoque', personas: 3 }]),
    [{ clave: 'javiersanchez|revoque', nombre: 'JAVIER SANCHEZ · Revoque', cantidad: 3 }],
  )
})

test('la configuración gana sobre la planilla; sin configuración manda la planilla', () => {
  assert.deepEqual(
    resolverJornada({ config: { horas: 4, origen: 'media_jornada', etiqueta: '24 de diciembre' }, planilla: { horas: 9 } }),
    { horas: 4, origen: 'media_jornada', etiqueta: '24 de diciembre', requiere_manual: false, feriado: false },
  )
  assert.equal(resolverJornada({ config: { horas: null, origen: 'sin_config' }, planilla: { horas: 9, origen: 'calibrado' } }).horas, 9)
})

test('sin evidencia en ningún lado la jornada es null y se pide a mano: no se inventa', () => {
  const j = resolverJornada({ config: null, planilla: { horas: null, origen: 'piso', requiere_manual: true } })
  assert.equal(j.horas, null)
  assert.equal(j.requiere_manual, true)
})

test('una persona sin celda cargada arranca presente con la jornada del día', () => {
  const p = mapearPersona({ ref: 'b20f21', nombre_original: 'Aguero Cristian', actual: { escrita: false, carga: { forma: 'vacia' } } }, { jornada: J9 })
  assert.equal(p.presente, true)
  assert.equal(p.horas, 9)
  assert.equal(p.sin_cambio, false)
  assert.equal(p.ya_cargado, false)
})

test('una celda con fórmula que no se puede separar se marca para revisar, no se bloquea', () => {
  const carga = { forma: 'no_interpretable', total: 8.5, inequivoca: false, formula_original: '=9-2,5+2' }
  const p = mapearPersona({ ref: 'r', nombre_original: 'X', actual: { escrita: true, carga } }, { jornada: J9 })
  assert.equal(p.bloqueado, null)
  assert.match(p.revisar, /no se puede separar/)
  assert.equal(p.sin_cambio, true)
})

test('las marcas traducen la pantalla al vocabulario del núcleo', () => {
  assert.deepEqual(marcaDe({ ref: 'r', novedad: { sin_cambio: true }, jornada: J9 }), { ref: 'r', estado: SIN_CAMBIO })
  assert.deepEqual(marcaDe({ ref: 'r', novedad: { presente: false }, jornada: J9 }), { ref: 'r', estado: ESTADO.AUSENTE })
  assert.deepEqual(marcaDe({ ref: 'r', novedad: { presente: true, horas: 9 }, jornada: J9 }), { ref: 'r', estado: ESTADO.PRESENTE })
  assert.deepEqual(
    marcaDe({ ref: 'r', novedad: { presente: true, horas: 11 }, jornada: J9 }),
    { ref: 'r', estado: ESTADO.PRESENTE, extras: 2 },
  )
  assert.deepEqual(
    marcaDe({ ref: 'r', novedad: { presente: true, horas: 6, motivo: 'llego_tarde' }, jornada: J9 }),
    { ref: 'r', estado: ESTADO.TARDE, normales: 6 },
  )
  assert.deepEqual(
    marcaDe({ ref: 'r', novedad: { presente: true, horas: 6, motivo: 'permiso' }, jornada: J9 }),
    { ref: 'r', estado: ESTADO.PARCIAL, normales: 6 },
  )
})

test('un sábado sin jornada defendible se carga a mano, nunca con un número inventado', () => {
  const sabado = { horas: null, origen: 'piso', requiere_manual: true }
  assert.deepEqual(
    marcaDe({ ref: 'r', novedad: { presente: true, horas: 5.5 }, jornada: sabado }),
    { ref: 'r', estado: ESTADO.PARCIAL, normales: 5.5 },
  )
  assert.equal(extrasDe({ horas: 12, jornada: sabado }), 0)
})

test('las horas extra se calculan, no se piden', () => {
  assert.equal(extrasDe({ horas: 11, jornada: J9 }), 2)
  assert.equal(extrasDe({ horas: 9, jornada: J9 }), 0)
  assert.equal(extrasDe({ horas: 4, jornada: J9 }), 0)
})

test('el registro de idempotencia recuerda dentro de la ventana y olvida después', async () => {
  let t = 0
  const reg = crearRegistroMemoria({ ttlMs: 1000, ahora: () => t })
  await reg.guardar('k', { ok: true })
  assert.deepEqual(await reg.ver('k'), { hit: true, valor: { ok: true } })
  t = 2000
  assert.deepEqual(await reg.ver('k'), { hit: false })
})

test('el registro no crece sin límite', async () => {
  const reg = crearRegistroMemoria({ max: 3, ahora: () => 0 })
  for (let i = 0; i < 10; i++) await reg.guardar(`k${i}`, i)
  assert.ok(reg.tamano() <= 3)
})
