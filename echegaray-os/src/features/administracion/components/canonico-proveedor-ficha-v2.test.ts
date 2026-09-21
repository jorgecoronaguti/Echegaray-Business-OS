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
//  · PROMETER UN CAMPO QUE NO EXISTE. `public.proveedores` no tiene condición de IVA ni plazo de
//    pago. Dibujarlos en «sin cargar» manda a alguien a buscar dónde cargarlos.
//  · UN SEGUNDO MODELO DE CONTACTO. Desde el 21/09/2026 los contactos SÍ existen
//    (`proveedor_contacto`), y se dibujan con el MISMO bloque del cliente, en el lugar del mockup.
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

test('condición de IVA y plazo de pago NO se dibujan como campos', () => {
  const src = codigoPagina()
  assert.doesNotMatch(src, /k="Condición de IVA"/)
  assert.doesNotMatch(src, /k="Plazo de pago"/)
  // Y se dice por qué, una vez, en vez de nueve renglones en «sin cargar».
  assert.match(src, /limites-ficha/)
  // El pie ya no puede decir que el contacto no tiene dónde guardarse: desde el 21/09 lo tiene.
  assert.doesNotMatch(pagina(), /Contacto, teléfono, condición de IVA/)
})

// ═══ LOS CONTACTOS (pedido del dueño, 21/09/2026) ═══
// «no tengo forma de agregar personas a los proveedores […] no puedo dejar asentado un nombre un
// contacto nada».

test('los contactos se dibujan con el bloque del cliente, no con un DatoDeCostado suelto', () => {
  const src = codigoPagina()
  assert.match(src, /<BloqueContactos/)
  assert.match(src, /from '@\/features\/clientes\/components\/BloqueContactos'/)
  // Un solo campo «Contacto» guardaría UNA persona; el proveedor tiene quien vende, factura y cobra.
  assert.doesNotMatch(src, /k="Contacto"/)
  assert.doesNotMatch(src, /k="Teléfono"/)
  // Alta, edición y baja atadas a las acciones de SU tabla, no a las del cliente.
  assert.match(src, /crear=\{crearContactoProveedor\.bind\(null, proveedor\.id\)\}/)
  assert.match(src, /editar=\{\(c\) => editarContactoProveedor\.bind\(null, c\)\}/)
  assert.match(src, /borrar=\{borrarContactoProveedor\}/)
  assert.doesNotMatch(src, /crearContacto\.bind|borrar=\{borrarContacto\}/)
})

test('los contactos van en el costado, entre Identidad y «Dónde se le compra» (lugar del mockup)', () => {
  const src = codigoPagina()
  const costado = src.indexOf('<CostadoDeFicha')
  const identidad = src.indexOf('>Identidad<')
  const bloque = src.indexOf('<BloqueContactos')
  const donde = src.indexOf('>Dónde se le compra<')
  assert.ok(costado > 0 && identidad > costado, 'no encontré el costado')
  assert.ok(bloque > identidad && bloque < donde, 'los contactos no están entre Identidad y «Dónde se le compra»')
})

test('la tabla que falta y el error de lectura se dicen; ninguno se dibuja como «sin contactos»', () => {
  const src = codigoPagina()
  assert.match(src, /contactos\.estado === 'sin-tabla'/)
  assert.match(src, /contactos\.estado === 'error'/)
  assert.match(src, /contactos\.estado === 'ok' && \(\s*<BloqueContactos/)
})

// ═══ EL COMPROBANTE AL LADO DE CADA COMPRA (pedido del dueño, 14/09/2026) ═══
// «no quiero una solapa de comprobantes en proveedores, quiero los comprobantes adjuntos al lado de
// cada compra hecha, tal como aparece en pestaña compras».

test('no hay solapa Comprobantes ni Papeles: el papel va en la lista de compras', () => {
  const src = codigoPagina()
  assert.doesNotMatch(src, /clave: 'comprobantes'/)
  assert.doesNotMatch(src, /clave: 'papeles'/)
  assert.doesNotMatch(src, /CARAS = \[[^\]]*'(comprobantes|papeles)'/)
})

test('los enlaces viejos ?vista=papeles y ?vista=comprobantes abren la lista de compras', () => {
  const src = codigoPagina()
  assert.match(src, /const CARAS_RETIRADAS = new Set\(\['papeles', 'comprobantes'\]\)/)
  assert.match(src, /sp\.vista && CARAS_RETIRADAS\.has\(sp\.vista\) \? 'compras' : sp\.vista/)
})

test('la lista de compras y las cifras leen proveedor_compra, no la cadena de costos_obra', () => {
  const src = codigoPagina()
  assert.match(src, /getComprasConPapel\(supabase, proveedor\.id\)/)
  assert.match(src, /comoComprobantes\(compras\.data\.filas\)/)
  assert.match(src, /<ComprasDelProveedor/)
  assert.doesNotMatch(src, /getComprobantes\b/)
  assert.doesNotMatch(fuente('../services/fichaProveedorService.ts'), /from\('costos_obra'\)/)
  // Quien no ve Compras no pide las compras.
  assert.match(src, /const veCompras = esAdministracion\(/)
})

test('un comprobante sin importe no vale $ 0 y uno sin obra no se dibuja neutro', () => {
  const src = sinComentarios(fuente('proveedores/FilaComprobanteProveedor.tsx'))
  assert.match(src, /c\.total === null \? 'sin importe'/)
  // CAMBIO DE CONTRATO (15/09/2026): la obra la dibuja `ObraEnLinea`, el MISMO control de Compras,
  // que para una fila sin obra dice «sin imputar» en rojo. El texto propio de esta fila —«sin obra
  // imputada»— salió con el componente local: dos redacciones para el mismo estado en dos pantallas
  // es la clase de diferencia que hace dudar de si son el mismo dato.
  const control = sinComentarios(fuente('ObraEnLinea.tsx'))
  assert.match(src, /<ObraEnLinea/, 'la fila dejó de usar el control de obra de Compras')
  assert.match(control, /'sin imputar'/, 'el control dejó de decir que la fila no tiene obra')
  assert.match(control, /color: rotulo \? V\.tintaSuave : V\.neg/, 'una fila sin obra dejó de dibujarse en rojo')
  // El filo de un comprobante sin obra es ROJO: el gasto ya ocurrió y no le pesa a ninguna obra.
  assert.match(src, /inset 2px 0 0 \$\{V\.neg\}/)
})

test('un paquete sin precio no vale $ 0', () => {
  assert.match(codigoListas(), /p\.precio === null \? 'sin precio'/)
})

test('«contratado» es ausencia y no cero cuando ningún paquete tiene precio', () => {
  assert.match(codigoPagina(), /conPrecio\.length === 0 \? null/)
})

test('el total ya no se rotula «en tus obras»: la vista no recorta por obra', () => {
  // `proveedor_compra` hereda `es_administracion()`, la policy que deja al jefe ver Compras entera.
  // Un rótulo de recorte sobre un total sin recorte afirmaría algo falso.
  assert.doesNotMatch(codigoPagina(), /Comprado en tus obras/)
  assert.match(codigoPagina(), /rotulo: 'Comprado · histórico'/)
})

test('las cinco caras del mockup están, y Compras es la que abre', () => {
  const src = codigoPagina()
  for (const c of ['compras', 'nombres', 'obras', 'paquetes', 'documentos']) {
    assert.match(src, new RegExp(`clave: '${c}'`), `falta la cara ${c}`)
  }
  assert.match(src, /esCara\(vista\) \? vista : 'compras'/)
})

test('«no se pudo leer» sigue siendo distinto de «no existe»', () => {
  const src = codigoPagina()
  assert.match(src, /if \(ficha\.error\) return <EstadoError/)
  assert.match(src, /if \(!ficha\.data\) notFound\(\)/)
})
