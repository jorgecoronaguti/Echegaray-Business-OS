import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// LOS TRES PEDIDOS DEL DUEÑO DEL 15/09/2026 SOBRE LA PANTALLA DE COMPRAS, textual:
//
//   *«los filtros están mal y viejos, tenés que permitirme cambiar la obra directamente con
//   desplegable desde ahí sin necesidad de abrir menú de la derecha porque además tiene un bug que
//   vuelve para arriba toda la lista cuando hacés click la compra»*
//
// y la ampliación del mismo día: las dos fechas (comprobante y pago) y el encabezado fijo.
//
// ═══ POR QUÉ SE PRUEBA SOBRE EL FUENTE Y NO MONTANDO REACT ═══
//
// Mismo método que `canonico-compras-v4.test.ts`, que es el vecino: lo que se protege son DECISIONES
// ESCRITAS —de qué campo lee cada columna, qué control vive fuera del enlace, qué atributo lleva la
// navegación— y no un comportamiento de render. Montar un runtime entero para leer un atributo que
// está literal en el archivo mete una capa entre la afirmación y el hecho.
//
// LO QUE ESTOS TESTS NO PRUEBAN, y queda declarado: que en un navegador real el encabezado se pegue
// donde tiene que pegarse y que la lista no salte. Eso sólo lo prueba un navegador. Lo que sí
// prueban es que el archivo no puede volver a decir lo que decía antes sin ponerse rojo.

const DIR = dirname(fileURLToPath(import.meta.url))
const sinComentarios = (texto: string) => texto
  .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('//'))
  .join('\n')

const fuente = (a: string) => sinComentarios(readFileSync(join(DIR, a), 'utf8'))
const tabla = () => fuente('TablaComprasSheet.tsx')
const control = () => fuente('ObraEnLinea.tsx')
const cinta = () => fuente('../../../shared/components/v2/CintaHorizontal.tsx')

// ── 1 · LA OBRA SE CAMBIA EN LA FILA ─────────────────────────────────────────────────────────────

test('el desplegable de obra vive en la FILA y fuera del enlace que abre el panel', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Un `<select>` dentro de un `<a>` es HTML inválido: el clic que despliega la lista dispara la
  // navegación del enlace, así que elegir una obra abriría el panel en vez de elegirla, y el
  // tabulador se rompe. Es el mismo motivo por el que el papel de la última columna ya vivía afuera.
  const t = tabla()
  assert.match(t, /<ObraEnLinea\b/, 'la fila dejó de tener su desplegable de obra')
  const donde = t.indexOf('<ObraEnLinea')
  const abre = t.lastIndexOf('<Link', donde)
  const cierra = t.lastIndexOf('</Link>', donde)
  assert.ok(
    cierra > abre,
    'el desplegable de obra quedó DENTRO de un <Link>: elegir una obra navegaría al panel',
  )
})

test('la fila usa la MISMA puerta que el panel para asignar la obra, no una segunda', () => {
  // La regla de qué obra es válida vive en la base (`compra_obra_asignar`) y en `obra-destino.mjs`.
  // Un segundo camino de escritura desde la fila sería una segunda definición de lo mismo, y la
  // primera que se desincronice deja la columna del Sheet diciendo algo que la app no entiende.
  const c = control()
  assert.match(c, /from '\.\.\/services\/obraDeCompraActions'/, 'el control de la fila dejó de entrar por la acción del panel')
  assert.match(c, /await asignarObraDeCompra\(fila, nuevo, /, 'el control dejó de llamar a la acción')
  // `esperado` NO PUEDE SER EL VALOR NUEVO: es el control optimista de la base, y mandar el valor
  // que se quiere escribir haría que la RPC nunca detecte que otra persona pisó la celda.
  assert.equal(
    /asignarObraDeCompra\(fila, nuevo, nuevo\)/.test(c), false,
    'el control se manda a sí mismo como `esperado`: la guarda de concurrencia de la base queda anulada',
  )
  // Y NINGÚN `fetch` ni `supabase` propios: eso sería la segunda puerta.
  for (const puerta of ['fetch(', 'createClient', "from('compra_sheet')"]) {
    assert.equal(c.includes(puerta), false, `el control de la fila abrió su propia puerta a la base: ${puerta}`)
  }
})

test('el error de la base se muestra TAL CUAL y el valor vuelve a lo que había', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Un «no se pudo guardar» genérico esconde el único caso que importa: que otra persona haya
  // cambiado esa celda mientras esta pantalla estaba abierta. Y dejar en pantalla la obra que la base
  // rechazó es la pantalla afirmando un cambio que no ocurrió — evidencia del intento, no del efecto.
  const c = control()
  assert.match(c, /if \(!r\.ok\) \{[\s\S]{0,200}setValor\(anterior\)/, 'el desplegable se queda mostrando lo que la base rechazó')
  assert.match(c, /setError\(r\.error\)/, 'el error de la base se reemplazó por un texto propio')
  assert.match(c, /\{pendiente \? '…' : error \? error : guardado \? '✓' : ''\}/, 'el acuse de la fila dejó de decir en qué estado está')
})

test('el desplegable se puede usar con el teclado y dice de qué fila es', () => {
  // Un `<select>` nativo ya es operable con teclado; lo que falta sin rótulo es SABER cuál es. En una
  // lista de 200 filas, doscientos desplegables sin nombre son doscientos «combo box» idénticos.
  const c = control()
  assert.match(c, /<select/, 'el control dejó de ser un `select` nativo: el teclado deja de funcionar solo')
  assert.match(c, /aria-label=\{`Obra de la fila \$\{fila\}`\}/, 'el desplegable perdió su rótulo accesible')
  assert.equal(/onClick=\{[^}]*preventDefault/.test(c), false, 'se le tapó el clic al select en vez de sacarlo del enlace')
})

test('«sin elegir» no se dibuja como «sin obra» cuando el sync infirió una', () => {
  // Leer el vacío del desplegable como una imputación sería exactamente la confusión que la columna
  // Obra vino a sacar: una obra ADIVINADA leyéndose como una DECIDIDA.
  const c = control()
  assert.match(c, /inferida \? `\(inferida\) \$\{rotulo \?\? ''\}`\.trim\(\) : 'sin imputar'/,
    'la opción vacía dejó de distinguir la obra inferida de la fila sin imputar')
})

// ── 3 · EL SCROLL ────────────────────────────────────────────────────────────────────────────────

test('abrir una compra NO manda la lista al principio: los dos enlaces llevan `scroll={false}`', () => {
  // ═══ EL DEFECTO QUE ATRAPA, y es el que reportó el dueño ═══
  //
  // `<Link>` de Next.js restaura el scroll al tope en cada navegación salvo que se le diga lo
  // contrario, y en esta pantalla TODA la selección es una navegación (`?s=<fila>`, para que el panel
  // se comparta con un enlace). Con 200 filas dibujadas, elegir la fila 180 devolvía a la 1.
  //
  // Los DOS: la fila se parte en dos enlaces alrededor del desplegable de obra, y arreglar uno solo
  // dejaría media fila con el defecto y media sin él — que es peor que tenerlo entero, porque
  // dependería de en qué columna cayó el dedo.
  const t = tabla()
  const enlaces = [...t.matchAll(/<Link href=\{hrefDe\(f\.fila\)\}([^>]*)>/g)].map((m) => m[1])
  assert.equal(enlaces.length, 2, `la fila dejó de tener sus dos enlaces (encontré ${enlaces.length})`)
  for (const atributos of enlaces) {
    assert.match(
      atributos, /scroll=\{false\}/,
      'un enlace de la fila volvió al scroll por defecto: abrir esa compra manda la lista al principio',
    )
  }
})

test('la selección sigue viajando por la URL: el arreglo no se llevó puesto el enlace profundo', () => {
  // La salida fácil era mover la selección a estado de cliente. Eso mata el `?s=<fila>` que hace que
  // la vista se comparta con un enlace y vuelva con «atrás», que es una capacidad que nadie pidió
  // perder. El defecto se arregla donde está: la navegación sigue, el salto no.
  const pagina = sinComentarios(readFileSync(join(DIR, '../../../app/(main)/administracion/compras/page.tsx'), 'utf8'))
  assert.match(pagina, /p\.set\('s', String\(filaSel\)\)/, 'la fila abierta dejó de viajar en la URL')
  assert.match(pagina, /hrefDe=\{\(fila\) => urlSheet\(\{ s: fila === filaAbierta\?\.fila \? null : fila \}\)\}/,
    'la fila dejó de abrir y cerrar el panel por enlace')
})

// ── 5 · EL ENCABEZADO FIJO ───────────────────────────────────────────────────────────────────────

test('los rótulos se pegan DEBAJO del header de la app, no al borde de la ventana', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // `AppHeader` es `sticky top-0 z-30` y opaco. Un encabezado de tabla con `top: 0` se pega DEBAJO de
  // esa barra: los rótulos desaparecen justo cuando empiezan a hacer falta, y el defecto sólo se ve
  // scrolleando en un navegador. El offset tiene que ser el alto REAL del header.
  const patron = fuente('../../../shared/components/v2/patron.tsx')
  const c = cinta()
  assert.match(c, /top: ALTO_HEADER_APP/, 'la cabecera pegajosa volvió a escribir su propio offset')
  const declarado = /export const ALTO_HEADER_APP = (\d+)/.exec(patron)
  assert.ok(declarado, 'se fue la constante del alto del header')

  // Y EL NÚMERO SE ATA AL COMPONENTE REAL: `h-11` (44) más el hairline del `border-b` (1).
  const header = fuente('../../../shared/components/AppHeader.tsx')
  const clases = /<header className="([^"]+)"/.exec(header)
  assert.ok(clases, 'el header de la app dejó de declarar sus clases de forma legible')
  assert.match(clases[1], /\bh-11\b/, 'el header cambió de alto y la constante quedó mintiendo')
  assert.match(clases[1], /\bborder-b\b/, 'el header perdió su hairline y la constante sobra un píxel')
  assert.equal(Number(declarado[1]), 44 + 1, 'ALTO_HEADER_APP dejó de ser el alto real del header (h-11 + 1 de filo)')
})

test('la cabecera pegajosa vive FUERA del elemento que scrollea de costado', () => {
  // ═══ POR QUÉ NO ALCANZA CON PONERLE `sticky` A LA FILA DE RÓTULOS ═══
  //
  // Un elemento con `overflow-x: auto` ES un contenedor de scroll, y `sticky` mide su desplazamiento
  // contra el scrollport MÁS CERCANO. Si los rótulos vivieran dentro de la cinta, ese scrollport
  // sería la cinta —que no se desplaza verticalmente— y la cabecera se iría con la página igual que
  // antes, o se correría 45px dejando un hueco. Es un defecto de especificación, no de navegador:
  // pasa en todos, y se lee como «el sticky no anda».
  //
  // Por eso los rótulos entran por `cabecera` y se corren con `translateX(-scrollLeft)` del MISMO
  // medidor que ya alimentaba la sombra: una sola fuente, imposible que se desfasen de las columnas.
  const c = cinta()
  const pegajosa = c.indexOf('CABECERA_PEGAJOSA')
  const scroller = c.indexOf("overflowX: 'auto'")
  assert.ok(pegajosa > 0 && scroller > 0, 'la cinta dejó de tener sus dos piezas')
  assert.ok(pegajosa < scroller, 'la cabecera pegajosa volvió adentro del elemento que scrollea: el sticky deja de anclarse')
  assert.match(c, /transform: `translateX\(\$\{-corrimiento\}px\)`/, 'los rótulos dejaron de seguir al scroll horizontal')
  assert.match(c, /setCorrimiento\(el\.scrollLeft\)/, 'el corrimiento dejó de salir del mismo medidor que la sombra')
  // `hidden` TAMBIÉN crea contenedor de scroll y volvería a robarle el anclaje al `sticky` que está
  // en ese mismo elemento. `clip` recorta sin crearlo.
  assert.match(c, /overflow: 'clip'/, 'el recorte de la cabecera volvió a `hidden`: se roba su propio anclaje')
  // Y LA TABLA SE LA PASA: una cinta que acepta cabecera y una tabla que no se la manda deja los
  // rótulos donde estaban y este archivo entero verde por vacío.
  assert.match(tabla(), /cabecera=\{\(/, 'la tabla dejó de mandarle los rótulos a la cinta')
})

test('la cabecera opaca: sin fondo, las filas se leen encima de los rótulos', () => {
  const c = cinta()
  assert.match(c, /className="bg-canvas"/, 'la cabecera pegajosa perdió su fondo y las filas pasan por encima')
})
