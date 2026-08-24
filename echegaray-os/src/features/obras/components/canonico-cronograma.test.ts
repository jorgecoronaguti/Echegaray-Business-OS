import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL CANÓNICO 07 (OBRA CRONOGRAMA), VERIFICADO CONTRA EL FUENTE DEL MOCKUP ═══
//
// Los valores de acá salieron LEÍDOS de `07 · Obra Cronograma.dc.html` (estilos inline = medidas
// exactas): `DAYW = 26, ROWH = 36`, cabecera de 46 partida en 22 + 24, base `top:6 h:4`, barra
// `top:13 h:15 r:4`, resumen `top:18 h:5`, y el pie como tarjeta de celdas con la cifra en mono de
// 20px/600. Lo que se protege es esa MEDIDA: es exactamente lo que un refactor «prolijo» redondea
// a `top-4 h-4` sin que nada falle.
//
// LO QUE ESTE TEST NO PRUEBA: que la pantalla se vea así en el navegador. Eso es una captura, y la
// saca quien no escribió esto.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (archivo: string) => readFileSync(join(DIR, archivo), 'utf8')
const franja = () => readFileSync(join(DIR, '../../../shared/components/ds/Franja.tsx'), 'utf8')
const pagina = () => readFileSync(join(DIR, '../../../app/(main)/obras/[obra]/cronograma/page.tsx'), 'utf8')

test('la franja es una TARJETA de celdas con hairline, no una barra pegada al pie', () => {
  const src = franja()
  // El defecto que atrapa: volver a la barra `sticky bottom-0 h-statusbar` con el número en sans
  // de 15px. El mockup dibuja una tarjeta —`rounded-card border`— partida por hairline.
  assert.equal(/sticky bottom-0/.test(src), false, 'la franja volvió a ser una barra flotante')
  assert.equal(/h-statusbar/.test(src), false, 'la franja volvió al alto fijo de 56px')
  assert.match(src, /rounded-card border border-line bg-surface/)
  assert.match(src, /border-r border-\[color:var\(--os-surface-sunken\)\]/)
})

test('la cifra de la franja es mono 20px/600 y el rótulo 10,5px sin versalitas', () => {
  const src = franja()
  assert.match(src, /font-mono text-\[20px\] font-semibold leading-\[1\.15\]/)
  assert.match(src, /text-\[10\.5px\] tracking-\[0\.04em\] text-faint/)
  // El defecto que atrapa: forzar mayúsculas en el rótulo. El mockup escribe «Fin de línea base»;
  // en versalitas ese rótulo pasa de dato al pie a título de sección y le gana a la cifra.
  assert.equal(/uppercase/.test(src), false, 'el rótulo de la franja volvió a las versalitas')
})

test('la fila mide 36px y las DOS columnas leen el mismo número', () => {
  const lienzo = fuente('LienzoCronogramaObra.tsx')
  const tabla = fuente('TablaCronogramaObra.tsx')
  assert.match(lienzo, /const ALTO_FILA = 36\b/)
  assert.match(lienzo, /altoFila=\{ALTO_FILA\} altoCabecera=\{ALTO_HEAD\}/)
  // El defecto que atrapa: que la tabla vuelva a tener su propio alto. Con dos constantes, la barra
  // deja de estar en la fila de su actividad y ningún test lo nota.
  assert.equal(/ALTO_FILA|h-\[3[0-9]px\]/.test(tabla), false, 'la tabla se fijó un alto propio')
  assert.match(tabla, /style=\{\{ height: altoFila \}\}/)
})

test('las tres capas van en las alturas medidas del mockup', () => {
  const src = fuente('LienzoCronogramaObra.tsx')
  assert.match(src, /top-\[6px\] h-\[4px\] rounded-\[2px\] bg-line-strong/) // línea base
  assert.match(src, /top-\[13px\] h-\[15px\] overflow-hidden rounded-\[4px\]/) // barra de plan
  assert.match(src, /top-\[13px\] h-\[15px\] rounded-\[4px\] border-\[1\.5px\] border-dashed border-neg/) // proyección
  assert.match(src, /top-\[18px\] h-\[5px\] rounded-\[2px\]/) // resumen del frente
})

test('el rombo del hito se dibuja FUERA de la barra recortada', () => {
  const src = fuente('LienzoCronogramaObra.tsx')
  // El defecto que atrapa —y que estaba vivo—: el rombo vivía adentro del contenedor
  // `overflow-hidden` con `-right-1`. El navegador lo recortaba entero: ningún hito se veía nunca.
  assert.equal(/-right-1 top-1\/2 h-2 w-2/.test(src), false, 'el hito volvió adentro de la barra')
  assert.match(src, /data-testid="hito"/)
  const bloque = src.slice(src.indexOf('data-testid="hito"'))
  assert.match(bloque.slice(0, 400), /-translate-x-1\/2/)
})

test('la cabecera tiene dos bandas: el período arriba, la escala abajo', () => {
  const src = fuente('LienzoCronogramaObra.tsx')
  assert.match(src, /const ALTO_HEAD = 46\b/)
  assert.match(src, /const ALTO_PERIODO = 22\b/)
  assert.match(src, /bandasDePeriodo\(escala\.desde, escala\.hasta, escala\.unidad\)/)
  // El defecto que atrapa: doce rótulos «S32 S33 S34…» sin decir en qué mes cae la obra.
  assert.match(src, /franjasNoLaborables\(escala\.desde, escala\.hasta, diasHabiles\)/)
})

test('una actividad sin fechas lo dice; no se dibuja arrancando hoy', () => {
  const src = fuente('LienzoCronogramaObra.tsx')
  assert.match(src, /sin fechas · falta análisis/)
  assert.match(src, /\{!tramo && !esGrupo && \(/)
})

test('la 07 pasa los días hábiles de la obra y no asume lunes a viernes en el dibujo', () => {
  const src = pagina()
  assert.match(src, /diasHabiles=\{insumos\.obra\.dias_habiles \?\? \[1, 2, 3, 4, 5\]\}/)
  // El defecto que atrapa: sombrear sábado y domingo por costumbre. Una obra que trabaja los
  // sábados vería pintado de franco el día en que su cuadrilla estuvo en obra.
  assert.equal(/\[0, 6\]|esFinDeSemana/.test(src), false)
})

test('la banda de vista lleva vistas, zoom y las dos capas de la leyenda', () => {
  const src = pagina()
  assert.match(src, /border-y border-line bg-surface-quiet/)
  assert.match(src, /testid="escala-cronograma"/)
  assert.match(src, /testid="capa-base"/)
  assert.match(src, /testid="capa-proyeccion"/)
  assert.match(src, /testid="franja-cronograma"/)
})
