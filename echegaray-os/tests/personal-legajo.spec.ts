import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { entrar } from './util/obras-e2e'

// MÓDULO 03 · PERSONAL — EL LEGAJO QUE VINO DEL DATA ROOM.
//
// ═══ QUÉ PRUEBA ═══
//
// Que lo que se volcó de la carpeta de Drive SE VE y SE PUEDE ABRIR: la persona, sus papeles con el
// enlace al archivo real, y la línea que dice qué le falta. Y que el plantel es exactamente la
// nómina vigente — que era el defecto: el módulo ofrecía para asignar a 19 personas que ya no
// trabajan acá y no conocía a 7 que sí.
//
// NO ESCRIBE NADA. No hace falta: el circuito de escritura ya lo cubre `personal-hh.spec.ts`, y lo
// que hay que verificar acá es una lectura sobre datos reales de producción.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const sb = (): SupabaseClient => createClient(URL, SRV, { auth: { persistSession: false } })

test('1 · el plantel de la pantalla es el mismo que el de la base, y no incluye a quien se fue', async ({ page }) => {
  const cliente = sb()
  const { count: enLaEmpresa } = await cliente
    .from('personas').select('id', { count: 'exact', head: true }).eq('en_la_empresa', true)
  const { count: fuera } = await cliente
    .from('personas').select('id', { count: 'exact', head: true }).eq('en_la_empresa', false)
  expect(enLaEmpresa, 'sin plantel no hay nada que medir').toBeGreaterThan(0)
  expect(fuera, 'sin legajos cerrados el filtro Inactivos no prueba nada').toBeGreaterThan(0)

  await entrar(page)
  await page.goto('/administracion/personas')
  await expect(page.getByTestId('tabla-personas')).toBeVisible()
  await expect(page.getByTestId('fila-persona')).toHaveCount(enLaEmpresa as number)

  await page.getByTestId('filtro-inactivos').click()
  await expect(page.getByTestId('fila-persona')).toHaveCount(fuera as number)
})

test('2 · el legajo muestra sus papeles del data room y cada uno se abre en Drive', async ({ page }) => {
  // La persona con MÁS papeles vinculados: es la que prueba que el volcado llegó entero.
  const { data: docs } = await sb().from('documentacion_legajo').select('persona_id')
  const porPersona = new Map<string, number>()
  for (const d of docs ?? []) porPersona.set(d.persona_id, (porPersona.get(d.persona_id) ?? 0) + 1)
  const [personaId, cuantos] = [...porPersona.entries()].sort((a, b) => b[1] - a[1])[0]
  expect(cuantos).toBeGreaterThan(2)

  await entrar(page)
  await page.goto(`/administracion/personas/${personaId}?v=documentos`)
  await expect(page.getByTestId('bloque-documentos')).toBeVisible()
  await expect(page.getByTestId('fila-documento')).toHaveCount(cuantos)

  // CADA PAPEL SE ABRE. Un vínculo que no apunta a Drive es una fila que dice tener el documento
  // sin poder mostrarlo, que es lo que este módulo dejó de hacer.
  const enlaces = await page.getByTestId('abrir-documento').all()
  expect(enlaces.length).toBe(cuantos)
  for (const a of enlaces) {
    expect(await a.getAttribute('href')).toMatch(/^https:\/\/drive\.google\.com\/file\/d\/[\w-]+\/view$/)
  }
})

test('3 · la ficha dice qué falta, y no se lo pide a quien ya no está', async ({ page }) => {
  const cliente = sb()
  const { data: activa } = await cliente
    .from('personas').select('id').eq('en_la_empresa', true).not('drive_folder_id', 'is', null).limit(1).single()
  const { data: cerrada } = await cliente
    .from('personas').select('id').eq('en_la_empresa', false).limit(1).single()

  await entrar(page)
  await page.goto(`/administracion/personas/${activa!.id}?v=documentos`)
  const faltaActiva = page.getByTestId('falta-en-el-legajo')
  await expect(faltaActiva).toBeVisible()
  await expect(faltaActiva).toContainText(/Falta|El legajo está completo/)
  // La carpeta entera del legajo se abre desde acá: es el vínculo al data room, no una copia.
  await expect(page.getByTestId('abrir-carpeta'))
    .toHaveAttribute('href', /^https:\/\/drive\.google\.com\/drive\/folders\/[\w-]+$/)

  await page.goto(`/administracion/personas/${cerrada!.id}?v=documentos`)
  await expect(page.getByTestId('falta-en-el-legajo')).toContainText('Legajo cerrado')
})
