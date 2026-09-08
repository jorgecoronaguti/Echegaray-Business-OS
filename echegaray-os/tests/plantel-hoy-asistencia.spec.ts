import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN, servicio } from './util/identidades'

// LA COLUMNA «HOY» DEL PLANTEL NO PUEDE DECIR «SIN FICHAR» EN LAS DIECISIETE FILAS — 08/09/2026.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// Captura del dueño sobre `/administracion/personas`: la columna HOY escribía «● sin fichar», con
// punto ámbar, en TODAS las filas del plantel. Es el mismo error conceptual que ya se corrigió en
// «En obra ahora», en la grilla de quincena y en las tres pantallas del jefe: el fichaje desde el
// celular no está en uso —cuatro marcas de prueba en toda su historia—, así que la columna
// publicaba la ausencia de una capacidad como si fuera una novedad diaria sobre la gente.
//
// Este spec NO ESCRIBE NADA. Lee `asistencia_marca` para saber en qué escenario está parado y
// recién ahí afirma. Fabricar una marca para «probar el caso lindo» dejaría un fichaje que nadie
// hizo, para siempre, en la tabla que alimenta la liquidación.
//
// EL DÍA QUE EL FICHAJE ENTRE EN USO este test tiene que seguir midiendo algo: con marcas, el ● de
// presencia puede aparecer; sin marcas, la palabra «fichar» no puede estar en ningún lado. Lo que
// NUNCA cambia es que la celda diga la ASISTENCIA —«9 h», «A · motivo», «sin cargar»—, que es el
// proceso que hoy existe de verdad.

const RUTA = '/administracion/personas'
const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('01 · sin marcas de fichaje la columna HOY dice la asistencia, no «sin fichar»', async ({ page }) => {
  // 1440 PORQUE LA COLUMNA SE SUELTA POR DEBAJO DE 1250 px: en angosto quedan PERSONA y OBRA, y el
  // test no estaría mirando la celda que dice medir.
  await page.setViewportSize({ width: 1440, height: 900 })
  const admin = servicio()
  const { count: marcasHoy } = await admin
    .from('asistencia_marca').select('id', { count: 'exact', head: true }).eq('fecha', hoyISO())

  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto(RUTA)
  await expect(page.getByTestId('tabla-personas')).toBeVisible()
  const filas = page.getByTestId('fila-persona')
  expect(await filas.count(), 'sin filas no hay nada que afirmar del plantel').toBeGreaterThan(0)

  // ═══ LO QUE NO PUEDE ESTAR MIENTRAS NO HAYA MARCAS ═══
  if ((marcasHoy ?? 0) === 0) {
    await expect(page.getByText('sin fichar', { exact: false })).toHaveCount(0)
    await expect(page.getByText('fichó', { exact: false })).toHaveCount(0)
    await expect(page.getByText('no fich', { exact: false })).toHaveCount(0)
    // El ● de presencia sale de una marca REAL y de nada más.
    await expect(page.locator('[data-testid="hoy-persona"] [data-capa="presencia"]')).toHaveCount(0)
  }

  // ═══ LO QUE SÍ TIENE QUE ESTAR ═══
  //
  // Cada celda dice la asistencia del día: «sin cargar» cuando nadie cargó, el número de horas
  // cuando sí, o el chip A/L de lo declarado. Si una celda queda muda, la columna volvió a no
  // contestar nada.
  const celdas = page.getByTestId('hoy-persona')
  await expect(celdas.first()).toBeVisible()
  const estados = await celdas.evaluateAll((els) => els.map((e) => e.getAttribute('data-estado')))
  expect(estados.every((e) => e != null && e !== ''), 'una celda HOY sin estado').toBe(true)
  expect(estados.every((e) => ['con_horas', 'ausente', 'licencia', 'sin_cargar'].includes(e ?? '')),
    `estado fuera del vocabulario: ${[...new Set(estados)].join(', ')}`).toBe(true)

  const textos = await celdas.evaluateAll((els) => els.map((e) => e.textContent?.trim() ?? ''))
  for (const t of textos) {
    expect(t, 'una celda HOY quedó muda').not.toBe('')
    expect(t.toLowerCase(), `la celda dice «${t}»`).not.toMatch(/fich/)
  }
  // Y lo que dice es la asistencia: horas, una declaración, o «sin cargar».
  expect(textos.some((t) => /sin cargar|\d\s*h|^[AL]/.test(t)),
    `ninguna celda HOY habla de asistencia: ${textos.slice(0, 3).join(' | ')}`).toBe(true)

  await page.screenshot({ path: 'qa-shots/plantel-hoy-asistencia-1440.png', fullPage: false })
})
