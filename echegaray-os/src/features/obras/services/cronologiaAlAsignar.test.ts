// ASIGNAR DESDE LA SOLAPA PERSONAL DE LA OBRA NO PUEDE BORRAR HISTORIA NI DEJAR A LA PERSONA EN DOS OBRAS.
//
// Qué defectos atrapa:
//   · BLOQUEANTE 1 de la auditoría (14/09/2026): un alta con fecha pasada reemplazaba y BORRABA, sin nota,
//     las filas cargadas por personas que el tramo nuevo tapaba, y devolvía ok. Ahora no escribe nada y
//     devuelve `requiereConfirmar`; confirmado, anula por nota —la base falsa ni siquiera tiene `delete`.
//   · que el alta no cierre la abierta de otra obra, o que lo haga fuera de la transacción.
// No prueba la RLS ni la función SQL real: eso es de la base.
import test from 'node:test'
import assert from 'node:assert/strict'
import { asignarConCronologia, type AltaDeAsignacion, type SupabaseAsignacion } from './cronologiaAlAsignar.ts'

type Fila = { id: string; obra_id: string; desde: string | null; hasta: string | null }
type Llamada = { funcion: string; argumentos: Record<string, unknown> }

function baseFalsa(filas: Fila[], errorDeLaFuncion: { message: string; code?: string } | null = null) {
  const llamadas: Llamada[] = []
  const supabase: SupabaseAsignacion = {
    from: () => ({ select: () => ({ eq: async () => ({ data: filas, error: null }) }) }),
    rpc: async (funcion, argumentos) => {
      llamadas.push({ funcion, argumentos })
      return { data: errorDeLaFuncion ? null : { altas: ['x'] }, error: errorDeLaFuncion }
    },
  }
  return { supabase, llamadas }
}

const PERSONA = '22222222-2222-4222-8222-222222222222'
const alta = (obra_id: string, desde: string, hasta: string | null = null): AltaDeAsignacion =>
  ({ obra_id, desde, hasta, rol: 'integrante', cuadrilla_id: null, actividad_id: null, notas: null })

test('BLOQUEANTE 1: alta a Quattropani desde el 01/08 NO toca Pisos 10–20/08 ni Galpón abierta desde 21/08: pide confirmar', async () => {
  const filas = [
    { id: 'pisos', obra_id: 'pisos-industriales', desde: '2026-08-10', hasta: '2026-08-20' },
    { id: 'galpon', obra_id: 'le-galpon-9', desde: '2026-08-21', hasta: null },
  ]
  const { supabase, llamadas } = baseFalsa(filas)
  const r = await asignarConCronologia(supabase, { personaId: PERSONA, alta: alta('quattropani', '2026-08-01'), confirmado: false, usuario: 'Jorge' })
  assert.equal(r.ok, false)
  assert.ok('requiereConfirmar' in r, 'tiene que pedir confirmación, no escribir')
  assert.deepEqual(r.requiereConfirmar.map((a) => [a.id, a.efecto]), [['pisos', 'anular'], ['galpon', 'anular']])
  assert.deepEqual(llamadas, [], 'sin confirmar no se escribe NADA, tampoco el alta')
})

test('BLOQUEANTE 1 confirmado: una sola transacción que anula por nota, sin borrar, y da el alta', async () => {
  const filas = [
    { id: 'pisos', obra_id: 'pisos-industriales', desde: '2026-08-10', hasta: '2026-08-20' },
    { id: 'galpon', obra_id: 'le-galpon-9', desde: '2026-08-21', hasta: null },
  ]
  const { supabase, llamadas } = baseFalsa(filas)
  const r = await asignarConCronologia(supabase, { personaId: PERSONA, alta: alta('quattropani', '2026-08-01'), confirmado: true, usuario: 'Jorge' })
  assert.equal(r.ok, true)
  assert.equal(llamadas.length, 1)
  const a = llamadas[0].argumentos
  assert.equal(llamadas[0].funcion, 'asignar_obra_con_cronologia')
  assert.deepEqual([a.p_cerrar, a.p_anular, a.p_recortar], [[], [{ id: 'pisos' }, { id: 'galpon' }], []])
  assert.deepEqual(a.p_altas, [alta('quattropani', '2026-08-01')])
  assert.match(String(a.p_nota), /^ajustada por Jorge al asignar quattropani desde 2026-08-01$/)
})

test('lo automático: la ABIERTA de otra obra que cubre D se cierra en la víspera, en la misma transacción que el alta', async () => {
  const { supabase, llamadas } = baseFalsa([
    { id: 'pisos', obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: null },
    { id: 'misma', obra_id: 'quattropani', desde: '2026-07-01', hasta: '2026-07-31' },
  ])
  const r = await asignarConCronologia(supabase, { personaId: PERSONA, alta: alta('quattropani', '2026-09-14'), confirmado: false, usuario: 'Jorge' })
  assert.equal(r.ok, true)
  assert.deepEqual(llamadas.map((l) => [l.argumentos.p_cerrar, l.argumentos.p_anular]), [[[{ id: 'pisos', hasta: '2026-09-13' }], []]])
})

test('una CERRADA de otra obra que cubre D no se acorta sola: pide confirmar', async () => {
  const { supabase, llamadas } = baseFalsa([{ id: 'pase', obra_id: 'messina', desde: '2026-09-01', hasta: '2026-09-20' }])
  const r = await asignarConCronologia(supabase, { personaId: PERSONA, alta: alta('quattropani', '2026-09-14'), confirmado: false, usuario: 'Jorge' })
  assert.ok(!r.ok && 'requiereConfirmar' in r && r.requiereConfirmar[0].efecto === 'acortar')
  assert.deepEqual(llamadas, [])
})

test('un día suelto desde la obra no toca ninguna otra fila', async () => {
  const { supabase, llamadas } = baseFalsa([{ id: 'pisos', obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: null }])
  await asignarConCronologia(supabase, { personaId: PERSONA, alta: alta('quattropani', '2026-09-14', '2026-09-14'), confirmado: false, usuario: 'Jorge' })
  assert.deepEqual(llamadas.map((l) => l.argumentos.p_cerrar), [[]])
})

test('un tramo con fin dentro de una abierta: la cierra y programa el regreso, todo en la misma llamada', async () => {
  const { supabase, llamadas } = baseFalsa([{ id: 'pisos', obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: null }])
  await asignarConCronologia(supabase, { personaId: PERSONA, alta: alta('quattropani', '2026-09-14', '2026-09-16'), confirmado: false, usuario: 'Jorge' })
  assert.deepEqual(llamadas[0].argumentos.p_altas, [
    alta('quattropani', '2026-09-14', '2026-09-16'),
    { obra_id: 'pisos-industriales', desde: '2026-09-17', hasta: null, rol: 'integrante' },
  ])
})

test('si la función SQL rebota, el acuse dice que no se escribió nada y conserva el código', async () => {
  const { supabase } = baseFalsa([], { message: 'duplicate key value violates unique constraint "obra_asignacion_una_vigente"', code: '23505' })
  const r = await asignarConCronologia(supabase, { personaId: PERSONA, alta: alta('quattropani', '2026-09-14'), confirmado: false, usuario: 'Jorge' })
  assert.ok(!r.ok && 'code' in r && r.code === '23505')
  assert.match(r.ok ? '' : r.error, /No se escribió nada/)
})
