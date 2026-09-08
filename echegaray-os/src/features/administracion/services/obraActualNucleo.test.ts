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
  /** Lo que contesta el `insert` cuando la base lo rechaza. */
  errorDelInsert?: { message: string; code?: string }
}

/**
 * PostgREST de mentira. Devuelve lo que se le carga y ANOTA cada tabla tocada con su verbo: la
 * evidencia que se busca no es sólo el resultado, es qué se escribió antes de devolverlo.
 *
 * ═══ `is('hasta', null)` FILTRA DE VERDAD ═══
 *
 * Un falso que devuelve todo pase el filtro que pase no puede distinguir «leí las abiertas» de «leí
 * también las cerradas», que es exactamente el defecto que rompía el segundo cambio de obra del
 * mismo día. Por eso este filtro se aplica, y `or()` —que es como se leía antes— sigue devolviendo
 * todo: si alguien vuelve a esa lectura, el test lo ve.
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
            select: async () => (contenido.errorDelInsert
              ? { data: null, error: contenido.errorDelInsert }
              : { data: [{ id: 'nueva' }], error: null }),
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

// ═══ CAMBIAR DE OBRA NO TOCA LAS HORAS YA CARGADAS ═══
//
// El dueño (08/09/2026): *"una cosa es la asistencia y otra la cantidad de hs por día, no quiero que
// se rompa eso si se va modificando sobre la marcha"*. Cada `registros_hh` lleva su propia
// `obra_canonica_id` y es un hecho del día en que ocurrió: mover a alguien de obra cambia de HOY EN
// ADELANTE, nunca hacia atrás. Un `update` de `registros_hh` acá reimputaría costo de mano de obra
// de días ya cerrados sin que nadie lo decida, y la grilla mostraría otras horas después de un
// gesto que sólo decía «está en esta obra».
//
// El resultado no lo prueba: `{ ok: true }` sale igual con o sin esa escritura. Lo que lo prueba es
// la lista de toques, que es lo único que ve qué tablas se escribieron.

test('CAMBIAR DE OBRA NO ESCRIBE FUERA DE obra_asignacion — las horas ya cargadas no se tocan', async () => {
  const { supabase, toques } = baseCompleta([
    { id: 'a1', obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: null },
  ])
  const r = await cambiarObraActualCon(
    { supabase, perfil: { rol: 'administracion' }, hoy: HOY },
    { persona_id: PERSONA, obra_id: 'salon-comercial' },
  )
  assert.equal(r.ok, true, 'el escenario tiene que llegar a escribir: si rebota, el test no prueba nada')

  const escrituras = toques.filter((t) => t.verbo !== 'select')
  assert.ok(escrituras.length >= 2, 'cerró la vigente y abrió la nueva')
  assert.deepEqual([...new Set(escrituras.map((t) => t.tabla))], ['obra_asignacion'],
    'ninguna escritura fuera de obra_asignacion')
  assert.equal(toques.some((t) => t.tabla === 'registros_hh'), false,
    'ni siquiera se leen los registros: la asistencia y la obra actual son dos cosas distintas')
  assert.equal(
    escrituras.some((t) => ['horas', 'fecha', 'tipo_hora', 'obra_canonica_id'].some((c) => c in (t.valores ?? {}))),
    false,
    'y ningún valor escrito toca horas, fecha ni la obra de un registro',
  )
})

// ═══ EL DEFECTO QUE EL DUEÑO SEGUÍA VIENDO: «SIGUE FALLANDO CUANDO CAMBIÁS DE OBRA» ═══
//
// En la base hay personas con DOS asignaciones abiertas a la vez (08/09/2026 — PASTRAN:
// instalacion-electrica + le-galpon-9; varias eran una fila de la web sin `desde` más una del
// historial de JORNALES). El índice único `obra_asignacion_una_vigente` es por
// (obra, persona, actividad) WHERE hasta IS NULL: deja convivir dos obras distintas abiertas.
//
// Con la lectura y el cierre viejos pasaba una de dos cosas, las dos malas:
//  · si la segunda abierta era de la obra DESTINO, el `insert` chocaba contra el índice y la
//    persona quedaba cerrada y sin abrir — 0 vigentes (GONZALEZ TOBARES ese mismo día);
//  · si era de otra obra, quedaba en dos obras a la vez y la grilla elegía una por horas.

test('DOS abiertas: se cierran LAS DOS antes de abrir la nueva', async () => {
  const { supabase, toques } = baseCompleta([
    { id: 'a1', obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: null },
    { id: 'a2', obra_id: 'le-galpon-9', desde: null, hasta: null },
  ])
  const r = await cambiarObraActualCon(
    { supabase, perfil: { rol: 'administracion' }, hoy: HOY },
    { persona_id: PERSONA, obra_id: 'salon-comercial' },
  )
  assert.equal(r.ok, true, r.ok === false ? r.error : '')
  const escrituras = toques.filter((t) => t.tabla === 'obra_asignacion' && t.verbo !== 'select')
  assert.deepEqual(escrituras.map((t) => t.verbo), ['update', 'update', 'insert'],
    'cerrar sólo una deja a la persona en dos obras, o hace chocar el insert con el índice único')
  assert.deepEqual(escrituras[0].valores, { hasta: AYER })
  assert.deepEqual(escrituras[1].valores, { hasta: AYER },
    'la abierta SIN desde también se cierra, y cierra ayer')
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
  // Sin la obra en el catálogo el acuse escribe el id: feo, pero nombra lo que cerró (así está
  // documentado en `leerAbiertas`). Lo que importa acá es que NO diga «desde hoy»: no empezó hoy.
  assert.equal(r.ok === true && r.mensaje, 'Ya estaba en SALÓN COMERCIAL · se cerró le-galpon-9.')
  const escrituras = toques.filter((t) => t.tabla === 'obra_asignacion' && t.verbo !== 'select')
  assert.deepEqual(escrituras.map((t) => t.verbo), ['update'],
    'un insert acá viola obra_asignacion_una_vigente y deja a la persona sin ninguna abierta')
})

// ═══ ABIERTA ES `hasta IS NULL` ═══
//
// La lectura vieja traía también las cerradas con `hasta >= hoy`. Cambiar de obra DOS VECES EL
// MISMO DÍA cierra la primera con `hasta = hoy` (empezó hoy), y al volver a esa obra la lectura la
// veía «vigente»: acusaba «ya estaba» y no abría nada. La persona terminaba con CERO asignaciones
// abiertas, que es como quedó GONZALEZ TOBARES el 08/09/2026.
test('una asignación CERRADA HOY no es una asignación abierta: la obra se vuelve a abrir', async () => {
  const { supabase, toques } = baseCompleta([
    { id: 'a1', obra_id: 'salon-comercial', desde: HOY, hasta: HOY },
  ])
  const r = await cambiarObraActualCon(
    { supabase, perfil: { rol: 'administracion' }, hoy: HOY },
    { persona_id: PERSONA, obra_id: 'salon-comercial' },
  )
  assert.equal(r.ok, true, r.ok === false ? r.error : '')
  const escrituras = toques.filter((t) => t.tabla === 'obra_asignacion' && t.verbo !== 'select')
  assert.deepEqual(escrituras.map((t) => t.verbo), ['insert'],
    'leer las cerradas de hoy como vigentes deja a la persona con CERO asignaciones abiertas')
  assert.deepEqual(escrituras[0].valores, {
    obra_id: 'salon-comercial', persona_id: PERSONA, rol: 'integrante', desde: HOY,
  })
})

// ═══ EL MENSAJE DE LA BASE SE MUESTRA TAL CUAL ═══
//
// Cuando el `insert` rebota, la persona queda sin obra: el acuse tiene que decir POR QUÉ con las
// palabras de Postgres. Un texto propio («ya tiene una asignación vigente») borra el nombre del
// índice, que es el único hilo para encontrar la fila que la lectura no vio.
test('si la base rechaza el alta, su message viaja entero al acuse', async () => {
  for (const code of ['23505', undefined]) {
    const { supabase } = baseFalsa({
      persona_plantel: [{ id: PERSONA, nombre_completo: 'PÉREZ JUAN' }],
      obra_canonica: [{ id: 'salon-comercial', nombre: 'SALÓN COMERCIAL', estado: 'activa' }],
      obra_asignacion: [{ id: 'a1', obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: null }],
      errorDelInsert: {
        message: 'duplicate key value violates unique constraint "obra_asignacion_una_vigente"',
        code,
      },
    })
    const r = await cambiarObraActualCon(
      { supabase, perfil: { rol: 'direccion' }, hoy: HOY },
      { persona_id: PERSONA, obra_id: 'salon-comercial' },
    )
    assert.equal(r.ok, false)
    assert.match(r.ok === false ? r.error : '', /obra_asignacion_una_vigente/)
    assert.match(r.ok === false ? r.error : '', /quedó sin obra/)
  }
})
