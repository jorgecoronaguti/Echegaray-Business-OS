import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ORIGEN_FORMULARIO, fraseDeOrigenContratado } from './economiaObras.ts'

// ═══ EL ORIGEN DEL CONTRATADO SE VE (decisión del dueño, 14/09/2026) ═══
//
// «Sí, tomar el del formulario» para las obras cerradas. El número entra por `obra_economia_cartera`
// (origen 'formulario') y la celda lo dice en su `title`: un monto del formulario no puede leerse con la
// misma tinta que una OC. QUÉ DEFECTO ATRAPA: que la ficha o la cartera dibujen el importe sin decir de
// dónde salió.

const DIR = dirname(fileURLToPath(import.meta.url))
const leer = (f: string): string => readFileSync(join(DIR, f), 'utf8')

test('el origen formulario tiene su frase; los demás orígenes no', () => {
  assert.equal(ORIGEN_FORMULARIO, 'formulario')
  assert.match(fraseDeOrigenContratado('formulario') ?? '', /contratado según formulario de la obra/i)
  assert.equal(fraseDeOrigenContratado('oc-pesos'), null)
  assert.equal(fraseDeOrigenContratado(null), null)
})

test('la ficha y la cartera escriben esa frase en el title del contratado', () => {
  const ficha = leer('../components/CeldaContratadoFicha.tsx')
  assert.match(ficha, /fraseDeOrigenContratado\(origen\)/)
  assert.match(leer('../components/ListasClienteV2.tsx'), /<ContratadoDeLaFicha contratado=\{contratado\} origen=\{e\?\.origen \?\? null\}/)
  assert.match(leer('../components/CeldasDeContrato.tsx'), /fraseDeOrigenContratado\(o\.origenContratado\)/)
})
