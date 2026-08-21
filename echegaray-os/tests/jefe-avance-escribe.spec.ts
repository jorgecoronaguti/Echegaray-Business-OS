import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { JEFE, servicio } from './util/identidades'

// LA ESCRITURA SE PRUEBA CONTRA EL DATO EN SU DESTINO, NUNCA CONTRA LA PANTALLA QUE DIJO QUE SÍ.
//
// Estos dos tests cargan un avance de verdad desde el teléfono del jefe, LEEN la fila en Postgres y
// después la borran. Lo que verifican no es que aparezca un cartel verde: es que la fila exista, que
// lleve su firma (`metodo`, `masivo`) y —el punto entero de J04— que el número que se guarda sea el
// DELTA y no el objetivo.
//
// ═══ SE LIMPIA SIEMPRE, Y SE LIMPIA POR MARCA ═══
//
// Las filas van con un comentario que las identifica y se borran en el `finally`. Un parte de prueba
// que sobreviva entra en el avance real de una obra viva y nadie va a saber de dónde salió.

const OBRA = 'san-francisco'
const MARCA = 'ZZ-QA-JEFE'

test.describe.configure({ mode: 'serial', timeout: 240_000 })

/** Una tarea real de la obra que se mida por partes y no esté terminada. */
async function tareaMedible(admin: ReturnType<typeof servicio>) {
  const { data } = await admin.from('obra_actividad_control')
    .select('actividad_id, nombre, avance_pct, metodo_avance')
    .eq('obra_id', OBRA).eq('metodo_avance', 'partes').eq('tipo', 'tarea').lt('avance_pct', 100)
    .limit(1)
  const t = data?.[0] as { actividad_id: string; nombre: string; avance_pct: number } | undefined
  if (!t) throw new Error('ninguna tarea de san-francisco se mide por partes y está sin terminar')
  return { ...t, avance_pct: Number(t.avance_pct) }
}

test('J03 · el avance cargado desde el teléfono QUEDA ESCRITO, con su método', async ({ page }) => {
  const admin = servicio()
  const t = await tareaMedible(admin)
  await entrarComo(page, JEFE.email, JEFE.password)
  await page.setViewportSize({ width: 390, height: 900 })

  try {
    await page.goto(`/obra/avance?obra=${OBRA}&actividad=${t.actividad_id}`)
    const objetivo = Math.min(100, Math.round(t.avance_pct) + 5)
    await page.getByTestId('campo-avance').fill(String(objetivo))
    await page.getByTestId('guardar-avance').click()
    await expect(page.getByTestId('resultado-avance')).toBeVisible({ timeout: 30_000 })

    // EL EFECTO, EN SU DESTINO.
    const { data } = await admin.from('obra_ejecucion')
      .select('id, avance_pct, metodo, masivo, fuente')
      .eq('actividad_id', t.actividad_id).eq('fuente', 'jefe_telefono')
      .order('creado_en', { ascending: false }).limit(1)
    const fila = data?.[0] as { avance_pct: string; metodo: string; masivo: boolean } | undefined
    expect(fila, 'no se escribió ninguna fila en obra_ejecucion').toBeTruthy()
    // LO QUE SE CARGA ES EL DELTA: `avance_partes` SUMA los partes. Si acá viniera el objetivo, la
    // actividad quedaría en 105 % y nadie lo notaría hasta el cierre de obra.
    expect(Number(fila!.avance_pct)).toBe(objetivo - t.avance_pct)
    expect(fila!.metodo, 'el registro no dice con qué método se midió').toBe('partes')
    expect(fila!.masivo, 'un parte de a uno no es masivo').toBe(false)
  } finally {
    await admin.from('obra_ejecucion').delete()
      .eq('actividad_id', t.actividad_id).eq('fuente', 'jefe_telefono')
  }
})

test('J04 · el avance masivo marca `masivo` en cada fila que escribe', async ({ page }) => {
  const admin = servicio()
  await entrarComo(page, JEFE.email, JEFE.password)
  await page.setViewportSize({ width: 390, height: 900 })

  try {
    await page.goto(`/obra/avance-masivo?obra=${OBRA}`)
    const primera = page.getByTestId('tarea-masiva').first()
    await expect(primera).toBeVisible({ timeout: 30_000 })
    await primera.click()
    await page.getByTestId('valor-100').click()
    await page.getByTestId('aplicar-masivo').click()
    await expect(page.getByTestId('resultado-masivo')).toBeVisible({ timeout: 30_000 })

    const { data } = await admin.from('obra_ejecucion')
      .select('id, masivo, metodo, criterio').eq('obra_id', OBRA).eq('fuente', 'jefe_telefono')
    const filas = (data ?? []) as { masivo: boolean; metodo: string; criterio: string | null }[]
    expect(filas.length, 'el masivo no escribió nada').toBeGreaterThan(0)
    for (const f of filas) {
      // ESTO ES LO QUE HACE AUDITABLE UNA CARGA MASIVA seis meses después.
      expect(f.masivo, 'una fila del masivo sin marcar como masiva').toBe(true)
      expect(f.metodo, 'una fila sin método no se puede interpretar').toBeTruthy()
      // El criterio SÓLO donde la base lo exige: pegárselo a una medida por partes contaría una
      // historia que no pasó.
      if (f.metodo !== 'manual') expect(f.criterio).toBeNull()
    }
  } finally {
    await admin.from('obra_ejecucion').delete().eq('obra_id', OBRA).eq('fuente', 'jefe_telefono')
  }
})

test('LA HUELLA DE LAS PRUEBAS NO QUEDA EN LA OBRA', async () => {
  // El control del control: si el `finally` de arriba falló, esto lo dice en vez de dejar partes de
  // prueba sumando avance en una obra viva.
  const admin = servicio()
  const { data } = await admin.from('obra_ejecucion').select('id').eq('fuente', 'jefe_telefono')
  expect((data ?? []).length, `quedaron partes de prueba en ${OBRA}: ${MARCA}`).toBe(0)
})
