import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { entrar } from './util/obras-e2e'

// ═══ AUDITORÍA INDEPENDIENTE (18/09/2026) — LO QUE LA PRUEBA DEL CONSTRUCTOR NO MIRA ═══
//
// No lo escribió quien construyó el arreglo. Ataca cuatro preguntas que su spec no cubre:
//   1. varios pasos apilados sobre la MISMA celda: ¿Cmd+Z los recorre hacia atrás sin saltear?
//   2. REHACER (Cmd+Y) cuando la celda cambió ENTRE el deshacer y el rehacer: ¿pisa lo ajeno?
//   3. dos pestañas de la MISMA persona deshaciendo la misma celda: ¿la segunda pisa a la primera?
//   4. ¿el aviso de conflicto queda pegado o miente?
//
// LA EVIDENCIA ES DEL EFECTO: cada paso se comprueba LEYENDO LA BASE con la llave de servicio.
// Escribe sólo sobre un pedido `ZZ-AUD-E2E-*` que este archivo crea y borra.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const sb = (): SupabaseClient => createClient(URL, SRV, { auth: { persistSession: false } })

test.skip(process.env.E2E_ESCRIBE_EN_LA_BASE !== 'si', 'crea y borra un pedido de prueba: E2E_ESCRIBE_EN_LA_BASE=si')

const OBRA = 'le-galpon-9'
const OBRA_TEXTO = 'galpon 9'
const ID = `ZZ-AUD-E2E-${Date.now()}`
const MATERIAL = `ZZ-AUD auditoria deshacer/rehacer ${Date.now()}`
let X = ''
let Y = ''
let Z = ''

const leer = async () => {
  const { data, error } = await sb().from('pedidos_materiales')
    .select('actividad_id, estado, origen').eq('id_pedido', ID).maybeSingle()
  if (error) throw new Error(error.message)
  return data as { actividad_id: string | null; estado: string | null; origen: string | null } | null
}
const otraPersonaEscribe = async (actividad: string | null) => {
  const { error } = await sb().from('pedidos_materiales').update({ actividad_id: actividad }).eq('id_pedido', ID)
  if (error) throw new Error(error.message)
}
const limpiar = async () => { await sb().from('pedidos_materiales').delete().like('id_pedido', 'ZZ-AUD-E2E-%') }

test.beforeAll(async () => {
  await limpiar()
  const { data: acts, error } = await sb().from('obra_actividad')
    .select('id, nombre').eq('obra_id', OBRA).eq('archivada', false).is('actividad_padre_id', null)
    .neq('tipo', 'resumen').order('nombre').limit(3)
  if (error) throw new Error(error.message)
  if (!acts || acts.length < 3) throw new Error(`la obra ${OBRA} no tiene tres actividades elegibles`)
  ;[X, Y, Z] = acts.map((a) => a.id as string)
  const { error: e } = await sb().from('pedidos_materiales').insert({
    id_pedido: ID, obra_texto: OBRA_TEXTO, material: MATERIAL, cantidad: 1,
    estado: 'PENDIENTE', fecha: new Date().toISOString().slice(0, 10), origen: 'appsheet_sheet', actividad_id: null,
  })
  if (e) throw new Error(e.message)
})
test.afterAll(limpiar)

const selectDe = (page: Page) => page.getByRole('row').filter({ hasText: MATERIAL }).getByTestId('pedido-actividad')

async function elegir(page: Page, valor: string) {
  await selectDe(page).selectOption(valor)
  await expect(selectDe(page)).toBeEnabled({ timeout: 30_000 })
}
async function abrir(page: Page) {
  await entrar(page)
  await page.goto('/integraciones/pedidos-materiales')
  await expect(page.getByTestId('tabla-pedidos')).toBeVisible({ timeout: 30_000 })
  await expect(selectDe(page)).toBeVisible({ timeout: 30_000 })
}
const enBase = async () => (await leer())?.actividad_id ?? null

test('1. tres pasos sobre la misma celda: Cmd+Z los recorre hacia atrás, y el último (hacia vacío) se rechaza', async ({ browser }) => {
  test.slow()
  const ctx = await browser.newContext()
  const A = await ctx.newPage()
  try {
    await otraPersonaEscribe(null)
    await abrir(A)
    await expect(selectDe(A)).toHaveValue('')
    await elegir(A, X)
    await expect.poll(enBase, { timeout: 20_000 }).toBe(X)
    await elegir(A, Y)
    await expect.poll(enBase, { timeout: 20_000 }).toBe(Y)
    await elegir(A, Z)
    await expect.poll(enBase, { timeout: 20_000 }).toBe(Z)

    await A.keyboard.press('Control+z')
    await expect(A.getByTestId('aviso-deshacer')).toContainText('Deshecho', { timeout: 20_000 })
    await expect.poll(enBase, { timeout: 20_000 }).toBe(Y)

    await A.keyboard.press('Control+z')
    await expect(A.getByTestId('aviso-deshacer')).toContainText('Deshecho', { timeout: 20_000 })
    await expect.poll(enBase, { timeout: 20_000 }).toBe(X)

    // El primer paso vuelve hacia «sin asignar»: la regla de la casa dice que no se escribe NULL.
    await A.keyboard.press('Control+z')
    await expect(A.getByTestId('aviso-deshacer')).toContainText('no había un valor anterior que restaurar', { timeout: 20_000 })
    await A.waitForTimeout(1500)
    expect(await enBase(), 'no se vació la celda').toBe(X)
  } finally { await ctx.close() }
})

test('2. REHACER con la celda cambiada en el medio: no pisa lo que cargó la otra persona', async ({ browser }) => {
  test.slow()
  const ctx = await browser.newContext()
  const A = await ctx.newPage()
  try {
    await otraPersonaEscribe(X)
    await abrir(A)
    await expect(selectDe(A)).toHaveValue(X)
    await elegir(A, Y)
    await expect.poll(enBase, { timeout: 20_000 }).toBe(Y)

    // Deshacer: vuelve a X.
    await A.keyboard.press('Control+z')
    await expect(A.getByTestId('aviso-deshacer')).toContainText('Deshecho', { timeout: 20_000 })
    await expect.poll(enBase, { timeout: 20_000 }).toBe(X)

    // OTRA PERSONA carga Z entre el deshacer y el rehacer.
    await otraPersonaEscribe(Z)
    expect(await enBase()).toBe(Z)

    // Rehacer: el paso apilado quiere volver a escribir Y sobre lo que ahora es Z.
    await A.keyboard.press('Control+y')
    await A.waitForTimeout(3000)
    expect(await enBase(), 'REHACER pisó la actividad que cargó otra persona').toBe(Z)
  } finally { await ctx.close() }
})

test('3. dos pestañas de la MISMA persona: la que deshace con un esperado viejo recibe conflicto', async ({ browser }) => {
  test.slow()
  const ctx = await browser.newContext()
  const P1 = await ctx.newPage()
  const P2 = await ctx.newPage()
  try {
    await otraPersonaEscribe(X)
    await abrir(P1)
    await abrir(P2)
    await expect(selectDe(P1)).toHaveValue(X)

    await elegir(P1, Y)
    await expect.poll(enBase, { timeout: 20_000 }).toBe(Y)
    await expect(selectDe(P2)).toHaveValue(Y, { timeout: 45_000 })

    // La otra pestaña, la MISMA persona, mueve la celda a Z.
    await elegir(P2, Z)
    await expect.poll(enBase, { timeout: 20_000 }).toBe(Z)

    // P1 deshace con `esperado = Y`: ya no es Y.
    await P1.keyboard.press('Control+z')
    await expect(P1.getByTestId('aviso-deshacer')).toContainText('la celda la cambió otra persona', { timeout: 20_000 })
    await P1.waitForTimeout(1500)
    expect(await enBase(), 'la pestaña atrasada pisó lo que escribió la otra').toBe(Z)

    // 4. EL AVISO NO QUEDA PEGADO: a los 4 s se va solo.
    await expect(P1.getByTestId('aviso-deshacer')).toBeHidden({ timeout: 10_000 })
  } finally { await ctx.close() }
})
