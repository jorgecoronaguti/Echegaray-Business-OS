import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL CANÓNICO «20 · PERSONA LEGAJO 360 v2», VERIFICADO CONTRA EL FUENTE ═══
//
// LOS DEFECTOS CAROS QUE ATRAPA:
//
//  · LA VUELTA DEL SLAB. Esta ficha se coronó con un `EntityHeader` blanco y después con un slab
//    grafito; el v2 no tiene ninguna cabecera de color.
//  · UNA ARROW EN LUGAR DE `args`/`bind`. `accion={() => darDeBaja(id)}` compila, pasa `build` y
//    deja la pantalla EN BLANCO en producción.
//  · AFIRMAR SOBRE LO QUE NO SE LEYÓ. Las HH se leen sólo en dos caras: publicar 0 en las otras
//    cuatro diría que la persona no trabajó este mes.
//  · DECIR «AL DÍA» SOBRE LOS PAPELES. `documento_legajo` no guarda vencimiento — eso sería
//    afirmar un control que nadie está haciendo.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (a: string) => readFileSync(join(DIR, a), 'utf8')
const pagina = () => readFileSync(join(DIR, '../../../app/(main)/administracion/personas/[id]/page.tsx'), 'utf8')

const sinComentarios = (texto: string) => texto
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
  })
  .join('\n')

const codigoPagina = () => sinComentarios(pagina())
const codigoCostado = () => sinComentarios(fuente('CostadoLegajo.tsx'))

test('el legajo abre con la miga y el nombre, sin slab y sin PageShell', () => {
  const src = codigoPagina()
  assert.match(src, /<Migas/)
  assert.match(src, /<TituloDeFicha/)
  assert.doesNotMatch(src, /CabeceraFicha|BarraContexto|<PageShell/)
  assert.doesNotMatch(src, /TiraMetricas|TarjetaFicha/, 'el v2 no dibuja tarjetas ni métricas en celdas')
})

test('el nombre se dibuja en oración pero el dato no se toca', () => {
  assert.match(codigoPagina(), /oracion\(persona\.nombre_completo\)/)
})

test('dar de baja y reincorporar van por `args`, nunca por una arrow', () => {
  const src = codigoPagina()
  assert.match(src, /accion=\{darDeBaja\} args=\{\[id\]\}/)
  assert.match(src, /accion=\{reincorporar\} args=\{\[id\]\}/)
  assert.doesNotMatch(src, /accion=\{\(\) =>/)
})

test('sin las horas leídas la cifra no escribe 0: dice dónde se leen', () => {
  assert.match(codigoPagina(), /falta: horas \? 'sin imputar' : 'se lee en Horas'/)
})

test('la primaria amarilla existe SÓLO cuando hay algo que resolver con ella', () => {
  const src = codigoPagina()
  assert.equal((src.match(/<AccionPrimaria/g) ?? []).length, 1)
  assert.match(src, /!egresada && !vigente && \(\s*<AccionPrimaria/)
})

test('la ficha nunca PUBLICA que los papeles estén «al día»', () => {
  // Se busca el indicador dibujado —`>al día<`— y no la frase: la pantalla SÍ explica, con esas
  // palabras, por qué no lo afirma. Prohibir la explicación enseñaría a borrarla.
  const src = codigoPagina()
  assert.doesNotMatch(src, />\s*al día\s*</, 'sin fecha de vencimiento eso afirma un control que nadie hace')
  assert.doesNotMatch(src, /tonoIndicador/, 'el indicador verde del aside anterior no puede volver')
})

// LA RETRIBUCIÓN YA NO ESTÁ AUSENTE (dueño, 15/09/2026: «quiero ver a primer golpe de vista cuánto
// se le está pagando por hora»). Sale de `persona_tarifa` y no de `persona_legajo`, que sigue sin
// publicar la columna. El control cambia de objeto: antes cuidaba que la ausencia se declarara; ahora
// cuida que el número esté arriba y que no se dibuje a partir de una lectura que la RLS negó.
test('el $/h que se paga está arriba del todo, antes de los avisos y de la tira de cifras', () => {
  const src = codigoPagina()
  assert.match(src, /<ValorHoraDelLegajo/)
  assert.doesNotMatch(src, /falta: 'no llega a esta pantalla'/, 'la retribución ya llega: el cartel viejo miente')
  const tira = src.indexOf('<ValorHoraDelLegajo')
  assert.ok(tira > 0 && tira < src.indexOf('<CifrasDeFicha'), 'el $/h va ANTES de la tira de cifras')
  assert.ok(tira < src.indexOf('<AvisoDeFicha'), 'el $/h va ANTES de los avisos')
})

test('el $/h no se dibuja a partir de una lectura que la RLS negó', () => {
  const src = codigoPagina()
  // `liquida_sueldos()` excluye al jefe de obra, que abre este legajo, y devuelve cero filas SIN
  // error: sin pasarle el permiso, «no puedo ver» se dibujaría igual que «nadie lo cargó».
  assert.match(src, /const liquida = liquidaSueldos\(rolActor\)/)
  assert.match(src, /puedeVer: liquida,/)
})

test('la solapa Retribución se esconde Y se cierra sin permiso, y su lectura no corre en otra vista', () => {
  const src = codigoPagina()
  // Esconder el tab y leer igual dejaría los sueldos en el HTML para el que sepa mirar la respuesta.
  assert.match(src, /liquida \|\| v !== 'retribucion'/, 'la solapa no se ofrece a quien no liquida sueldos')
  assert.match(src, /vista === 'retribucion' && !liquida/, '`?v=retribucion` a mano dice «sin permiso»')
  assert.match(src, /vista === 'retribucion' && liquida\s*\?\s*await getRetribucionDelLegajo/, 'la lectura cara sólo en su solapa y con permiso')
  // La tira de arriba enlaza a la sección sólo para quien puede entrar.
  assert.match(src, /hrefRetribucion=\{liquida \? href\('retribucion'\) : null\}/)
})

test('el estado sale de `en_la_empresa` y no de la fecha de egreso', () => {
  // Hay 15 personas que se fueron sin baja documentada: por la fecha figurarían activas.
  assert.match(codigoPagina(), /const egresada = !persona\.en_la_empresa/)
})

test('el costado acompaña a las seis caras y no se vuelve una solapa', () => {
  const src = codigoPagina()
  assert.match(src, /<CostadoDeFicha/)
  assert.match(src, /<CostadoLegajo/)
  // Y es lo único que se reemplaza cuando se abre el panel de edición.
  assert.match(src, /editar\s*\n?\s*\? \(/)
})

test('un mes sin registros escribe «—» y nunca 0', () => {
  assert.match(codigoCostado(), /m\.horas \?\? '—'/)
})

test('la solapa de la cuenta se esconde Y la cara se cierra', () => {
  const src = codigoPagina()
  assert.match(src, /veLaCuenta \|\| v !== 'usuario'/, 'la solapa no se ofrece')
  assert.match(src, /vista === 'usuario' && !veLaCuenta/, '`?v=usuario` a mano tampoco entra')
})
