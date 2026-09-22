// EL EFECTIVO EN LA MANO DE OTRO NO SE LEE — medido contra PostgREST, no contra la pantalla.
//
// ═══ QUÉ SE ROMPIÓ Y POR QUÉ ESTE SPEC EXISTE (22/09/2026) ═══
//
// La 20260922T1500 abrió `efectivo_entrega` a `es_administracion()`, que desde el 19/08 incluye al
// Jefe de obra. La pantalla «Mi efectivo» del nivel Obras filtraba por persona en la CONSULTA, así
// que ninguna prueba de pantalla lo habría visto: PostgREST le devolvía a un jefe de obra las
// entregas de todas las personas de la empresa, con nombre y saldo. Lo cerró `20260922T2700`.
//
// Un control no se valida contra la información que produce: acá no se abre un navegador. Se pide con
// el token del jefe, que es por donde entra el que quiere mirar.
//
// ═══ LAS DOS MITADES, SIEMPRE JUNTAS ═══
//
// Cerrar de más ya mordió hoy (la 2100: un `join personas` escondía la entrega PROPIA de quien la
// miraba). Por eso este archivo mide las dos cosas en la misma corrida: que el jefe NO vea lo ajeno,
// y que el dueño de una entrega SIGA viendo la suya.

import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ADMIN, CAMPO, JEFE, entrar, pedir, servicio } from './util/identidades'

/** Las tablas y vistas del módulo que hablan de la plata de una persona. */
const LECTURAS = [
  'efectivo_entrega?select=id,codigo,persona_id',
  'efectivo_entrega_saldo?select=id,codigo,persona_id',
  'efectivo_devolucion?select=id,entrega_id',
  'efectivo_rendicion?select=id,entrega_id',
  'efectivo_comprobante?select=id,entrega_id',
  'efectivo_comprobante_estado?select=id,persona_id',
]

let admin: SupabaseClient
let jefe: string
let campo: string
let direccion: string

test.beforeAll(async () => {
  admin = servicio()
  jefe = await entrar(JEFE.email, JEFE.password)
  campo = await entrar(CAMPO.email, CAMPO.password)
  direccion = await entrar(ADMIN.email, ADMIN.password)
})

test('Dirección sigue viendo todas las entregas, y hay más de una para que esto mida algo', async () => {
  const todas = await pedir(direccion, 'efectivo_entrega?select=id,codigo,persona_id')
  expect(todas.status, 'la migración 20260922T1500 tiene que estar aplicada').toBe(200)
  expect(todas.filas.length, 'sin entregas en la base este spec pasaría por vacío').toBeGreaterThan(0)
  // El techo, contra el que se comparan las otras identidades: lo que hay de verdad.
  const { count } = await admin.from('efectivo_entrega').select('id', { count: 'exact', head: true })
  expect(todas.filas.length, 'Dirección tiene que ver TODAS las filas de la tabla').toBe(count)
})

test('el jefe de obra NO lee una sola entrega que no sea suya', async () => {
  const { data: perfil } = await admin.from('perfiles').select('rol, persona_id')
    .eq('rol', 'jefe_obra').eq('es_prueba', true).limit(1).maybeSingle()
  expect(perfil?.rol, 'la identidad JEFE tiene que seguir siendo jefe_obra').toBe('jefe_obra')
  const mia = perfil?.persona_id ?? null

  for (const consulta of LECTURAS) {
    const r = await pedir(jefe, consulta)
    expect(r.status, `${consulta} no respondió`).toBe(200)
    for (const fila of r.filas as { persona_id?: string; entrega_id?: string }[]) {
      // Lo único que puede salir es lo propio: su persona, o una entrega que él mismo entregó.
      if (fila.persona_id !== undefined) {
        expect(fila.persona_id, `${consulta} devolvió la plata de otra persona`).toBe(mia)
      } else {
        const { data } = await admin.from('efectivo_entrega')
          .select('persona_id, entregada_por').eq('id', fila.entrega_id!).maybeSingle()
        const propia = data?.persona_id === mia
        expect(propia, `${consulta} devolvió una derivada de una entrega ajena`).toBe(true)
      }
    }
  }
})

test('la persona SIGUE viendo su propia entrega — la trampa de cerrar de más', async () => {
  const { data: perfil } = await admin.from('perfiles').select('persona_id').eq('es_prueba', true)
    .eq('rol', 'campo').limit(1).maybeSingle()
  const mia = perfil?.persona_id
  expect(mia, 'la identidad CAMPO tiene que estar vinculada a una persona').toBeTruthy()
  const { data: suyas } = await admin.from('efectivo_entrega').select('id').eq('persona_id', mia!)
  test.skip(!suyas?.length, 'la persona de prueba no tiene ninguna entrega: no hay nada que medir')

  const r = await pedir(campo, 'efectivo_entrega?select=id,persona_id')
  expect(r.status).toBe(200)
  expect(r.filas.length, 'la persona tiene que ver TODAS sus entregas, ni una menos')
    .toBe(suyas!.length)
  for (const f of r.filas as { persona_id: string }[]) expect(f.persona_id).toBe(mia)
})
