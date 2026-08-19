import { test, expect } from '@playwright/test'
import { conBase, entrar, laFila, limpiar, MARCA, OBRA } from './util/obras-e2e'

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
  test.setTimeout(180000)
  const sb = await conBase()
  await limpiar(sb)
  const nombre = `${MARCA} Actividad ${Date.now()}`

  try {
    await entrar(page)
    await page.goto(`/obras/${OBRA}?vista=cronograma`)

    // ── ALTA ────────────────────────────────────────────────────────────────
    await page.getByTestId('nueva-actividad').click()
    const alta = page.getByTestId('form-nueva-actividad')
    await alta.locator('input[name="nombre"]').fill(nombre)
    await alta.locator('input[name="seccion"]').fill(MARCA)
    await alta.locator('input[name="inicio_plan"]').fill('2026-08-20')
    await alta.locator('input[name="fin_plan"]').fill('2026-08-27')
    await page.getByTestId('form-nueva-actividad-enviar').click()
    await expect(page.getByTestId('form-nueva-actividad-ok')).toBeVisible({ timeout: 30000 })

    await page.reload()
    const enGantt = page.getByTestId('gantt').getByRole('button', { name: new RegExp(nombre) })
    await expect(enGantt).toBeVisible()

    // ── EL PANEL CONTEXTUAL: SE SELECCIONA LA BARRA Y APARECE AL COSTADO ────
    await enGantt.click()
    const panel = page.getByTestId('panel-actividad')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText(nombre)
    // La línea base se dice siempre: "sin sellar" no es lo mismo que "en fecha".
    await expect(panel).toContainText('sin sellar')

    // ── EDICIÓN ─────────────────────────────────────────────────────────────
    await panel.locator('summary', { hasText: 'Editar la actividad' }).click()
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

    // Y la HH plan cargada aparece en Personal, que es donde se mide contra las horas reales.
    await page.goto(`/obras/${OBRA}?vista=personal`)
    await expect(page.getByText('HH plan')).toBeVisible()

    // ── AVANCE RÁPIDO ───────────────────────────────────────────────────────
    await page.goto(`/obras/${OBRA}?vista=cronograma`)
    await page.getByTestId('gantt').getByRole('button', { name: new RegExp(nombre) }).click()
    await page.getByTestId('avance-50').click()
    await expect(async () => {
      const { data } = await sb.from('obra_actividad').select('pct').eq('id', guardada.id).single()
      expect(Number(laFila(data, 'el avance registrado').pct)).toBe(50)
    }).toPass({ timeout: 30000 })

    await page.reload()
    await page.getByTestId('gantt').getByRole('button', { name: new RegExp(nombre) }).click()
    await expect(page.getByTestId('avance-valor')).toHaveValue('50')

    // ── ARCHIVAR NO ES BORRAR ───────────────────────────────────────────────
    await page.getByTestId('archivar-actividad').click()
    await expect(async () => {
      const { data } = await sb.from('obra_actividad').select('archivada, pct').eq('id', guardada.id).single()
      const act = laFila(data, 'la actividad archivada')
      expect(act.archivada).toBe(true)
      // El avance sobrevive al archivado: por eso se archiva en vez de borrar.
      expect(Number(act.pct)).toBe(50)
    }).toPass({ timeout: 30000 })

    await page.reload()
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
    await limpiar(sb)
    await sb.auth.signOut()
  }
})

// ── PERSONAL: ASIGNAR Y QUITAR GENTE DE LA OBRA ─────────────────────────────

test('personal: la persona asignada sigue asignada después de recargar, y se puede sacar', async ({ page }) => {
  test.setTimeout(180000)
  const sb = await conBase()
  await limpiar(sb)

  try {
    await entrar(page)
    await page.goto(`/obras/${OBRA}?vista=personal`)

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

    await page.reload()
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
    await page.reload()
    await page.getByTestId('tabla-personal').locator('tr', { hasText: persona })
      .getByTestId('cerrar-asignacion').click()
    await expect(async () => {
      const { data } = await sb.from('obra_asignacion')
        .select('hasta').eq('obra_id', OBRA).ilike('notas', `%${MARCA}%`).single()
      expect((data as { hasta: string | null } | null)?.hasta, 'cerrar no escribió la fecha de fin')
        .toBeTruthy()
    }).toPass({ timeout: 30000 })

    await page.reload()
    await page.getByTestId('tabla-personal').locator('tr', { hasText: persona })
      .getByTestId('quitar-asignacion').click()
    await expect(async () => {
      const { count } = await sb.from('obra_asignacion')
        .select('id', { count: 'exact', head: true }).eq('obra_id', OBRA).ilike('notas', `%${MARCA}%`)
      expect(count).toBe(0)
    }).toPass({ timeout: 30000 })
    await page.reload()
    await expect(page.getByTestId('tabla-personal')).toHaveCount(0)
  } finally {
    await limpiar(sb)
    await sb.auth.signOut()
  }
})

// ── ECONOMÍA Y COBRANZA: EL CERTIFICADO ─────────────────────────────────────

test('economía: el certificado cargado persiste, suma en los totales y cada número dice de dónde sale', async ({ page }) => {
  test.setTimeout(180000)
  const sb = await conBase()
  await limpiar(sb)
  const numero = `${MARCA}-${Date.now()}`

  try {
    await entrar(page)
    await page.goto(`/obras/${OBRA}?vista=economia`)

    // LO QUE FALTA SE DICE CON PALABRAS. Esta obra no tiene presupuesto: publicar un 0% de desvío
    // significaría "vamos en presupuesto", que es exactamente lo contrario de la verdad.
    // «no determinado» era la palabra de la columna «De dónde sale», que se retiró: el origen ahora
  // viaja en el `title` del renglón. Lo que se sigue exigiendo es lo importante — que el vacío NO se
  // publique como cero y que diga QUÉ falta.
  await expect(page.getByTestId('economia-costo')).toContainText(/sin presupuesto|falta el presupuesto/i)
    await expect(page.getByTestId('economia-costo')).toContainText(/sin presupuesto|no hay contra qué medir/i)

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

    await page.reload()
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
    await page.reload()
    await expect(page.getByTestId('tabla-certificados')).toHaveCount(0)
  } finally {
    await limpiar(sb)
    await sb.auth.signOut()
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
  await limpiar(sb)
  const texto = `${MARCA} falta el plano de detalle`

  try {
    await entrar(page)
    await page.goto(`/obras/${OBRA}?vista=operacion&sub=impedimentos`)
    // SIN JERGA EN LA PANTALLA: adentro se llama restricción; afuera se lee «impedimento». El
    // encabezado que se exigía acá era el de «Próximos trabajos», que sigue existiendo pero en
    // Cronograma: el alta se mudó a Operación y el ancla tenía que mudarse con ella.
    await expect(page.getByTestId('bloque-impedimentos')).toBeVisible({ timeout: 30000 })

    await page.getByTestId('alta-impedimento').locator('summary').click()
    const form = page.getByTestId('form-impedimento')
    await form.locator('input[name="descripcion"]').fill(texto)
    await form.locator('select[name="tipo"]').selectOption('informacion')
    await form.locator('input[name="responsable"]').fill(`${MARCA} responsable`)
    await form.locator('input[name="fecha_compromiso"]').fill('2026-09-01')
    await page.getByTestId('form-impedimento-enviar').click()
    await expect(page.getByTestId('form-impedimento-ok')).toBeVisible({ timeout: 30000 })

    await page.reload()
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
    await page.reload()
    await expect(page.getByTestId('tabla-impedimentos').locator('tr', { hasText: texto })).toContainText('liberado')
  } finally {
    await limpiar(sb)
    await sb.auth.signOut()
  }
})

// ── PLAN CONTRA REAL: LA ALERTA DICE DE DÓNDE SALE Y LLEVA AL DATO ──────────

test('el resumen publica los desvíos con su origen, y cada uno lleva a la solapa del dato', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  await page.goto(`/obras/${OBRA}`)

  const bloque = page.getByTestId('plan-vs-real')
  await expect(bloque).toBeVisible()
  // Cinco comparaciones: plazo, avance, HH, costo y margen (más atrasos, si los hay).
  expect(await bloque.locator('li').count()).toBeGreaterThanOrEqual(5)

  // NINGÚN SEMÁFORO SIN EXPLICACIÓN: la falta de línea base se publica como falta, no como "en
  // fecha", y se dice de qué columna sale.
  await expect(bloque).toContainText(/línea base no está sellada/i)
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
  await page.goto('/obras')

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
  for (const prohibida of ['Margen', 'Estado', 'Impedim']) {
    await expect(tabla.locator('th', { hasText: prohibida }),
      `el resumen volvió a publicar ${prohibida}`).toHaveCount(0)
  }

  // NINGUNA OBRA TIENE LÍNEA BASE TODAVÍA: la columna lo dice en lugar de mostrar un cero.
  await expect(tabla).toContainText(/sin línea base/i)
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
  ]
  for (const ruta of rutas) {
    await page.goto(ruta)
    await page.waitForTimeout(400)
    const { doc, win } = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth, win: window.innerWidth,
    }))
    expect(doc, `${ruta} se desplaza de costado (${doc}px en una pantalla de ${win}px)`).toBeLessThanOrEqual(win)
  }

  // Y con los formularios ABIERTOS tampoco: son lo que más ancho pide y se abren justo en el
  // teléfono, que es el aparato donde se carga.
  const conFormulario: [string, string][] = [
    ['/clientes', 'alta-cliente'],
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
    await page.goto(ruta)
    await page.getByTestId(testid).locator('summary').click()
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
  await page.goto(`/obras/${OBRA}?vista=cronograma`)
  await page.getByTestId('actividad-cronograma').first().click()
  await expect(page.getByTestId('panel-actividad')).toBeVisible()
  await page.waitForTimeout(300)
  const conPanel = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(conPanel, `el Gantt con el panel abierto se desplaza de costado (${conPanel}px)`).toBeLessThanOrEqual(390)
})
