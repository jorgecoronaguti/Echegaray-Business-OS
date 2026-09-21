// UN IDENTIFICADOR QUE SE LE MUESTRA A UNA PERSONA SALE DE LA BASE, NO DE LA URL.
//
// Dueño, 15/09/2026, mirando la ficha de Franco Quattropani: «si hemos creado todo un circuito de id
// de obra sigue diciendo cualquier cosa. revisar en todo — esto me demuestra que no trabajás en base
// a bd supabase». Lo que veía era `clientes.slug` («quattropani») bajo el rótulo «Identificador»: una
// cadena que la app fabrica del nombre para armar la URL y que no existe en ningún papel, ningún
// contrato y ninguna pestaña del Sheet.
//
// LA REGLA, UNA SOLA, PARA TODA LA APP:
//
//   · La OBRA se identifica por `obra_canonica.codigo` («OB-0008») y se rotula «código · nombre» con
//     `rotuloDeObra`. El slug (`obra_canonica.id`) es la URL, no el identificador.
//   · El CLIENTE no tiene código y NO se le inventa uno: `clientes` tiene id, slug, nombre_comercial,
//     razon_social y cuit. Lo identifica su CUIT, y a sus trabajos los identifica el código de obra.
//   · Un identificador de otra entidad se muestra sólo si es la columna que la BASE usa como
//     identidad (`herramientas.id_herramienta`), nunca un slug derivado de un texto.
//
// Es un test de FUENTE: mira el código, no el render. Un test de render no podría probar que el dato
// viene de Supabase y no de una cadena armada en el cliente, que es exactamente lo que falló.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = new URL('../../', import.meta.url).pathname
const leer = (ruta: string) => readFileSync(join(SRC, ruta), 'utf8')
const archivos = (dir: string): string[] =>
  readdirSync(join(SRC, dir), { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => join(dir, f))

const FICHA_CLIENTE = 'features/clientes/components/BloqueInformacion.tsx'
const ALTA_OBRA = 'app/(main)/obras/nueva/page.tsx'

test('la ficha del cliente NO rotula «Identificador» con el slug', () => {
  const fuente = leer(FICHA_CLIENTE)
  const renglones = [...fuente.matchAll(/<Propiedad rotulo=(?:"([^"]*)"|\{[^}]*\})>([\s\S]*?)<\/Propiedad>/g)]
  const identificador = renglones.find(([, rotulo]) => rotulo === 'Identificador')
  assert.equal(identificador, undefined, 'volvió el renglón «Identificador»: el cliente no tiene uno propio en la base')
  assert.ok(!/cliente\.slug/.test(fuente), 'la ficha volvió a dibujar `clientes.slug`: es la URL, no una identidad')
})

test('la ficha del cliente identifica por CUIT y por las obras con su código', () => {
  const fuente = leer(FICHA_CLIENTE)
  assert.match(fuente, /rotulo="CUIT"/, 'el CUIT es lo que identifica al cliente afuera y tiene que estar')
  // Las obras llegan YA rotuladas desde la página, que las arma con `rotuloDeObra` y el código leído
  // de `obra_canonica`. El bloque no puede rearmarlas: dos rótulos para la misma obra es el defecto.
  assert.match(fuente, /obras: ObraDelCliente\[\]/, 'el bloque dejó de recibir las obras del cliente')
  assert.match(fuente, /obras\.map\(\(o\) =>/, 'el bloque recibe las obras pero no las dibuja')

  const pagina = leer('app/(main)/clientes/[cliente]/page.tsx')
  assert.match(
    pagina, /obras=\{todas\.map\(\(o\) => \(\{ obra_id: o\.obra_id, rotulo: o\.nombre \}\)\)\}/,
    'la página dejó de pasarle al costado las obras ya rotuladas con «OB-0008 · NOMBRE»',
  )
})

test('el alta de obra muestra el CÓDIGO de obra_canonica, no el slug de la URL', () => {
  const fuente = leer(ALTA_OBRA)
  assert.match(fuente, /codigosDeObra\(supabase, \[obraId\]\)/, 'el código dejó de leerse de la base')
  assert.match(fuente, /\['Código', codigo\]/, 'la ficha del paso 1 dejó de mostrar el código')
  assert.ok(
    !/\['Identificador', obraId\]/.test(fuente),
    'volvió «Identificador: <slug>»: el identificador de una obra es su código, que no cambia al renombrarla',
  )
})

test('la ficha del proveedor dice a qué OBRA llegó el gasto, no sólo qué dice el papel', () => {
  const servicio = leer('features/administracion/services/comprobantesProveedorService.ts')
  assert.match(servicio, /from\('compra_obra_asignada'\)/, 'la asignación canónica dejó de leerse')
  // Y ANTES QUE LA INFERENCIA, LA CELDA QUE ALGUIEN ELIGIÓ. Desde el 15/09/2026 la ficha lee las dos
  // con `obraDeLaCompra`, la misma función de Compras: leer sólo una de las dos es lo que hacía que
  // la misma factura mostrara obras distintas según la pantalla.
  assert.match(servicio, /obraDeLaCompra\(celda, porFila\.get\(c\.fila\), rotulos\)/, 'la ficha dejó de leer la obra con la regla de Compras')
  const fila = leer('features/administracion/components/proveedores/FilaComprobanteProveedor.tsx')
  assert.match(fila, /rotulo=\{c\.obra\.rotulo\}/, 'la fila volvió a dibujar sólo el texto libre del Sheet')
})

/**
 * EL BARRIDO. Cualquier pantalla que rotule «Identificador» tiene que estar declarada acá con la
 * COLUMNA de Supabase que muestra. Una pantalla nueva que invente un identificador se pone roja sola.
 */
// Vacío desde el 21/09/2026: la ficha vieja de herramientas (`FichaHerramienta.tsx`, que rotulaba
// `herramientas.id_herramienta`) se retiró con el módulo Herramientas nuevo, que muestra `activo.codigo`
// sin rotularlo «Identificador».
const IDENTIFICADORES_LEGITIMOS: Record<string, string> = {}

test('todo rótulo «Identificador» de la app muestra una columna de la base, declarada acá', () => {
  const conRotulo = archivos('.').filter((f) => /["'>]Identificador["'<]/.test(leer(f)))
  assert.deepEqual(
    conRotulo.map((f) => f.replace(/^\.\//, '')).sort(),
    Object.keys(IDENTIFICADORES_LEGITIMOS).sort(),
  )
  for (const [archivo, columna] of Object.entries(IDENTIFICADORES_LEGITIMOS)) {
    assert.ok(leer(archivo).includes(columna), `${archivo}: «Identificador» dejó de mostrar ${columna}`)
  }
})
