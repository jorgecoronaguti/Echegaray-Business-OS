import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL COMPROBANTE AL LADO DE CADA COMPRA NO ABRE UN SEGUNDO CIRCUITO ═══
//
// Se verifica el fuente, no el render: lo que se protege es DE DÓNDE sale cada acción.
//
//  · UNA COPIA DEL PAPEL. Si la fila pidiera la firma con su propio `storage.from(...)`, o subiera
//    un archivo, el comprobante de la ficha podría no ser el de Compras. Tiene que usar
//    `urlDelAdjunto` y `AccionesCompra`, que son las de Compras, y nada de Storage ni de la cola.
//  · UNA TABLA DUPLICADA. Cada compra de la lista dibuja SU papel en la misma fila; no hay otra
//    tabla de comprobantes.
//  · UN DOCUMENTO QUE SE ENSANCHA A 390px. La lista scrollea adentro de su caja.

const DIR = dirname(fileURLToPath(import.meta.url))
const sinComentarios = (t: string) => t
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
const fila = () => sinComentarios(readFileSync(join(DIR, 'FilaComprobanteProveedor.tsx'), 'utf8'))
const lista = () => sinComentarios(readFileSync(join(DIR, 'ComprasDelProveedor.tsx'), 'utf8'))

test('«Ver comprobante» usa la acción de Compras y pasa el id del adjunto', () => {
  const src = fila()
  assert.match(src, /import \{ urlDelAdjunto \} from '\.\.\/\.\.\/services\/comprasAdjuntoActions'/)
  assert.match(src, /urlDelAdjunto\(papel\.id\)/)
  assert.match(src, /Ver comprobante ↗/)
})

test('vincular es el pie de Compras entero, con la clave y la fila de la compra', () => {
  const src = fila()
  assert.match(src, /import \{ AccionesCompra \} from '\.\.\/AccionesCompra'/)
  assert.match(src, /<AccionesCompra clave=\{c\.clave\} filaCompras=\{c\.fila\} \/>/)
  assert.match(src, /sin comprobante/)
})

test('cada compra de la lista dibuja su papel en su propia fila', () => {
  const src = lista()
  assert.match(src, /visibles\.map\(\(c\) => \(\s*<FilaComprobanteProveedor [^>]*c=\{c\}/)
  assert.match(src, /<RotuloCol>Comprobante<\/RotuloCol>/)
  // Una sola lista: el componente no dibuja una segunda grilla de papeles.
  assert.equal((src.match(/COLS_COMPROBANTES\}/g) ?? []).length, 1)
})

test('ninguna pieza de la lista toca Storage, sube archivos ni escribe la cola', () => {
  for (const src of [fila(), lista()]) {
    assert.doesNotMatch(src, /\.storage\b/)
    assert.doesNotMatch(src, /\.upload\(/)
    assert.doesNotMatch(src, /comprobante_entrada|registrarComprobantes|subirLote/)
    assert.doesNotMatch(src, /\.from\('compra_adjunto'\)/)
  }
})

test('a 390px la lista scrollea adentro de su caja, con ancho mínimo propio', () => {
  const src = lista()
  assert.match(src, /overflowX: 'auto'/)
  // Con la columna «Entrega» (D08) el piso es otro —una columna más y su gap—, pero sigue siendo una
  // constante medida y no un ancho suelto: las dos ramas salen de `columnasComprobantes.ts`.
  assert.match(src, /minWidth: conEntrega \? ANCHO_MINIMO_COMPRAS_CON_ENTREGA : ANCHO_MINIMO_COMPRAS/)
})

// ═══ D08 · LA COLUMNA «ENTREGA» NO PUEDE APARECER VACÍA NI DESALINEAR LA GRILLA ═══
//
// Dos formas de romper esta pantalla, las dos silenciosas:
//
//  · LA COLUMNA SIEMPRE PUESTA. Al 95 % de los proveedores no se les paga en efectivo: una séptima
//    columna vacía en todas las fichas contradice el mockup («la ficha no cambia de forma») y
//    angosta las seis que sí dicen algo.
//  · LA CELDA CONDICIONAL DENTRO DE LA FILA. Si la celda se dibujara sólo cuando ESA compra tiene
//    entrega, las filas sin entrega tendrían seis celdas en una grilla de siete: el comprobante se
//    correría a la columna de la entrega y la lista mostraría cada dato bajo el rótulo equivocado.
//    Por eso la condición es `entregas !== undefined` —lleva la columna o no la lleva— y nunca
//    `entregas.length`.

test('la columna «Entrega» sólo existe si hay alguna compra rendida en efectivo', () => {
  const src = lista()
  assert.match(src, /const conEntrega = entregasDeCadaCompra !== undefined/)
  assert.match(src, /Object\.keys\(entregasDeCadaCompra\)\.length > 0/)
  assert.match(src, /\{conEntrega && <RotuloCol>Entrega<\/RotuloCol>\}/)
  // El encabezado y las filas eligen la MISMA grilla: si una sola de las dos ramas se olvidara, los
  // rótulos dejarían de caer sobre sus columnas.
  assert.match(src, /conEntrega \? COLS_COMPROBANTES_CON_ENTREGA : COLS_COMPROBANTES/)
})

test('la celda de la entrega se dibuja en TODAS las filas de una lista que lleva la columna', () => {
  const src = fila()
  assert.match(src, /\{entregas !== undefined && \(/)
  assert.doesNotMatch(src, /\{entregas\?\.length && \(|\{entregas\.length > 0 && \(/)
  // Y la fila elige su grilla por lo mismo que el encabezado.
  assert.match(src, /entregas === undefined \? COLS_COMPROBANTES : COLS_COMPROBANTES_CON_ENTREGA/)
})
