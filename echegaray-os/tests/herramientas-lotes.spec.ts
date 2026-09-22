import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { entrar, EMAIL, PASSWORD } from './util/obras-e2e'

// LOTES REPARTIDOS (22/09, dueño: «como se hara el descuento de unidades a medida q se asigna la
// herram en una obra?»). Sobre un lote DE PRUEBA de 6 en el Taller: desde la pantalla se mandan 2 a una
// obra y se mira en la base que queden 4 + 2. Al final el lote de prueba se da de baja entero.

const CAPTURAS = 'test-results/herramientas-lotes'

test('mandar 2 de un lote de 6 a una obra: la base queda 4 en el Taller y 2 en la obra', async ({ page }) => {
  test.setTimeout(180000)
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  await s.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  const taller = (await s.from('ubicacion').select('id').eq('tipo', 'taller').single()).data!.id as string
  const alta = await s.rpc('dar_de_alta_activo', {
    p_clase: 'herramienta', p_nombre: 'PRUEBA E2E lote repartido', p_ubicacion: taller, p_categoria: 'Otros', p_cantidad: 6,
  })
  expect(alta.error).toBeNull()
  const id = alta.data as string
  const codigo = (await s.from('activo').select('codigo').eq('id', id).single()).data!.codigo as string
  try {
    await page.setViewportSize({ width: 1440, height: 950 })
    await entrar(page)
    await page.goto(`/herramientas/inventario?clase=todo&activo=${codigo}`)
    await page.waitForLoadState('networkidle')
    await page.getByTestId('mover-activo').click()
    await expect(page.getByTestId('cantidad-envio')).toHaveValue('6')
    await page.getByTestId('cantidad-envio').fill('2')
    await page.getByTestId('destino-mover').click()
    await page.getByRole('listbox').getByRole('option').first().click()
    await expect(page.getByTestId('confirmar-mover')).toContainText('2 unidades')
    await page.screenshot({ path: `${CAPTURAS}-1-panel.png`, fullPage: false })
    await page.getByTestId('confirmar-mover').click()
    await expect(page.getByTestId('aviso-herramientas')).toContainText('2 de 6', { timeout: 20000 })

    // El efecto se lee en la base, no en la pantalla.
    const ex = (await s.from('activo_existencia').select('ubicacion_id, cantidad').eq('activo_id', id)).data ?? []
    const enTaller = ex.find((e) => e.ubicacion_id === taller)?.cantidad
    const enObra = ex.find((e) => e.ubicacion_id !== taller)
    expect(enTaller).toBe(4)
    expect(enObra?.cantidad).toBe(2)
    const mov = (await s.from('activo_movimiento').select('cantidad').eq('activo_id', id).eq('destino_id', enObra!.ubicacion_id)).data
    expect(mov?.[0]?.cantidad).toBe(2)

    // La ficha muestra el reparto y el inventario filtrado por la obra, «× 2 de 6».
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('reparto-lote')).toContainText('Taller')
    await page.screenshot({ path: `${CAPTURAS}-2-ficha.png`, fullPage: false })
    await page.goto(`/herramientas/inventario?clase=todo&ubicacion=${enObra!.ubicacion_id}&q=${codigo}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('cantidad-lote').first()).toHaveText('× 2 de 6')
    await page.screenshot({ path: `${CAPTURAS}-3-obra.png`, fullPage: false })
  } finally {
    const baja = await s.rpc('dar_de_baja_activo', { p_activo: id, p_motivo: 'descartada', p_detalle: 'prueba e2e de lotes' })
    expect(baja.error).toBeNull()
  }
})

test('resumen: cada obra con herramientas lleva a lo que hay en ella', async ({ page }) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1440, height: 950 })
  await entrar(page)
  await page.goto('/herramientas')
  await page.waitForLoadState('networkidle')
  const obra = page.getByTestId('obra-resumen').first()
  await expect(obra).toBeVisible()
  const rotulo = (await obra.textContent())!.trim()
  await page.screenshot({ path: `${CAPTURAS}-4-resumen.png`, fullPage: true })
  await obra.click()
  await expect(page).toHaveURL(/ubicaciones\?u=[0-9a-f-]{36}/)
  await expect(page.getByTestId('titulo-lugar')).toContainText(rotulo)
  await expect(page.getByTestId('activos-del-lugar')).toBeVisible()
})
