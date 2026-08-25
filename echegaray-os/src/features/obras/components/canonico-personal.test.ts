import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL CANÓNICO 09 (OBRA PERSONAL), CONTRA EL FUENTE DEL MOCKUP ═══
//
// Medidas leídas de `09 · Obra Personal.dc.html`: banda `background:#FAFAF8` con hairline abajo,
// `padding:0 20px`, buscador de 200px en CAJA (borde 1px, radio 6px) y pastillas con su contador en
// mono de 10,5px. La acción primaria —«Asignar a frente»— es amarilla y vive arriba, no escondida.
//
// LO QUE ESTE TEST NO PRUEBA: que se vea así, ni que asignar escriba. Eso es una captura y una
// lectura del efecto, y las hace quien no escribió esto.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (archivo: string) => readFileSync(join(DIR, archivo), 'utf8')

test('la banda es UNA sola y va a sangre del marco de la ficha de obra', () => {
  const src = fuente('ListaHoyEnObra.tsx')
  // El defecto que atrapa: dos bandas apiladas —la de sub-vistas y la de filtros— que le sacan
  // 40px de alto a la lista que la persona vino a leer.
  //
  // 24/08/2026 · ERA `-mx-4 px-4 lg:-mx-10 lg:px-10` Y ESTABA MAL EN LOS DOS NÚMEROS. El marco de
  // la ficha es `w-full px-5` —20px, sin variante por breakpoint—, así que en escritorio la banda
  // se salía 20px por lado: la auditoría del módulo midió `scrollWidth` 1300 contra `innerWidth`
  // 1280 en Operación y en Documentos, con la página entera scrolleando de costado. 20px además es
  // lo que dice el canónico: `padding:0 20px` en la banda de «09 · Obra Personal.dc.html» y en la
  // de «11 · Obra Operación.dc.html».
  assert.match(src, /-mx-5 .*border-y border-line bg-surface-quiet px-5 /)
  assert.match(src, /data-testid="banda-personal"/)
  assert.match(src, /\{navegacion\}/)
})

test('el buscador de la banda es el de CAJA, no el hairline de arriba de una tabla', () => {
  // Sobre #FAFAF8 el hairline inferior no se ve y el campo queda flotando sin decir dónde empieza.
  const src = fuente('ListaHoyEnObra.tsx')
  assert.match(src, /variante="caja"/)
  assert.match(src, /className="w-\[200px\]"/)
  const ds = readFileSync(join(DIR, '../../../shared/components/ds/Controles.tsx'), 'utf8')
  assert.match(ds, /rounded-\[6px\] border border-line bg-surface px-2 py-1/)
  // Y el default NO cambia: doce pantallas usan el de línea.
  assert.match(ds, /variante = 'linea'/)
})

test('asignar una persona se abre EN LA BANDA, no navegando a otra pantalla', () => {
  const src = fuente('TabPersonal.tsx')
  // El pedido del dueño, literal: «si quiero editar edite ahí mismo, no me sirve que me cargue y me
  // lleve a otro lado». El defecto que atrapa: que la primaria vuelva a ser un `<details>` gris
  // dentro del plegable, dos niveles abajo del pliegue.
  assert.match(src, /accion=\{\s*\n\s*<Alta titulo="\+ Asignar persona" testid="alta-asignacion" primaria>/)
  assert.match(src, /bg-marca px-\[11px\] py-\[6px\]/)
  // Y el formulario es UNO: dos copias se separan en el primer campo que se agregue.
  assert.equal((src.match(/testid="form-asignar"/g) ?? []).length, 1)
})

test('las pastillas y la lista filtran con la MISMA regla, que vive fuera del componente', () => {
  const src = fuente('ListaHoyEnObra.tsx')
  assert.match(src, /cuentasDeHoy, estadoDeFila, filtrarHoy, FILTROS_HOY/)
  // El defecto que atrapa: una pastilla que cuenta con un criterio escrito en el .tsx y una lista
  // que filtra con otro. Dicen dos números distintos de la misma jornada y ningún test lo ve,
  // porque `node --test` no sabe leer un `.tsx`.
  assert.equal(/\.filter\(\(f\) => f\.marca\?\.estado === 'activo'\)/.test(src), false)
})

// ═══ LA MISMA BANDA EN LAS TRES PANTALLAS QUE LA DIBUJAN (canónicos 09, 11 y 12) ═══
//
// Es la misma forma en las tres del zip: fondo #FAFAF8, hairline arriba y abajo, a sangre del marco
// de la ficha. Escrita tres veces se separa en el primer cambio de densidad, y ya estaba separada
// —Operación y Documentos tenían sus controles flotando sobre el canvas, sin banda—.

const BANDA = /-mx-5 flex flex-wrap items-center gap-x-\[14px\] gap-y-2 border-y border-line bg-surface-quiet px-5 py-1\.5/

test('Operación y Documentos dibujan la MISMA banda que Personal', () => {
  assert.match(fuente('TabOperacion.tsx'), BANDA)
  assert.match(fuente('TabDocumentos.tsx'), BANDA)
})

test('el buscador de las tres bandas es el de CAJA, con la medida de su canónico', () => {
  // El defecto que atrapa: dejar el buscador de línea sobre el #FAFAF8, donde su único borde no se
  // ve y el campo queda flotando.
  assert.match(fuente('TabOperacion.tsx'), /variante="caja"[\s\S]{0,200}w-\[206px\]/)
  assert.match(fuente('TabDocumentos.tsx'), /variante="caja"[\s\S]{0,200}w-\[216px\]/)
})

test('en Documentos el buscador y los chips gobiernan la misma lista y viven juntos', () => {
  // El defecto que atrapa —y que estaba vivo—: el buscador en la fila de acciones de arriba y los
  // chips una fila más abajo. Dos controles de la misma lista separados por una fila entera.
  const src = fuente('TabDocumentos.tsx')
  const banda = src.indexOf('LA BANDA DEL CANÓNICO 12')
  const buscador = src.indexOf('testid="buscar-documento-obra"')
  const chips = src.indexOf('testid="chips-categoria-documento"')
  assert.ok(banda > 0 && chips > banda && buscador > chips, 'el buscador volvió a salirse de la banda')
})
