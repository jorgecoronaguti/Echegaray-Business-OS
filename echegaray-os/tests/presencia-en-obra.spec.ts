// «EN OBRA AHORA» — quién está, desde qué hora, y dónde arrancó el día.
//
// Dos mitades: que la pantalla muestre lo que pasó de verdad, y que sólo la vea quien corresponde.
// La segunda se mide con identidades reales leyendo el efecto en Postgres, no mirando la pantalla:
// esconder una fila no es un permiso.

import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CAMPO, JEFE, ADMIN, entrar, pedir, servicio } from './util/identidades'
import { entrarComo } from './util/login'
import { montar, limpiar, type Escenario } from './util/empleado'

let admin: SupabaseClient
let esc: Escenario

const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  admin = servicio()
  esc = await montar(admin)
  // El escenario: YO entré hace tres horas con ubicación; el COMPAÑERO entró y ya se fue, sin ella.
  const hace3h = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
  await admin.from('asistencia_marca').insert([
    {
      persona_id: esc.yo, fecha: hoy(), tipo: 'entrada', momento: hace3h, obra_id: esc.obra,
      lat: -31.537, lon: -68.526, precision_m: 12, origen: 'empleado_web',
    },
    {
      persona_id: esc.companero, fecha: hoy(), tipo: 'entrada', obra_id: esc.obra,
      momento: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), origen: 'empleado_web',
    },
    {
      persona_id: esc.companero, fecha: hoy(), tipo: 'salida', obra_id: esc.obra,
      momento: new Date(Date.now() - 30 * 60 * 1000).toISOString(), origen: 'empleado_web',
    },
  ])
})

test.afterAll(async () => { await limpiar(admin) })

// ── LO QUE MUESTRA ─────────────────────────────────────────────────────────────────────────────

test('el jefe de obra ve quién está, desde qué hora y con el reloj corriendo', async ({ page }) => {
  await entrarComo(page, JEFE.email, JEFE.password)
  await page.goto('/administracion/personas/en-obra')

  const activo = page.getByTestId('fila-presencia').filter({ hasText: 'ZZ-EMPLEADO Yo' })
  await expect(activo).toHaveAttribute('data-estado', 'activo')
  await expect(activo.getByTestId('punto-activo')).toBeVisible()

  // EL RELOJ CORRE DESDE LA ENTRADA: tres horas son 180 minutos, con el margen del tiempo del test.
  //
  // Se ESPERA a que tenga valor. El reloj arranca vacío a propósito —la hora no se calcula en el
  // render, ver `RelojDeJornada`— y la pone el efecto al montar. Leer el atributo de una sola vez
  // agarraba el guión y `Number('')` es 0: el test fallaba sin que el reloj tuviera nada malo.
  await expect.poll(
    async () => Number(await activo.getByTestId('reloj-jornada').getAttribute('data-minutos') || 0),
    { timeout: 15000 },
  ).toBeGreaterThanOrEqual(179)
  const minutos = Number(await activo.getByTestId('reloj-jornada').getAttribute('data-minutos'))
  expect(minutos).toBeLessThan(190)

  // Y el que ya se fue no está entre los activos.
  await expect(page.getByTestId('bloque-cerradas')).toContainText('ZZ-EMPLEADO Companero')
})

test('LA UBICACIÓN QUE HAY SE MUESTRA, Y LA QUE NO HAY SE DICE — nunca se inventa', async ({ page }) => {
  await entrarComo(page, JEFE.email, JEFE.password)
  await page.goto('/administracion/personas/en-obra')

  const conPunto = page.getByTestId('fila-presencia').filter({ hasText: 'ZZ-EMPLEADO Yo' })
  const enlace = conPunto.getByTestId('ubicacion-marca')
  await expect(enlace).toHaveAttribute('href', 'https://www.google.com/maps?q=-31.537,-68.526')
  await expect(enlace).toContainText('±12 m')

  // El compañero marcó sin coordenada: la fila lo dice con esas palabras y NO usa la de la obra.
  const sinPunto = page.getByTestId('fila-presencia').filter({ hasText: 'ZZ-EMPLEADO Companero' })
  await expect(sinPunto.getByTestId('sin-ubicacion')).toContainText('sin ubicación')
})

test('«sin registrar» NO se llama ausente, y lo dice la pantalla', async ({ page }) => {
  // Es la diferencia entre un dato que falta y una falta. Convertir la ignorancia en una ausencia
  // sería fabricar una novedad de liquidación con cara de dato.
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/administracion/personas/en-obra')
  const bloque = page.getByTestId('bloque-sin-registrar')
  if (await bloque.count()) {
    await expect(bloque).toContainText('No es una lista de ausentes')
    await expect(bloque).not.toContainText('Ausente')
  }
})

// ── DE DÓNDE SALE EL PUNTO: DEL TELÉFONO DEL QUE MARCA ─────────────────────────────────────────

test.describe('con el GPS permitido', () => {
  test.use({ permissions: ['geolocation'], geolocation: { latitude: -31.5375, longitude: -68.5364 } })

  test('LA ENTRADA GUARDA DÓNDE SE MARCÓ, y llega hasta la pantalla del jefe', async ({ page }) => {
    // Es el pedido entero en un test: el operario ficha desde el teléfono y el jefe ve el punto.
    await admin.from('asistencia_marca').delete().eq('persona_id', esc.yo).eq('fecha', hoy())

    await entrarComo(page, CAMPO.email, CAMPO.password)
    await page.goto('/hoy')
    await page.getByTestId('registrar-marca').click()

    await expect.poll(async () => {
      const { data } = await admin.from('asistencia_marca')
        .select('tipo, lat, lon, precision_m').eq('persona_id', esc.yo).eq('fecha', hoy())
      return data ?? []
    }, { timeout: 20000 }).toMatchObject([{ tipo: 'entrada' }])

    const { data } = await admin.from('asistencia_marca')
      .select('lat, lon, precision_m').eq('persona_id', esc.yo).eq('tipo', 'entrada').single()
    expect(Number(data!.lat), 'no se guardó la latitud').toBeCloseTo(-31.5375, 3)
    expect(Number(data!.lon), 'no se guardó la longitud').toBeCloseTo(-68.5364, 3)
  })
})

test('SIN PERMISO DE UBICACIÓN LA ENTRADA SE REGISTRA IGUAL', async ({ page }) => {
  // El modo de fallar que no se admite: un operario que no puede fichar porque el navegador no lo
  // ubica. Sin permiso, `getCurrentPosition` llama al callback de error y la marca sale sin punto.
  await admin.from('asistencia_marca').delete().eq('persona_id', esc.yo).eq('fecha', hoy())
  await entrarComo(page, CAMPO.email, CAMPO.password)
  await page.goto('/hoy')
  await page.getByTestId('registrar-marca').click()

  await expect.poll(async () => {
    const { data } = await admin.from('asistencia_marca')
      .select('tipo, lat').eq('persona_id', esc.yo).eq('fecha', hoy())
    return (data ?? []).map((x) => x.tipo)
  }, { timeout: 20000 }).toEqual(['entrada'])

  const { data } = await admin.from('asistencia_marca')
    .select('lat, lon').eq('persona_id', esc.yo).eq('tipo', 'entrada').single()
  expect(data!.lat, 'se inventó una ubicación que el teléfono no dio').toBeNull()
})

// ── QUIÉN LA VE ────────────────────────────────────────────────────────────────────────────────

test('EL NIVEL CAMPO NO ENTRA — ni por la pantalla ni por la base', async ({ page }) => {
  await entrarComo(page, CAMPO.email, CAMPO.password)
  await page.goto('/administracion/personas/en-obra')
  // El middleware lo devuelve a lo suyo: `/administracion` no está en sus rutas.
  await expect(page).not.toHaveURL(/en-obra/)

  // Y la cerradura, que es la que importa: por PostgREST ve SU fila y ninguna otra.
  const token = await entrar(CAMPO.email, CAMPO.password)
  const r = await pedir(token, 'presencia_del_dia?select=persona_id,nombre_completo,lat')
  expect(r.status).toBe(200)
  const ajenas = (r.filas as { persona_id: string }[]).filter((f) => f.persona_id !== esc.yo)
  expect(ajenas, 'el nivel campo leyó la presencia de un tercero').toEqual([])
})

test('el jefe de obra y Dirección SÍ ven a todos, y por la base', async () => {
  for (const quien of [JEFE, ADMIN]) {
    const token = await entrar(quien.email, quien.password)
    const r = await pedir(token, `presencia_del_dia?select=persona_id,lat,precision_m&fecha=eq.${hoy()}`)
    const ids = (r.filas as { persona_id: string }[]).map((f) => f.persona_id)
    expect(ids, `${quien.email} no ve a los dos`).toEqual(expect.arrayContaining([esc.yo, esc.companero]))
  }
})

test('un anónimo no ve una sola marca', async () => {
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/presencia_del_dia?select=*`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string },
  })
  expect([401, 403]).toContain(r.status)
})
