import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { entrar, EMAIL, PASSWORD } from './util/obras-e2e'

// EL CAMBIO DE OBRA SE ESCRIBE (dueño, 22/09/2026: «roto el movimiento de herramientas, no toma cambios
// de obra»).
//
// El control que faltaba: mover de UNA OBRA A OTRA desde la pantalla, incluido el caso en que la obra de
// destino todavía no tiene ubicación creada —el camino `obra:<id>` que resuelve `ubicacion_de_obra()`,
// que es el único que no pasa por un uuid ya existente—. Lo que prueba el movimiento es la fila leída en
// la base, no el cartel de la pantalla.
//
// Trabaja sobre activos DE PRUEBA que crea y da de baja al terminar: no mueve herramientas reales.

const CAPTURAS = 'test-results/herramientas-mover-a-obra'

test('de una obra a otra que todavía no tiene ubicación: la base queda con la obra nueva', async ({ page }) => {
  test.setTimeout(180000)
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  await s.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  const taller = (await s.from('ubicacion').select('id').eq('tipo', 'taller').single()).data!.id as string
  const conUbicacion = new Set(((await s.from('ubicacion').select('obra_id').eq('tipo', 'obra')).data ?? []).map((u) => u.obra_id))
  const activas = (await s.from('obra_canonica').select('id, nombre').eq('estado', 'activa').is('fusionada_en', null)).data ?? []
  expect(activas.length, 'hacen falta dos obras activas en el índice').toBeGreaterThan(1)
  const origen = activas.find((o) => conUbicacion.has(o.id)) ?? activas[0]
  // La que todavía no tiene ubicación es el caso interesante; si todas la tienen, sirve cualquier otra.
  const destino = activas.find((o) => !conUbicacion.has(o.id) && o.id !== origen.id) ?? activas.find((o) => o.id !== origen.id)!
  const uOrigen = (await s.rpc('ubicacion_de_obra', { p_obra_id: origen.id })).data as string

  const alta = await s.rpc('dar_de_alta_activo', {
    p_clase: 'equipo', p_nombre: 'PRUEBA E2E cambio de obra', p_ubicacion: taller, p_categoria: 'Otros',
  })
  expect(alta.error).toBeNull()
  const id = alta.data as string
  const codigo = (await s.from('activo').select('codigo').eq('id', id).single()).data!.codigo as string
  const prep = await s.rpc('mover_existencias', { p_items: [{ activo: id, origen: taller, cantidad: 1 }], p_destino: uOrigen, p_nota: 'preparación e2e' })
  expect(prep.error).toBeNull()

  try {
    await page.setViewportSize({ width: 1440, height: 950 })
    await entrar(page)
    await page.goto(`/herramientas/inventario?clase=todo&activo=${codigo}`)
    await page.waitForLoadState('networkidle')
    await page.getByTestId('mover-activo').click()
    await page.getByTestId('destino-mover').click()
    await page.getByRole('listbox').getByRole('option').filter({ hasText: destino.nombre as string }).first().click()
    await expect(page.getByTestId('destino-mover')).toHaveValue(new RegExp(destino.nombre as string))
    await page.screenshot({ path: `${CAPTURAS}-1-panel.png`, fullPage: false })
    await page.getByTestId('confirmar-mover').click()
    await expect(page.getByTestId('aviso-herramientas')).toBeVisible({ timeout: 20000 })

    // EL EFECTO, LEÍDO EN LA BASE: la ubicación del activo es la obra elegida y el movimiento quedó.
    const ubic = (await s.from('activo').select('ubicacion_id').eq('id', id).single()).data!.ubicacion_id as string
    const obra = (await s.from('ubicacion').select('obra_id, tipo').eq('id', ubic).single()).data!
    expect(obra.tipo).toBe('obra')
    expect(obra.obra_id).toBe(destino.id)
    const mov = (await s.from('activo_movimiento').select('origen_id, destino_id').eq('activo_id', id).eq('destino_id', ubic)).data
    expect(mov?.[0]?.origen_id).toBe(uOrigen)
  } finally {
    const baja = await s.rpc('dar_de_baja_activo', { p_activo: id, p_motivo: 'descartada', p_detalle: 'prueba e2e cambio de obra' })
    expect(baja.error).toBeNull()
  }
})
