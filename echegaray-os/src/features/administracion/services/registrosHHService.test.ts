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
  // 2.400 filas son 1.000 + 1.000 + 400 y el viaje vacío que cierra: cuatro. El de cierre se paga a
  // propósito — el porqué, en el comentario de `leerRegistrosHH`.
  assert.equal(viajes(), 4)
})

test('LA VENTANA CORTA SE CIERRA CON EL VIAJE VACÍO, y eso es lo correcto', async () => {
  const { sb, viajes } = supabaseCapada(filasFalsas().slice(0, 120))
  const { data } = await leerRegistrosHH(sb, {
    desde: '2026-04-16', hasta: '2026-09-15', columnas: COLS,
  })
  assert.equal((data ?? []).length, 120)
  // SON DOS Y ESTÁ BIEN. 120 filas en la primera página no distinguen «se terminó la ventana» de
  // «el tope real del servidor es 120»: cortar ahí sería adivinar el `db-max-rows` que el código no
  // puede leer. El viaje vacío es el precio de no adivinar.
  assert.equal(viajes(), 2)
})

// ═══ EL ATAJO NO PUEDE SALTEAR EL CONTROL ═══
//
// 50.100 filas son cincuenta páginas llenas y una última de 100. Si el corte por página corta se
// escribe ANTES del tope, esta lectura sale con `error: null` y 50.100 filas: el control que existe
// para no devolver una ventana incompleta queda esquivado justo en el caso para el que se escribió.
// Mutación corrida (11/09/2026): moviendo `if (pagina.length < PAGINA)` arriba del tope, este test
// cae en `assert.equal(data, null)` con «Expected values to be strictly equal».
// ═══ EL TOPE REAL NO SE SUPONE: SI FUERA MENOR QUE `PAGINA`, CORTAR A CIEGAS TRUNCA ═══
//
// Lo encontró la auditoría del 11/09/2026. La primera versión del atajo cortaba en cuanto un lote
// venía más chico que `PAGINA`. Si `db-max-rows` fuese 500 —vive en la configuración de Supabase y
// desde el código no se puede leer: `current_setting('pgrst.db_max_rows', true)` da null— TODAS las
// páginas vendrían cortas y la lectura devolvía 500 filas de 2.400 con `error: null`. O sea: el
// atajo que ahorraba 95 ms reintroducía exactamente el truncamiento silencioso que este archivo
// existe para impedir.
//
// Este test queda como candado: mete un tope de 500 y exige las 2.400 filas. Mutación corrida el
// 11/09/2026 — agregando `if (pagina.length < PAGINA) return { data: filas, error: null }` después
// del tope, cae con `500 !== 2400`. Es lo que impide que la optimización vuelva por descuido.
test('CON UN TOPE REAL MENOR QUE `PAGINA` NO SE PIERDE NI UNA FILA', async () => {
  const { sb, viajes } = supabaseCapada(filasFalsas(), 500)
  const { data, error } = await leerRegistrosHH(sb, {
    desde: '2026-04-16', hasta: '2026-09-15', columnas: COLS,
  })
  assert.equal(error, null)
  assert.equal((data ?? []).length, 2400, 'cortar por «página corta» sin conocer el tope trunca')
  // 2.400 en páginas de 500 son cuatro llenas, una de 400 y la vacía de cierre.
  assert.equal(viajes(), 6)
})

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
