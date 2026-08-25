// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN, uno por uno:
//
//   · QUE EL RESUMEN CUENTE LO QUE SE TRAJO Y NO LO QUE HAY. Al dejar de bajar las 875 compras
//     enteras, la tentación es armar el resumen con las filas que quedaron en memoria: la pantalla
//     diría «Compras · 1 en total» y nadie lo notaría, porque el número sigue pareciendo un número.
//   · QUE UNA COMPRA PENDIENTE SE DIBUJE SIN FECHA NI IMPORTE. La fila liviana existe sólo para
//     contar; si llegara a la cola, se vería como un comprobante de $0 sin fecha — un dato
//     inventado con todas las letras.
//   · EL N+1 DEL DETALLE. Buscar el detalle texto por texto es una consulta por fila de la cola, y
//     la cola crece justamente cuando el desorden crece. El test cuenta las consultas.
//   · EL VIAJE QUE NO HACE FALTA. Sin compras pendientes, la segunda ola tiene que ser CERO
//     consultas. Hoy ése es el caso real y es de donde sale la mitad del ahorro.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPendientesDeImputacion } from './imputacionService.ts'

interface Consulta { tabla: string; columnas: string; filtro: 'range' | 'in'; valores?: string[] }

/**
 * Un PostgREST de mentira que devuelve lo que se le carga y ANOTA cada consulta. Lo que se mide no
 * es sólo el resultado: es cuántos viajes hizo falta y qué columnas se pidieron.
 */
function baseFalsa(tablas: Record<string, Record<string, unknown>[]>) {
  const consultas: Consulta[] = []
  const cliente = {
    from: (tabla: string) => ({
      select: (columnas: string) => ({
        range: async (desde: number, hasta: number) => {
          consultas.push({ tabla, columnas, filtro: 'range' })
          return { data: (tablas[tabla] ?? []).slice(desde, hasta + 1), error: null }
        },
        in: async (columna: string, valores: string[]) => {
          consultas.push({ tabla, columnas, filtro: 'in', valores })
          return {
            data: (tablas[tabla] ?? []).filter((f) => valores.includes(String(f[columna]))),
            error: null,
          }
        },
      }),
    }),
  } as unknown as SupabaseClient
  return { cliente, consultas }
}

/** 300 compras ya resueltas + 2 de un texto que nadie clasificó. */
const compras = [
  ...Array.from({ length: 300 }, (_, i) => ({
    id: `c${i}`, obra_texto: 'SAN FRANCISCO', proveedor: 'ACINDAR', concepto: 'hierro',
    comprobante: `A-${i}`, total: 1000, fecha: '2026-08-01', origen: 'compras_sheet',
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    id: `p${i}`, obra_texto: 'SERV. TECNICO', proveedor: 'TALLER SUR', concepto: 'service',
    comprobante: `B-${i}`, total: 5000, fecha: '2026-08-10', origen: 'compras_sheet',
  })),
]
const alias = [{ alias: 'san francisco', obra_id: 'san-francisco', clasificacion: 'obra', ejemplo_raw: 'SAN FRANCISCO' }]

test('el resumen cuenta las 302 compras aunque sólo se baje el detalle de 2', async () => {
  const { cliente, consultas } = baseFalsa({
    costos_obra: compras, pedidos_materiales: [], herramientas: [], movimientos_herramienta: [], obra_alias: alias,
  })
  const r = await getPendientesDeImputacion(cliente)
  const compra = r.data!.resumen.find((x) => x.tipo === 'compra')!
  assert.equal(compra.total, 302, 'el resumen contó lo que se trajo, no lo que hay')
  assert.equal(compra.obra, 300)
  assert.equal(compra.pendiente, 2)
  assert.equal(compra.estructura, 0)
  assert.equal(compra.sin_texto, 0)

  // LA OLA 1 PIDE DOS COLUMNAS DE COMPRAS, NO ONCE. Si esto vuelve a pedir el detalle completo de
  // las 875 filas reales, la pantalla vuelve a bajar 262 KB por render.
  const ola1 = consultas.find((c) => c.tabla === 'costos_obra' && c.filtro === 'range')!
  assert.equal(ola1.columnas, 'obra_texto, proveedor')
})

test('la cola trae la compra pendiente CON su fecha, su importe y su comprobante', async () => {
  const { cliente } = baseFalsa({
    costos_obra: compras, pedidos_materiales: [], herramientas: [], movimientos_herramienta: [], obra_alias: alias,
  })
  const g = (await getPendientesDeImputacion(cliente)).data!.grupos
  assert.equal(g.length, 1)
  assert.equal(g[0].clave, 'serv tecnico')
  assert.equal(g[0].cantidad, 2)
  assert.equal(g[0].importe, 10000, 'la fila liviana se coló en la cola: importe perdido')
  for (const f of g[0].filas) {
    assert.equal(f.fecha, '2026-08-10', 'una compra de la cola llegó sin fecha')
    assert.ok(f.referencia, 'una compra de la cola llegó sin comprobante: no se puede ir a buscarla')
    assert.notEqual(f.id, '', 'la fila liviana llegó a la pantalla')
  }
})

test('el detalle de N textos pendientes es UNA consulta, no N', async () => {
  const muchos = Array.from({ length: 40 }, (_, i) => ({
    id: `x${i}`, obra_texto: `TEXTO SIN RESOLVER ${i}`, proveedor: 'VARIOS', concepto: 'algo',
    comprobante: `C-${i}`, total: 10, fecha: '2026-08-02', origen: 'compras_sheet',
  }))
  const { cliente, consultas } = baseFalsa({
    costos_obra: muchos, pedidos_materiales: [], herramientas: [], movimientos_herramienta: [], obra_alias: [],
  })
  const r = await getPendientesDeImputacion(cliente)
  assert.equal(r.data!.grupos.length, 40)
  const detalle = consultas.filter((c) => c.filtro === 'in')
  assert.equal(detalle.length, 1, `40 textos pendientes dispararon ${detalle.length} consultas de detalle`)
  assert.equal(detalle[0].valores?.length, 40)
})

test('sin compras pendientes, la segunda ola no existe: cinco consultas y ninguna más', async () => {
  const { cliente, consultas } = baseFalsa({
    costos_obra: compras.slice(0, 300), pedidos_materiales: [], herramientas: [],
    movimientos_herramienta: [], obra_alias: alias,
  })
  const r = await getPendientesDeImputacion(cliente)
  assert.equal(r.data!.grupos.length, 0)
  assert.equal(consultas.filter((c) => c.filtro === 'in').length, 0, 'se pidió detalle sin nada que detallar')
  assert.equal(consultas.length, 5, 'la ola 1 son las cuatro fuentes más el diccionario')
})

test('un texto pendiente en dos fuentes es UN grupo con las dos filas', async () => {
  const { cliente } = baseFalsa({
    costos_obra: [],
    pedidos_materiales: [],
    herramientas: [{ id: 'h1', id_herramienta: 'H-01', nombre: 'Amoladora', ubicacion_actual: 'SERV. TECNICO', fecha: '2026-08-14', origen: 'appsheet_sheet' }],
    movimientos_herramienta: [{ id: 'm1', id_movimiento: 'M-1', id_herramienta: 'H-02', destino: 'Serv. Tecnico', responsable: 'S. Ledesma', fecha: null, origen: 'appsheet_sheet' }],
    obra_alias: [],
  })
  const g = (await getPendientesDeImputacion(cliente)).data!.grupos
  assert.equal(g.length, 1, 'dos grafías del mismo texto se ofrecieron como dos preguntas distintas')
  assert.equal(g[0].cantidad, 2)
  assert.deepEqual([...g[0].tipos].sort(), ['herramienta', 'movimiento'])
  assert.equal(g[0].textos.length, 2, 'la segunda grafía se perdió: quien resuelve no ve qué está uniendo')
})

test('si una fuente falla, la pantalla lo dice — no muestra una cola corta como si fuera la verdad', async () => {
  const cliente = {
    from: () => ({ select: () => ({ range: async () => ({ data: null, error: { message: 'permission denied' } }) }) }),
  } as unknown as SupabaseClient
  const r = await getPendientesDeImputacion(cliente)
  assert.equal(r.data, null)
  assert.match(r.error!, /permission denied/)
})
