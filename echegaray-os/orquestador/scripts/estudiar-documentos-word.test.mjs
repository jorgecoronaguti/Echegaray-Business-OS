// LA MISMA COPIA CON OTRO NOMBRE NO ES DOS DOCUMENTOS.
//
// En Drive hay dos copias del contrato de Quattropani con distinto nombre, y este circuito estudió
// las dos: 46 frases entraron por duplicado con dos slugs, y el total inflado se informó como si
// fueran hallazgos distintos. El circuito de cotizaciones ya deduplicaba por contenido; éste no.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { yaEntroEnEstaCorrida } from './estudiar-documentos-word.mjs'

test('dos copias con distinto nombre son UNA: la segunda dice de cuál es copia', () => {
  const vistos = new Map()
  assert.equal(yaEntroEnEstaCorrida('h1', vistos), null)
  vistos.set('h1', 'CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA.docx')
  assert.equal(yaEntroEnEstaCorrida('h1', vistos), 'CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA.docx')
})

test('una copia EDITADA vuelve a ser dos documentos: el hash es del contenido', () => {
  // La contraparte. Deduplicar por NOMBRE parecido habría tapado una versión distinta del contrato,
  // que es el error caro: perder una cláusula que cambió.
  const vistos = new Map([['h1', 'Contrato.docx']])
  assert.equal(yaEntroEnEstaCorrida('h2', vistos), null)
})

test('sin hash no se deduplica: no se adivina que dos ilegibles son el mismo', () => {
  assert.equal(yaEntroEnEstaCorrida(null, new Map([['h1', 'a.docx']])), null)
  assert.equal(yaEntroEnEstaCorrida(undefined, new Map()), null)
})

test('importar este script NO corre la ingesta: la guarda de ejecución directa existe', () => {
  // Este test importó el módulo arriba. Si `main()` corriera al importar, esta corrida saldría a
  // Drive y reescribiría `biblioteca.json` — pasó de verdad mientras se armaba esta rama, y ya
  // había pasado antes en 465b14f1. Que el import de arriba haya terminado ya es la prueba;
  // esto lo deja escrito para que nadie saque la guarda pensando que no hace nada.
  const fuente = readFileSync(new URL('./estudiar-documentos-word.mjs', import.meta.url), 'utf8')
  assert.match(fuente, /const ejecutadoDirecto = process\.argv\[1\] && import\.meta\.url === pathToFileURL/)
  assert.ok(!/^main\(\)/m.test(fuente), 'main() no puede invocarse en el tope del módulo')
})
