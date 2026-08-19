import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { MARCA } from './util/obras-e2e'

// PERMISOS DE CONTROL DE OBRA — MEDIDOS CONTRA POSTGREST CON TOKENS REALES.
//
// ═══ POR QUÉ NO SE MIDE EN LA PANTALLA ═══
//
// Una pantalla vacía puede estar vacía por tres razones y sólo una es seguridad. Acá se pide el dato
// directo a la API con el token de cada rol: lo que devuelve la base es lo que hay, sin React en el
// medio. Es la misma forma que usa `administracion-personas-proveedores.spec.ts`.
//
// ═══ EL CORTE ES ECONÓMICO, NO POR OBRA ═══
//
// El dueño (19/08/2026): *"si dice jefe de obra en el permiso de usuario, pueda ver todas las obras"*
// · *"y editar"* · *"administración tiene acceso a todo lo relacionado a económico… jefes de obra
// puede acceder a todo lo demás"*. Estos tests miden las dos mitades de esa frase: que lo operativo
// esté abierto de par en par, y que lo económico siga cerrado.
//
// NO ESCRIBE SOBRE DATOS REALES. Ya pasó en esta sesión: una prueba de escritura pisó el comentario
// de una actividad de San Francisco. Todo lo que escribe lleva `ZZ-E2E` y se borra.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const admin = (): SupabaseClient => createClient(URL, SRV, { auth: { persistSession: false } })

async function comoJefe(): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({
    email: 'qa.jefe.obra@ecsas.com.ar', password: 'TestJefe123!',
  })
  expect(error, error?.message).toBeNull()
  return c
}

const OBRA = 'messina'
const NOMBRE = `${MARCA} permisos`

async function limpiar() {
  const c = admin()
  const { data } = await c.from('obra_actividad').select('id').ilike('nombre', `%${MARCA} permisos%`)
  const ids = (data ?? []).map((a) => (a as { id: string }).id)
  if (ids.length) {
    await c.from('obra_ejecucion').delete().in('actividad_id', ids)
    await c.from('obra_actividad').delete().in('id', ids)
  }
}

test.beforeAll(limpiar)
test.afterAll(limpiar)

test('el jefe de obra ve TODAS las obras, no sólo las que alguien le vinculó', async () => {
  const jefe = await comoJefe()
  const { count: suyas } = await jefe.from('obra_canonica').select('id', { count: 'exact', head: true })
  const { count: todas } = await admin().from('obra_canonica').select('id', { count: 'exact', head: true })
  expect(suyas).toBe(todas)

  const { count: acts } = await jefe.from('obra_actividad_control').select('actividad_id', { count: 'exact', head: true })
  const { count: actsTodas } = await admin().from('obra_actividad_control').select('actividad_id', { count: 'exact', head: true })
  expect(acts).toBe(actsTodas)
})

test('y puede planificar y ejecutar: crea la actividad, la mide y carga el parte', async () => {
  const jefe = await comoJefe()
  const { data: creada, error: eAlta } = await jefe.from('obra_actividad').insert({
    obra_id: OBRA, nombre: NOMBRE, tipo: 'tarea', orden: 9500,
    clave: `zz-e2e/${MARCA.toLowerCase()}-permisos`, fuente: 'web', creada_en_web: true,
    unidad: 'm³', cantidad_objetivo: 100, metodo_avance: 'cantidad', estado: 'en_curso',
  }).select('id').single()
  expect(eAlta, eAlta?.message).toBeNull()
  const id = (creada as { id: string }).id

  const { error: eParte } = await jefe.from('obra_ejecucion')
    .insert({ obra_id: OBRA, actividad_id: id, fecha: new Date().toISOString().slice(0, 10), cantidad: 25 })
  expect(eParte, eParte?.message).toBeNull()

  const { data } = await jefe.from('obra_actividad_control')
    .select('avance_pct, origen_avance').eq('actividad_id', id).single()
  expect(Number((data as { avance_pct: number }).avance_pct)).toBe(25)
})

test('PERO LO ECONÓMICO SIGUE CERRADO: ni el monto de la obra ni la retribución de nadie', async () => {
  const jefe = await comoJefe()

  // 42501 es «permission denied»: el grant de columna no existe, así que el dato ni siquiera sale de
  // la base. No es un filtro de React que alguien pueda saltear con una llamada directa.
  const monto = await jefe.from('obra_canonica').select('id, monto_contratado')
  expect(monto.error?.code, 'el jefe llegó al monto contratado').toBe('42501')

  const sueldo = await jefe.from('personas').select('id, retribucion_pactada')
  expect(sueldo.error?.code, 'el jefe llegó a la retribución pactada').toBe('42501')

  // `persona_legajo` corre como su dueño y lleva el portero adentro: para el jefe devuelve VACÍO, no
  // error. Cero filas de una vista que sí existe es exactamente el diseño.
  const legajo = await jefe.from('persona_legajo').select('id, dni, cuil')
  expect(legajo.error).toBeNull()
  expect(legajo.data).toHaveLength(0)
})

test('lo operativo del personal sí lo ve: el plantel para poder asignar, sin un dato sensible', async () => {
  const jefe = await comoJefe()
  const { data, error } = await jefe.from('persona_plantel').select('*').limit(1)
  expect(error).toBeNull()
  expect(data!.length).toBeGreaterThan(0)
  // Cinco columnas y ninguna más: el contrato lo fija `vistas-security-invoker.test.mjs`.
  expect(Object.keys(data![0]).sort()).toEqual(
    ['categoria', 'especialidad', 'fecha_egreso', 'id', 'nombre_completo'])
})
