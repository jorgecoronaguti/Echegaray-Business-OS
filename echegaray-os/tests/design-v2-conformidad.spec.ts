import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { entrar } from './util/obras-e2e'

// ¿LA APP CUMPLE EL DESIGN HANDOFF? — la verificación EJECUTABLE del rediseño.
//
// El handoff (`design/system/`) tiene reglas que son verificables por máquina, y ésas no se miran
// con el ojo: se miden. Lo que un humano tiene que mirar es la composición; lo que una regla puede
// cazar sola —una fuente que no es la del sistema, un tamaño que no está en la escala, un gradiente,
// dos acciones primarias en la misma pantalla, una pastilla de color donde va un punto— no debería
// llegar nunca a los ojos del dueño.
//
// Además deja las CAPTURAS de cada pantalla a 1440 y a 390, que son el insumo de la comparación
// contra `design/screens/visual/`.
//
//   E2E_PORT=3260 npx playwright test tests/design-v2-conformidad.spec.ts
//   E2E_BASE_URL=https://app.ecsas.com.ar npx playwright test tests/design-v2-conformidad.spec.ts

const SALIDA = 'test-results/design-v2'

// LAS PANTALLAS EN ALCANCE. Economía/Finanzas, Descargas y Login están fuera por decisión del
// handoff: no se rediseñan y no se miden con esta vara.
const PANTALLAS: { nombre: string; url: string; movil?: boolean }[] = [
  { nombre: 'obras-cartera', url: '/obras' },
  { nombre: 'obras-gantt-cartera', url: '/obras/gantt' },
  { nombre: 'obras-alta', url: '/obras/nueva' },
  { nombre: 'obra-resumen', url: '/obras/le-comedor?vista=resumen' },
  { nombre: 'obra-planificacion', url: '/obras/le-comedor?vista=cronograma' },
  { nombre: 'obra-ejecucion', url: '/obras/le-comedor?vista=ejecucion' },
  { nombre: 'obra-personal', url: '/obras/le-comedor?vista=personal' },
  { nombre: 'obra-operacion', url: '/obras/le-comedor?vista=operacion' },
  { nombre: 'obra-documentos', url: '/obras/le-comedor?vista=documentos' },
  { nombre: 'clientes-cartera', url: '/clientes' },
  { nombre: 'administracion-entrada', url: '/administracion' },
  { nombre: 'admin-personas', url: '/administracion/personas' },
  { nombre: 'admin-cuadrillas', url: '/administracion/personas/cuadrillas' },
  { nombre: 'admin-proveedores', url: '/administracion/proveedores' },
  { nombre: 'admin-pendientes', url: '/administracion/pendientes' },
  { nombre: 'admin-usuarios', url: '/administracion/usuarios' },
  { nombre: 'mi-cuenta', url: '/mi-cuenta' },
  { nombre: 'operacion-pedidos', url: '/integraciones/pedidos-materiales' },
  { nombre: 'operacion-movimientos', url: '/integraciones/movimientos' },
  { nombre: 'herramientas', url: '/integraciones/herramientas' },
  { nombre: 'campo', url: '/campo', movil: true },
  // ═══ PERFIL EMPLEADO (delta del 20/08/2026) ═══
  //
  // Se miden con la identidad de este spec —Dirección— y sin persona vinculada, así que lo que se
  // ve es el vacío explicado. Da igual para lo que esto mide: tipografía, gradientes, pastillas de
  // color y desborde a 390 son propiedades del MARCO, y el marco es el mismo con datos y sin ellos.
  // Con datos se prueban en `perfil-empleado.spec.ts`, que entra como empleado de verdad.
  { nombre: 'empleado-hoy', url: '/hoy', movil: true },
  { nombre: 'empleado-mi-trabajo', url: '/mi-trabajo', movil: true },
  { nombre: 'empleado-mi-informacion', url: '/mi-informacion', movil: true },
  { nombre: 'empleado-mis-tareas', url: '/mi-trabajo/tareas', movil: true },
  { nombre: 'empleado-asistencia', url: '/mi-informacion/asistencia', movil: true },
  { nombre: 'empleado-documentos', url: '/mi-informacion/documentos', movil: true },
  { nombre: 'empleado-recibos', url: '/mi-informacion/recibos', movil: true },
  { nombre: 'empleado-legajo', url: '/mi-informacion/legajo', movil: true },
  { nombre: 'empleado-horas', url: '/mi-informacion/horas', movil: true },
  { nombre: 'empleado-reportar', url: '/mi-trabajo/reportar', movil: true },
  // ═══ JEFE DE OBRA EN EL TELÉFONO (21/08/2026) ═══
  //
  // Las seis del contrato J01–J06. Van con `movil: true` porque NO tienen versión de escritorio: el
  // contrato dice «optimizado para teléfono y campo, no desktop reducido», así que medirlas a 1440
  // mediría un tamaño que nadie va a usar. Lo económico de esta obra no aparece por rol —el jefe no
  // ve precio— y eso se mide aparte, en `zz-jefe-capturas.spec.ts`.
  { nombre: 'jefe-hoy', url: '/obra/hoy?obra=san-francisco', movil: true },
  { nombre: 'jefe-tareas', url: '/obra/tareas?obra=san-francisco', movil: true },
  { nombre: 'jefe-avance', url: '/obra/avance?obra=san-francisco', movil: true },
  { nombre: 'jefe-avance-masivo', url: '/obra/avance-masivo?obra=san-francisco', movil: true },
  { nombre: 'jefe-personas', url: '/obra/personas?obra=san-francisco', movil: true },
  { nombre: 'jefe-frente', url: '/obra/frente?obra=san-francisco', movil: true },
]

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => mkdirSync(SALIDA, { recursive: true }))

test.describe('el rediseño cumple el design handoff', () => {
  test('cada pantalla en alcance cumple las reglas medibles y deja su captura', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000)
    await entrar(page)

    const fallas: string[] = []

    for (const p of PANTALLAS) {
      // ESCRITORIO — 1440 es el ancho de referencia declarado en el handoff.
      await page.setViewportSize({ width: 1440, height: 900 })
      const ok = await abrir(page, p.url)
      if (!ok) {
        fallas.push(`${p.nombre}: no abrió (${p.url})`)
        continue
      }
      await page.screenshot({ path: `${SALIDA}/${p.nombre}-1440.png`, fullPage: true })
      fallas.push(...(await reglas(page, p.nombre)))

      // TELÉFONO — 390. Acá la regla más dura es que la PÁGINA no se corra de costado.
      await page.setViewportSize({ width: 390, height: 844 })
      await page.waitForTimeout(350)
      await page.screenshot({ path: `${SALIDA}/${p.nombre}-390.png`, fullPage: true })
      const desborde = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      if (desborde > 1) fallas.push(`${p.nombre}: a 390px la página se corre ${desborde}px de costado`)
    }

    // Todas las fallas juntas: arreglar de a una, corriendo la suite entera cada vez, cuesta una
    // hora por vuelta. El informe completo se lee de una sola pasada.
    expect(fallas, `\n${fallas.join('\n')}\n`).toEqual([])
  })
})

async function abrir(page: Page, url: string): Promise<boolean> {
  const r = await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => null)
  if (!r || r.status() >= 400) return false
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
  return true
}

async function reglas(page: Page, nombre: string): Promise<string[]> {
  return page.evaluate((n) => {
    const f: string[] = []
    const visible = (e: Element) => {
      const r = e.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    const nodos = Array.from(document.body.querySelectorAll('*')).filter(visible)

    // 1 · LA TIPOGRAFÍA ES LA DEL SISTEMA. Si el build no trajo IBM Plex, la escala entera está
    //     calibrada sobre otra métrica y toda la densidad se corre sin que nada se vea "roto".
    const fam = getComputedStyle(document.body).fontFamily
    if (!/plex/i.test(fam)) f.push(`${n}: el cuerpo no usa IBM Plex (${fam})`)

    // 2 · EL HEADER GLOBAL MIDE 44px (mockup 00 del zip). Es andamiaje: cada píxel de más se lo saca a la tabla.
    const header = document.querySelector('[data-testid="app-header"]')
    if (header) {
      const h = Math.round(header.getBoundingClientRect().height)
      if (h !== 44) f.push(`${n}: el header mide ${h}px y el mockup dice 44`)
    }

    // 3 · SIN GRADIENTES. Regla absoluta del handoff: no hay ni uno en todo el sistema.
    for (const e of nodos) {
      const s = getComputedStyle(e)
      if (/gradient/i.test(s.backgroundImage)) {
        f.push(`${n}: gradiente en <${e.tagName.toLowerCase()} class="${e.className}">`)
        break
      }
    }

    // 4 · EL AMARILLO SIEMPRE LLEVA TEXTO GRAFITO. #FDC900 da 1,6:1 sobre blanco: con texto claro
    //     encima, la acción principal de la pantalla es la menos legible que hay. Es la regla 2 de
    //     COLOR.md y la única de contraste que se puede medir sola.
    //
    //     El CONTEO de primarias NO se mide acá: el handoff pide una por CONTEXTO, no por pantalla,
    //     y el mockup de referencia tiene dos —«+ Nueva actividad» en la barra de vista y «Editar
    //     actividad» en el pie del panel—, que son dos contextos distintos y están bien. Un umbral
    //     de pantalla daría rojo sobre el propio diseño aprobado.
    const AMARILLO = 'rgb(253, 201, 0)'
    for (const e of nodos) {
      const s2 = getComputedStyle(e)
      if (s2.backgroundColor !== AMARILLO) continue
      const [r, g, b] = (s2.color.match(/\d+/g) || ['0', '0', '0']).map(Number)
      // Luminancia relativa aproximada: cualquier texto claro sobre el amarillo es un defecto.
      if (0.2126 * r + 0.7152 * g + 0.0722 * b > 128) {
        f.push(`${n}: texto claro (${s2.color}) sobre el amarillo de marca — va grafito #1F1F1E`)
        break
      }
    }

    // 5 · EL ESTADO ES UN PUNTO Y UNA PALABRA, NO UNA PASTILLA DE COLOR.
    for (const e of Array.from(document.querySelectorAll('[data-testid="estado"]'))) {
      const bg = getComputedStyle(e).backgroundColor
      if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        f.push(`${n}: un estado se dibuja con fondo (${bg}) — el handoff prohíbe las pastillas`)
        break
      }
    }

    // 6 · LOS TAMAÑOS SALEN DE LA ESCALA. La del handoff tiene NUEVE entradas; se admiten además
    //     los intermedios que el sistema ya usa para texto de apoyo. Un tamaño fuera de esta lista
    //     es escala inventada — que es como una escala de nueve se convierte en una de veinte sin
    //     que nadie lo decida. Sólo se miran los nodos con texto PROPIO: un contenedor hereda un
    //     tamaño que ya se midió en su hijo.
    const ESCALA = [10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 15.5, 16, 18, 20, 22, 26, 28]
    const fuera = new Map<number, string>()
    for (const e of nodos) {
      const propio = Array.from(e.childNodes).some(
        (c) => c.nodeType === 3 && (c.textContent || '').trim().length > 0,
      )
      if (!propio) continue
      const px = Math.round(parseFloat(getComputedStyle(e).fontSize) * 2) / 2
      if (!ESCALA.includes(px) && !fuera.has(px)) {
        fuera.set(px, (e.textContent || '').trim().slice(0, 30))
      }
    }
    for (const [px, muestra] of fuera) f.push(`${n}: tamaño ${px}px fuera de la escala («${muestra}»)`)

    return f
  }, nombre)
}
