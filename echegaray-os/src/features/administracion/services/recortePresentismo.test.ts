// EL RECORTE «PRESENTISMO» DE LIQUIDACIÓN (dueño, 01/10/2026): quién lo gana y quién no, con el mismo estado
// que dibuja la celda. Se prueba la clasificación y que el parámetro viaja de la URL al cuadro.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { claseDePresentismo, pasaPresentismo, presentismoPedido } from './recorteDeLiquidacion.ts'

const leer = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

test('gana: cumple o restituido (estado aplica); no gana: perdido', () => {
  assert.equal(claseDePresentismo({ estado: 'aplica', perdido: [] }), 'gana')
  assert.equal(claseDePresentismo({ estado: 'perdido', perdido: ['2026-09-18'] }), 'no_gana')
})

test('sin horas pero con una falta o tardanza cargada ya no lo gana; sin causa no está en ninguno', () => {
  assert.equal(claseDePresentismo({ estado: 'sin_horas', perdido: ['2026-09-18'] }), 'no_gana')
  assert.equal(claseDePresentismo({ estado: 'sin_horas', perdido: [] }), null)
})

test('mensual, no rige, sin categoría o línea sin presentismo: sólo en «Todos»', () => {
  for (const estado of ['no_aplica', 'no_rige', 'sin_categoria']) {
    const p = { estado, perdido: [] }
    assert.equal(claseDePresentismo(p), null)
    assert.equal(pasaPresentismo(p, 'todos'), true)
    assert.equal(pasaPresentismo(p, 'gana'), false)
    assert.equal(pasaPresentismo(p, 'no_gana'), false)
  }
  assert.equal(pasaPresentismo(null, 'todos'), true)
  assert.equal(pasaPresentismo(null, 'no_gana'), false)
})

test('un valor desconocido en la URL es «todos»', () => {
  assert.equal(presentismoPedido(undefined), 'todos')
  assert.equal(presentismoPedido('cualquiera'), 'todos')
  assert.equal(presentismoPedido('no_gana'), 'no_gana')
})

test('el parámetro viaja: página → solapa → filas y totales, y el buscador lo conserva', () => {
  const pagina = leer('../../../app/(main)/administracion/personas/page.tsx')
  assert.match(pagina, /parametros=\{\{[^}]*presentismo: sp\.presentismo/)
  assert.match(pagina, /presentismo: base\.presentismo/)
  const solapa = leer('../components/liquidacion/solapas/quincena.tsx')
  assert.match(solapa, /\.filter\(\(f\) => pasaPresentismo\(f\.linea\.presentismo, presentismo\)\)/)
  assert.match(solapa, /totalesDelEspejo\(visibles\)/, 'el pie se calcula sobre lo recortado')
  assert.match(solapa, /presentismo === 'todos' \? \{\} : \{ presentismo \}/)
})
