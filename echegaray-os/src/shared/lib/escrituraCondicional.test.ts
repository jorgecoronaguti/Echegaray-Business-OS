// LA ESCRITURA CONDICIONAL, MEDIDA CONTRA LA BASE REAL — no contra un modelo de Postgres escrito por nosotros.
//
// ═══ POR QUÉ ESTE ARCHIVO SE REESCRIBIÓ (auditoría, 18/09/2026) ═══
//
// D3: la versión anterior validaba el filtro del `where` contra `laBaseEncuentraLaFila`, una función que imitaba
// a Postgres escrita acá mismo. Un control validado contra la información que produce no es un control: el
// auditor corrió ese modelo con casos divergentes y 7 de 22 no coincidían con la base. Ahora cada caso se
// escribe en una fila real y se le pregunta a la base.
//
// D4: los tests de base llevaban `skip` si no estaba `E2E_ESCRIBE_EN_LA_BASE`, y nada la setea: en la corrida
// normal la protección quedaba cubierta sólo por regex sobre el texto, y el auditor escribió un mutante que las
// pasaba y destruía la protección. Ahora CORREN SIEMPRE, y si no hay credenciales FALLAN diciéndolo. Un test que
// se saltea en silencio no es un control.
//
// ESCRIBE EN LA BASE VIVA, sólo sobre filas propias de `pedidos_materiales` con id `ZZ-TEST-CARRERA-<corrida>-*`,
// que borra por id —nunca con un `like` global, para no borrarle las filas a otra corrida en paralelo—.

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MENSAJE_CONFLICTO, coincideConLoEsperado, valorParaElFiltro } from './pilaDeDeshacer.ts'
import { MENSAJE_SIN_CERTEZA, actualizarSiSigueIgual } from './escrituraCondicional.ts'

// ═══ 1. EL FILTRO, PURO ═══

test('EL FILTRO: vacío es `is null`, el número se lee en es-AR, el texto va exacto', () => {
  assert.equal(valorParaElFiltro(''), null)
  assert.equal(valorParaElFiltro('act-X'), 'act-X')
  // Exacto: el esperado es el valor que vino de la base, no lo tecleado.
  assert.equal(valorParaElFiltro(' contrato '), ' contrato ')
  assert.equal(valorParaElFiltro('123,5', 'numero'), 123.5)
  assert.equal(valorParaElFiltro('1.234,5', 'numero'), 1234.5, 'MUTACIÓN: el replace de una sola coma daba NaN')
  assert.equal(valorParaElFiltro('$ 1.234,50', 'numero'), 1234.5)
  assert.ok(Number.isNaN(valorParaElFiltro('abc', 'numero') as number))
})

// ═══ 2. LA BASE ═══

const CORRIDA = `ZZ-TEST-CARRERA-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const creados: string[] = []
let n = 0

async function credenciales() {
  const { loadEnvLocalInto } = await import('../../../scripts/lib/env-file.mjs')
  loadEnvLocalInto(process.env, new URL('../../../.env.local', import.meta.url).pathname)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const srv = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // RUIDOSO, NO SILENCIOSO: sin credenciales este archivo no prueba nada, y eso tiene que verse en rojo.
  assert.ok(url && srv && anon,
    'SIN CREDENCIALES DE SUPABASE (.env.local): la escritura condicional NO se probó contra la base. '
    + 'Los tests puros solos no alcanzan — ver la cabecera de este archivo.')
  return { url: url as string, srv: srv as string, anon: anon as string }
}

let servicio: SupabaseClient | null = null
async function base(): Promise<SupabaseClient> {
  if (servicio) return servicio
  const { url, srv } = await credenciales()
  const { createClient } = await import('@supabase/supabase-js')
  servicio = createClient(url, srv, { auth: { persistSession: false } })
  return servicio
}

async function sesionDe(email?: string, password?: string): Promise<SupabaseClient> {
  const { url, anon } = await credenciales()
  const { createClient } = await import('@supabase/supabase-js')
  const c = createClient(url, anon, { auth: { persistSession: false } })
  if (email) {
    const { error } = await c.auth.signInWithPassword({ email, password: password as string })
    assert.equal(error, null, `no pude entrar como ${email}: ${error?.message}`)
  }
  return c
}

/** Una fila de prueba propia. Se borra por id al terminar el archivo. */
async function fila(extra: Record<string, unknown> = {}): Promise<string> {
  const sb = await base()
  const id = `${CORRIDA}-${++n}`
  creados.push(id)
  const { error } = await sb.from('pedidos_materiales').insert({
    id_pedido: id, obra_texto: 'ZZ-TEST-CARRERA', material: 'ZZ-TEST', cantidad: 1,
    estado: 'PENDIENTE', fecha: new Date().toISOString().slice(0, 10), origen: 'appsheet_sheet', ...extra,
  })
  assert.equal(error, null, `no pude crear la fila de prueba: ${error?.message}`)
  return id
}

async function leer(id: string, campo: string): Promise<unknown> {
  const { data } = await (await base()).from('pedidos_materiales').select(campo).eq('id_pedido', id).maybeSingle()
  return (data as Record<string, unknown> | null)?.[campo]
}

after(async () => {
  if (!servicio || creados.length === 0) return
  await servicio.from('pedidos_materiales').delete().in('id_pedido', creados)
})

test('DOS DESHACER A LA VEZ SOBRE LA MISMA CELDA: UNO GANA, EL OTRO RECIBE CONFLICTO', async () => {
  const sb = await base()
  const id = await fila()
  const escribir = (estado: string) => actualizarSiSigueIgual(sb, {
    tabla: 'pedidos_materiales', donde: { id_pedido: id }, campo: 'estado', esperado: 'PENDIENTE', cambios: { estado },
  })
  const [a, b] = await Promise.all([escribir('PEDIDO'), escribir('ENTREGADO')])
  assert.deepEqual([a.estado, b.estado].sort(), ['conflicto', 'escrito'],
    `MUTACIÓN: sin la comparación dentro del update las dos escriben. Resultados: ${JSON.stringify([a, b])}`)
  const perdedor = a.estado === 'conflicto' ? a : b
  assert.equal((perdedor as { error: string }).error, MENSAJE_CONFLICTO)
  // LA EVIDENCIA ES DEL EFECTO: la celda quedó con lo del que ganó.
  assert.equal(await leer(id, 'estado'), a.estado === 'escrito' ? 'PEDIDO' : 'ENTREGADO')
})

test('DOS ALTAS A LA VEZ DE UNA FILA QUE NO EXISTÍA: LA CLAVE ÚNICA DEJA PASAR A UNA SOLA', async () => {
  const sb = await base()
  const id = `${CORRIDA}-${++n}-alta`
  creados.push(id)
  const alta = (material: string) => actualizarSiSigueIgual(sb, {
    tabla: 'pedidos_materiales', donde: { id_pedido: id }, campo: 'material', esperado: '', cambios: { material },
    crearSiFalta: {
      id_pedido: id, obra_texto: 'ZZ-TEST-CARRERA', cantidad: 1, estado: 'PENDIENTE',
      fecha: new Date().toISOString().slice(0, 10), origen: 'appsheet_sheet',
    },
  })
  const [a, b] = await Promise.all([alta('ZZ-TEST uno'), alta('ZZ-TEST dos')])
  assert.deepEqual([a.estado, b.estado].sort(), ['conflicto', 'escrito'],
    `MUTACIÓN: un upsert en vez del alta pisaría sin preguntar. Resultados: ${JSON.stringify([a, b])}`)
  assert.equal(await leer(id, 'material'), a.estado === 'escrito' ? 'ZZ-TEST uno' : 'ZZ-TEST dos')
})

test('LA CELDA VACÍA SE EXIGE CON `is null`: no se pisa lo que otro cargó mientras tanto', async () => {
  const sb = await base()
  const id = await fila({ material: 'ZZ-TEST cargado por otro' })
  const r = await actualizarSiSigueIgual(sb, {
    tabla: 'pedidos_materiales', donde: { id_pedido: id }, campo: 'material', esperado: '', cambios: { material: null },
  })
  assert.equal(r.estado, 'conflicto', 'MUTACIÓN: exigir el vacío con `eq ""` deja pasar')
  assert.equal(await leer(id, 'material'), 'ZZ-TEST cargado por otro')
})

test('UNA FILA QUE NO EXISTE NO ES UN CONFLICTO', async () => {
  const r = await actualizarSiSigueIgual(await base(), {
    tabla: 'pedidos_materiales', donde: { id_pedido: `${CORRIDA}-no-existe` }, campo: 'estado',
    esperado: 'PENDIENTE', cambios: { estado: 'PEDIDO' },
  })
  assert.equal(r.estado, 'no_existe')
})

// ═══ 3. D3, MEDIDO: EL FILTRO Y LA COMPARACIÓN EN MEMORIA, CONTRA LA BASE ═══
//
// No se afirma que las dos reglas sean idénticas: se afirman las tres propiedades que importan, y se miden.
//   · SEGURIDAD: si la base escribió, la comparación en memoria también decía «coincide». Nunca escribe de más.
//   · HONESTIDAD: si no escribió y la memoria dice «coincide», NO se contesta «la cambió otra persona».
//   · VERDAD: si no escribió y la memoria dice «no coincide», es conflicto — y lo es de verdad.
// Y una más, la que el auditor midió como defecto: un deshacer legítimo sobre un valor normal SE ESCRIBE.

const CASOS_TEXTO: Array<[string | null, string]> = [
  [null, ''], [null, 'contrato'], ['', ''], ['contrato', ''], ['contrato', 'contrato'],
  ['contrato', 'Contrato'], [' contrato ', ' contrato '], [' contrato ', 'contrato'], ['contrato', ' contrato '],
]
const CASOS_NUMERO: Array<[number | null, string]> = [
  [null, ''], [null, '0'], [0, ''], [0, '0'], [123.5, '123,5'], [123.5, '123'], [34, '34,00'],
  [1234.5, '1.234,5'], [1234.5, '$ 1.234,50'], [1234.5, '1234.5'], [5, 'abc'],
]

test('D3: CADA CASO SE ESCRIBE EN LA BASE — nunca escribe de más, y nunca acusa en falso', async () => {
  const sb = await base()
  const falsos: string[] = []
  const probar = async (campo: 'material' | 'cantidad', hoy: unknown, esperado: string, tipo: 'texto' | 'numero') => {
    const id = await fila({ [campo]: hoy })
    // Se reescribe el MISMO valor: si la escritura entra, la fila no cambia; lo que se mide es si entró.
    const r = await actualizarSiSigueIgual(sb, {
      tabla: 'pedidos_materiales', donde: { id_pedido: id }, campo, esperado, tipo, cambios: { [campo]: hoy },
    })
    const guardado = await leer(id, campo)
    const enMemoria = coincideConLoEsperado(guardado, esperado)
    const caso = `${campo}: base=${JSON.stringify(guardado)} esperado=${JSON.stringify(esperado)} → ${r.estado}`
    if (r.estado === 'escrito') {
      assert.ok(enMemoria, `SEGURIDAD rota, escribió de más — ${caso}`)
    } else if (enMemoria) {
      assert.equal(r.estado, 'sin_certeza', `HONESTIDAD rota, acusa en falso — ${caso}`)
      assert.equal((r as { error: string }).error, MENSAJE_SIN_CERTEZA)
      falsos.push(caso)
    } else {
      assert.equal(r.estado, 'conflicto', `VERDAD rota — ${caso}`)
    }
  }
  for (const [hoy, esperado] of CASOS_TEXTO) await probar('material', hoy, esperado, 'texto')
  for (const [hoy, esperado] of CASOS_NUMERO) await probar('cantidad', hoy, esperado, 'numero')
  // EL ÚNICO CASO QUE NO ESCRIBE PUDIENDO: una cadena vacía guardada (no NULL). Ninguna de estas columnas lo
  // tiene hoy; si aparece, se rechaza sin acusar a nadie. Cualquier otro caso acá es un deshacer legítimo que
  // se está rechazando, y eso es un defecto.
  assert.deepEqual(falsos, ['material: base="" esperado="" → sin_certeza'],
    `deshaceres legítimos rechazados: ${JSON.stringify(falsos)}`)
})

test('D3: UN DESHACER LEGÍTIMO SOBRE UN NÚMERO CON MILES SE ESCRIBE (antes daba NaN y «otra persona»)', async () => {
  const sb = await base()
  const id = await fila({ cantidad: 1234.5 })
  const r = await actualizarSiSigueIgual(sb, {
    tabla: 'pedidos_materiales', donde: { id_pedido: id }, campo: 'cantidad', esperado: '1.234,5', tipo: 'numero',
    cambios: { cantidad: 99 },
  })
  assert.equal(r.estado, 'escrito')
  assert.equal(Number(await leer(id, 'cantidad')), 99)
})

// ═══ 4. RLS: CERO FILAS POR PERMISO NO ES «LA CAMBIÓ OTRA PERSONA» ═══
//
// Se miden tres sesiones reales —sin sesión, campo y jefe de obra— sobre una fila que NADIE cambió. No se
// supone qué ve ni qué escribe cada rol: se registra. Lo que se afirma es lo que no puede pasar: que una
// sesión que no escribió reciba «la cambió otra persona», o que la fila cambie sin que la escritura entrara.

test('RLS: UNA SESIÓN QUE NO PUEDE ESCRIBIR NUNCA RECIBE «LA CAMBIÓ OTRA PERSONA»', async () => {
  const { conCuentaEfimera } = await import('../../../tests/util/identidades.ts')
  const admin = await base()
  const medido: string[] = []
  const medir = async (quien: string, sb: SupabaseClient) => {
    const id = await fila({ estado: 'PENDIENTE' })
    const r = await actualizarSiSigueIgual(sb, {
      tabla: 'pedidos_materiales', donde: { id_pedido: id }, campo: 'estado', esperado: 'PENDIENTE',
      cambios: { estado: 'PEDIDO' },
    })
    const despues = await leer(id, 'estado')
    medido.push(`${quien}: ${r.estado}, la base quedó en ${despues}`)
    // La fila no la cambió nadie: «conflicto» sería el OS afirmando algo falso.
    assert.notEqual(r.estado, 'conflicto', `${quien} recibió «la cambió otra persona» sobre una fila intacta`)
    if (r.estado === 'escrito') assert.equal(despues, 'PEDIDO', `${quien}: dijo escrito y la base no lo tiene`)
    else assert.equal(despues, 'PENDIENTE', `${quien}: no escribió y la fila cambió igual`)
    await sb.auth.signOut({ scope: 'local' }).catch(() => {})
  }
  await medir('sin sesión', await sesionDe())
  // Las cuentas de campo y jefe nacen y mueren acá: no quedan usuarios de prueba en la base viva.
  await conCuentaEfimera(admin, 'campo', 'quattropani', async (c) => medir('campo', await sesionDe(c.email, c.password)))
  await conCuentaEfimera(admin, 'jefe_obra', null, async (c) => medir('jefe de obra', await sesionDe(c.email, c.password)))
  // Lo medido queda en la salida del test: es la evidencia de qué hace cada rol, no una suposición.
  console.log(`RLS medido sobre pedidos_materiales.estado:\n  ${medido.join('\n  ')}`)
})

