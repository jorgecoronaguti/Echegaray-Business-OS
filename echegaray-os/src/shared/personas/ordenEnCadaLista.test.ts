import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { clavesDeOrden } from './nombre.ts'
import { ordenDeUsuarios } from './nombresDeUsuarios.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import { plantelActivo, type LineaDelCuadro } from '../../features/administracion/services/retribucionDelPlantel.ts'
import { pagoDeNomina } from '../../features/analiticas/services/nominaPagada.ts'
import { pagoDeLaLinea } from '../../features/administracion/services/pagoDeLaQuincena.ts'
import { quincenaDe } from '../../features/administracion/services/quincena.ts'
import { armarParque } from '../../features/herramientas/logica/parque.ts'
import { personasDelLibro } from '../../features/herramientas/logica/movimientos.ts'
import { mov } from '../../features/herramientas/logica/fixture.test-util.ts'

// CADA LISTA QUE ORDENA PERSONAS, UN TEST (dueño, 28/09/2026: «se ha roto el orden por apellido del
// personal en toda la app»). El bug no estaba en `compararPorApellido`: estaba en cada lista que
// ordenaba por el nombre PARA MOSTRAR (entonces «Emiliano Maldonado», nombre de pila primero; desde el
// 29/09 es «Maldonado Emiliano», apellido primero, y ya no hay dos órdenes que distinguir). Por eso se
// prueba lista por lista. Cuando se puede, con la función real; cuando la lista vive en un servicio
// que habla con Supabase o en una acción de servidor, leyendo la fuente: no es elegante, pero se pone
// roja si alguien vuelve a escribir `a.nombre.localeCompare(...)`.
//
// El orden esperado es Aballay, Corona, Maldonado. Ojo: con el nombre curado apellido-primero, el
// texto mostrado y el legajo coinciden; lo que atrapa el test es la lista que ordena por pila o al revés.

const LEGAJO = { m: 'MALDONADO BATISTA EMILIANO MIGUEL', a: 'ABALLAY DIEGO', c: 'CORONA GUTIERREZ JORGE' } as const
const MOSTRAR = { m: 'Maldonado Emiliano', a: 'Aballay Diego', c: 'Corona Jorge' } as const
const POR_APELLIDO = ['Aballay Diego', 'Corona Jorge', 'Maldonado Emiliano']
const clave = (id: keyof typeof LEGAJO) => LEGAJO[id].toLocaleLowerCase('es-AR')

const fuente = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

/**
 * Supabase de una sesión de CAMPO: la RLS de `personas` no le deja ver ningún legajo (cero filas) y
 * `nombres_de_usuarios()` le da sólo el nombre para mostrar. `orden_de_usuarios()` es security
 * definer: la base arma la clave con el legajo aunque la sesión no lo vea.
 */
function supabaseDeCampo() {
  const llamadas: string[] = []
  const vacio = { data: [], error: null }
  const tabla = (nombre: string) => {
    llamadas.push(`from:${nombre}`)
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'in', 'eq', 'order']) q[m] = () => q
    q.then = (ok: (v: typeof vacio) => unknown) => Promise.resolve(vacio).then(ok)
    return q
  }
  const rpc = async (fn: string) => {
    llamadas.push(`rpc:${fn}`)
    if (fn === 'orden_de_usuarios') {
      return { data: (['m', 'a', 'c'] as const).map((k) => ({ usuario_id: `u-${k}`, clave_orden: LEGAJO[k].toLowerCase() })), error: null }
    }
    if (fn === 'nombres_de_usuarios') {
      return { data: (['m', 'a', 'c'] as const).map((k) => ({ id: `u-${k}`, nombre: MOSTRAR[k], persona_id: `p-${k}` })), error: null }
    }
    return { data: null, error: { message: `no existe ${fn}` } }
  }
  return { cliente: { rpc, from: tabla } as unknown as SupabaseClient, llamadas }
}

test('usuarios con sesión de Campo (sin legajo visible): ordena por apellido, no por el nombre para mostrar', async () => {
  const { cliente, llamadas } = supabaseDeCampo()
  const orden = await ordenDeUsuarios(cliente)
  const ids = [...orden].sort(([, x], [, y]) => x.localeCompare(y, 'es')).map(([id]) => id)
  // Por lo que se muestra sería Diego, Emiliano, Jorge (u-a, u-m, u-c).
  assert.deepEqual(ids, ['u-a', 'u-c', 'u-m'])
  // Una sola lectura, y nunca a `personas` con la sesión del usuario (ahí la RLS la deja vacía).
  assert.deepEqual(llamadas, ['rpc:orden_de_usuarios'])
})

test('clavesDeOrden: normaliza la clave de la base como la app y descarta filas sin usuario', () => {
  const claves = clavesDeOrden([
    { usuario_id: 'u-n', clave_orden: 'ÑAÑEZ  PEDRO' },
    { usuario_id: 'u-g', clave_orden: 'gómez álvarez josé' },
    { usuario_id: '', clave_orden: 'nadie' },
  ])
  assert.deepEqual([...claves], [['u-n', 'ñañez pedro'], ['u-g', 'gomez alvarez jose']])
})

test('orden_de_usuarios(): security definer, legajo primero y cerrada a anon', () => {
  const sql = fuente('../../../supabase/migrations/20260928T2345_orden_de_usuarios.sql').replace(/^\s*--.*$/gm, '')
  assert.match(sql, /security definer/)
  assert.match(sql, /set search_path = public/)
  // El legajo es el PRIMER término: el nombre para mostrar sólo entra si no hay legajo.
  assert.match(sql, /coalesce\(\s*nullif\(btrim\(pe\.nombre_completo\)/)
  // La Ñ no se traduce a N.
  assert.doesNotMatch(sql, /translate\([\s\S]*ñ[\s\S]*\)\s+as clave_orden/)
  assert.match(sql, /revoke all on function public\.orden_de_usuarios\(\) from public, anon/)
  assert.match(sql, /grant execute on function public\.orden_de_usuarios\(\) to authenticated/)
  assert.doesNotMatch(sql, /nombres_de_usuarios/)
})

test('Personal › retribución del plantel (plantelActivo): por legajo, no por lo que se muestra', () => {
  const linea = (id: keyof typeof LEGAJO): LineaDelCuadro => ({
    personaId: id, nombre: MOSTRAR[id], nombreOrden: clave(id), modalidad: 'hora', horas: 80, valorHora: 6000,
    netoMensual: null, cobra: null, sinTarifa: false, sinNeto: false, sueldo: null, sinDesglose: false,
    pago: pagoDeLaLinea({ banco: 1, negro: 1 }),
  })
  const plantel = plantelActivo([{
    quincena: quincenaDe('2026-09-01'),
    cuadros: [{ grupo: 'obreros', lineas: [linea('m'), linea('a'), linea('c')] }],
    estados: {},
  }])
  assert.deepEqual(plantel.map((p) => p.nombre), POR_APELLIDO)
})

test('Analíticas › nómina pagada: a igual importe, desempata el apellido', () => {
  const ids = ['m', 'a', 'c'] as const
  const r = pagoDeNomina({
    anio: 2026,
    quincenas: [{ id: 'q', desde: '2026-04-01', estado: 'cerrada' }],
    lineas: ids.map((id) => ({ liquidacion_id: 'q', persona_id: id, cobra: '100000' })),
    recibos: [],
    personas: ids.map((id) => ({ id, nombre_completo: LEGAJO[id], nombre_para_mostrar: MOSTRAR[id] })),
  })
  assert.deepEqual((r.porPersona.get('2026-04') ?? []).map((p) => p.nombre), POR_APELLIDO)
})

const movDe = (id: string, usuario_id: string) =>
  mov({ id, activo_id: 'x', destino_id: 't', fecha_hora: '2026-09-21T10:00:00-03:00', usuario_id })

test('Herramientas › movimientos: el filtro de personas va por apellido', () => {
  const p = armarParque({
    activos: [], ubicaciones: [], obras: [], incidencias: [],
    movimientos: [
      movDe('1', 'u-m'), movDe('2', 'u-a'), movDe('3', 'u-c'), movDe('4', 'u-a'),
    ],
    nombres: { 'u-m': MOSTRAR.m, 'u-a': MOSTRAR.a, 'u-c': MOSTRAR.c },
    ordenUsuarios: { 'u-m': clave('m'), 'u-a': clave('a'), 'u-c': clave('c') },
  })
  assert.deepEqual(personasDelLibro(p), [
    { v: 'u:u-a', t: MOSTRAR.a }, { v: 'u:u-c', t: MOSTRAR.c }, { v: 'u:u-m', t: MOSTRAR.m },
  ])
})

// ═══ Las que viven en servicios con Supabase o en acciones de servidor: se lee la fuente. ═══

const ORDENA_POR_LO_MOSTRADO = /\(?\b[ab]\.nombre\b(\s*\?\?[^)]*)?\)?\.localeCompare\(/

test('Dirección › entrar como: ordena por ordenDeUsuarios, no por el nombre de la cuenta', () => {
  const s = fuente('../../features/auth/services/entrarComo.ts')
  assert.doesNotMatch(s, ORDENA_POR_LO_MOSTRADO)
  assert.match(s, /ordenDeUsuarios\(admin\)/)
  assert.match(s, /const clave = \(c: CuentaEntrable\) => porApellido\.get\(c\.id\)/)
  assert.match(s, /\.sort\(\(a, b\) => clave\(a\)\.localeCompare\(clave\(b\), 'es'\)\)/)
})

test('Clientes › responsables: ordena por ordenDeUsuarios, no por el nombre para mostrar', () => {
  const s = fuente('../../features/clientes/services/clientesService.ts')
  const cuerpo = s.slice(s.indexOf('export async function getResponsables'), s.indexOf('export async function getDocumentosCliente'))
  assert.ok(cuerpo.length > 0, 'getResponsables no está donde se la busca')
  assert.doesNotMatch(cuerpo, ORDENA_POR_LO_MOSTRADO)
  assert.match(cuerpo, /ordenDeUsuarios\(supabase\)/)
  assert.match(cuerpo, /responsables\.sort\(\(a, b\) => clave\(a\)\.localeCompare\(clave\(b\), 'es'\)\)/)
})

test('Administración › usuarios: ordena por el legajo de la persona vinculada', () => {
  const s = fuente('../../features/usuarios/services/usuariosService.ts')
  assert.doesNotMatch(s, ORDENA_POR_LO_MOSTRADO)
  assert.match(s, /ordenPersona = new Map\([^\n]*claveDeOrden\(/)
  assert.match(s, /return claveDeUsuario\(a\)\.localeCompare\(claveDeUsuario\(b\), 'es'\)/)
})

test('Obra › parte guardado: la cuadrilla se ordena por claveDeOrden del legajo', () => {
  const s = fuente('../../features/obras/services/parteGuardadoActions.ts')
  assert.doesNotMatch(s, /\.sort\(\(a, b\) => a\.nombre\.localeCompare\(/)
  assert.match(s, /claves\.set\(p\.id, claveDeOrden\(p\)\)/)
  assert.match(s, /\.sort\(\(a, b\) => \(claves\.get\(a\.persona_id\)/)
})

test('Herramientas › movimientos (página): usa personasDelLibro, no un sort propio por el nombre', () => {
  const s = fuente('../../app/(main)/herramientas/movimientos/page.tsx')
  assert.match(s, /personas = personasDelLibro\(p\)/)
  assert.doesNotMatch(s, /personas = [^\n]*\.sort\(/)
})

test('Herramientas › datos: el parque lleva la clave de orden de los usuarios', () => {
  const s = fuente('../../features/herramientas/services/datos.ts')
  assert.match(s, /ordenDeUsuariosPlano\(supabase\)/)
  assert.match(s, /\n\s+ordenUsuarios,\n/)
  // Y cruza al cliente: `Marco` re-arma el parque del lado del navegador con `datosPlanos`.
  assert.match(fuente('../../features/herramientas/components/Marco.tsx'), /ordenUsuarios: p\.ordenUsuarios/)
})

// 29/09/2026: estas listas pedían `order('nombre_completo')` a la base y mostraban el nombre curado. El
// orden SQL del legajo no sigue a lo que se dibuja (Butierrez está cargado al revés), así que cada una
// reordena en memoria con `compararPorApellido`. Se lee la fuente porque viven detrás de Supabase.
for (const ruta of [
  '../../features/herramientas/services/datos.ts',
  '../../features/efectivo/services/datos.ts',
  '../../features/administracion/services/personasService.ts',
  '../../features/administracion/services/cuadrillasService.ts',
  '../../features/usuarios/services/usuariosService.ts',
  '../../features/empleado/services/empleadoService.ts',
]) {
  test(`orden en memoria por apellido: ${ruta.split('/').slice(-2).join('/')}`, () => {
    assert.match(fuente(ruta), /compararPorApellido/)
  })
}
