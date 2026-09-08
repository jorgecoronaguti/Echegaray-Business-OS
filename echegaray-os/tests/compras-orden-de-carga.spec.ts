import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN, servicio } from './util/identidades'

// LA LISTA DE COMPRAS MUESTRA PRIMERO LO ÚLTIMO QUE ENTRÓ — 08/09/2026.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// El dueño carga comprobantes por el chat y después «no los ve» en la app. Verificado en producción:
// los 14 de esa jornada ESTABAN, pero la lista ordenaba por FECHA DEL COMPROBANTE y dibujaba 200 de
// 809. Una factura de mayo cargada ese día quedó en la fila 930 de la pestaña y en el puesto ~600 de
// la pantalla: debajo del corte, con el aviso de las que faltan al pie de la lista.
//
// La regla vive en `comprasSheet.ts` (`porOrdenDeCarga`, `clavesRecienCargadas`) y sus casos están
// probados sin navegador. Lo que ESTE archivo prueba es lo que aquéllos no pueden: que la regla esté
// ENCHUFADA a la pantalla y contra la BASE REAL. Un comparador impecable que la consulta ignora deja
// la lista igual que antes, y los tests puros siguen verdes.
//
// Es de LECTURA: no escribe en la base ni en el Sheet.

const RUTA = '/administracion/compras'

/** Los renglones de la pestaña que la pantalla dibujó, en el orden en que los dibujó. */
async function filasDibujadas(page: import('@playwright/test').Page): Promise<number[]> {
  const ids = await page.locator('[data-testid^="compra-"]').evaluateAll(
    (nodos) => nodos.map((n) => n.getAttribute('data-testid') ?? ''),
  )
  return ids
    .map((t) => Number(t.replace('compra-', '')))
    .filter((n) => Number.isFinite(n))
}

test.describe('Compras ordena por orden de carga', () => {
  test.beforeEach(async ({ page }) => {
    await entrarComo(page, ADMIN.email, ADMIN.password)
  })

  test('la última fila cargada en compra_sheet es la primera de la lista sin filtrar', async ({ page }) => {
    // LO QUE ESTÁ ARRIBA SE PREGUNTA, NO SE CLAVA. La pestaña es un dato vivo: mañana el bot carga
    // otro fajo y cualquier número escrito acá se pondría rojo sin que ninguna regla se rompa.
    const { data, error } = await servicio()
      .from('compra_sheet').select('fila').order('fila', { ascending: false }).limit(120)
    expect(error, `no pude leer compra_sheet: ${error?.message}`).toBeNull()
    const ultimas = (data ?? []).map((f) => f.fila as number)
    expect(ultimas.length, 'compra_sheet vino vacía').toBeGreaterThan(0)

    await page.goto(`${RUTA}?todo=1`)
    await expect(page.getByTestId('tabla-compras-sheet')).toBeVisible()
    const dibujadas = await filasDibujadas(page)
    expect(dibujadas.length).toBeGreaterThan(0)

    // NO se afirma que el `max(fila)` de la pestaña esté en la pantalla: la lista son sólo las
    // COMPRAS DE OBRA, y la última fila cargada bien puede ser un impuesto. Lo que se afirma es que
    // de las que SÍ se dibujan, la que entró última va primero — que es lo que el defecto rompía.
    const esperada = ultimas.find((f) => dibujadas.includes(f))
    expect(esperada, 'ninguna de las últimas 120 filas de la pestaña se dibuja en la pantalla').toBeDefined()
    expect(dibujadas[0]).toBe(esperada)

    // Y el orden completo es descendente. Con el orden por fecha de comprobante esto da rojo en la
    // primera factura vieja cargada tarde — es decir, en el caso del defecto.
    const desordenada = dibujadas.findIndex((f, i) => i > 0 && f >= dibujadas[i - 1])
    expect(desordenada, `la fila ${dibujadas[desordenada]} rompe el orden de carga`).toBe(-1)
  })

  test('«Recién cargados» son las últimas 30, y arrancan por la más nueva', async ({ page }) => {
    await page.goto(`${RUTA}?todo=1`)
    const todas = await filasDibujadas(page)

    await page.goto(`${RUTA}?f=recienCargadas`)
    await expect(page.getByTestId('recien-cargados-ayuda')).toBeVisible()
    const recien = await filasDibujadas(page)
    expect(recien.length).toBeGreaterThan(0)
    expect(recien.length).toBeLessThanOrEqual(30)
    // Son EXACTAMENTE la cabeza de la lista sin filtrar: ni otras filas, ni otro orden.
    expect(recien).toEqual(todas.slice(0, recien.length))
    // El chip dice cuántas son, y su número es el de la lista que abre.
    const cuenta = Number((await page.getByTestId('chip-recienCargadas-cuenta').innerText()).replace(/\D/g, ''))
    expect(cuenta).toBe(recien.length)
  })

  test('el recorte se declara ARRIBA de la tabla, no sólo al pie', async ({ page }) => {
    await page.goto(RUTA)
    const aviso = page.getByTestId('compras-recortada')
    await expect(aviso).toBeVisible()
    const cajaAviso = await aviso.boundingBox()
    const cajaTabla = await page.getByTestId('tabla-compras-sheet').boundingBox()
    expect(cajaAviso, 'el aviso del recorte no tiene caja').not.toBeNull()
    expect(cajaTabla, 'la tabla no tiene caja').not.toBeNull()
    // ARRIBA de verdad: en la primera pantalla, no a 200 filas de scroll.
    expect(cajaAviso!.y).toBeLessThan(cajaTabla!.y)
    await expect(page.getByTestId('ver-todas-las-compras')).toBeVisible()
  })
})
