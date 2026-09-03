import { test, expect, type Locator } from '@playwright/test'
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

test('J06 · LA CAUSA DEL DESVÍO ENTRA POR LA PANTALLA Y LLEGA A `obra_causa_desvio`', async ({ page }) => {
  // ESTE ES EL CAMINO COMPLETO, Y LA EVIDENCIA ES EL SELECT EN EL DESTINO.
  //
  // `public.obra_causa_desvio` tenía UNA fila repartida en dieciocho obras: la columna existía desde
  // agosto, el catálogo también, y ninguna pantalla pedía la causa. Lo que este test prueba no es
  // que aparezca un chip: es que un jefe de obra, con su sesión real y la RLS viva, deja una causa
  // clasificada que la vista de análisis de causas puede contar.
  const admin = servicio()
  const t = await tareaConDesvio(admin)
  await entrarComo(page, JEFE.email, JEFE.password)
  await page.setViewportSize({ width: 390, height: 900 })

  try {
    await page.goto(`/obra/avance?obra=${OBRA}&actividad=${t.actividad_id}`)
    // La pregunta aparece SOLA, porque la tarea está fuera de objetivo. Nadie tuvo que ir a
    // buscar un formulario de cierre de obra.
    const bloque = page.getByTestId('causa-desvio')
    await expect(bloque, 'la pantalla no preguntó por qué se desvió').toBeVisible({ timeout: 30_000 })

    await prender(bloque.getByTestId('causa').filter({ hasText: 'Espera de equipo' }))
    await page.getByTestId('causa-nota').fill(MARCA)
    // EL ÚLTIMO VALOR (100 %), NO EL PRIMERO. La tarea que el test elige puede venir en 85 %, y
    // `deltaHasta` rechaza —bien— un objetivo por debajo del avance actual: el parte no se
    // escribía y el test culpaba a la causa de un problema del valor elegido.
    await prender(page.getByTestId('valor-avance').last())
    await expect(page.getByTestId('guardar-avance'),
      'el botón sigue apagado: el avance no quedó cargado').toBeEnabled()
    await page.getByTestId('guardar-avance').click()
    await expect(page.getByTestId('resultado-avance')).toBeVisible({ timeout: 30_000 })

    // 1 · LA FILA, EN SU TABLA.
    const { data } = await admin.from('obra_ejecucion')
      .select('id, causa_desvio, comentario, fuente')
      .eq('actividad_id', t.actividad_id).eq('fuente', 'jefe_telefono')
      .order('creado_en', { ascending: false }).limit(1)
    const fila = data?.[0] as { causa_desvio: string | null; comentario: string | null } | undefined
    expect(fila, 'no se escribió ninguna fila en obra_ejecucion').toBeTruthy()
    expect(fila!.causa_desvio, 'el parte entró SIN causa: la puerta sigue tapiada').toBe('espera_equipo')
    expect(fila!.comentario).toBe(MARCA)

    // 2 · Y EN LA VISTA QUE CONSUME EL ANÁLISIS. Que la fila exista no alcanza: `obra_causa_desvio`
    // es lo que lee quien pregunta «¿por qué se nos fue el tiempo en esta obra?», y una causa que
    // no llega hasta ahí no le enseña nada a la próxima cotización.
    const { data: vista } = await admin.from('obra_causa_desvio')
      .select('obra_id, causa_desvio, causa, familia, n_incidencias')
      .eq('obra_id', OBRA).eq('causa_desvio', 'espera_equipo')
    const agrupada = vista?.[0] as { causa: string; familia: string; n_incidencias: number } | undefined
    expect(agrupada, 'la causa no llegó a obra_causa_desvio').toBeTruthy()
    expect(agrupada!.causa).toBe('Espera de equipo')
    // La familia es lo que separa lo reclamable al cliente de lo que tenemos que corregir nosotros.
    expect(agrupada!.familia).toBe('equipos')
    expect(agrupada!.n_incidencias).toBeGreaterThan(0)
  } finally {
    await admin.from('obra_ejecucion').delete()
      .eq('actividad_id', t.actividad_id).eq('fuente', 'jefe_telefono')
  }
})

/**
 * UN TOQUE QUE LLEGA ANTES DE LA HIDRATACIÓN NO EXISTE, y en esta VM —con siete agentes encima— el
 * `next dev` tarda. El click se daba, React todavía no escuchaba, el estado no se movía y el botón
 * quedaba apagado para siempre: el test colgaba 240 s y el informe decía «timeout», que no explica
 * nada. Se reintenta hasta que el control quede efectivamente elegido.
 */
async function prender(loc: Locator) {
  await expect(async () => {
    await loc.click()
    await expect(loc).toHaveAttribute('aria-pressed', 'true', { timeout: 2_000 })
  }).toPass({ timeout: 90_000 })
}

/**
 * Una tarea de la obra que la pantalla vaya a marcar como desviada —proyecta fin después del plan—
 * y que TODAVÍA no tenga causa declarada: con una causa vieja el bloque sale en tono neutro y el
 * test dejaría de medir el caso que importa, que es el reclamo.
 */
async function tareaConDesvio(admin: ReturnType<typeof servicio>) {
  const { data } = await admin.from('obra_actividad_control')
    .select('actividad_id, nombre, avance_pct, fin_plan, forecast_fin')
    .eq('obra_id', OBRA).eq('metodo_avance', 'partes').eq('tipo', 'tarea')
    .lt('avance_pct', 100).not('fin_plan', 'is', null).not('forecast_fin', 'is', null)
    .limit(50)
  const candidatas = (data ?? []).filter((o) => {
    const f = o as { fin_plan: string; forecast_fin: string }
    return f.forecast_fin > f.fin_plan
  }) as { actividad_id: string; nombre: string }[]
  for (const c of candidatas) {
    const { data: previos } = await admin.from('obra_ejecucion')
      .select('id').eq('actividad_id', c.actividad_id).not('causa_desvio', 'is', null).limit(1)
    if ((previos ?? []).length === 0) return c
  }
  throw new Error(`ninguna tarea de ${OBRA} se mide por partes, está atrasada y sin causa declarada`)
}
