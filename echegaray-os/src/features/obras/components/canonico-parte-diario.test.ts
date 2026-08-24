import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL CANÓNICO 05 (PARTE DIARIO), VERIFICADO CONTRA EL FUENTE DEL MOCKUP ═══
//
// Los valores de acá salieron LEÍDOS de `05 · Registrar avance.dc.html` (estilos inline = medidas
// exactas): panel izquierdo `width:404px` con `padding:14px 16px 16px`, grilla de medición
// `1fr 96px` con `gap:10px`, chips de `borderRadius:16px` `padding:5px 11px` y los de sólo icono
// de `30x30` `borderRadius:15px`, cabeceras de sección `padding:11px 16px` con el título en
// 13px/600, flechas de día de `27x27`, y las columnas de frentes en `128px · 128px · 60px · 22px`.
//
// Lo que se protege es esa MEDIDA y esas DECISIONES: es exactamente lo que un refactor «prolijo»
// redondea a `p-4`, `w-24` o `gap-2` sin que nada falle, y lo que un rediseño de buena fe vuelve a
// llenar con ceros donde el dato no existe.
//
// LO QUE ESTE TEST NO PRUEBA: que la pantalla se vea así en el navegador. Eso es una captura, y la
// saca quien no escribió esto.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (archivo: string) => readFileSync(join(DIR, archivo), 'utf8')
const tab = () => fuente('TabEjecucion.tsx')
const jornada = () => fuente('ParteDiarioJornada.tsx')

test('el panel del parte mide 404px y respeta el padding 14/16/16 del mockup', () => {
  const src = tab()
  assert.match(src, /lg:w-\[404px\] lg:shrink-0/)
  assert.match(src, /px-4 pb-4 pt-\[14px\]/)
  // El defecto que atrapa: volver al panel de 420px que tenía la vista antes del canónico.
  assert.equal(/lg:w-\[420px\]/.test(src), false, 'el panel volvió al ancho viejo de 420px')
})

test('cantidad y HH van en la grilla 1fr/96px del mockup, no en un flex con ancho suelto', () => {
  const src = tab()
  assert.match(src, /grid grid-cols-\[1fr_96px\] gap-2\.5/)
  assert.equal(/w-\[96px\] shrink-0/.test(src), false, 'la medición volvió al flex con ancho suelto')
})

test('el día se elige ARRIBA de las dos columnas, con flechas de 27px', () => {
  const src = tab()
  // El defecto que atrapa: devolver el selector de fecha adentro del panel izquierdo, donde parece
  // un campo más del parte y nadie entiende por qué le cambia la lista de la derecha.
  assert.match(src, /h-\[27px\] w-\[27px\]/)
  assert.match(src, /data-testid="dia-anterior"/)
  assert.match(src, /data-testid="dia-siguiente"/)
  // Y que no se pueda cargar el futuro: un parte de mañana no es un hecho.
  assert.match(src, /disabled=\{dia >= hoy\}/)
  assert.match(src, /max=\{hoy\}/)
})

test('el chip de sólo icono es REDONDO de 30px y el que lleva texto es la píldora de 16px', () => {
  const src = tab()
  assert.match(src, /rounded-\[16px\] px-\[11px\] py-\[5px\] text-\[12px\] font-medium/)
  assert.match(src, /h-\[30px\] w-\[30px\] justify-center rounded-\[15px\]/)
})

test('el desplegable de actividad muestra el PENDIENTE, que es el número que decide cuánto cargar', () => {
  const src = tab()
  assert.match(src, /pendienteDe\(a\)/)
  assert.match(src, /pendiente/)
})

test('sin plantel se dice que no hay gente fichada, no se dibuja una grilla vacía', () => {
  const src = tab()
  // El defecto que atrapa: `personas.map` sobre una lista vacía. Cero casilleros se lee como
  // «no trabajó nadie»; lo cierto es que la obra no tiene personas asignadas.
  assert.match(src, /personas\.length === 0/)
  assert.match(src, /Sin personas fichadas hoy/)
  assert.match(src, /data-testid="parte-sin-plantel"/)
})

test('la evidencia dice CÓMO se adjunta hoy: enlace de Drive, no un botón de subir que no existe', () => {
  const src = tab()
  assert.match(src, /name="evidencia"/)
  assert.match(src, /el OS guarda el vínculo, no una copia/)
  // El defecto que atrapa: poner un `input[type=file]` que ninguna acción recibe.
  assert.equal(/type="file"/.test(src), false, 'apareció una subida de archivos que el OS no tiene')
})

test('la cabecera de la jornada publica HH y PERSONAS con las cifras del mockup', () => {
  const src = jornada()
  assert.match(src, /rotulo="HH"/)
  assert.match(src, /rotulo="PERSONAS"/)
  assert.match(src, /font-mono text-\[12\.5px\] font-semibold tabular-nums text-ink/)
  assert.match(src, /text-\[11px\] text-faint/)
})

test('sin fuente de horas la cabecera dice «sin registrar» — nunca 0', () => {
  const src = jornada()
  // El defecto que atrapa: `valor={jornada?.hh ?? 0}`. Un «HH 0,0» sobre una jornada de catorce
  // personas es una afirmación falsa, y encima tranquilizadora.
  assert.match(src, /valor == null\s*\n\s*\? <Nulo>sin registrar<\/Nulo>/)
  assert.match(src, /valor=\{jornada && num\(jornada\.hh\)\}/)
  assert.match(src, /valor=\{jornada && String\(jornada\.personas\)\}/)
  assert.equal(/jornada\?\./.test(src), false, 'la cabecera aplanó el «no se sabe» con un opcional')
})

test('las HH de un parte NO se dibujan por fila: un parte no sabe quién lo hizo', () => {
  const src = jornada()
  // El defecto que atrapa: cumplir el mockup al pie de la letra repartiendo `registros_hh` entre
  // los partes de la actividad. Con dos partes del mismo frente en el mismo día, cada fila
  // mostraría las horas del otro. La razón queda escrita arriba del archivo.
  assert.match(src, /El canónico pone HH y PERSONAS \*\*por fila\*\*/)
  assert.match(src, /atribución fabricada/)
})

test('los frentes llevan las columnas medidas del mockup y NO la de «jornada»', () => {
  const src = jornada()
  assert.match(src, /style=\{\{ width: 128 \}\}>Acumulado/)
  assert.match(src, /style=\{\{ width: 128 \}\}>Avance/)
  assert.match(src, /style=\{\{ width: 60 \}\}>HH/)
  assert.match(src, /style=\{\{ width: 22 \}\} \/>/)
  // El defecto que atrapa: volver a meter la columna «Jornada», que repite lo que ya lista
  // «Cargado hoy» y come el ancho del acumulado —el número que sí decide.
  assert.equal(/<Th num>Jornada<\/Th>/.test(src), false, 'volvió la columna Jornada')
})

test('el título de los frentes no miente cuando el filtro es «Todos»', () => {
  const src = jornada()
  assert.match(src, /soloCurso \? 'Frentes en curso' : 'Frentes'/)
})

test('los frentes cortan en 5 y ofrecen «Ver N más», como el canónico', () => {
  const src = jornada()
  assert.match(src, /const VISIBLES = 5/)
  assert.match(src, /Ver \$\{frentes\.length - VISIBLES\} más/)
  assert.match(src, /data-testid="frentes-ver-mas"/)
})

test('un acumulado sin registrar no se dibuja como 0', () => {
  const src = jornada()
  assert.match(src, /<Nulo>sin registrar<\/Nulo>/)
})
