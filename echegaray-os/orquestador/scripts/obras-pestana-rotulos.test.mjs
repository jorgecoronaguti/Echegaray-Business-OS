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
  const sinFechas = OBRAS_FUTURAS.filter((o) => !o.inicio || !o.fin)
  assert.ok(sinFechas.length > 0, 'el catálogo dejó de tener obras sin fechas: este test ya no mide nada')
  for (const o of sinFechas) {
    const r = rotuloDeObra(o, 11)
    assert.equal(r.celda, `2.11 · ${o.cliente} — ${o.obra}`)
    assert.equal(r.texto, r.celda)
  }
})

test('un nombre que la poda recortaría se DETECTA antes de escribir', () => {
  const larga = { ...OBRAS_FUTURAS.find((o) => !o.inicio), clave: 'x', obra: 'ADICIONAL DE EXCAVACIONES Y AMPLIACIÓN DE LA PLATEA PARA UNIR LAS DOS PLANTAS' }
  const g = grillaObras({ obras: [larga] })
  assert.equal(obrasQueLaPodaDejaSinNombre(g).length, 1)
})
