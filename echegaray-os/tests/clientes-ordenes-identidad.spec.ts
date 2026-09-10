import { test, expect } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// LO QUE EL DUEÑO PIDIÓ VER, MEDIDO EN EL NAVEGADOR (10/09/2026, textual):
// «quiero que se vean las OC, y adentro de cada cliente también, y en Documentos tienen que estar
// claras las OC y las OP correspondientes. Rehacer».
//
// Los tres casos de abajo son las tres pantallas de esa frase. Corren contra DATOS VIVOS a
// propósito: si el re-atribuidor deja de colgar la OC 2173 de su obra, o si alguien vuelve a
// contar una factura nuestra como orden del cliente, la pantalla vuelve a mentir y esto lo dice.

test('la fila de ME - PLAYÓN DE AZUFRE muestra el total de sus OC y abre su detalle', async ({ page }) => {
  test.setTimeout(180000)
  await entrar(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/clientes')
  await expect(page.getByTestId('clientes-tabla')).toBeVisible()

  const fila = page.getByTestId('fila-obra').filter({ hasText: 'PLAYÓN DE AZUFRE' }).first()
  await expect(fila).toBeVisible()

  // ═══ EL NÚMERO DE LA OC YA NO CUELGA DEL NOMBRE (dueño, 10/09/2026) ═══
  //
  // «OC 2173 · 11/08 · $78.650.000» vivía debajo del nombre de la obra, en monoespaciado, y el
  // dueño lo llamó ruido: competía con las siete columnas de plata de la derecha. La fila publica
  // el TOTAL en su columna y el detalle se abre a un clic, sin salir de la lista.
  await expect(fila.getByTestId('chip-orden')).toHaveCount(0)
  const total = fila.getByTestId('total-oc-obra')
  await expect(total).toContainText('1 OC')
  // EL IMPORTE. Hasta el 10/09 la OC 2173 estaba guardada por $ 78,65 —el PDF de Messina imprime
  // «78,650,000.00» en formato norteamericano y el parser leía es_AR—, así que este caso da rojo
  // tanto si el importe deja de dibujarse como si vuelve a leerse mal.
  await expect(total).toContainText('78.650.000')
  // Y no un conteo pelado: «OC ·1» no identifica nada.
  await expect(fila).not.toContainText('OC ·1')

  // ═══ EL DETALLE SIGUE ESTANDO, A UN CLIC ═══
  // Sacar el ruido no puede ser sacar el acceso: el panel lateral tiene que traer el número.
  await fila.getByTestId('abrir-ordenes-obra').click()
  // 30 s y no los 5 por defecto: la página es `force-dynamic` y en dev con webpack el primer
  // render del panel compila la ruta entera.
  const panel = page.getByTestId('panel-ordenes')
  await expect(panel).toBeVisible({ timeout: 30000 })
  await expect(panel).toContainText('2173')
  await expect(panel).toContainText('78.650.000')
  // NINGUNA ORDEN DE PAGO EN ESTA VISTA DE LA OBRA: la OP 5156 ($39.325.000) existe y vive en la
  // ficha del cliente. Que no esté acá es la decisión, no un dato que falte.
  await expect(fila).not.toContainText('5156')
  await page.goto('/clientes')
  await expect(page.getByTestId('clientes-tabla')).toBeVisible()

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
  // «c/IVA» EN EL RÓTULO: el importe de una OC es el total del PDF y «Contratado en curso», tres
  // cifras a la izquierda, es neto. Sin la unidad escrita, las dos invitan a una resta que no
  // significa nada.
  await expect(cifras).toContainText('OC recibidas c/IVA')
  await expect(cifras).toContainText('OP recibidas c/IVA')

  // ME - PLAYÓN DE AZUFRE: su OC y su OP, cada una en SU columna.
  const activa = page.getByTestId('fila-obra-cliente').filter({ hasText: 'PLAYÓN DE AZUFRE' }).first()
  await expect(activa.getByTestId('oc-obra-cliente')).toContainText('78.650.000')
  await expect(activa.getByTestId('op-obra-cliente')).toContainText('39.325.000')

  // ═══ LA OBRA CERRADA CON PAPELES SE VE (dueño: «adentro de cada cliente también») ═══
  //
  // «ME - BASES TANQUE SO2» está cerrada y tiene sus OC, su OP 4865 y dos facturas. Hasta el
  // 10/09/2026 vivía detrás de `?archivadas=1`, o sea que no se veía desde ningún lado.
  //
  // SE AFIRMA EL INVARIANTE, NO EL NÚMERO. Este caso clavaba «10.133.750» —el importe de la OC
  // 1864, la única que la obra tenía cuando se escribió— y quedó rojo solo cuando el bajador de
  // Gmail trajo la OC 1923 ($6.981.554,80) y la celda pasó a sumar las dos ($17.115.305). Ningún
  // control se había roto: el test afirmaba el estado del mundo en vez de la regla. Lo que no puede
  // cambiar es que la obra cerrada publique un IMPORTE y un CONTEO en sus dos columnas — si vuelve
  // a esconderse, las dos celdas quedan vacías y esto da rojo.
  await expect(page.getByTestId('titulo-grupo-obras')).toContainText('Cerradas')
  const cerrada = page.getByTestId('fila-obra-cliente').filter({ hasText: 'BASES TANQUE SO2' }).first()
  await expect(cerrada).toBeVisible()
  await expect(cerrada.getByTestId('oc-obra-cliente')).toHaveText(/\$ ?[\d.]+\s*\d+ OC/)
  await expect(cerrada.getByTestId('op-obra-cliente')).toHaveText(/\$ ?[\d.]+\s*\d+ OP/)

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
  // NINGÚN CERTIFICADO CONTADO COMO ORDEN DE PAGO. Se mide así y no comparando los dos conteos:
  // «tantos certificados como OP» parecía un invariante y no lo es —una orden puede venir con
  // varios certificados (Ganancias, IVA, IIBB) o sin ninguno—, y el 10/09 la re-atribución sumó
  // filas y lo puso rojo sin que nada estuviera mal. Lo que SÍ es invariante: un papel que se
  // anuncia como retención no puede estar en el grupo de las órdenes de pago, porque ahí su
  // importe se sumaría al dinero cobrado.
  expect(await retenciones.count()).toBeGreaterThan(0)
  for (const texto of await bloque.locator('[data-clase="op"]').allInnerTexts()) {
    expect(texto).not.toContain('Retención')
  }
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
  // 30 s y no los 5 de por defecto: contra `next dev` esta ruta se compila la primera vez que se
  // pide, y el timeout medía el compilador, no la pantalla.
  await expect(bloque).toBeVisible({ timeout: 30000 })
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
  // LA FACTURA NUESTRA NO SE CUENTA COMO ORDEN DEL CLIENTE. Antes esto se medía con «cero
  // facturas», y era el estado de ese día: el 10/09 la re-atribución vinculó la factura 229 a esta
  // obra y el caso se puso rojo sin que nada estuviera mal. Lo que hay que probar es que la
  // factura no engorda lo que el cliente encargó: el grupo de las OC sigue con una fila y su total
  // sigue siendo el de la OC. Si una factura volviera a entrar como `orden_compra`, el total sube.
  const grupoOC = page.getByTestId('grupo-papeles').filter({ hasText: 'ÓRDENES DE COMPRA' })
  await expect(grupoOC.getByTestId('total-grupo')).toContainText('78.650.000')
  for (const texto of await bloque.locator('[data-clase="factura"]').allInnerTexts()) {
    expect(texto).toMatch(/Factura/)
  }
  // Y el certificado de retención de la OP 5156 se rotula con SU orden, no como un documento suelto.
  await expect(bloque.locator('[data-clase="retencion"]')).toContainText('Retención · OP 5156')

  await page.screenshot({ path: 'tests/capturas/obra-ordenes-1440.png', fullPage: false })
})

// EL TEST DE «LOS CHIPS DE LA OBRA ENTRAN ENTEROS» SE RETIRÓ EL 10/09/2026: el dueño sacó de
// /clientes los chips «sin medir · sin jefe · sin certificar» y «sin teléfono · sin contrato»
// («quiero info precisa»). Sin chips no hay nada que medir; un test que espera `chip-obra` > 0
// afirmaría un estado que ya no existe.
