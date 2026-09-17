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

test('en el Plantel la tardanza se ofrece sobre un presente y, desde el 17/09, directo sobre «sin marcar» con obra', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Ofrecer «tarde» sobre «sin marcar» declararía presente a alguien que nadie miró (llegar tarde es
  // haber venido), y sobre una ausencia la base lo rechaza. La oferta es la MISMA que la de quitar
  // —`ofertaDeMarcar` devuelve 'quitar' sólo sobre `presente`—, no una tercera regla.
  const src = sinComentarios(fuente('TablaPersonas.tsx'))
  const usos = src.match(/<MarcaTardanzaHoy/g) ?? []
  assert.equal(usos.length, 2)
  assert.match(src, /oferta === 'quitar' && \(\s*<MarcaTardanzaHoy/)
  // DUEÑO, 17/09/2026: «en la computadora no puedo marcar tardanzas». Sobre «sin marcar» CON obra
  // (`boton`) la tardanza va directa y declara presente en esa obra; nunca sobre ausencia ni sin obra.
  assert.match(src, /oferta === 'boton' && \(\s*<MarcaTardanzaHoy[\s\S]{0,400}obraSinMarcar=\{p\.obra_actual_id as string\}/)
  assert.doesNotMatch(src, /oferta === 'sin_obra' && \(\s*<MarcaTardanzaHoy/)
  // UNA SOLA DEFINICIÓN DE LAS ACCIONES (`AccionesHoy`) Y DOS LUGARES (17/09/2026): la columna HOY en
  // escritorio y el bloque táctil debajo del nombre en el teléfono. Quitar el del teléfono deja otra
  // vez sin forma de marcar asistencia debajo de 1250 px.
  const lugares = src.match(/<AccionesHoy p=\{p\} oferta=\{oferta\} fecha=\{marcar\.fecha\} inicial=\{pulso\?\.tardanzas\.get\(p\.id\)\}/g) ?? []
  assert.equal(lugares.length, 2, 'las acciones de hoy tienen que estar en escritorio y en el teléfono')
  assert.match(src, /data-testid="hoy-persona-movil"[\s\S]{0,400}<AccionesHoy[^>]*tactil \/>/)
  // La columna HOY creció para que los cuatro controles entren en una línea.
  assert.match(src, /_130px_260px_90px_70px_90px\]/)
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
