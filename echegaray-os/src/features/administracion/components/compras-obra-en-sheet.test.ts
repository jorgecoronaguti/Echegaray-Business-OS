// LA VUELTA SE VE: la pantalla de Compras dice en qué punto del viaje al Sheet quedó la obra elegida.
//
// Test de forma (lee el código fuente): la página lee la cola para la fila abierta, el panel la pasa al
// editor y el editor la dibuja con la MISMA leyenda que el pago. Si alguien saca un eslabón, esto se
// pone rojo antes de que el dueño vea desaparecer una obra sin explicación.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const aqui = dirname(fileURLToPath(import.meta.url))
const codigo = (p: string) => readFileSync(join(aqui, p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('la página lee la cola de obra de la fila abierta y se la pasa al panel como estado + motivo', () => {
  const pagina = codigo('../../../app/(main)/administracion/compras/page.tsx')
  assert.match(pagina, /obraEnCola\(supabase, \[filaAbierta\.fila\]\)/)
  assert.match(pagina, /obraEnSheet=\{estadoEnSheet\(obraCola\.get\(filaAbierta\.fila\)\)\}/)
  assert.match(pagina, /obraMotivo=\{obraCola\.get\(filaAbierta\.fila\)\?\.motivo \?\? null\}/)
})

test('el panel lo entrega al editor, y el editor lo dibuja con leyendaDeSheet (una sola forma de decir «pendiente de Sheet»)', () => {
  const panel = codigo('PanelCompraSheet.tsx')
  assert.match(panel, /<EditorObraDeCompra[\s\S]*?enSheet=\{obraEnSheet\} motivo=\{obraMotivo\}/)
  const editor = codigo('EditorObraDeCompra.tsx')
  assert.match(editor, /leyendaDeSheet\(enSheet, motivo\)/)
  assert.match(editor, /data-testid="obra-en-sheet"/)
  assert.doesNotMatch(editor, /pendiente de Sheet/, 'el texto no se duplica: vive en pagoDeCompra.ts')
})

test('la consulta filtra Compras · obra: la misma cola lleva Cobranzas y pagos', () => {
  const servicio = codigo('../services/obraDeCompraService.ts')
  assert.match(servicio, /from\('compra_obra_cambio'\)[\s\S]*?\.eq\('pestana', 'Compras'\)\.eq\('tipo', 'obra'\)/)
})
