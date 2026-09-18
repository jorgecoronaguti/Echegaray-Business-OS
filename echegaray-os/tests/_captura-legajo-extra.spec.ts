import { test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { entrar } from './util/obras-e2e'

// LAS DOS CARAS QUE LA PASADA GRANDE NO PUDO FOTOGRAFIAR.
//
//   1. «Horas y obras» sin la ventana repetida — el defecto que la propia unificación cometió de
//      nuevo y se corrigió mirando la captura.
//   2. EL AVISO DE «ACTIVO PERO SIN OBRA». Al 18/09/2026 NINGUNA persona real del plantel está
//      activa sin asignación vigente (se verificó contra la base: 0 de 17), así que la única forma
//      de ver esa rama con datos es la persona de prueba. No se inventa un caso en la base real
//      para sacarle una foto.

const QA_CAMPO = 'e2e00000-0000-4000-8000-000000000001'
const COMPLETA = '1ff87d94-0b78-4308-aff5-e0f4c6fbd553'

test('las dos caras que faltaban, a 1280 y a 390', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000)
  mkdirSync('qa-shots/legajo', { recursive: true })
  await entrar(page)
  for (const ancho of [1280, 390]) {
    await page.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 900 })
    for (const [slug, id, v] of [
      ['horas-sin-ventana-repetida', COMPLETA, '?v=horas'],
      ['aviso-sin-obra', QA_CAMPO, ''],
    ] as const) {
      await page.goto(`/administracion/personas/${id}${v}`)
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(700)
      await page.screenshot({ path: `qa-shots/legajo/despues-${slug}-${ancho}.png`, fullPage: true })
    }
  }
})
