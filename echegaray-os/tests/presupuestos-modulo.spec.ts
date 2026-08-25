import { test, expect } from '@playwright/test'
import { entrar } from './util/obras-e2e'
import { JEFE } from './util/identidades'

// EL MÓDULO DE PRESUPUESTOS, EN EL NAVEGADOR.
//
// ═══ POR QUÉ LA MITAD DE ESTE ARCHIVO SE SALTEA HOY (21/08/2026) ═══
//
// `public.cotizaciones` tiene RLS pero NO tiene `GRANT` para `authenticated`. PostgREST responde
// 403 en la tabla y en las dos vistas que la leen (`cotizacion_cascada`,
// `cotizacion_partida_valorizada`), así que un usuario real —incluso Dirección— no puede leer un
// solo presupuesto. Medido: `has_table_privilege('authenticated','public.cotizaciones','SELECT')`
// devuelve `false`.
//
// Lo que falta es UNA línea de migración:
//
//     grant select, insert, update, delete on public.cotizaciones to authenticated;
//
// Escribir estos tests como si la lectura anduviera los dejaría rojos por un motivo que no es un
// defecto del módulo, y un rojo permanente enseña a ignorar los rojos. Escribirlos con `skip`
// condicional los deja LISTOS: el día que se aplique el grant, se ponen verdes solos y prueban el
// módulo. Hasta entonces, lo que sí se mide es lo que sí funciona: el portero y el cartel de error.

const RUTA = '/presupuestos'

async function hayPermisoDeTabla(page: import('@playwright/test').Page): Promise<boolean> {
  await page.goto(RUTA)
  // Se espera a que la pantalla haya RESUELTO —tabla o cartel de error—, no a un título: con el
  // error montado hay dos `h1` («Presupuestos» y «No se pudo cargar…») y el localizador estricto
  // falla por ambigüedad, que es un rojo que no habla de permisos.
  await expect(page.getByTestId('tabla-presupuestos').or(page.getByTestId('estado-error')).first())
    .toBeVisible({ timeout: 20000 })
  return (await page.getByTestId('estado-error').count()) === 0
}

test.describe('presupuestos · lo que anda hoy', () => {
  test('un jefe de obra ve «sin permiso», no una cartera vacía', async ({ page }) => {
    // EL DEFECTO QUE ATRAPA: sin este portero, `cotizacion_partida` le devuelve cero filas por RLS
    // y la cascada se dibujaría en CERO. Un precio de venta de $ 0 producido por un permiso es peor
    // que una puerta cerrada: parece un dato.
    await page.goto('/login')
    await page.fill('input[name="email"]', JEFE.email)
    await page.fill('input[name="password"]', JEFE.password)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(dashboard|flujo-caja|obras)/, { timeout: 60000 })

    await page.goto(RUTA)
    await expect(page.getByTestId('sin-permiso')).toBeVisible()
    await expect(page.getByTestId('sin-permiso')).toContainText('No es que no haya datos')
    // Y no se dibuja la tabla debajo fingiendo una cartera vacía.
    await expect(page.getByTestId('tabla-presupuestos')).toHaveCount(0)
    await expect(page.getByTestId('kpis-cartera')).toHaveCount(0)
  })

  // SUBIÓ A NIVEL 1 EL 25/08 (00 · Home Navegación v2). Estaba en la barra de Administración, entre
  // Usuarios y Personas; ahora vive en la barra de la aplicación, al lado de Obras, con el motivo
  // escrito en su `title`: «Comercial, no administración: vive al lado de Obras».
  test('la solapa Presupuestos vive en la barra de la aplicación, no en la de Administración', async ({ page }) => {
    await entrar(page)
    await page.goto('/clientes')
    await expect(page.getByTestId('nav-admin-secciones-presupuestos')).toHaveCount(0)
    const solapa = page.getByTestId('nav-areas').getByTestId('nav-presupuestos')
    await expect(solapa).toBeVisible()
    await solapa.click()
    await page.waitForURL(/\/presupuestos/)
    await expect(solapa).toHaveAttribute('aria-current', 'page')
  })

  test('cuando la base rechaza la lectura, la pantalla muestra SU mensaje', async ({ page }) => {
    // Un error no se dibuja como un vacío. Y el mensaje de la fuente no se reemplaza por una frase
    // amable: «permission denied for table cotizaciones» dice exactamente qué arreglar.
    await entrar(page)
    const anda = await hayPermisoDeTabla(page)
    test.skip(anda, 'la base ya deja leer cotizaciones: este control mide el estado anterior')
    await expect(page.getByTestId('estado-error')).toBeVisible()
    await expect(page.getByTestId('estado-error')).toContainText('permission denied for table cotizaciones')
    await expect(page.getByTestId('tabla-presupuestos')).toHaveCount(0)
  })
})

test.describe('presupuestos · el módulo, cuando la base deje leerlo', () => {
  test('la cartera muestra sus KPI y su tabla', async ({ page }) => {
    await entrar(page)
    test.skip(!(await hayPermisoDeTabla(page)), 'falta el grant sobre public.cotizaciones')
    await expect(page.getByTestId('kpis-cartera')).toBeVisible()
    await expect(page.getByTestId('tabla-presupuestos')).toBeVisible()
  })

  test('el buscador de la cartera filtra al teclear, sin Enter ni botón', async ({ page }) => {
    await entrar(page)
    test.skip(!(await hayPermisoDeTabla(page)), 'falta el grant sobre public.cotizaciones')
    const total = await page.getByTestId('fila-presupuesto').count()
    test.skip(total < 2, 'hacen falta al menos dos presupuestos para ver que la lista se acorta')
    const texto = await page.getByTestId('fila-presupuesto').first().innerText()
    const palabra = texto.split(/\s+/).find((p) => p.replace(/[^a-záéíóúñ]/gi, '').length >= 3)!
    await page.getByTestId('buscador-presupuestos').fill('')
    await page.getByTestId('buscador-presupuestos').pressSequentially(
      palabra.replace(/[^a-záéíóúñ]/gi, '').slice(0, 3), { delay: 60 })
    await expect(page.getByTestId('fila-presupuesto')).not.toHaveCount(0)
    expect(await page.getByTestId('fila-presupuesto').count()).toBeLessThanOrEqual(total)
  })

  test('un presupuesto sin partidas NO publica un precio de venta de $ 0', async ({ page }) => {
    // EL DEFECTO QUE ATRAPA: `cotizacion_cascada` hace `coalesce(sum(...), 0)` para poder agrupar.
    // Ese cero no lo cargó nadie. Publicado en la columna MONTO diría que la empresa ofertó gratis.
    await entrar(page)
    test.skip(!(await hayPermisoDeTabla(page)), 'falta el grant sobre public.cotizaciones')
    const filas = page.getByTestId('fila-presupuesto')
    const n = await filas.count()
    test.skip(n === 0, 'no hay presupuestos cargados')
    for (let i = 0; i < n; i += 1) {
      await expect(filas.nth(i)).not.toContainText('$ 0')
    }
  })
})
