import test from 'node:test'
import assert from 'node:assert/strict'
import { senalesDePersonal } from './senalesPersonal.ts'
import type { EstadoDePapeles, MarcaDeHoy } from './pulsoDelPlantel.ts'

// ═══ QUÉ DEFECTOS ATRAPA ═══
//
// 1. Que «sin fichar» se convierta en una ausencia. `estadoHoy` devuelve `sin_fichar` también para
//    el que no tiene teléfono y para el que no le dio permiso al GPS: si el texto o el tono dijeran
//    «ausente», la pantalla estaría fabricando una novedad de liquidación sobre una batería
//    descargada. Es la señal que el mockup dibuja en rojo y que acá NO existe.
// 2. Que una fuente que no se pudo leer publique un 0. «No pude ver quién fichó» y «fichó todo el
//    mundo» se dibujarían igual: sin señal.
// 3. Que una señal sin recorte finja tener uno. Un verbo que no lleva a ninguna parte enseña a no
//    hacerle clic al que sí lleva.
// 4. Que el plantel se cuente sobre las personas que ya no están.

const persona = (id: string, x: Partial<{ en_la_empresa: boolean; obra_actual_id: string | null }> = {}) =>
  ({ id, en_la_empresa: true, obra_actual_id: 'o1', ...x })

const HREF = '/administracion/personas?f=sin_asignar'
const base = {
  personas: [persona('a'), persona('b')],
  marcas: new Map<string, MarcaDeHoy>(),
  papeles: new Map<string, EstadoDePapeles>(),
  hoyDisponible: false,
  papelesDisponible: false,
  hrefSinObra: HREF,
}

test('«sin fichar» nunca se llama ausencia ni se pinta de rojo', () => {
  const s = senalesDePersonal({ ...base, hoyDisponible: true })
  const sinFichar = s.find((x) => x.clave === 'sin-fichar')
  assert.ok(sinFichar, 'nadie fichó: la señal tiene que estar')
  assert.equal(sinFichar.numero, 2)
  assert.equal(sinFichar.tono, undefined, 'el rojo es de lo que YA está mal, no de lo que no se sabe')
  assert.doesNotMatch(sinFichar.texto, /ausen/i)
  assert.match(sinFichar.bloquea, /No es una falta/)
})

test('sin lectura de presencia no hay señal: «no pude ver» no es «fichó todo el mundo»', () => {
  const s = senalesDePersonal({ ...base, hoyDisponible: false })
  assert.equal(s.find((x) => x.clave === 'sin-fichar'), undefined)
})

test('sin control de vencimientos no se afirma nada sobre los papeles', () => {
  const papeles = new Map<string, EstadoDePapeles>([['a', { vencidos: 2, porVencer: 0, faltan: 0, total: 5 }]])
  assert.equal(senalesDePersonal({ ...base, papeles }).find((x) => x.clave === 'papeles'), undefined)

  const con = senalesDePersonal({ ...base, papeles, papelesDisponible: true })
  const p = con.find((x) => x.clave === 'papeles')
  assert.ok(p)
  assert.equal(p.numero, 1, 'cuenta PERSONAS con papeles vencidos, no papeles')
  assert.equal(p.tono, 'neg', 'la libreta vencida saca a la persona de la obra: eso ya está mal')
})

test('sólo la señal que tiene recorte trae verbo y destino', () => {
  const papeles = new Map<string, EstadoDePapeles>([['a', { vencidos: 1, porVencer: 0, faltan: 0, total: 3 }]])
  const s = senalesDePersonal({
    ...base,
    personas: [persona('a', { obra_actual_id: null }), persona('b')],
    papeles, papelesDisponible: true, hoyDisponible: true,
  })
  const porClave = Object.fromEntries(s.map((x) => [x.clave, x]))
  assert.equal(porClave.papeles.href, undefined)
  assert.equal(porClave.papeles.accion, '')
  assert.equal(porClave['sin-fichar'].href, undefined)
  assert.equal(porClave['sin-obra'].href, HREF)
  assert.equal(porClave['sin-obra'].accion, 'Asignar')
})

test('el plantel es el que pertenece a la empresa: a quien ya no está no se le reclama nada', () => {
  const s = senalesDePersonal({
    ...base,
    personas: [persona('a', { en_la_empresa: false, obra_actual_id: null }), persona('b')],
    hoyDisponible: true,
  })
  assert.equal(s.find((x) => x.clave === 'sin-obra'), undefined, 'el que se fue no está «sin obra»')
  assert.equal(s.find((x) => x.clave === 'sin-fichar')?.numero, 1, 'ni «sin fichar»')
})

test('nada que reclamar es silencio: cero no se dibuja', () => {
  assert.deepEqual(senalesDePersonal({ ...base, hoyDisponible: true, marcas: new Map([
    ['a', { persona_id: 'a', estado: 'activo' }], ['b', { persona_id: 'b', estado: 'cerrada' }],
  ]) }), [])
})
