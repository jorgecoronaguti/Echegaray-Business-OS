import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { entrar } from './util/obras-e2e'

// ═══ DESHACER NO VACÍA LA CELDA QUE CARGÓ OTRA PERSONA — la prueba del efecto, con dos sesiones ═══
//
// Rechazado por el auditor independiente (18/09/2026): en Pedidos de Materiales, otra persona asignaba la
// actividad X, el refresco en vivo llegaba pero el select seguía en «sin asignar», esta persona elegía Y y
// Cmd+Z escribía `actividad_id = NULL` sobre la X ajena. Regla de la casa: ninguna escritura puede vaciar
// una celda cargada por otra persona.
//
// LA EVIDENCIA ES DEL EFECTO: cada paso se comprueba LEYENDO LA BASE con la llave de servicio, no mirando
// la pantalla que dijo que sí. Dos contextos de navegador = dos sesiones (A y B).
//
// ESCRIBE EN LA BASE: sólo sobre UN pedido que este archivo crea con marca `ZZ-E2E-DESHACER` y borra al
// final. La actividad a la que apunta durante segundos es real (de «LE Galpón 9»): es un puntero en la fila
// de prueba, no un cambio en la actividad. Por eso exige `E2E_ESCRIBE_EN_LA_BASE=si`.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const sb = (): SupabaseClient => createClient(URL, SRV, { auth: { persistSession: false } })

const ESCRIBE = process.env.E2E_ESCRIBE_EN_LA_BASE === 'si'
test.skip(!ESCRIBE, 'crea y borra un pedido de prueba en la base viva: correlo a mano con E2E_ESCRIBE_EN_LA_BASE=si')

const OBRA = 'le-galpon-9'
/** Texto que el puente de alias resuelve a `le-galpon-9` (obra_alias «galpon 9»). */
const OBRA_TEXTO = 'galpon 9'
const ID_PEDIDO = `ZZ-E2E-DESHACER-${Date.now()}`
const MATERIAL = `ZZ-E2E deshacer no borra lo ajeno ${Date.now()}`

let X = ''
let Y = ''

async function leerPedido() {
  const { data, error } = await sb().from('pedidos_materiales')
    .select('actividad_id, estado, origen').eq('id_pedido', ID_PEDIDO).maybeSingle()
  if (error) throw new Error(error.message)
  return data as { actividad_id: string | null; estado: string | null; origen: string | null } | null
}

async function limpiar() {
  await sb().from('pedidos_materiales').delete().like('id_pedido', 'ZZ-E2E-DESHACER-%')
}

test.beforeAll(async () => {
  await limpiar()
  const { data: acts, error } = await sb().from('obra_actividad')
    .select('id, nombre').eq('obra_id', OBRA).eq('archivada', false).is('actividad_padre_id', null)
    .neq('tipo', 'resumen').order('nombre').limit(2)
  if (error) throw new Error(error.message)
  if (!acts || acts.length < 2) throw new Error(`la obra ${OBRA} no tiene dos actividades elegibles`)
  X = acts[0].id as string
  Y = acts[1].id as string
  const { error: eIns } = await sb().from('pedidos_materiales').insert({
    id_pedido: ID_PEDIDO, obra_texto: OBRA_TEXTO, material: MATERIAL, cantidad: 1,
    estado: 'PENDIENTE', fecha: new Date().toISOString().slice(0, 10), origen: 'appsheet_sheet', actividad_id: null,
  })
  if (eIns) throw new Error(eIns.message)
})

test.afterAll(limpiar)

/** El select de actividad de la fila de prueba, en una página. */
function selectDe(page: Page) {
  return page.getByRole('row').filter({ hasText: MATERIAL }).getByTestId('pedido-actividad')
}

/**
 * ELEGIR Y ESPERAR A QUE EL PASO ESTÉ APILADO.
 *
 * El `select` se deshabilita mientras guarda, así que volver a estar habilitado es la señal de que la acción
 * RESOLVIÓ en el cliente — que es cuando se apila el paso del deshacer. Sin esta espera el test teclea Cmd+Z
 * con la pila todavía vacía: la base ya tiene el valor nuevo (el `update` llegó) pero la promesa del server
 * action no volvió. Con la pila vacía el proveedor no pinta nada, a propósito, y el test leía esa ausencia
 * como un defecto que no existe.
 */
async function elegir(page: Page, valor: string) {
  await selectDe(page).selectOption(valor)
  await expect(selectDe(page)).toBeEnabled({ timeout: 30_000 })
}

async function abrirPedidos(page: Page) {
  await entrar(page)
  await page.goto('/integraciones/pedidos-materiales')
  await expect(page.getByTestId('tabla-pedidos')).toBeVisible({ timeout: 30_000 })
  await expect(selectDe(page)).toBeVisible({ timeout: 30_000 })
}

test('caso 1 del auditor: B asigna X, A elige Y y deshace → la base vuelve a X, nunca a NULL', async ({ browser }) => {
  test.slow()
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const A = await ctxA.newPage()
  const B = await ctxB.newPage()
  try {
    await abrirPedidos(A)
    await abrirPedidos(B)
    await expect(selectDe(A)).toHaveValue('')
    expect((await leerPedido())?.actividad_id, 'antes: sin asignar').toBeNull()

    // ═══ OTRA PERSONA (B) CARGA X ═══
    await elegir(B, X)
    await expect.poll(async () => (await leerPedido())?.actividad_id, { timeout: 20_000 }).toBe(X)

    // ═══ EL REFRESCO EN VIVO LLEGA A A Y EL SELECT LO ADOPTA (antes se quedaba en '') ═══
    await expect(selectDe(A), 'A no adoptó lo que cargó B: el anterior que apilaría sería falso')
      .toHaveValue(X, { timeout: 45_000 })

    // ═══ A ELIGE Y ═══
    await elegir(A, Y)
    await expect.poll(async () => (await leerPedido())?.actividad_id, { timeout: 20_000 }).toBe(Y)

    // ═══ A DESHACE SIN CLICAR AFUERA (el foco sigue en el select) ═══
    await A.keyboard.press('Control+z')
    await expect(A.getByTestId('aviso-deshacer')).toContainText('Deshecho', { timeout: 20_000 })

    // LA EVIDENCIA: la base tiene X —lo de B—, no NULL.
    await expect.poll(async () => (await leerPedido())?.actividad_id, { timeout: 20_000 }).toBe(X)
    const despues = await leerPedido()
    expect(despues?.actividad_id, 'después de Cmd+Z: la celda de B sigue cargada').toBe(X)
  } finally {
    await ctxA.close()
    await ctxB.close()
  }
})

test('(a) con anterior vacío no se escribe NULL: «no había un valor anterior que restaurar»', async ({ browser }) => {
  test.slow()
  const ctxA = await browser.newContext()
  const A = await ctxA.newPage()
  try {
    // Punto de partida: sin asignar (por la base, no por la pantalla).
    await sb().from('pedidos_materiales').update({ actividad_id: null }).eq('id_pedido', ID_PEDIDO)
    await abrirPedidos(A)
    await expect(selectDe(A)).toHaveValue('')

    await elegir(A, X)
    await expect.poll(async () => (await leerPedido())?.actividad_id, { timeout: 20_000 }).toBe(X)

    await A.keyboard.press('Control+z')
    await expect(A.getByTestId('aviso-deshacer')).toContainText('no había un valor anterior que restaurar', { timeout: 20_000 })
    // Nada se escribió: la base sigue en X, la pantalla también.
    await A.waitForTimeout(1500)
    expect((await leerPedido())?.actividad_id).toBe(X)
    await expect(selectDe(A)).toHaveValue(X)
  } finally {
    await ctxA.close()
  }
})

test('(b) si otra persona cambió la celda después de mi edición, deshacer se rechaza y lo dice', async ({ browser }) => {
  test.slow()
  const ctxA = await browser.newContext()
  const A = await ctxA.newPage()
  try {
    await sb().from('pedidos_materiales').update({ actividad_id: X }).eq('id_pedido', ID_PEDIDO)
    await abrirPedidos(A)
    await expect(selectDe(A)).toHaveValue(X)

    // A: X → Y.
    await elegir(A, Y)
    await expect.poll(async () => (await leerPedido())?.actividad_id, { timeout: 20_000 }).toBe(Y)

    // OTRA PERSONA (por la base, como lo haría el teléfono): Y → sin asignar.
    await sb().from('pedidos_materiales').update({ actividad_id: null }).eq('id_pedido', ID_PEDIDO)
    expect((await leerPedido())?.actividad_id).toBeNull()

    // A deshace: la pantalla o el servidor —según llegue o no el refresco— ven que ya no está Y.
    await A.keyboard.press('Control+z')
    await expect(A.getByTestId('aviso-deshacer')).toContainText('la celda la cambió otra persona: no se deshizo', { timeout: 20_000 })
    await A.waitForTimeout(1500)
    expect((await leerPedido())?.actividad_id, 'no se pisó lo que puso la otra persona').toBeNull()
  } finally {
    await ctxA.close()
  }
})

test('(d) deshacer el estado devuelve también el origen: el pedido del AppSheet no queda «del OS»', async ({ browser }) => {
  test.slow()
  const ctxA = await browser.newContext()
  const A = await ctxA.newPage()
  try {
    await sb().from('pedidos_materiales').update({ estado: 'PENDIENTE', origen: 'appsheet_sheet' }).eq('id_pedido', ID_PEDIDO)
    await abrirPedidos(A)
    const estado = A.getByRole('row').filter({ hasText: MATERIAL }).getByTestId('cambiar-estado')
    await estado.selectOption('PEDIDO')
    await expect(estado).toBeEnabled({ timeout: 30_000 })
    await expect.poll(async () => (await leerPedido())?.estado, { timeout: 20_000 }).toBe('PEDIDO')
    expect((await leerPedido())?.origen, 'la ida marca origen os').toBe('os')

    await A.keyboard.press('Control+z')
    await expect(A.getByTestId('aviso-deshacer')).toContainText('Deshecho', { timeout: 20_000 })
    await expect.poll(async () => (await leerPedido())?.estado, { timeout: 20_000 }).toBe('PENDIENTE')
    expect((await leerPedido())?.origen, 'la vuelta devuelve el origen').toBe('appsheet_sheet')
  } finally {
    await ctxA.close()
  }
})
