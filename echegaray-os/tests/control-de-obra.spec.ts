import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { entrar, MARCA } from './util/obras-e2e'

// CONTROL DE OBRA — EL CIRCUITO COMPLETO, CONTRA PRODUCCIÓN.
//
// ═══ QUÉ PRUEBA ═══
//
// Que una obra se pueda planificar, ejecutar y medir SIN abrir «Avances de Obra»: crear la
// actividad, decirle en qué unidad se mide, verla en las cuatro vistas, registrar la producción de
// un día con su cuadrilla, y comprobar que ESA MISMA carga movió el acumulado, el avance calculado,
// las HH de la actividad y las HH de la persona.
//
// ═══ LA EVIDENCIA ES DEL EFECTO ═══
//
// Después de cada escritura se lee la BASE, no el cartel verde. Y el número que se verifica es el
// que publica `obra_actividad_control`, que es el mismo que lee la pantalla: comprobar contra una
// suma calculada en el test probaría que el test sabe sumar, no que el sistema calcula bien.
//
// ═══ OBRA ═══
//
// `messina` — está activa, tiene cronograma cargado y ninguna otra suite la toca. Playwright corre
// los archivos en paralelo y dos suites escribiendo sobre la misma obra se ven las filas entre
// ellas: eso ya produjo tres rojos sin defecto en este repo.
//
// TODO LO QUE CREA LLEVA `ZZ-E2E` Y SE BORRA EN EL `afterAll`.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const sb = (): SupabaseClient => createClient(URL, SRV, { auth: { persistSession: false } })

const OBRA = 'messina'
const NOMBRE = `${MARCA} Mampostería de prueba`
const HOY = new Date().toISOString().slice(0, 10)

async function limpiar() {
  const c = sb()
  const { data: acts } = await c.from('obra_actividad').select('id').eq('obra_id', OBRA).ilike('nombre', `%${MARCA}%`)
  const ids = (acts ?? []).map((a) => (a as { id: string }).id)
  if (ids.length) {
    await c.from('obra_ejecucion').delete().in('actividad_id', ids)
    await c.from('registros_hh').delete().in('actividad_id', ids)
    await c.from('obra_restriccion').delete().in('actividad_id', ids)
    await c.from('obra_actividad').delete().in('id', ids)
  }
}

test.beforeAll(limpiar)
test.afterAll(limpiar)

test('1-9 · crear la actividad, medirla en m², y verla en las cuatro vistas', async ({ page }) => {
  const c = sb()
  const { data: creada, error } = await c.from('obra_actividad').insert({
    obra_id: OBRA,
    nombre: NOMBRE,
    tipo: 'tarea',
    orden: 9000,
    clave: `zz-e2e/${MARCA.toLowerCase()}-mamposteria`,
    seccion: `${MARCA} RUBRO`,
    fuente: 'web',
    creada_en_web: true,
    inicio_plan: HOY,
    fin_plan: HOY,
    hh_plan: 40,
    estado: 'en_curso',
  }).select('id').single()
  expect(error, error?.message).toBeNull()
  const actividadId = (creada as { id: string }).id

  await entrar(page)

  // ═══ LA UNIDAD Y EL OBJETIVO SE CARGAN DESDE EL PANEL ═══
  await page.goto(`/obras/${OBRA}?vista=cronograma&sub=gantt&act=${actividadId}`)
  await expect(page.getByTestId('panel-actividad')).toBeVisible()
  const medicion = page.getByTestId('bloque-medicion')
  if (!(await medicion.getAttribute('open'))) await medicion.locator('summary').click()
  await medicion.locator('input[name="unidad"]').fill('m²')
  await medicion.locator('input[name="cantidad_objetivo"]').fill('180')
  await medicion.getByTestId('metodo-avance').selectOption('cantidad')
  await medicion.getByTestId('form-medicion').getByRole('button', { name: 'Guardar' }).click()

  // PostgREST devuelve `numeric` como número o como cadena según el tipo de la columna en la vista;
  // se normaliza acá para que el test mida el DATO y no la serialización.
  await expect.poll(async () => {
    const { data } = await c.from('obra_actividad_control')
      .select('unidad, cantidad_objetivo, metodo_avance').eq('actividad_id', actividadId).single()
    const d = data as { unidad: string; cantidad_objetivo: number | string; metodo_avance: string } | null
    return d && { ...d, cantidad_objetivo: Number(d.cantidad_objetivo) }
  }, { timeout: 15_000 }).toMatchObject({ unidad: 'm²', cantidad_objetivo: 180, metodo_avance: 'cantidad' })

  // ═══ LAS CUATRO VISTAS MUESTRAN LA MISMA ACTIVIDAD ═══
  // No es una comprobación de que "se ve": es la que impide que existan dos sistemas. Si una vista
  // trajera sus propias filas, alcanzaría con que filtrara distinto para que la obra tuviera dos
  // planes — y nadie lo notaría hasta que los números no cerraran.
  for (const sub of ['lista', 'tablero', 'proximos'] as const) {
    await page.goto(`/obras/${OBRA}?vista=cronograma&sub=${sub}`)
    await expect(page.getByText(NOMBRE).first(), `no aparece en ${sub}`).toBeVisible({ timeout: 15_000 })
  }
  // En el tablero cae en «En curso», que es su estado.
  await page.goto(`/obras/${OBRA}?vista=cronograma&sub=tablero`)
  await expect(page.getByTestId('columna-en_curso').getByText(NOMBRE)).toBeVisible()
})

test('14-20 · un parte mueve la producción, el avance, las HH de la obra y las de la persona', async ({ page }) => {
  const c = sb()
  const { data: act } = await c.from('obra_actividad').select('id').eq('obra_id', OBRA).ilike('nombre', `%${MARCA}%`).single()
  const actividadId = (act as { id: string }).id
  const { data: persona } = await c.from('personas').select('id, nombre_completo').eq('en_la_empresa', true).limit(1).single()
  const personaId = (persona as { id: string }).id

  await entrar(page)
  await page.goto(`/obras/${OBRA}?vista=ejecucion`)
  await page.getByTestId('abrir-registrar').click()
  const panel = page.getByTestId('panel-registrar')
  await panel.getByTestId('parte-actividad').selectOption(actividadId)
  await panel.getByTestId('parte-cantidad').fill('45')
  await panel.getByTestId('parte-comentario').fill(`${MARCA} parte de prueba`)
  await panel.getByTestId('parte-personal').locator('summary').click()
  await panel.getByTestId(`horas-${personaId}`).fill('8')
  await panel.getByTestId('form-ejecucion').getByRole('button', { name: 'Guardar parte' }).click()

  // ═══ UNA CARGA, CUATRO EFECTOS — leídos en la base, no en la pantalla ═══
  await expect.poll(async () => {
    const { data } = await c.from('obra_actividad_control')
      .select('cantidad_ejecutada, avance_pct, origen_avance, hh_real')
      .eq('actividad_id', actividadId).single()
    const d = data as Record<string, string | number | null> | null
    return d && {
      cantidad_ejecutada: Number(d.cantidad_ejecutada), avance_pct: Number(d.avance_pct),
      origen_avance: d.origen_avance, hh_real: Number(d.hh_real),
    }
  }, { timeout: 20_000 }).toMatchObject({
    cantidad_ejecutada: 45,
    // 45 de 180 = 25%, CALCULADO por la vista. Que el número salga de la producción y no de que
    // alguien lo escriba es el punto entero de este módulo.
    avance_pct: 25,
    origen_avance: 'cantidad',
    hh_real: 8,
  })

  // LAS HORAS SON LAS MISMAS DE PERSONAL, no una copia: una sola fila en `registros_hh`.
  const { data: horas } = await c.from('registros_hh')
    .select('horas, persona_id, obra_canonica_id').eq('actividad_id', actividadId)
  expect(horas).toHaveLength(1)
  expect(horas![0]).toMatchObject({ persona_id: personaId, obra_canonica_id: OBRA })

  // Y SE VEN EN LA FICHA DE LA PERSONA, que lee la misma fuente canónica de tiempo. Es el punto de
  // «una carga, muchos efectos»: nadie volvió a cargar estas horas en Personal.
  await page.goto(`/administracion/personas/${personaId}?v=horas&p=mes`)
  await expect(page.getByTestId('hh-por-actividad')).toContainText(NOMBRE, { timeout: 15_000 })

  // El acumulado se ve en Ejecución con las dos puntas: lo hecho y el objetivo.
  await page.goto(`/obras/${OBRA}?vista=ejecucion`)
  const fila = page.getByTestId('tabla-ejecucion').locator('tr', { hasText: NOMBRE })
  await expect(fila).toContainText('45')
  await expect(fila).toContainText('180')
  await expect(fila).toContainText('25')
})

test('21-23 · un impedimento abierto bloquea la actividad, y resolverlo la destraba', async () => {
  const c = sb()
  const { data: act } = await c.from('obra_actividad').select('id, estado').eq('obra_id', OBRA).ilike('nombre', `%${MARCA}%`).single()
  const actividadId = (act as { id: string; estado: string }).id

  const { data: imp, error } = await c.from('obra_restriccion').insert({
    obra_id: OBRA, actividad_id: actividadId, tipo: 'material',
    descripcion: `${MARCA} falta el ladrillo`, estado: 'abierta',
  }).select('id').single()
  expect(error, error?.message).toBeNull()

  // BLOQUEADA NO SE GUARDA: se deriva. El estado cargado sigue siendo el mismo y el operativo cambia
  // solo — que es lo que hace que resolver el impedimento destrabe la actividad sin que nadie se
  // acuerde de volver a tocarla.
  const leer = async () => (await c.from('obra_actividad_control')
    .select('estado, estado_operativo, impedimentos_abiertos').eq('actividad_id', actividadId).single()).data
  expect(await leer()).toMatchObject({ estado: 'en_curso', estado_operativo: 'bloqueada', impedimentos_abiertos: 1 })

  await c.from('obra_restriccion').update({ fecha_liberacion: HOY, estado: 'liberada' })
    .eq('id', (imp as { id: string }).id)
  expect(await leer()).toMatchObject({ estado_operativo: 'en_curso', impedimentos_abiertos: 0 })
})
