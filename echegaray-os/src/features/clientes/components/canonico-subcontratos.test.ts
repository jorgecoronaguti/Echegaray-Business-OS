import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ═══ LA COLUMNA SUBCONTRATOS EN EL CRM (dueño, 14/09/2026) ═══
//
// «quiero columna subcontrato en crm admin clientes y q lo discrimine». QUÉ DEFECTOS ATRAPA: que la
// columna no esté entre Materiales y Mano de obra en la ficha o en la cartera, que la celda formatee por
// su cuenta en vez de delegar en `costosDeObra.ts`, que el teléfono pierda la cifra, o que la fila «sin
// obra» vuelva a meter los subcontratos dentro de Materiales.

const DIR = dirname(fileURLToPath(import.meta.url))
const leer = (f: string): string => readFileSync(join(DIR, f), 'utf8')

test('la cartera dibuja Subcontratos entre Materiales y Mano de obra, con su pista', () => {
  const src = leer('./TablaClientes.tsx')
  const i = (t: string) => src.indexOf(`texto="${t}"`)
  assert.ok(i('Materiales') > 0 && i('Materiales') < i('Subcontratos') && i('Subcontratos') < i('Mano de obra'),
    'el orden dejó de ser Materiales · Subcontratos · Mano de obra')
  // OTROS (puente 18/09/2026) entre Subcontratos y Mano de obra, con su propia pista de 130px.
  assert.ok(i('Subcontratos') < i('Otros') && i('Otros') < i('Mano de obra'), 'Otros no está entre Subcontratos y Mano de obra')
  assert.match(src, /grid-cols-\[minmax\(0,2fr\)_150px_130px_130px_130px_140px_210px\]/)
})

test('la ficha dibuja Subcontratos entre Materiales y Mano de obra, y la celda delega', () => {
  const src = leer('./ListasClienteV2.tsx')
  const h = (t: string) => src.indexOf(`<RotuloCol derecha>${t}</RotuloCol>`)
  assert.ok(h('Materiales') > 0 && h('Materiales') < h('Subcontratos') && h('Subcontratos') < h('Mano de obra'))
  const desde = src.indexOf('data-testid="subcontratos-obra-cliente"')
  assert.ok(desde > 0, 'no está la celda de subcontratos de la obra')
  const celda = src.slice(desde, src.indexOf('</span>', desde))
  assert.match(celda, /textoSubcontratos\(costoDeLaObra\)/)
  assert.match(celda, /tituloSubcontratos\(costoDeLaObra\)/)
  assert.doesNotMatch(celda, /toLocaleString|\?\? 0|Math\.round/)
})

test('las celdas de costo de la cartera son tres, en orden, y la línea angosta también dice Sub.', () => {
  const costo = leer('./CeldasDeCosto.tsx')
  const celdas = costo.slice(costo.indexOf('function Celdas('), costo.indexOf('function LineaAngosta'))
  const orden = ['materiales-', 'subcontratos-', 'mano-obra-'].map((t) => celdas.indexOf(`testid={\`${t}`))
  assert.ok(orden[0] > 0 && orden[0] < orden[1] && orden[1] < orden[2], 'las celdas no son Materiales · Subcontratos · Mano de obra')
  const linea = costo.slice(costo.indexOf('function LineaAngosta'), costo.indexOf('export function CostoDeLaObra'))
  assert.match(linea, /<span>Sub\.<\/span>/, 'en el teléfono se perdió la cifra de subcontratos')
})

test('la fila sin obra pone los subcontratos en su columna, no dentro de Materiales', () => {
  const src = leer('./CostoALaFecha.tsx')
  assert.match(src, /data-testid="subcontratos-sin-obra-cliente"/)
  assert.match(src, /plata\(gasto\?\.materiales/)
})

test('el pie del cliente suma Subcontratos aparte, y la mano de obra ya no dice «× cargas»', () => {
  const src = leer('./PieDeLosTrabajos.tsx')
  assert.match(src, /data-testid="subcontratos-del-cliente"/)
  assert.doesNotMatch(src, /× cargas|× horas × cargas/)
  for (const f of ['./TablaClientes.tsx', './ListasClienteV2.tsx']) {
    assert.doesNotMatch(leer(f), /multiplicador de cargas|× cargas\)/, `${f} sigue explicando la mano de obra con el multiplicador`)
  }
})
