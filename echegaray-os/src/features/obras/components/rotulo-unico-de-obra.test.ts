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

test('/obras/hoy del jefe usa el rótulo único, no código y nombre en spans aparte', () => {
  const h = leer('../../../app/(main)/obras/hoy/page.tsx')
  assert.match(h, /<RotuloObra[\s\S]*?testid="elegir-obra"/)
  assert.doesNotMatch(h, /\{o\.codigo && <span/)
  assert.doesNotMatch(h, /\{obra\.codigo \?\? 'Obra'\}/)
})

test('el rótulo envuelve en teléfono (sin elipsis) y dibuja siempre el estado', () => {
  const r = leer('./RotuloObra.tsx')
  assert.match(r, /max-md:!whitespace-normal/)
  assert.match(r, /max-md:!overflow-visible/)
  assert.match(r, /data-testid="estado-obra"/)
  // El estado no puede depender de `etapa`/`nivel`: el defecto era que las obras principales no lo mostraban.
  assert.doesNotMatch(r, /\?\s*<div[^>]*estado-obra/)
})

test('el importe de Clientes no envuelve dentro del número y su columna crece en teléfono', () => {
  assert.match(leer('../../clientes/components/CeldasDeContrato.tsx'), /whiteSpace: 'nowrap' \}\}>\{principal\}/)
  const t = leer('../../clientes/components/TablaClientes.tsx')
  assert.match(t, /whitespace-nowrap font-mono tabular-nums/)
  assert.match(t, /max-\[767px\]:grid-cols-\[minmax\(0,2fr\)_minmax\(150px,max-content\)\]/)
})
