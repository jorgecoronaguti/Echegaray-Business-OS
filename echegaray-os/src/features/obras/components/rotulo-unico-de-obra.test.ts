// El rótulo de obra («OB-0012 · NOMBRE» + estado debajo) se dibuja con UN componente en la Tabla, el
// Gantt y el CRM de Clientes (dueño, 29/09/2026). Si una vista vuelve a armar su propio nombre, esto se pone rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

test('el Gantt dibuja la obra con la celda de la Tabla y no con un nombre propio', () => {
  const g = leer('./GanttObras.tsx')
  assert.match(g, /<CeldaObra /)
  assert.match(g, /<NombreTelefono /)
  assert.doesNotMatch(g, /nombreCortoGantt\(/)
})

test('el CRM de Clientes rotula cada obra con rotuloDeObra y el código leído aparte', () => {
  const t = leer('../../clientes/components/TablaClientes.tsx')
  // Anclado al HIJO renderizado (tras el «└» opcional), no al atributo title: el title también lleva
  // el rótulo y dejaba el test verde aunque el texto visible perdiera el código.
  assert.match(t, /: null\}\{rotuloDeObra\(\{ nombre: o\.nombre, codigo: codigos\.get\(o\.obra_id\) \}\)\}\s*<\/span>/)
  assert.doesNotMatch(t, /\{o\.nombre\}\s*<\/span>/)
  assert.match(leer('../../../app/(main)/clientes/page.tsx'), /codigosDeObra\(supabase, null\)/)
})
