import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN, servicio } from './util/identidades'

// LA SECCIÓN COMPRAS MUESTRA COMPRAS — 08/09/2026.
//
// ═══ EL DEFECTO QUE ATRAPA, TEXTUAL DEL DUEÑO ═══
//
// *«de la sección de compras de app.ecsas.com.ar quitá todos los conceptos o proveedores que no
// sean de obra civil, mantenimiento, estructura; es decir, sacar bancos, sueldos, sindicatos,
// financieros, etc.»*. En la captura del 08/09 la lista de 955 filas mostraba «SAC · Segunda - 15
// Empleados», «Sueldos · sale por Jornales por Quincena», «SINDICATOS · sale por Cargas Sociales»,
// «ARCA · F931», «FCL» y «Banco · Préstamo Camioneta Ford XLS · Crédito Prendario».
//
// La regla vive en `comprasDeObra.ts` y sus casos están probados sin navegador. Lo que ESTE archivo
// prueba es lo que aquélla no puede: que la regla esté ENCHUFADA a la pantalla. Un `esCompraDeObra`
// perfecto que nadie llama deja la lista igual que antes, y los tests puros seguirían verdes.
//
// Es de LECTURA: no escribe en la base ni en el Sheet.

const RUTA = '/administracion/compras'

test.describe('la sección Compras lista sólo compras de obra', () => {
  test.beforeEach(async ({ page }) => {
    await entrarComo(page, ADMIN.email, ADMIN.password)
  })

  test('lo que no es una compra no aparece en la lista', async ({ page }) => {
    await page.goto(`${RUTA}?todo=1`)
    await expect(page.getByTestId('nota-compras')).toBeVisible()
    const tabla = page.getByTestId('tabla-compras-sheet')
    const texto = (await tabla.innerText()).toLowerCase()
    for (const prohibido of [
      'sale por', 'sindicatos', 'préstamo camioneta', 'prestamo camioneta', 'f931', 'fcl',
    ]) {
      expect(texto, `«${prohibido}» sigue en la lista`).not.toContain(prohibido)
    }
    // «SAC» se busca como PALABRA ENTERA y no como texto suelto: «Goldstein Automores SACI» es una
    // compra real de una concesionaria, y un `includes('sac')` la daría por prohibida — el mismo
    // falso positivo que la regla pura ya evita comparando el nombre completo.
    const crudo = await tabla.innerText()
    for (const proveedor of ['SAC', 'Sueldos', 'ARCA', 'FCL']) {
      expect(
        new RegExp(`\\b${proveedor}\\b`).test(crudo),
        `el proveedor «${proveedor}» sigue en la lista`,
      ).toBe(false)
    }
  })

  test('el contador «Todo» es el de las compras de obra, y la cuenta cierra contra la pestaña', async ({ page }) => {
    // EL TOTAL SE PREGUNTA, NO SE CLAVA. La primera versión de este test afirmaba «< 955» porque
    // eso medía la pestaña el 08/09 a la mañana; a la tarde otro trabajo retiró las 28 filas
    // Canceladas y quedaron 927 — el test se puso rojo sin que ninguna regla se hubiera roto. La
    // pestaña es un dato VIVO: lo que se afirma es la relación, y el total sale de la base.
    const { count } = await servicio()
      .from('compra_sheet').select('fila', { count: 'exact', head: true })
    expect(count, 'no pude contar compra_sheet').not.toBeNull()

    await page.goto(RUTA)
    const todo = Number((await page.getByTestId('chip-todo-cuenta').innerText()).replace(/\D/g, ''))
    const fuera = Number((await page.getByTestId('compras-fuera-de-obra').innerText()).replace(/\D/g, ''))
    expect(todo).toBeGreaterThan(0)
    expect(fuera).toBeGreaterThan(0)
    // La lista más lo declarado afuera SON la pestaña: ni una fila se pierde en el camino.
    expect(todo + fuera).toBe(count)
    // Y el corte descontó de verdad: si `todo` fuera el total, la regla no estaría enchufada.
    expect(todo).toBeLessThan(count as number)
  })

  test('el filtro «A pagar» tampoco cuenta impuestos ni sueldos', async ({ page }) => {
    await page.goto(`${RUTA}?f=aPagar&todo=1`)
    const texto = (await page.getByTestId('tabla-compras-sheet').innerText()).toLowerCase()
    expect(texto).not.toContain('arca')
    expect(texto).not.toContain('sale por')
  })
})
