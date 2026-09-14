// LA PUERTA QUE FRENA AL QUE NO PUEDE MOVER GENTE TIENE QUE PODER DAR ROJO.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// Que alguien borre —o corra de lugar— el rechazo por rol de `cambiarObraActualCon`. Ese `if` es el
// ÚNICO control real: los tests de `planDeObraActual` son puros y siguen verdes sin él, el E2E sólo
// mira si la pantalla dibuja el desplegable —y la pantalla es la cerradura, no la puerta—, y la RLS
// de `obra_asignacion` (20260822T7000_porteros_por_consulta_no_por_fila.sql:340-341) es más ancha
// que la regla del dueño. Borrarlo movería costo de mano de obra entre obras sin una sola alerta.
//
// 08/09/2026 (tarde) · EL JEFE DE OBRA PASÓ A PODER. El rol que este control tiene que seguir frenando
// es `campo` —el único que la RLS acota por obra— y el que no tiene perfil.
//
// 14/09/2026 · AUDITORÍA DE LA CRONOLOGÍA. Un pase HOY borraba un pase futuro de varios días a otra
// obra, antes del alta y fuera de toda transacción. Ahora la escritura es UNA llamada a
// `asignar_obra_con_cronologia` y lo que no es un cierre automático pide confirmación. La base falsa no
// tiene `update`, `insert` ni `delete`: si la acción vuelve a escribir por fuera de la función, no compila.
//
// ═══ POR QUÉ NO ALCANZA CON MIRAR EL RESULTADO ═══
//
// Un `{ ok: false }` no prueba que no se haya escrito: un rechazo puesto DESPUÉS de la escritura da
// exactamente el mismo objeto. Por eso la base falsa anota cada lectura y cada llamada.
//
// ═══ QUÉ NO PRUEBA ═══
//
// Que la RLS deje o rechace de verdad, ni que la función SQL haga lo que dice. Eso es de la base.

import test from 'node:test'
import assert from 'node:assert/strict'
import { cambiarObraActualCon, type SupabaseLike } from './obraActualNucleo.ts'

const HOY = '2026-09-08'
const AYER = '2026-09-07'
const PERSONA = '11111111-1111-4111-8111-111111111111'

type Fila = Record<string, unknown>
interface Toque { tabla: string; verbo: 'select' | 'rpc'; valores?: Fila }

interface Contenido {
  persona_plantel?: Fila[]
  obra_canonica?: Fila[]
  obra_asignacion?: Fila[]
  /** Lo que contesta la función SQL cuando aborta. */
  errorDeLaFuncion?: { message: string; code?: string }
}

/**
 * PostgREST de mentira. Devuelve lo que se le carga y ANOTA cada lectura y cada llamada.
 *
 * `is('hasta', null)` FILTRA DE VERDAD: un falso que devuelve todo no distingue «leí las abiertas» de
 * «leí también las cerradas», que es el defecto que rompía el segundo cambio de obra del mismo día.
 * `or()` devuelve todo, y la acción vuelve a filtrar las cerradas que llegan al tramo nuevo.
 */
function baseFalsa(contenido: Contenido) {
  const toques: Toque[] = []
  const supabase: SupabaseLike = {
    from: (tabla: string) => {
      const filas = (contenido as Record<string, Fila[] | undefined>)[tabla]
      const datos = Array.isArray(filas) ? filas : []
      const lectura = {
        eq: () => lectura,
        in: async () => ({ data: datos, error: null }),
        is: async (columna: string, valor: null) => ({
          data: datos.filter((f) => (f[columna] ?? null) === valor), error: null,
        }),
        or: async () => ({ data: datos, error: null }),
        maybeSingle: async () => ({ data: datos[0] ?? null, error: null }),
      }
      return {
        select: (columnas: string) => {
          toques.push({ tabla, verbo: 'select', valores: { columnas } })
          return lectura
        },
      }
    },
    rpc: async (funcion: string, argumentos: Fila) => {
      toques.push({ tabla: funcion, verbo: 'rpc', valores: argumentos })
      return contenido.errorDeLaFuncion
        ? { data: null, error: contenido.errorDeLaFuncion }
        : { data: { altas: [] }, error: null }
    },
  }
  return { supabase, toques }
}

const MENSAJE_PERMISO = 'Tu usuario no puede cambiar la obra de una persona: lo hacen Dirección, '
  + 'Administración y los jefes de obra. La asistencia se sigue cargando y corrigiendo normalmente.'

/** Una base con todo en orden: si la acción llega hasta el final, escribe. */
function baseCompleta(asignaciones: Fila[] = [], extra: Partial<Contenido> = {}) {
  return baseFalsa({
    persona_plantel: [{ id: PERSONA, nombre_completo: 'PÉREZ JUAN' }],
    obra_canonica: [{ id: 'salon-comercial', nombre: 'SALÓN COMERCIAL', estado: 'activa' }],
    obra_asignacion: asignaciones,
    ...extra,
  })
}

const llamadas = (toques: Toque[]) => toques.filter((t) => t.verbo === 'rpc')
const alta = (desde: string) => ({ obra_id: 'salon-comercial', rol: 'integrante', desde, hasta: null })

test('el rol campo rebota y NO toca obra_asignacion — ni para leer', async () => {
  const { supabase, toques } = baseCompleta([
    { id: 'a1', obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: null },
  ])
  const r = await cambiarObraActualCon(
    { supabase, perfil: { rol: 'campo' }, hoy: HOY },
    { persona_id: PERSONA, obra_id: 'salon-comercial' },
  )
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.error, MENSAJE_PERMISO)
  assert.deepEqual(toques, [], 'ni siquiera tendría que haber leído el plantel')
})

test('el JEFE DE OBRA escribe: cierra ayer y abre hoy en una sola transacción, igual que Administración', async () => {
  const { supabase, toques } = baseCompleta([
    { id: 'a1', obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: null },
  ])
  const r = await cambiarObraActualCon(
    { supabase, perfil: { rol: 'jefe_obra' }, hoy: HOY },
    { persona_id: PERSONA, obra_id: 'salon-comercial' },
  )
  assert.equal(r.ok, true, r.ok === false ? r.error : '')
  const [l] = llamadas(toques)
  assert.equal(l.tabla, 'asignar_obra_con_cronologia')
  assert.deepEqual(l.valores?.p_cerrar, [{ id: 'a1', hasta: AYER }])
  assert.deepEqual(l.valores?.p_altas, [alta(HOY)])
})

test('sin perfil (rol null) tampoco se mueve a nadie de obra', async () => {
  for (const perfil of [null, { rol: null }]) {
    const { supabase, toques } = baseCompleta()
    const r = await cambiarObraActualCon(
      { supabase, perfil, hoy: HOY }, { persona_id: PERSONA, obra_id: 'salon-comercial' },
    )
    assert.equal(r.ok, false)
    assert.equal(r.ok === false && r.error, MENSAJE_PERMISO)
    assert.deepEqual(toques.filter((t) => t.tabla === 'obra_asignacion' || t.verbo === 'rpc'), [])
  }
})

test('administración lee antes de escribir, escribe UNA vez con nota de quién, y revalida', async () => {
  const { supabase, toques } = baseCompleta([
    { id: 'a1', obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: null },
  ])
  let revalidada = ''
  const r = await cambiarObraActualCon(
    { supabase, perfil: { rol: 'administracion' }, hoy: HOY, usuario: 'Jorge', revalidar: (p) => { revalidada = p } },
    { persona_id: PERSONA, obra_id: 'salon-comercial' },
  )
  assert.equal(r.ok, true, r.ok === false ? r.error : '')
  assert.equal(revalidada, PERSONA)
  const lee = toques.findIndex((t) => t.tabla === 'obra_asignacion' && t.verbo === 'select')
  const escribe = toques.findIndex((t) => t.verbo === 'rpc')
  assert.ok(lee >= 0 && lee < escribe, 'sin leer las vigentes el cierre no sabe a quién cerrar')
  assert.equal(llamadas(toques).length, 1)
  assert.equal(llamadas(toques)[0].valores?.p_nota, 'ajustada por Jorge al asignar SALÓN COMERCIAL desde 2026-09-08')
})

test('si la función aborta (una fila no cambió), no acusa el cambio ni revalida: la persona sigue como estaba', async () => {
  let revalidada = false
  const { supabase } = baseCompleta(
    [{ id: 'a1', obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: null }],
    { errorDeLaFuncion: { message: 'no pude cerrar la asignación a1 (0 filas): no se escribió nada', code: 'P0002' } },
  )
  const r = await cambiarObraActualCon(
    { supabase, perfil: { rol: 'direccion' }, hoy: HOY, revalidar: () => { revalidada = true } },
    { persona_id: PERSONA, obra_id: 'salon-comercial' },
  )
  assert.equal(r.ok, false)
  assert.match(r.ok === false ? r.error : '', /No cambié nada: no pude cerrar/)
  assert.match(r.ok === false ? r.error : '', /sigue como estaba/)
  assert.equal(revalidada, false)
})

// ═══ CAMBIAR DE OBRA NO TOCA LAS HORAS YA CARGADAS ═══
//
// El dueño (08/09/2026): *"una cosa es la asistencia y otra la cantidad de hs por día"*. Cada
// `registros_hh` lleva su propia `obra_canonica_id`: mover a alguien de obra cambia de HOY EN ADELANTE.
test('CAMBIAR DE OBRA NO ESCRIBE FUERA DE obra_asignacion — las horas ya cargadas no se tocan', async () => {
  const { supabase, toques } = baseCompleta([
    { id: 'a1', obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: null },
  ])
  const r = await cambiarObraActualCon(
    { supabase, perfil: { rol: 'administracion' }, hoy: HOY },
    { persona_id: PERSONA, obra_id: 'salon-comercial' },
  )
  assert.equal(r.ok, true, 'el escenario tiene que llegar a escribir: si rebota, el test no prueba nada')
  assert.deepEqual(llamadas(toques).map((t) => t.tabla), ['asignar_obra_con_cronologia'])
  assert.equal(toques.some((t) => t.tabla === 'registros_hh'), false, 'ni siquiera se leen los registros')
  const escrito = JSON.stringify(llamadas(toques)[0].valores)
  for (const c of ['horas', 'fecha', 'tipo_hora', 'obra_canonica_id']) assert.ok(!escrito.includes(`"${c}"`), c)
})

// ═══ DOS ABIERTAS A LA VEZ (08/09/2026 — PASTRAN, GONZALEZ TOBARES) ═══
//
// El índice único `obra_asignacion_una_vigente` es por (obra, persona, actividad) WHERE hasta IS NULL:
// deja convivir dos obras distintas abiertas. Cerrar sólo una dejaba a la persona en dos obras, o hacía
// chocar el alta con el índice y la dejaba sin ninguna.
test('DOS abiertas: se cierran LAS DOS en la misma transacción que abre la nueva', async () => {
  const { supabase, toques } = baseCompleta([
    { id: 'a1', obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: null },
    { id: 'a2', obra_id: 'le-galpon-9', desde: null, hasta: null },
  ])
  const r = await cambiarObraActualCon(
    { supabase, perfil: { rol: 'administracion' }, hoy: HOY },
    { persona_id: PERSONA, obra_id: 'salon-comercial' },
  )
  assert.equal(r.ok, true, r.ok === false ? r.error : '')
  const [l] = llamadas(toques)
  assert.deepEqual(l.valores?.p_cerrar, [{ id: 'a1', hasta: AYER }, { id: 'a2', hasta: AYER }],
    'la abierta SIN desde también se cierra, y cierra ayer')
  assert.deepEqual(l.valores?.p_altas, [alta(HOY)])
})

test('DOS abiertas y una ya es el destino: cierra la otra y NO intenta abrir de nuevo', async () => {
  const { supabase, toques } = baseCompleta([
    { id: 'a1', obra_id: 'salon-comercial', desde: '2026-08-01', hasta: null },
    { id: 'a2', obra_id: 'le-galpon-9', desde: '2026-08-20', hasta: null },
  ])
  const r = await cambiarObraActualCon(
    { supabase, perfil: { rol: 'administracion' }, hoy: HOY },
    { persona_id: PERSONA, obra_id: 'salon-comercial' },
  )
  assert.equal(r.ok, true, r.ok === false ? r.error : '')
  assert.equal(r.ok === true && r.mensaje, 'Ya estaba en SALÓN COMERCIAL · se cerró le-galpon-9.')
  const [l] = llamadas(toques)
  assert.deepEqual([l.valores?.p_cerrar, l.valores?.p_altas], [[{ id: 'a2', hasta: AYER }], []],
    'un alta acá viola obra_asignacion_una_vigente')
})

// ═══ ABIERTA ES `hasta IS NULL` ═══
//
// Cambiar de obra DOS VECES EL MISMO DÍA cierra la primera con `hasta = hoy`; si la lectura la viera
// «vigente», acusaría «ya estaba» y no abriría nada (GONZALEZ TOBARES, 08/09/2026).
test('una asignación CERRADA HOY no es una asignación abierta: la obra se vuelve a abrir', async () => {
  const { supabase, toques } = baseCompleta([
    { id: 'a1', obra_id: 'salon-comercial', desde: HOY, hasta: HOY },
  ])
  const r = await cambiarObraActualCon(
    { supabase, perfil: { rol: 'administracion' }, hoy: HOY },
    { persona_id: PERSONA, obra_id: 'salon-comercial' },
  )
  assert.equal(r.ok, true, r.ok === false ? r.error : '')
  const [l] = llamadas(toques)
  assert.deepEqual([l.valores?.p_cerrar, l.valores?.p_altas], [[], [alta(HOY)]])
})

// Gana la CARGA POSTERIOR (dueño, 14/09/2026): la que empezó hoy se CIERRA hoy —no se borra, es una
// fila de persona— y la nueva, cargada después, gana el día al leer.
test('corregir la obra el mismo día CIERRA la que empezó hoy (sin borrarla) y abre la nueva', async () => {
  const { supabase, toques } = baseCompleta([{ id: 'q', obra_id: 'quattropani', desde: HOY, hasta: null }])
  const r = await cambiarObraActualCon(
    { supabase, perfil: { rol: 'administracion' }, hoy: HOY },
    { persona_id: PERSONA, obra_id: 'salon-comercial' },
  )
  assert.equal(r.ok, true, r.ok === false ? r.error : '')
  const [l] = llamadas(toques)
  assert.deepEqual([l.valores?.p_cerrar, l.valores?.p_anular, l.valores?.p_altas], [[{ id: 'q', hasta: HOY }], [], [alta(HOY)]])
})

// ═══ BLOQUEANTE 2 DE LA AUDITORÍA (14/09/2026) ═══
//
// Galpón abierta desde el 01/09 y un pase YA PROGRAMADO a Messina del 20 al 25/09. Pasar a la persona
// a otra obra desde hoy borraba Messina sin aviso, antes del alta y fuera de una transacción.
const PASE_PROGRAMADO = [
  { id: 'galpon', obra_id: 'le-galpon-9', desde: '2026-09-01', hasta: null },
  { id: 'messina', obra_id: 'messina', desde: '2026-09-20', hasta: '2026-09-25' },
]

test('BLOQUEANTE 2: un pase hoy NO toca el pase a Messina 20–25/09 ni escribe nada: pide confirmar', async () => {
  const { supabase, toques } = baseCompleta(PASE_PROGRAMADO)
  const r = await cambiarObraActualCon(
    { supabase, perfil: { rol: 'administracion' }, hoy: '2026-09-14' },
    { persona_id: PERSONA, obra_id: 'salon-comercial' },
  )
  assert.equal(r.ok, false)
  assert.deepEqual(r.ok === false && r.requiereConfirmar?.map((a) => [a.id, a.efecto]), [['messina', 'anular']])
  assert.match(r.ok === false ? r.error : '', /No se cambió nada/)
  assert.deepEqual(llamadas(toques), [], 'sin confirmar no se escribe NADA: ni el cierre de Galpón ni el alta')
})

test('BLOQUEANTE 2 confirmado: Messina se anula por nota en la MISMA transacción que cierra Galpón y abre la nueva', async () => {
  const { supabase, toques } = baseCompleta(PASE_PROGRAMADO)
  const r = await cambiarObraActualCon(
    { supabase, perfil: { rol: 'administracion' }, hoy: '2026-09-14', usuario: 'Jorge' },
    { persona_id: PERSONA, obra_id: 'salon-comercial', confirmar: true },
  )
  assert.equal(r.ok, true, r.ok === false ? r.error : '')
  const l = llamadas(toques)
  assert.equal(l.length, 1)
  assert.deepEqual([l[0].valores?.p_cerrar, l[0].valores?.p_anular, l[0].valores?.p_altas],
    [[{ id: 'galpon', hasta: '2026-09-13' }], [{ id: 'messina' }], [alta('2026-09-14')]])
})

// ═══ EL MENSAJE DE LA BASE SE MUESTRA TAL CUAL ═══
//
// Un texto propio («ya tiene una asignación vigente») borra el nombre del índice, que es el único hilo
// para encontrar la fila que la lectura no vio.
test('si la base rechaza el alta, su message viaja entero y el acuse dice que no cambió nada', async () => {
  for (const code of ['23505', undefined]) {
    const { supabase } = baseCompleta(
      [{ id: 'a1', obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: null }],
      { errorDeLaFuncion: { message: 'duplicate key value violates unique constraint "obra_asignacion_una_vigente"', code } },
    )
    const r = await cambiarObraActualCon(
      { supabase, perfil: { rol: 'direccion' }, hoy: HOY },
      { persona_id: PERSONA, obra_id: 'salon-comercial' },
    )
    assert.equal(r.ok, false)
    assert.match(r.ok === false ? r.error : '', /obra_asignacion_una_vigente/)
    assert.match(r.ok === false ? r.error : '', /sigue como estaba/)
  }
})
