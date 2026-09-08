import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import postcss from 'postcss'
import tailwind from 'tailwindcss'

// LOS CORTES POR ANCHO TIENEN QUE EXISTIR EN EL CSS QUE SE SIRVE, NO SÓLO EN EL FUENTE.
//
// ═══ QUÉ DEFECTO ATRAPA (medido en producción y en build propio, 08/09/2026) ═══
//
// Ningún corte por ancho del repositorio llegaba al CSS emitido: 19 usos de la variante de 1249px
// con `hidden`, 7 de la de 559px, más los de Compras y Cartera — CERO reglas `@media (max-width: …)`
// en el bundle. Las tablas del patrón v2 dibujaban TODAS sus columnas en un teléfono desde el día
// que se escribieron.
//
// La causa no estaba en el pipeline ni en la config: Tailwind lleva UN cache de unidades por
// corrida (`corePlugins.js`, `canUseUnits`). Lo siembra con las unidades de `theme.screens` —todo
// px— y le agrega la unidad de cada valor arbitrario de las variantes de ancho que encuentra. Si el
// cache termina con más de una unidad, la variante devuelve `[]`: no emite regla, no rompe el
// build, sólo deja un `warn` que `next build` no muestra. Y como el cache es de la corrida entera,
// UN candidato con otra unidad apaga los cortes de TODO el repositorio.
//
// Los dos candidatos que lo apagaban estaban dentro de COMENTARIOS —el extractor de Tailwind lee el
// archivo crudo, no distingue código de comentario—: uno escribía la variante con la N sin resolver
// y el otro con puntos suspensivos. Sus «unidades» (`Npx`, `...`) envenenaban el cache.
//
// ═══ POR QUÉ ESTE TEST COMPILA DE VERDAD ═══
//
// La regla del fuente (abajo) es el diagnóstico barato y nombra el archivo culpable, pero no puede
// probar el EFECTO: mañana el que apague los cortes puede ser otro plugin, otra config u otra
// versión. Por eso el segundo test corre Tailwind sobre el `content` real y exige la media query
// emitida. Tarda unos segundos y es la única evidencia de que la regla existe donde el navegador la
// lee.

const RAIZ = new URL('../../../..', import.meta.url).pathname
const CONFIG = join(RAIZ, 'tailwind.config.ts')

/** Las mismas extensiones que escanea Tailwind por su `content`. */
const EXTENSIONES = ['.js', '.ts', '.jsx', '.tsx', '.mdx']

function fuentesDeSrc(dir = join(RAIZ, 'src'), acumulado: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name)
    if (entrada.isDirectory()) fuentesDeSrc(ruta, acumulado)
    else if (EXTENSIONES.some((ext) => entrada.name.endsWith(ext))) acumulado.push(ruta)
  }
  return acumulado
}

/**
 * Un candidato de variante de ancho. El `(?<![\w-])` evita confundirlo con la utilidad `max-w-[…]`,
 * que no es una variante y no toca el cache de unidades.
 */
const CANDIDATO = /(?<![\w-])(min|max)-\[([^\]\s]+)\]:/g

type Corte = { tipo: string, valor: string, archivo: string, linea: number }

function cortesDeclarados(): Corte[] {
  const cortes: Corte[] = []
  for (const archivo of fuentesDeSrc()) {
    readFileSync(archivo, 'utf8').split('\n').forEach((linea, i) => {
      for (const m of linea.matchAll(CANDIDATO)) {
        cortes.push({ tipo: m[1], valor: m[2], archivo: relative(RAIZ, archivo), linea: i + 1 })
      }
    })
  }
  return cortes
}

/** Las clases enteras —variante + utilidad— tal como las escribe un componente. */
const CLASE = /(?<![\w-])((?:min|max)-\[[^\]\s]+\]:[^\s'"`]+)/g

/**
 * Sólo `.tsx`: lo que escribe un componente es lo que el navegador tiene que poder aplicar. Los
 * fixtures de los tests declaran grillas inventadas que Tailwind no siempre puede resolver, y un
 * control que da rojo sin defecto se termina silenciando.
 */
function clasesDeComponentes(): Map<string, string> {
  const clases = new Map<string, string>()
  for (const archivo of fuentesDeSrc().filter((f) => f.endsWith('.tsx'))) {
    for (const m of readFileSync(archivo, 'utf8').matchAll(CLASE)) {
      clases.set(m[1], relative(RAIZ, archivo))
    }
  }
  return clases
}

/**
 * El selector que emite Tailwind para esa clase. Se corta en la primera coma o porcentaje porque
 * ahí el escape deja de ser `\x` y pasa a hexadecimal (`\2c `): el prefijo ya prueba que la regla
 * existe, y una comparación más literal sería frágil sin ser más estricta.
 */
function selectorDe(clase: string): string {
  const corte = clase.search(/[,%]/)
  const parcial = corte === -1 ? clase : clase.slice(0, corte)
  return '.' + parcial.replace(/[^\w-]/g, (ch) => '\\' + ch)
}

test('ningún corte por ancho usa otra unidad que px — uno solo apaga los cortes de todo el repo', () => {
  const cortes = cortesDeclarados()
  assert.ok(cortes.length > 20, `esperaba los cortes del patrón v2, encontré ${cortes.length}`)

  const intrusos = cortes.filter((c) => !/^\d+px$/.test(c.valor))
  assert.deepEqual(
    intrusos.map((c) => `${c.archivo}:${c.linea} → ${c.tipo}-[${c.valor}]:`),
    [],
    'Tailwind lee TODO el archivo, también los comentarios: un valor que no sea un ancho en px entra'
    + ' al cache de unidades y deja sin CSS a TODAS las variantes de ancho del build, en silencio.'
    + ' Si es un comentario, escribí la variante sin corchetes.',
  )
})

test('cada clase con corte por ancho existe en el CSS compilado', async () => {
  // El `content` del config es relativo al cwd. Los tests corren desde la raíz de la app, pero se
  // fija igual: un escaneo vacío compilaría sin error y el test quedaría verde por nada.
  process.chdir(RAIZ)

  const compilado = await postcss([tailwind({ config: CONFIG })])
    .process('@tailwind utilities;', { from: undefined })
  const css = compilado.css

  // EL CONTROL TIENE QUE PODER DAR ROJO: si el escaneo no encontró los fuentes, cae acá y no en un
  // `deepEqual` vacío que parecería un éxito.
  assert.ok(
    css.includes('@media (min-width: 640px)'),
    'el CSS compilado no trae ni las variantes de pantalla estándar: el escaneo del `content` falló',
  )

  const clases = clasesDeComponentes()
  assert.ok(clases.size > 25, `esperaba las clases del patrón v2, encontré ${clases.size}`)

  const faltantes = [...clases]
    .filter(([clase]) => !css.includes(selectorDe(clase)))
    .map(([clase, archivo]) => `${archivo} → ${clase}`)
  assert.deepEqual(
    faltantes, [],
    'clases escritas en un componente que NO tienen regla en el CSS: el navegador nunca las aplica',
  )
})
