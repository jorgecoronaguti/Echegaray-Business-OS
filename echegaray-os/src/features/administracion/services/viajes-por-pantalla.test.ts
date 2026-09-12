// CUÁNTOS VIAJES A POSTGREST HACE CADA PANTALLA — el presupuesto, no el adorno.
//
// ═══ POR QUÉ SE CUENTAN VIAJES Y NO MILISEGUNDOS (12/09/2026) ═══
//
// Medido con `explain (analyze)` sobre la base real, las consultas de estas dos pantallas ejecutan en
// **1 a 7 ms**. Medido con `PERF_TRAZA=1` contra el mismo Supabase, cada una tarda entre 80 y 400 ms
// en caliente y hasta 5 segundos cuando la conexión arranca en frío. O sea: lo que cuesta es el VIAJE,
// no el trabajo. Un `count` de 1,4 ms que cruza el Atlántico cuesta doscientas veces su ejecución.
//
// Y los viajes no se pagan de a uno. En la traza de `/administracion/personas` hay una pasada donde
// seis de los diez pedidos arrancaron a los 88 ms y volvieron TODOS juntos a los 1.376: se quedaron
// esperando conexión. Cuantas más lecturas salen a la vez, más probable es caer en esa cola.
//
// Por eso la garantía de este archivo es un número entero y comprobable sin base: cuántas veces sale
// cada servicio. Un milisegundo medido en esta VM no se puede fijar en un test —depende de la red y
// del humor de Supabase—; la cantidad de viajes sí, y es la causa.
//
// ═══ CÓMO SE MIDE ═══
//
// Un `supabase` de mentira que anota cada `from()` y devuelve filas vacías. No comprueba QUÉ traen las
// consultas —eso lo prueban las funciones puras de abajo y los tests de cada servicio—: comprueba
// cuántas son. Si mañana alguien separa una lectura «para que quede más limpio», este archivo se pone
// en rojo antes de que la pantalla se ponga lenta.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { contarPorFiltro, getConteosDeFiltro } from './personasService.ts'
import { getComprasSheet } from './comprasSheetService.ts'
import { papelesSinFila } from './comprasSheet.ts'
import { getIdentidades } from './identidadProveedorService.ts'

/**
 * Un cliente de mentira que cuenta viajes. Cada `from()` es un viaje a PostgREST; los `select`, `eq`,
 * `order`, `limit`… son parámetros del MISMO viaje y por eso devuelven la misma cadena.
 *
 * La cadena es un thenable: `await consulta` y `await consulta.order(...)` funcionan igual que con el
 * cliente real, que es lo que permite medir sin tocar los servicios.
 */
function contadorDeViajes(filasPorTabla: Record<string, unknown[]> = {}) {
  const viajes: string[] = []
  const cadena = (tabla: string) => {
    const eslabon: Record<string, unknown> = {
      then(ok: (v: unknown) => unknown) {
        return Promise.resolve({ data: filasPorTabla[tabla] ?? [], error: null, count: 0 }).then(ok)
      },
    }
    for (const metodo of ['select', 'eq', 'neq', 'is', 'not', 'in', 'or', 'order', 'limit', 'range']) {
      eslabon[metodo] = () => eslabon
    }
    return eslabon
  }
  const cliente = {
    from(tabla: string) {
      viajes.push(tabla)
      return cadena(tabla)
    },
  }
  return { supabase: cliente as unknown as SupabaseClient, viajes }
}

// ─── PERSONAL ────────────────────────────────────────────────────────────────────────────────────

test('los conteos de las pastillas de Personal salen de UN viaje, no de cuatro', () => {
  // Eran cuatro `count` en `Promise.all`, uno por pastilla: 216, 224, 235 y 250 ms medidos en
  // caliente, y entre 2,6 s y 5,0 s cada uno en frío, para cuatro consultas de 1,4 ms.
  const { supabase, viajes } = contadorDeViajes()
  return getConteosDeFiltro(supabase).then(() => {
    assert.deepEqual(viajes, ['persona_directorio'],
      'los conteos volvieron a pedir una consulta por pastilla')
  })
})

test('las cuatro cuentas salen de las mismas filas, y una fila sin `en_la_empresa` no se cuenta', () => {
  // El `eq('en_la_empresa', true)` y el `eq(..., false)` que esto reemplaza dejaban una fila NULL
  // AFUERA de las dos pastillas. Contarla como inactiva acá habría cambiado un número de la pantalla
  // sin que nadie lo decidiera: el plantel y los inactivos dejarían de sumar lo que sumaban.
  const conteos = contarPorFiltro([
    { en_la_empresa: true, obra_actual_id: 'obra-1' },
    { en_la_empresa: true, obra_actual_id: 'obra-1' },
    { en_la_empresa: true, obra_actual_id: null },
    { en_la_empresa: false, obra_actual_id: null },
    { en_la_empresa: false, obra_actual_id: 'obra-1' },
    { en_la_empresa: null, obra_actual_id: null },
  ])
  assert.deepEqual(conteos, { plantel: 3, en_obra: 2, sin_asignar: 1, inactivos: 2 })
  // «En obra» + «Sin asignar» tiene que cerrar contra «Plantel»: si alguna vez no cerrara, una de las
  // tres pastillas estaría contando a alguien dos veces o a nadie.
  assert.equal(conteos.en_obra! + conteos.sin_asignar!, conteos.plantel)
})

test('si la lectura falla, las pastillas van SIN número — nunca en cero', () => {
  // «Inactivos 0» afirma que nadie egresó nunca. Un error de lectura no puede producir una afirmación
  // sobre la empresa.
  const roto = {
    from() {
      const eslabon: Record<string, unknown> = {
        then(ok: (v: unknown) => unknown) {
          return Promise.resolve({ data: null, error: { message: 'permission denied' } }).then(ok)
        },
      }
      eslabon.select = () => eslabon
      return eslabon
    },
  } as unknown as SupabaseClient
  return getConteosDeFiltro(roto).then((c) => {
    assert.deepEqual(c, { plantel: null, en_obra: null, sin_asignar: null, inactivos: null })
  })
})

// ─── COMPRAS ─────────────────────────────────────────────────────────────────────────────────────

test('la pestaña Compras lee `compra_adjunto` UNA vez, no dos', () => {
  // Los papeles sueltos salían de un viaje aparte (`compra_clave is null`, 158-277 ms medidos) sobre
  // la MISMA tabla que ya se traía entera para cruzarla con las filas. Las 15 filas sueltas viajaban
  // dos veces.
  const { supabase, viajes } = contadorDeViajes()
  return getComprasSheet(supabase).then(() => {
    assert.deepEqual(viajes.filter((t) => t === 'compra_adjunto').length, 1,
      '`compra_adjunto` se volvió a pedir dos veces')
    assert.deepEqual(viajes.sort(), ['compra_adjunto', 'compra_sheet'])
  })
})

test('los sueltos son los adjuntos sin fila, y el último subido va primero', () => {
  const papeles = [
    { compra_clave: 'CLAVE-1', subido_at: '2026-09-12T10:00:00Z' },
    { compra_clave: null, subido_at: '2026-09-01T10:00:00Z' },
    { compra_clave: null, subido_at: '2026-09-10T10:00:00Z' },
    { compra_clave: null, subido_at: null },
  ]
  const sueltos = papelesSinFila(papeles)
  assert.equal(sueltos.length, 3, 'un adjunto CON fila no es un papel suelto')
  assert.deepEqual(sueltos.map((s) => s.subido_at), ['2026-09-10T10:00:00Z', '2026-09-01T10:00:00Z', null],
    'el orden dejó de ser «lo último subido arriba», que es lo que decía el `order` que esto reemplaza')
})

test('`getComprasSheet` devuelve los sueltos junto con las filas, sin un viaje más', () => {
  const { supabase, viajes } = contadorDeViajes({
    compra_sheet: [],
    compra_adjunto: [
      { id: 'a', compra_clave: null, subido_at: '2026-09-11T00:00:00Z' },
      { id: 'b', compra_clave: 'X', subido_at: '2026-09-12T00:00:00Z' },
    ],
  })
  return getComprasSheet(supabase).then((r) => {
    assert.equal(viajes.length, 2)
    assert.deepEqual(r.data?.sueltos.map((s) => s.id), ['a'])
  })
})

test('la identidad de los proveedores se resuelve en UNA ronda, no en dos', () => {
  // Eran dos rondas seriales: `ml_resolucion` primero y, con los ids que salían de ahí,
  // `proveedores` + `ml_entidad_alias` filtrados por `.in()`. La segunda ronda arrancaba justo cuando
  // terminaba la primera y sumaba 123 ms al documento (cerca de un segundo en frío) para leer 41
  // proveedores y 13 alias — medidos contra la base real: traerlos todos son ~3 kB.
  const { supabase, viajes } = contadorDeViajes({
    ml_resolucion: [
      { id: 1, valor_original: 'DUPEC', cuit_original: '20287737824', estado: 'auto_resuelto',
        entidad_id: 'p1', entidad_id_correcta: null, ts: '2026-09-01T00:00:00Z' },
    ],
    proveedores: [{ id: 'p1', nombre: 'DUPEC', razon_social: null }],
    ml_entidad_alias: [{ entidad_id: 'p1', alias: 'DUBOS UGARTE PEDRO LUIS RAUL' }],
  })
  return getIdentidades(supabase).then((r) => {
    assert.deepEqual(viajes.sort(), ['ml_entidad_alias', 'ml_resolucion', 'proveedores'])
    // Y la respuesta no cambió: el nombre resuelto y la razón social de ARCA siguen llegando.
    const i = r.data.get('DUPEC|20287737824')
    assert.equal(i?.proveedorNombre, 'DUPEC')
    assert.equal(i?.razonSocial, 'DUBOS UGARTE PEDRO LUIS RAUL')
  })
})
