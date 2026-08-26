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

// ── CRITERIO 1 · LA PRIMERA LÍNEA DE CONTENIDO ES TRABAJO ────────────────────────────────────────

test('el bloque de trabajo se dibuja ANTES que la banda de período y que la lista', () => {
  const src = pagina()
  const trabajo = src.indexOf('<TrabajoDeSeccion')
  const banda = src.indexOf('<SolapasDeFicha')
  const lista = src.indexOf('<TablaCuadrillas')

  assert.ok(trabajo > 0, 'la 21 v2 es la única de segundo nivel con bloque de trabajo: tiene que estar')
  assert.ok(trabajo < banda, 'la banda de período no puede abrir la pantalla: lo que abre es el trabajo')
  assert.ok(trabajo < lista, 'la lista de cuadrillas es el maestro, y el maestro va debajo')
})

test('reusa el bloque de trabajo compartido en vez de dibujar el suyo', () => {
  const src = codigoPagina()
  assert.match(src, /from '@\/shared\/components\/v2\/TrabajoDeSeccion'/)
  assert.doesNotMatch(src, /Lo que pide trabajo/, 'el rótulo lo escribe el componente compartido, no la página')
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

// ── EL VERBO ATERRIZA EN EL FILTRO QUE PRODUJO EL NÚMERO ─────────────────────────────────────────

test('«cuadrillas sin obra → Asignar» cae en esas cuadrillas y no en la lista entera', () => {
  const senales = readFileSync(join(DIR, '../services/senalesCuadrillas.ts'), 'utf8')
  assert.match(senales, /hrefs\.sinObra/)
  assert.match(codigoPagina(), /sinObra: href\(sp, \{ sin: 'obra'/)
  assert.match(codigoPagina(), /sp\.sin === 'obra'/, 'la página tiene que APLICAR el recorte que promete')
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
