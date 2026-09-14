import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ LA SOLAPA «COMPROBANTES» NO ABRE UN SEGUNDO CIRCUITO ═══
//
// Se verifica el fuente, no el render: lo que se protege es DE DÓNDE sale cada acción.
//
//  · UNA COPIA DEL PAPEL. Si la fila pidiera la firma con su propio `storage.from(...)`, o subiera
//    un archivo, el comprobante de la ficha podría no ser el de Compras. Tiene que usar
//    `urlDelAdjunto` y `AccionesCompra`, que son las de Compras, y nada de Storage ni de la cola.
//  · UN DOCUMENTO QUE SE ENSANCHA A 390px. La tabla tiene que scrollear adentro de su caja.

const DIR = dirname(fileURLToPath(import.meta.url))
const sinComentarios = (t: string) => t
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
const fila = () => sinComentarios(readFileSync(join(DIR, 'FilaComprobanteProveedor.tsx'), 'utf8'))
const tabla = () => sinComentarios(readFileSync(join(DIR, 'ComprobantesDelProveedor.tsx'), 'utf8'))

test('«Ver comprobante» usa la acción de Compras y pasa el id del adjunto', () => {
  const src = fila()
  assert.match(src, /import \{ urlDelAdjunto \} from '\.\.\/\.\.\/services\/comprasAdjuntoActions'/)
  assert.match(src, /urlDelAdjunto\(papel\.id\)/)
})

test('vincular es el pie de Compras entero, con la clave y la fila de la compra', () => {
  const src = fila()
  assert.match(src, /import \{ AccionesCompra \} from '\.\.\/AccionesCompra'/)
  assert.match(src, /<AccionesCompra clave=\{c\.clave\} filaCompras=\{c\.fila\} \/>/)
})

test('ninguna pieza de la solapa toca Storage, sube archivos ni escribe la cola', () => {
  for (const src of [fila(), tabla()]) {
    assert.doesNotMatch(src, /\.storage\b/)
    assert.doesNotMatch(src, /\.upload\(/)
    assert.doesNotMatch(src, /comprobante_entrada|registrarComprobantes|subirLote/)
    assert.doesNotMatch(src, /\.from\('compra_adjunto'\)/)
  }
})

test('a 390px la tabla scrollea adentro de su caja, con ancho mínimo propio', () => {
  const src = tabla()
  assert.match(src, /overflowX: 'auto'/)
  assert.match(src, /minWidth: ANCHO_MINIMO/)
})
