import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN, JEFE } from './util/identidades'

// LA SOLAPA LIQUIDACIÓN, CON UN USUARIO DE ADENTRO — 09/09/2026.
//
// ═══ LO QUE ESTOS CASOS ATRAPAN ═══
//
//  1. Que la pantalla no renderice con sesión real. `typecheck` y `build` no ven una pantalla rota:
//     el módulo lee ocho tablas y cualquier permiso faltante la deja en blanco o la tumba.
//  2. Que el JEFE DE OBRA vea la solapa. Entra a esta misma pantalla a cargar asistencia y
//     `es_administracion()` lo incluye desde el 19/08/2026: si la puerta se afloja, la fuga no
//     necesita que nadie escriba una URL rara.
//  3. Que escribiendo la URL a mano el jefe llegue igual al cuadro. La puerta es la solapa; la
//     cerradura es `ve_economia()` — acá se prueba la puerta, y la cerradura tiene su propio test
//     contra Postgres (`orquestador/lib/liquidacion-rls.pg.test.mjs`).
//
// NADA DE ESTO ESCRIBE: se abre, se lee y se cierra. La celda «EFECTIVO redondeado» no se toca — su
// escritura la prueba la acción, y tipear acá dejaría una fila en una quincena real.

const RUTA = '/administracion/personas?vista=liquidacion&quincena=2026-09-01'

test.describe('Liquidación · Administración → Personal', () => {
  test('dirección: la solapa está, la tarjeta cierra y los cuadros salen', async ({ page }) => {
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto(RUTA)

    // LA SOLAPA EXISTE Y ESTÁ ACTIVA. Si `vistasDe` deja de agregarla, no hay forma de llegar.
    await expect(page.getByTestId('vistas-personal')).toContainText('Liquidación')
    await expect(page.getByTestId('bloque-liquidacion')).toBeVisible()

    // LA TARJETA: las dos primeras dan la tercera. El aviso de que NO cierra no puede estar.
    await expect(page.getByTestId('tarjeta-por-banco')).toBeVisible()
    await expect(page.getByTestId('tarjeta-en-efectivo')).toBeVisible()
    await expect(page.getByTestId('tarjeta-total')).toBeVisible()
    await expect(page.getByTestId('tarjeta-no-cierra')).toHaveCount(0)

    // NINGUNA FUENTE FALLÓ. Un cuadro en cero porque la RLS rechazó la consulta es indistinguible
    // de una quincena sin cargar, y el bloque lo dice con este aviso: acá no puede haber ninguno.
    await expect(page.getByTestId('liquidacion-error')).toHaveCount(0)

    // EL CUADRO DE OBREROS TIENE FILAS Y SU TOTAL. Un cuadro vacío con sesión de dirección sería
    // el síntoma de un permiso faltante, no de una quincena en blanco.
    await expect(page.getByTestId('cuadro-obreros')).toBeVisible()
    await expect(page.getByTestId('total-obreros')).toBeVisible()
    expect(await page.getByTestId('cuadro-obreros').getByTestId('fila-liquidacion').count())
      .toBeGreaterThan(0)

    // LA CELDA DEL DUEÑO ES EDITABLE. No se escribe: se comprueba que existe y no está bloqueada.
    const redondeo = page.getByTestId('cuadro-obreros').locator('input[aria-label="Efectivo redondeado"]').first()
    await expect(redondeo).toBeEnabled()
  })

  test('jefe de obra: no ve la solapa, y por URL directa tampoco ve el cuadro', async ({ page }) => {
    await entrarComo(page, JEFE.email, JEFE.password)
    await page.goto(RUTA)

    await expect(page.getByTestId('vistas-personal')).not.toContainText('Liquidación')
    await expect(page.getByTestId('liquidacion-sin-permiso')).toBeVisible()
    await expect(page.getByTestId('bloque-liquidacion')).toHaveCount(0)
    await expect(page.getByTestId('cuadro-obreros')).toHaveCount(0)
  })

  test('la solapa Asistencia sigue en pie para el jefe de obra', async ({ page }) => {
    // El corte no puede llevarse puesto lo que el jefe SÍ tiene que hacer acá: cargar la quincena.
    await entrarComo(page, JEFE.email, JEFE.password)
    await page.goto('/administracion/personas?vista=asistencia&quincena=2026-09-01')
    await expect(page.getByTestId('bloque-asistencia')).toBeVisible()
    await expect(page.getByTestId('vistas-personal')).not.toContainText('Liquidación')
  })
})
