// LA MUESTRA NO PUEDE SER «LOS PRIMEROS N»: eso mide una obra sola y llama a eso «el cliente».

import test from 'node:test'
import assert from 'node:assert/strict'
import { inventarioDe, muestra } from './xsas-entender-proyecto.mjs'
import { relacionar } from '../lib/plano/relacion.mjs'

const RAIZ = 'clientes/ARCOR/'
const docs = [
  ...Array.from({ length: 20 }, (_, i) => ({ name: `a${i}.pdf`, path: `${RAIZ}FILTRO SANITARIO/a${i}.pdf` })),
  ...Array.from({ length: 3 }, (_, i) => ({ name: `b${i}.xls`, path: `${RAIZ}CISTERNA/b${i}.xls` })),
  { name: 'c0.doc', path: `${RAIZ}MURO CORTAFUEGO/c0.doc` },
]

test('el inventario se contesta sin bajar un byte, y el formato desconocido se dice', () => {
  const inv = inventarioDe([...docs, { name: 'x.step', path: `${RAIZ}x.step` }])
  assert.equal(inv.total, 25)
  assert.equal(inv.porFormato.PDF, 20)
  assert.deepEqual(inv.sinAdaptador, ['x.step'])
})

test('la muestra reparte por ÁMBITO: 6 documentos tocan las tres obras, no veinte de una', () => {
  const rel = relacionar(docs, { carpetaObra: RAIZ })
  const { elegidos, afuera } = muestra(docs, rel, 6)
  assert.equal(elegidos.length, 6)
  assert.equal(afuera.length, 18)
  const ambitos = new Set(elegidos.map((d) => rel.porNombre.get(d.name).ambito))
  assert.equal(ambitos.size, 3, 'las tres obras entran a la muestra')
  // MUTACIÓN CORRIDA: `docs.slice(0, 6)` da un solo ámbito. El reparto es lo que se está probando.
  assert.equal(new Set(docs.slice(0, 6).map((d) => rel.porNombre.get(d.name).ambito)).size, 1)
})

test('sin tope, la muestra es el conjunto entero y nada queda afuera en silencio', () => {
  const rel = relacionar(docs, { carpetaObra: RAIZ })
  assert.equal(muestra(docs, rel, 0).elegidos.length, docs.length)
  assert.equal(muestra(docs, rel, 999).afuera.length, 0)
})
