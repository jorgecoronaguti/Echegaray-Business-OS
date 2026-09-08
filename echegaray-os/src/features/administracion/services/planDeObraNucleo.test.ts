// CANCELAR UN PASE PROGRAMADO NO PUEDE DEJAR A LA PERSONA SIN OBRA.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
// 1. Cancelar borrando SÓLO la fila futura. El tramo anterior quedó cerrado en la víspera del pase,
//    así que la persona termina con CERO asignaciones abiertas: la grilla la muestra «Sin obra» y
//    el jefe carga la asistencia sin destino. Es el mismo modo de falla que el cambio de obra evita
//    a propósito, reintroducido por la puerta de al lado.
// 2. Cancelar un tramo que YA RIGE. Puede tener horas cargadas contra él; borrarlo las deja sin
//    asignación que las respalde y el costo de mano de obra de esos días queda huérfano.
// 3. Que el rechazo por rol esté DESPUÉS de la primera escritura. Un `{ ok: false }` no prueba que
//    no se haya borrado nada: por eso el falso anota QUÉ TABLAS SE TOCARON y con qué verbo.
// 4. Un `delete` que no borró ninguna fila acusando «cancelado». La RLS puede rechazar sin error;
//    la evidencia es del efecto, no de que PostgREST contestó 204.
//
// ═══ QUÉ NO PRUEBA ═══
//
// Que la policy de `obra_asignacion` deje borrar. Eso es del E2E contra la base real.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cancelarTramoProgramadoCon, leerTramosCon, type SupabasePlanLike } from './planDeObraNucleo.ts'

const HOY = '2026-09-08'
const MANANA = '2026-09-09'
const PERSONA = 'e2e00000-0000-4000-8000-00000000e2e1'
const TRAMO = '11111111-0000-4000-8000-000000000001'
const CEDIO = '22222222-0000-4000-8000-000000000002'
const REGRESO = '33333333-0000-4000-8000-000000000003'

type Fila = Record<string, unknown>
interface Toque { tabla: string; verbo: 'select' | 'update' | 'delete'; valores?: Fila }

interface Contenido {
  obra_asignacion?: Fila[]
  obra_canonica?: Fila[]
  /** Cuántas filas devuelve el `delete`. 0 = la base no borró nada (policy que rechaza sin error). */
  filasQueDevuelveElDelete?: number
  /** Cuántas filas devuelve el `update` que reabre. 0 = no reabrió. */
  filasQueDevuelveElUpdate?: number
}

/** PostgREST de mentira que ANOTA cada tabla tocada con su verbo. El resultado no alcanza como
 *  evidencia: hay que ver qué se escribió antes de devolverlo, y en qué orden. */
function baseFalsa(contenido: Contenido) {
  const toques: Toque[] = []
  const supabase: SupabasePlanLike = {
    from: (tabla: string) => {
      const filas = (contenido as Record<string, Fila[] | number | undefined>)[tabla]
      const datos = Array.isArray(filas) ? filas : []
      const lectura = {
        eq: () => lectura,
        in: async () => ({ data: datos, error: null }),
        order: async () => ({ data: datos, error: null }),
      }
      const escritura = (verbo: 'update' | 'delete', cuantas: number) => {
        const e = {
          eq: () => e,
          select: async () => ({
            data: Array.from({ length: cuantas }, (_, i) => ({ id: `x${i}` })), error: null,
          }),
        }
        return e
      }
      return {
        select: (columnas: string) => {
          toques.push({ tabla, verbo: 'select', valores: { columnas } })
          return lectura
        },
        update: (valores: Fila) => {
          toques.push({ tabla, verbo: 'update', valores })
          return escritura('update', contenido.filasQueDevuelveElUpdate ?? 1)
        },
        delete: () => {
          toques.push({ tabla, verbo: 'delete' })
          return escritura('delete', contenido.filasQueDevuelveElDelete ?? 1)
        },
      }
    },
  }
  return { supabase, toques }
}

const obras = [
  { id: 'salon-comercial', nombre: 'SALÓN COMERCIAL' },
  { id: 'pisos-industriales', nombre: 'PISOS INDUSTRIALES' },
]

/** El estado que deja programar un pase abierto: la vigente cerrada en la víspera + el pase. */
const trasProgramar = [
  { id: TRAMO, obra_id: 'salon-comercial', desde: MANANA, hasta: null },
  { id: CEDIO, obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: HOY },
]

const deps = (supabase: SupabasePlanLike, rol: string | null = 'jefe_obra') =>
  ({ supabase, perfil: rol ? { rol } : null, hoy: HOY })

test('cancelar borra el pase Y reabre la obra anterior — nunca deja a la persona sin obra', async () => {
  const { supabase, toques } = baseFalsa({ obra_asignacion: trasProgramar, obra_canonica: obras })
  const r = await cancelarTramoProgramadoCon(deps(supabase), { persona_id: PERSONA, tramo_id: TRAMO })
  assert.equal(r.ok, true)
  assert.equal(r.ok && r.mensaje, 'Se canceló el pase a SALÓN COMERCIAL · sigue en PISOS INDUSTRIALES.')
  const escrituras = toques.filter((t) => t.verbo !== 'select')
  assert.deepEqual(escrituras.map((t) => t.verbo), ['delete', 'update'],
    'sin el update la persona queda con cero asignaciones abiertas')
  assert.deepEqual(escrituras[1].valores, { hasta: null },
    'reabrir es borrar el `hasta`, no escribir una fecha nueva')
})

test('cancelar un sandwich borra DOS filas: el pase y su regreso', async () => {
  const { supabase, toques } = baseFalsa({
    obra_asignacion: [
      { id: TRAMO, obra_id: 'salon-comercial', desde: MANANA, hasta: '2026-09-11' },
      { id: REGRESO, obra_id: 'pisos-industriales', desde: '2026-09-12', hasta: null },
      { id: CEDIO, obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: HOY },
    ],
    obra_canonica: obras,
  })
  const r = await cancelarTramoProgramadoCon(deps(supabase), { persona_id: PERSONA, tramo_id: TRAMO })
  assert.equal(r.ok, true)
  assert.deepEqual(toques.filter((t) => t.verbo !== 'select').map((t) => t.verbo),
    ['delete', 'delete', 'update'],
    'dejar vivo el regreso deja a la persona sin obra desde mañana hasta el 12/09')
})

test('un tramo que YA RIGE no se cancela, y NO se toca ninguna tabla', async () => {
  const { supabase, toques } = baseFalsa({
    obra_asignacion: [{ id: TRAMO, obra_id: 'salon-comercial', desde: HOY, hasta: null }],
    obra_canonica: obras,
  })
  const r = await cancelarTramoProgramadoCon(deps(supabase), { persona_id: PERSONA, tramo_id: TRAMO })
  assert.equal(r.ok, false)
  assert.match(r.ok === false ? r.error : '', /ya rige/)
  assert.deepEqual(toques.filter((t) => t.verbo !== 'select'), [],
    'borrarlo dejaría sin asignación las horas ya cargadas contra él')
})

// EL RECHAZO POR ROL VA ANTES DE LEER Y DE ESCRIBIR. Puesto después, devuelve el mismo objeto y ya
// dejó rastro: el orden de las líneas sería el único control.
test('`campo` no cancela un pase, y no llega a tocar ni una tabla', async () => {
  const { supabase, toques } = baseFalsa({ obra_asignacion: trasProgramar, obra_canonica: obras })
  const r = await cancelarTramoProgramadoCon(
    deps(supabase, 'campo'), { persona_id: PERSONA, tramo_id: TRAMO },
  )
  assert.equal(r.ok, false)
  assert.deepEqual(toques, [], 'ni siquiera se leyó: el control está antes de todo')
})

test('sin perfil tampoco', async () => {
  const { supabase, toques } = baseFalsa({ obra_asignacion: trasProgramar, obra_canonica: obras })
  const r = await cancelarTramoProgramadoCon(
    deps(supabase, null), { persona_id: PERSONA, tramo_id: TRAMO },
  )
  assert.equal(r.ok, false)
  assert.deepEqual(toques, [])
})

test('un delete que no borró ninguna fila NO acusa «cancelado» ni reabre nada', async () => {
  const { supabase, toques } = baseFalsa({
    obra_asignacion: trasProgramar, obra_canonica: obras, filasQueDevuelveElDelete: 0,
  })
  const r = await cancelarTramoProgramadoCon(deps(supabase), { persona_id: PERSONA, tramo_id: TRAMO })
  assert.equal(r.ok, false)
  assert.match(r.ok === false ? r.error : '', /no borró ninguna fila/)
  assert.deepEqual(toques.filter((t) => t.verbo === 'update'), [],
    'reabrir la anterior sin haber borrado el pase deja DOS abiertas a la vez')
})

// SI EL PASE SE BORRÓ Y LA REAPERTURA NO ENTRÓ, LA PERSONA QUEDÓ SIN OBRA. Se dice con todas las
// letras: un «cancelado» amable acá manda a alguien a cargar asistencia sin destino mañana.
test('si la reapertura no entra, el acuse dice que quedó SIN OBRA', async () => {
  const { supabase } = baseFalsa({
    obra_asignacion: trasProgramar, obra_canonica: obras, filasQueDevuelveElUpdate: 0,
  })
  const r = await cancelarTramoProgramadoCon(deps(supabase), { persona_id: PERSONA, tramo_id: TRAMO })
  assert.equal(r.ok, false)
  assert.match(r.ok === false ? r.error : '', /SIN OBRA/)
})

test('un tramo_id que no es un uuid se rechaza sin tocar la base', async () => {
  const { supabase, toques } = baseFalsa({ obra_asignacion: trasProgramar, obra_canonica: obras })
  const r = await cancelarTramoProgramadoCon(deps(supabase), { persona_id: PERSONA, tramo_id: 'x' })
  assert.equal(r.ok, false)
  assert.deepEqual(toques, [])
})

// ═══ LA LECTURA TRAE LOS CERRADOS, Y SIN ELLOS LA CANCELACIÓN NO PUEDE REABRIR NADA ═══
test('leerTramosCon trae los tramos cerrados y resuelve el nombre de la obra', async () => {
  const { supabase } = baseFalsa({ obra_asignacion: trasProgramar, obra_canonica: obras })
  const r = await leerTramosCon(supabase, PERSONA)
  assert.equal(r.error, null)
  assert.equal(r.data.length, 2, 'filtrar por `hasta is null` borraría el tramo que hay que reabrir')
  assert.deepEqual(r.data.map((t) => t.nombre), ['SALÓN COMERCIAL', 'PISOS INDUSTRIALES'],
    'el panel nombra obras, nunca ids')
})

test('sin catálogo el tramo se nombra con el id, pero no desaparece de la lista', async () => {
  const { supabase } = baseFalsa({ obra_asignacion: trasProgramar, obra_canonica: [] })
  const r = await leerTramosCon(supabase, PERSONA)
  assert.equal(r.data.length, 2)
  assert.equal(r.data[0].nombre, 'salon-comercial')
})
