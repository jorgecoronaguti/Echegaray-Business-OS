import { test, expect } from '@playwright/test'
import {
  abrir, abrirSinError, conBase, entrar, laFila, limpiar, marcaDe, recargar, salir, OBRA,
} from './util/obras-e2e'

// ═══ CADA RECORRIDO CON SU MARCA (24/08/2026) ═══
//
// Los seis tests de este archivo corren EN PARALELO sobre `le-comedor` y cada uno arranca con
// `limpiar()`. Mientras la marca fue una sola, el barrido de arranque de uno borraba lo que otro
// acababa de crear: la actividad desaparecía del Gantt y la asignación de Personal, y los dos rojos
// decían «esto no persiste» sobre escrituras que habían persistido perfectamente. La marca propia
// —`ZZ-E2E-crono`, `ZZ-E2E-personal`…— deja cada barrido dentro de su recorrido. Ver `marcaDe`.

// MVP ERP DE OBRAS · LA EJECUCIÓN: cronograma, personal, economía y planificación.
//
// Mismo contrato que el recorrido del cliente: se carga por la pantalla, SE RECARGA, se exige el
// dato, y se borra al final.
//
// ═══ POR QUÉ ESCRIBE SOBRE UNA OBRA REAL ═══
//
// Porque todavía no puede crear una de prueba: `obra_canonica` tiene su policy de escritura pero
// nunca se le dio el grant de insert a `authenticated` (ver `obras-cliente-y-obra.spec.ts` y la
// migración 20260818230000_obra_canonica_grant_escritura.sql). Hasta que eso se aplique, las
// actividades, asignaciones, certificados e impedimentos se prueban sobre `le-comedor`, creando y
// borrando filas propias marcadas con MARCA — que es lo que limpia `limpiar()` antes y después.

// ── CRONOGRAMA: CREAR, EDITAR, AVANZAR Y ARCHIVAR UNA ACTIVIDAD ─────────────

test('cronograma: la actividad creada desde el Gantt se edita, recibe avance y se archiva — y persiste', async ({ page }) => {
  // 420 s Y NO 180. Dos motivos, los dos del reloj y ninguno de la pantalla: el recorrido pasa ahora
  // también por `/obras/<obra>/cronograma` —otra ruta, que `next dev` compila la primera vez que
  // alguien la pide— y cada navegación puede consumir un reintento de `abrir` cuando la base corta
  // la consulta bajo la carga de la suite. Medido el 24/08: 240 s se agotaban a mitad de camino.
  test.setTimeout(420000)
  const sb = await conBase()
  const MARCA = marcaDe('crono')
  await limpiar(sb, MARCA)
  const nombre = `${MARCA} Actividad ${Date.now()}`

  try {
    await entrar(page)
    await abrir(page, `/obras/${OBRA}?vista=cronograma`, 'gantt')

    // ── ALTA ────────────────────────────────────────────────────────────────
    await page.getByTestId('nueva-actividad').click()
    const alta = page.getByTestId('form-nueva-actividad')
    await alta.locator('input[name="nombre"]').fill(nombre)
    await alta.locator('input[name="seccion"]').fill(MARCA)
    await alta.locator('input[name="inicio_plan"]').fill('2026-08-20')
    await alta.locator('input[name="fin_plan"]').fill('2026-08-27')
    await page.getByTestId('form-nueva-actividad-enviar').click()
    await expect(page.getByTestId('form-nueva-actividad-ok')).toBeVisible({ timeout: 30000 })

    await recargar(page, 'gantt')
    const enGantt = page.getByTestId('gantt').getByRole('button', { name: new RegExp(nombre) })
    await expect(enGantt).toBeVisible()

    // ── EL PANEL CONTEXTUAL: SE SELECCIONA LA BARRA Y APARECE AL COSTADO ────
    await enGantt.click()
    const panel = page.getByTestId('panel-actividad')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText(nombre)
    // ═══ LA LÍNEA BASE SE SIGUE DICIENDO, PERO YA NO ACÁ (24/08/2026) ═══
    //
    // Este renglón exigía «sin sellar» DENTRO del panel. El panel dejó de escribirlo el 20/08
    // (39cb55bc, cuando pasó de pestañas a secciones plegables) y el rediseño canónico no lo
    // devolvió: hoy enfrenta Plan | Real y no nombra contra qué se prometió el plan.
    //
    // La regla NO se afloja ni se borra: se afirma donde el producto sí la dice por actividad y con
    // palabras —la columna Desvío del Cronograma calculado (pantalla 07)—, y se exige el texto que
    // le corresponde a una actividad recién creada. Está más abajo, cuando ya se conoce su id.

    // ── EDICIÓN ─────────────────────────────────────────────────────────────
    // EDITAR SE ABRE DESDE EL PIE DEL PANEL, que es donde el objetivo pone «Editar actividad».
    await panel.getByTestId('pie-editar-actividad').click()
    const editar = page.getByTestId('form-editar-actividad')
    await editar.locator('input[name="hh_plan"]').fill('40')
    await editar.locator('input[name="cuadrilla"]').fill(`${MARCA} cuadrilla`)
    await editar.locator('select[name="responsable_id"]').selectOption({ index: 1 })
    await page.getByTestId('form-editar-actividad-enviar').click()
    await expect(page.getByTestId('form-editar-actividad-ok')).toBeVisible({ timeout: 30000 })

    const { data: guardadaRaw } = await sb.from('obra_actividad')
      .select('id, hh_plan, cuadrilla, responsable_id, editado_a_mano')
      .eq('obra_id', OBRA).eq('nombre', nombre).single()
    const guardada = laFila(guardadaRaw, 'la actividad recién creada')
    expect(Number(guardada.hh_plan)).toBe(40)
    expect(guardada.cuadrilla).toBe(`${MARCA} cuadrilla`)
    expect(guardada.responsable_id, 'el responsable sale de `personas`, no de un texto libre').toBeTruthy()
    // LO QUE TOCÓ UNA PERSONA LE GANA AL TRACKER: sin esta marca, el sincronizador de Drive lo pisa.
    expect(guardada.editado_a_mano).toBe(true)

    // ── LA LÍNEA BASE SE DICE SIEMPRE ───────────────────────────────────────
    //
    // Esta actividad nació hace diez segundos y NO tiene línea base: `inicio_base`/`fin_base` los
    // escribe únicamente el sellado (ver `FormActividad.tsx` y `actionsMasivas.ts`). O sea que no es
    // un estado del mundo que alguien pueda cambiar por debajo: es una consecuencia del alta.
    //
    // Lo que se vigila es que el producto lo DIGA con esa palabra. «sin base» ≠ «en fecha»: decir
    // «en fecha» sería afirmar que se cumplió una promesa que nadie hizo, y esa es la manera exacta
    // en que una obra sin línea base se lee como una obra perfectamente cumplida.
    //
    // La fila se busca por el `sel=<id>` de su enlace y no por su texto: el nombre también aparece
    // en el `aria-label` de la barra del lienzo, y anclar al texto haría que el test eligiera una de
    // las dos por azar del DOM.
    await abrir(page, `/obras/${OBRA}/cronograma`, 'cronograma')
    const renglonCrono = page.locator('div')
      .filter({ has: page.locator(`a[href*="sel=${guardada.id}"]`) }).last()
    await expect(renglonCrono.getByTestId('desvio-fila'),
      'el cronograma dejó de decir la línea base de una actividad sin sellar')
      .toHaveText('sin base')

    // Y la HH plan cargada aparece en Personal, que es donde se mide contra las horas reales.
    //
    // Se apunta al TITULAR y no a un `getByText('HH plan')` suelto: desde que Personal muestra el
    // plan contra real por actividad, ese texto está también en el encabezado de una columna y el
    // localizador resolvía a dos elementos. Un test ambiguo no falla por un defecto: falla por
    // haberse quedado corto, y manda a buscar el problema al lugar equivocado.
    //
    // VA DENTRO DE UN REINTENTO porque lo que se exige es un EFECTO recién escrito: si la lectura
    // de HH de la solapa se corta, el titular dice «HH plan sin cargar» —correcto para lo que pudo
    // leer, falso sobre la actividad— y una sola mirada lo tomaría por el defecto. Se vuelve a
    // pedir la pantalla hasta que la lectura llegue entera.
    await expect(async () => {
      await abrir(page, `/obras/${OBRA}?vista=personal`, 'titular-personal')
      await expect(page.getByTestId('titular-personal')).toContainText(/HH plan \d/, { timeout: 5000 })
    }).toPass({ timeout: 120000 })

    // ── AVANCE RÁPIDO ───────────────────────────────────────────────────────
    //
    // EL AVANCE RÁPIDO TAMBIÉN SE ABRE DESDE EL PIE, igual que la edición. El panel muestra arriba
    // lo que se MIRA y guarda detrás de un gesto lo que se ESCRIBE: los cinco botones de porcentaje
    // sueltos al lado del plan eran cinco maneras de cambiar el avance de una obra sin querer.
    //
    // Este renglón clicaba `avance-50` directo y esperaba para siempre a un control que sólo existe
    // después de apretar «Registrar avance» — y el rojo era un «tiempo agotado» sin locator, que no
    // señala a ningún lado. Estuvo tapado hasta hoy porque el test moría antes, en «sin sellar».
    await abrir(page, `/obras/${OBRA}?vista=cronograma`, 'gantt')
    await page.getByTestId('gantt').getByRole('button', { name: new RegExp(nombre) }).click()
    await page.getByTestId('pie-registrar-avance').click()
    await page.getByTestId('avance-50').click()
    await expect(async () => {
      const { data } = await sb.from('obra_actividad').select('pct').eq('id', guardada.id).single()
      expect(Number(laFila(data, 'el avance registrado').pct)).toBe(50)
    }).toPass({ timeout: 30000 })

    await recargar(page, 'gantt')
    await page.getByTestId('gantt').getByRole('button', { name: new RegExp(nombre) }).click()
    // Y el 50 SOBREVIVIÓ A LA RECARGA: se vuelve a abrir el avance rápido y el campo trae el valor
    // guardado, no el vacío con el que nace el formulario.
    await page.getByTestId('pie-registrar-avance').click()
    await expect(page.getByTestId('avance-valor')).toHaveValue('50')

    // ── ARCHIVAR NO ES BORRAR ───────────────────────────────────────────────
    // ARCHIVAR VIVE DENTRO DE «Editar la actividad» desde el 20/08, y hay que abrirlo. No es un
    // rodeo del test: archivar cambia la DEFINICIÓN de la actividad, no su avance del día, y
    // dejarlo suelto en el panel ponía un botón destructivo al lado del que se aprieta todos los
    // días. El panel muestra arriba lo que se mira y esconde lo que se decide.
    await page.getByTestId('pie-editar-actividad').click()
    await page.getByTestId('archivar-actividad').click()
    await expect(async () => {
      const { data } = await sb.from('obra_actividad').select('archivada, pct').eq('id', guardada.id).single()
      const act = laFila(data, 'la actividad archivada')
      expect(act.archivada).toBe(true)
      // El avance sobrevive al archivado: por eso se archiva en vez de borrar.
      expect(Number(act.pct)).toBe(50)
    }).toPass({ timeout: 30000 })

    await recargar(page, 'gantt')
    await expect(page.getByTestId('gantt').getByRole('button', { name: new RegExp(nombre) })).toHaveCount(0)
    const archivadas = page.getByTestId('actividades-archivadas')
    await expect(archivadas).toContainText(nombre)

    await archivadas.locator('summary').click()
    await archivadas.locator('li', { hasText: nombre }).getByTestId('restaurar-actividad').click()
    await expect(async () => {
      const { data } = await sb.from('obra_actividad').select('archivada').eq('id', guardada.id).single()
      expect(laFila(data, 'la actividad restaurada').archivada).toBe(false)
    }).toPass({ timeout: 30000 })
  } finally {
    await limpiar(sb, MARCA)
    await salir(sb)
  }
})

// ── PERSONAL: ASIGNAR Y QUITAR GENTE DE LA OBRA ─────────────────────────────

test('personal: la persona asignada sigue asignada después de recargar, y se puede sacar', async ({ page }) => {
  test.setTimeout(180000)
  const sb = await conBase()
  const MARCA = marcaDe('personal')
  await limpiar(sb, MARCA)

  try {
    await entrar(page)
    await abrir(page, `/obras/${OBRA}?vista=personal`, 'titular-personal')

    // LAS DOS PUNTAS DE LAS HH, Y EL DESVÍO SÓLO CUANDO ESTÁN LAS DOS. Ningún registro de horas
    // apunta todavía al eje canónico: eso se dice, no se publica como cero.
    // El rótulo pasó de "nadie imputó horas a esta obra" a "sin imputar" cuando la franja del titular
  // reemplazó a las cuatro tarjetas. Sigue diciendo lo mismo —que no es cero, es desconocido— en el
  // lugar donde ahora vive.
  await expect(page.getByTestId('titular-personal')).toContainText(/sin imputar/i)

    await page.getByTestId('alta-asignacion').locator('summary').click()
    const form = page.getByTestId('form-asignar')
    const select = form.locator('select[name="persona_id"]')
    const persona = ((await select.locator('option').nth(1).textContent()) ?? '').trim()
    expect(persona, 'el legajo tiene que tener a alguien para asignar').toBeTruthy()
    await select.selectOption({ index: 1 })
    await form.locator('select[name="rol"]').selectOption('responsable')
    // La cuadrilla dejó de ser texto libre: es una entidad. El selector puede estar vacío —todavía
    // no hay ninguna cargada— y eso NO impide asignar: la cuadrilla es opcional.
    await form.locator('input[name="notas"]').fill(MARCA)
    await page.getByTestId('form-asignar-enviar').click()
    await expect(page.getByTestId('form-asignar-ok')).toBeVisible({ timeout: 30000 })

    await recargar(page, 'tabla-personal')
    const fila = page.getByTestId('tabla-personal').locator('tr', { hasText: persona })
    await expect(fila).toBeVisible()
    await expect(fila).toContainText('responsable')

    // Y no se puede asignar dos veces a lo mismo: el índice único lo impide y el error se MUESTRA
    // traducido, en vez de tragarse un "duplicate key value violates unique constraint".
    await page.getByTestId('alta-asignacion').locator('summary').click()
    await page.getByTestId('form-asignar').locator('select[name="persona_id"]').selectOption({ index: 1 })
    await page.getByTestId('form-asignar').locator('input[name="notas"]').fill(MARCA)
    await page.getByTestId('form-asignar-enviar').click()
    await expect(page.getByTestId('form-asignar-error')).toContainText(/ya está asignada/i, { timeout: 30000 })

    // ═══ CERRAR CONSERVA EL HISTORIAL; QUITAR BORRA ═══
    //
    // El pliego del módulo PERSONAL lo pide con esas palabras: *"cerrar asignación conserva
    // historial"*. Cerrar escribe `hasta`, y la fila sigue existiendo — es lo que respalda las horas
    // que esa persona imputó mientras estuvo en la obra. Quitar es para el alta hecha por error, y
    // por eso sólo aparece DESPUÉS de cerrar.
    await recargar(page, 'tabla-personal')
    await page.getByTestId('tabla-personal').locator('tr', { hasText: persona })
      .getByTestId('cerrar-asignacion').click()
    // 60 s Y NO 30: la que se corta bajo la carga de la suite no es sólo la pantalla, también esta
    // lectura directa a Postgres — y cuando se corta, `single()` devuelve `data: null`, que este
    // test leía como «cerrar no escribió la fecha de fin». Un rojo que acusa al producto de un
    // defecto que no tiene es peor que no tener el test.
    await expect(async () => {
      const { data, error } = await sb.from('obra_asignacion')
        .select('hasta').eq('obra_id', OBRA).ilike('notas', `%${MARCA}%`).single()
      expect(error?.message, 'la lectura de control no llegó a la base').toBeUndefined()
      expect((data as { hasta: string | null } | null)?.hasta, 'cerrar no escribió la fecha de fin')
        .toBeTruthy()
    }).toPass({ timeout: 60000 })

    await recargar(page, 'tabla-personal')
    await page.getByTestId('tabla-personal').locator('tr', { hasText: persona })
      .getByTestId('quitar-asignacion').click()
    await expect(async () => {
      const { count, error } = await sb.from('obra_asignacion')
        .select('id', { count: 'exact', head: true }).eq('obra_id', OBRA).ilike('notas', `%${MARCA}%`)
      expect(error?.message, 'la lectura de control no llegó a la base').toBeUndefined()
      expect(count).toBe(0)
    }).toPass({ timeout: 60000 })
    // Ya no hay tabla: el ancla de la recarga pasa a ser el titular, que la solapa dibuja siempre.
    await recargar(page, 'titular-personal')
    await expect(page.getByTestId('tabla-personal')).toHaveCount(0)
  } finally {
    await limpiar(sb, MARCA)
    await salir(sb)
  }
})

// ── ECONOMÍA Y COBRANZA: EL CERTIFICADO ─────────────────────────────────────

test('economía: el certificado cargado persiste, suma en los totales y cada número dice de dónde sale', async ({ page }) => {
  test.setTimeout(180000)
  const sb = await conBase()
  const MARCA = marcaDe('econo')
  await limpiar(sb, MARCA)
  const numero = `${MARCA}-${Date.now()}`

  try {
    await entrar(page)
    await abrir(page, `/obras/${OBRA}?vista=economia`, 'economia-costo')

    // LO QUE FALTA SE DICE CON PALABRAS. Esta obra no tiene presupuesto: publicar un 0% de desvío
    // significaría «vamos en presupuesto», que es exactamente lo contrario de la verdad.
    //
    // El texto de hoy, literal: *«Sin presupuesto: no hay contra qué medir el gasto.»* La primera
    // línea vigila que la ausencia se NOMBRE; la segunda, que además diga QUÉ se pierde por no
    // tenerlo. Las dos juntas son lo que impide que un rediseño deje el renglón con un guión mudo.
    await expect(page.getByTestId('economia-costo')).toContainText(/sin presupuesto|falta el presupuesto/i)
    await expect(page.getByTestId('economia-costo')).toContainText(/no hay contra qué medir|falta el costo objetivo/i)

    await page.getByTestId('alta-certificado').locator('summary').click()
    const form = page.getByTestId('form-certificado')
    await form.locator('input[name="numero"]').fill(numero)
    await form.locator('input[name="fecha_certificacion"]').fill('2026-08-15')
    await form.locator('input[name="monto_certificado"]').fill('1500000')
    await form.locator('input[name="descripcion"]').fill(`${MARCA} certificado de prueba`)

    // LA ETAPA VA COMPLETA O NO VA: un monto facturado sin su fecha no se puede ubicar en el flujo
    // de fondos. La base lo rechaza con un mensaje de constraint que nadie entiende; se avisa antes.
    await form.locator('input[name="monto_facturado"]').fill('1500000')
    await page.getByTestId('form-certificado-enviar').click()
    await expect(page.getByTestId('form-certificado-error')).toContainText(/facturación va completa/i, { timeout: 30000 })

    await form.locator('input[name="fecha_facturacion"]').fill('2026-08-16')
    await page.getByTestId('form-certificado-enviar').click()
    await expect(page.getByTestId('form-certificado-ok')).toBeVisible({ timeout: 30000 })

    await recargar(page, 'tabla-certificados')
    const fila = page.getByTestId('tabla-certificados').locator('tr', { hasText: numero })
    await expect(fila).toBeVisible()
    await expect(fila).toContainText('sin cobrar')
    // El total sale de la vista `obra_plan_vs_real`, no de una suma hecha en la pantalla.
    await expect(page.getByTestId('economia-certificacion')).toContainText('$1.500.000')

    await fila.getByTestId('borrar-certificado').click()
    await expect(async () => {
      const { count } = await sb.from('certificados')
        .select('id', { count: 'exact', head: true }).eq('numero', numero)
      expect(count).toBe(0)
    }).toPass({ timeout: 30000 })
    // Sin certificados no hay tabla: el ancla de la recarga es el bloque de Costo, que está siempre.
    await recargar(page, 'economia-costo')
    await expect(page.getByTestId('tabla-certificados')).toHaveCount(0)
  } finally {
    await limpiar(sb, MARCA)
    await salir(sb)
  }
})

// ── PLANIFICACIÓN: IMPEDIMENTOS ─────────────────────────────────────────────

// EL IMPEDIMENTO SE MUDÓ A OPERACIÓN (20/08/2026). El dueño puso los cinco bloques de la ejecución
// diaria en esa solapa —pedidos, compras, herramientas, movimientos, impedimentos— y ahí quedó la
// ÚNICA puerta de escritura. En Próximos trabajos quedó la lectura de los que frenan la ventana.
// El recorrido no cambió: lo que cambió es dónde vive el formulario.
test('operación: el impedimento se anota con dueño y fecha, persiste, y se libera', async ({ page }) => {
  test.setTimeout(180000)
  const sb = await conBase()
  const MARCA = marcaDe('imped')
  await limpiar(sb, MARCA)
  const texto = `${MARCA} falta el plano de detalle`

  try {
    await entrar(page)
    // SIN JERGA EN LA PANTALLA: adentro se llama restricción; afuera se lee «impedimento». El
    // encabezado que se exigía acá era el de «Próximos trabajos», que sigue existiendo pero en
    // Cronograma: el alta se mudó a Operación y el ancla tenía que mudarse con ella.
    await abrir(page, `/obras/${OBRA}?vista=operacion&sub=impedimentos`, 'bloque-impedimentos')

    await page.getByTestId('alta-impedimento').locator('summary').click()
    const form = page.getByTestId('form-impedimento')
    await form.locator('input[name="descripcion"]').fill(texto)
    await form.locator('select[name="tipo"]').selectOption('informacion')
    await form.locator('input[name="responsable"]').fill(`${MARCA} responsable`)
    await form.locator('input[name="fecha_compromiso"]').fill('2026-09-01')
    await page.getByTestId('form-impedimento-enviar').click()
    await expect(page.getByTestId('form-impedimento-ok')).toBeVisible({ timeout: 30000 })

    await recargar(page, 'tabla-impedimentos')
    const fila = page.getByTestId('tabla-impedimentos').locator('tr', { hasText: texto })
    await expect(fila).toBeVisible()
    await expect(fila).toContainText(`${MARCA} responsable`)

    await fila.getByTestId('liberar-impedimento').click()
    await expect(async () => {
      const { data } = await sb.from('obra_restriccion').select('estado, fecha_liberacion')
        .eq('obra_id', OBRA).ilike('descripcion', `%${MARCA}%`).single()
      const imp = laFila(data, 'el impedimento liberado')
      expect(imp.estado).toBe('liberada')
      expect(imp.fecha_liberacion).toBeTruthy()
    }).toPass({ timeout: 30000 })
    // LIBERAR NO BORRA: la fila baja y se lee «liberado». Es la historia de la obra, y sin esta
    // línea un «liberar» que borrara la fila pasaría el test igual.
    await recargar(page, 'tabla-impedimentos')
    await expect(page.getByTestId('tabla-impedimentos').locator('tr', { hasText: texto })).toContainText('liberado')
  } finally {
    await limpiar(sb, MARCA)
    await salir(sb)
  }
})

// ── PLAN CONTRA REAL: LA ALERTA DICE DE DÓNDE SALE Y LLEVA AL DATO ──────────

test('el resumen publica los desvíos con su origen, y cada uno lleva a la solapa del dato', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  await abrir(page, `/obras/${OBRA}`, 'lecturas-del-plan')

  // ═══ LAS LECTURAS SE PLEGARON, NO SE FUERON (24/08/2026) ═══
  //
  // El Resumen canónico pone arriba lo que hay que ir a resolver y guarda la lista completa detrás
  // de «Lecturas del plan, una por una». Este test buscaba `plan-vs-real` suelto en la página y no
  // lo encontraba: no porque el bloque hubiera desaparecido, sino porque nace cerrado.
  //
  // Se abre y se exige EXACTAMENTE lo mismo que antes. Que esté plegado no cambia la regla: cada
  // desvío nombra su origen y se puede tocar para llegar al dato.
  await page.getByTestId('lecturas-del-plan').locator('summary').click()
  const bloque = page.getByTestId('plan-vs-real')
  await expect(bloque).toBeVisible()
  // Cinco comparaciones: plazo, avance, HH, costo y margen (más atrasos, si los hay).
  expect(await bloque.locator('li').count()).toBeGreaterThanOrEqual(5)

  // NINGÚN SEMÁFORO SIN EXPLICACIÓN: la línea de PLAZO existe siempre y nombra la línea base —sea
  // para compararse contra ella, sea para decir que nadie la selló—.
  //
  // ═══ POR QUÉ NO SE EXIGE UNA DE LAS DOS RAMAS ACÁ (19/08/2026) ═══
  //
  // Este test exigía leer *"la línea base no está sellada"*. El 19/08 se sellaron las líneas base de
  // las ocho obras y el test se puso rojo sin que cambiara una línea de código: estaba afirmando un
  // ESTADO DE LOS DATOS, no una regla del sistema. Las dos ramas se prueban con datos armados en
  // `services/planVsReal.test.ts`, que corre siempre y no depende de lo que haya en la base hoy.
  await expect(bloque).toContainText(/línea base/i)
  await expect(bloque).toContainText(/no tiene presupuesto cargado/i)

  // ═══ EL ORIGEN TÉCNICO EXISTE, PERO NO A LA VISTA (19/08/2026) ═══
  //
  // Este test exigía leer `obra_actividad` EN PANTALLA. El dueño lo prohibió —*"nada de
  // explicaciones técnicas permanentes"*— y la cadena se mudó al `title` del renglón: sigue
  // disponible para auditar de dónde sale el semáforo, y deja de competir con la cifra.
  // Se comprueban las dos mitades: que esté en el `title` y que NO esté impresa.
  const conOrigen = bloque.locator('[title*="obra_actividad"]')
  expect(await conOrigen.count(), 'se perdió el origen del desvío de plazo').toBeGreaterThan(0)
  expect(await bloque.innerText(), 'el nombre de la tabla volvió a la pantalla').not.toContain('obra_actividad')

  // Y se puede TOCAR para ir al dato: una alerta que no se puede rastrear se deja de mirar.
  await bloque.getByRole('link').filter({ hasText: /presupuesto/i }).first().click()
  await page.waitForURL(/vista=economia/)
  // Economía pasó de tres tablas de tres columnas a los cuatro bloques del MVP.
  await expect(page.getByRole('heading', { name: 'Costo', exact: true })).toBeVisible()
})

// ── EL RESUMEN DE OBRAS, TRANSVERSAL ────────────────────────────────────────

test('el resumen de obras publica exactamente las siete columnas que pidió el dueño, y ninguna más', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  // La cartera entera es la consulta más pesada del módulo y bajo la carga de la suite vuelve
  // cortada por la base. `abrir` reintenta; lo que se mide después no cambia.
  await abrir(page, '/obras', 'portafolio-tabla')

  const tabla = page.getByTestId('portafolio-tabla')
  await expect(tabla).toBeVisible()

  // ═══ EL CONTRATO DE ESTA TABLA, TEXTUAL ═══
  //
  //   19/08: *"ADMINISTRACIÓN: … | ETAPA | AVANCE | PLAZO | CONTRATADO | COSTO REAL ·
  //   OBRAS: … | ETAPA | AVANCE | PLAZO | COSTO REAL · NO: Margen; Estado; Impedimentos."*
  //
  //   20/08: *"La primera columna debe ser únicamente OBRA. La segunda únicamente CLIENTE. Hoy dice
  //   «OBRA / CLIENTE» y muestra ambos mezclados. Eso está mal conceptualmente."*
  //
  // Este test exigía primero Margen y Estado, y después la columna mezclada «Obra / Cliente» — las
  // dos cosas que el dueño mandó corregir. Se reemplaza en vez de borrarse: lo que el dueño sacó
  // vuelve solo la próxima vez que alguien "complete el resumen", y sin este test nadie se entera.
  for (const columna of ['Obra', 'Cliente', 'Etapa', 'Avance', 'Plazo', 'Contratado', 'Costo real']) {
    await expect(tabla.locator('th', { hasText: columna }).first(),
      `falta la columna ${columna}`).toBeVisible()
  }
  // LA COLUMNA MEZCLADA NO PUEDE VOLVER. `hasText` es subcadena: «Obra» de arriba pasa igual con un
  // encabezado «Obra / Cliente», así que sin esta línea el bucle de arriba estaría en verde con la
  // tabla vieja intacta. Es exactamente el defecto que se vino a corregir.
  await expect(tabla.locator('th', { hasText: '/' }),
    'la primera columna volvió a mezclar obra y cliente').toHaveCount(0)
  // La lista del 19/08 prohibía también Estado e Impedimentos; el canónico del 23/08 —contrato más
  // nuevo, ratificado por el dueño el 24/08 al exigir fidelidad al zip— los dibuja como columnas
  // (Estado punto+palabra; ⚠ con conteo). La prohibición viva es SOLO Margen. El encabezado de ⚠
  // lleva la palabra en sr-only («Impedimentos abiertos»), así que ya no se puede prohibir «Impedim».
  for (const prohibida of ['Margen']) {
    await expect(tabla.locator('th', { hasText: prohibida }),
      `el resumen volvió a publicar ${prohibida}`).toHaveCount(0)
  }
  // Y las columnas nuevas del canon están de verdad (Estado como texto, no pastilla).
  await expect(tabla.locator('th', { hasText: 'Estado' }).first(), 'falta la columna Estado del canon').toBeVisible()
  await expect(tabla.locator('th', { hasText: 'Hoy' }).first(), 'falta la columna Hoy del canon').toBeVisible()

  // NINGUNA CELDA DE PLAZO QUEDA MUDA. Cada obra dice o su desvío contra la línea base, o que no
  // hay línea base contra la cual medirlo — nunca un cero prolijo que se leería como "vamos bien".
  //
  // Antes exigía literalmente «sin línea base», que era cierto el día que se escribió y dejó de
  // serlo el 19/08 cuando se sellaron las ocho. Lo que se vigila es la regla: la celda habla.
  const celdas = tabla.locator('tbody tr td:nth-child(5)')
  const n = await celdas.count()
  expect(n, 'el resumen no publicó ninguna obra').toBeGreaterThan(0)
  for (let i = 0; i < n; i++) {
    await expect(celdas.nth(i), `la celda de plazo ${i + 1} no dice nada`)
      // «sin corrimiento» y «sin cronograma» son el vocabulario del rediseño canónico (24/08):
      // la celda sigue hablando, con las palabras nuevas.
      .toHaveText(/en fecha|\d+ d|sin línea base|sin fechas|sin corrimiento|sin cronograma|fin \d|—/)
  }
})

// ── EN EL TELÉFONO NO SE DESPLAZA DE COSTADO ────────────────────────────────

test('ninguna pantalla nueva empuja la página de costado en el teléfono', async ({ page }) => {
  // Cada ruta se compila por primera vez en `next dev`: el presupuesto no es la lentitud de una
  // pantalla, es el arranque del servidor multiplicado por la cantidad de rutas.
  test.setTimeout(360000)
  await entrar(page)
  await page.setViewportSize({ width: 390, height: 780 })

  const rutas = [
    '/clientes',
    // Con los archivados a la vista: la lista suma una columna y un pie, y es cuando más ancho pide.
    '/clientes?archivados=1',
    '/clientes/la-estrella?vista=informacion',
    '/clientes/la-estrella?vista=contactos',
    '/clientes/la-estrella?vista=obras',
    '/clientes/la-estrella?vista=actividad',
    '/clientes/la-estrella?vista=documentos',
    '/obras',
    `/obras/${OBRA}`,
    `/obras/${OBRA}?vista=cronograma`,
    `/obras/${OBRA}?vista=personal`,
    `/obras/${OBRA}?vista=economia`,
    `/obras/${OBRA}?vista=cronograma&sub=proximos`,
    `/obras/${OBRA}?vista=operacion`,
    `/obras/${OBRA}?vista=operacion&sub=impedimentos`,
    `/obras/${OBRA}?vista=documentos`,
    // LAS DOS VISTAS QUE TRAJO EL REDISEÑO CANÓNICO — el árbol de tareas y el parte diario. Son la
    // MISMA ruta de Next (`/obras/[obra]`) con otra query, así que no cuestan una compilación más y
    // son, literalmente, las «pantallas nuevas» del título de este test. Van al final: si alguna
    // desbordara, el barrido ya midió todo lo anterior antes de ponerse rojo.
    `/obras/${OBRA}?vista=tareas&sub=arbol`,
    `/obras/${OBRA}?vista=tareas&sub=parte`,
  ]
  for (const ruta of rutas) {
    // `abrirSinError` Y NO `goto` A SECAS: si la pantalla vuelve con el cartel de la base cortada,
    // lo que se mediría es el ANCHO DEL CARTEL —que entra perfecto en 390px— y el barrido daría
    // verde sin haber visto la pantalla.
    await abrirSinError(page, ruta)
    await page.waitForTimeout(400)
    const { doc, win } = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth, win: window.innerWidth,
    }))
    expect(doc, `${ruta} se desplaza de costado (${doc}px en una pantalla de ${win}px)`).toBeLessThanOrEqual(win)
  }

  // Y con los formularios ABIERTOS tampoco: son lo que más ancho pide y se abren justo en el
  // teléfono, que es el aparato donde se carga.
  const conFormulario: [string, string][] = [
    // EL ALTA DE CLIENTE YA NO ES UN `details` (24/08/2026 · canónico): la abre la URL `?nuevo=1`
    // desde el botón «+ Nuevo cliente», y el bloque se dibuja abierto o no se dibuja. Con la ruta
    // vieja este `click()` esperaba un `summary` que no existe y se comía los 360 s del test entero
    // —el rojo no decía «desborda», decía «tiempo agotado», que manda a buscar al lugar equivocado.
    ['/clientes?nuevo=1', 'alta-cliente'],
    // La ficha del cliente: el formulario más largo del módulo (nueve campos) y el de vincular.
    ['/clientes/la-estrella?vista=informacion', 'editar-cliente'],
    ['/clientes/la-estrella?vista=contactos', 'alta-contacto'],
    ['/clientes/la-estrella?vista=documentos', 'alta-documento'],
    [`/obras/${OBRA}?vista=personal`, 'alta-asignacion'],
    [`/obras/${OBRA}?vista=economia`, 'alta-certificado'],
    [`/obras/${OBRA}?vista=operacion&sub=impedimentos`, 'alta-impedimento'],
    [`/obras/${OBRA}`, 'editar-obra'],
  ]
  for (const [ruta, testid] of conFormulario) {
    await abrirSinError(page, ruta)
    const bloque = page.getByTestId(testid)
    // EL FORMULARIO TIENE QUE ESTAR: si el bloque desapareció de la pantalla, esto se pone rojo acá
    // —donde se entiende— y no cien líneas después midiendo un ancho que nadie abrió.
    await expect(bloque, `${ruta} ya no tiene el bloque ${testid}`).toBeVisible({ timeout: 30000 })
    // DOS GESTOS PARA LA MISMA MEDICIÓN: unos formularios son `details` y se despliegan; otros los
    // abre la URL y nacen abiertos. Lo que se mide —el ancho CON el formulario a la vista— es lo
    // mismo en los dos casos.
    const resumen = bloque.locator('summary')
    if (await resumen.count() > 0) await resumen.first().click()
    await page.waitForTimeout(300)
    const doc = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(doc, `${ruta} con ${testid} abierto se desplaza de costado (${doc}px)`).toBeLessThanOrEqual(390)
  }

  // El panel del Gantt es el caso más difícil: cronograma y formulario a la vez. En el teléfono sube
  // desde abajo como una hoja y tapa el cronograma — es la única manera de que ninguno de los dos se
  // recorte. Un panel de 330px al costado, en 390px de pantalla, no es ninguna de las dos cosas.
  //
  // SE ELIGE LA FILA POR LO QUE ES, NO POR SU POSICIÓN (18/08/2026). Este clic era `.nth(3)` sobre
  // los botones del Gantt. Cuando el cronograma empezó a agrupar por sección, el cuarto botón pasó a
  // ser la cabecera de un grupo —que pliega, no selecciona—, y el panel no abría. El test se caía por
  // el orden del DOM y no por lo que vino a medir.
  //
  // Y LA FILA DEL TELÉFONO NO ES LA FILA DE LA TABLA. Abajo de 768px el Gantt de barras no se
  // dibuja: la tabla vive dentro de un `hidden md:flex` y en su lugar está `ListaPorFecha`. El
  // `actividad-cronograma` que se clicaba acá SIGUE en el DOM pero invisible, así que el clic
  // esperaba para siempre a un elemento que ninguna persona con un teléfono puede tocar. Se usa el
  // control que de verdad se toca a 390px.
  await abrirSinError(page, `/obras/${OBRA}?vista=cronograma`)
  await page.getByTestId('actividad-telefono').first().click()
  await expect(page.getByTestId('panel-actividad')).toBeVisible()
  await page.waitForTimeout(300)
  const conPanel = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(conPanel, `el Gantt con el panel abierto se desplaza de costado (${conPanel}px)`).toBeLessThanOrEqual(390)
})
