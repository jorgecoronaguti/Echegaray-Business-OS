import { test, expect, type Page } from '@playwright/test'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { entrar } from './util/obras-e2e'

// CAPTURAS DEL LEGAJO — el ANTES y el DESPUÉS del rediseño de secciones (18/09/2026).
//
// No afirma nada sobre el negocio: saca fotos comparables. Las dos pasadas corren en UNA sola
// reserva del portero porque el cupo de navegador es de uno en toda la VM y la cola tenía cuatro
// agentes esperando: pedir turno dos veces para fotografiar la misma pantalla es media hora de
// máquina que otro necesita.
//
// ═══ CÓMO CAMBIA DE VERSIÓN SIN SALIR DEL TURNO ═══
//
// Las siete fuentes del legajo están duplicadas en `.pristino/` (lo que había) y `.nuevo/` (lo que
// hay). La pasada copia una de las dos sobre `src/` y espera a que el `next dev` recompile.
//
// Y NO SE FÍA DEL RELOJ: entre copiar y fotografiar hay un SELLO que dice qué versión está en
// pantalla —la solapa «Asignaciones», que existe en el antes y no en el después—. Sin ese sello,
// una recompilación lenta daría dos juegos de fotos idénticas rotuladas «antes» y «después», que es
// exactamente la evidencia que parece prueba y no prueba nada.

const FUENTES = [
  'src/app/(main)/administracion/personas/[id]/page.tsx',
  'src/features/administracion/components/QuincenaDeAsistencia.tsx',
  'src/features/administracion/components/ObrasDeLaPersona.tsx',
  'src/features/administracion/components/AnotacionesDeLaPersona.tsx',
  'src/features/administracion/services/vistasFicha.ts',
  'src/features/administracion/services/fichaPersona.ts',
  'src/shared/components/v2/segundoNivel.tsx',
]

const PERSONAS = [
  // Datos completos: activa, con asignación vigente, 39 papeles y 24 asignaciones.
  { slug: 'completa', id: '1ff87d94-0b78-4308-aff5-e0f4c6fbd553' },
  // Datos faltantes: legajo cerrado, sin asignación vigente, casi nada cargado.
  { slug: 'faltante', id: '78802957-ac55-4d4f-9dad-93685f7326be' },
]

// Las SIETE caras del antes. En el después «asignaciones» es un alias de «horas», así que la misma
// lista fotografía las dos versiones y además prueba, de paso, que el enlace viejo sigue llegando.
const VISTAS = ['resumen', 'asignaciones', 'horas', 'retribucion', 'documentos', 'usuario', 'auditoria']
const ANCHOS = [1280, 390]

function poner(version: 'pristino' | 'nuevo') {
  for (const f of FUENTES) copyFileSync(`.${version}/${f}`, f)
}

/** Espera a que la pantalla sea la de esta versión, no a que pase un tiempo. */
async function esperarVersion(page: Page, id: string, esperaAsignaciones: boolean) {
  await expect.poll(async () => {
    await page.goto(`/administracion/personas/${id}`)
    await page.waitForLoadState('domcontentloaded')
    return await page.getByTestId('solapa-asignaciones').count()
  }, { timeout: 180_000, intervals: [2000], message: 'el servidor no recompiló la versión pedida' })
    .toBe(esperaAsignaciones ? 1 : 0)
}

async function fotografiar(page: Page, carpeta: string, ancho: number) {
  for (const p of PERSONAS) {
    for (const v of VISTAS) {
      const url = v === 'resumen'
        ? `/administracion/personas/${p.id}`
        : `/administracion/personas/${p.id}?v=${v}`
      await page.goto(url)
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(600)
      await page.screenshot({
        path: `qa-shots/legajo/${carpeta}-${p.slug}-${v}-${ancho}.png`,
        fullPage: true,
      })
    }
  }
}

test('legajo · antes y después, a 1280 y a 390, en una sola reserva', async ({ page }) => {
  // LAS DOS COPIAS SON DE LA PASADA DEL 18/09/2026 y no se versionan: son el árbol entero por
  // duplicado. Sin ellas esto no puede comparar nada, y un spec que corre igual y saca dos veces la
  // misma foto rotulada «antes» y «después» es peor que uno que no corre. Para reproducirlo:
  // `mkdir .pristino .nuevo` y copiar ahí las siete fuentes de cada versión (`git show <sha>:<ruta>`).
  test.skip(!existsSync('.pristino') || !existsSync('.nuevo'),
    'faltan .pristino/ y .nuevo/ con las dos versiones de las fuentes del legajo')
  test.setTimeout(30 * 60 * 1000)
  mkdirSync('qa-shots/legajo', { recursive: true })
  await entrar(page)
  try {
    for (const [carpeta, version, hayAsignaciones] of
      [['antes', 'pristino', true], ['despues', 'nuevo', false]] as const) {
      poner(version)
      for (const ancho of ANCHOS) {
        await page.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 900 })
        // El sello, una vez por ancho: la recompilación es del servidor, no del viewport.
        await esperarVersion(page, PERSONAS[0].id, hayAsignaciones)
        await fotografiar(page, carpeta, ancho)
      }
    }
  } finally {
    // EL ÁRBOL QUEDA COMO ESTABA, falle lo que falle: un `finally` que no restaura deja el worktree
    // en la versión vieja y el próximo commit borra el trabajo sin que nadie lo note.
    poner('nuevo')
  }
})
