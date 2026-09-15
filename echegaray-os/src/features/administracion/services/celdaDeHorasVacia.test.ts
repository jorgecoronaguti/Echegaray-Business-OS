// «SIN HORAS» EN TODOS LOS CUADROS — dueño, 15/09/2026: «quiero dejar sin hs una celda para
// completar más tarde; arreglar eso en TODOS los cuadros que tengan hs».
//
// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//  · el blanco significaba cuatro cosas distintas según la pantalla (volver al número, error, no
//    viajar, borrar) — ahora `leerCeldaDeHoras` y `planDeVaciado` son la única lectura;
//  · volver a guardar la presencia le devolvía la jornada por defecto al día vaciado;
//  · vaciar se llevaba extras, imputaciones al plan o ausencias que alguien declaró aparte;
//  · una pantalla dejaba de pasar por la regla compartida (los asserts de fuente de abajo).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { leerCeldaDeHoras, personasAVaciar, type VistaCasilla } from './jornadaPorObra.ts'
import { acuseDeVaciado, planDeVaciado } from './vaciadoDeHoras.ts'
import { FUENTE_HORAS_POR_DEFECTO, planDeHorasPorDefecto } from './presenciaDelDia.ts'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('VACÍO ≠ CERO ≠ NÚMERO: el blanco vacía, el cero es error, el número son horas', () => {
  assert.deepEqual(leerCeldaDeHoras(''), { accion: 'vaciar' })
  assert.deepEqual(leerCeldaDeHoras('   '), { accion: 'vaciar' })
  assert.equal(leerCeldaDeHoras('0').accion, 'error')
  assert.deepEqual(leerCeldaDeHoras('8,5'), { accion: 'horas', horas: 8.5 })
  assert.equal(leerCeldaDeHoras('x').accion, 'error')
})

const persona = (id: string) => ({ persona_id: id, nombre: id }) as never
const casilla = (persona_id: string, estado: VistaCasilla['estado'], error: string | null = null): VistaCasilla =>
  ({ persona_id, estado, horas: estado === 'presente' ? 8 : null, error, motivo: null })

test('LA CARGA DEL DÍA VACÍA SÓLO A QUIEN TENÍA HORAS Y QUEDÓ EN BLANCO', () => {
  const filas = [
    { persona: persona('cargado'), estado: 'presente' as const, horas: 9 },
    { persona: persona('nunca'), estado: 'sin_marcar' as const, horas: null },
    { persona: persona('sigue'), estado: 'presente' as const, horas: 9 },
    { persona: persona('ausente'), estado: 'ausente' as const, horas: null },
  ]
  const vista = [
    casilla('cargado', 'sin_marcar'), casilla('nunca', 'sin_marcar'),
    casilla('sigue', 'presente'), casilla('ausente', 'sin_marcar'),
  ]
  // `nunca` no viaja: guardar no convierte un silencio en escritura. `ausente` no es horas trabajadas.
  assert.deepEqual(personasAVaciar(filas, vista), ['cargado'])
  assert.deepEqual(personasAVaciar(filas, [casilla('cargado', 'sin_marcar', 'Poné un número')]), [])
})

const fila = (id: string, extra: Record<string, unknown> = {}) => ({
  id, persona_id: 'p', horas: 9, tipo_hora: 'normal', obra_canonica_id: 'obra-1', ...extra,
})

test('VACIAR SACA LA JORNADA TRABAJADA Y NOMBRA LO QUE DECLARÓ OTRO', () => {
  const plan = planDeVaciado([
    fila('a-normal'),
    fila('b-extra', { tipo_hora: 'extra_50' }),
    fila('c-actividad', { actividad_id: 'act-1' }),
    fila('d-improductiva', { improductiva: true }),
    fila('e-ausencia', { tipo_hora: 'ausencia' }),
    fila('f-otra-obra', { obra_canonica_id: 'obra-2' }),
    fila('g-otra-persona', { persona_id: 'q' }),
  ], ['p'], 'obra-1')
  assert.deepEqual(plan.borrar, ['a-normal'])
  assert.deepEqual(plan.intactas.map((i) => i.id), ['b-extra', 'c-actividad', 'd-improductiva', 'e-ausencia'])
})

test('sin obra (la celda de Liquidación es el día entero) alcanza todas las obras de esa persona', () => {
  const plan = planDeVaciado([fila('a'), fila('b', { obra_canonica_id: 'obra-2' })], ['p'], null)
  assert.deepEqual(plan.borrar, ['a', 'b'])
})

test('el acuse no dice «vacío» cuando quedó algo, ni «vaciado» cuando no había nada', () => {
  assert.match(acuseDeVaciado(1, []), /sin horas/i)
  assert.match(acuseDeVaciado(0, []), /ya estaba sin horas/i)
  assert.match(acuseDeVaciado(1, [{ motivo: 'tiene una hora extra_50 cargada aparte' }]), /extra_50/)
})

const LUNES = '2026-09-14'
/** Declarar a `p` presente el lunes, sin horas cargadas, contra lo que ya estaba guardado. */
const defecto = (guardadas: { persona_id: string; estado: 'presente' | 'ausente' | 'licencia' }[]) =>
  planDeHorasPorDefecto({
    presencias: [{ persona_id: 'p', estado: 'presente', motivo: null }],
    guardadas: guardadas.map((g) => ({ ...g, motivo: null })),
    horasExistentes: [], fecha: LUNES, obra: 'obra-1',
  })

test('LA PRESENCIA POR DEFECTO NO VUELVE A LLENAR UN DÍA VACIADO: re-guardar no es declarar', () => {
  // `p` ya estaba presente y Administración le dejó el día sin horas. Reabrir y Guardar no escribe.
  assert.deepEqual(defecto([{ persona_id: 'p', estado: 'presente' }]).insertar, [])
})

test('declarar presente de verdad sigue cargando la jornada (el control puede decir sí)', () => {
  assert.equal(defecto([]).insertar.length, 1)
  assert.equal(defecto([{ persona_id: 'p', estado: 'ausente' }]).insertar.length, 1)
})

test('pasar de presente a ausente sigue retirando la jornada por defecto que nadie miró', () => {
  const plan = planDeHorasPorDefecto({
    presencias: [{ persona_id: 'p', estado: 'ausente', motivo: 'falta' }],
    guardadas: [{ persona_id: 'p', estado: 'presente', motivo: null }],
    horasExistentes: [{ id: 'r', persona_id: 'p', tipo_hora: 'normal', fuente_legacy: FUENTE_HORAS_POR_DEFECTO, actualizado_por: null }],
    fecha: LUNES, obra: 'obra-1',
  })
  assert.deepEqual(plan.borrar, ['r'])
})

// ── EL CABLEADO: cada cuadro con horas pasa por la regla compartida ──────────────────────────────

test('la grilla Horas vacía con la lectura compartida y apila el deshacer', () => {
  const grilla = fuente('../components/GrillaAsistenciaObra.tsx')
  assert.doesNotMatch(grilla, /En blanco NO borra/)
  assert.match(grilla, /leerCeldaDeHoras\(bruto\)/)
  assert.match(grilla, /lectura\.accion === 'vaciar'/)
  assert.match(grilla, /deshacer\?\.registrar\(\{\s*clave: k/)
  const escritura = fuente('../components/asistencia/escrituraDeCeldaDeHoras.ts')
  assert.match(escritura, /estado: 'vaciar'/)
})

test('la carga del día manda a quien vació; la acción vacía por el servicio compartido', () => {
  assert.match(fuente('../components/asistencia/FormAsistencia.tsx'), /guardarJornada\(\{ obra_id: obraId, fecha, marcas, vaciar \}\)/)
  const acciones = fuente('./jornadaPorObraActions.ts')
  assert.match(acciones, /c\.estado === 'vaciar'/)
  assert.equal((acciones.match(/vaciarHorasDelDia\(supabase/g) ?? []).length, 2)
})

test('Liquidación vacía por la misma regla y rechaza el cero', () => {
  const liq = fuente('./liquidacionDiaActions.ts')
  assert.match(liq, /vaciarHorasDelDia\(supabase/)
  assert.doesNotMatch(liq, /registros_hh'\)\.delete\(\)/)
  assert.doesNotMatch(fuente('./horasDeLaCeldaActions.ts'), /datos\.data\.horas === 0/)
})

test('guardar la presencia le pasa lo ya guardado al plan de horas por defecto', () => {
  const presencia = fuente('./presenciaDelDiaActions.ts')
  assert.match(presencia, /presencias: marcas,\s*guardadas,/)
  // Sin cambios de presencia no hay camino a las horas por defecto.
  assert.equal((presencia.match(/aplicarHorasPorDefecto\(supabase/g) ?? []).length, 1)
})
