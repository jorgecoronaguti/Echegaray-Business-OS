
// ═══ UN "✓ CIERRA" QUE NO DICE HASTA DÓNDE MIRÓ SE LEE COMO UN "✓ TODO" (17/08/2026) ═══
//
// El importador firmaba "la cadena de saldos cierra de punta a punta" verificando SÓLO el tramo del
// archivo, mientras `auditar-saldo-banco.mjs` —que mide la base entera— declaraba $45.080 sin
// explicar. Dos herramientas del mismo repo firmando lo contrario sobre la misma cuenta el mismo
// día. El dueño: "pésimo, entonces no puede quedar así".
//
// Las dos tenían razón; ninguna decía su ventana. Mismo defecto que el techo mudo del reparador de
// textos. Este test mira el FUENTE porque el defecto está en lo que se imprime, que es el único
// lugar donde vive.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('el veredicto de la cadena declara su ventana y deriva el resto', () => {
  const src = readFileSync(new URL('./importar-banco.mjs', import.meta.url), 'utf8')
  const codigo = src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  assert.match(codigo, /EN ESTE ARCHIVO/,
    'el ✓ tiene que decir que sólo habla del tramo que trajo el archivo')
  assert.match(codigo, /\$\{v0\}.*\$\{v1\}/,
    'y tiene que imprimir de qué fecha a qué fecha miró')
  assert.match(codigo, /auditar-saldo-banco\.mjs/,
    'y mandar a la herramienta que sí puede contestar por la base entera')
  assert.doesNotMatch(codigo, /'✓ la cadena de saldos cierra de punta a punta'/,
    'el veredicto sin ventana no puede volver: se lee como un ✓ sobre todo')
})
