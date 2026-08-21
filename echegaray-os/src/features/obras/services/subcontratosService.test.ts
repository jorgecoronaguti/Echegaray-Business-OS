// EL DEFECTO QUE ATRAPA: que esta pantalla vuelva a pedir columnas que la base le revocó, y que un
// objeto que todavía no existe se dibuje como un paquete sin papeles.
//
//  1 · `select('*')` sobre `subcontrato`. Desde la migración 3400 el GRANT de columna excluye
//      `precio_contratado`, y con una columna revocada PostgREST no devuelve el campo vacío: falla
//      la consulta ENTERA, para todos los roles, Dirección incluida. La pantalla no mostraría
//      «sin precio»: no mostraría nada.
//  2 · Pedir la vista económica sin permiso económico. La vista filtra sola, pero pedirla igual
//      manda una consulta que se sabe vacía y borra la diferencia entre «no hay» y «no ves».
//  3 · La tabla de documentación ausente dibujada como documentación faltante. Son dos hechos
//      opuestos: uno dice que el subcontratista no trajo la ART, el otro que el sistema todavía no
//      sabe leerla. Con el segundo, el bloqueo de inicio NO se enciende.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSubcontratos, hhDeApoyo } from './subcontratosService.ts'

interface Resp { data: unknown[]; error: { message: string } | null }
interface Consulta extends PromiseLike<Resp> {
  eq: () => Consulta
  in: () => Consulta
  order: () => Consulta
}

/** Un PostgREST de mentira que anota qué tabla y qué columnas se le pidieron. */
function fake(respuestas: Record<string, Resp>) {
  const pedidos: { tabla: string; cols: string }[] = []
  const consulta = (r: Resp): Consulta => {
    const c: Consulta = {
      eq: () => c,
      in: () => c,
      order: () => c,
      then: (ok, err) => Promise.resolve(r).then(ok, err),
    }
    return c
  }
  const cliente = {
    from: (tabla: string) => ({
      select: (cols: string) => {
        pedidos.push({ tabla, cols })
        return consulta(respuestas[tabla] ?? { data: [], error: null })
      },
    }),
  } as unknown as SupabaseClient
  return { cliente, pedidos }
}

const PAQUETE = {
  id: '11111111-1111-1111-1111-111111111111',
  obra_id: 'escuela',
  proveedor_id: null,
  proveedor_texto: 'Yeseros del Cuyo SRL',
  nombre: 'Tabiques de yeso · Eje 1–4',
  alcance: null,
  cantidad: 96,
  unidad: 'm²',
  moneda: 'ARS',
  fecha_inicio_plan: '2026-08-25',
  fecha_fin_plan: '2026-08-30',
  fecha_inicio_real: null,
  fecha_fin_real: null,
  estado: 'previsto',
  documentacion_ok: false,
  notas: null,
  creado_en: '2026-08-01',
}

const base = (over: Record<string, Resp> = {}): Record<string, Resp> => ({
  subcontrato: { data: [PAQUETE], error: null },
  obra_actividad_control: { data: [], error: null },
  subcontrato_alcance: { data: [], error: null },
  subcontrato_aporte: { data: [], error: null },
  persona_externa: { data: [], error: null },
  subcontrato_documento: { data: [], error: null },
  subcontrato_costo: { data: [], error: null },
  subcontrato_aporte_detalle: { data: [], error: null },
  proveedores: { data: [], error: null },
  ...over,
})

test('ninguna consulta pide `*` ni la columna de precio: la 3400 las revocó', async () => {
  const { cliente, pedidos } = fake(base())
  await getSubcontratos(cliente, 'escuela', true, '2026-08-21')
  const tablas = pedidos.filter((p) => p.tabla === 'subcontrato' || p.tabla === 'subcontrato_aporte')
  assert.ok(tablas.length > 0, 'se leyeron las tablas')
  for (const p of tablas) {
    assert.ok(!p.cols.includes('*'), `«${p.tabla}» pidió * y la consulta entera fallaría`)
    assert.ok(!p.cols.includes('precio_contratado'), '`precio_contratado` está revocada para authenticated')
    assert.ok(!/\bmonto\b/.test(p.cols), '`monto` está revocada para authenticated')
  }
})

test('sin permiso económico no se pide ninguna vista de plata', async () => {
  const { cliente, pedidos } = fake(base())
  const r = await getSubcontratos(cliente, 'escuela', false, '2026-08-21')
  assert.equal(pedidos.some((p) => p.tabla === 'subcontrato_costo'), false)
  assert.equal(pedidos.some((p) => p.tabla === 'subcontrato_aporte_detalle'), false)
  assert.equal(r.data?.paquetes[0].costo_real, null, 'sin permiso el costo no viaja al navegador')
})

test('con permiso económico el costo real llega de la vista, no de la tabla', async () => {
  const { cliente } = fake(base({
    subcontrato_costo: {
      data: [{ subcontrato_id: PAQUETE.id, precio_contratado: 706_560, aportes: 89_600, costo_real: 796_160 }],
      error: null,
    },
  }))
  const r = await getSubcontratos(cliente, 'escuela', true, '2026-08-21')
  assert.equal(r.data?.paquetes[0].costo_real, 796_160)
  assert.equal(r.data?.paquetes[0].precio_contratado, 706_560)
})

test('la tabla de documentación ausente NO se dibuja como documentación faltante', async () => {
  const { cliente } = fake(base({
    subcontrato_documento: {
      data: [],
      error: { message: 'relation "public.subcontrato_documento" does not exist' },
    },
  }))
  const r = await getSubcontratos(cliente, 'escuela', true, '2026-08-21')
  const p = r.data?.paquetes[0]
  assert.deepEqual(p?.revision.bloqueos, [], 'un paquete sin ART no se puede afirmar desde un error de base')
  assert.equal(p?.estadoLegible.clave, 'previsto')
  assert.ok(
    r.data?.avisos.some((a) => a.includes('20260821T5000') && a.includes('no aplicada')),
    'y se dice que la migración está en el repositorio pero no aplicada',
  )
})

test('sin la tabla ausente, la ART que falta SÍ bloquea', async () => {
  const { cliente } = fake(base())
  const r = await getSubcontratos(cliente, 'escuela', true, '2026-08-21')
  assert.deepEqual(r.data?.paquetes[0].revision.bloqueos, ['ART sin cargar'])
  assert.equal(r.data?.paquetes[0].estadoLegible.clave, 'bloqueado')
})

test('el personal externo se cuenta aparte, y el que no tiene ART vigente se marca', async () => {
  const { cliente } = fake(base({
    persona_externa: {
      data: [
        { id: 'p1', subcontrato_id: PAQUETE.id, nombre_completo: 'Ricardo Ponce', art_vigente_hasta: '2026-12-31', alta_afip: true, activo: true },
        { id: 'p2', subcontrato_id: PAQUETE.id, nombre_completo: 'Damián Roldán', art_vigente_hasta: null, alta_afip: false, activo: true },
        { id: 'p3', subcontrato_id: PAQUETE.id, nombre_completo: 'Se fue', art_vigente_hasta: null, alta_afip: false, activo: false },
      ],
      error: null,
    },
  }))
  const p = (await getSubcontratos(cliente, 'escuela', true, '2026-08-21')).data?.paquetes[0]
  assert.equal(p?.personas_externas, 2, 'los inactivos no están en la obra')
  assert.equal(p?.externas_sin_art, 1)
})

test('un error de lectura no se dibuja como una obra sin paquetes', async () => {
  const { cliente } = fake(base({ subcontrato: { data: [], error: { message: 'permission denied for table subcontrato' } } }))
  const r = await getSubcontratos(cliente, 'escuela', true, '2026-08-21')
  assert.equal(r.data, null)
  assert.equal(r.error, 'permission denied for table subcontrato')
})

test('las HH de apoyo salen sólo de los aportes declarados como HH propias', () => {
  assert.equal(hhDeApoyo([
    { tipo: 'hh_propia', cantidad: 8 },
    { tipo: 'material', cantidad: 40 },
    { tipo: 'hh_propia', cantidad: null },
  ]), 8)
})
