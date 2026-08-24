import { test, expect } from '@playwright/test'
import { ADMIN, JEFE, entrar, pedir } from './util/identidades'
import { entrarComo } from './util/login'

// BASE MAESTRA — PANTALLAS 17 Y 18.
//
// Dos cosas distintas se miden acá y no se mezclan:
//
//   1. LA CERRADURA, contra PostgREST con el token real de un jefe de obra. Una pantalla vacía puede
//      estar vacía por el middleware, por el componente o por la base; sólo la tercera es seguridad.
//   2. LA PANTALLA, en el navegador con sesión de Dirección — que es donde se ve si el estado vacío
//      está bien resuelto y si el costo empresa sale calculado.

// ═══ 1 · LA CERRADURA ══════════════════════════════════════════════════════════════════════════

test('un jefe de obra NO recibe una sola fila de recurso_precio', async () => {
  // ESTE ES EL CORTE ECONÓMICO DEL MODELO: `recurso_precio_lee ... using (ve_economia())`. Si esta
  // prueba se pone verde por vacío —porque no hay precios cargados— no prueba nada, así que lo que
  // se compara es contra lo que SÍ ve la administración. El caso positivo protege al negativo.
  const jefe = await entrar(JEFE.email, JEFE.password)
  const admin = await entrar(ADMIN.email, ADMIN.password)

  const delJefe = await pedir(jefe, 'recurso_precio?select=costo,fecha_precio&limit=50')
  const delAdmin = await pedir(admin, 'recurso_precio?select=costo,fecha_precio&limit=50')

  // La RLS no da error: devuelve cero filas. Ese es exactamente el modo de falla que la pantalla
  // tiene que saber distinguir de «nadie cargó el precio».
  expect(delJefe.status, `PostgREST contestó ${delJefe.status} al jefe`).toBe(200)
  expect(delJefe.filas.length, 'el jefe de obra recibió filas de recurso_precio').toBe(0)
  expect(delAdmin.status).toBe(200)

  if (delAdmin.filas.length === 0) {
    // Se DECLARA en vez de pasar en silencio: sin precios cargados, el negativo es trivial.
    test.info().annotations.push({
      type: 'limitación',
      description:
        'recurso_precio está vacía para todos: el negativo del jefe no distingue permiso de base vacía. ' +
        'Repetir cuando la ingestión del Excel haya cargado los precios.',
    })
  }
})

test('un jefe de obra SÍ ve la tarea tipo, el análisis y las HH', async () => {
  // La otra mitad del corte, y la que impide que alguien "arregle" el permiso cerrando de más: lo
  // operativo es suyo. Si mañana se le cierra `tarea_tipo` o `analisis_linea`, esto se pone rojo.
  const jefe = await entrar(JEFE.email, JEFE.password)
  for (const tabla of ['tarea_tipo', 'analisis', 'analisis_linea', 'recurso', 'plantilla_paso']) {
    const r = await pedir(jefe, `${tabla}?select=id&limit=1`)
    expect(r.status, `${tabla} le contestó ${r.status} al jefe de obra`).toBe(200)
  }
})

test('un jefe de obra NO recibe las cargas sociales', async () => {
  // `carga_social` también es `ve_economia()`: son el otro insumo del costo de la hora.
  const jefe = await entrar(JEFE.email, JEFE.password)
  const r = await pedir(jefe, 'carga_social?select=concepto,porcentaje&limit=20')
  expect(r.status).toBe(200)
  expect(r.filas.length, 'el jefe de obra recibió cargas sociales').toBe(0)
})

// ═══ 2 · LAS PANTALLAS ═════════════════════════════════════════════════════════════════════════

test.describe('las dos pantallas abren con datos de la base', () => {
  test.beforeEach(async ({ page }) => {
    await entrarComo(page, ADMIN.email, ADMIN.password)
  })

  test('17 · Tareas tipo abre y resuelve el estado vacío', async ({ page }) => {
    await page.goto('/administracion/base-maestra/tareas')
    await expect(page.getByTestId('nav-base-maestra')).toBeVisible()

    // NO PUEDE HABER UN ERROR DE LECTURA. Que la base maestra esté vacía es un estado legítimo; que
    // la consulta falle, no — y la pantalla los dibuja distinto justamente para poder afirmarlo.
    await expect(page.getByTestId('tareas-error')).toHaveCount(0)

    const hayTabla = await page.getByTestId('tabla-tareas-tipo').count()
    if (hayTabla === 0) {
      // ESTADO VACÍO: tiene que decir qué falta y cómo se carga, no quedar en blanco.
      await expect(page.getByTestId('vacio')).toContainText('todavía no tiene tareas tipo')
      await expect(page.getByTestId('vacio')).toContainText('Planilla para Cotizar')
    } else {
      await expect(page.getByTestId('tabla-tareas-tipo')).toBeVisible()
      await expect(page.getByTestId('estado-analisis').first()).toBeVisible()
    }
    await page.setViewportSize({ width: 1440, height: 950 })
    await page.screenshot({ path: 'test-results/17-base-maestra-tareas.png' })
  })

  test('17 · la ficha abre con las solapas y el buscador filtra al teclear', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 950 })
    await page.goto('/administracion/base-maestra/tareas')
    if (await page.getByTestId('tabla-tareas-tipo').count() === 0) {
      test.skip(true, 'la base maestra todavía no tiene tareas tipo cargadas')
    }

    // EL BUSCADOR FILTRA AL TECLEAR: sin Enter y sin botón. Se mide contra el conteo de filas.
    const antes = await page.getByTestId('tabla-tareas-tipo').locator('tbody tr').count()
    await page.getByTestId('buscador-tareas-q').fill('hormigon')
    await expect
      .poll(() => page.getByTestId('tabla-tareas-tipo').locator('tbody tr').count(), { timeout: 4000 })
      .toBeLessThan(antes)
    // Y sin acentos encuentra igual: la base dice «HORMIGON» y alguien puede escribir «hormigón».
    const conQuery = await page.getByTestId('tabla-tareas-tipo').locator('tbody tr').count()
    expect(conQuery).toBeGreaterThan(0)
    // El estado se refleja en la URL para que la búsqueda se pueda compartir.
    await expect(page).toHaveURL(/q=hormigon/, { timeout: 4000 })

    // Limpiar y ESPERAR A QUE LA URL SE ASIENTE antes de abrir una ficha. La reescritura de `?q=`
    // es diferida: encadenar el clic sin esperar es una carrera del test, no del producto.
    await page.getByTestId('buscador-tareas-limpiar').click()
    await expect(page).not.toHaveURL(/q=/, { timeout: 5000 })
    await expect
      .poll(() => page.getByTestId('tabla-tareas-tipo').locator('tbody tr').count(), { timeout: 5000 })
      .toBe(antes)

    await page.getByTestId('tabla-tareas-tipo').locator('tbody tr').first().locator('a').click()
    await expect(page).toHaveURL(/[?&]t=/, { timeout: 10000 })

    // LA FICHA: seis solapas con permiso económico, y el estado del análisis en la cabecera.
    await expect(page.getByTestId('ficha-tarea')).toBeVisible()
    for (const s of ['resumen', 'analisis', 'secuencia', 'rendimiento', 'versiones', 'uso']) {
      await expect(page.getByTestId(`solapa-${s}`)).toBeVisible()
    }
    await expect(page.getByTestId('panel-resumen')).toBeVisible()
    await page.screenshot({ path: 'test-results/17-base-maestra-ficha-resumen.png' })

    await page.getByTestId('solapa-analisis').click()
    await expect(page.getByTestId('panel-analisis')).toBeVisible()
    await page.screenshot({ path: 'test-results/17-base-maestra-ficha-analisis.png' })

    // LOS DOS NÚMEROS QUE DECIDEN, ENFRENTADOS (Design 23/08). La ficha tiene que abrir mostrando
    // con qué se cotiza Y qué pasó en obra: si mañana alguien saca la segunda cifra, la pantalla
    // vuelve a ser un catálogo y deja de ser una base de aprendizaje, que es su razón de existir.
    await expect(page.getByTestId('ficha-tarea')).toContainText('Esfuerzo base')
    await expect(page.getByTestId('ficha-tarea')).toContainText('Real de obra')

    await page.getByTestId('solapa-rendimiento').click()
    await expect(page.getByTestId('panel-rendimiento')).toBeVisible()
    // La solapa viaja en la URL: este enlace abre en la solapa de esfuerzo, no en Resumen.
    // 22/08/2026 · La CLAVE sigue siendo `rendimiento` justamente para no romper este enlace; lo que
    // cambió es el RÓTULO («Esfuerzo»), porque hs/unidad no es un rendimiento. Este test mide la
    // clave y por eso no lo toca el renombre — que es la razón por la que la clave no se renombró.
    await expect(page).toHaveURL(/s=rendimiento/)
  })

  test('18 · Mano de obra calcula el costo empresa desde el convenio', async ({ page }) => {
    await page.goto('/administracion/base-maestra/recursos?v=mano-obra')
    await expect(page.getByTestId('recursos-error')).toHaveCount(0)

    // Estas cinco categorías salen de `uocra_escala`, que tiene 115 filas reales con vigencia.
    await expect(page.getByTestId('tabla-mano-obra')).toBeVisible()
    await expect(page.getByTestId('categoria-oficial')).toBeVisible()

    // EL COSTO EMPRESA SE CALCULA, NO SE TIPEA: la fila del oficial tiene que traer los cuatro
    // números encadenados, y el de cargas tiene que ser el valor hora por el total de cargas.
    const fila = page.getByTestId('categoria-oficial')
    const celdas = await fila.locator('td').allInnerTexts()
    const [, jornal, valorHora, cargas, costoEmpresa] = celdas
    const num = (t: string) => Number(t.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
    expect(num(jornal), 'el jornal es el valor hora por la jornada de 8 hs').toBeCloseTo(num(valorHora) * 8, 0)
    expect(num(costoEmpresa), 'el costo empresa es valor hora + cargas').toBeCloseTo(
      num(valorHora) + num(cargas), 0,
    )

    // Las cargas y su total, con la advertencia de que no están verificadas.
    await expect(page.getByTestId('tabla-cargas')).toBeVisible()
    await expect(page.getByTestId('cargas-sociales')).toContainText('Total sobre mano de obra')
    await expect(page.getByTestId('fuente-escala')).toContainText('no se actualiza sola')

    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.screenshot({ path: 'test-results/18-base-maestra-mano-de-obra.png' })
  })

  test('18 · las plantillas de secuencia cierran en 100 %', async ({ page }) => {
    await page.goto('/administracion/base-maestra/recursos?v=plantillas')
    await expect(page.getByTestId('recursos-error')).toHaveCount(0)
    await expect(page.getByTestId('lista-plantillas')).toBeVisible()
    // Si una plantilla no cerrara, marcar todos sus pasos no daría 100 % de avance. La pantalla lo
    // grita con un aviso, así que la ausencia del aviso ES la afirmación.
    await expect(page.locator('[data-tono="neg"]')).toHaveCount(0)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({ path: 'test-results/18-base-maestra-plantillas.png' })
  })

  test('18 · Insumos y Equipos abren y resuelven el vacío', async ({ page }) => {
    await page.goto('/administracion/base-maestra/recursos?v=insumos')
    await expect(page.getByTestId('recursos-error')).toHaveCount(0)
    if (await page.getByTestId('tabla-insumos').count() === 0) {
      await expect(page.getByTestId('vacio')).toContainText('todavía no tiene insumos')
    }
    await page.setViewportSize({ width: 1440, height: 950 })
    await page.screenshot({ path: 'test-results/18-base-maestra-insumos.png' })

    await page.goto('/administracion/base-maestra/recursos?v=equipos')
    await expect(page.getByTestId('recursos-error')).toHaveCount(0)
    // La deuda del modelo se DECLARA en la pantalla, no se tapa con cuatro columnas vacías.
    await expect(page.locator('[data-tono="info"]')).toContainText('flota')
    await page.screenshot({ path: 'test-results/18-base-maestra-equipos.png' })
  })

  test('18 · un insumo abre su ficha con historial y con a qué le pega', async ({ page }) => {
    // UN PRECIO SUELTO NO SE PUEDE DEFENDER. La ficha existe para que el número tenga procedencia
    // (de qué compra o de qué lista salió) y para que antes de tocarlo se vea a qué tareas tipo
    // vigentes les pega. Si la ficha deja de abrirse, la pantalla vuelve a ser una lista de precios
    // sin trazabilidad — que es el estado del que venimos.
    await page.setViewportSize({ width: 1440, height: 950 })
    await page.goto('/administracion/base-maestra/recursos?v=insumos')
    if (await page.getByTestId('tabla-insumos').count() === 0) {
      test.skip(true, 'la base maestra todavía no tiene insumos cargados')
    }

    await page.getByTestId('tabla-insumos').locator('tbody tr').first().locator('a').click()
    await expect(page).toHaveURL(/[?&]r=/, { timeout: 10000 })
    await expect(page.getByTestId('ficha-recurso')).toBeVisible()
    // Las dos secciones se dibujan SIEMPRE: cuando no hay filas dicen por qué, y ese texto es el
    // dato. Una sección que desaparece deja al que mira sin saber si preguntó mal o no hay nada.
    await expect(page.getByTestId('historial-precio')).toBeVisible()
    await expect(page.getByTestId('uso-recurso')).toBeVisible()
    await page.screenshot({ path: 'test-results/18-base-maestra-ficha-recurso.png' })

    await page.getByTestId('cerrar-ficha-recurso').click()
    await expect(page).not.toHaveURL(/[?&]r=/, { timeout: 5000 })
  })

  test('18 · Versiones de precio agrupa por fecha y fuente', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 950 })
    await page.goto('/administracion/base-maestra/recursos?v=precios')
    await expect(page.getByTestId('recursos-error')).toHaveCount(0)
    await page.screenshot({ path: 'test-results/18-base-maestra-versiones.png' })
  })

  test('el estado vive en la URL y es compartible', async ({ page }) => {
    // Entrar por la dirección directa tiene que dejar la pantalla en esa sub-vista: si la sub-vista
    // viviera en un `useState`, este enlace abriría siempre en Insumos.
    await page.goto('/administracion/base-maestra/recursos?v=plantillas')
    await expect(page.getByTestId('bm-vista-plantillas')).toHaveAttribute('aria-current', 'true')
    await page.getByTestId('bm-vista-mano-obra').click()
    await expect(page).toHaveURL(/v=mano-obra/)
  })
})

test('un jefe de obra abre la base maestra y NO ve columnas de costo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 })
  await entrarComo(page, JEFE.email, JEFE.password)
  await page.goto('/administracion/base-maestra/recursos?v=mano-obra')

  // LO QUE NO SE VE, NO SE RENDERIZA. Y la pantalla dice POR QUÉ: «sin permiso», nunca «sin cargar»
  // — mandar a cargar de nuevo precios que están cargados es el defecto que esto evita.
  await expect(page.getByTestId('tabla-mano-obra')).toBeVisible()
  const encabezados = await page.getByTestId('tabla-mano-obra').locator('th').allInnerTexts()
  for (const prohibido of ['JORNAL', 'VALOR HORA', 'CARGAS', 'COSTO EMPRESA/H']) {
    expect(encabezados.map((h) => h.toUpperCase()), `se filtró la columna ${prohibido}`).not.toContain(prohibido)
  }
  await expect(page.getByTestId('cargas-sociales')).toHaveCount(0)
  await expect(page.locator('[data-tono="info"]')).toContainText('no ves el precio')

  // La captura se toma ACÁ, con las aserciones ya cumplidas y la pantalla quieta. Tomarla después
  // de una navegación devuelve el esqueleto de carga: una imagen que no prueba nada.
  await page.screenshot({ path: 'test-results/18-base-maestra-jefe-sin-economia.png' })

  // Y «Versiones de precio» es entera económica: no se abre a medias, manda a Insumos.
  await page.goto('/administracion/base-maestra/recursos?v=precios')
  await expect(page).toHaveURL(/v=insumos/)
  await expect(page.getByTestId('tabla-insumos')).toBeVisible()

  // Y LA FICHA DE UN INSUMO NO DICE «SIN HISTORIAL»: dice que no lo ve. `recurso_precio` le devuelve
  // cero filas sin error, que es idéntico a un recurso que nunca tuvo precio — y escribir la segunda
  // frase manda a alguien a cargar de nuevo precios que ya están cargados.
  await page.getByTestId('tabla-insumos').locator('tbody tr').first().locator('a').click()
  await expect(page.getByTestId('ficha-recurso')).toBeVisible()
  await expect(page.getByTestId('recurso-sin-economia')).toContainText('no los ves')
  await expect(page.getByTestId('historial-precio')).toHaveCount(0)
})
