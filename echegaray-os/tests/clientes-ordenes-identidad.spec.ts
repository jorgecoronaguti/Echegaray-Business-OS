import { test, expect } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// LO QUE EL DUEÑO PIDIÓ VER, MEDIDO EN EL NAVEGADOR (10/09/2026, textual):
// «quiero que se vean las OC, y adentro de cada cliente también, y en Documentos tienen que estar
// claras las OC y las OP correspondientes. Rehacer».
//
// Los tres casos de abajo son las tres pantallas de esa frase. Corren contra DATOS VIVOS a
// propósito: si el re-atribuidor deja de colgar la OC 2173 de su obra, o si alguien vuelve a
// contar una factura nuestra como orden del cliente, la pantalla vuelve a mentir y esto lo dice.

test('la fila de ME - PLAYÓN DE AZUFRE muestra el número de su OC, y ninguna OP', async ({ page }) => {
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

  // ═══ NINGUNA ORDEN DE PAGO EN LA FILA DE LA OBRA (dueño, 10/09/2026) ═══
  // La versión anterior mezclaba las dos clases en el mismo renglón —«OP 5146 · 03/09 ·
  // $15.328.174 · OC 2162 · +8»— y era exactamente lo que no se podía leer. La OP de esta obra
  // existe (5156, $39.325.000): que no esté acá es la decisión, no un dato que falte.
  for (const texto of await numeros.allInnerTexts()) expect(texto).toMatch(/^OC /)
  await expect(fila).not.toContainText('5156')

  // EL TOTAL DE OC DE LA OBRA, en su columna, al lado de lo contratado (que sale de OBRAS).
  await expect(fila.getByTestId('total-oc-obra')).toContainText('1 OC')

  // ═══ «ÚLT. MOV.» SE FUE Y EN SU LUGAR ESTÁ LO COBRADO ═══
  // El dueño la mandó a quitar: decía «sin movimientos» en casi todas las filas.
  await expect(page.getByTestId('clientes-tabla')).not.toContainText('sin movimientos')
  await expect(page.getByTestId('clientes-tabla')).not.toContainText('sin partes')
  // La celda existe para Dirección, y cuando no hay contra qué medir dice «—», nunca 0 %.
  const cobro = fila.getByTestId('cobro-obra')
  await expect(cobro).toBeVisible()
  await expect(cobro).not.toContainText('0 %')

  await page.screenshot({ path: 'tests/capturas/clientes-ordenes-1440.png', fullPage: false })
})

test('la ficha del cliente muestra las OC por obra, y las obras CERRADAS con sus papeles', async ({ page }) => {
  test.setTimeout(180000)
  await entrar(page)
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/clientes/messina')

  // Las cuatro cifras de la cabecera: lo que le vendimos y los papeles que lo respaldan.
  const cifras = page.getByTestId('cifras-cliente')
  await expect(cifras).toContainText('OC recibidas')
  await expect(cifras).toContainText('OP recibidas')

  // ME - PLAYÓN DE AZUFRE: su OC y su OP, cada una en SU columna.
  const activa = page.getByTestId('fila-obra-cliente').filter({ hasText: 'PLAYÓN DE AZUFRE' }).first()
  await expect(activa.getByTestId('oc-obra-cliente')).toContainText('78.650.000')
  await expect(activa.getByTestId('op-obra-cliente')).toContainText('39.325.000')

  // ═══ LA OBRA CERRADA CON PAPELES SE VE (dueño: «adentro de cada cliente también») ═══
  // «ME - BASES TANQUE SO2» está cerrada y tiene OC 1864 ($10.133.750), OP 4865 ($17.115.305) y dos
  // facturas. Hasta hoy vivía detrás de `?archivadas=1`, o sea que no se veía desde ningún lado.
  await expect(page.getByTestId('titulo-grupo-obras')).toContainText('Cerradas')
  const cerrada = page.getByTestId('fila-obra-cliente').filter({ hasText: 'BASES TANQUE SO2' }).first()
  await expect(cerrada).toBeVisible()
  await expect(cerrada.getByTestId('oc-obra-cliente')).toContainText('10.133.750')
  await expect(cerrada.getByTestId('op-obra-cliente')).toContainText('17.115.305')

  await page.screenshot({ path: 'tests/capturas/cliente-obras-oc-1600.png', fullPage: false })
})

test('Documentos separa OC, OP, certificados de retención y facturas nuestras', async ({ page }) => {
  test.setTimeout(180000)
  await entrar(page)
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/clientes/messina?vista=documentos')

  const bloque = page.getByTestId('papeles-por-tipo')
  await expect(bloque).toBeVisible()
  const rotulos = await page.getByTestId('grupo-papeles').locator('> p').allInnerTexts()
  // Cada grupo dice CUÁNTOS hay: un rótulo sin número obliga a contar renglones a ojo.
  expect(rotulos.join(' | ')).toMatch(/ÓRDENES DE COMPRA · \d+/i)
  expect(rotulos.join(' | ')).toMatch(/ÓRDENES DE PAGO · \d+/i)
  expect(rotulos.join(' | ')).toMatch(/CERTIFICADOS DE RETENCIÓN · \d+/i)
  expect(rotulos.join(' | ')).toMatch(/FACTURAS EMITIDAS · \d+/i)

  // ═══ EL CERTIFICADO NO ES UN «DOCUMENTO N° …» NI UNA ORDEN DE PAGO ═══
  // Salía como «Documento N° 0000000005146 · sin importe» justo debajo de «Orden de pago N°
  // 0000000005146»: el mismo número dos veces, como si fuera un duplicado.
  await expect(bloque).not.toContainText('Documento N°')
  const retenciones = bloque.locator('[data-clase="retencion"]')
  await expect(retenciones.first()).toContainText('Retención · OP')
  // Tantos certificados como órdenes de pago, y NINGUNO contado como orden de pago: si alguno se
  // colara en el grupo de las OP, los dos conteos dejarían de coincidir con la base.
  expect(await retenciones.count()).toBe(await bloque.locator('[data-clase="op"]').count())
  // La factura nuestra tiene grupo propio y dice qué OC cita: no es una orden del cliente.
  await expect(bloque.locator('[data-clase="factura"]').first()).toContainText('cita OC')

  await page.screenshot({ path: 'tests/capturas/cliente-documentos-1600.png', fullPage: true })
})

test('la ficha de la obra lista sus papeles agrupados, sin contar la factura como orden', async ({ page }) => {
  test.setTimeout(180000)
  await entrar(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/obras/messina-playon-azufre?vista=documentos')

  const bloque = page.getByTestId('ordenes-de-la-obra')
  await expect(bloque).toBeVisible()
  await expect(bloque).toContainText('2173')
  // La fecha se escribe como se lee, no en ISO: «11/08/26».
  await expect(bloque).toContainText('11/08/26')
  await expect(bloque).toContainText('78.650.000')
  // UNA SOLA ORDEN DE COMPRA EN ESTA OBRA. La OC 2256 ($12.100.000) es «ADICIONAL OC 2173,
  // CONSTRUCCIÓN DEL TERCER MURO» (su PDF y Cobranzas F98): pertenece a la obra hija
  // «ME - ADICIONAL TERCER MURO», no a Playón de Azufre (dueño, 10/09/2026). Si vuelve a aparecer
  // acá es que se atribuyó mal otra vez. Y ninguna factura nuestra: si alguna se cuela con
  // `data-clase="factura"` es la misma falla. Conteos que PUEDEN dar distinto, no constantes.
  await expect(bloque).not.toContainText('2256')
  await expect(bloque.locator('[data-clase="oc"]')).toHaveCount(1)
  await expect(bloque.locator('[data-clase="factura"]')).toHaveCount(0)
  // Y el certificado de retención de la OP 5156 se rotula con SU orden, no como un documento suelto.
  await expect(bloque.locator('[data-clase="retencion"]')).toContainText('Retención · OP 5156')

  await page.screenshot({ path: 'tests/capturas/obra-ordenes-1440.png', fullPage: false })
})

// EL TEST DE «LOS CHIPS DE LA OBRA ENTRAN ENTEROS» SE RETIRÓ EL 10/09/2026: el dueño sacó de
// /clientes los chips «sin medir · sin jefe · sin certificar» y «sin teléfono · sin contrato»
// («quiero info precisa»). Sin chips no hay nada que medir; un test que espera `chip-obra` > 0
// afirmaría un estado que ya no existe.
