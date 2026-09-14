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
//
// ═══ ESTOS DOS CASOS MEDÍAN CÓDIGO MUERTO Y UNA DECISIÓN DEROGADA (11/09/2026) ═══
//
// Estaban en rojo sobre `main`, no por este trabajo: comprobado corriendo este mismo archivo contra
// un worktree de `main` limpio, con los dos mismos fallos.
//
//  1 · `bloque-liquidacion` y sus tarjetas viven SÓLO en `BloqueLiquidacion.tsx`, que la pantalla
//      dibuja únicamente cuando la solapa «Pagos» no tiene componente propio. Desde que se registró
//      `SolapaPagos` esa rama no se ejecuta nunca, así que el test esperaba para siempre un nodo que
//      no puede aparecer. La cadena de pago se mudó a la solapa «Pagos» (`pagos-tabla`) y la celda
//      editable del dueño al panel de la persona: la afirma `liquidacion-fidelidad.spec.ts` sobre
//      `panel-celda-efectivoRedondeado`, y el aviso «no pude leer» que este archivo exigía en cero
//      (`liquidacion-error`, también del cuadro fósil) lo afirma allá como `horas-error`.
//      `BloqueLiquidacion` y `CuadroLiquidacion` quedan como capa fósil —nadie los alcanza— y su
//      retiro es un trabajo aparte: `pagos.tsx` y `cierre.tsx` todavía importan `pesos` de ahí.
//
//  2 · `liquidacion-sin-permiso` era el aviso amable que veía quien no liquida. El dueño lo derogó
//      el 09/09/2026: sin nivel administrador la ruta NO EXISTE (`notFound()` en `personas/page.tsx`,
//      antes de leer una sola fila). Un aviso confirma que el módulo está ahí y en qué URL. El test
//      pedía justamente el aviso que la decisión mandó sacar —y `liquidacionSoloAdmin.test.ts` ya
//      exige que no esté—, así que ahora se afirma lo que de verdad tiene que pasar: un 404.

const RUTA = '/administracion/personas?vista=liquidacion&quincena=2026-09-01'

// ═══ CAMBIÓ EL 14/09/2026: «PAGOS» SE RETIRÓ DE «MÁS» ═══
//
// La tabla de Pagos repetía la Quincena columna por columna. La cadena de pago con su total se afirma
// ahora en el cuadro de la Quincena, y los tres totales en «Caja y proyección», que los suma con la
// misma función que el pie. `?solapa=pagos` sigue funcionando: resuelve a «Caja».
test.describe('Liquidación · Administración → Personal', () => {
  test('dirección: la solapa está y la cadena de pago sale con su total', async ({ page }) => {
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto(RUTA)

    // LA SOLAPA EXISTE Y ESTÁ ACTIVA. Si `vistasDe` deja de agregarla, no hay forma de llegar.
    await expect(page.getByTestId('vistas-personal')).toContainText('Liquidación')

    // EL CUADRO TIENE SECCIONES Y SU FILA DE TOTAL. Un cuadro vacío con sesión de dirección sería el
    // síntoma de un permiso faltante, no de una quincena en blanco; el aviso «no pude leer» tiene que
    // estar en cero.
    await expect(page.getByTestId('espejo-tabla')).toBeVisible({ timeout: 60_000 })
    expect(await page.locator('[data-testid^="espejo-seccion-"]').count()).toBeGreaterThan(0)
    await expect(page.getByTestId('espejo-total')).toBeVisible()
    await expect(page.getByTestId('quincena-error')).toHaveCount(0)

    // LAS TRES CIFRAS: las dos primeras dan la tercera. La URL vieja lleva a la sección que las tiene.
    await page.goto(`${RUTA}&solapa=pagos`)
    await expect(page.getByTestId('solapa-caja-nomina')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('por-banco')).toBeVisible()
    await expect(page.getByTestId('efectivo-viernes')).toBeVisible()
    await expect(page.getByTestId('total-quincena')).toBeVisible()
  })

  test('jefe de obra: la ruta de Liquidación no existe para él', async ({ page }) => {
    await entrarComo(page, JEFE.email, JEFE.password)
    // ═══ EL 404 NO SE MIDE CON EL STATUS DE LA RESPUESTA ═══
    //
    // Probado el 11/09/2026: `page.goto(RUTA).status()` devuelve 200. Con el App Router la respuesta
    // empieza a transmitirse con el esqueleto de carga ANTES de que el componente llame a
    // `notFound()`, y el código ya salió con el primer byte. Un test que mire el status da verde con
    // la puerta abierta y rojo con la puerta cerrada: mide exactamente al revés.
    //
    // Lo que sí prueba que la puerta se cerró es la pantalla que queda: el 404 del sistema, y ni un
    // rastro del módulo.
    await page.goto(RUTA)
    await expect(page.getByTestId('estado-no-encontrado')).toBeVisible({ timeout: 30_000 })

    // Y NADA DEL MÓDULO QUEDA EN LA PÁGINA.
    await expect(page.getByTestId('espejo-tabla')).toHaveCount(0)
    await expect(page.getByTestId('solapa-caja-nomina')).toHaveCount(0)
    await expect(page.getByTestId('vistas-personal')).toHaveCount(0)
  })

  test('la solapa Horas (asistencia) sigue en pie para el jefe de obra', async ({ page }) => {
    // El corte no puede llevarse puesto lo que el jefe SÍ tiene que hacer acá: cargar la quincena.
    await entrarComo(page, JEFE.email, JEFE.password)
    await page.goto('/administracion/personas?vista=asistencia&quincena=2026-09-01')
    await expect(page.getByTestId('bloque-asistencia')).toBeVisible()
    await expect(page.getByTestId('vistas-personal')).not.toContainText('Liquidación')
  })
})
