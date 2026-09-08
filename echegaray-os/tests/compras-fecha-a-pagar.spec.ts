import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN, servicio } from './util/identidades'

// LA COLUMNA «A PAGAR» DICE LO MISMO QUE LA PESTAÑA — 08/09/2026.
//
// ═══ EL PEDIDO, TEXTUAL DEL DUEÑO ═══
//
// *«agregar la columna de fecha a pagar en sección Compras de app.ecsas.com.ar, que tiene que ser la
// misma que dice la pestaña Compras del Sheet Flujo de Fondos»*.
//
// ═══ QUÉ PRUEBA ESTE ARCHIVO QUE LOS TESTS PUROS NO PUEDEN ═══
//
// `formato.test.ts` prueba que `04/09/2026` se escribe con sus ceros y su año, y el canónico prueba
// que el componente lee `f.fecha_prevista`. Ninguno de los dos puede decir que la fecha QUE SE VE EN
// LA PANTALLA es la del Sheet: entre la celda y el navegador hay una consulta con su lista de
// columnas, una caché de datos y el GRANT de Postgres sobre la columna. Cualquiera de los tres deja
// la columna vacía sin poner rojo ni un test de unidad ni el typecheck — y una columna de fechas
// vacía se lee como «esta compra no tiene fecha», que es una afirmación falsa sobre la empresa.
//
// La comparación es contra `compra_sheet`, que es la réplica que escribe `sync-compras.mjs`, y esa
// réplica ya se verificó contra el Sheet vivo leyendo `Compras!A3:BZ6000` sin formato: columna Q,
// rótulo «Fecha prevista de pago (día)», serial 46269 → `2026-09-04` en las dos puntas.
//
// NO SE CLAVA NINGUNA FILA. La pestaña es un dato vivo —el 08/09 pasó de 955 a 927 filas en una
// tarde—: se afirma la RELACIÓN entre lo que se ve y lo que hay en la base, no un valor concreto que
// mañana cambia sin que se rompa ninguna regla.
//
// Es de LECTURA: no escribe en la base ni en el Sheet.

const RUTA = '/administracion/compras'

/** `2026-09-04` → `04/09/2026`. La misma cuenta que `fechaCompleta`, escrita a mano a propósito. */
const esperado = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

test.describe('la fecha a pagar de la pantalla es la de la pestaña Compras', () => {
  test.beforeEach(async ({ page }) => {
    await entrarComo(page, ADMIN.email, ADMIN.password)
  })

  test('cada fila muestra la fecha_prevista que tiene en compra_sheet', async ({ page }) => {
    test.setTimeout(120000)
    const { data, error } = await servicio()
      .from('compra_sheet').select('fila, fecha_prevista, fecha_caja')
    expect(error, 'no pude leer compra_sheet').toBeNull()
    const prevista = new Map((data ?? []).map((c) => [c.fila as number, c.fecha_prevista as string | null]))
    const caja = new Map((data ?? []).map((c) => [c.fila as number, c.fecha_caja as string | null]))
    expect(prevista.size, 'compra_sheet vino vacía: sin fuente no hay nada que comparar').toBeGreaterThan(0)

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(RUTA)
    await expect(page.getByTestId('tabla-compras-sheet')).toBeVisible()

    // EL RÓTULO, DESPUÉS DE ESTADO Y ANTES DEL IMPORTE. A 1440px la pantalla corre la variante
    // angosta —el corte es 1459— así que CONCEPTO, COMPROBANTE y FORMA DE PAGO están ocultas y no
    // aparecen en el `innerText`. Que «A pagar» SÍ aparezca acá es justamente la decisión que se
    // quería probar: es el dato que el dueño pidió y no se suelta en el primer corte, que es el que
    // corre en casi todas las pantallas reales. Su lugar exacto entre ESTADO y FORMA DE PAGO lo
    // prueba el canónico sobre el código, que es donde ese orden está escrito.
    const cabecera = await page.getByTestId('tabla-compras-sheet').locator('> div').first().innerText()
    expect(cabecera.replace(/\s+/g, ' ')).toContain('ESTADO A PAGAR IMPORTE')

    const celdas = page.getByTestId('compra-a-pagar')
    const cuantas = await celdas.count()
    expect(cuantas, 'no se dibujó ninguna celda «A pagar»').toBeGreaterThan(0)

    // LA COLUMNA NO PUEDE ESTAR ENTERA EN BLANCO. Si el GRANT o la consulta se cayeran, cada celda
    // coincidiría con su `null` de la BD y la comparación de abajo pasaría feliz sobre una columna
    // vacía: un control validado contra la misma información que produce.
    let conFecha = 0
    let comparadas = 0

    for (let i = 0; i < Math.min(cuantas, 40); i += 1) {
      const celda = celdas.nth(i)
      // Se sube por `role="row"` y NO por `[data-testid^="compra-"]`: la propia celda se llama
      // `compra-a-pagar` y `closest` se incluye a sí mismo, así que ese selector devolvía la celda y
      // el número de fila salía `NaN`.
      const fila = Number(await celda.evaluate(
        (n) => n.closest('[role="row"]')?.getAttribute('data-testid')?.replace('compra-', ''),
      ))
      expect(Number.isFinite(fila), 'una celda «A pagar» quedó fuera de su fila').toBe(true)
      const iso = prevista.get(fila)
      const visto = (await celda.innerText()).trim()
      if (iso) {
        expect(visto, `fila ${fila}: la pantalla dice «${visto}» y la pestaña dice ${iso}`).toBe(esperado(iso))
        conFecha += 1
      } else {
        // VACÍO ES VACÍO. En el Sheet esa celda está vacía; un «—» o un «sin fecha» se leería como
        // un dato de la fuente.
        expect(visto, `fila ${fila}: la pestaña no trae fecha y la pantalla escribió «${visto}»`).toBe('')
      }
      // Y NO ES LA FECHA DE CAJA. Coinciden en casi todas las filas, así que la única forma de
      // distinguirlas es mirar las que difieren — cuando alguna esté a la vista, ésta lo caza.
      const cajaIso = caja.get(fila)
      if (cajaIso && cajaIso !== iso) {
        expect(visto, `fila ${fila}: se está mostrando la FECHA DE CAJA (${cajaIso}), que es cuándo salió la plata`)
          .not.toBe(esperado(cajaIso))
      }
      comparadas += 1
    }

    expect(comparadas, 'no se comparó ninguna fila').toBeGreaterThan(0)
    expect(conFecha, 'ninguna de las filas visibles trajo fecha: la columna llegó vacía a la pantalla')
      .toBeGreaterThan(0)

    await page.screenshot({ path: 'tests/qa-shots/compras-a-pagar-1440.png' })
  })
})
