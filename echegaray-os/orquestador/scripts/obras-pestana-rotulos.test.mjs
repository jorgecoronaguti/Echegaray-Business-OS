// EL RÓTULO DE UNA OBRA LLEGA ENTERO AL SHEET (01/10/2026).
//
// El dueño abrió OBRAS y encontró «2.11 · MESSINA»: la obra sin su nombre. No había ningún error —
// la poda de prosa leyó el rótulo como «título — glosa» y, con la leyenda «▲ sin fechas — no se
// proyecta» pegada al nombre, la glosa pasaba el tope y se fue entera.
import test from 'node:test'
import assert from 'node:assert/strict'
import { OBRAS_FUTURAS } from '../lib/obras-datos.mjs'
import { grillaObras, rotuloDeObra } from '../lib/obras-grilla.mjs'
import { podarProsa } from '../lib/podar-prosa.mjs'
import { obrasQueLaPodaDejaSinNombre } from './obras-pestana.mjs'

test('ninguna obra del catálogo pierde su nombre en la poda: la celda que se escribe lo conserva', () => {
  const g = grillaObras({ obras: OBRAS_FUTURAS })
  assert.deepEqual(obrasQueLaPodaDejaSinNombre(g), [])
  const podada = podarProsa(g.filas.map((f) => [...f]), { pestana: 'OBRAS' })
  for (const b of g.bloques) {
    const o = OBRAS_FUTURAS.find((x) => x.clave === b.clave)
    assert.ok(String(podada[b.fProt - 1][0]).includes(o.obra), `${b.clave}: quedó «${podada[b.fProt - 1][0]}»`)
  }
})

test('la obra sin fechas publica su nombre y nada más: la celda no lleva explicación', () => {
  // SINTÉTICA, NO DEL CATÁLOGO: el 01/10 el dueño dio las fechas de las dos obras que no las tenían, y
  // un test que esperara «alguna obra real sin fechas» se pondría rojo sin que ninguna regla se rompa.
  const o = { ...OBRAS_FUTURAS[0], clave: 'zz-sin-fechas', obra: 'ZZ SIN FECHAS', inicio: null, fin: null }
  const r = rotuloDeObra(o, 11)
  assert.equal(r.celda, `2.11 · ${o.cliente} — ZZ SIN FECHAS`)
  assert.equal(r.texto, r.celda)
})

test('un nombre que la poda recortaría se DETECTA antes de escribir', () => {
  const larga = { ...OBRAS_FUTURAS[0], clave: 'x', inicio: null, fin: null, obra: 'ADICIONAL DE EXCAVACIONES Y AMPLIACIÓN DE LA PLATEA PARA UNIR LAS DOS PLANTAS' }
  const g = grillaObras({ obras: [larga] })
  assert.equal(obrasQueLaPodaDejaSinNombre(g).length, 1)
})
