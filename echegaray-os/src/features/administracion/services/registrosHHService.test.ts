// EL TOPE SILENCIOSO DE POSTGREST, PROBADO CONTRA UNA BASE QUE LO APLICA.
//
// El defecto real (10/09/2026): la solapa «Horas» pedía cinco meses de `registros_hh` en un viaje,
// PostgREST devolvía las primeras 1.000 filas con `error: null`, y la quincena en curso —las filas
// más nuevas— quedaba afuera. La grilla dibujaba «·» sobre nueve horas trabajadas.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { leerRegistrosHH } from './registrosHHService.ts'

interface FilaFalsa { id: string; persona_id: string; fecha: string; horas: number; tipo_hora: string }

/** 2.400 filas: 1.400 viejas y 1.000 de la quincena. Con un solo viaje capado en 1.000, las de la
 *  quincena no entran — que es exactamente lo que pasó en producción. */
function filasFalsas(): FilaFalsa[] {
  const out: FilaFalsa[] = []
  for (let i = 0; i < 1400; i++) {
    out.push({ id: `a${String(i).padStart(5, '0')}`, persona_id: 'p1', fecha: '2026-05-04', horas: 9, tipo_hora: 'normal' })
  }
  for (let i = 0; i < 1000; i++) {
    out.push({ id: `b${String(i).padStart(5, '0')}`, persona_id: 'p1', fecha: '2026-09-01', horas: 9, tipo_hora: 'normal' })
  }
  return out
}

/** Una base que CORTA en `maxRows` sin decirlo, como PostgREST con `db-max-rows`. */
function supabaseCapada(filas: FilaFalsa[], maxRows = 1000): { sb: SupabaseClient; viajes: () => number } {
  let viajes = 0
  const consulta = () => {
    let desde = 0
    let hasta = Number.MAX_SAFE_INTEGER
    let inicio = 0
    let fin = maxRows - 1
    const api = {
      select: () => api,
      gte: (_c: string, v: string) => { desde = Number(v.replaceAll('-', '')); return api },
      lte: (_c: string, v: string) => { hasta = Number(v.replaceAll('-', '')); return api },
      not: () => api,
      order: () => api,
      range: (a: number, b: number) => { inicio = a; fin = b; return api },
      then: (resolver: (r: { data: FilaFalsa[]; error: null }) => unknown) => {
        viajes++
        const enVentana = filas
          .filter((f) => {
            const n = Number(f.fecha.replaceAll('-', ''))
            return n >= desde && n <= hasta
          })
          .sort((x, y) => x.id.localeCompare(y.id))
        const tope = Math.min(fin, inicio + maxRows - 1)
        return resolver({ data: enVentana.slice(inicio, tope + 1), error: null })
      },
    }
    return api
  }
  return { sb: { from: consulta } as unknown as SupabaseClient, viajes: () => viajes }
}

const COLS = 'id, persona_id, fecha, horas, tipo_hora'

test('LA VENTANA ANCHA NO SE CORTA EN 1.000: las filas de la quincena llegan', async () => {
  const { sb, viajes } = supabaseCapada(filasFalsas())
  const { data, error } = await leerRegistrosHH(sb, {
    desde: '2026-04-16', hasta: '2026-09-15', columnas: COLS,
  })
  assert.equal(error, null)
  const filas = (data ?? []) as FilaFalsa[]
  assert.equal(filas.length, 2400, 'una sola página devolvía 1.000 y perdía 1.400 filas')
  // ═══ LA AFIRMACIÓN QUE EL DUEÑO MIRÓ: 9 h el 1 de septiembre tienen que estar ═══
  const deLaQuincena = filas.filter((f) => f.fecha >= '2026-09-01' && f.fecha <= '2026-09-15')
  assert.equal(deLaQuincena.length, 1000)
  assert.equal(deLaQuincena.reduce((s, f) => s + f.horas, 0), 9000)
  // 2.400 filas son tres páginas: 1.000, 1.000 y 400. La tercera ya viene corta y dice sola que se
  // terminó; pedir una cuarta para ver un cero es un viaje serial que en producción cuesta ~800 ms.
  assert.equal(viajes(), 3, 'la página corta cierra la lectura: no se pide una vacía para confirmar')
})

test('LA VENTANA CORTA SE LEE EN UN SOLO VIAJE, no en dos ni en veinte', async () => {
  const { sb, viajes } = supabaseCapada(filasFalsas().slice(0, 120))
  const { data } = await leerRegistrosHH(sb, {
    desde: '2026-04-16', hasta: '2026-09-15', columnas: COLS,
  })
  assert.equal((data ?? []).length, 120)
  // Hasta el 11/09/2026 esto valía 2: el segundo viaje traía cero filas y sólo servía para
  // confirmar lo que el primero ya había dicho al devolver 120 de un tope de 1.000.
  assert.equal(viajes(), 1, 'una página incompleta ya dice que no hay más')
})

// ═══ EL ATAJO NO PUEDE SALTEAR EL CONTROL ═══
//
// 50.100 filas son cincuenta páginas llenas y una última de 100. Si el corte por página corta se
// escribe ANTES del tope, esta lectura sale con `error: null` y 50.100 filas: el control que existe
// para no devolver una ventana incompleta queda esquivado justo en el caso para el que se escribió.
// Mutación corrida (11/09/2026): moviendo `if (pagina.length < PAGINA)` arriba del tope, este test
// cae en `assert.equal(data, null)` con «Expected values to be strictly equal».
test('UNA VENTANA QUE NO ENTRA EN EL TOPE FALLA, no devuelve la mitad', async () => {
  const muchas: FilaFalsa[] = []
  for (let i = 0; i < 50_100; i++) {
    muchas.push({ id: `c${String(i).padStart(6, '0')}`, persona_id: 'p1', fecha: '2026-09-01', horas: 1, tipo_hora: 'normal' })
  }
  const { sb } = supabaseCapada(muchas)
  const { data, error } = await leerRegistrosHH(sb, {
    desde: '2026-01-01', hasta: '2026-12-31', columnas: COLS,
  })
  assert.equal(data, null)
  assert.match(error ?? '', /no puede afirmar que los tiene todos/)
})
