import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL CANÓNICO 07 (OBRA CRONOGRAMA), VERIFICADO CONTRA EL FUENTE DEL MOCKUP ═══
//
// Los valores de acá salieron LEÍDOS de `07 · Obra Cronograma.dc.html` (los estilos inline del zip
// son medidas exactas): `DAYW = 26, ROWH = 36`, cabecera de 46 partida en 22 + 24, tabla de 340px,
// base `top:6 h:4`, barra `top:13 h:15 r:4`, resumen `top:18 h:5`, proyección punteada de 1,5px, y
// el pie como tarjeta de celdas con la cifra en mono de 20px/600.
//
// El porte es LITERAL: los estilos van inline con los hex del zip, no traducidos al design system.
// Cuatro entregas anteriores se hicieron traduciendo cada regla al DS y el dueño las rechazó las
// cuatro con la misma frase —«estructura parecida, aspecto distinto»—, porque cada traducción perdía
// dos o tres píxeles. Lo que este archivo protege es esa MEDIDA: es exactamente lo que un refactor
// «prolijo» redondea a `top-4 h-4` sin que nada falle.
//
// LO QUE ESTE TEST NO PRUEBA: que la pantalla se vea así en el navegador. Eso es una captura, y la
// saca quien no escribió esto.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (archivo: string) => readFileSync(join(DIR, archivo), 'utf8')
const franja = () => readFileSync(join(DIR, '../../../shared/components/ds/Franja.tsx'), 'utf8')
const ruta07 = () => readFileSync(join(DIR, '../../../app/(main)/obras/[obra]/cronograma/page.tsx'), 'utf8')

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
  assert.match(tabla, /height: altoFila/)
})

test('la columna de actividades mide los 340px del mockup', () => {
  assert.match(fuente('TablaCronogramaObra.tsx'), /width: '340px', flexShrink: 0/)
})

test('las tres capas van en las alturas medidas del mockup', () => {
  const src = fuente('LienzoCronogramaObra.tsx')
  assert.match(src, /top: '6px', height: '4px', borderRadius: '2px'/) // línea base
  assert.match(src, /top: '13px', height: '15px', borderRadius: '4px', overflow: 'hidden'/) // plan
  assert.match(src, /top: '13px', height: '15px', borderRadius: '4px',\n\s+border: `1\.5px dashed/) // proyección
  assert.match(src, /top: '18px', height: '5px', borderRadius: '2px'/) // resumen del rubro
})

test('los colores de la barra son los hex del zip, no los tokens del design system', () => {
  const src = fuente('LienzoCronogramaObra.tsx')
  // Terminada, en curso y en curso con atraso proyectado: relleno, fondo tenue y borde rebajado.
  assert.match(src, /relleno: '#067647', fondo: '#E6F3EB', borde: '#CDE7D7'/)
  assert.match(src, /relleno: '#175CD3', fondo: '#E4EEFC', borde: '#CFE0FA'/)
  assert.match(src, /relleno: '#B54708', fondo: '#FBEFE1', borde: '#F0E1CD'/)
  // El defecto que atrapa: volver a `bg-pos-soft` (#E7F6EE) y a un borde calculado con
  // `color-mix`, que es lo que hacía que la barra se pareciera al mockup sin ser la del mockup.
  assert.equal(/color-mix/.test(src), false, 'el borde de la barra volvió a calcularse')
})

test('el rombo del hito se dibuja FUERA de la barra recortada', () => {
  const src = fuente('LienzoCronogramaObra.tsx')
  // El defecto que atrapa —y que estuvo vivo—: el rombo vivía adentro del contenedor
  // `overflow:hidden` con `-right-1`. El navegador lo recortaba entero: ningún hito se veía nunca.
  assert.equal(/-right-1 top-1\/2 h-2 w-2/.test(src), false, 'el hito volvió adentro de la barra')
  assert.match(src, /data-testid="hito"/)
  const bloque = src.slice(src.indexOf('data-testid="hito"'))
  assert.match(bloque.slice(0, 400), /translate\(-50%, -50%\) rotate\(45deg\)/)
})

test('la cabecera tiene dos bandas: el período arriba, la escala abajo', () => {
  const src = fuente('LienzoCronogramaObra.tsx')
  assert.match(src, /const ALTO_HEAD = 46\b/)
  assert.match(src, /const ALTO_PERIODO = 22\b/)
  assert.match(src, /bandasDePeriodo\(escala\.desde, escala\.hasta, escala\.unidad\)/)
  // El defecto que atrapa: doce rótulos «S32 S33 S34…» sin decir en qué mes cae la obra.
  assert.match(src, /divisionesDe\(escala\.columnas, hoy, diasHabiles\)/)
})

test('hoy se pinta como la celda amarilla del mockup, no como una pastilla aparte', () => {
  const src = fuente('LienzoCronogramaObra.tsx')
  assert.match(src, /background: d\.esHoy \? C\.marca : 'transparent'/)
  assert.match(src, /borderRadius: d\.esHoy \? '4px' : 0/)
  // Y la línea de 1,5px cae al MEDIO del día, como en el zip (`(HOY-1)*DAYW + DAYW/2`), no en su
  // borde izquierdo: media celda de corrimiento sobre una barra de tres días es un tercio de barra.
  assert.match(src, /escala\.hoyX \+ escala\.pxPorDia \/ 2/)
})

test('una actividad sin fechas lo dice; no se dibuja arrancando hoy', () => {
  const src = fuente('LienzoCronogramaObra.tsx')
  assert.match(src, /sin fechas · falta análisis/)
  assert.match(src, /\{!tramo && !esRubro && \(/)
})

test('la 07 pasa los días hábiles de la obra y no asume lunes a viernes en el dibujo', () => {
  const src = fuente('CronogramaDeObra.tsx')
  assert.match(src, /diasHabiles=\{diasHabiles\}/)
  // El defecto que atrapa: sombrear sábado y domingo por costumbre. Una obra que trabaja los
  // sábados vería pintado de franco el día en que su cuadrilla estuvo en obra.
  assert.equal(/\[0, 6\]|esFinDeSemana|\[1, 2, 3, 4, 5\]/.test(src), false)
})

test('la banda de nivel 3 lleva el zoom y las dos capas de la leyenda', () => {
  const src = fuente('CronogramaDeObra.tsx')
  assert.match(src, /<SubNavTrabajo obraId=\{obraId\} sub="gantt"/)
  assert.match(src, /testid="escala-cronograma"/)
  assert.match(src, /testid="capa-base"/)
  assert.match(src, /testid="capa-proyeccion"/)
  assert.match(src, /testid="franja-cronograma"/)
  // El zoom es segmentado y GRAFITO: el amarillo queda para hoy y la fila seleccionada.
  assert.match(src, /background: unidad === u \? C\.grafito : C\.superficie/)
})

test('las capas no se encienden sobre datos que no existen', () => {
  const src = fuente('CronogramaDeObra.tsx')
  // El defecto que atrapa: dibujar la línea base de una obra sin sellar (sería el plan de hoy
  // disfrazado de promesa) o prometer una proyección sin un solo `forecast_fin`.
  assert.match(src, /verBase=\{verBase && hayBase\} verProyeccion=\{verProyeccion && hayForecast\}/)
  assert.match(src, /Ninguna actividad tiene línea base sellada/)
  assert.match(src, /Ninguna actividad tiene forecast/)
})

test('hay UN solo cronograma: la ruta vieja redirige al del workspace', () => {
  const src = ruta07()
  assert.match(src, /redirect\(`\/obras\/\$\{obra\}\?vista=cronograma`\)/)
  // El defecto que atrapa: que vuelva a dibujar el cronograma calculado desde la secuencia. Con
  // cero dependencias cargadas el motor arranca TODAS las actividades el mismo día.
  assert.equal(/armarCronograma|LienzoCronogramaObra/.test(src), false)
})
