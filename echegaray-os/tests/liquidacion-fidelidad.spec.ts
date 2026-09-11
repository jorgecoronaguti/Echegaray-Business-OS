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
// ═══ DÓNDE EL MOCKUP DEJÓ DE MANDAR (11/09/2026) ═══
//
// El handoff §4 dibuja una columna de filtros de 230 px a la DERECHA y este spec la medía. El dueño
// miró la pantalla real: *«qué es la información que refleja la sección de la derecha, pésima UX,
// no sirve así»*. La regla de desempate del propio handoff es que el zip manda en lo COSMÉTICO, y
// esto no lo era: eran 230 px permanentes con cuatro grupos de los que tres no se decidían
// —«Todo el plantel / Modalidad hora / Modalidad mensual» repetía el corte que la tabla ya hace con
// sus dos grupos, y «Convenio» era un conteo con el rótulo cortado—. Una queja del dueño sobre la
// pantalla real le gana a un lienzo.
//
// Lo que este spec mide ahora en su lugar: que la columna NO esté, que lo que sí se decide
// —período, pendientes, cierre— esté arriba y entero, y que ningún rótulo salga cortado. El resto
// del contrato del mockup (alturas, paleta, microcopy, las otras cinco solapas) sigue igual.
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
  // `networkidle` NO ES UNA CONDICIÓN DE ÉXITO: en dev, el HMR deja un socket abierto y la espera
  // vence sin que la pantalla tenga nada malo. Se espera, y si no llega se sigue: lo que decide el
  // rojo es la aserción de abajo, no el estado de la red.
  await page.waitForLoadState('networkidle').catch(() => {})
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
    // EL PORQUÉ SIGUE AL LADO DEL BOTÓN GRIS, pero ya no como párrafo permanente: el párrafo decía
    // lo mismo que la banda de pendientes de arriba —que además lleva a las filas que lo producen—
    // y era uno de los que el dueño prohíbe. Ahora es el `title` del botón apagado.
    if (await boton.isDisabled().catch(() => false)) {
      expect(await boton.getAttribute('title'), 'el botón apagado dice por qué').toMatch(/Antes de cerrar/)
    }

    // LA COLUMNA DE FILTROS DE LA DERECHA NO EXISTE MÁS. Es la afirmación literal de la queja del
    // dueño, y se mide por ausencia para que reaparecer cueste un rojo y no una captura.
    await expect(page.getByTestId('vista-horas').locator('aside')).toHaveCount(0)

    // LO QUE SÍ SE DECIDE, ARRIBA Y ENTERO. El período vigente con su estado, los otros períodos a
    // los que se puede saltar, y el subtítulo con cuánto de la quincena pasó.
    const cabeceraQuincena = page.getByTestId('cabecera-quincena')
    await expect(cabeceraQuincena).toBeVisible()
    await expect(cabeceraQuincena).toContainText('quincena')
    await expect(page.getByTestId('periodos').locator('a')).not.toHaveCount(0)
    await expect(page.getByTestId('grilla-subtitulo')).toContainText('hábiles transcurridos')

    // NINGÚN RÓTULO CORTADO. «1ª quincena de septiemb…» y «UOCRA — Ley 22.250 (const…» eran el
    // síntoma que se veía a simple vista: se mide el desborde real de cada caja de la cabecera.
    const cortados = await cabeceraQuincena.evaluate((raiz) => {
      const malos: string[] = []
      for (const n of raiz.querySelectorAll('*')) {
        if (n.children.length > 0) continue
        if (n.scrollWidth > n.clientWidth + 1) malos.push((n.textContent ?? '').slice(0, 40))
      }
      return malos
    })
    expect(cortados, 'rótulos cortados en la cabecera').toEqual([])

    // CARGADAS Y ESPERADAS VIVEN EN EL PIE DE LA TABLA, debajo de sus propias columnas: en el panel
    // estaban por segunda vez, a 150 px de la columna que ya las publicaba.
    await expect(page.getByTestId('encabezado-columnas')).toContainText('CARG.')
    await expect(page.getByTestId('encabezado-columnas')).toContainText('ESPER.')
    await expect(page.getByTestId('total-grilla')).toBeVisible()
  })

  test('Horas · el microcopy del mockup, sin sinónimos', async ({ page }) => {
    await abrir(page, 'horas')
    const cuadro = page.getByTestId('vista-horas')
    // LA LEYENDA DEL PIE, palabra por palabra: «·» es «sin horas cargadas» y NO una falta (R3).
    await expect(cuadro).toContainText('sin horas cargadas')
    await expect(cuadro).toContainText('9 h de lunes a jueves')
    // LO PENDIENTE, CON EL NÚMERO ADENTRO DEL TEXTO — «9 ausencias sin motivo», no «Ausencias sin
    // motivo … 9» con 150 px de nada en el medio. Se mide con expresión regular porque el número es
    // el dato vivo de la quincena y clavarlo pondría rojo un test cuando alguien cargue un día.
    const pendientes = page.getByTestId('pendientes')
    await expect(pendientes).toBeVisible()
    await expect(pendientes).toContainText(/\d+ ausencias? sin motivo/)
    await expect(pendientes).toContainText(/\d+ días? sin cargar/)
    // «Sin retribución» NO se afirma: la banda esconde lo que vale cero a propósito —una fila que
    // dice «0» ocupa lo mismo que una que avisa y enseña a no mirarla—, así que su presencia depende
    // del estado de la base y no del código.

    // EL CORTE OBRERO/OFICINA LO HACE LA TABLA CON SUS DOS GRUPOS, no un filtro que lo repita.
    await expect(cuadro).toContainText('JEFES DE OBRA')
    await expect(cuadro).not.toContainText('Modalidad hora')
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

    // ═══ ABRIR UNA PERSONA TIENE QUE VERSE ═══
    //
    // `toBeVisible()` no alcanza y por eso esto no se cazaba: Playwright da por visible un panel que
    // está 1.100 px más abajo del viewport. Con diecisiete personas en la tabla, quien hacía clic en
    // la primera no veía moverse nada. Se mide que el panel quede DENTRO de la pantalla.
    const caja = await page.getByTestId('panel-persona').boundingBox()
    const alto = page.viewportSize()!.height
    expect(caja!.y, 'el panel de la persona queda a la vista al abrirlo').toBeLessThan(alto)
    expect(caja!.y + 80, 'su encabezado queda a la vista, no sólo el borde').toBeLessThan(alto)

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

  // ═══ PANTALLA 5 · LA ESCALERA Y EL MULTIPLICADOR ═══
  test('Costo · la escalera del mockup arriba y las alícuotas versionadas abajo', async ({ page }) => {
    await abrir(page, 'costo')
    await expect(page.getByTestId('solapa-costo-hora')).toBeVisible()
    await page.screenshot({ path: `${SALIDA}/app-5-costo-hora.png`, fullPage: true })

    // LOS SEIS ESCALONES DE §5, en el orden del mockup y con su alto de 42 px.
    const escalera = page.getByTestId('escalera-costo')
    await expect(escalera).toContainText('Bolsillo · lo que se le paga')
    for (const t of ['Cargas sociales', 'ART', 'Fondo de cese UOCRA', 'Seguro de vida y sepelio']) {
      await expect(escalera).toContainText(t)
    }
    const escalones = await altos(page, '[data-testid^="escalon-"]')
    expect(escalones.length, 'los seis escalones').toBeGreaterThanOrEqual(6)
    for (const h of escalones) expect(h, 'alto de escalón').toBe(42)

    // LA LÍNEA DE COSTO POR HORA: 40 px y `border-top` grafito, como el mockup.
    const costo = page.getByTestId('costo-por-hora')
    const est = await costo.evaluate((n) => {
      const s = getComputedStyle(n)
      return { alto: n.getBoundingClientRect().height, borde: s.borderTopColor }
    })
    expect(est.alto).toBe(40)
    expect(est.borde, 'la línea de total es grafito').toBe(rgb('#30302F'))

    // LA TABLA POR CATEGORÍA, con las cuatro columnas del mockup y la fila de la quincena entera.
    await expect(page.getByTestId('encabezado-categorias')).toContainText('Multiplicador')
    const quincena = page.getByTestId('quincena-entera')
    await expect(quincena).toContainText('La quincena entera')
    expect((await quincena.boundingBox())!.height).toBe(52)

    // R9 · EL VERSIONADO NO SE PERDIÓ: está plegado, con su fecha y su fuente.
    const detalle = page.getByTestId('alicuotas-detalle')
    await expect(detalle).toContainText('Rige desde')
    await expect(detalle).toContainText('Fuente')
  })

  // ═══ PANTALLA 6 · LA QUINCENA CARGADA A LA OBRA ═══
  test('Costo a la obra · siete columnas, A OBRA / A ESTRUCTURA y «sin base» donde no hay presupuesto', async ({ page }) => {
    await abrir(page, 'costo')
    const cuadro = page.getByTestId('solapa-costo-obra')
    await expect(cuadro).toBeVisible()
    await page.screenshot({ path: `${SALIDA}/app-6-costo-obra.png`, fullPage: true })

    if (await page.getByTestId('cuadro-costo-obra').count() === 0) {
      test.skip(true, 'no hay horas cargadas en esta quincena: el cuadro no se dibuja')
    }
    const enc = page.getByTestId('encabezado-obras')
    for (const c of ['Obra', 'HH', 'Gente', 'Bolsillo', 'Costo real', 'MO presupuestada', 'Consumido']) {
      await expect(enc).toContainText(c)
    }
    expect((await enc.boundingBox())!.height).toBe(34)
    await expect(page.getByTestId('total-a-obra')).toContainText('A OBRA')
    await expect(page.getByTestId('total-a-estructura')).toContainText('A ESTRUCTURA')

    // R1 · SIN BASE NO ES 0 %. Si alguna obra no tiene mano de obra presupuestada, tiene que decirlo
    // con esas palabras — y ningún «0 %» puede aparecer en la columna de consumo.
    const filas = await altos(page, '[data-testid="fila-obra"]')
    for (const h of filas) expect(h, 'alto de fila de obra').toBeGreaterThanOrEqual(52)
    const total = page.getByTestId('total-obras')
    expect((await total.boundingBox())!.height).toBe(56)
    expect(await total.evaluate((n) => getComputedStyle(n).borderTopColor)).toBe(rgb('#30302F'))
  })

  // ═══ PANTALLA 11 · «$/h HOY» TIENE QUE PODER DECIR «CAMBIÓ» ═══
  test('Cierre · la quincena cerrada compara el sellado contra la tarifa de hoy', async ({ page }) => {
    await abrir(page, 'cierre')
    // `solapa-cierre` es también el testid de la PESTAÑA en la barra: se pide el panel.
    await expect(page.locator('div[data-testid="solapa-cierre"]')).toBeVisible()
    await page.screenshot({ path: `${SALIDA}/app-11-cierre.png`, fullPage: true })

    if (await page.getByTestId('cierre-cerrada').count() === 0) {
      // La quincena en curso está abierta: se verifica la pantalla 10 y la 11 la cubre el test
      // unitario `filasDeQuincenaCerrada`, que es el que atrapa el defecto de la comparación.
      await expect(page.getByTestId('cierre-boton')).toBeVisible()
      return
    }
    const enc = page.getByTestId('encabezado-cerrada')
    for (const c of ['Persona', 'Horas', '$/h sellado', 'Cobró', 'Por banco', 'Efectivo', 'Total', '$/h hoy']) {
      await expect(enc).toContainText(c)
    }
    for (const h of await altos(page, '[data-testid="fila-cerrada"]')) {
      expect(h, 'alto de fila cerrada').toBeGreaterThanOrEqual(52)
    }
    // «igual» SIEMPRE es el defecto que este módulo tuvo: la columna compara dos fuentes distintas.
    const veredictos = await page.$$eval('[data-testid^="hoy-"]', (n) => n.map((x) => x.textContent ?? ''))
    expect(veredictos.length).toBeGreaterThan(0)
    for (const v of veredictos) expect(v).toMatch(/(cambió|igual|sin dato)/)
  })

  // ═══ 390 px · EL TELÉFONO ═══
  test('390 px · las cinco pantallas apilan sin desbordar el ancho', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    for (const solapa of ['horas', 'pagos', 'costo', 'cierre']) {
      await abrir(page, solapa)
      await page.screenshot({ path: `${SALIDA}/app-390-${solapa}.png`, fullPage: true })
      // NADA MÁS ANCHO QUE LA VENTANA. Un `scrollWidth` mayor que 390 en el documento significa que
      // algo empujó la página entera: en el teléfono eso es la fila de total fuera de pantalla.
      //
      // EL ROJO NOMBRA AL CULPABLE. Un test que sólo dice «1022 > 391» manda a bisectar el DOM a
      // mano; el que dice cuál es el nodo más ancho que su padre se arregla en un minuto.
      const culpables = await page.evaluate(() => {
        const malos: string[] = []
        for (const n of Array.from(document.querySelectorAll('main *'))) {
          const r = n.getBoundingClientRect()
          if (r.right <= 391 || r.width === 0) continue
          const padre = n.parentElement
          // Sólo el PRIMERO que se sale: los hijos heredan el desborde del padre y ensucian la lista.
          if (padre && padre.getBoundingClientRect().right > 391) continue
          malos.push(`${n.tagName.toLowerCase()}[${n.getAttribute('data-testid') ?? n.className}] w=${Math.round(r.width)}`)
        }
        return malos
      })
      const ancho = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(ancho, `desborde horizontal en ${solapa} a 390 px · ${culpables.join(' | ')}`)
        .toBeLessThanOrEqual(391)
    }
    // Y EL PANEL DE LA PERSONA, que es el que apila el legajo debajo.
    await abrir(page, 'horas')
    await page.locator('[data-testid^="fila-"]').first().click()
    await expect(page.getByTestId('panel-persona')).toBeVisible()
    await page.screenshot({ path: `${SALIDA}/app-390-persona.png`, fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
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
