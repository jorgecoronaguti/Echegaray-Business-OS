import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { entrar } from './util/obras-e2e'

// GESTIÓN DE OBRA — EL CIRCUITO DE CIERRE, CONTRA PRODUCCIÓN.
//
// ═══ QUÉ PRUEBA, Y POR QUÉ ESTE Y NO OTRO ═══
//
// `control-de-obra.spec.ts` ya prueba el núcleo: medir una actividad, cargar un parte y que UNA carga
// mueva producción, avance y HH. Éste prueba lo que faltaba para dejar de abrir «Avances de Obra»:
//
//   · el RUBRO se crea, agrupa y se renombra arrastrando a sus hijas;
//   · la PRECEDENCIA se declara desde el panel (hasta hoy no había un solo control para hacerlo);
//   · el EQUIPO de una jornada queda registrado, y NO se cuela en las HH de mano de obra;
//   · la NOTA y el PAPEL se cuelgan de la actividad;
//   · el IMPEDIMENTO se anota y se resuelve sin salir del panel;
//   · el FILTRO recorta las cuatro vistas y no rompe la estructura de rubros.
//
// ═══ LA EVIDENCIA ES DEL EFECTO ═══
//
// Después de cada escritura se lee la BASE, no el cartel verde de la pantalla.
//
// ═══ OBRA Y MARCA PROPIAS ═══
//
// `pisos-120m2` — activa, sin cronograma cargado y ninguna otra suite la toca. Playwright corre los
// archivos en paralelo: dos suites escribiendo sobre la misma obra se ven las filas entre ellas, y
// eso ya produjo tres rojos sin defecto en este repo.
//
// TODO LO QUE CREA LLEVA `ZZ-CIERRE` Y SE BORRA EN EL `afterAll`.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const sb = (): SupabaseClient => createClient(URL, SRV, { auth: { persistSession: false } })

const OBRA = 'pisos-120m2'
const M = 'ZZ-CIERRE'
const RUBRO = `${M} Estructura`
const RUBRO2 = `${M} Estructura y fundaciones`
const ACT = `${M} Columnas de carga`
const PREVIA = `${M} Excavaciones`
const HOY = new Date().toISOString().slice(0, 10)

async function limpiar() {
  const c = sb()
  const { data: acts } = await c.from('obra_actividad').select('id').eq('obra_id', OBRA).ilike('nombre', `%${M}%`)
  const ids = (acts ?? []).map((a) => (a as { id: string }).id)
  if (ids.length) {
    const { data: partes } = await c.from('obra_ejecucion').select('id').in('actividad_id', ids)
    const pids = (partes ?? []).map((p) => (p as { id: string }).id)
    if (pids.length) await c.from('obra_ejecucion_equipo').delete().in('ejecucion_id', pids)
    await c.from('obra_ejecucion').delete().in('actividad_id', ids)
    await c.from('registros_hh').delete().in('actividad_id', ids)
    await c.from('obra_restriccion').delete().in('actividad_id', ids)
    await c.from('obra_actividad_nota').delete().in('actividad_id', ids)
    await c.from('obra_documento').delete().in('actividad_id', ids)
    await c.from('obra_dependencia').delete().in('origen_id', ids)
    await c.from('obra_dependencia').delete().in('destino_id', ids)
    // LAS TAREAS PRIMERO, y por eso dos borrados: `actividad_padre_id` tiene `on delete cascade`,
    // pero una tarea cuyo nombre lleva la marca y cuyo padre no la lleva quedaría huérfana del
    // filtro. Se borra por id, que ya incluye a las dos.
    await c.from('obra_actividad').delete().in('actividad_padre_id', ids)
    await c.from('obra_actividad').delete().in('id', ids)
  }
  await c.from('obra_actividad').delete().eq('obra_id', OBRA).ilike('seccion', `%${M}%`)
  await c.from('obra_restriccion').delete().eq('obra_id', OBRA).ilike('descripcion', `%${M}%`)
}

// EN SERIE: los tests de este archivo son UN circuito. `fullyParallel` reparte los tests de un mismo
// archivo entre workers y cada worker corre su propio `beforeAll`, así que el `limpiar()` del
// segundo borraría lo que creó el primero — un rojo sin un solo defecto detrás.
test.describe.configure({ mode: 'serial' })

test.beforeAll(limpiar)
test.afterAll(limpiar)

test('1-4 · el rubro se crea desde la pantalla y la actividad nace adentro', async ({ page }) => {
  const c = sb()
  await entrar(page)
  await page.goto(`/obras/${OBRA}?vista=cronograma&sub=gantt`)
  await expect(page.getByTestId('barra-plan')).toBeVisible({ timeout: 20_000 })

  // ═══ + NUEVO RUBRO ═══
  await page.getByTestId('nuevo-rubro').click()
  await page.getByTestId('rubro-nombre').fill(RUBRO)
  await page.getByTestId('form-rubro').getByRole('button', { name: 'Crear rubro' }).click()

  await expect.poll(async () => {
    const { count } = await c.from('obra_actividad').select('id', { count: 'exact', head: true })
      .eq('obra_id', OBRA).eq('tipo', 'resumen').eq('nombre', RUBRO)
    return count
  }, { timeout: 20_000 }).toBe(1)

  // ═══ EL DUPLICADO ACCIDENTAL SE CORTA EN EL ALTA ═══
  // «MAMPOSTERIA» contra «Mampostería» no puede convertirse en dos rubros. Y el mensaje NOMBRA el que
  // ya existe: decir sólo «ya existe» obliga a ir a buscar cuál.
  await page.getByTestId('rubro-nombre').fill(RUBRO.toUpperCase())
  await page.getByTestId('form-rubro').getByRole('button', { name: 'Crear rubro' }).click()
  await expect(page.getByTestId('form-rubro')).toContainText(RUBRO, { timeout: 15_000 })
  const { count: repetidos } = await c.from('obra_actividad').select('id', { count: 'exact', head: true })
    .eq('obra_id', OBRA).eq('tipo', 'resumen').ilike('nombre', `%${M} Estructura`)
  expect(repetidos, 'el duplicado accidental entró igual').toBe(1)

  // ═══ + NUEVA ACTIVIDAD, DENTRO DEL RUBRO ═══
  // El alta vive en la barra de Planificación y no adentro del Gantt: desde Lista, Tablero o Próximos
  // no se podía crear nada.
  for (const [nombre, dias] of [[PREVIA, 0], [ACT, 3]] as const) {
    await page.getByTestId('nueva-actividad').click()
    const alta = page.getByTestId('alta-actividad')
    await alta.locator('input[name="nombre"]').fill(nombre)
    await alta.getByTestId('alta-rubro').fill(RUBRO)
    await alta.locator('input[name="inicio_plan"]').fill(HOY)
    await alta.locator('input[name="fin_plan"]').fill(HOY)
    await alta.locator('input[name="hh_plan"]').fill('40')
    await alta.locator('input[name="dias_plan"]').fill(String(dias))
    await alta.getByRole('button', { name: 'Crear actividad' }).click()
    await expect.poll(async () => {
      const { count } = await c.from('obra_actividad').select('id', { count: 'exact', head: true })
        .eq('obra_id', OBRA).eq('nombre', nombre)
      return count
    }, { timeout: 20_000 }).toBe(1)
    await page.getByTestId('nueva-actividad').click()
  }

  // ═══ LA ACTIVIDAD CUELGA DEL RUBRO EN LAS CUATRO VISTAS ═══
  await page.reload()
  await expect(page.getByTestId('gantt')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('grupo-cronograma').filter({ hasText: RUBRO })).toBeVisible()
  for (const sub of ['lista', 'tablero', 'proximos'] as const) {
    await page.goto(`/obras/${OBRA}?vista=cronograma&sub=${sub}`)
    await expect(page.getByText(ACT).first(), `no aparece en ${sub}`).toBeVisible({ timeout: 20_000 })
  }
})

test('5-9 · el panel declara la precedencia, la tarea, el impedimento y la nota', async ({ page }) => {
  const c = sb()
  const { data: a } = await c.from('obra_actividad').select('id').eq('obra_id', OBRA).eq('nombre', ACT).single()
  const actividadId = (a as { id: string }).id

  await entrar(page)
  await page.goto(`/obras/${OBRA}?vista=cronograma&sub=gantt&act=${actividadId}`)
  await expect(page.getByTestId('gantt')).toBeVisible({ timeout: 20_000 })
  const panel = page.getByTestId('panel-actividad')
  await expect(panel).toBeVisible({ timeout: 20_000 })

  // ═══ MEDIRLA ═══
  const medicion = panel.getByTestId('bloque-medicion')
  await medicion.locator('summary').click()
  await medicion.locator('input[name="unidad"]').fill('un')
  await medicion.locator('input[name="cantidad_objetivo"]').fill('12')
  await medicion.getByTestId('metodo-avance').selectOption('cantidad')
  await medicion.getByTestId('form-medicion').getByRole('button', { name: 'Guardar' }).click()

  // ═══ LA PRECEDENCIA — el control que no existía ═══
  // `agregarDependencia` estaba escrita desde el 17/08 y la página no la ataba: el panel decía «nada
  // declarado» sin un solo control para declarar algo, y el Gantt no dibujaba flechas porque la
  // tabla estaba vacía por falta de PUERTA, no por falta de dato.
  await panel.getByTestId('tab-panel-dependencias').click()
  const dep = panel.getByTestId('panel-dependencias')
  if ((await dep.getAttribute('open')) === null) await dep.locator('summary').click()
  await dep.getByTestId('dependencia-origen').selectOption({ label: PREVIA })
  await dep.getByTestId('form-dependencia').getByRole('button', { name: 'Agregar dependencia' }).click()
  await expect.poll(async () => {
    const { count } = await c.from('obra_dependencia').select('id', { count: 'exact', head: true })
      .eq('destino_id', actividadId)
    return count
  }, { timeout: 20_000 }).toBe(1)

  // ═══ LA TAREA ═══
  await panel.getByTestId('tab-panel-tareas').click()
  const tareas = panel.getByTestId('bloque-tareas')
  if ((await tareas.getAttribute('open')) === null) await tareas.locator('summary').click()
  await tareas.getByTestId('tarea-nombre').fill(`${M} encofrado`)
  await tareas.getByTestId('form-tarea').getByRole('button', { name: 'Agregar' }).click()

  // ═══ EL IMPEDIMENTO, ANOTADO Y RESUELTO SIN SALIR DEL PANEL ═══
  // IMPEDIMENTOS Y NOTAS VIVEN EN «Resumen», que es la pestaña del panorama operativo. El test
  // venía de «Tareas», así que hay que volver.
  await panel.getByTestId('tab-panel-resumen').click()
  const imp = panel.getByTestId('panel-impedimentos')
  await imp.locator('summary').click()
  const form = imp.getByTestId('form-impedimento-actividad')
  await form.locator('input[name="descripcion"]').fill(`${M} falta el hierro`)
  await form.locator('input[name="responsable"]').fill('Compras')
  await form.locator('input[name="fecha_compromiso"]').fill(HOY)
  await form.getByRole('button', { name: 'Anotar' }).click()

  // BLOQUEADA NO SE GUARDA: se DERIVA de tener un impedimento abierto. Por eso resolverlo la
  // destraba sola, sin que nadie se acuerde de volver a tocar el estado.
  await expect.poll(async () => {
    const { data } = await c.from('obra_actividad_control')
      .select('estado, estado_operativo, n_tareas, n_notas').eq('actividad_id', actividadId).single()
    return data
  }, { timeout: 20_000 }).toMatchObject({ estado_operativo: 'bloqueada', n_tareas: 1 })

  await page.reload()
  await expect(panel).toBeVisible({ timeout: 20_000 })

  // ═══ Y SE CORRIGE SIN DUPLICARLO ═══
  // Lo que se mide no es que el formulario acepte: es que DESPUÉS de editar siga habiendo UNA sola
  // fila. Liberar el viejo y anotar otro también dejaría el responsable nuevo en pantalla, y sería
  // el defecto que esta acción existe para evitar.
  const editarImp = panel.getByTestId('editar-impedimento').first()
  await editarImp.locator('summary').click()
  const fEdit = editarImp.getByTestId('form-editar-impedimento')
  await fEdit.locator('input[name="responsable"]').fill('Jefe de obra')
  await fEdit.getByRole('button', { name: 'Guardar' }).click()
  await expect.poll(async () => {
    const { data } = await c.from('obra_restriccion')
      .select('responsable, estado').eq('actividad_id', actividadId)
    const filas = (data ?? []) as { responsable: string; estado: string }[]
    return { cuantas: filas.length, responsable: filas[0]?.responsable }
  }, { timeout: 20_000 }).toMatchObject({ cuantas: 1, responsable: 'Jefe de obra' })

  await page.reload()
  await expect(panel).toBeVisible({ timeout: 20_000 })
  await panel.getByTestId('resolver-impedimento').first().click()
  // RESUELTO EL IMPEDIMENTO, EL OPERATIVO VUELVE A SER EL GUARDADO. Se compara contra `estado` y no
  // contra un valor escrito a mano: lo que se afirma es la REGLA —bloqueada se deriva y se
  // desderiva— y no en qué estado quedó esta actividad de prueba.
  await expect.poll(async () => {
    const { data } = await c.from('obra_actividad_control')
      .select('estado, estado_operativo, impedimentos_abiertos').eq('actividad_id', actividadId).single()
    const d = data as { estado: string; estado_operativo: string; impedimentos_abiertos: number } | null
    return d && { iguales: d.estado === d.estado_operativo, abiertos: d.impedimentos_abiertos }
  }, { timeout: 20_000 }).toMatchObject({ iguales: true, abiertos: 0 })

  // ═══ LA NOTA ═══
  // LAS NOTAS YA NO SE ABREN: son un bloque visible al final del panel. El test abría el
  // `<summary>` que existía cuando estaban plegadas — medía la implementación, no la regla.
  const notas = panel.getByTestId('bloque-notas')
  await notas.getByTestId('nota-texto').fill(`${M} el hierro llegó a media mañana`)
  await notas.getByTestId('form-nota').getByRole('button', { name: 'Agregar' }).click()
  await expect.poll(async () => {
    const { data } = await c.from('obra_actividad_control').select('n_notas').eq('actividad_id', actividadId).single()
    return (data as { n_notas: number } | null)?.n_notas
  }, { timeout: 20_000 }).toBe(1)
})

test('10-14 · una carga: producción, horas de la persona y horas del EQUIPO, cada una a su tabla', async ({ page }) => {
  const c = sb()
  const { data: a } = await c.from('obra_actividad').select('id').eq('obra_id', OBRA).eq('nombre', ACT).single()
  const actividadId = (a as { id: string }).id
  const { data: persona } = await c.from('personas').select('id').eq('en_la_empresa', true).limit(1).single()
  const personaId = (persona as { id: string }).id

  await entrar(page)
  await page.goto(`/obras/${OBRA}?vista=ejecucion`)
  // El parte YA NO SE ABRE: desde el Design Handoff V2 (20/08/2026) el formulario del día es la
  // columna izquierda de la solapa y está siempre a la vista, y el reparto de horas dejó de ser un
  // bloque plegado. Un parte diario que hay que desplegar es un parte diario que se carga dos
  // semanas. Por eso se fueron el clic en `abrir-registrar` y el clic en el `summary` de
  // `parte-personal`: no se borró funcionalidad, se dejó de esconder.
  const panel = page.getByTestId('panel-registrar')
  await panel.getByTestId('parte-actividad').selectOption(actividadId)
  await panel.getByTestId('parte-cantidad').fill('3')
  await panel.getByTestId('parte-comentario').fill(`${M} tres columnas`)
  await panel.getByTestId(`horas-${personaId}`).fill('8')
  await panel.getByTestId('parte-equipos').locator('summary').click()
  await panel.getByTestId('equipo-0').fill(`${M} Hormigonera`)
  await panel.getByTestId('equipo-horas-0').fill('4')
  await panel.getByTestId('form-ejecucion').getByRole('button', { name: 'Registrar parte' }).click()

  // ═══ CADA HECHO A SU FUENTE ═══
  //   3 un de producción   → obra_ejecucion       → avance CALCULADO 25% (3 de 12)
  //   8 h de una persona   → registros_hh         → HH de la actividad, de la obra y de la persona
  //   4 h de una máquina   → obra_ejecucion_equipo
  await expect.poll(async () => {
    const { data } = await c.from('obra_actividad_control')
      .select('cantidad_ejecutada, avance_pct, origen_avance, hh_real, n_equipos, productividad')
      .eq('actividad_id', actividadId).single()
    const d = data as Record<string, string | number | null> | null
    return d && {
      cantidad_ejecutada: Number(d.cantidad_ejecutada), avance_pct: Number(d.avance_pct),
      origen_avance: d.origen_avance, hh_real: Number(d.hh_real), n_equipos: d.n_equipos,
      productividad: Number(d.productividad),
    }
  }, { timeout: 25_000 }).toMatchObject({
    cantidad_ejecutada: 3, avance_pct: 25, origen_avance: 'cantidad', hh_real: 8, n_equipos: 1,
    // 3 unidades / 8 HH. Existe SÓLO con las dos puntas: con una sola sería una división por un dato
    // que falta, no un indicador bajo.
    productividad: 0.375,
  })

  // LAS HORAS DEL EQUIPO NO SE CUELAN EN LAS DE MANO DE OBRA. Si compartieran tabla, `hh_real` daría
  // 12 y el costo de mano de obra incluiría a la hormigonera.
  const { data: horas } = await c.from('registros_hh').select('horas, persona_id').eq('actividad_id', actividadId)
  expect(horas).toHaveLength(1)
  expect(Number((horas as { horas: number }[])[0].horas)).toBe(8)

  const { data: equipos } = await c.from('obra_ejecucion_equipo').select('equipo, horas').eq('obra_id', OBRA)
  expect(equipos).toHaveLength(1)
  expect((equipos as { equipo: string; horas: number | string }[])[0].equipo).toBe(`${M} Hormigonera`)
  expect(Number((equipos as { horas: number | string }[])[0].horas)).toBe(4)

  // ═══ Y EL PANEL LO MUESTRA: plan contra real, recursos y las columnas HH y Personas ═══
  await page.goto(`/obras/${OBRA}?vista=cronograma&sub=gantt&act=${actividadId}`)
  const lateral = page.getByTestId('panel-actividad')
  await expect(lateral).toBeVisible({ timeout: 25_000 })
  await expect(lateral.getByTestId('bloque-recursos')).toContainText(`${M} Hormigonera`)
  await expect(lateral.getByTestId('personal-real')).toBeVisible()
  const fila = lateral.getByTestId('fila-parte').first()
  await expect(fila).toContainText('8')
  await expect(fila).toContainText(`${M} tres columnas`)
})

test('15-17 · el papel se cuelga de la actividad, el filtro recorta y el rubro se renombra entero', async ({ page }) => {
  const c = sb()
  const { data: a } = await c.from('obra_actividad').select('id').eq('obra_id', OBRA).eq('nombre', ACT).single()
  const actividadId = (a as { id: string }).id

  await entrar(page)
  await page.goto(`/obras/${OBRA}?vista=cronograma&sub=gantt&act=${actividadId}`)
  const panel = page.getByTestId('panel-actividad')
  await expect(panel).toBeVisible({ timeout: 25_000 })

  // ═══ EL PAPEL — el archivo NO se copia: se guarda el vínculo ═══
  await panel.getByTestId('tab-panel-documentos').click()
  const docs = panel.getByTestId('bloque-documentos-actividad')
  if ((await docs.getAttribute('open')) === null) await docs.locator('summary').click()
  await docs.getByTestId('documento-enlace').fill(`https://drive.google.com/file/d/${M}-plano-columnas/view`)
  await docs.locator('input[name="nombre"]').fill(`${M} plano de columnas`)
  await docs.getByRole('button', { name: 'Vincular' }).click()
  await expect.poll(async () => {
    const { data } = await c.from('obra_documento').select('drive_file_id').eq('actividad_id', actividadId)
    return (data ?? []).length
  }, { timeout: 20_000 }).toBe(1)

  // ═══ EL FILTRO RECORTA LAS CUATRO VISTAS Y NO ROMPE LOS RUBROS ═══
  // Filtrar por estado se llevaba puestas las filas de RESUMEN, que son la cabecera del grupo: sin
  // ellas las hijas quedaban colgando de «Sin sección».
  await page.goto(`/obras/${OBRA}?vista=cronograma&sub=lista`)
  await expect(page.getByTestId('vista-lista')).toBeVisible({ timeout: 25_000 })
  await page.getByTestId('boton-filtros').click()
  await page.getByTestId('filtro-rubro').selectOption(RUBRO)
  await expect(page.getByTestId('aviso-filtro')).toBeVisible()
  await expect(page.getByTestId('vista-lista')).toContainText(ACT)
  await page.getByTestId('limpiar-filtros').click()

  // ═══ RENOMBRAR ARRASTRA A LAS HIJAS ═══
  // El vínculo entre una actividad y su rubro es TEXTO (`seccion`). Renombrar sólo la cabecera
  // dejaría al cronograma con dos grupos donde había uno.
  await page.getByTestId('nuevo-rubro').click()
  const fila = page.getByTestId('fila-rubro').filter({ hasText: RUBRO })
  await fila.getByTestId('renombrar-rubro').click()
  await fila.locator('input[name="nombre"]').fill(RUBRO2)
  await fila.getByRole('button', { name: 'Renombrar' }).click()

  await expect.poll(async () => {
    const { data } = await c.from('obra_actividad')
      .select('nombre, seccion, tipo').eq('obra_id', OBRA).ilike('nombre', `%${M}%`)
    const filas = (data ?? []) as { nombre: string; seccion: string | null; tipo: string }[]
    return {
      cabecera: filas.filter((f) => f.tipo === 'resumen' && f.nombre === RUBRO2).length,
      huerfanas: filas.filter((f) => f.tipo !== 'resumen' && f.seccion === RUBRO).length,
    }
  }, { timeout: 20_000 }).toMatchObject({ cabecera: 1, huerfanas: 0 })
})
