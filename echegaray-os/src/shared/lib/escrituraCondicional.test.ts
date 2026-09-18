// LA VENTANA ENTRE LEER Y ESCRIBIR — el test que falla sin la escritura condicional.
//
// Auditoría del 18/09/2026, segunda vuelta: comparar `esperado` con una lectura previa y escribir después deja
// una ventana. Dos personas que deshacen la misma celda en el mismo instante leen las dos lo mismo, las dos
// pasan el control, y la segunda pisa a la primera. La comparación tiene que ir DENTRO del `update`.
//
// Este archivo prueba dos cosas distintas:
//   1. PURO (siempre corre): que el filtro del `where` y la comparación en memoria son LA MISMA regla. Si
//      divergen, un «123,5» contra 123.5 rechazaría un deshacer legítimo.
//   2. CONTRA LA BASE (`E2E_ESCRIBE_EN_LA_BASE=si`): dos escrituras condicionales en paralelo sobre la misma
//      celda, con el mismo `esperado`. Una gana, la otra recibe conflicto, y la celda queda con el valor de la
//      que ganó. Crea y borra su propia fila `ZZ-TEST-CARRERA-*`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coincideConLoEsperado, valorParaElFiltro, MENSAJE_CONFLICTO } from './pilaDeDeshacer.ts'
import { actualizarSiSigueIgual } from './escrituraCondicional.ts'

// ═══ 1. LAS DOS REGLAS DE IGUALDAD SON LA MISMA ═══

/** Lo que hace Postgres con el filtro que arma `valorParaElFiltro`: `is null`, o `=` (numérico o de texto). */
function laBaseEncuentraLaFila(hoy: unknown, esperado: string, tipo: 'texto' | 'numero'): boolean {
  const exigido = valorParaElFiltro(esperado, tipo)
  if (typeof exigido === 'number' && !Number.isFinite(exigido)) return false
  if (exigido === null) return hoy == null
  if (hoy == null) return false
  return typeof hoy === 'number' ? hoy === exigido : String(hoy) === String(exigido)
}

test('EL FILTRO DEL `where` Y LA COMPARACIÓN EN MEMORIA DECIDEN LO MISMO', () => {
  const casos: Array<{ hoy: unknown; esperado: string; tipo: 'texto' | 'numero' }> = [
    { hoy: null, esperado: '', tipo: 'texto' },
    { hoy: undefined, esperado: '', tipo: 'texto' },
    // El caso de la auditoría: la celda la cargó otra persona y la pantalla la vio vacía.
    { hoy: 'act-X', esperado: '', tipo: 'texto' },
    { hoy: null, esperado: 'act-X', tipo: 'texto' },
    { hoy: 'act-X', esperado: 'act-X', tipo: 'texto' },
    { hoy: 'act-X', esperado: 'act-Y', tipo: 'texto' },
    { hoy: 'PENDIENTE', esperado: 'PENDIENTE', tipo: 'texto' },
    // Números: la pantalla dibuja «123,5» y la base guarda 123.5.
    { hoy: 123.5, esperado: '123,5', tipo: 'numero' },
    { hoy: 34, esperado: '34,00', tipo: 'numero' },
    { hoy: 123.5, esperado: '123', tipo: 'numero' },
    { hoy: 0, esperado: '', tipo: 'numero' },
    { hoy: null, esperado: '', tipo: 'numero' },
    { hoy: 5, esperado: 'abc', tipo: 'numero' },
  ]
  for (const { hoy, esperado, tipo } of casos) {
    assert.equal(
      laBaseEncuentraLaFila(hoy, esperado, tipo),
      coincideConLoEsperado(hoy, esperado),
      `MUTACIÓN: el where y la comparación divergen en hoy=${JSON.stringify(hoy)} esperado=«${esperado}» (${tipo})`,
    )
  }
})

test('EL FILTRO: vacío es `is null`, el número es número, el texto es texto', () => {
  assert.equal(valorParaElFiltro(''), null)
  assert.equal(valorParaElFiltro('   '), null)
  assert.equal(valorParaElFiltro('act-X'), 'act-X')
  assert.equal(valorParaElFiltro(' contrato '), 'contrato')
  assert.equal(valorParaElFiltro('123,5', 'numero'), 123.5)
  assert.equal(valorParaElFiltro('34,00', 'numero'), 34)
  // Un esperado que no es número: ninguna fila lo cumple, y la primitiva lo corta antes de tocar la base.
  assert.ok(Number.isNaN(valorParaElFiltro('abc', 'numero') as number))
})

// ═══ 2. LA CARRERA, CONTRA LA BASE REAL ═══

const ESCRIBE = process.env.E2E_ESCRIBE_EN_LA_BASE === 'si'
const OBRA_TEXTO = 'ZZ-TEST-CARRERA'

async function base() {
  const { loadEnvLocalInto } = await import('../../../scripts/lib/env-file.mjs')
  loadEnvLocalInto(process.env, new URL('../../../.env.local', import.meta.url).pathname)
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  )
}

test('DOS DESHACER A LA VEZ SOBRE LA MISMA CELDA: UNO GANA, EL OTRO RECIBE CONFLICTO', { skip: !ESCRIBE && 'necesita la base: E2E_ESCRIBE_EN_LA_BASE=si' }, async () => {
  const sb = await base()
  const id = `ZZ-TEST-CARRERA-${Date.now()}`
  const limpiar = async () => { await sb.from('pedidos_materiales').delete().like('id_pedido', 'ZZ-TEST-CARRERA-%') }
  await limpiar()
  const { error: eIns } = await sb.from('pedidos_materiales').insert({
    id_pedido: id, obra_texto: OBRA_TEXTO, material: 'ZZ-TEST carrera de deshacer', cantidad: 1,
    estado: 'PENDIENTE', fecha: new Date().toISOString().slice(0, 10), origen: 'appsheet_sheet',
  })
  assert.equal(eIns, null, 'no se pudo crear la fila de prueba')

  try {
    // Las dos manos vieron PENDIENTE y quieren escribir cosas distintas, AL MISMO TIEMPO.
    const escribir = (estado: string) => actualizarSiSigueIgual(sb, {
      tabla: 'pedidos_materiales', donde: { id_pedido: id }, campo: 'estado', esperado: 'PENDIENTE',
      cambios: { estado },
    })
    const [a, b] = await Promise.all([escribir('PEDIDO'), escribir('ENTREGADO')])

    const estados = [a.estado, b.estado].sort()
    assert.deepEqual(estados, ['conflicto', 'escrito'],
      `MUTACIÓN: sin la comparación dentro del update las dos escriben. Resultados: ${JSON.stringify([a, b])}`)
    const perdedor = a.estado === 'conflicto' ? a : b
    assert.equal((perdedor as { error: string }).error, MENSAJE_CONFLICTO)

    // LA EVIDENCIA ES DEL EFECTO: la celda quedó con el valor del que ganó, no con una mezcla ni con el último.
    const { data } = await sb.from('pedidos_materiales').select('estado').eq('id_pedido', id).maybeSingle()
    const gano = a.estado === 'escrito' ? 'PEDIDO' : 'ENTREGADO'
    assert.equal(data?.estado, gano, 'la base no quedó con lo que escribió el que ganó')
  } finally {
    await limpiar()
  }
})

test('SOBRE UNA CELDA QUE YA CAMBIÓ NO SE ESCRIBE, Y SE DISTINGUE DE UNA FILA QUE NO EXISTE', { skip: !ESCRIBE && 'necesita la base: E2E_ESCRIBE_EN_LA_BASE=si' }, async () => {
  const sb = await base()
  const id = `ZZ-TEST-CARRERA-${Date.now()}-b`
  const limpiar = async () => { await sb.from('pedidos_materiales').delete().like('id_pedido', 'ZZ-TEST-CARRERA-%') }
  await limpiar()
  await sb.from('pedidos_materiales').insert({
    id_pedido: id, obra_texto: OBRA_TEXTO, material: 'ZZ-TEST celda ya cambiada', cantidad: 1,
    estado: 'ENTREGADO', fecha: new Date().toISOString().slice(0, 10), origen: 'appsheet_sheet',
  })
  try {
    // Quien deshace vio PENDIENTE, pero la base ya dice ENTREGADO.
    const r = await actualizarSiSigueIgual(sb, {
      tabla: 'pedidos_materiales', donde: { id_pedido: id }, campo: 'estado', esperado: 'PENDIENTE',
      cambios: { estado: 'PEDIDO' },
    })
    assert.equal(r.estado, 'conflicto')
    const { data } = await sb.from('pedidos_materiales').select('estado').eq('id_pedido', id).maybeSingle()
    assert.equal(data?.estado, 'ENTREGADO', 'no se pisó lo que había')

    // La misma escritura sobre una fila que no existe se informa distinto: no es un conflicto, es una ausencia.
    const sinFila = await actualizarSiSigueIgual(sb, {
      tabla: 'pedidos_materiales', donde: { id_pedido: `${id}-no-existe` }, campo: 'estado', esperado: 'PENDIENTE',
      cambios: { estado: 'PEDIDO' },
    })
    assert.equal(sinFila.estado, 'no_existe')
  } finally {
    await limpiar()
  }
})

test('LA CELDA VACÍA SE EXIGE CON `is null`: no se pisa una actividad que otro cargó mientras tanto', { skip: !ESCRIBE && 'necesita la base: E2E_ESCRIBE_EN_LA_BASE=si' }, async () => {
  const sb = await base()
  const id = `ZZ-TEST-CARRERA-${Date.now()}-c`
  const limpiar = async () => { await sb.from('pedidos_materiales').delete().like('id_pedido', 'ZZ-TEST-CARRERA-%') }
  await limpiar()
  const { data: act } = await sb.from('obra_actividad')
    .select('id').eq('archivada', false).is('actividad_padre_id', null).neq('tipo', 'resumen').limit(1).maybeSingle()
  assert.ok(act?.id, 'no hay ninguna actividad para la prueba')
  await sb.from('pedidos_materiales').insert({
    id_pedido: id, obra_texto: OBRA_TEXTO, material: 'ZZ-TEST vacío exigido', cantidad: 1,
    estado: 'PENDIENTE', fecha: new Date().toISOString().slice(0, 10), origen: 'appsheet_sheet',
    actividad_id: act!.id,
  })
  try {
    // Quien escribe vio la celda VACÍA, pero otra persona ya le puso una actividad.
    const r = await actualizarSiSigueIgual(sb, {
      tabla: 'pedidos_materiales', donde: { id_pedido: id }, campo: 'actividad_id', esperado: '',
      cambios: { actividad_id: null },
    })
    assert.equal(r.estado, 'conflicto', 'MUTACIÓN: exigir el vacío con `eq ""` en vez de `is null` deja pasar')
    const { data } = await sb.from('pedidos_materiales').select('actividad_id').eq('id_pedido', id).maybeSingle()
    assert.equal(data?.actividad_id, act!.id, 'la actividad del otro sigue ahí')
  } finally {
    await limpiar()
  }
})
