import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL CANÓNICO «21 · CUADRILLAS Y HH v2», VERIFICADO CONTRA EL FUENTE ═══
//
// Mismo método que `canonico-proveedores-v2.test.ts`: lo que se protege son DECISIONES ESCRITAS —el
// orden de los bloques, qué afirma cada columna, qué NO se dibuja porque no tiene fuente— y no un
// comportamiento de render. Montar React para leer un estilo que ya está literal en el archivo mete
// un runtime entero entre la afirmación y el hecho.
//
// EL DEFECTO CARO QUE ATRAPA es doble:
//
//  · VOLVER A LA CAJA. La versión de agosto dibujaba `ListaCanon` —borde, radio 10, encabezado gris
//    y pie de totales adentro— y basta un import distraído para que la pantalla retroceda.
//  · ESCRIBIR «PRESENTES». El mockup lo dice así, pero la base guarda MARCAS: quien no fichó puede
//    no tener teléfono. Un «5/6 presentes» convierte esa ignorancia en una ausencia, y con ausencias
//    se liquidan jornales.

const DIR = dirname(fileURLToPath(import.meta.url))
const V2 = '../../../shared/components/v2/'

const fuente = (a: string) => readFileSync(join(DIR, a), 'utf8')
const pagina = () => readFileSync(join(DIR, '../../../app/(main)/administracion/personas/cuadrillas/page.tsx'), 'utf8')

/**
 * El archivo SIN sus comentarios.
 *
 * Varias de estas comprobaciones preguntan «¿esta pantalla usa X?», y los comentarios de este repo
 * explican POR QUÉ NO se usa X — o sea que nombran justo lo que se está prohibiendo. Sin el filtro,
 * el test se pone rojo por la explicación de la decisión correcta, que es la peor clase de falso
 * positivo: enseña a borrar el comentario.
 */
const sinComentarios = (texto: string) => texto
  // Los bloques `{/* … */}` se sacan ENTEROS y no línea por línea: una explicación de dos renglones
  // deja el segundo empezando con texto común, y el filtro de líneas no lo vería.
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
  })
  .join('\n')

const codigo = (a: string) => sinComentarios(fuente(a))
const codigoPagina = () => sinComentarios(pagina())

// ── EL BLOQUE «LO QUE PIDE TRABAJO» NO VUELVE (orden del dueño, 08/09/2026) ─────────────────────
//
// El criterio 1 del v2 pedía que la primera línea de contenido fuera trabajo, y esta pantalla era
// la única de segundo nivel cuyo mockup lo dibujaba. El dueño lo retiró de TODA la plataforma —«no
// es útil y confunde»—, así que la regla se da vuelta: lo que este test atrapa ahora es que el
// bloque vuelva a montarse acá. Revertir el retiro pone rojo este test.

test('la pantalla no vuelve a montar el bloque «Lo que pide trabajo»', () => {
  const src = codigoPagina()
  assert.doesNotMatch(src, /<TrabajoDeSeccion/, 'volvió la banda de señales que el dueño retiró')
  assert.doesNotMatch(src, /TrabajoDeSeccion'/, 'volvió el import del bloque retirado')
  assert.doesNotMatch(src, /Lo que pide trabajo/)
  assert.ok(src.indexOf('<SolapasDeFicha') > 0, 'lo que abre la pantalla es la banda de período')
})

// ── CRITERIO 3 · SIN CAJAS ───────────────────────────────────────────────────────────────────────

test('ni la página ni la lista importan el canon de la caja', () => {
  for (const a of ['TablaCuadrillas.tsx', 'CostadoCuadrillas.tsx']) {
    assert.doesNotMatch(codigo(a), /shared\/components\/canon/, `${a} volvió a la tarjeta con borde y radio`)
  }
  assert.doesNotMatch(codigoPagina(), /shared\/components\/canon/)
})

test('la lista no dibuja tarjeta: ni fondo blanco, ni radio de contenedor, ni sombra', () => {
  const src = codigo('TablaCuadrillas.tsx')
  assert.doesNotMatch(src, /borderRadius:\s*10/)
  assert.doesNotMatch(src, /background:\s*'#FFFFFF'/)
  assert.doesNotMatch(src, /boxShadow:\s*'0/, 'sin sombras: la jerarquía es tipográfica')
})

test('la franja de cinco tarjetas de la versión anterior no volvió', () => {
  const src = codigoPagina()
  assert.doesNotMatch(src, /<Franja/, 'el v2 borra las tarjetas de cabecera')
  assert.doesNotMatch(src, /Capacidad ponderada/, 'la métrica de la franja se fue con la franja')
})

// ── LO QUE LA PANTALLA NO PUEDE AFIRMAR ──────────────────────────────────────────────────────────

test('la columna de asistencia dice FICHADOS y nunca «presentes» ni «ausente»', () => {
  const src = codigo('TablaCuadrillas.tsx')
  assert.match(src, /fichados/, 'la columna existe y se llama por lo que la base sabe')
  assert.doesNotMatch(src, /presentes/i, '«presentes» afirma asistencia; la base tiene marcas')
  assert.doesNotMatch(src, /ausente/i, 'sin fichar NO es ausente: incluye al que no tiene teléfono')
})

test('sin lectura de presencia se dice «sin leer», nunca 0 de N', () => {
  assert.match(codigo('TablaCuadrillas.tsx'), /sin leer/)
})

test('«rendimiento» no se dibuja: no existe el vínculo cuadrilla → tarea que lo haría comparable', () => {
  assert.doesNotMatch(codigo('TablaCuadrillas.tsx'), /rend\b|rendimiento/i)
})

test('una cuadrilla o una persona sin registros escribe «—» y nunca 0 HH', () => {
  const src = codigo('TablaCuadrillas.tsx')
  assert.match(src, /=== undefined \? '—'/, 'ausente del mapa no es haber trabajado cero')
})

// ── LO QUE EL RETIRO DE LA BANDA NO PODÍA LLEVARSE ──────────────────────────────────────────────
//
// El verbo «cuadrillas sin obra → Asignar» vivía en la señal y se fue con ella. El RECORTE no: la
// página lo sigue aplicando, y borrarlo dejaría `?sin=obra` devolviendo la lista entera sin decir
// que ignoró el filtro. El pool conserva además su enlace propio.

test('el recorte «sin obra» sigue aplicándose aunque su verbo se haya ido', () => {
  assert.match(codigoPagina(), /sp\.sin === 'obra'/, 'un filtro que se acepta y no se aplica miente')
})

test('el pool sin cuadrilla conserva su entrada, que no dependía de la banda', () => {
  assert.match(codigoPagina(), /hrefPool=/)
})

// ── LO QUE NO PUEDE DESAPARECER AL PORTAR ────────────────────────────────────────────────────────

test('las cuadrillas archivadas siguen teniendo entrada aunque el mockup no la dibuje', () => {
  assert.match(codigoPagina(), /ver-archivadas/, 'sin entrada, las archivadas quedan invisibles para siempre')
})

test('las otras dos vistas de HH siguen alcanzables desde acá', () => {
  const src = codigoPagina()
  assert.match(src, /\$\{RUTA\}\/asistencia/)
  assert.match(src, /\$\{RUTA\}\/periodos/)
})

test('editar la cuadrilla es un parámetro distinto de elegirla', () => {
  const src = codigoPagina()
  assert.match(src, /sp\.editar/, 'con un solo `?c=` no se puede ver la gente sin abrir el formulario')
  assert.match(src, /editarCuadrilla\.bind/, 'bind y NO una arrow: React rechaza la función nueva en ejecución')
})

// ── UNA SOLA ACCIÓN PRIMARIA ─────────────────────────────────────────────────────────────────────

test('hay exactamente una acción amarilla en la pantalla', () => {
  const src = codigoPagina()
  assert.equal((src.match(/<AccionPrimaria/g) ?? []).length, 1)
})

test('el vocabulario de segundo nivel vive en shared y no se redefine acá', () => {
  const src = codigoPagina()
  assert.match(src, /from '@\/shared\/components\/v2\/segundoNivel'/)
  assert.doesNotMatch(src, /<PageShell/, 'una pantalla de segundo nivel abre con la miga, no con el h1 del shell')
})

test('el costado del v2 mide 300px y no los 372 del panel de una sección', () => {
  assert.match(fuente(V2 + 'segundoNivel.tsx'), /lg:w-\[300px\]/)
})
