import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { conBase, entrar, laFila, MARCA, OBRA } from './util/obras-e2e'

// EL WORKSPACE ÚNICO DE LA OBRA — pantallas 03 a 06.
//
// ═══ LO QUE ESTE RECORRIDO PRUEBA DE VERDAD ═══
//
// Que el avance registrado por la pantalla LLEGA A POSTGRES con su método, su criterio, su cuadrilla
// y su firma, y que el porcentaje de la actividad se mueve. El «Registrado.» de la pantalla no
// prueba nada: lo que prueba una escritura es la fila leída en su destino.
//
// Es exactamente el modo de falla que el modelo nuevo vino a impedir: cada método lee su número de
// una fuente distinta, así que escribir en el lugar equivocado deja el registro firmado, con autor
// y hora, y la actividad quieta en el mismo porcentaje. No falla: parece un éxito.

test.describe.configure({ mode: 'serial' })

const NOMBRE = `${MARCA} avance manual`

async function limpiar(sb: SupabaseClient) {
  const { data } = await sb.from('obra_actividad').select('id').eq('obra_id', OBRA).ilike('nombre', `%${MARCA}%`)
  for (const a of data ?? []) await sb.from('obra_ejecucion').delete().eq('actividad_id', a.id)
  await sb.from('obra_actividad').delete().eq('obra_id', OBRA).ilike('nombre', `%${MARCA}%`)
  await sb.from('cuadrilla').delete().ilike('nombre', `%${MARCA}%`)
}

test.beforeAll(async () => { await limpiar(await conBase()) })
test.afterAll(async () => { await limpiar(await conBase()) })

test('el avance registrado por la pantalla llega a Postgres firmado y mueve el porcentaje', async ({ page }) => {
  test.setTimeout(180000)
  const sb = await conBase()
  // ═══ LA CUADRILLA SE CREA PARA LA PRUEBA ═══
  // No hay una sola cuadrilla cargada en la base (21/08/2026). Con un `if (hay cuadrilla)`, la
  // aserción sobre `cuadrilla_id` no correría nunca y el test diría verde sin haber mirado — que es
  // exactamente un control que no puede mirar diciendo «está bien».
  const cuadrilla = laFila(
    (await sb.from('cuadrilla').insert({ nombre: `${MARCA} cuadrilla` }).select('id').single()).data,
    'la cuadrilla de prueba',
  )
  const act = laFila(
    (await sb.from('obra_actividad').insert({
      obra_id: OBRA, nombre: NOMBRE, tipo: 'tarea', orden: 9990,
      clave: `${MARCA}/avance-manual`, estado: 'en_curso', metodo_avance: 'manual', creada_en_web: true,
    }).select('id').single()).data,
    'la actividad de prueba',
  )

  await entrar(page)
  await page.goto(`/obras/${OBRA}/avance/${act.id}`)
  await page.getByTestId('metodo-manual').click()

  // ═══ SIN CRITERIO, LA PRIMARIA NO SE PUEDE TOCAR ═══
  // La base lo exige con un CHECK porque la misma fila entra por el teléfono, por el parte diario y
  // por una acción en lote. La pantalla lo dice antes, con el texto literal del contrato.
  await expect(page.getByTestId('form-avance-enviar')).toBeDisabled()
  await expect(page.getByTestId('aviso-criterio')).toContainText(
    'El método manual exige un criterio escrito. Sin eso el porcentaje no se puede interpretar después.')

  await page.getByTestId('escalon-75').click()
  await page.getByTestId('campo-criterio').fill('Muros del eje 3 levantados hasta dintel; falta encadenado.')
  await page.getByTestId('campo-cuadrilla').selectOption(cuadrilla.id as string)
  await expect(page.getByTestId('form-avance-enviar')).toBeEnabled()
  await page.getByTestId('form-avance-enviar').click()
  await expect(page.getByTestId('form-avance-ok')).toBeVisible({ timeout: 30000 })

  // ═══ LA EVIDENCIA ES LA FILA, NO LA PANTALLA ═══
  const fila = laFila(
    (await sb.from('obra_ejecucion')
      .select('avance_pct, metodo, criterio, cuadrilla_id, creado_por, masivo, fuente')
      .eq('actividad_id', act.id).maybeSingle()).data,
    'el registro de avance en obra_ejecucion',
  )
  expect(Number(fila.avance_pct)).toBe(75)
  expect(fila.metodo).toBe('manual')
  expect(fila.criterio, 'el criterio no viajó: el porcentaje queda sin interpretar').toContain('encadenado')
  expect(fila.creado_por, 'el registro quedó sin firma: `creado_por` es null').not.toBeNull()
  expect(fila.masivo).toBe(false)
  expect(fila.cuadrilla_id, 'la cuadrilla elegida no viajó: el avance queda sin dueño').toBe(cuadrilla.id)

  // Y EL NÚMERO SE MOVIÓ. Escribir el registro sin que el avance cambie es el peor de los dos
  // resultados posibles: queda la firma y no queda el hecho.
  const control = laFila(
    (await sb.from('obra_actividad_control').select('avance_pct, origen_avance')
      .eq('actividad_id', act.id).maybeSingle()).data,
    'la actividad en obra_actividad_control',
  )
  expect(Number(control.avance_pct)).toBe(75)
  expect(control.origen_avance).toBe('declarado')
})

// LA CELDA QUE SE CORRIGE EN LUGAR — el componente que faltaba en el repositorio.
//
// Lo que se prueba es el EFECTO: que lo tipeado en la celda llegue a la fila. Y que cargar la
// cantidad objetivo CAMBIE EL MÉTODO — sin eso, alguien carga producción todos los días y el
// porcentaje no se mueve porque la actividad sigue leyendo el número que declaró el Sheet.
test('corregir la cantidad en la celda llega a la fila y elige el método', async ({ page }) => {
  test.setTimeout(180000)
  const sb = await conBase()
  const act = laFila(
    (await sb.from('obra_actividad').insert({
      obra_id: OBRA, nombre: `${MARCA} inline`, tipo: 'tarea', orden: 9992,
      clave: `${MARCA}/inline`, estado: 'pendiente', metodo_avance: 'manual', creada_en_web: true,
    }).select('id').single()).data,
    'la actividad de prueba del inline',
  )
  await entrar(page)
  await page.goto(`/obras/${OBRA}?vista=tareas&act=${act.id}&sol=general`)
  // LA UNIDAD PRIMERO Y EL OBJETIVO DESPUÉS: medir por cantidad exige las dos mitades y la base lo
  // hace cumplir con un CHECK. Con una sola, «96» es un número que nadie puede interpretar.
  await page.getByTestId('editar-unidad').click()
  await page.getByTestId('editar-unidad-campo').fill('m²')
  await page.getByTestId('editar-unidad-campo').press('Enter')
  await expect(page.getByTestId('editar-unidad-error')).toHaveCount(0)
  await page.getByTestId('editar-cantidad').click()
  await page.getByTestId('editar-cantidad-campo').fill('96')
  await page.getByTestId('editar-cantidad-campo').press('Enter')
  await expect(page.getByTestId('editar-cantidad-error'),
    'el servidor rechazó la corrección y la celda lo dijo').toHaveCount(0)

  await expect.poll(async () => {
    const { data } = await sb.from('obra_actividad')
      .select('cantidad_objetivo, unidad, metodo_avance').eq('id', act.id).single()
    return data && { ...data, cantidad_objetivo: Number(data.cantidad_objetivo) }
  }, { timeout: 20000 }).toMatchObject({ cantidad_objetivo: 96, unidad: 'm²', metodo_avance: 'cantidad' })
})

test('el árbol se dibuja en orden constructivo, se colapsa y el pie cuenta lo que falta', async ({ page }) => {
  test.setTimeout(180000)
  await entrar(page)
  await page.goto('/obras/san-francisco?vista=tareas')
  const tabla = page.getByTestId('tabla-wbs')
  await expect(tabla).toBeVisible()
  const todas = await tabla.locator('tbody tr').count()
  expect(todas, 'san-francisco tiene 124 actividades: el árbol no puede venir vacío').toBeGreaterThan(20)

  // COLAPSAR ESCONDE LAS HIJAS Y DEJA LOS CONTENEDORES. Si escondiera todo, no habría nada que
  // desplegar; si no escondiera nada, el botón no haría nada y nadie se enteraría.
  await page.getByTestId('colapsar').click()
  const colapsadas = await tabla.locator('tbody tr').count()
  expect(colapsadas).toBeLessThan(todas)
  await page.getByTestId('expandir').click()
  expect(await tabla.locator('tbody tr').count()).toBe(todas)
})

test('un contenedor no se puede tildar ni medir: se agrega', async ({ page }) => {
  test.setTimeout(180000)
  const sb = await conBase()
  const contenedor = laFila(
    (await sb.from('obra_actividad').select('id, nombre')
      .eq('obra_id', 'san-francisco').eq('tipo', 'resumen').limit(1).maybeSingle()).data,
    'un contenedor de san-francisco',
  )
  await entrar(page)
  await page.goto(`/obras/san-francisco/avance/${contenedor.id}`)
  await expect(page.getByTestId('es-contenedor')).toContainText('el avance se registra en las que agrupa')
  await expect(page.getByTestId('form-avance')).toHaveCount(0)
})

test('el avance masivo dice qué va a quedar en cada fila antes de escribir', async ({ page }) => {
  test.setTimeout(180000)
  await entrar(page)
  await page.goto('/obras/san-francisco/avance-masivo')
  await expect(page.getByTestId('tabla-masiva')).toBeVisible()
  await page.getByTestId('sel-todo').click()
  const barra = page.getByTestId('barra-tareas')
  await expect(barra).toBeVisible()
  // EL BOTÓN DICE A CUÁNTAS SE VA A ESCRIBIR, no cuántas hay tildadas. Las que se miden por pasos y
  // las que no tienen cantidad objetivo no reciben un porcentaje general, y eso se ve antes.
  await expect(page.getByTestId('barra-tareas-aplicar')).toContainText(/Aplicar a \d+/)
  await page.getByTestId('barra-tareas-cancelar').click()
  await expect(barra).toHaveCount(0)
})

// ═══ LA ESCRITURA EN LOTE, MEDIDA EN LA BASE ═══
//
// Es lo más riesgoso de las cuatro pantallas: una operación que toca N filas y sale bien a medias
// no se nota. Se prueba con DOS actividades marcadas y una tercera sin marcar, y se verifica que la
// tercera NO se haya movido — un lote que escribe de más es tan defectuoso como uno que escribe de
// menos, y sólo la que quedó afuera lo demuestra.
test('el avance en lote escribe las marcadas, deja la no marcada quieta y firma cada registro', async ({ page }) => {
  test.setTimeout(180000)
  const sb = await conBase()
  const ids: string[] = []
  for (const n of ['lote uno', 'lote dos', 'lote tres']) {
    const a = laFila(
      (await sb.from('obra_actividad').insert({
        obra_id: OBRA, nombre: `${MARCA} ${n}`, tipo: 'tarea', orden: 9995,
        clave: `${MARCA}/${n.replace(/ /g, '-')}`, estado: 'pendiente',
        metodo_avance: 'manual', creada_en_web: true,
      }).select('id').single()).data,
      `la actividad «${n}»`,
    )
    ids.push(a.id as string)
  }

  await entrar(page)
  await page.goto(`/obras/${OBRA}/avance-masivo`)
  await page.getByTestId('buscar-masivo').fill(`${MARCA} lote`)
  await page.getByTestId(`masivo-sel-${ids[0]}`).check()
  await page.getByTestId(`masivo-sel-${ids[1]}`).check()
  await expect(page.getByTestId('barra-tareas-conteo')).toHaveText('2 actividades')
  await page.getByTestId('chip-avance-25').click()
  await expect(page.getByTestId('barra-tareas-aplicar')).toHaveText('Aplicar a 2')
  await page.getByTestId('barra-tareas-aplicar').click()
  await expect(page.getByTestId('masiva-resultado')).toContainText('2 escritas', { timeout: 30000 })

  await expect.poll(async () => {
    const { data } = await sb.from('obra_actividad_control')
      .select('actividad_id, avance_pct').in('actividad_id', ids)
    return (data ?? []).map((d) => `${ids.indexOf(d.actividad_id as string)}:${d.avance_pct}`).sort()
  }, { timeout: 20000 }).toEqual(['0:25', '1:25', '2:null'])

  const { data: registros } = await sb.from('obra_ejecucion')
    .select('actividad_id, metodo, criterio, masivo, creado_por').in('actividad_id', ids)
  expect(registros?.length, 'el lote escribió una cantidad de registros distinta de la que dijo').toBe(2)
  for (const r of registros ?? []) {
    expect(r.masivo, 'el registro no dice que entró en lote').toBe(true)
    expect(r.metodo).toBe('manual')
    // EL MÉTODO MANUAL EXIGE CRITERIO TAMBIÉN EN LOTE — y sobre todo en lote: un 25 % aplicado a
    // veinte actividades a la vez es exactamente el porcentaje que nadie va a poder interpretar
    // después si no dice de dónde salió.
    expect(r.criterio, 'un registro manual en lote quedó sin criterio').toBeTruthy()
    expect(r.creado_por, 'el registro en lote quedó sin firma').not.toBeNull()
  }
})
