import { test, expect } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// LA FILA DE LA OBRA TIENE QUE DECIR CUÁL ES SU ORDEN, NO CUÁNTAS TIENE.
//
// Pedido del dueño (10/09/2026), textual, mirando `/clientes`: «así no me sirve: me tiene que
// demostrar claramente la OC/OP que corresponde a cada obra desde esa pantalla; que luego quiera
// hacer click y verlas es otra cosa, pero necesito identificarlas con la obra a simple vista».
//
// EL DEFECTO QUE ATRAPA: la fila dibujaba «OC ·1» —un conteo— y volver a eso deja este caso rojo.
// Se exige el NÚMERO de la orden real de esa obra (OC 00002-00002173, «Construcción de Playón de
// Azufre», que Messina emitió el 11/08/2026), leído de `cliente_orden`. Es dato vivo y a propósito:
// si el re-atribuidor deja de colgar esa OC de esa obra, la pantalla vuelve a mentir y esto lo dice.
test('la fila de ME - PLAYÓN DE AZUFRE muestra el número de su OC', async ({ page }) => {
  test.setTimeout(180000)
  await entrar(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/clientes')
  await expect(page.getByTestId('clientes-tabla')).toBeVisible()

  const fila = page.getByTestId('fila-obra').filter({ hasText: 'PLAYÓN DE AZUFRE' }).first()
  await expect(fila).toBeVisible()
  const numeros = fila.getByTestId('chip-orden')
  await expect(numeros.first()).toBeVisible()
  // El número, con su día. No «OC ·1»: un conteo no identifica nada.
  await expect(numeros.filter({ hasText: '2173' })).toHaveCount(1)
  await expect(fila).not.toContainText('OC ·')

  // EL IMPORTE, EN EL MISMO RÓTULO. Hasta el 10/09 la OC 2173 estaba guardada por $ 78,65 —el PDF
  // de Messina imprime «78,650,000.00» en formato norteamericano y el parser leía es_AR—, así que
  // este caso da rojo tanto si el importe deja de dibujarse como si vuelve a leerse mal.
  await expect(numeros.filter({ hasText: '2173' })).toContainText('$78.650.000')

  await page.screenshot({ path: 'tests/capturas/clientes-ordenes-1440.png', fullPage: false })
})

// LA MISMA ORDEN, DESDE LA OBRA. Quien abre la ficha de la obra tiene que encontrar ahí la OC que
// la encargó: hasta hoy sólo se veía desde `/clientes`, y desde la obra el papel no existía.
test('la ficha de la obra lista sus órdenes con número, fecha e importe', async ({ page }) => {
  test.setTimeout(180000)
  await entrar(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/clientes')
  await page.getByTestId('fila-obra').filter({ hasText: 'PLAYÓN DE AZUFRE' }).first().click()
  await page.waitForURL(/\/obras\//, { timeout: 60000 })
  const obraId = new URL(page.url()).pathname.split('/')[2]
  await page.goto(`/obras/${obraId}?vista=documentos`)

  const bloque = page.getByTestId('ordenes-de-la-obra')
  await expect(bloque).toBeVisible()
  await expect(bloque).toContainText('2173')
  await expect(bloque).toContainText('2026-08-11')
  await expect(bloque).toContainText('78.650.000')
  // LAS DOS ÓRDENES DE ESTA OBRA, y las dos como órdenes de compra del cliente: acá no hay ninguna
  // factura nuestra, así que si alguna se cuela con `data-tipo="factura"` es que volvió a
  // atribuirse mal. Un conteo cero que PUEDE dar distinto de cero, no una constante.
  await expect(bloque).toContainText('2256')
  await expect(bloque.locator('[data-tipo="orden_compra"]')).toHaveCount(2)
  await expect(bloque.locator('[data-tipo="factura"]')).toHaveCount(0)

  await page.screenshot({ path: 'tests/capturas/obra-ordenes-1440.png', fullPage: false })
})

// LOS CHIPS DE LO QUE FALTA NO PUEDEN QUEDAR CORTADOS POR LOS NÚMEROS DE LAS ÓRDENES.
//
// EL DEFECTO QUE ATRAPA (regresión medida el 10/09/2026 en `/clientes`, main `ffa50844`): con las
// dos OC de «ME - PLAYÓN DE AZUFRE» dibujadas AL LADO del nombre —cada rótulo ~150px con el importe
// adentro—, «sin medir · sin jefe · sin certificar» se salía de la celda y el `overflow: hidden`
// que protege a la columna Contratado lo cortaba. La celda no puede ensancharse: lo de al lado es
// plata. Se mide la geometría, no el texto: `toBeVisible()` da verde con un chip recortado.
//
// Volver las órdenes a la primera línea deja este caso ROJO por el borde derecho.
test('los chips de la obra entran enteros y las órdenes van en la segunda línea', async ({ page }) => {
  test.setTimeout(180000)
  await entrar(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/clientes')
  await expect(page.getByTestId('clientes-tabla')).toBeVisible({ timeout: 60000 })

  const fila = page.getByTestId('fila-obra').filter({ hasText: 'PLAYÓN DE AZUFRE' }).first()
  await expect(fila).toBeVisible({ timeout: 30000 })
  const celda = (await fila.locator('> span').first().boundingBox())!
  const borde = celda.x + celda.width

  const chips = fila.getByTestId('chip-obra')
  const cuantos = await chips.count()
  // Un cero acá volvería la prueba una constante verde: esta obra TIENE datos faltantes que decir.
  expect(cuantos).toBeGreaterThan(0)
  let ultimoChipAbajo = 0
  for (let i = 0; i < cuantos; i++) {
    const b = (await chips.nth(i).boundingBox())!
    expect(Math.round(b.x + b.width), `el chip ${i + 1} se sale de su celda`).toBeLessThanOrEqual(Math.round(borde))
    ultimoChipAbajo = Math.max(ultimoChipAbajo, b.y + b.height)
  }

  // LA SEGUNDA LÍNEA, medida: el número de la orden arranca por debajo de los chips de estado.
  const orden = (await fila.getByTestId('chip-orden').first().boundingBox())!
  expect(orden.y, 'las órdenes volvieron al renglón del nombre').toBeGreaterThanOrEqual(ultimoChipAbajo - 2)
  expect(Math.round(orden.x + orden.width)).toBeLessThanOrEqual(Math.round(borde))
  await page.screenshot({ path: 'tests/capturas/clientes-fila-dos-lineas-1440.png', fullPage: false })

  // ═══ 390px: LAS ÓRDENES SE APILAN ═══
  // Dos rótulos de ~150px no entran uno al lado del otro en una celda de ~190: en el teléfono van
  // uno debajo del otro, y ninguno se sale de la celda.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(400)
  const celdaMovil = (await fila.locator('> span').first().boundingBox())!
  const ordenes = fila.getByTestId('chip-orden')
  const cajas = await ordenes.evaluateAll((ns) => ns.map((n) => {
    const r = n.getBoundingClientRect()
    return { y: Math.round(r.y), derecha: Math.round(r.right) }
  }))
  expect(cajas.length).toBeGreaterThan(1)
  expect(new Set(cajas.map((c) => c.y)).size, 'a 390px las órdenes siguen en la misma línea').toBe(cajas.length)
  for (const c of cajas) {
    expect(c.derecha, 'una orden se sale de la celda a 390px').toBeLessThanOrEqual(Math.round(celdaMovil.x + celdaMovil.width) + 1)
  }
  await page.screenshot({ path: 'tests/capturas/clientes-fila-dos-lineas-390.png', fullPage: false })
})
