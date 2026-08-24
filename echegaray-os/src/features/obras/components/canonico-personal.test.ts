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
  assert.match(src, /-mx-4 .*border-y border-line bg-surface-quiet px-4 .*lg:-mx-10 lg:px-10/)
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
