import { test, expect } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// ═══ EL MAIL DEL CONTACTO SE CORTABA EN EL COSTADO (dueño, 12/09/2026) ═══
//
// *«En la ficha del cliente, panel Contacto (costado, 1280 px), la columna MAIL se corta
// (jmillan@juar…)»*. Sin el mail completo no se le puede escribir a nadie: ni la invitación al portal
// ni el recordatorio de cobranza, que es la razón por la que la ausencia de mail se dibuja en ámbar.
//
// ═══ POR QUÉ NO ALCANZA CON «QUE NO SE CORTE» ═══
//
// Un `title` con el mail entero «arregla» la captura y no arregla nada: el dato sigue necesitando que
// alguien pase el mouse y lo adivine. Lo que se exige acá es que el texto RENDERIZADO entre en su
// caja —`scrollWidth <= clientWidth`— y que el `href` del `mailto:` sea el mail completo, que es lo
// que se usa para escribirle. El `title` se exige ADEMÁS, no EN LUGAR DE.
//
// Es de LECTURA: no escribe en la base ni en el Sheet.

const ESCRITORIO = { width: 1280, height: 1000 }

test('el mail de cada contacto se lee entero en el costado de la ficha', async ({ page }) => {
  test.setTimeout(240000)
  await entrar(page)
  await page.setViewportSize(ESCRITORIO)
  // Messina es el cliente con los mails más largos del padrón (`ivillanueva@juanmessina.com.ar`, 30
  // caracteres) y el que el dueño estaba mirando. Con un cliente de mails cortos el test pasaría sin
  // medir nada.
  await page.goto('/clientes/messina')
  const panel = page.getByTestId('contactos-cliente')
  await expect(panel).toBeVisible({ timeout: 90000 })

  await page.screenshot({ path: 'tests/capturas/cliente-contacto-mail-1280.png', fullPage: false })

  const mails = await panel.evaluate((raiz) => {
    const out: { texto: string; href: string; title: string; dentro: number; visible: number; x: number; ancho: number }[] = []
    for (const a of raiz.querySelectorAll('a[href^="mailto:"]')) {
      const r = a.getBoundingClientRect()
      out.push({
        texto: (a.textContent ?? '').trim(),
        href: a.getAttribute('href') ?? '',
        title: a.getAttribute('title') ?? (a.closest('[title]')?.getAttribute('title') ?? ''),
        dentro: a.scrollWidth,
        visible: a.clientWidth,
        x: Math.round(r.x),
        ancho: Math.round(r.width),
      })
    }
    return out
  })

  // Si no hay ningún mail dibujado, el verde no prueba nada.
  expect(mails.length, 'el panel Contacto no dibujó ningún mail: el control no midió nada').toBeGreaterThan(2)

  for (const m of mails) {
    // 1 · EL TEXTO ENTERO, NO UN PREFIJO CON PUNTOS SUSPENSIVOS.
    expect(
      m.texto,
      `el mail se dibuja recortado: «${m.texto}» (el href dice ${m.href})`,
    ).toBe(m.href.replace('mailto:', ''))
    expect(m.texto).not.toContain('…')
    // 2 · Y ENTRA EN SU CAJA: si `scrollWidth` supera a `clientWidth`, el navegador lo está tapando.
    expect(
      m.dentro,
      `«${m.texto}» pide ${m.dentro}px y tiene ${m.visible}: el mail queda tapado`,
    ).toBeLessThanOrEqual(m.visible + 1)
    // 3 · El título completo viaja igual, para el que quiera copiarlo de un tirón.
    expect(m.title, `«${m.texto}» no lleva el mail en su title`).toContain(m.href.replace('mailto:', ''))
  }

  // Y EL PANEL NO SE SALE DEL COSTADO: un mail que se lee entero porque empujó la columna de al lado
  // no está arreglado, está mudado de problema.
  // El costado de esta ficha se llama `panel-informacion` —`CostadoDeFicha` acepta su propio testid—
  // y mide 300px: es la caja de la que el mail se estaba saliendo.
  const costado = await page.getByTestId('panel-informacion').evaluate((c) => {
    const r = c.getBoundingClientRect()
    return { x: Math.round(r.x), w: Math.round(r.width) }
  })
  for (const m of mails) {
    expect(
      m.x + m.ancho,
      `el mail se dibuja hasta ${m.x + m.ancho}px y el costado termina en ${costado.x + costado.w}`,
    ).toBeLessThanOrEqual(costado.x + costado.w + 1)
  }
})
