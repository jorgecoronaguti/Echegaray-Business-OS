// LAS DOS PUNTAS TIENEN QUE CLAVEAR IGUAL.
//
// El sincronizador de Drive clavea con `claveDe()` (JS) y la web, al crear una actividad a mano,
// clavea con `claveDeActividad()` (TypeScript). Si las dos reglas se separan, la MISMA actividad
// entra dos veces: una por el tracker y otra por la web, y el avance se promedia sobre el doble de
// filas sin que nadie vea un error. Este test las compara sobre los mismos casos.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { claveDe } from './obra-cronograma.mjs'

// Se lee la implementación de TypeScript y se ejecuta su cuerpo: importar un .ts desde node --test
// exigiría un compilador, y lo que hay que probar es que las DOS reglas coinciden, no cuál gana.
const ts = readFileSync(new URL('../../src/features/obras/services/claves.ts', import.meta.url), 'utf8')
const cuerpo = ts
  .replace(/^\/\/.*$/gm, '')
  .replace(/export function slug\(s: string\): string/, 'function slug(s)')
  .replace(/export function claveDeActividad\(seccion: string \| null, nombre: string\): string/, 'function claveDeActividad(seccion, nombre)')
const claveWeb = new Function(`${cuerpo}; return claveDeActividad`)()

const CASOS = [
  [null, 'Excavación de zanjas'],
  ['GALPÓN 5 - 1000m2', 'Relleno'],
  ['GALPÓN 4', 'Relleno'],
  ['PISOS', 'Tendido de malla'],
  ['', 'Muro G 1/2 de 5m - 18 paneles'],
  ['MEDIANERA', 'Armado armadura de VF'],
  [null, '•⁠ ⁠10x10 para las aberturas de portones'],
]

test('la web y el sincronizador de Drive clavean una actividad IGUAL', () => {
  for (const [seccion, nombre] of CASOS) {
    assert.equal(claveWeb(seccion, nombre), claveDe(seccion, nombre), `difieren en "${seccion} / ${nombre}"`)
  }
})

test('una actividad sin sección cuelga de la raíz, en las dos', () => {
  assert.equal(claveWeb(null, 'Replanteo'), 'raiz/replanteo')
  assert.equal(claveDe(null, 'Replanteo'), 'raiz/replanteo')
})
