import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ LA FICHA DEL PROVEEDOR CAMBIA LA OBRA CON EL MISMO CONTROL QUE COMPRAS ═══
//
// El dueño, 15/09/2026: «imputar bien las compras a cada obra, al centavo en app.ecsas.com.ar, y
// también en la sección Proveedores». Se verifica el fuente, no el render: lo que se protege es que
// la fila use `<ObraEnLinea>` de Compras —que entra por `compra_obra_asignar`, la única puerta— y no
// un segundo componente de sólo lectura ni una segunda puerta a la base; que la lista y la página le
// pasen las opciones y si se puede editar; y que la acción revalide la ficha al confirmar.

const DIR = dirname(fileURLToPath(import.meta.url))
const sinComentarios = (t: string) => t
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
const leer = (rel: string) => sinComentarios(readFileSync(join(DIR, rel), 'utf8'))
const fila = () => leer('FilaComprobanteProveedor.tsx')
const lista = () => leer('ComprasDelProveedor.tsx')
const accion = () => leer('../../services/obraDeCompraActions.ts')
const pagina = () => leer('../../../../app/(main)/administracion/proveedores/[proveedor]/page.tsx')

test('la fila dibuja la obra con <ObraEnLinea> de Compras, no con un componente propio de sólo lectura', () => {
  const src = fila()
  assert.match(src, /import \{ ObraEnLinea \} from '\.\.\/ObraEnLinea'/)
  assert.match(src, /<ObraEnLinea\s[\s\S]*?fila=\{c\.fila\}[\s\S]*?celda=\{c\.obra\.celda\}[\s\S]*?rotulo=\{c\.obra_rotulo\}[\s\S]*?\/>/)
  assert.match(src, /inferida=\{c\.obra\.origen === 'inferida'\}/)
  assert.match(src, /opciones=\{opcionesObra\}/)
  assert.match(src, /editable=\{obraEditable\}/)
  assert.doesNotMatch(src, /function ObraDeLaCompra|<ObraDeLaCompra/, 'volvió el componente de sólo lectura')
  // Ninguna segunda puerta: ni fetch ni cliente propio ni escritura de compra_sheet.
  for (const puerta of ['fetch(', 'createClient', "from('compra_sheet')", 'compra_obra_asignar']) {
    assert.equal(src.includes(puerta), false, `la fila abrió su propia puerta a la base: ${puerta}`)
  }
})

test('la lista y la página le pasan a cada fila las MISMAS opciones que Compras y si se puede editar', () => {
  const l = lista()
  assert.match(l, /opcionesObra: string\[\]/)
  assert.match(l, /const \{ filas, truncado, papelesSinLeer, obraEditable \} = lectura\.data/)
  assert.match(l, /<FilaComprobanteProveedor[\s\S]*?opcionesObra=\{opcionesObra\} obraEditable=\{obraEditable\}/)
  const p = pagina()
  assert.match(p, /import \{ getOpcionesDeObra \} from '@\/features\/administracion\/services\/obraDeCompraService'/)
  assert.match(p, /getOpcionesDeObra\(supabase\)/)
  assert.match(p, /<ComprasDelProveedor[\s\S]*?opcionesObra=\{opcionesObra\}/)
})

test('al confirmar, la acción revalida la ficha del proveedor además de Compras', () => {
  const a = accion()
  assert.match(a, /revalidatePath\(RUTA\)/)
  assert.match(a, /revalidatePath\(RUTA_PROVEEDOR, 'page'\)/)
  assert.match(a, /const RUTA_PROVEEDOR = '\/administracion\/proveedores\/\[proveedor\]'/)
})
