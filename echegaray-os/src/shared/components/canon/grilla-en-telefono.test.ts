import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { anchoMinimoDeGrilla, pistasDe } from './ancho-minimo.ts'

// NINGUNA TABLA DEL CANON PUEDE NACER SIN SCROLL PROPIO — REGLA SOBRE EL FUENTE.
//
// ═══ QUÉ DEFECTO ATRAPA (medido a 390×844 el 25/08/2026) ═══
//
// Las diez tablas del canon son grillas con columnas en px mezcladas con `minmax(0, N fr)`. En el
// teléfono las de px no ceden y las fraccionales caen a cero, y como `body` lleva `overflow-x: clip`
// (globals.css) lo que sobra NO se corre: se corta, sin barra que lo delate.
//
//   `/presupuestos`      el encabezado se leía «PRESUPUESTOCLIENTE» (97 px cortados)
//   `/presupuestos/[id]` «PARTIDACANT.» (280 px)
//   `/clientes`, `/administracion`, `/administracion/personas`   el nombre en UNA letra: «B» por
//                        «Messina», «A» por «Aguero Cristian Domingo». Peor que el scroll, porque
//                        la pantalla no dice que falta algo: dice que el cliente se llama «B».
//
// El arreglo es que la CAJA sea su propio contenedor de scroll (`TarjetaTabla` / `ListaCanon` →
// `EnvoltorioAncho`), y para eso necesita la MISMA cadena `cols` que dibuja las filas. Una tabla que
// dibuja `EncabezadoCanon` pero no le pasa `cols` a su caja vuelve al defecto exacto de arriba.
//
// ═══ POR QUÉ UNA REGLA SOBRE EL FUENTE Y NO SOBRE EL DOM ═══
//
// Mismo precedente y misma forma que `features/obras/components/prefetch-navegacion-obra.test.ts`:
// medir el corte de verdad exige navegador, servidor, base y dos viewports, y tarda minutos. Esto
// cuesta milisegundos y caza el defecto donde se escribe. NO prueba que a 390 px se vea bien —eso
// sólo lo prueba un navegador, y queda declarado como pendiente—: prueba que una tabla canon no
// puede nacer sin su contenedor de scroll sin que este archivo se ponga rojo.

const RAIZ = new URL('../../../..', import.meta.url).pathname
const CANON = 'src/shared/components/canon'

function fuentes(dir: string): string[] {
  const salida: string[] = []
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) salida.push(...fuentes(ruta))
    else if (nombre.endsWith('.tsx') && !nombre.includes('.test.')) salida.push(ruta)
  }
  return salida
}

/** El fuente SIN comentarios: este repo explica en prosa lo que retiró, y una regla que lee prosa se
 *  pone roja por una explicación correcta. Mismo helper que `prefetch-navegacion-obra.test.ts`. */
const codigo = (fuente: string) => fuente
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('//'))
  .join('\n')

test('toda tabla del canon le pasa sus columnas a la caja que la contiene', () => {
  const archivos = fuentes(join(RAIZ, 'src'))
    .filter((r) => !r.includes(CANON))
    .map((ruta) => ({ ruta, src: codigo(readFileSync(ruta, 'utf8')) }))
    .filter(({ src }) => /<(EncabezadoCanon|CabezaCanon)\b/.test(src))

  // Si esto se desploma, la regla dejó de mirar lo que debe mirar (componentes movidos o
  // renombrados) y se estaría poniendo verde por vacía.
  //
  // EL PISO BAJA A MEDIDA QUE AVANZA EL PORTE v2, y eso es lo esperado: la cartera de Clientes fue
  // la primera en salir del canon (25/08/2026). Las tablas del v2 NO llevan caja de scroll porque
  // resuelven el teléfono de otra manera —una media query que SUELTA columnas secundarias por
  // debajo de 1250px y nunca estrangula el nombre—, así que no entran en esta regla. Bajar el piso
  // de a uno por cada porte es deliberado: si se desploma de golpe, algo se rompió.
  assert.ok(archivos.length >= 7, `esperaba las tablas del canon, encontré ${archivos.length}`)

  let cajas = 0
  for (const { ruta, src } of archivos) {
    const corto = ruta.slice(RAIZ.length)
    // Sin la bandera `s`: `[^>]` ya cruza saltos de línea y el target del proyecto es anterior a
    // es2018. Una etiqueta partida en varias líneas se atrapa igual.
    const etiquetas = src.match(/<(TarjetaTabla|ListaCanon)\b[^>]*>/g) ?? []
    assert.ok(
      etiquetas.length > 0,
      `${corto} dibuja un encabezado del canon pero ninguna caja (TarjetaTabla/ListaCanon): sin caja `
      + 'no hay contenedor de scroll y en el teléfono el dato se corta en silencio',
    )
    for (const etiqueta of etiquetas) {
      cajas++
      assert.match(
        etiqueta, /\bcols=/,
        `${corto} tiene una caja del canon sin \`cols\`: no reserva ancho ni scrollea por dentro, y a `
        + `390px las columnas fraccionales caen a cero — ${etiqueta.replace(/\s+/g, ' ').slice(0, 110)}`,
      )
    }
  }
  assert.ok(cajas >= 7, `esperaba ≥7 cajas del canon, miré ${cajas}`)
})

test('ninguna cadena de columnas del canon deja el nombre por debajo de su piso', () => {
  const archivos = fuentes(join(RAIZ, 'src'))
    .filter((r) => !r.includes(CANON))
    .map((ruta) => ({ ruta, src: codigo(readFileSync(ruta, 'utf8')) }))
    .filter(({ src }) => /<(EncabezadoCanon|CabezaCanon)\b/.test(src))

  let grillas = 0
  for (const { ruta, src } of archivos) {
    // Toda cadena literal que mezcle `fr` con `px`: es la firma de una `gridTemplateColumns` del
    // canon. Las que son sólo px no tienen columna elástica que colapsar.
    for (const [, cadena] of src.matchAll(/'([^']*fr\)[^']*)'/g)) {
      if (!/\d+px/.test(cadena)) continue
      // Toda pista tiene que ser una pista de verdad: sin esto, cualquier texto con «fr)» y un «px»
      // adentro entra al conteo y la regla se cree que está mirando más de lo que mira.
      const pistas = pistasDe(cadena)
      if (pistas.length < 2 || !pistas.every((p) => /^(minmax\(.+\)|\d+(\.\d+)?(px|fr)|auto)$/.test(p))) continue
      grillas++
      const ancho = anchoMinimoDeGrilla(cadena)
      assert.ok(
        ancho > 390,
        `${ruta.slice(RAIZ.length)} declara «${cadena}» con un mínimo de ${ancho}px: si entrara en un `
        + 'teléfono no habría defecto que arreglar — revisá que la cadena sea la que se cree',
      )
    }
  }
  // EL PISO BAJA CON CADA PANTALLA QUE SALE DEL CANON, y eso es lo esperado: `25 · Clientes`,
  // `19 · Personal` y `27 · Documentos` ya están en el patrón v2, que resuelve el teléfono con una
  // media query que SUELTA columnas en vez de con una caja que scrollea. Bajar el piso de a una por
  // porte es deliberado; si se desploma de golpe, la regla dejó de mirar lo que debe mirar.
  assert.ok(grillas >= 9, `esperaba ≥9 grillas canon declaradas, encontré ${grillas}`)
})

test('las DOS cajas del canon envuelven con scroll propio y ancho reservado', () => {
  // Son dos cajas distintas —`TarjetaTabla` porta las pantallas 14/15/22/24/25/27 y `ListaCanon` la
  // 17/18/19/21— y arreglar una sola dejaría media Administración rota en el teléfono.
  for (const nombre of ['Tabla.tsx', 'ListaCanon.tsx']) {
    assert.match(
      codigo(readFileSync(join(RAIZ, CANON, nombre), 'utf8')), /<EnvoltorioAncho cols=/,
      `${nombre} dejó de envolver la tabla: sin EnvoltorioAncho la caja no scrollea por dentro`,
    )
  }

  const envoltorio = codigo(readFileSync(join(RAIZ, CANON, 'EnvoltorioAncho.tsx'), 'utf8'))
  // Las dos clases tienen que estar las dos: `overflow-x` sin `min-width` no scrollea nada (no hay
  // nada más ancho que el contenedor), y `min-width` sin `overflow-x` desborda contra el `clip` del
  // `body` — que es exactamente el defecto original.
  assert.match(envoltorio, /canon-scroll-x/)
  assert.match(envoltorio, /canon-ancho-canonico/)
  // El ancho tiene que viajar como variable CSS: un `min-width` inline le ganaría al media query y
  // el escritorio de 1280/1440 dejaría de medir lo que mide el `.dc.html`.
  assert.match(envoltorio, /'--canon-ancho'/)
  assert.doesNotMatch(envoltorio, /minWidth/)
  // El árbol de accesibilidad no puede ver estas dos capas: si las viera, las filas dejarían de
  // colgar del `role="table"` y la tabla dejaría de ser una tabla para un lector de pantalla.
  assert.equal((envoltorio.match(/role="presentation"/g) ?? []).length, 2)
})

test('el scroll del teléfono no toca el escritorio de 1280 ni el de 1440', () => {
  const css = readFileSync(join(RAIZ, 'src/app/globals.css'), 'utf8')

  const bloque = /@media \(max-width: 1023px\) \{([\s\S]*?)\n\}/.exec(css)
  assert.ok(
    bloque,
    'las clases del canon tienen que vivir bajo `@media (max-width: 1023px)`: aplicarlas siempre le '
    + 'mete una barra de scroll a la tabla de 918px de `18 · Recursos` cuando el panel de 372px está '
    + 'abierto en 1280, y el porte literal deja de medir lo que mide el `.dc.html`',
  )
  assert.match(bloque[1], /\.canon-scroll-x\s*\{[^}]*overflow-x:\s*auto/)
  assert.match(bloque[1], /\.canon-ancho-canonico\s*\{[^}]*min-width:\s*var\(--canon-ancho/)

  // Y fuera del media query no puede haber otra definición que las reviva en escritorio.
  const fuera = css.replace(bloque[0], '')
  assert.doesNotMatch(fuera, /\.canon-scroll-x|\.canon-ancho-canonico/)
})
