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
// 08/09/2026 (tarde) · EL JEFE DE OBRA PASÓ A PODER. El dueño lo habilitó para que pueda armar la
// cuadrilla antes de marcarla. El rol que este control tiene que seguir frenando es `campo` —el
// único que la RLS acota por obra— y el que no tiene perfil.
//
// ═══ POR QUÉ NO ALCANZA CON MIRAR EL RESULTADO ═══
//
// Un `{ ok: false }` no prueba que no se haya escrito: un rechazo puesto DESPUÉS del `update` da
// exactamente el mismo objeto y ya dejó la fila cerrada. Por eso la base falsa anota cada
// `from(tabla)` con su verbo, y el test del rechazo exige CERO toques a `obra_asignacion`.
//
// ═══ QUÉ NO PRUEBA ═══
//
// Que la RLS deje o rechace de verdad, ni que el cliente real de PostgREST se comporte así. Eso es
// del E2E y de la base. Acá se prueba la SECUENCIA de la acción, que es lo que no tenía red.

import test from 'node:test'
import assert from 'node:assert/strict'
import { cambiarObraActualCon, type SupabaseLike } from './obraActualNucleo.ts'

const HOY = '2026-09-08'
const AYER = '2026-09-07'
const PERSONA = '11111111-1111-4111-8111-111111111111'

type Fila = Record<string, unknown>
interface Toque { tabla: string; verbo: 'select' | 'update' | 'insert'; valores?: Fila }

interface Contenido {
  persona_plantel?: Fila[]
  obra_canonica?: Fila[]
  obra_asignacion?: Fila[]
  /** Cuántas filas devuelve el `update` de `obra_asignacion`. 0 = la base no cambió nada. */
  filasQueDevuelveElUpdate?: number
}

/**
 * PostgREST de mentira. Devuelve lo que se le carga y ANOTA cada tabla tocada con su verbo: la
 * evidencia que se busca no es sólo el resultado, es qué se escribió antes de devolverlo.
 */
function baseFalsa(contenido: Contenido) {
  const toques: Toque[] = []
  const filasUpdate = contenido.filasQueDevuelveElUpdate ?? 1
  const supabase: SupabaseLike = {
    from: (tabla: string) => {
      const filas = (contenido as Record<string, Fila[] | number | undefined>)[tabla]
      const datos = Array.isArray(filas) ? filas : []
      const lectura = {
        eq: () => lectura,
        in: async () => ({ data: datos, error: null }),
        or: async () => ({ data: datos, error: null }),
        maybeSingle: async () => ({ data: datos[0] ?? null, error: null }),
      }
      return {
        select: (columnas: string) => {
          toques.push({ tabla, verbo: 'select', valores: { columnas } })
          return lectura
        },
        update: (valores: Fila) => {
          toques.push({ tabla, verbo: 'update', valores })
          const escritura = {
            eq: () => escritura,
            select: async () => ({
              data: Array.from({ length: filasUpdate }, (_, i) => ({ id: `u${i}` })), error: null,
            }),
          }
          return escritura
        },
        insert: (valores: Fila) => {
          toques.push({ tabla, verbo: 'insert', valores })
          const escritura = {
            eq: () => escritura,
            select: async () => ({ data: [{ id: 'nueva' }], error: null }),
          }
          return escritura
        },
      }
    },
  }
  return { supabase, toques }
}

const MENSAJE_PERMISO = 'Tu usuario no puede cambiar la obra de una persona: lo hacen Dirección, '
  + 'Administración y los jefes de obra. La asistencia se sigue cargando y corrigiendo normalmente.'

/** Una base con todo en orden: si la acción llega hasta el final, escribe. */
function baseCompleta(vigentes: Fila[] = []) {
  return baseFalsa({
    persona_plantel: [{ id: PERSONA, nombre_completo: 'PÉREZ JUAN' }],
    obra_canonica: [{ id: 'salon-comercial', nombre: 'SALÓN COMERCIAL', estado: 'activa' }],
    obra_asignacion: vigentes,
  })
}

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
  assert.deepEqual(toques.filter((t) => t.tabla === 'obra_asignacion'), [],
    'el rol campo llegó a tocar obra_asignacion: el rechazo está DESPUÉS de la escritura')
  assert.deepEqual(toques, [], 'ni siquiera tendría que haber leído el plantel')
})

test('el JEFE DE OBRA escribe: cierra ayer y abre hoy, igual que Administración', async () => {
  // EL DEFECTO QUE ATRAPA: que la habilitación del 08/09 quede sólo en la pantalla. Si alguien
  // dibuja el control para el jefe pero la acción lo sigue rechazando, el botón existe, el acuse
  // dice que no y la cuadrilla nunca se arma — que es peor que no ofrecerlo.
  const { supabase, toques } = baseCompleta([
    { id: 'a1', obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: null },
  ])
  const r = await cambiarObraActualCon(
    { supabase, perfil: { rol: 'jefe_obra' }, hoy: HOY },
    { persona_id: PERSONA, obra_id: 'salon-comercial' },
  )
  assert.equal(r.ok, true, r.ok === false ? r.error : '')
  const escrituras = toques.filter((t) => t.tabla === 'obra_asignacion' && t.verbo !== 'select')
  assert.deepEqual(escrituras.map((t) => t.verbo), ['update', 'insert'])
  assert.deepEqual(escrituras[0].valores, { hasta: AYER })
})

test('sin perfil (rol null) tampoco se mueve a nadie de obra', async () => {
  for (const perfil of [null, { rol: null }]) {
    const { supabase, toques } = baseCompleta()
    const r = await cambiarObraActualCon(
      { supabase, perfil, hoy: HOY }, { persona_id: PERSONA, obra_id: 'salon-comercial' },
    )
    assert.equal(r.ok, false)
    assert.equal(r.ok === false && r.error, MENSAJE_PERMISO)
    assert.deepEqual(toques.filter((t) => t.tabla === 'obra_asignacion'), [])
  }
})

test('administración cierra la vigente AYER y recién después abre la nueva HOY', async () => {
  const { supabase, toques } = baseCompleta([
    { id: 'a1', obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: null },
  ])
  let revalidada = ''
  const r = await cambiarObraActualCon(
    { supabase, perfil: { rol: 'administracion' }, hoy: HOY, revalidar: (p) => { revalidada = p } },
    { persona_id: PERSONA, obra_id: 'salon-comercial' },
  )
  assert.equal(r.ok, true, r.ok === false ? r.error : '')
  assert.equal(revalidada, PERSONA)

  // LEER LAS VIGENTES ANTES DE ESCRIBIR: sin esa lectura el cierre no sabe a quién cerrar.
  assert.ok(toques.some((t) => t.tabla === 'obra_asignacion' && t.verbo === 'select'))
  const escrituras = toques.filter((t) => t.tabla === 'obra_asignacion' && t.verbo !== 'select')
  assert.deepEqual(escrituras.map((t) => t.verbo), ['update', 'insert'],
    'abrir antes de cerrar deja DOS obras vigentes y la grilla elige una por horas')
  assert.deepEqual(escrituras[0].valores, { hasta: AYER })
  assert.deepEqual(escrituras[1].valores, {
    obra_id: 'salon-comercial', persona_id: PERSONA, rol: 'integrante', desde: HOY,
  })
})

test('un update que no cambió ninguna fila NO acusa el cambio ni abre la nueva', async () => {
  const { supabase, toques } = baseFalsa({
    persona_plantel: [{ id: PERSONA, nombre_completo: 'PÉREZ JUAN' }],
    obra_canonica: [{ id: 'salon-comercial', nombre: 'SALÓN COMERCIAL', estado: 'activa' }],
    obra_asignacion: [{ id: 'a1', obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: null }],
    filasQueDevuelveElUpdate: 0,
  })
  const r = await cambiarObraActualCon(
    { supabase, perfil: { rol: 'direccion' }, hoy: HOY },
    { persona_id: PERSONA, obra_id: 'salon-comercial' },
  )
  assert.equal(r.ok, false)
  assert.match(r.ok === false ? r.error : '', /la base no cambió ninguna fila/)
  assert.deepEqual(toques.filter((t) => t.verbo === 'insert'), [],
    'cerró sin efecto y abrió igual: la persona quedaría en dos obras')
})
