import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL CANÓNICO «23 · PROVEEDOR FICHA v2», VERIFICADO CONTRA EL FUENTE ═══
//
// Mismo método que `canonico-proveedores-v2.test.ts`: se protegen DECISIONES ESCRITAS, no un
// comportamiento de render.
//
// LOS DEFECTOS CAROS QUE ATRAPA:
//
//  · VOLVER A LA TARJETA. La ficha de agosto se dibujaba con `FichaCanonica` —slab blanco con
//    avatar, `TarjetaFicha` con borde y radio, `TiraMetricas` en celdas—. El v2 borra la caja.
//  · PROMETER UN CAMPO QUE NO EXISTE. `public.proveedores` no tiene contacto, teléfono, condición
//    de IVA ni plazo de pago. Dibujarlos en «sin cargar» manda a alguien a buscar dónde cargarlos.
//  · ESCRIBIR 0 DONDE NO SE MIDIÓ. La solapa «Papeles» no puede contar: ninguna tabla vincula un
//    archivo con un proveedor, y un «0» ahí afirma que se contaron y no hay ninguno.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (a: string) => readFileSync(join(DIR, a), 'utf8')
const pagina = () => readFileSync(join(DIR, '../../../app/(main)/administracion/proveedores/[proveedor]/page.tsx'), 'utf8')

const sinComentarios = (texto: string) => texto
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
  })
  .join('\n')

const codigoPagina = () => sinComentarios(pagina())
const codigoListas = () => sinComentarios(fuente('ListasProveedorV2.tsx'))

test('la ficha abre con la miga y el nombre a 24px, no con el slab de agosto', () => {
  const src = codigoPagina()
  assert.match(src, /<Migas/)
  assert.match(src, /<TituloDeFicha/)
  assert.doesNotMatch(src, /CabeceraFicha/, 'el slab blanco con avatar es del canon anterior')
  assert.doesNotMatch(src, /TiraMetricas/, 'las cifras del v2 no van en celdas con borde')
  assert.doesNotMatch(src, /<PageShell/)
})

test('ni la página ni sus listas importan el canon de la caja', () => {
  assert.doesNotMatch(codigoPagina(), /components\/canon\/(?!formato)/)
  assert.doesNotMatch(codigoListas(), /components\/canon\/(?!formato)/)
  assert.doesNotMatch(codigoListas(), /TarjetaFicha|ListaCanon/)
})

test('no hay ninguna acción amarilla: los comprobantes no entran por esta pantalla', () => {
  const src = codigoPagina()
  assert.doesNotMatch(src, /<AccionPrimaria/, 'un amarillo que no lleva a ninguna parte gasta la única primaria')
  assert.match(src, /<AccionSecundaria/)
})

test('contacto, condición de IVA y plazo de pago NO se dibujan como campos', () => {
  const src = codigoPagina()
  assert.doesNotMatch(src, /k="Contacto"/)
  assert.doesNotMatch(src, /k="Teléfono"/)
  assert.doesNotMatch(src, /k="Condición de IVA"/)
  assert.doesNotMatch(src, /k="Plazo de pago"/)
  // Y se dice por qué, una vez, en vez de nueve renglones en «sin cargar».
  assert.match(src, /limites-ficha/)
})

test('la solapa Papeles no lleva contador: no hay nada que contar', () => {
  assert.match(codigoPagina(), /clave: 'papeles', titulo: 'Papeles', cuenta: null/)
})

test('un comprobante sin importe no vale $ 0 y uno sin obra no se dibuja neutro', () => {
  const src = codigoListas()
  assert.match(src, /f\.total === null \? 'sin importe'/)
  assert.match(src, /sin obra imputada/)
  // El filo de un comprobante sin obra es ROJO: el gasto ya ocurrió y no le pesa a ninguna obra.
  assert.match(src, /inset 2px 0 0 \$\{V\.neg\}/)
})

test('un paquete sin precio no vale $ 0', () => {
  assert.match(codigoListas(), /p\.precio === null \? 'sin precio'/)
})

test('«contratado» es ausencia y no cero cuando ningún paquete tiene precio', () => {
  assert.match(codigoPagina(), /conPrecio\.length === 0 \? null/)
})

test('el total recortado del jefe de obra se rotula por lo que es', () => {
  assert.match(codigoPagina(), /Comprado en tus obras/)
  assert.match(codigoPagina(), /alcance-jefe-obra/)
})

test('las cinco caras del mockup están, y Compras es la que abre', () => {
  const src = codigoPagina()
  for (const c of ['compras', 'nombres', 'obras', 'paquetes', 'papeles']) {
    assert.match(src, new RegExp(`clave: '${c}'`), `falta la cara ${c}`)
  }
  assert.match(src, /esCara\(vista\) \? vista : 'compras'/)
})

test('«no se pudo leer» sigue siendo distinto de «no existe»', () => {
  const src = codigoPagina()
  assert.match(src, /if \(ficha\.error\) return <EstadoError/)
  assert.match(src, /if \(!ficha\.data\) notFound\(\)/)
})
