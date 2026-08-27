import { test, expect, type Page } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// ═══ TODOS LOS BUSCADORES FILTRAN AL TECLEAR ═══
//
// El contrato de diseño, literal: *"Buscadores filtran al teclear, sin Enter ni botón Buscar"*
// (`github.md`, y `design/CIERRE.md`). Antes del 21/08/2026 la misma lupa tenía TRES
// comportamientos: Clientes y Cuentas filtraban al teclear; Obras, Personal y Proveedores exigían
// Enter sin ninguna señal visual de que había que apretarlo; y cuatro pantallas no tenían buscador.
//
// Ninguno de estos tests toca Enter ni hace clic en un botón. Sólo escriben. Si alguna de estas
// cajas vuelve a ser un `form` GET —o si a alguna se le saca el buscador— esto se pone rojo.
//
// LO QUE ESTE ARCHIVO NO PUEDE AFIRMAR: que el resultado del filtro sea el correcto. Eso lo prueban
// las funciones puras (`busqueda.test.ts`, `filtroObras.test.ts`, `presencia.test.ts`,
// `cuadrillasService.test.ts`), que no dependen de qué haya cargado en la base el día que se corre.
// Acá se prueba el COMPORTAMIENTO: que escribir, solo, cambia lo que se ve.

/** Las tres primeras letras de una fila que exista de verdad. Ningún test puede depender de que
 *  esté cargada «Messina» o «Gómez»: se toma de la pantalla. */
async function tresLetrasDe(page: Page, filas: string): Promise<string> {
  const textos = await page.locator(`[data-testid="${filas}"]`).first().innerText()
  const palabra = textos.split(/\s+/).find((p) => p.replace(/[^a-záéíóúñ]/gi, '').length >= 3)
  return palabra!.replace(/[^a-záéíóúñ]/gi, '').slice(0, 3)
}

/**
 * ESCRIBIR, Y NADA MÁS. `pressSequentially` manda tecla por tecla como una persona; `fill` pega el
 * texto de una. Se usa el primero a propósito: es el que prueba que el filtro no espera un evento
 * de envío.
 */
async function teclear(page: Page, campo: string, texto: string) {
  // Se vacía primero: `pressSequentially` AGREGA al final. Varias de estas pantallas pueden abrir
  // con el campo ya escrito —`/obras` restaura la última vista desde una cookie— y tecleando encima
  // el test buscaría «Messinames», que no es lo que dice estar probando.
  await page.getByTestId(campo).fill('')
  await page.getByTestId(campo).pressSequentially(texto, { delay: 60 })
}

test.describe('los buscadores con estado en la URL', () => {
  test('Personal filtra al teclear y el filtro queda en la URL', async ({ page }) => {
    await entrar(page)
    await page.goto('/administracion/personas')
    const total = await page.getByTestId('fila-persona').count()
    test.skip(total < 2, 'hacen falta al menos dos personas cargadas para ver que la lista se acorta')

    const letras = await tresLetrasDe(page, 'fila-persona')
    await teclear(page, 'buscar-persona', letras)
    await page.waitForURL(/[?&]q=/)
    // EL FILTRO SE COMPARTE: la URL es la vista. Es la regla del design system («el estado vive en
    // la URL y es compartible») y lo que se perdería si esto se resolviera con `useState`.
    expect(page.url()).toContain(`q=${encodeURIComponent(letras).replace(/%20/g, '+')}`)
    await expect(page.getByTestId('fila-persona')).not.toHaveCount(0)
    expect(await page.getByTestId('fila-persona').count()).toBeLessThanOrEqual(total)
  })

  test('Personal conserva el filtro de plantel puesto mientras se busca', async ({ page }) => {
    // El defecto que atrapa: el buscador que se lleva puesto el resto del estado. Escribir con «En
    // obra» seleccionado no puede devolver la vista al plantel completo — el que busca vería filas
    // que había filtrado a propósito y no tendría cómo saber por qué volvieron.
    await entrar(page)
    await page.goto('/administracion/personas?f=en_obra')
    await teclear(page, 'buscar-persona', 'a')
    await page.waitForURL(/[?&]q=a/)
    expect(page.url()).toContain('f=en_obra')
  })

  test('Proveedores filtra al teclear', async ({ page }) => {
    await entrar(page)
    await page.goto('/administracion/proveedores')
    const total = await page.getByTestId('fila-proveedor').count()
    test.skip(total < 2, 'hacen falta al menos dos proveedores cargados')

    const letras = await tresLetrasDe(page, 'fila-proveedor')
    await teclear(page, 'buscar-proveedor', letras)
    await page.waitForURL(/[?&]q=/)
    await expect(page.getByTestId('fila-proveedor')).not.toHaveCount(0)
  })

  // ═══ POR QUÉ ESTAS DOS SE PRUEBAN CONTRA UN TEXTO QUE NO EXISTE ═══
  //
  // Cuadrillas y «En obra ahora» dependen de lo que haya cargado el día que se corre: hay una sola
  // cuadrilla y hoy puede no haber marcado nadie. Un test que se salta solo cuando falta el dato no
  // prueba nada, así que se prueba al revés — se teclea algo que NO puede coincidir con nada y se
  // exige que la lista se vacíe Y que la pantalla diga por qué. Eso sí depende de que el filtro
  // corra al teclear, y no depende de qué haya cargado.

  test('Cuadrillas —que no tenía buscador— filtra al teclear', async ({ page }) => {
    await entrar(page)
    await page.goto('/administracion/personas/cuadrillas')
    const total = await page.getByTestId('fila-cuadrilla').count()
    test.skip(total < 1, 'no hay ninguna cuadrilla cargada: no hay lista que filtrar')

    await teclear(page, 'buscar-cuadrilla', 'zzq')
    await page.waitForURL(/[?&]q=zzq/)
    await expect(page.getByTestId('fila-cuadrilla')).toHaveCount(0)
    // LA LISTA VACÍA DICE POR QUÉ. Una tabla en blanco sin explicación se lee como «no hay
    // cuadrillas cargadas», que es una afirmación sobre la empresa y no sobre la búsqueda.
    await expect(page.getByTestId('cuadrillas-vacio')).toContainText('coincide con «zzq»')

    // Y BORRAR DEVUELVE LA LISTA, sin apretar nada.
    await page.getByTestId('buscar-cuadrilla').fill('')
    await expect(page.getByTestId('fila-cuadrilla')).toHaveCount(total)
  })

  test('«En obra ahora» —que no tenía buscador— filtra al teclear', async ({ page }) => {
    await entrar(page)
    await page.goto('/administracion/personas/en-obra')
    const marcas = await page.getByTestId('fila-presencia').count()
    const esperados = await page.getByTestId('fila-esperado').count()
    test.skip(marcas + esperados < 1, 'hoy no hay ni marcas ni asignaciones vigentes que filtrar')

    await teclear(page, 'buscar-presencia', 'zzq')
    await page.waitForURL(/[?&]q=zzq/)
    await expect(page.getByTestId('fila-presencia')).toHaveCount(0)
    await expect(page.getByTestId('fila-esperado')).toHaveCount(0)
    // «Nadie coincide» NUNCA puede confundirse con «nadie marcó hoy»: son dos hechos distintos y
    // uno de ellos decide discusiones de asistencia.
    await expect(page.getByTestId('presencia-sin-resultado')).toContainText('coincide con «zzq»')

    await page.getByTestId('buscar-presencia').fill('')
    await expect(page.getByTestId('fila-presencia')).toHaveCount(marcas)
    await expect(page.getByTestId('fila-esperado')).toHaveCount(esperados)
  })

  test('el buscador está en todas, con la misma caja', async ({ page }) => {
    // La lupa es UNA. Este test no mira estilos: mira que el control EXISTA donde el contrato dice
    // que tiene que estar, incluidas las cuatro pantallas que no lo tenían.
    await entrar(page)
    const donde: [string, string][] = [
      ['/obras', 'buscar-obra'],
      ['/administracion/personas', 'buscar-persona'],
      ['/administracion/proveedores', 'buscar-proveedor'],
      ['/administracion/personas/cuadrillas', 'buscar-cuadrilla'],
      ['/administracion/personas/en-obra', 'buscar-presencia'],
      // `/administracion` SALIÓ DE LA LISTA (24/08/2026). Tenía un buscador global de cliente,
      // persona y proveedor que el canónico 00 no dibuja: la lupa global vive en la barra de
      // aplicación, no dentro de la página. La entrada de Administración ya no tiene campo propio.
    ]
    for (const [ruta, campo] of donde) {
      await page.goto(ruta)
      await expect(page.getByTestId(campo), `falta el buscador en ${ruta}`).toBeVisible()
    }
  })
})

// ═══ LOS BUSCADORES EN MEMORIA SE FUERON CON SUS PANTALLAS (27/08/2026) ═══
//
// Acá se medían los dos filtros que corrían sin debounce y sin URL: el de `/operarios` y el de
// «Costo por obra» (`/control-obras/costos`). Las dos rutas eran huérfanas —ningún `href` en todo
// `src/` llegaba a ellas— y se borraron: `/operarios` la reemplazó `/administracion/usuarios` y la
// asignación de comprobantes a obra vive ahora en `/administracion/compras`.
//
// LO QUE ESTO DEJA SIN MEDIR, y es lo que hay que reponer cuando esa pantalla tenga su buscador:
// el filtrado EN MEMORIA, o sea que escribir no navegue ni pida nada al servidor. Los buscadores
// que quedan arriba son los de servidor, con debounce y con la búsqueda en la URL — el otro modo
// no tiene hoy ninguna pantalla donde probarse.
