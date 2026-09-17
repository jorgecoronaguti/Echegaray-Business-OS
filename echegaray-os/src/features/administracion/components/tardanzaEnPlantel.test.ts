import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ LA TARDANZA DESDE EL PLANTEL (dueño, 15/09/2026) ═══
//
// *«en pantalla plantel donde marco la asistencia desde computadora tengo que tener disponible
// tardanzas o retiros anticipados»*. Mismo método que `canonico-personal-v2.test.ts`: se protegen
// DECISIONES ESCRITAS en el código —qué acción escribe, sobre qué estado se ofrece, que no haya una
// segunda escritura— y no un render. La REGLA (qué es una marca, cómo se cuenta, qué dice el pie) se
// prueba sobre la función pura en `services/pulsoDelPlantel.test.ts`.
//
// LO QUE ESTE TEST NO PRUEBA: que el clic escriba la fila. Eso lo prueba `marcarTardanza` contra la
// base y lo mira QA visual sobre la pantalla autenticada.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (a: string) => readFileSync(join(DIR, a), 'utf8')
const pagina = () => readFileSync(join(DIR, '../../../app/(main)/administracion/personas/page.tsx'), 'utf8')

const sinComentarios = (texto: string) => texto
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*'))
  })
  .join('\n')

test('el control usa la MISMA acción que la celda de Horas y no escribe por su cuenta', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Un segundo upsert a `asistencia_dia` desde el componente saltearía la guarda de quincena cerrada,
  // el rechazo sobre un ausente y el reintento ante la migración pendiente, que viven en la acción.
  const src = sinComentarios(fuente('MarcaTardanzaHoy.tsx'))
  // Desde el 17/09 sobre «sin marcar» usa `guardarPresencia` (declara presente con la marca y la obra):
  // sigue siendo UNA ACCIÓN del servidor, nunca un upsert propio.
  assert.match(src, /import \{ guardarPresencia, marcarTardanza \} from '\.\.\/services\/presenciaDelDiaActions'/)
  assert.match(src, /await marcarTardanza\(\{/)
  assert.doesNotMatch(src, /from\('asistencia_dia'\)|createClient/)
  // EL ACUSE SALE DE LO QUE LA BASE DEVOLVIÓ: sin `ok` no se pinta ámbar.
  assert.match(src, /if \(r\.ok\) setMarca\(siguiente\)/)
})

test('el clic no navega al legajo: la fila entera es un enlace', () => {
  const src = sinComentarios(fuente('MarcaTardanzaHoy.tsx'))
  assert.match(src, /e\.preventDefault\(\); e\.stopPropagation\(\)/)
})

test('la marca puesta se ve con el ▲ ámbar y se explica en el title; el control es un toggle', () => {
  const src = sinComentarios(fuente('MarcaTardanzaHoy.tsx'))
  assert.match(src, /aria-pressed=\{activo\}/)
  assert.match(src, /`▲ \$\{tactil \? r\.largo : r\.corto\}`/)
  assert.match(src, /V\.warn/)
  assert.match(src, /pierde el presentismo de la quincena/)
  // NINGÚN HEX SUELTO: los colores salen de `V` o de un token de Tailwind.
  assert.doesNotMatch(src, /#[0-9A-Fa-f]{6}/)
})

test('el Plantel ya NO carga asistencia: ni acciones de hoy ni tardanza en la tabla (dueño, 17/09/2026)', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // *«es una funcionalidad cruzada y errada… una sola experiencia de uso para ingresar a carga de
  // asistencia»*. Marcar presente o tardanza vive en la solapa Asistencia (`CargaDeAsistencia`). Si
  // vuelven los botones al Plantel, hay otra vez dos puertas con dos reglas para la misma escritura.
  const src = sinComentarios(fuente('TablaPersonas.tsx'))
  assert.doesNotMatch(src, /<AccionesHoy|function AccionesHoy/, 'volvieron las acciones de hoy al Plantel')
  assert.doesNotMatch(src, /<MarcaTardanzaHoy|<BotonPresenteHoy|<BotonQuitarPresente/, 'volvió un control de carga al Plantel')
  assert.doesNotMatch(src, /ofertaDeMarcar\(/, 'el Plantel volvió a decidir qué ofrecer para marcar')
})

test('el pie de la tabla dice la leyenda del ▲ y cuenta la quincena con la lectura compartida', () => {
  const tabla = sinComentarios(fuente('TablaPersonas.tsx'))
  assert.match(tabla, /data-testid="pie-tardanzas"/)
  assert.match(tabla, /\{pulso\.pieTardanzas\}/)
  const src = sinComentarios(pagina())
  // NO UNA SEGUNDA CONSULTA: la quincena sale de `leerPresenciasDeLaQuincena`, memoizada por request y
  // con el reintento sin columnas de tardanza mientras la migración no esté aplicada.
  assert.match(src, /leerPresenciasDeLaQuincena\(supabase, quincena\.desde, quincena\.hasta\)/)
  assert.doesNotMatch(src, /from\('asistencia_dia'\)/)
  // UN 0 QUE NO SE LEYÓ NO ES UN 0: con error, el pie recibe `null`.
  assert.match(src, /!tardanzasQuincena\.error \? personasConTardanza\(tardanzasQuincena\.data \?\? \[\]\) : null/)
  assert.match(src, /tardanzas: tardanzasDeHoy\(presencia\.data \?\? \[\]\)/)
})
