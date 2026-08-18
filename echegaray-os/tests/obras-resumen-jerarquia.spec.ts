// `/obras` = RESUMEN GLOBAL — la jerarquía corregida, medida contra la base y no contra sí misma.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// Hasta el 20/08 la primera columna se llamaba «Obra / Cliente» y apilaba los dos nombres DENTRO
// del mismo `<Link>`, que iba a la obra. El dueño lo llamó por su nombre: *"La primera columna debe
// ser únicamente OBRA. La segunda únicamente CLIENTE. Hoy dice «OBRA / CLIENTE» y muestra ambos
// mezclados. Eso está mal conceptualmente."* · *"Click en OBRA → abre workspace de la obra. Click
// en CLIENTE → abre ficha CRM del cliente."*
//
// Ese defecto NO se ve en un screenshot ni en el typecheck: la pantalla se veía bien, mostraba los
// dos datos y el link andaba. Lo que estaba roto era la jerarquía —el cliente presentado como un
// atributo de la obra— y su síntoma verificable es exactamente uno: desde el resumen no se podía
// llegar al CRM del cliente. Este archivo lo mide clic por clic.
//
// ═══ POR QUÉ SE LEE LA BASE Y NO SÓLO EL DOM ═══
//
// «Una fila por obra» comprobado contando filas de la propia tabla es un control validado contra la
// información que él mismo produce: si el service se comiera obras, la tabla tendría menos filas y
// el test seguiría en verde. La cuenta que vale sale de `obra_panel` —la misma vista que lee la
// pantalla— consultada aparte con la sesión del usuario de prueba. Si las dos no coinciden, hay una
// obra que la pantalla se está guardando.

import { expect, test } from '@playwright/test'
import { conBase, entrar } from './util/obras-e2e'

interface FilaPanel {
  obra_id: string
  nombre: string
  estado: string
  cliente_slug: string | null
  cliente_nombre: string | null
}

test('el resumen de obras es una fila por obra, con OBRA y CLIENTE separados y cada uno a su destino', async ({ page }) => {
  test.setTimeout(120000)
  const sb = await conBase()
  try {
    // LA VERDAD, ANTES DE MIRAR LA PANTALLA. Mismo criterio de archivadas que `/obras`: `cerrada`
    // sale de la cartera, `pausada` NO —sigue siendo un compromiso abierto—.
    const { data, error } = await sb
      .from('obra_panel')
      .select('obra_id, nombre, estado, cliente_slug, cliente_nombre')
    expect(error?.message ?? null, 'obra_panel tiene que poder leerse con la sesión de prueba').toBeNull()
    const enLaBase = ((data ?? []) as FilaPanel[]).filter((o) => o.estado !== 'cerrada')
    expect(enLaBase.length, 'sin obras en la base este test no puede probar nada').toBeGreaterThan(0)

    await entrar(page)
    await page.goto('/obras')

    // ── NIVEL 2: DOS ENTRADAS, NI UNA MÁS ────────────────────────────────────
    const barra = page.getByTestId('nav-vistas-obras')
    await expect(barra).toBeVisible({ timeout: 30000 })
    await expect(
      barra.getByRole('link'),
      'la barra del área volvió a mezclar dominios de una obra con vistas del área',
    ).toHaveText(['Resumen', 'Gantt'])

    // ── UNA FILA POR OBRA ────────────────────────────────────────────────────
    const tabla = page.getByTestId('portafolio-tabla')
    await expect(tabla).toBeVisible()
    const filas = tabla.locator('tbody tr')
    await expect(
      filas,
      `la base tiene ${enLaBase.length} obras sin archivar y la pantalla dibuja otra cantidad`,
    ).toHaveCount(enLaBase.length)

    // ── LA PRIMERA CELDA ES SÓLO LA OBRA ─────────────────────────────────────
    // Se elige una obra CON cliente canónico: es la única que puede probar las dos mitades del
    // pedido —el link a la obra y el link al CRM— en la misma fila.
    const conCliente = enLaBase.find((o) => o.cliente_slug && o.cliente_nombre)
    expect(
      conCliente,
      'ninguna obra tiene cliente canónico: el enlace al CRM no se puede probar',
    ).toBeTruthy()
    const o = conCliente as FilaPanel

    const fila = tabla.locator(`tr[data-obra="${o.obra_id}"]`)
    await expect(fila).toHaveCount(1)
    const celdaObra = fila.locator('td').first()
    // `toHaveText` es exacto: si el nombre del cliente volviera a colarse en esta celda —que es el
    // defecto original— el texto dejaría de ser sólo el de la obra y esto se pone rojo.
    await expect(
      celdaObra,
      'la celda OBRA volvió a mostrar algo más que el nombre de la obra',
    ).toHaveText(o.nombre)

    // ── LA SEGUNDA CELDA ES SÓLO EL CLIENTE ──────────────────────────────────
    const celdaCliente = fila.locator('td').nth(1)
    await expect(
      celdaCliente,
      'la celda CLIENTE no muestra exactamente el cliente canónico',
    ).toHaveText(o.cliente_nombre as string)

    // ── CLICK EN OBRA → WORKSPACE ────────────────────────────────────────────
    await celdaObra.getByRole('link').click()
    await page.waitForURL(new RegExp(`/obras/${o.obra_id}`))
    // El nombre va como CADENA EXACTA, no como RegExp: «La Estrella (Alimentos del Sur SAS)» tiene
    // paréntesis, y como expresión regular eso es un grupo de captura — el patrón dejaba de
    // coincidir con el texto que sí estaba en la pantalla. Un test que falla por su propia comilla
    // manda a arreglar código que está bien.
    await expect(page.getByRole('heading', { name: o.nombre, exact: true, level: 1 })).toBeVisible({ timeout: 30000 })

    // ── CLICK EN CLIENTE → FICHA CRM ─────────────────────────────────────────
    // Esto es lo que ANTES era imposible: el cliente vivía adentro del link de la obra, así que
    // desde el resumen no había forma de llegar al CRM.
    await page.goto('/obras')
    await tabla.locator(`tr[data-obra="${o.obra_id}"] td`).nth(1).getByRole('link').click()
    await page.waitForURL(new RegExp(`/clientes/${o.cliente_slug}`))
    await expect(page.getByRole('heading', { name: o.cliente_nombre as string, exact: true, level: 1 }))
      .toBeVisible({ timeout: 30000 })
  } finally {
    await sb.auth.signOut()
  }
})

/**
 * EL CLIENTE SIN FICHA SE MUESTRA, PERO NO SE ENLAZA.
 *
 * Hay obras cuyo cliente es sólo un texto en la fuente (`cliente_texto`) y no tiene fila en
 * `clientes`. Un `<Link href="/clientes/null">` ahí sería una promesa que termina en 404 — y basta
 * una para que el usuario deje de tocar los links de esa columna entera. El test es condicional
 * porque el caso depende de los datos: si hoy todas las obras tienen ficha, se declara y no se
 * inventa una obra huérfana para forzarlo.
 */
test('la obra sin ficha de cliente muestra el texto, no un enlace roto', async ({ page }) => {
  test.setTimeout(120000)
  const sb = await conBase()
  try {
    const { data } = await sb.from('obra_panel').select('obra_id, nombre, estado, cliente_slug, cliente_nombre')
    const huerfana = ((data ?? []) as FilaPanel[])
      .filter((o) => o.estado !== 'cerrada')
      .find((o) => !o.cliente_slug)
    test.skip(!huerfana, 'hoy todas las obras sin archivar tienen ficha de cliente: no hay caso que medir')

    await entrar(page)
    await page.goto('/obras')
    const celda = page
      .getByTestId('portafolio-tabla')
      .locator(`tr[data-obra="${(huerfana as FilaPanel).obra_id}"] td`)
      .nth(1)
    await expect(celda).toBeVisible({ timeout: 30000 })
    await expect(
      celda.getByRole('link'),
      'una obra sin ficha de cliente está publicando un enlace que va a terminar en 404',
    ).toHaveCount(0)
  } finally {
    await sb.auth.signOut()
  }
})
