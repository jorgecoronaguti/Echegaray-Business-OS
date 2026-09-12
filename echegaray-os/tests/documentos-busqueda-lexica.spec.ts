import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

// LA BÚSQUEDA DE /documentos, EN EL NAVEGADOR — que la pantalla encuentre lo que el chat encuentra.
//
// ═══ QUÉ MIDE ═══
//
//   1 · Que «dni de capelli» DEVUELVA el archivo. Hasta el 12/09/2026 la pantalla buscaba la frase
//       entera con un `ilike` y contestaba «Nada coincide con lo buscado» teniendo
//       «DNI - Capelli.pdf» en la base. Si alguien vuelve a ese filtro, esto se pone rojo.
//   2 · Que la fila DIGA POR QUÉ entró: el fragmento que coincidió va en negrita, en el nombre o en
//       la carpeta. Un resultado sin eso obliga a buscar la palabra a ojo entre cuatro columnas.
//   3 · Que la tabla no se haya roto al resaltar: ninguna fila pisa a la siguiente.
//
// Es de LECTURA: no escribe en la base ni en el Sheet.

const RUTA = '/documentos?q=dni+de+capelli'

test('la pantalla encuentra «dni de capelli» y muestra qué coincidió', async ({ page }) => {
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(RUTA)
  await page.waitForSelector('[data-testid="tabla-documentos"]')

  const filas = page.locator('[data-testid="fila-archivo"]')
  expect(await filas.count(), 'la búsqueda por palabras no devolvió ninguna fila').toBeGreaterThan(0)
  await expect(page.locator('[data-testid="documentos-vacio"]')).toHaveCount(0)

  // EL NOMBRE ESPERADO, no cualquier fila: lo que se mide es que encuentre ESE archivo.
  await expect(page.locator('[data-testid="abrir-documento"]').first()).toContainText('Capelli')

  // EL FRAGMENTO RESALTADO. Está en el nombre o en la carpeta; lo que no puede pasar es que no esté
  // en ninguna parte.
  const coincidencias = page.locator('[data-testid="coincidencia"]')
  expect(await coincidencias.count(), 'ninguna fila dice con qué coincidió').toBeGreaterThan(0)

  const cajas = await filas.evaluateAll((els) => els.map((e) => e.getBoundingClientRect())
    .map((r) => ({ top: r.top, bottom: r.bottom })))
  for (let i = 1; i < cajas.length; i += 1) {
    expect(cajas[i].top, `la fila ${i} se dibuja encima de la anterior`)
      .toBeGreaterThanOrEqual(cajas[i - 1].bottom - 1)
  }

  await page.screenshot({ path: 'tests/capturas/documentos-busqueda-lexica-1280.png', fullPage: false })
})
