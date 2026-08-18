import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { conBase, entrar, limpiar, MARCA, OBRA } from './util/obras-e2e'

// PONER UNA OBRA EN MARCHA DESDE LA WEB — el recorrido de las acciones masivas del cronograma.
//
// ═══ QUÉ PRUEBA ESTE ARCHIVO Y QUÉ NO ═══
//
// No prueba que la pantalla conteste que sí: prueba QUÉ QUEDÓ EN `obra_actividad`. Una escritura
// masiva es la que más barato hace un desastre grande —trescientas filas que nadie mira de a una— y
// el único modo de falla que importa es el silencioso: tocó menos de las que dijo, tocó las que no
// eran, o pisó una línea base que ya estaba midiendo un desvío.
//
// Por eso cada aserción va contra la base, y SIEMPRE incluye una fila TESTIGO que jamás se
// selecciona. Sin el testigo, un `update` sin acotar por obra —o sin acotar por id— pasaría verde:
// todas las filas que se miran tendrían el valor esperado, porque lo tendrían TODAS.
//
// Las actividades de prueba se insertan por la base y no por el formulario, con la MISMA sesión de
// usuario que usa la pantalla: lo que se está probando son las acciones en lote, y cargar cuatro
// altas por formulario sólo agregaría cuatro maneras de que el test falle por otra cosa. Todo lleva
// la marca ZZ-E2E y `limpiar()` lo borra antes y después.

const LOTE = `${MARCA} lote`
const TESTIGO = `${MARCA} testigo`

type Fixture = { a: string; b: string; c: string; testigo: string }

/**
 * Las cuatro filas del recorrido. Las duraciones NO son decorativas: 5, 5 y 10 días son lo que hace
 * que un reparto proporcional de 100 HH dé 25/25/50 y un reparto en partes iguales dé 33,34/33,33/
 * 33,33. Si los tres duraran lo mismo, los dos criterios darían el mismo número y el test no podría
 * distinguirlos.
 */
async function sembrar(sb: SupabaseClient, sufijo: string): Promise<Fixture> {
  const filas = [
    { n: `${MARCA} A ${sufijo}`, s: LOTE, i: '2026-09-01', f: '2026-09-05', o: 9001 },
    { n: `${MARCA} B ${sufijo}`, s: LOTE, i: '2026-09-01', f: '2026-09-05', o: 9002 },
    { n: `${MARCA} C ${sufijo}`, s: LOTE, i: '2026-09-01', f: '2026-09-10', o: 9003 },
    { n: `${MARCA} T ${sufijo}`, s: TESTIGO, i: '2026-09-01', f: '2026-09-05', o: 9004 },
  ]
  const { data, error } = await sb.from('obra_actividad').insert(
    filas.map((r) => ({
      obra_id: OBRA,
      clave: `zz-e2e-${sufijo}/${r.o}`,
      seccion: r.s,
      nombre: r.n,
      tipo: 'tarea',
      orden: r.o,
      inicio_plan: r.i,
      fin_plan: r.f,
      fuente: 'web',
      creada_en_web: true,
    })),
  ).select('id, nombre')
  if (error) throw new Error(`no pude sembrar las actividades de prueba: ${error.message}`)
  const id = (letra: string) => {
    const fila = (data ?? []).find((x) => (x.nombre as string).startsWith(`${MARCA} ${letra} `))
    if (!fila) throw new Error(`falta la actividad ${letra} sembrada`)
    return fila.id as string
  }
  return { a: id('A'), b: id('B'), c: id('C'), testigo: id('T') }
}

/** Lee de la base las columnas que interesan de una actividad. Es la única fuente de verdad del
 *  test: la pantalla no se le pregunta a sí misma si guardó. */
async function enBase(sb: SupabaseClient, id: string) {
  const { data, error } = await sb.from('obra_actividad')
    .select('id, nombre, inicio_plan, fin_plan, inicio_base, fin_base, sellada_en, hh_plan, responsable_id')
    .eq('id', id).single()
  if (error || !data) throw new Error(`no pude leer la actividad ${id}: ${error?.message ?? 'no existe'}`)
  return data
}

test('cronograma: seleccionar, sellar línea base, cargar HH y asignar responsable EN LOTE', async ({ page }) => {
  test.setTimeout(240000)
  const sb = await conBase()
  await limpiar(sb)
  const sufijo = String(Date.now())
  const f = await sembrar(sb, sufijo)
  const nombre = (letra: string) => `${MARCA} ${letra} ${sufijo}`

  try {
    await entrar(page)
    await page.goto(`/obras/${OBRA}?vista=cronograma`)
    await expect(page.getByTestId('gantt')).toBeVisible()

    // ── SIN SELECCIÓN NO HAY BARRA ──────────────────────────────────────────
    await expect(page.getByTestId('barra-masiva')).toHaveCount(0)

    // ═══ 1 · LÍNEA BASE SOBRE UNA SELECCIÓN DE DOS ═══════════════════════════
    await page.getByLabel(`Seleccionar ${nombre('A')}`).check()
    await page.getByLabel(`Seleccionar ${nombre('B')}`).check()
    await expect(page.getByTestId('masiva-conteo')).toHaveText('2 actividades seleccionadas')

    await page.getByTestId('masiva-baseline').click()
    await page.getByTestId('masiva-baseline-aplicar').click()
    await expect(page.getByTestId('masiva-resultado')).toContainText('2 actualizadas')

    // EL EFECTO EN LA BASE. Las dos seleccionadas con su plan congelado…
    await expect(async () => {
      for (const id of [f.a, f.b]) {
        const x = await enBase(sb, id)
        expect(x.inicio_base, `${x.nombre} tiene que quedar sellada`).toBe('2026-09-01')
        expect(x.fin_base).toBe('2026-09-05')
        expect(x.sellada_en, 'el sello lleva su fecha: sin ella no se puede auditar cuándo se congeló').toBeTruthy()
      }
    }).toPass({ timeout: 30000 })

    // …y LAS QUE NO SE TOCARON SIGUEN EN NULL. Éste es el corazón del test: sin esta aserción, un
    // `update` que escribiera la obra entera pasaría verde.
    for (const id of [f.c, f.testigo]) {
      const x = await enBase(sb, id)
      expect(x.inicio_base, `${x.nombre} NO estaba seleccionada`).toBeNull()
      expect(x.fin_base).toBeNull()
      expect(x.sellada_en).toBeNull()
    }

    // ═══ 2 · HH PLAN REPARTIDO SOBRE EL GRUPO ENTERO ═════════════════════════
    await page.getByTestId('masiva-limpiar').click()
    await page.getByLabel(`Seleccionar ${LOTE}`).check()
    await expect(page.getByTestId('masiva-conteo')).toHaveText('3 actividades seleccionadas')

    await page.getByTestId('masiva-hh').click()
    await page.getByTestId('masiva-hh-modo-total').click()
    await page.getByTestId('masiva-hh-valor').fill('100')
    await page.getByTestId('masiva-hh-criterio').selectOption('proporcional')
    await page.getByTestId('masiva-hh-aplicar').click()
    await expect(page.getByTestId('masiva-resultado')).toContainText('3 actualizadas')

    // 5 + 5 + 10 días = 20 → 25 / 25 / 50. Si el reparto fuera por cabeza saldría 33,33 en las tres:
    // los dos criterios existen y no dan lo mismo.
    await expect(async () => {
      expect(Number((await enBase(sb, f.a)).hh_plan)).toBe(25)
      expect(Number((await enBase(sb, f.b)).hh_plan)).toBe(25)
      expect(Number((await enBase(sb, f.c)).hh_plan)).toBe(50)
    }).toPass({ timeout: 30000 })
    expect((await enBase(sb, f.testigo)).hh_plan, 'el testigo no estaba en el grupo').toBeNull()

    // ═══ 3 · RESPONSABLE SOBRE LA MISMA SELECCIÓN ════════════════════════════
    const selector = page.getByTestId('masiva-responsable')
    await selector.click()
    const combo = page.getByTestId('masiva-responsable-select')
    const persona = await combo.locator('option').nth(1).getAttribute('value')
    expect(persona, 'el legajo tiene que tener a alguien para asignar').toBeTruthy()
    await combo.selectOption(persona as string)
    await page.getByTestId('masiva-responsable-aplicar').click()
    await expect(page.getByTestId('masiva-resultado')).toContainText('3 actualizadas')

    await expect(async () => {
      for (const id of [f.a, f.b, f.c]) {
        expect((await enBase(sb, id)).responsable_id).toBe(persona)
      }
    }).toPass({ timeout: 30000 })
    expect((await enBase(sb, f.testigo)).responsable_id, 'el testigo sigue sin responsable').toBeNull()

    // ═══ 4 · LA LÍNEA BASE YA PUESTA NO SE PISA SIN QUE ALGUIEN LO PIDA ══════
    //
    // Es la guarda que hace medible el desvío: re-sellar una actividad que se corrió la devuelve a
    // «en fecha» sin un solo error. Se mueve el fin de plan de A y se intenta sellar de nuevo.
    await sb.from('obra_actividad').update({ fin_plan: '2026-09-30' }).eq('id', f.a)

    await page.getByTestId('masiva-limpiar').click()
    await page.getByLabel(`Seleccionar ${nombre('A')}`).check()
    await page.getByTestId('masiva-baseline').click()
    await page.getByTestId('masiva-baseline-aplicar').click()
    await expect(page.getByTestId('masiva-resultado')).toContainText('ya tienen línea base')

    const intacta = await enBase(sb, f.a)
    expect(intacta.fin_plan, 'el plan sí se movió').toBe('2026-09-30')
    expect(intacta.fin_base, 'la línea base NO se movió: el desvío sigue siendo medible').toBe('2026-09-05')

    // Y con la casilla marcada SÍ se re-sella: es una decisión que alguien toma por escrito.
    await page.getByTestId('masiva-baseline-resellar').check()
    await page.getByTestId('masiva-baseline-aplicar').click()
    await expect(page.getByTestId('masiva-resultado')).toContainText('1 actualizada')
    await expect(async () => {
      expect((await enBase(sb, f.a)).fin_base, 'con el pedido explícito la base se reemplaza').toBe('2026-09-30')
    }).toPass({ timeout: 30000 })

    // El testigo, después de las cuatro operaciones, sigue exactamente como nació.
    const t = await enBase(sb, f.testigo)
    expect(t.inicio_base).toBeNull()
    expect(t.fin_base).toBeNull()
    expect(t.hh_plan).toBeNull()
    expect(t.responsable_id).toBeNull()
  } finally {
    await limpiar(sb)
    await sb.auth.signOut()
  }
})

test('cronograma: HH plan no escribe 0 cuando el total no alcanza', async ({ page }) => {
  test.setTimeout(180000)
  const sb = await conBase()
  await limpiar(sb)
  const sufijo = String(Date.now())
  const f = await sembrar(sb, sufijo)

  try {
    await entrar(page)
    await page.goto(`/obras/${OBRA}?vista=cronograma`)
    await page.getByLabel(`Seleccionar ${LOTE}`).check()

    // Repartir 0 HH es pedir que tres actividades queden en cero, y 0 HH plan dice «esta actividad no
    // lleva mano de obra»: es una afirmación, no un «todavía no sé». Se rechaza y NO se escribe nada.
    await page.getByTestId('masiva-hh').click()
    await page.getByTestId('masiva-hh-modo-total').click()
    await page.getByTestId('masiva-hh-valor').fill('0')
    await page.getByTestId('masiva-hh-aplicar').click()
    await expect(page.getByTestId('masiva-resultado')).toContainText('mayor que cero')

    for (const id of [f.a, f.b, f.c]) {
      expect((await enBase(sb, id)).hh_plan, 'un reparto rechazado no escribe una sola fila').toBeNull()
    }
  } finally {
    await limpiar(sb)
    await sb.auth.signOut()
  }
})
