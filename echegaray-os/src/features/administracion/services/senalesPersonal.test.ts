import test from 'node:test'
import assert from 'node:assert/strict'
import { senalesDePersonal } from './senalesPersonal.ts'
import type { EstadoDePapeles, MarcaDeHoy } from './pulsoDelPlantel.ts'

// ═══ QUÉ DEFECTOS ATRAPA ═══
//
// 1. Que vuelva una señal que cuente fichajes. El 08/09/2026 se retiró «sin fichar hoy»: el estado
//    del día es presente/ausente/licencia/sin marcar, y una cifra de «no fichó» en una banda de
//    alerta se lee como faltas del plantel entero sobre una capacidad que no está en uso.
// 2. Que una fuente que no se pudo leer publique un 0. «No pude ver» y «está todo bien» se
//    dibujarían igual: sin señal.
// 3. Que una señal sin recorte finja tener uno. Un verbo que no lleva a ninguna parte enseña a no
//    hacerle clic al que sí lleva.
// 4. Que el plantel se cuente sobre las personas que ya no están.

const persona = (
  id: string,
  x: Partial<{ en_la_empresa: boolean; obra_actual_id: string | null; puesto: string | null }> = {},
) => ({ id, en_la_empresa: true, obra_actual_id: 'o1', ...x })

const HREF = '/administracion/personas?f=sin_asignar'
const base = {
  personas: [persona('a'), persona('b')],
  marcas: new Map<string, MarcaDeHoy>(),
  papeles: new Map<string, EstadoDePapeles>(),
  hoyDisponible: false,
  papelesDisponible: false,
  hrefSinObra: HREF,
}

test('ninguna señal cuenta fichajes: la del día se retiró el 08/09/2026 y no vuelve', () => {
  // EL DEFECTO QUE ATRAPA: que alguien reponga «N sin fichar hoy». El estado del día no se resuelve
  // con marcas ausentes ni con horas — y esta función no tiene enchufada la fuente que lo diría.
  const s = senalesDePersonal({ ...base, hoyDisponible: true })
  assert.equal(s.find((x) => x.clave === 'sin-fichar'), undefined)
  for (const x of s) {
    assert.doesNotMatch(x.texto, /fich/i, `la señal «${x.texto}» volvió a hablar de fichaje`)
    assert.doesNotMatch(x.texto, /\bh\b|hora/i, `la señal «${x.texto}» resuelve el día con horas`)
  }
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
})

test('nada que reclamar es silencio: cero no se dibuja', () => {
  assert.deepEqual(senalesDePersonal({ ...base, hoyDisponible: true, marcas: new Map([
    ['a', { persona_id: 'a', estado: 'activo' }], ['b', { persona_id: 'b', estado: 'cerrada' }],
  ]) }), [])
})

// ═══ A DIRECCIÓN NO SE LE RECLAMA OBRA (22/09/2026) ═══
//
// Rodrigo y Jorge entraron al padrón para recibir efectivo a rendir (*«falta q agregues a rodrigo y a
// mi como receptores de plata»*). Sin esta regla, la señal pasaba de 0 a 2 —medido en la base antes
// de darlos de alta— con el verbo «Asignar», que nadie iba a poder cumplir nunca: una señal que no
// puede bajar a cero deja de ser una señal.
test('Dirección no cuenta en «sin obra asignada»; un obrero sin obra sí', () => {
  const s = senalesDePersonal({
    ...base,
    personas: [
      persona('rodrigo', { obra_actual_id: null, puesto: 'DIRECCIÓN' }),
      persona('jorge', { obra_actual_id: null, puesto: 'DIRECCIÓN' }),
      persona('acosta', { obra_actual_id: null }),
    ],
  })
  const sinObra = s.find((x) => x.clave === 'sin-obra')
  assert.ok(sinObra, 'la señal desapareció: el obrero sin obra dejó de reclamar')
  assert.equal(sinObra.numero, 1, 'Dirección volvió a contarse entre los que necesitan obra')
})

// Y SIN NINGÚN OBRERO SUELTO NO HAY SEÑAL: dos filas de Dirección no encienden nada.
test('sólo Dirección sin obra no enciende la señal', () => {
  const s = senalesDePersonal({
    ...base,
    personas: [persona('rodrigo', { obra_actual_id: null, puesto: 'DIRECCIÓN' })],
  })
  assert.equal(s.find((x) => x.clave === 'sin-obra'), undefined)
})
