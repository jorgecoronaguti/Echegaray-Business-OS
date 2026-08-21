import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { entrarComo } from './util/login'
import { JEFE } from './util/identidades'

// LAS CAPTURAS DE LAS SEIS PANTALLAS DEL JEFE, A 390px — el ancho de un iPhone 13/14/15.
//
// Un `expect(algo).toBeVisible()` no prueba que la pantalla se vea bien: prueba que un nodo existe.
// Estas capturas son para MIRAR, y por eso van a `capturas/jefe/` con el nombre de la pantalla del
// contrato. Lo que además se verifica acá con reglas —y no a ojo— es lo que a ojo no se ve:
// el logo que carga de verdad, los objetivos táctiles, y que en ninguna de las seis viaje un peso.

// A `test-results/`, como el spec de conformidad: es la carpeta de salida de las pruebas y está
// ignorada por git. Una captura versionada envejece en silencio —queda en el repo mostrando una
// pantalla que ya cambió— y encima engorda cada clon con medio megabyte por corrida.
const CARPETA = 'test-results/jefe'
const OBRA = 'san-francisco'

test.beforeAll(() => { mkdirSync(CARPETA, { recursive: true }) })

test.use({ viewport: { width: 390, height: 900 } })

// EL TIEMPO ES DEL SERVIDOR DE DESARROLLO, NO DE LA PANTALLA.
//
// Cada uno de estos tests recorre las seis rutas, y contra `next dev` la primera visita a una ruta
// la COMPILA: 30 s por navegación se agotan en la ruta que le tocó ser la primera, y el rojo no
// dice nada sobre el código. Contra un `build` la misma vuelta tarda segundos. Se sube el techo en
// vez de bajar la exigencia — un test que falla por el compilador enseña a ignorar los rojos.
test.describe.configure({ mode: 'serial', timeout: 240_000 })

const PANTALLAS: [string, string][] = [
  ['J01-hoy', `/obra/hoy?obra=${OBRA}`],
  ['J02-tareas', `/obra/tareas?obra=${OBRA}`],
  ['J04-avance-masivo', `/obra/avance-masivo?obra=${OBRA}`],
  ['J05-personas', `/obra/personas?obra=${OBRA}`],
]

// La tarea con la que se prueba J03 sale del filtro EN CURSO, no de la lista completa: en esta obra
// la primera de la lista está al 100 % y la pantalla muestra —correctamente— «Sin cambios». Esa es
// la variante degenerada; la que hay que poder mirar es la que todavía se puede mover.
async function tareaEnCurso(page: Page): Promise<string> {
  await page.goto(`/obra/tareas?obra=${OBRA}&filtro=curso`)
  const href = await page.getByTestId('tarea').first().getAttribute('href')
  if (href) return href
  await page.goto(`/obra/tareas?obra=${OBRA}`)
  return (await page.getByTestId('tarea').first().getAttribute('href')) ?? `/obra/avance?obra=${OBRA}`
}

test('las seis pantallas del jefe, a 390px', async ({ page }) => {
  await entrarComo(page, JEFE.email, JEFE.password)

  for (const [nombre, ruta] of PANTALLAS) {
    await page.goto(ruta)
    await expect(page.getByTestId('shell-jefe')).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${CARPETA}/${nombre}.png`, fullPage: true })
  }

  // J03 se abre desde una tarea real: sin `?actividad` la pantalla dice, correctamente, que falta
  // elegirla — y una captura de ese cartel no muestra la pantalla que hay que mirar.
  await page.goto(await tareaEnCurso(page))
  await expect(page.getByTestId('guardar-avance')).toBeVisible()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${CARPETA}/J03-avance.png`, fullPage: true })

  // J06 igual: el frente se elige desde Hoy.
  await page.goto(`/obra/hoy?obra=${OBRA}`)
  const frente = await page.getByTestId('frente').first().getAttribute('href')
  await page.goto(frente ?? `/obra/frente?obra=${OBRA}`)
  await expect(page.getByTestId('frente-tareas')).toBeVisible()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${CARPETA}/J06-frente.png`, fullPage: true })
})

test('EL LOGO ES EL OFICIAL Y CARGA DE VERDAD: no un 307, no una «E»', async ({ page }) => {
  // El defecto que atrapa: `public/marca/` pasa por el guard de sesión del middleware, y sin estar
  // en la lista blanca devuelve un 307 al login. La pantalla se ve «bien» —hay un hueco de 22px— y
  // el logo no está. Medido con la respuesta HTTP, no mirando el DOM.
  await entrarComo(page, JEFE.email, JEFE.password)
  const r = await page.request.get('/marca/isotipo.png')
  expect(r.status()).toBe(200)
  expect(Number(r.headers()['content-length'] ?? '0')).toBeGreaterThan(500)

  await page.goto(`/obra/hoy?obra=${OBRA}`)
  const logo = page.locator('header img').first()
  await expect(logo).toHaveAttribute('src', '/marca/isotipo.png')
  // `naturalWidth` es 0 cuando el navegador pidió la imagen y no la pudo decodificar.
  expect(await logo.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
})

test('TODO LO TOCABLE MIDE 44px O MÁS, en las seis', async ({ page }) => {
  // El defecto que atrapa: un enlace de 30px se falla con guante, parado, en obra. El mínimo del
  // sistema (`LAYOUT_RESPONSIVE.md` §Mobile) es 44; la primaria y los campos, 48.
  await entrarComo(page, JEFE.email, JEFE.password)
  const rutas = [...PANTALLAS.map(([, r]) => r), `/obra/frente?obra=${OBRA}`, await tareaEnCurso(page)]
  for (const ruta of rutas) {
    await page.goto(ruta)
    await expect(page.getByTestId('shell-jefe')).toBeVisible()
    const chicos = await page.evaluate(() => {
      const malos: string[] = []
      for (const el of document.querySelectorAll('a[href], button, input, select, textarea')) {
        const r = el.getBoundingClientRect()
        // Lo invisible no se toca; el `select` del cambio de obra es transparente y mide el bloque.
        if (r.width === 0 || r.height === 0) continue
        if (r.height < 44) malos.push(`${el.tagName} «${(el.textContent ?? '').trim().slice(0, 30)}» ${Math.round(r.height)}px`)
      }
      return malos
    })
    expect(chicos, `objetivos táctiles chicos en ${ruta}`).toEqual([])
  }
})

test('NINGUNA DE LAS SEIS PUBLICA UN PESO NI PIDE UNA COLUMNA DE DINERO', async ({ page }) => {
  // LA PRUEBA DE PERMISO. El jefe de obra no ve precio ni margen: lo hace cumplir `ve_economia()` en
  // la base, y esto verifica el otro lado — que la pantalla ni siquiera lo pida.
  //
  // Se mide en DOS lugares y con dos reglas distintas, porque son dos preguntas distintas:
  //
  //   · el TEXTO RENDERIZADO, con el símbolo de peso: lo que el jefe ve, incluido lo que quedó
  //     fuera del viewport. `innerText` y no el HTML entero — el payload de React usa `$1`, `$2`
  //     como referencias internas y contra el HTML crudo la regla daba rojo por ruido del framework.
  //   · el HTML ENTERO, con los NOMBRES de las columnas económicas: si alguna viajó en el payload,
  //     el jefe la recibió aunque no se dibuje, y eso ya es una fuga.
  const PLATA = /(monto_contratado|costo_real|margen_sobre_contratado|certificado|facturado|monto_presupuestado)/i
  await entrarComo(page, JEFE.email, JEFE.password)
  const rutas = [...PANTALLAS.map(([, r]) => r), `/obra/frente?obra=${OBRA}`, await tareaEnCurso(page)]
  for (const ruta of rutas) {
    await page.goto(ruta)
    await expect(page.getByTestId('shell-jefe')).toBeVisible()
    const texto = await page.locator('body').innerText()
    expect(texto, `importe en pesos a la vista en ${ruta}`).not.toMatch(/\$\s?\d/)
    expect(await page.content(), `columna economica en el payload de ${ruta}`).not.toMatch(PLATA)
  }
})
