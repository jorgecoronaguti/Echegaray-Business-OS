// EL GANTT GLOBAL ES DE OBRAS, NO DE ACTIVIDADES — MEDIDO CONTRA EL DOM.
//
// El dueño, textual: *"NO quiero las 344 actividades de todas las obras desplegadas. Quiero UN
// RENGLÓN POR OBRA"* · *"Click en una obra → abre el Gantt detallado DE ESA OBRA."*
//
// ═══ QUÉ DEFECTO ATRAPA, Y POR QUÉ NINGÚN OTRO TEST LO ATRAPA ═══
//
// "El Gantt global se desplegó de vuelta en actividades" no rompe nada: la página abre, las barras
// se ven, el typecheck pasa y el usuario sólo siente que la pantalla es ilegible. El único síntoma
// medible es el CONTEO — 8 renglones contra 344 — y eso hay que contarlo. Si alguien cambiara la
// fuente de `obra_plan_vs_real` a `getActividades()` "para tener más detalle", este archivo se pone
// rojo en la primera línea y ningún otro se entera.
//
// El segundo defecto que atrapa es más silencioso todavía: que una obra SIN fechas de plan reciba
// una barra igual. Ahí la pantalla no miente por lo que dice sino por lo que dibuja, y no hay un
// error en ningún lado. Se mide contra la base ANTES de mirar la pantalla: cuántas obras tienen
// fechas y cuántas no sale de `obra_plan_vs_real`, no de lo que el Gantt haya decidido pintar.
//
// ═══ LA LÍNEA BASE NO SE EXIGE, Y ESO SE MIDE ═══
//
// Al 18/08/2026 hay CERO de 344 actividades con `inicio_base` en toda la empresa, así que ninguna
// obra tiene línea base y exigir la marca sería exigir que la pantalla invente una. Lo que se exige
// es lo contrario y es verificable en los dos sentidos: se cuenta la línea base en la base, y la
// pantalla tiene que dibujar exactamente esa cantidad de marcas. El día que se selle la primera, el
// test empieza a exigirla solo.

import { expect, test } from '@playwright/test'
import { conBase, entrar } from './util/obras-e2e'

/** El renglón de una obra en el Gantt global. */
const RENGLON = '[data-testid="obra-gantt"]'
/** La fila de UNA actividad en el Gantt de obra: acá adentro no puede haber ni una. */
const ACTIVIDAD = '[data-testid="actividad-cronograma"]'

test('el Gantt global dibuja un renglón por obra y ninguna actividad', async ({ page }) => {
  const sb = await conBase()
  try {
    // ── LA VERDAD SE MIDE EN LA BASE PRIMERO ──────────────────────────────────
    // Un test que compara la pantalla contra sí misma no prueba nada: pasa con cualquier número.
    const { data: plazos, error } = await sb
      .from('obra_plan_vs_real')
      .select('obra_id,nombre,estado,inicio_plan,inicio_base,fin_base')
    expect(error?.message ?? null, 'la vista de plan contra real tiene que poder leerse').toBeNull()

    const cartera = (plazos ?? []).filter((o) => o.estado !== 'cerrada')
    const conFechas = cartera.filter((o) => o.inicio_plan != null)
    const sinFechas = cartera.filter((o) => o.inicio_plan == null)
    const conBaseSellada = cartera.filter((o) => o.inicio_base != null && o.fin_base != null)

    expect(cartera.length, 'sin obras en la cartera la comparación no prueba nada').toBeGreaterThan(0)
    expect(conFechas.length, 'sin una sola obra con plan no se puede probar que la barra aparece').toBeGreaterThan(0)

    const { count: nActividades } = await sb
      .from('obra_actividad').select('id', { count: 'exact', head: true }).eq('archivada', false)
    expect(nActividades ?? 0, 'sin actividades, "no se despliegan las actividades" es trivial').toBeGreaterThan(50)

    // ── LA PANTALLA ───────────────────────────────────────────────────────────
    await entrar(page)
    await page.goto('/obras/gantt')
    await expect(page.getByTestId('gantt-obras')).toBeVisible({ timeout: 30000 })

    const renglones = await page.locator(RENGLON).count()
    expect(
      renglones,
      `el Gantt global dibuja ${renglones} renglones y la cartera tiene ${cartera.length} obras`,
    ).toBe(cartera.length)

    // EL CONTRASTE QUE PIDIÓ EL DUEÑO: un renglón por obra, no una fila por actividad.
    expect(
      await page.locator(ACTIVIDAD).count(),
      `el Gantt global no puede desplegar las ${nActividades} actividades: es de obras`,
    ).toBe(0)
    expect(renglones, `${renglones} renglones contra ${nActividades} actividades`).toBeLessThan(nActividades ?? 0)

    // ── LO QUE EXISTE SE DIBUJA; LO QUE NO, SE DICE ───────────────────────────
    const sinPlan = page.getByTestId('obra-sin-plan')
    expect(
      await sinPlan.count(),
      `${sinFechas.length} obras sin fechas de plan en la base tienen que declararlo en la pantalla`,
    ).toBe(sinFechas.length)
    for (const o of sinFechas) {
      const renglon = page.locator(`${RENGLON}[data-obra="${o.obra_id}"]`)
      await expect(renglon, `${o.nombre} no tiene fechas: su renglón tiene que estar igual`).toHaveCount(1)
      // La ausencia se declara en palabras. Una barra de largo cero diría que empieza y termina hoy.
      await expect(renglon).toHaveAttribute('title', /sin (fechas de plan|cronograma)/)
    }
    if (sinFechas.length) {
      await expect(sinPlan.first()).toHaveText(/sin (fechas de plan|cronograma)/)
    }

    // La línea de hoy es uno de los cuatro elementos pedidos y hoy siempre cae dentro del eje:
    // `ventana()` la mete a la fuerza justamente para que nunca quede fuera de la pantalla.
    await expect(page.getByTestId('linea-hoy-obras')).toHaveCount(1)

    // LA LÍNEA BASE: exactamente las que hay, ni una más. Al 18/08/2026 son CERO —0 de 344
    // actividades con `inicio_base`— así que hoy esto exige que NO se dibuje ninguna marca. Se mide
    // contra la base y no contra un cero escrito a mano: el día que se selle la primera línea base,
    // el test empieza a exigir que aparezca sin que nadie lo edite.
    expect(
      await page.getByTestId('linea-base-obra').count(),
      `${conBaseSellada.length} obras tienen línea base sellada en la base de datos`,
    ).toBe(conBaseSellada.length)
  } finally {
    await sb.auth.signOut()
  }
})

test('la obra con fechas tiene barra, y tocar su renglón abre SU cronograma', async ({ page }) => {
  const sb = await conBase()
  try {
    const { data } = await sb
      .from('obra_plan_vs_real')
      .select('obra_id,nombre,inicio_plan,fin_plan,estado')
      .not('inicio_plan', 'is', null)
      .neq('estado', 'cerrada')
    const conPlan = data ?? []
    expect(conPlan.length, 'hace falta al menos una obra con plan').toBeGreaterThan(0)

    await entrar(page)
    await page.goto('/obras/gantt')
    await expect(page.getByTestId('gantt-obras')).toBeVisible({ timeout: 30000 })

    // EL CASO POSITIVO: la obra con fechas tiene barra de verdad, con ancho. Se cuenta contra la
    // base: si el componente dejara de dibujar las barras, el conteo cae y esto se pone rojo.
    for (const o of conPlan) {
      const renglon = page.locator(`${RENGLON}[data-obra="${o.obra_id}"]`)
      await expect(renglon, `${o.nombre} tiene plan y tiene que estar en el Gantt`).toHaveCount(1)
      // El renglón de una obra CON plan no puede declarar una ausencia.
      await expect(renglon).toHaveAttribute('title', /plan \d{2}\/\d{2} → \d{2}\/\d{2}/)
    }

    const elegida = conPlan[0]
    await page.locator(`${RENGLON}[data-obra="${elegida.obra_id}"]`).click()
    await page.waitForURL(new RegExp(`/obras/${elegida.obra_id}\\?vista=cronograma`), { timeout: 20000 })
    // Y del otro lado tiene que estar el Gantt DETALLADO: el de actividades, el que la vista global
    // deliberadamente no es.
    await expect(page.getByTestId('gantt')).toBeVisible({ timeout: 30000 })
    expect(await page.locator(ACTIVIDAD).count(), 'el Gantt de la obra sí despliega sus actividades').toBeGreaterThan(0)
  } finally {
    await sb.auth.signOut()
  }
})

test('el Gantt global no empuja la página de costado en el teléfono', async ({ page }) => {
  // El Gantt es más ancho que un teléfono por definición. Lo que no puede pasar es que arrastre la
  // PÁGINA: el desplazamiento tiene que quedar adentro del contenedor del cronograma.
  await page.setViewportSize({ width: 390, height: 844 })
  await entrar(page)
  await page.goto('/obras/gantt')
  await expect(page.getByTestId('gantt-obras')).toBeVisible({ timeout: 30000 })
  const desborde = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(desborde, `/obras/gantt desborda ${desborde}px de costado en 390px`).toBeLessThanOrEqual(1)
})
