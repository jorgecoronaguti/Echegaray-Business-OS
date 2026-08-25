import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL CANÓNICO 13 (PREPARAR OBRA DESDE PRESUPUESTO), CONTRA EL FUENTE DEL MOCKUP ═══
//
// Los valores salieron LEÍDOS de `13 · Preparar Obra desde Presupuesto.dc.html` (estilos inline =
// medidas exactas):
//
//   cols  = "18px minmax(0,1.7fr) 92px 64px minmax(0,1.1fr) 116px", gap 10px
//   cabecera de la tabla  height:36px · rótulos 10px con letterSpacing .05em
//   fila    minHeight:48px · borderBottom 1px #F1F0EC · padding 8px 16px
//   casilla 18×18 · borderRadius 5px · #FDC900 cuando está marcada
//   chips de medición 30×30 · borderRadius 7px · #30302F activo
//   panel derecho 372px · barra fija al pie con borderTop #D7D5CF y 96px de colchón
//
// Lo que se protege es esa MEDIDA: es exactamente lo que un refactor «prolijo» redondea a
// `h-12 gap-2` sin que nada falle.
//
// LO QUE ESTE TEST NO PRUEBA: que la pantalla se vea así en el navegador, ni que la conversión
// escriba. Eso es una captura y una lectura del efecto, y las hace quien no escribió esto.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (archivo: string) => readFileSync(join(DIR, archivo), 'utf8')
const pagina = () => readFileSync(
  join(DIR, '../../../app/(main)/presupuestos/[presupuesto]/convertir/page.tsx'), 'utf8',
)
const accion = () => readFileSync(join(DIR, '../services/actionsConversion.ts'), 'utf8')

test('la tabla usa UNA lista de columnas, la del canónico, para la cabecera y las filas', () => {
  const src = fuente('TablaPreparacionObra.tsx')
  assert.match(src, /const COLS = '18px minmax\(0,1\.7fr\) 92px 64px minmax\(0,1\.1fr\) 116px'/)
  // El defecto que atrapa: que la cabecera se quede con una lista y las filas con otra. La tabla
  // se desalinea entera y ningún test de datos lo nota.
  assert.equal((src.match(/gridTemplateColumns: COLS/g) ?? []).length, 2)
})

test('la fila mide 48px de mínimo y la casilla 18px con radio 5', () => {
  const src = fuente('TablaPreparacionObra.tsx')
  assert.match(src, /grid min-h-\[48px\] items-center gap-2\.5/)
  assert.match(src, /h-\[18px\] w-\[18px\] items-center justify-center rounded-\[5px\] border-\[1\.5px\]/)
  assert.match(src, /border-marca bg-marca/)
})

test('los chips de medición son de 30px con radio 7 y grafito activo', () => {
  const src = fuente('TablaPreparacionObra.tsx')
  assert.match(src, /h-\[30px\] w-\[30px\] items-center justify-center rounded-\[7px\] border/)
  assert.match(src, /border-accent bg-accent text-white/)
})

test('«por pasos» exige la plantilla en la MISMA fila, no en otra pantalla', () => {
  // El defecto que atrapa —y que la base no rechaza sola—: `p_metodo = 'pasos'` con
  // `p_plantilla_id` en null crea la actividad marcada por pasos y sin un solo paso adentro. El
  // avance de esa actividad no se puede medir de ninguna manera.
  const src = fuente('TablaPreparacionObra.tsx')
  assert.match(src, /metodo === 'pasos' && \(/)
  assert.match(src, /data-testid="plantilla-fila"/)
  assert.match(accion(), /metodo === 'pasos' && !plantillaId/)
})

test('la barra fija lleva el colchón de 96px y el hairline del canónico', () => {
  const src = fuente('PreparacionObra.tsx')
  assert.match(src, /pb-\[96px\]/)
  assert.match(src, /fixed inset-x-0 bottom-0 z-40 .*border-t border-line-strong bg-surface/)
  // El defecto que atrapa: una barra sin colchón deja la última fila debajo y no se puede marcar.
  assert.match(src, /data-testid="barra-crear-plan"/)
})

test('la columna derecha mide 372px y publica las tres tarjetas del canónico', () => {
  const src = fuente('PanelPreparacionObra.tsx')
  assert.match(src, /xl:w-\[372px\]/)
  assert.match(src, /La obra que vas a crear/)
  assert.match(src, /data-testid="antes-de-crear"/)
  assert.match(src, /data-testid="lo-que-lleva-el-plan"/)
})

test('la pantalla dibuja la tabla también cuando la conversión está bloqueada', () => {
  // El defecto que atrapa: esconder la lista detrás del cartel «todavía no se puede convertir».
  // Lo que falta se resuelve mirando lo que se estaría preparando, no una pantalla vacía.
  const src = pagina()
  const i = src.indexOf('conversion-bloqueada')
  const j = src.indexOf('<PreparacionObra')
  assert.ok(i > 0 && j > i, 'la tabla dejó de dibujarse con la conversión bloqueada')
})

test('la conversión en lote NO acepta la cantidad del navegador', () => {
  // La regla más cara del módulo: la suma de los frentes iguala la partida. Una cantidad que viaja
  // por el formulario se edita desde la consola del navegador.
  const src = accion()
  assert.match(src, /from\('cotizacion_partida'\)\s*\n?\s*\.select\('id, descripcion, cantidad'\)/)
  assert.match(src, /cantidad: Number\(p\.cantidad\)/)
  assert.equal(/form\.getAll\('frente_cantidad'\)[\s\S]{0,400}convertirPartidasEnLote/.test(src), false)
})

test('una conversión parcial se informa como error, con los nombres de las que faltaron', () => {
  const src = accion()
  assert.match(src, /Quedaron sin convertir/)
  // El defecto que atrapa: devolver ok con «se convirtieron algunas». Obliga a recorrer la lista a
  // ojo para encontrar la que falta, y casi siempre no se recorre.
  assert.match(src, /if \(fallas\.length > 0\) \{\s*\n\s*return \{ ok: false/)
})
