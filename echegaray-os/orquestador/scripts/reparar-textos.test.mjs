// EL REPARADOR NO PUEDE SER EL OCTAVO ESCRITOR DE UNA PROPIEDAD QUE TIENE DUEÑO.
//
// ═══ EL DEFECTO QUE ESTO ATRAPA (05/08) ═══
//
// "Proveedores" declara sus ocho anchos en `lib/proveedores-frontera.mjs` y los aplica UN generador,
// porque tres escritores peleando por la misma propiedad dejaron la columna D en 80px o en 300px
// según quién corriera último. Este script corre DESPUÉS de todos ellos en `PASOS` y ensanchaba por
// su cuenta cualquier columna con un texto cortado: era el que ganaba siempre. El defecto de
// propiedad volvía en silencio y con la firma de un reparador.
//
// Lo que hace en cambio es lo mismo que ya hace con las notas: REPORTAR, y que lo resuelva el
// generador dueño — el único que puede elegir entre acortar el rótulo y mover la tabla.

import test from 'node:test'
import assert from 'node:assert/strict'
import { CON_ANCHO_GOBERNADO, planDeReparacion } from './reparar-textos.mjs'
import { ANCHOS_PROVEEDORES, DUENOS_DE_PROVEEDORES } from '../lib/proveedores-frontera.mjs'

/** Un texto cortado, en la forma que lo emite `detectar`. */
const cortado = (col, fila, valor) => ({ tipo: 'texto_cortado', col, fila, valor })
const grilla = (valor, fontSize = 10) => [[null, null, { valor, formato: { textFormat: { fontSize } } }]]

test('EL DEFECTO: en una pestaña con anchos de fuente única, ensanchar los pisa', () => {
  const d = [cortado('C', 1, 'Fecha prevista de pago')]
  // Sin la guarda, el reparador decide ensanchar la C — y con eso pisa ANCHOS_PROVEEDORES.
  const libre = planDeReparacion(d, [...ANCHOS_PROVEEDORES], grilla('Fecha prevista de pago'))
  assert.equal(libre.ensanchar.size, 1)
  assert.ok(libre.ensanchar.get(2) > ANCHOS_PROVEEDORES[2], 'ensancharía la C por encima de lo declarado')

  // Con la guarda: ni una columna se toca, y el texto se reporta para que lo acorte el dueño.
  const gobernado = planDeReparacion(d, [...ANCHOS_PROVEEDORES], grilla('Fecha prevista de pago'), { anchoGobernado: true })
  assert.equal(gobernado.ensanchar.size, 0, 'no puede ensanchar una columna que tiene dueño declarado')
  assert.deepEqual(gobernado.aNota.map((n) => n.col), [2], 'pero el defecto NO se pierde: se reporta')
})

test('"Proveedores" está en la lista, y es la que tiene fuente única de anchos', () => {
  assert.ok(CON_ANCHO_GOBERNADO.has('Proveedores'))
  // La coherencia que importa: la pestaña que declara sus anchos es la que tiene dueños de bloque.
  assert.ok(DUENOS_DE_PROVEEDORES.length > 0 && ANCHOS_PROVEEDORES.length === 8)
})

test('en una pestaña sin dueño de anchos, el reparador sigue haciendo su trabajo', () => {
  const d = [cortado('C', 1, 'Intereses del acuerdo')]
  const r = planDeReparacion(d, [100, 100, 60], grilla('Intereses del acuerdo'))
  assert.equal(r.ensanchar.size, 1, 'sin fuente única, ensanchar es la respuesta correcta')
  assert.equal(r.aNota.length, 0)
})

test('un párrafo nunca se arregla ensanchando, tenga o no dueño la pestaña', () => {
  const parrafo = 'x'.repeat(200)
  for (const anchoGobernado of [false, true]) {
    const r = planDeReparacion([cortado('C', 1, parrafo)], [100, 100, 60], grilla(parrafo), { anchoGobernado })
    assert.equal(r.ensanchar.size, 0)
    assert.equal(r.aNota.length, 1, 'se reporta para que el generador lo acorte')
  }
})
