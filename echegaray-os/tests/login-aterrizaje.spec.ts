import { test, expect } from '@playwright/test'
import { CAMPO, JEFE, ADMIN } from './util/identidades'

// EL ATERRIZAJE EXACTO DE CADA ROL, EN EL NAVEGADOR — sin uniones.
//
// ═══ POR QUÉ NO ALCANZABA CON `ATERRIZAJE` (auditoría del 08/09/2026) ═══
//
// `tests/util/login.ts` exporta `ATERRIZAJE = /\/(administracion|obras|clientes|flujo-caja|hoy)/`, y
// ese regex está bien para lo que hace: los otros veinte specs sólo necesitan saber que la sesión
// quedó abierta antes de ir a lo suyo. Pero es una UNIÓN, así que acepta `/obras` y `/administracion`
// para el mismo rol: si mañana vuelve `redirect(rol === 'campo' ? '/hoy' : '/obras')`, esos specs
// siguen verdes y el defecto vuelve entero con la suite en verde.
//
// Acá se compara la ruta EXACTA, rol por rol. Es la mitad de ejecución del cableado; la otra mitad
// —que la acción siga llamando a la regla en vez de elegir una ruta— la vigila por fuente
// `src/features/auth/services/cableado-del-ingreso.test.ts`, que corre en `npm run orq:test` y no
// necesita un navegador.
//
// ES UN CONTRATO, NO UNA PREFERENCIA. `/administracion` para jefe y dirección no es lo que a esta
// pantalla le gusta: es `destinoDeLaHome()`, la ÚNICA definición de inicio del sistema, la misma que
// abre el isotipo del header. Si estas tres líneas se ponen en rojo, o cambió la definición —y hay
// que cambiarla en `navegacion.ts`, no acá— o el login volvió a decidir por su cuenta.

/** El inicio de cada identidad. Sale de `destinoDeLaHome`, probada en `navegacion.test.ts`. */
const INICIO = [
  { que: 'campo', cred: CAMPO, ruta: '/hoy' },
  // `jefe_obra` es nivel Administración desde la migración 20260819T4900: su primera solapa —la que
  // la barra pinta activa— es Administración, no Obras.
  { que: 'jefe de obra', cred: JEFE, ruta: '/administracion' },
  { que: 'dirección', cred: ADMIN, ruta: '/administracion' },
]

for (const { que, cred, ruta } of INICIO) {
  test(`${que} entra y aterriza EXACTAMENTE en ${ruta}`, async ({ page }) => {
    test.setTimeout(90000)
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Entrá al OS de Echegaray' })).toBeVisible()
    await page.fill('input[name="email"]', cred.email)
    await page.fill('input[name="password"]', cred.password)
    await page.click('button[type="submit"]')

    // `waitForURL` con la ruta exacta y sin comodín: `/obras` NO satisface `/administracion`.
    await page.waitForURL((u) => new URL(u).pathname === ruta, { timeout: 60000 })
    expect(new URL(page.url()).pathname, `${que} aterrizó fuera de su inicio`).toBe(ruta)
  })
}

test('el volver se respeta cuando el rol puede ver la ruta, y se descarta cuando no', async ({ page }) => {
  test.setTimeout(120000)
  // `/mi-cuenta` la abren los cuatro roles: es el caso donde el deep link TIENE que sobrevivir. Hasta
  // el 08/09/2026 no sobrevivía nunca — el `?volver=` que pone el middleware no lo leía nadie.
  await entrar(page, JEFE, '/login?volver=%2Fmi-cuenta')
  expect(new URL(page.url()).pathname, 'el volver se perdió otra vez').toBe('/mi-cuenta')

  // `/reportes` está en `RUTAS_SOLO_ECONOMIA`: el jefe de obra no la abre. Sin la comprobación por
  // rol habría una cadena login → /reportes → middleware → inicio, que el router del cliente no
  // termina de recorrer. Tiene que aterrizar DIRECTO en su inicio.
  await page.context().clearCookies()
  await entrar(page, JEFE, '/login?volver=%2Freportes')
  expect(new URL(page.url()).pathname, 'el jefe entró a una ruta que su rol no ve').toBe('/administracion')

  // Y un `volver` que sale del sitio no es un trampolín con la sesión recién creada en el bolsillo.
  await page.context().clearCookies()
  await entrar(page, JEFE, '/login?volver=%2F%2Fevil.com')
  expect(new URL(page.url()).host, 'el login se usó de trampolín a otro dominio')
    .toBe(new URL(page.url()).host)
  expect(new URL(page.url()).pathname).toBe('/administracion')
})

test('cerrar sesión vuelve a la puerta Y LO DICE', async ({ page }) => {
  test.setTimeout(90000)
  await entrar(page, ADMIN, '/login')
  await page.goto('/')
  await page.getByTestId('avatar-usuario').click()
  await page.getByTestId('logout-button').click()
  await page.waitForURL(/\/login/, { timeout: 60000 })
  // Volvía a `/login` pelado —la misma pantalla que al llegar—, así que cerrar la sesión parecía no
  // haber hecho nada. El cliente del portal ya tenía su despedida; la gente de adentro no.
  await expect(page.getByTestId('aviso-cerraste')).toContainText('Cerraste sesión')
})

async function entrar(page: import('@playwright/test').Page, cred: { email: string; password: string }, url: string) {
  await page.goto(url)
  await page.fill('input[name="email"]', cred.email)
  await page.fill('input[name="password"]', cred.password)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !new URL(u).pathname.startsWith('/login'), { timeout: 60000 })
}
