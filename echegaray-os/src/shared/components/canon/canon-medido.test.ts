import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ALTO, C, PANEL, RADIO_TARJETA, TARJETA, rotuloColumna } from './estilos.ts'

// EL PORTE, VERIFICADO CONTRA EL ESPECIMEN — mismo método que `ds/conformidad-visual.test.ts`.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// El que ya costó CUATRO entregas rechazadas: que alguien «traduzca» un valor del mockup al valor
// del design system porque el sistema dice otra cosa. El caso concreto y documentado es la caja:
// `ds/Tabla.tsx` declara «las tablas no van en caja: hairline superior + divisores de fila», y las
// siete pantallas de cartera del zip dibujan la tabla dentro de una caja blanca con borde #E7E6E2 y
// radio 10px. Si alguien vuelve a sacar la caja «para respetar el sistema», este archivo se pone
// rojo y dice de dónde salió el número.
//
// Cada afirmación cita el `.dc.html` del que se midió. Los mockups escriben cada propiedad inline,
// así que el atributo ES el valor computado: no hay cascada que lo altere.
//
// LO QUE ESTE TEST NO PRUEBA: que la pantalla real se vea así. Eso lo prueba una captura del
// navegador, que es evidencia de otro nivel. Acá se atrapa la regresión barata —la que entra en un
// refactor sin que nadie vuelva a abrir el mockup—, que es la que ya pasó cuatro veces.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (archivo: string) => readFileSync(join(DIR, archivo), 'utf8')

test('la tabla de cartera VA EN CAJA — el zip gana a «las tablas no van en caja» del DS', () => {
  // `14:105`, `22:100`, `24:106`, `25:82`, `27:98`: idéntico en las cinco carteras.
  //     background:#FFFFFF;border:1px solid #E7E6E2;borderRadius:10px;overflow:hidden
  assert.equal(TARJETA.background, '#FFFFFF')
  assert.equal(TARJETA.border, '1px solid #E7E6E2')
  assert.equal(TARJETA.borderRadius, 10)
  assert.equal(RADIO_TARJETA, 10)

  // `overflow:hidden` es lo que recorta el encabezado gris y el pie contra el radio. Sin él las
  // esquinas de la caja se ven cuadradas y la tarjeta deja de ser una tarjeta.
  assert.equal(TARJETA.overflow, 'hidden')
})

test('el encabezado de la tabla mide 38px sobre #FAFAF8 y cierra con el borde de bloque', () => {
  // `14:106`: height:38px;borderBottom:1px solid #E7E6E2;background:#FAFAF8;padding:0 14px
  assert.equal(ALTO.encabezado, 38)
  assert.equal(C.superficieTenue, '#FAFAF8')
  assert.equal(C.linea, '#E7E6E2')

  const src = fuente('Tabla.tsx')
  assert.match(src, /alignItems: 'end'/) // el rótulo se apoya en la base de la celda, no se centra
  assert.match(src, /gap: 10/)
})

test('los altos de fila NO se unifican: el zip escribe 48, 46, 44 y 40 y cada uno es un caso', () => {
  assert.equal(ALTO.filaAlta, 48) // `14:118` y `25:92`: llevan nombre + subtítulo
  assert.equal(ALTO.fila, 46) // `22:114`, `24:117`, `26`, `27:110`: un solo renglón
  assert.equal(ALTO.filaBloque, 44) // `23`: paquetes contratados, tabla anidada
  assert.equal(ALTO.filaPartida, 40) // `15` partida, `16` insumo
  assert.equal(ALTO.filaRubro, 38) // `15`: la fila agrupadora es más baja que sus hijas
  assert.equal(ALTO.encabezadoBloque, 34) // `23`, `26`
  assert.equal(ALTO.encabezadoInsumo, 32) // `16`
})

test('el rótulo de columna es 10px con interletrado .05em, y 9,5px en las tablas anidadas', () => {
  // `14:107` (10px) vs `16:135` y `23`/`26` (9,5px, `paddingBottom:7px`).
  assert.equal(rotuloColumna().fontSize, '10px')
  assert.equal(rotuloColumna().letterSpacing, '.05em')
  assert.equal(rotuloColumna().paddingBottom, 8)
  assert.equal(rotuloColumna('izquierda', true).fontSize, '9.5px')
  assert.equal(rotuloColumna('izquierda', true).paddingBottom, 7)
  assert.equal(rotuloColumna('derecha').textAlign, 'right')
  // Sin alineación explícita NO se escribe `left`: el zip omite el atributo y heredar es lo mismo.
  assert.equal(rotuloColumna().textAlign, undefined)
})

test('la fila seleccionada es el amarillo rebajado #FEF9E6, NO el gris del hover', () => {
  // `14:119`, `22:115`, `24:118`, `25:93`, `27:111`: fondo:#FEF9E6 en la fila con `sel`.
  // Son dos señales distintas: el hover dice «acá está el mouse» y la selección «esto es de lo que
  // habla el panel de al lado». Pintarlas del mismo gris las vuelve la misma cosa.
  assert.equal(C.seleccion, '#FEF9E6')
  assert.equal(C.hover, '#FAFAF8')
  assert.notEqual(C.seleccion, C.hover)
})

test('la fila NO seleccionada no lleva background inline, o el hover queda muerto', () => {
  const src = fuente('Tabla.tsx')
  // El mockup escribe `background:transparent`. Copiarlo literal a un objeto `style` le gana a
  // `hover:bg-[#FAFAF8]` —inline > clase— y la fila deja de responder al mouse. Se omite.
  assert.match(src, /\.\.\.\(pintada \? \{ background: pintada \} : null\)/)
  assert.match(src, /pintada \? '' : 'hover:bg-\[#FAFAF8\]'/)
})

test('el pie de totales vive DENTRO de la caja, a la derecha y con 26px entre pares', () => {
  // `14:158`, `22:150`, `24:157`, `25:126`, `27:150`:
  //     display:flex;gap:26px;justifyContent:flex-end;padding:11px 16px;background:#FAFAF8
  const src = fuente('estilos.ts')
  const pie = src.slice(src.indexOf('export const PIE_TOTALES'), src.indexOf('export const PAGINA'))
  assert.match(pie, /gap: 26/)
  assert.match(pie, /justifyContent: 'flex-end'/)
  assert.match(pie, /padding: '11px 16px'/)
  assert.match(pie, /background: C\.superficieTenue/)
})

test('el panel lateral mide 372px en la cartera y 392px en el análisis de partida', () => {
  // `14:163` y `23`/`26` → 372. `16:181` → 392, porque adentro lleva la cascada de precio.
  assert.equal(PANEL.cartera, 372)
  assert.equal(PANEL.analisis, 392)
})

test('los iconos del canon van a trazo 2, no al 1,6 del set del OS', () => {
  // Se lee DESDE el código, salteando el comentario de cabecera: ese comentario CITA el valor viejo
  // («dibuja con strokeWidth="1.6"») y un test que lee el archivo entero se pone rojo por la
  // explicación en vez de por el código. Es la misma trampa que documenta `ds/conformidad-visual`.
  const completo = fuente('iconos.tsx')
  const src = completo.slice(completo.indexOf('function Ico('))

  // A 13–15px de caja, 1.6 contra 2 es la mitad del peso del trazo: el icono se ve desteñido al
  // lado de un texto de 12,5px. Es parte literal de lo que el dueño llamó «aspecto distinto».
  assert.match(src, /w = 2,/)
  // Acotado a `strokeWidth`: `1.6` también es el radio de los tres puntos de «Más acciones»
  // (`circle r="1.6"`), que sí sale del zip y no tiene nada que ver con el trazo.
  assert.doesNotMatch(src, /strokeWidth=["{]1\.6/)

  // El «+», el check y el chevron de plegado van más gruesos todavía en el zip.
  assert.match(src, /IcoMas = \(\{ s = 14, w = 2\.2/)
  assert.match(src, /IcoMenos = [\s\S]{0,160}w=\{2\.4\}/)
  assert.match(src, /IcoCheck = \(\{ s = 15, w = 2\.4/)
})

test('la pastilla del TÍTULO es más grande que la de la tabla y por eso no es ds/Estado', () => {
  const src = fuente('Bloques.tsx')
  // Tabla (`ds/Estado`): 11px / radio 11 / padding 1.5px 8px.
  // Título (`15:41`, `16:47`, `23`, `26`): 11,5px / radio 12 / padding 2px 10px.
  assert.match(src, /fontSize: '11\.5px', fontWeight: 500/)
  assert.match(src, /borderRadius: 12, padding: '2px 10px'/)
})

test('la solapa activa se marca con sombra interior, no con borde — el borde corre el texto', () => {
  const src = fuente('Bloques.tsx')
  // `23` y `26`: boxShadow:inset 0 -2px 0 #FDC900. Con `border-bottom` la solapa activa mide 2px
  // más que las otras y el texto salta al cambiar de solapa.
  assert.match(src, /boxShadow: s\.activa \? `inset 0 -2px 0 \$\{C\.marca\}`/)
  assert.equal(C.marca, '#FDC900')
})

test('las cinco ternas de color del zip coinciden con las que ya midió el DS el 24/08', () => {
  // Si estas dos listas se separan, la misma pantalla dibuja el mismo estado de dos colores según
  // el componente que le tocó. La del DS vive en `ds/Estado.tsx`; ésta se compara contra ella.
  const ds = fuente(join('..', 'ds', 'Estado.tsx'))
  const bloques = fuente('Bloques.tsx')
  for (const [tono, texto, fondo, borde] of [
    ['pos', '#067647', '#F1F9F4', '#D6EBDF'],
    ['neg', '#B42318', '#FEF6F5', '#F3DDDA'],
    ['warn', '#B54708', '#FDF6EE', '#F0E1CD'],
    ['curso', '#175CD3', '#EFF5FF', '#D6E4FB'],
  ] as const) {
    assert.match(ds, new RegExp(`${tono}: 'text-\\[${texto}\\] bg-\\[${fondo}\\] border-\\[${borde}\\]'`), `ds/Estado perdió ${tono}`)
    assert.ok(bloques.includes(fondo) && bloques.includes(borde), `TONO del canon perdió ${tono}`)
  }
})

test('la paleta del canon no se «redondea» a los tokens: son hex del zip', () => {
  assert.equal(C.tinta, '#1F1F1E')
  assert.equal(C.tintaSuave, '#3A3A38')
  assert.equal(C.apagado, '#6B6B67')
  assert.equal(C.tenue, '#91918B')
  assert.equal(C.inerte, '#C9C4C2')
  assert.equal(C.grafito, '#30302F')
  assert.equal(C.marcaHover, '#EEBE00')
  assert.equal(C.pista, '#EAE7E6')
  assert.equal(C.avatar, '#F2F1ED')
  // Los tres divisores son TRES y no uno: bloque #E7E6E2, fila #F1F0EC, panel #F5F4F0.
  assert.equal(C.lineaFila, '#F1F0EC')
  assert.equal(C.lineaTenue, '#F5F4F0')
  assert.equal(C.lineaBloque, '#EFEEEA')
})
