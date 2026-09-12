import { expect, test } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

// LA COLUMNA DEL NOMBRE, EN UN TELÉFONO, CON LA TABLA DESPLAZADA — MEDIDA, NO MIRADA.
//
// ═══ EL DEFECTO (QA visual 11/09, medido el 12/09/2026) ═══
//
// A 390 px, al arrastrar las grillas de Liquidación hacia la derecha, una columna de DÍA se veía por
// delante de la columna «Persona», que se supone fija. No era el apilado: `COLUMNA_FIJA` ya lleva
// `zIndex: 1` y gana sobre sus hermanas. Era dónde frena. El marco recorta su contenido en el borde
// del PADDING —la franja de 20 px sigue pintando lo que se desplaza— y la celda pegajosa frenaba en
// el borde del CONTENIDO, 20 px más adentro. Medido con `elementFromPoint`, `scrollLeft = 300`:
//
//   dx  2 px → BUTTON «9»   (la celda del día 2)          dx 24 px → DIV «MALDONADO…» (el nombre)
//   dx  6 px → BUTTON «9»                                  dx 40 px → DIV «MALDONADO…»
//   dx 12 px → BUTTON «9»                                  …
//   dx 18 px → BUTTON «9»
//
// Y estaba en LAS TRES, Pagos incluida: ahí el canal mostraba un «—» en vez de un número de horas,
// por eso la captura no lo delató. Un solo `left` en `tabla.tsx` lo arregla en las tres.
//
// ═══ QUÉ MIDE ESTE SPEC, Y POR QUÉ ASÍ ═══
//
// `elementFromPoint` es la única pregunta honesta: no «¿existe la celda?» sino «¿QUIÉN está arriba
// en ese píxel?». Una captura no lo puede contestar —dos celdas blancas superpuestas se ven igual— y
// un `toBeVisible()` da verde con la celda tapada.
//
// La segunda afirmación es sobre el FONDO: una celda fija transparente deja leer las columnas que
// pasan por debajo, que es el mismo defecto entrando por la otra puerta. La fila ABIERTA de Horas lo
// tenía (`background: abierta ? undefined : '#FFFFFF'`), y por eso el spec la abre antes de medir.

const RUTA = '/administracion/personas?vista=liquidacion&quincena=2026-09-01'
const DESTINO = process.env.E2E_CAPTURAS ?? '.playwright'
/** El canal que `CANAL_SCROLL` tapa. Se mide DENTRO de él: afuera el defecto no se ve. */
const DENTRO_DEL_CANAL = [2, 6, 12, 18] as const

/** Lo que el navegador contesta sobre el píxel: quién está arriba y de qué color es el fondo. */
interface Medicion {
  error?: string
  nombre: string
  puntos: { dx: number; esElNombre: boolean; tag: string; texto: string }[]
  fondos: { color: string; opaco: boolean }[]
}

async function medir(page: import('@playwright/test').Page): Promise<Medicion> {
  return page.evaluate(() => {
    const ancla = document.querySelector(
      '[data-testid=espejo-tabla], [data-testid=pagos-tabla], [data-testid=encabezado-columnas]',
    )
    if (!ancla) return { error: 'no encontré la tabla', nombre: '', puntos: [], fondos: [] }
    const interno = ancla.getAttribute('data-testid') === 'encabezado-columnas' ? ancla.parentElement! : ancla
    const marco = interno.parentElement!
    marco.scrollLeft = 300
    const r = marco.getBoundingClientRect()

    const fijas = [...marco.querySelectorAll('div')].filter((d) => getComputedStyle(d).position === 'sticky')
    // LA DE UNA FILA DE PERSONA, no la del encabezado: es la que el defecto destapaba.
    const celda = fijas.find((d) => d.getBoundingClientRect().top > r.top + 40) ?? fijas[0]
    if (!celda) return { error: 'no hay columna fija', nombre: '', puntos: [], fondos: [] }
    const cr = celda.getBoundingClientRect()
    const y = cr.top + cr.height / 2

    const puntos = [2, 6, 12, 18, 24, 40].map((dx) => {
      const el = document.elementFromPoint(r.left + dx, y)
      return {
        dx,
        esElNombre: el === celda || celda.contains(el),
        tag: el?.tagName ?? 'NADA',
        texto: (el?.textContent ?? '').trim().slice(0, 24),
      }
    })
    const fondos = fijas.map((d) => {
      const color = getComputedStyle(d).backgroundColor
      const alfa = color.startsWith('rgba') ? Number(color.split(',')[3]) : 1
      return { color, opaco: color !== 'transparent' && alfa === 1 }
    })
    return { nombre: celda.textContent?.trim().slice(0, 30) ?? '', puntos, fondos }
  })
}

for (const solapa of ['quincena', 'horas', 'pagos'] as const) {
  test(`la columna Persona tapa el canal · ${solapa} a 390 px`, async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto(`${RUTA}&solapa=${solapa}`, { waitUntil: 'load' })
    await page.waitForSelector(
      '[data-testid=espejo-tabla], [data-testid=pagos-tabla], [data-testid=encabezado-columnas]',
      { timeout: 60_000 },
    )
    // LA FILA ABIERTA ES OTRO FONDO. Sólo Horas la tiene, y era la que se dibujaba transparente.
    if (solapa === 'horas') {
      const primera = page.locator('[data-testid^=fila-]').first()
      if (await primera.count()) await primera.click()
    }

    const m = await medir(page)
    await page.screenshot({ path: `${DESTINO}/columna-fija-${solapa}-390.png` })

    expect(m.error, `${solapa}: ${m.error ?? ''}`).toBeUndefined()
    for (const p of m.puntos) {
      // EL MENSAJE LLEVA QUÉ HABÍA ARRIBA: «false ≠ true» no dice que asomó la celda del día 2.
      expect(
        p.esElNombre,
        `${solapa} · a ${p.dx} px del borde el elemento de arriba es <${p.tag}> «${p.texto}», `
        + `no la celda del nombre («${m.nombre}»)`,
      ).toBe(true)
    }
    expect(m.puntos.filter((p) => DENTRO_DEL_CANAL.includes(p.dx as 2)).length).toBe(4)
    // NINGUNA CELDA FIJA TRANSPARENTE: lo que pasa por debajo se leería a través del nombre.
    expect(m.fondos.length).toBeGreaterThan(0)
    for (const f of m.fondos) {
      expect(f.opaco, `${solapa} · una celda fija quedó con fondo «${f.color}»`).toBe(true)
    }
  })
}
