import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { entrar } from './util/obras-e2e'

// ¿LA LIQUIDACIÓN SE PARECE AL MOCKUP? — la parte que una máquina puede cazar sola.
//
// El dueño, 09/09/2026: *«las que están no son 100 % fieles ni de UX ni de UI a lo enviado en el
// zip liqhs»*. Mirar capturas encuentra la diferencia UNA vez; esto la encuentra siempre.
//
// ═══ QUÉ MIDE Y QUÉ NO ═══
//
// Mide lo que el mockup declara como NÚMERO en un `style=""` inline —alto de fila, alto de
// encabezado, alto de control, tipografía, la ausencia de sombra y de gradiente, y que ningún color
// se salga de la lista del README §2—. NO mide composición ni jerarquía: eso lo mira un humano
// contra las capturas que este mismo spec deja en `test-results/liquidacion-fidelidad/`.
//
// ═══ POR QUÉ RANGOS Y NO IGUALDADES ═══
//
// Porque el handoff §2 declara rangos («fila de tabla 52-58 px», «encabezado 30-36»), no valores
// únicos. Un test que exigiera 58 exactos daría rojo con una fila de dos renglones —que el mockup
// dibuja con `min-height`— sin que nada se hubiera roto.
//
//   E2E_PORT=3295 npx playwright test tests/liquidacion-fidelidad.spec.ts

const SALIDA = 'test-results/liquidacion-fidelidad'
const RUTA = '/administracion/personas?vista=liquidacion'

/** Los quince colores del README §2 y nada más. Sin `transparent`/`rgba(0,0,0,0)`, que no pintan. */
const PALETA = [
  '#F7F7F5', '#FFFFFF', '#FAFAF8', '#E7E6E2', '#D7D5CF', '#1F1F1E', '#3A3A38', '#6B6B67',
  '#91918B', '#30302F', '#FDC900', '#067647', '#B42318', '#B54708', '#175CD3',
  // Los tres que el propio mockup usa además de la lista: el gris del botón apagado
  // («Cerrar quincena» deshabilitado, línea 130), el hairline de fila del canon y el
  // hover. Están en `globals.css` y en `shared/components/v2/patron`.
  '#EDECE8', '#F1F0EC', '#F3F2EE', '#F2F1ED', '#FEF9E6',
] as const

const rgb = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}
const PALETA_RGB = new Set(PALETA.map(rgb))
/** Lo que no pinta nada: no se juzga contra la paleta. */
const INVISIBLE = new Set(['rgba(0, 0, 0, 0)', 'transparent', 'rgb(0, 0, 0)'])

async function abrir(page: Page, solapa: string) {
  await page.goto(`${RUTA}&solapa=${solapa}`)
  await page.waitForLoadState('networkidle')
}

/** Los `getBoundingClientRect().height` de un selector, ya en el navegador (una sola ida y vuelta). */
async function altos(page: Page, selector: string): Promise<number[]> {
  return page.$$eval(selector, (nodos) => nodos.map((n) => n.getBoundingClientRect().height))
}

test.describe('Liquidación de horas · fidelidad medible contra el mockup v2', () => {
  // EL PRIMER `goto` DE CADA RUTA COMPILA LA PANTALLA. En dev con webpack eso pasa de 30 s y el
  // rojo no señala un defecto: señala que el servidor estaba frío.
  test.describe.configure({ timeout: 180_000 })
  test.beforeAll(() => mkdirSync(SALIDA, { recursive: true }))

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 })
    await entrar(page)
  })

  test('Horas · fila 52-58, encabezado 30-36 alineado abajo, control 26, botón 30-32', async ({ page }) => {
    await abrir(page, 'horas')
    await expect(page.getByTestId('vista-horas')).toBeVisible()
    await page.screenshot({ path: `${SALIDA}/app-1-horas.png`, fullPage: true })

    // EL ENCABEZADO DE COLUMNA. `align-items:end` con 9 px de padding inferior: el rótulo se apoya
    // sobre la línea, no flota en el medio.
    const cabecera = page.getByTestId('encabezado-columnas')
    const alto = (await cabecera.boundingBox())!.height
    expect(alto, 'encabezado de columna').toBeGreaterThanOrEqual(30)
    expect(alto, 'encabezado de columna').toBeLessThanOrEqual(36)
    // `end` y `flex-end` son el mismo alineado: el navegador devuelve la palabra que se escribió.
    expect(await cabecera.evaluate((n) => getComputedStyle(n).alignItems)).toMatch(/^(flex-)?end$/)
    expect(await cabecera.evaluate((n) => getComputedStyle(n).paddingBottom)).toBe('9px')

    // LAS FILAS. `min-height` 58: una fila puede crecer, no encogerse por debajo del rango.
    const filas = await altos(page, '[data-testid^="fila-"]')
    expect(filas.length, 'la grilla tiene filas').toBeGreaterThan(0)
    for (const h of filas) expect(h, 'alto de fila de la grilla').toBeGreaterThanOrEqual(52)

    // EL BOTÓN DE CIERRE: 30-32 px, y si está apagado dice por qué (handoff §4).
    const boton = page.getByTestId('cerrar-quincena')
    const hb = (await boton.boundingBox())!.height
    expect(hb).toBeGreaterThanOrEqual(30)
    expect(hb).toBeLessThanOrEqual(32)
    if (await boton.isDisabled().catch(() => false)) {
      await expect(page.getByTestId('por-que-no')).toBeVisible()
    }

    // LOS FILTROS VAN A LA DERECHA, NO A LA IZQUIERDA (handoff §4). Se mide la posición real.
    const panel = page.getByTestId('vista-horas').locator('aside').first()
    const cuadro = await page.getByTestId('vista-horas').boundingBox()
    const aside = await panel.boundingBox()
    expect(aside!.x, 'el menú de filtros va a la derecha').toBeGreaterThan(cuadro!.x + cuadro!.width / 2)

    // EL RESUMEN Y SU SUBTÍTULO: cargadas/esperadas y «N de M hábiles transcurridos».
    await expect(panel).toContainText('Cargadas')
    await expect(panel).toContainText('Esperadas')
    await expect(page.getByTestId('grilla-subtitulo')).toContainText('hábiles transcurridos')
  })

  test('Horas · el microcopy del mockup, sin sinónimos', async ({ page }) => {
    await abrir(page, 'horas')
    const cuadro = page.getByTestId('vista-horas')
    // LA LEYENDA DEL PIE, palabra por palabra: «·» es «sin horas cargadas» y NO una falta (R3).
    await expect(cuadro).toContainText('sin horas cargadas')
    await expect(cuadro).toContainText('9 h de lunes a jueves')
    // Los cuatro pendientes con el nombre del mockup.
    for (const t of ['Ausencias sin motivo', 'Sin retribución', 'Días sin cargar', 'Modalidad hora']) {
      await expect(cuadro).toContainText(t)
    }
  })

  test('Persona abierta · panel al costado SIN navegar, con las cuatro métricas', async ({ page }) => {
    await abrir(page, 'horas')
    const url = page.url()
    const fila = page.locator('[data-testid^="fila-"]').first()
    await fila.click()
    await expect(page.getByTestId('panel-persona')).toBeVisible()
    // ABRIR UNA PERSONA NO NAVEGA (handoff §4): la URL no se movió.
    expect(page.url(), 'abrir una persona no navega').toBe(url)
    await page.screenshot({ path: `${SALIDA}/app-2-persona.png`, fullPage: true })

    const metricas = page.getByTestId('metricas-persona')
    await expect(metricas).toBeVisible()
    for (const t of ['HH cargadas', 'Días trabajados', 'Ausencias', 'Costo cargado']) {
      await expect(metricas).toContainText(t)
    }
    // LOS CUATRO BLOQUES DEL LEGAJO REAL, al costado.
    for (const b of ['legajo', 'laboral', 'asignación']) {
      await expect(page.getByTestId(`bloque-${b}`)).toBeVisible()
    }
    await expect(page.getByTestId('panel-persona')).toContainText('HH por mes')
    // La cadena de R5 completa, con los rótulos del mockup.
    const cadena = page.getByTestId('cadena-de-pago')
    for (const t of ['Adelanto', 'Ya transferido', 'Por banco', 'En efectivo', 'Efectivo redondeado']) {
      await expect(cadena).toContainText(t)
    }
    // EL DÍA ABIERTO (pantalla 3): encabezado, columnas y fila de total.
    const dias = page.getByTestId('dias-de-la-persona')
    await expect(dias).toContainText('Cargó')
    await expect(page.getByTestId('total-dias')).toBeVisible()
  })

  test('Pagos · las diez columnas de R5 y la fila de total con la línea grafito', async ({ page }) => {
    await abrir(page, 'pagos')
    await expect(page.getByTestId('pagos-tabla')).toBeVisible()
    await page.screenshot({ path: `${SALIDA}/app-4-pagos.png`, fullPage: true })

    const tabla = page.getByTestId('pagos-tabla')
    for (const c of ['Persona', 'Horas', '$/h', 'Cobra', 'Adelanto', 'Ya transf.', 'Por banco',
      'Efectivo', 'Total', 'Efect. red.']) {
      await expect(tabla).toContainText(c)
    }

    // LA FILA DE TOTAL: 48-58 px y `border-top: 1px solid #30302F` — el handoff §2 no la deja
    // opcional, y era exactamente lo que faltaba.
    const total = page.getByTestId('pagos-total-fila')
    await expect(total).toBeVisible()
    const est = await total.evaluate((n) => {
      const s = getComputedStyle(n)
      return { alto: n.getBoundingClientRect().height, borde: s.borderTopColor, ancho: s.borderTopWidth }
    })
    expect(est.alto).toBeGreaterThanOrEqual(48)
    expect(est.borde, 'la línea de total es grafito').toBe(rgb('#30302F'))
    expect(est.ancho).toBe('1px')

    // CAJA DE NÓMINA VIVE ACÁ (mockup §4: las solapas son cinco y no la incluyen).
    await expect(page.getByTestId('solapa-caja-nomina')).toBeVisible()
    // Y NO ES UNA SOLAPA de la barra.
    await expect(page.getByTestId('solapas-liquidacion')).not.toContainText('Caja de nómina')
  })

  test('Toda la vista · sin sombras, sin gradientes y ningún color fuera de la lista', async ({ page }) => {
    for (const solapa of ['horas', 'pagos', 'costo', 'cierre']) {
      await abrir(page, solapa)
      const sospechas = await page.$$eval('main *', (nodos) => {
        const malos: { que: string; valor: string; texto: string }[] = []
        for (const n of nodos) {
          const s = getComputedStyle(n)
          // EL `inset` ESTÁ PERMITIDO y es la barra amarilla de 3 px y los subrayados de solapa
          // del propio mockup. En el valor computado la palabra va al FINAL, no al principio.
          if (s.boxShadow !== 'none' && !s.boxShadow.includes('inset')) {
            malos.push({ que: 'sombra', valor: s.boxShadow, texto: (n.textContent ?? '').slice(0, 40) })
          }
          if (s.backgroundImage.includes('gradient')) {
            malos.push({ que: 'gradiente', valor: s.backgroundImage, texto: (n.textContent ?? '').slice(0, 40) })
          }
          for (const [que, valor] of [['color', s.color], ['fondo', s.backgroundColor]] as const) {
            malos.push({ que: `paleta-${que}`, valor, texto: (n.textContent ?? '').slice(0, 40) })
          }
        }
        return malos
      })

      // SOMBRA: el `inset` está permitido y es la barra amarilla de 3 px y los subrayados del
      // mockup; una sombra proyectada no existe en ninguna de las doce pantallas.
      const sombras = sospechas.filter((s) => s.que === 'sombra')
      expect(sombras.map((s) => `${s.texto}: ${s.valor}`), `sombras en ${solapa}`).toEqual([])
      const grad = sospechas.filter((s) => s.que === 'gradiente')
      expect(grad.map((s) => `${s.texto}: ${s.valor}`), `gradientes en ${solapa}`).toEqual([])

      const fuera = sospechas
        .filter((s) => s.que.startsWith('paleta-'))
        .filter((s) => !INVISIBLE.has(s.valor) && !PALETA_RGB.has(s.valor))
      expect([...new Set(fuera.map((f) => `${f.valor} — «${f.texto}»`))],
        `colores fuera del README §2 en ${solapa}`).toEqual([])
    }
  })

  test('Toda la vista · IBM Plex Sans para el texto y Mono para los rótulos de columna', async ({ page }) => {
    await abrir(page, 'horas')
    const familias = await page.$$eval('main *', (nodos) => {
      const cuenta: Record<string, number> = {}
      for (const n of nodos) {
        if ((n.textContent ?? '').trim() === '') continue
        const f = getComputedStyle(n).fontFamily.split(',')[0].replace(/["']/g, '').trim()
        cuenta[f] = (cuenta[f] ?? 0) + 1
      }
      return cuenta
    })
    const ajenas = Object.keys(familias).filter((f) => !/IBM Plex (Sans|Mono)/.test(f))
    expect(ajenas, 'la tipografía es IBM Plex y nada más').toEqual([])
  })
})
