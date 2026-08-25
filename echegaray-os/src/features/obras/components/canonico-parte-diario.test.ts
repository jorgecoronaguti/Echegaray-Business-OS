import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL CANÓNICO 05 (PARTE DIARIO), VERIFICADO CONTRA EL FUENTE DEL MOCKUP ═══
//
// Los valores de acá salieron LEÍDOS de `05 · Registrar avance.dc.html` (estilos inline = medidas
// exactas). Desde el porte literal del 24/08/2026 la pantalla ya no traduce esas medidas a clases
// del design system: las escribe como el mockup, en px, y por eso este test las busca en px.
//
//   panel izquierdo   `width:404px`, `padding:14px 16px 16px`
//   medición          `gridTemplateColumns:1fr 96px`, `gap:10px`
//   chips             `borderRadius:16px` `padding:5px 11px`; sólo icono `30x30` `borderRadius:15px`
//   desplegables      actividad `maxHeight:212px`, gente `maxHeight:236px`
//   cabeceras         `padding:11px 16px`, título 13px/600
//   navegador de día  flechas de `27x27` con `borderRadius:6px`
//   frentes           `minmax(0,1fr) 128px 128px 60px 22px`, filas `padding:9px 16px`
//
// Lo que se protege es esa MEDIDA y esas DECISIONES: es exactamente lo que un refactor «prolijo»
// redondea a `p-4`, `w-24` o `gap-2` sin que nada falle, y lo que un rediseño de buena fe vuelve a
// llenar con ceros donde el dato no existe.
//
// LO QUE ESTE TEST NO PRUEBA: que la pantalla se vea así en el navegador. Eso es una captura, y la
// saca quien no escribió esto.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (archivo: string) => readFileSync(join(DIR, archivo), 'utf8')
const shell = () => fuente('parte/ParteDiario.tsx')
const form = () => fuente('parte/FormularioParte.tsx')
const hoy = () => fuente('parte/CargadoHoy.tsx')
const frentes = () => fuente('parte/FrentesEnCurso.tsx')
const gente = () => fuente('parte/ListaDeGente.tsx')

test('el panel del parte mide 404px y respeta el padding 14/16/16 del mockup', () => {
  const src = form()
  assert.match(src, /width: '404px', flexShrink: 0/)
  assert.match(src, /padding: '14px 16px 16px'/)
  // El defecto que atrapa: volver al panel de 420px que tenía la vista antes del canónico.
  assert.equal(/420px/.test(src), false, 'el panel volvió al ancho viejo de 420px')
})

test('cantidad y HH van en la grilla 1fr/96px del mockup, no en un flex con ancho suelto', () => {
  assert.match(form(), /gridTemplateColumns: '1fr 96px', gap: '10px'/)
})

test('el día se elige ARRIBA de las dos columnas, en la banda, con flechas de 27px', () => {
  const src = shell()
  // El defecto que atrapa: devolver el selector de fecha adentro del panel izquierdo, donde parece
  // un campo más del parte y nadie entiende por qué le cambia la lista de la derecha.
  assert.match(src, /width: '27px', height: '27px'/)
  assert.match(src, /<SubNavTrabajo obraId=\{obraId\} sub="parte" derecha=/)
  assert.match(src, /data-testid="dia-anterior"/)
  assert.match(src, /data-testid="dia-siguiente"/)
  // Y que no se pueda cargar el futuro: un parte de mañana no es un hecho.
  assert.match(src, /disabled=\{dia >= hoy\}/)
  assert.match(src, /max=\{hoy\}/)
  // El texto de la fecha es NUESTRO: el de un `input date` lo dibuja el navegador y en inglés
  // escribe 08/23/2026 en una obra donde todo lo demás es dd/mm.
  assert.match(src, /fechaCorta\(dia\)/)
})

test('las horas de cada persona no arrancan en 8: serían ocho horas inventadas en la liquidación', () => {
  // El defecto que atrapa: copiar el `h: st.hh ? st.hh : "8,0"` del mockup. Ese 8 va a
  // `registros_hh`, que es de donde sale el sueldo de esa persona.
  assert.equal(/'8,0'|"8,0"/.test(gente()), false, 'volvió el 8 por defecto del mockup')
  assert.match(gente(), /Vacío queda vacío/)
})

test('el chip de sólo icono es REDONDO de 30px y el que lleva texto es la píldora de 16px', () => {
  const src = form()
  assert.match(src, /borderRadius: '16px', padding: '5px 11px'/)
  assert.match(src, /width: '30px', height: '30px', justifyContent: 'center', borderRadius: '15px'/)
})

test('el desplegable de actividad muestra el PENDIENTE y corta en 212px, como el mockup', () => {
  const src = form()
  assert.match(src, /textoPendiente\(a\)/)
  assert.match(src, /maxHeight: '212px'/)
  // La lista de gente es la otra, y mide distinto: 236px, con casillas de 15px.
  assert.match(gente(), /maxHeight: '236px'/)
  assert.match(gente(), /width: '15px', height: '15px'/)
})

test('sin plantel se dice que no hay gente asignada, no se dibuja una grilla vacía', () => {
  const src = gente()
  // El defecto que atrapa: `personas.map` sobre una lista vacía. Cero casilleros se lee como
  // «no trabajó nadie»; lo cierto es que la obra no tiene personas asignadas.
  assert.match(src, /personas\.length === 0/)
  assert.match(src, /Sin personas asignadas a esta obra/)
  assert.match(src, /data-testid="parte-sin-plantel"/)
})

test('la evidencia dice CÓMO se adjunta hoy: enlace de Drive, no un botón de subir que no existe', () => {
  const src = form()
  assert.match(src, /name="evidencia"/)
  assert.match(src, /el OS guarda el vínculo, no una copia/)
  // El defecto que atrapa: poner un `input[type=file]` que ninguna acción recibe.
  assert.equal(/type="file"/.test(src), false, 'apareció una subida de archivos que el OS no tiene')
})

test('los paneles de los chips se OCULTAN, no se desmontan: lo tipeado tiene que viajar', () => {
  const src = form()
  // El defecto que atrapa: traducir el `sc-if` del mockup a un render condicional. El que escribe
  // el impedimento y vuelve a tocar el chip para verlo plegado pierde el texto sin enterarse.
  assert.match(src, /display: abierto === 'gente' \? 'block' : 'none'/)
  assert.match(src, /display: abierto === 'imp' \? 'block' : 'none'/)
  assert.match(src, /display: abierto === 'foto' \? 'block' : 'none'/)
  assert.match(src, /display: abierto === 'equipos' \? 'block' : 'none'/)
})

test('el resultado del servidor se publica entero, no sólo el ✓ «guardado» del mockup', () => {
  const src = form()
  // El defecto que atrapa: quedarse con el ✓ del zip. Un parte que entró con las horas rebotadas
  // —«ya tenían esas horas cargadas ese día»— se leería como un éxito limpio.
  assert.match(src, /data-testid=\{estado\.ok \? 'form-ejecucion-ok' : 'form-ejecucion-error'\}/)
  assert.match(src, /estado\.error/)
})

test('la cabecera de la jornada publica HH y PERSONAS con las cifras del mockup', () => {
  const src = hoy()
  assert.match(src, /rotulo="HH"/)
  assert.match(src, /rotulo="PERSONAS"/)
  assert.match(src, /fontSize: '12\.5px', fontWeight: 600, color: C\.tinta/)
  assert.match(src, /padding: '11px 16px'/)
})

test('sin fuente de horas la cabecera dice «sin registrar» — nunca 0', () => {
  const src = hoy()
  // El defecto que atrapa: `valor={jornada?.hh ?? 0}`. Un «HH 0,0» sobre una jornada de catorce
  // personas es una afirmación falsa, y encima tranquilizadora.
  assert.match(src, /valor=\{jornada && num\(jornada\.hh\)\}/)
  assert.match(src, /valor=\{jornada && String\(jornada\.personas\)\}/)
  assert.equal(/jornada\?\./.test(src), false, 'la cabecera aplanó el «no se sabe» con un opcional')
})

test('las HH de un parte NO se dibujan por fila: un parte no sabe quién lo hizo', () => {
  const src = hoy()
  // El defecto que atrapa: cumplir el mockup al pie de la letra repartiendo `registros_hh` entre
  // los partes de la actividad. Con dos partes del mismo frente en el mismo día, cada fila
  // mostraría las horas del otro. La fila lleva las tres columnas que SÍ existen.
  assert.match(src, /gridTemplateColumns: 'minmax\(0,1fr\) 116px 26px'/)
  assert.equal(
    /minmax\(0,1fr\) 116px 62px 62px 26px/.test(src), false,
    'volvieron las dos columnas por fila que ningún dato sostiene')
  assert.match(src, /atribución fabricada/)
})

test('los frentes llevan las columnas medidas del mockup', () => {
  const src = frentes()
  assert.match(src, /gridTemplateColumns: 'minmax\(0,1fr\) 128px 128px 60px 22px'/)
  assert.match(src, /padding: '9px 16px'/)
  // La barra del zip: 5px sobre el canal #EAE7E6.
  assert.match(src, /height: '5px', background: C\.barraCanal/)
})

test('el título de los frentes no miente cuando el filtro es «Todos»', () => {
  assert.match(frentes(), /soloCurso \? 'Frentes en curso' : 'Frentes'/)
})

test('los frentes cortan en 5 y ofrecen «Ver N más», como el canónico', () => {
  const src = frentes()
  assert.match(src, /const VISIBLES = 5/)
  assert.match(src, /Ver \$\{frentes\.length - VISIBLES\} más/)
  assert.match(src, /data-testid="frentes-ver-mas"/)
})

test('tocar un frente lo carga en el formulario de al lado: no navega a ningún lado', () => {
  const src = frentes()
  // El defecto que atrapa: el «Registrar avance» que mandaba a `/obras/x/avance/<id>` — *«no me
  // sirve que me cargue y me lleve a otro lado»*.
  assert.match(src, /onClick=\{\(\) => elegir\(a\.id\)\}/)
  assert.equal(/href=/.test(src), false, 'la fila del frente volvió a ser un enlace')
})

test('un acumulado sin registrar no se dibuja como 0', () => {
  // La regla vive en `parteDiario.ts` y está probada ahí con sus bordes; acá se fija que la fila la
  // use en vez de escribir su propia versión con un `?? 0`.
  const src = frentes()
  assert.match(src, /acumuladoDeFrente\(a\)/)
  assert.match(src, /acum\.registrado \? C\.tinta : C\.tenue/)
  assert.equal(/\?\? 0/.test(src.replace(/a\.avance_pct \?\? 0/g, '')), false, 'apareció un cero por defecto')
})
