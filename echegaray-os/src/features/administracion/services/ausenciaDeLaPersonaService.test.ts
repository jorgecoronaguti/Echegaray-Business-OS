// EL TRAMO DE LICENCIA ESCRIBE TODOS SUS DÍAS HÁBILES —LOS FUTUROS TAMBIÉN— Y LOS DECLARA.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// El dueño (16/09/2026): *«así como si trajo lo de la licencia de enfermedad: lo rompiste»*. Lo que
// rompió la licencia fue el timer de JORNALES pisando las filas `web:*` (resuelto en 972dc73f), pero
// el tramo en sí —`asentarTramoDeAusencia`— no tenía ninguna prueba con base: sólo el plan puro.
// Cualquier «guarda» razonable que alguien le agregue a la puerta (no escribir días futuros, no
// declarar `asistencia_dia` cuando la persona tiene horas, frenar en el primer día ya cargado) deja
// verdes los tests puros y rompe exactamente lo que el dueño usa: cargar hoy la enfermedad de toda
// la semana.
//
// ═══ LA BASE FALSA EJECUTA, NO SÓLO ANOTA ═══
//
// El tramo lee el rango, escribe día por día, saca las horas en obra y declara la presencia. Un falso
// que devolviera listas fijas no podría decir cómo queda la tabla al final, que es lo que se afirma:
// cinco filas sin obra, ninguna en PISOS, cinco declaraciones. Se prueba el EFECTO en la tabla falsa.

import test from 'node:test'
import assert from 'node:assert/strict'
import { asentarTramoDeAusencia } from './ausenciaDeLaPersonaService.ts'

type Fila = Record<string, unknown>
type Supabase = Parameters<typeof asentarTramoDeAusencia>[0]
type Filtro = { op: 'eq' | 'is' | 'in' | 'gte' | 'lte'; col: string; val: unknown }

const P = '11111111-1111-4111-8111-111111111111'
const LUNES = '2026-09-14'
const VIERNES = '2026-09-18'

function baseFalsa(tablas: Record<string, Fila[]>) {
  const escrituras: { tabla: string; verbo: string }[] = []
  let seq = 0
  const from = (tabla: string) => {
    const filas = (tablas[tabla] ??= [])
    const filtros: Filtro[] = []
    let verbo: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
    let valores: unknown
    const pasa = (f: Fila) => filtros.every(({ op, col, val }) =>
      op === 'eq' ? f[col] === val
        : op === 'is' ? (f[col] ?? null) === val
          : op === 'in' ? (val as unknown[]).includes(f[col])
            : op === 'gte' ? String(f[col]) >= String(val)
              : String(f[col]) <= String(val))
    const ejecutar = (): { data: Fila[]; error: null } => {
      if (verbo === 'select') return { data: filas.filter(pasa), error: null }
      escrituras.push({ tabla, verbo })
      if (verbo === 'insert') {
        const fila = { id: `n${++seq}`, ...(valores as Fila) }
        filas.push(fila)
        return { data: [{ id: fila.id }], error: null }
      }
      if (verbo === 'update') {
        const tocadas = filas.filter(pasa)
        for (const f of tocadas) Object.assign(f, valores as Fila)
        return { data: tocadas.map((f) => ({ id: f.id })), error: null }
      }
      if (verbo === 'delete') {
        const tocadas = filas.filter(pasa)
        for (const f of tocadas) filas.splice(filas.indexOf(f), 1)
        return { data: tocadas.map((f) => ({ id: f.id })), error: null }
      }
      for (const v of valores as Fila[]) {
        const i = filas.findIndex((f) => f.persona_id === v.persona_id && f.fecha === v.fecha)
        if (i >= 0) filas[i] = { ...filas[i], ...v }
        else filas.push({ ...v })
      }
      return { data: (valores as Fila[]).map((v) => ({ persona_id: v.persona_id })), error: null }
    }
    const filtro = (op: Filtro['op']) => (col: string, val: unknown) => { filtros.push({ op, col, val }); return b }
    const b: Record<string, unknown> = {
      select: () => b,
      order: () => b,
      insert: (v: unknown) => { verbo = 'insert'; valores = v; return b },
      update: (v: unknown) => { verbo = 'update'; valores = v; return b },
      upsert: (v: unknown) => { verbo = 'upsert'; valores = v; return b },
      delete: () => { verbo = 'delete'; return b },
      eq: filtro('eq'), is: filtro('is'), in: filtro('in'), gte: filtro('gte'), lte: filtro('lte'),
      then: (res: (r: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(ejecutar()).then(res, rej),
    }
    return b
  }
  return { supabase: { from } as unknown as Supabase, escrituras, tablas }
}

const horaEnPisos = (fecha: string): Fila => ({
  id: `pisos-${fecha}`, persona_id: P, fecha, horas: 9, tipo_hora: 'normal',
  obra_canonica_id: 'pisos', actividad_id: null, improductiva: false, notas: null,
})

const tramoDeEnfermedad = (supabase: Supabase) => asentarTramoDeAusencia(supabase, {
  persona_id: P, fecha: LUNES, hasta: VIERNES, motivo: 'enfermedad',
  horas: 9, horasATodoElTramo: null, obra_origen: 'pisos',
})

test('lunes a viernes de enfermedad: cinco filas sin obra (8 hs el viernes), las horas en PISOS salen, cinco días declarados', async () => {
  const { supabase, tablas } = baseFalsa({
    registros_hh: [horaEnPisos(LUNES), horaEnPisos('2026-09-15')],
    asistencia_dia: [{ persona_id: P, fecha: LUNES, estado: 'presente', motivo: null, origen: 'declarada', obra_canonica_id: 'pisos' }],
  })
  const r = await tramoDeEnfermedad(supabase)
  assert.equal(r.ok, true, r.ok === false ? r.error : '')

  const hh = tablas.registros_hh.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  assert.deepEqual(hh.map((f) => [f.fecha, f.tipo_hora, f.horas, f.obra_canonica_id, f.notas]), [
    [LUNES, 'licencia', 9, null, 'enfermedad'],
    ['2026-09-15', 'licencia', 9, null, 'enfermedad'],
    ['2026-09-16', 'licencia', 9, null, 'enfermedad'],
    ['2026-09-17', 'licencia', 9, null, 'enfermedad'],
    [VIERNES, 'licencia', 8, null, 'enfermedad'],
  ], 'los días que todavía no llegaron TAMBIÉN se asientan: de eso se trata el tramo')
  assert.ok(hh.every((f) => f.fuente_legacy === 'web:asistencia-obra'),
    'la marca web:* es lo que hace que el timer de JORNALES no la pise')

  const dias = tablas.asistencia_dia.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  assert.deepEqual(dias.map((d) => [d.fecha, d.estado, d.motivo, d.obra_canonica_id]), [
    [LUNES, 'licencia', 'enfermedad', 'pisos'],
    ['2026-09-15', 'licencia', 'enfermedad', 'pisos'],
    ['2026-09-16', 'licencia', 'enfermedad', 'pisos'],
    ['2026-09-17', 'licencia', 'enfermedad', 'pisos'],
    [VIERNES, 'licencia', 'enfermedad', 'pisos'],
  ], 'sin la declaración el Plantel sigue diciendo «presente» el lunes y «sin marcar» el resto')
})

test('volver a asentar el mismo tramo no apila: la segunda corrida no escribe nada', async () => {
  const { supabase, escrituras, tablas } = baseFalsa({ registros_hh: [horaEnPisos(LUNES)], asistencia_dia: [] })
  assert.equal((await tramoDeEnfermedad(supabase)).ok, true)
  const antes = escrituras.length
  const r = await tramoDeEnfermedad(supabase)
  assert.equal(r.ok, true, r.ok === false ? r.error : '')
  assert.equal(escrituras.length, antes, 'la segunda pasada tendría que encontrar todo igual y no tocar la base')
  assert.equal(tablas.registros_hh.length, 5)
  assert.equal(tablas.asistencia_dia.length, 5)
})

test('MUTACIÓN: si un día del tramo no se pudo escribir, se dice — el acuse no puede afirmar cinco días con cuatro', async () => {
  const { supabase, tablas } = baseFalsa({ registros_hh: [], asistencia_dia: [] })
  const r = await asentarTramoDeAusencia(supabase, {
    persona_id: P, fecha: '2026-09-19', hasta: '2026-09-20', motivo: 'enfermedad',
    horas: 9, horasATodoElTramo: null,
  })
  assert.equal(r.ok, true, r.ok === false ? r.error : '')
  assert.deepEqual(tablas.registros_hh.map((f) => f.fecha), ['2026-09-19'], 'el domingo no se asienta')
  assert.deepEqual(tablas.asistencia_dia.map((f) => f.fecha), ['2026-09-19'])
})
