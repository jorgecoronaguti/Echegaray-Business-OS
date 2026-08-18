import { test, expect } from '@playwright/test'
import { conBase, entrar, laFila, limpiar, MARCA } from './util/obras-e2e'

// MVP ERP DE OBRAS · EL CLIENTE Y LA OBRA, PROBADOS CONTRA LA BASE.
//
// ═══ QUÉ PRUEBA ESTE ARCHIVO Y QUÉ NO ═══
//
// NO prueba que el formulario se vea. Un formulario que se ve y no guarda es peor que no tenerlo:
// el jefe de obra se va convencido de que cargó algo. Cada caso hace lo mismo:
//
//   1. crea o edita algo POR LA PANTALLA, como el dueño,
//   2. RECARGA la página —o sea, vuelve a leer del servidor, no del estado del navegador—,
//   3. exige que el dato esté,
//   4. y lo borra al final, gane o pierda.
//
// El paso 2 es el que importa. Sin recargar, lo único que se prueba es que React pintó algo.

// ── CLIENTE: ALTA, EDICIÓN, CONTACTO Y DOCUMENTO ────────────────────────────

test('cliente: se crea, se edita, se le agrega y se le saca un contacto — y todo sobrevive a la recarga', async ({ page }) => {
  // OCHO escrituras con su recarga y su relectura contra la base. En local entra en 17 s; contra
  // producción cada una es una función fría de Vercel y el conjunto pasó de 180 s. El techo se sube
  // por eso y no se toca una sola afirmación: lo que tarda es el entorno, no lo que se prueba.
  test.setTimeout(360000)
  const sb = await conBase()
  await limpiar(sb)
  const nombre = `${MARCA} Cliente ${Date.now()}`

  try {
    await entrar(page)

    // ── ALTA ────────────────────────────────────────────────────────────────
    await page.goto('/clientes')
    await page.getByTestId('alta-cliente').locator('summary').click()
    const alta = page.getByTestId('form-cliente')
    await alta.locator('input[name="nombre"]').fill(nombre)
    await alta.locator('input[name="cuit"]').fill('30-71234567-4')
    await page.getByTestId('form-cliente-enviar').click()
    await expect(page.getByTestId('form-cliente-ok')).toBeVisible({ timeout: 30000 })

    // LA PRUEBA ES LA RECARGA: lo que se lee después de volver a pedirle la página al servidor.
    await page.reload()
    await expect(page.getByRole('link', { name: new RegExp(nombre) })).toBeVisible()

    const { data: creadoRaw } = await sb.from('clientes').select('id, slug, cuit').eq('nombre', nombre).single()
    const creado = laFila(creadoRaw, 'el cliente recién creado')
    // El CUIT se guarda con 11 dígitos y sin guiones: escrito de dos formas distintas deja de servir
    // para cruzar contra ARCA, que es para lo único que existe esa columna.
    expect(creado.cuit).toBe('30712345674')

    // ── EDICIÓN ─────────────────────────────────────────────────────────────
    await page.goto(`/clientes/${creado.slug}?vista=informacion`)
    await page.getByTestId('form-editar-cliente').locator('textarea[name="notas"]').fill(`${MARCA} nota editada`)
    await page.getByTestId('form-editar-cliente-enviar').click()
    await expect(page.getByTestId('form-editar-cliente-ok')).toBeVisible({ timeout: 30000 })

    await page.reload()
    // Se busca en el PÁRRAFO de la ficha, no en cualquier lugar: la nota también vive dentro del
    // textarea del formulario de edición, y lo que se quiere probar es que se LEE de la base.
    await expect(page.getByRole('paragraph').filter({ hasText: `${MARCA} nota editada` })).toBeVisible()

    // ── CONTACTO: ALTA Y BAJA ───────────────────────────────────────────────
    await page.goto(`/clientes/${creado.slug}?vista=contactos`)
    await page.getByTestId('alta-contacto').locator('summary').click()
    const fc = page.getByTestId('form-contacto')
    await fc.locator('input[name="nombre"]').fill(`${MARCA} Contacto`)
    await fc.locator('input[name="rol"]').fill('jefe de compras')
    await fc.locator('input[name="email"]').fill('contacto@ejemplo.com')
    await page.getByTestId('form-contacto-enviar').click()
    await expect(page.getByTestId('form-contacto-ok')).toBeVisible({ timeout: 30000 })

    await page.reload()
    const fila = page.getByTestId('tabla-contactos').locator('tr', { hasText: `${MARCA} Contacto` })
    await expect(fila).toBeVisible()
    await expect(fila).toContainText('jefe de compras')

    await fila.getByTestId('borrar-contacto').click()
    await expect(page.getByTestId('tabla-contactos')).toHaveCount(0, { timeout: 30000 })
    await page.reload()
    await expect(page.getByText(`${MARCA} Contacto`)).toHaveCount(0)

    // ── DOCUMENTO SUELTO DE DRIVE, PEGANDO LA URL ENTERA ────────────────────
    const idFalso = `zzE2E${'x'.repeat(20)}`
    await page.goto(`/clientes/${creado.slug}?vista=documentos`)
    await page.getByTestId('alta-documento').locator('summary').click()
    await page.getByTestId('form-documento').locator('input[name="url"]')
      .fill(`https://drive.google.com/file/d/${idFalso}/view`)
    await page.getByTestId('form-documento').locator('input[name="rol"]').fill('contrato')
    await page.getByTestId('form-documento-enviar').click()
    await expect(page.getByTestId('form-documento-ok')).toBeVisible({ timeout: 30000 })

    await page.reload()
    // El id se extrajo de la URL entera: nadie tiene por qué saber dónde termina dentro del enlace.
    const { data: docs } = await sb.from('cliente_documento').select('drive_file_id').eq('cliente_id', creado.id)
    expect(docs?.map((d) => d.drive_file_id)).toContain(idFalso)
    // Y se ve en la pantalla aunque el índice de Drive no lo conozca: el vínculo vale igual.
    await expect(page.getByText(idFalso)).toBeVisible()

    // ── LA CARPETA DEL CLIENTE, PEGANDO LA URL ENTERA ───────────────────────
    // Distinto de vincular UN documento: esto es la carpeta raíz, y es la que abre el botón de la
    // solapa Documentos. Estaba construida y sin una sola comprobación — el único verbo de cliente
    // que nadie había probado contra la base.
    const carpetaFalsa = `zzE2Ecarpeta${'y'.repeat(20)}`
    await page.goto(`/clientes/${creado.slug}?vista=informacion`)
    await page.getByTestId('form-carpeta-drive').locator('input[name="url"]')
      .fill(`https://drive.google.com/drive/folders/${carpetaFalsa}?usp=sharing`)
    await page.getByTestId('form-carpeta-drive-enviar').click()
    await expect(page.getByTestId('form-carpeta-drive-ok')).toBeVisible({ timeout: 30000 })

    const { data: conCarpeta } = await sb.from('clientes').select('drive_carpeta_id').eq('id', creado.id).single()
    // El id se extrae de la URL entera, sin el `?usp=sharing` pegado atrás: pedir el id suelto es la
    // forma más rápida de que se cargue mal.
    expect(laFila(conCarpeta, 'el cliente con carpeta').drive_carpeta_id).toBe(carpetaFalsa)

    // Y la solapa Documentos deja de decir que no hay por dónde entrar.
    await page.goto(`/clientes/${creado.slug}?vista=documentos`)
    await expect(page.getByRole('link', { name: /Abrir la carpeta del cliente en Drive/ }))
      .toHaveAttribute('href', `https://drive.google.com/drive/folders/${carpetaFalsa}`)

    // ── ARCHIVAR NO ES BORRAR ───────────────────────────────────────────────
    await page.goto(`/clientes/${creado.slug}?vista=informacion`)
    await page.getByTestId('archivar-cliente').click()
    await expect(async () => {
      const { data } = await sb.from('clientes').select('activo').eq('id', creado.id).single()
      expect(laFila(data, 'el cliente archivado').activo).toBe(false)
    }).toPass({ timeout: 30000 })
    await page.reload()
    await expect(page.getByText('archivado').first()).toBeVisible()
  } finally {
    await limpiar(sb)
    await sb.auth.signOut()
  }
})

// ── OBRA: EL ALTA ESTÁ BLOQUEADA EN LA BASE, Y FALLA CERRADO ────────────────
//
// EL HALLAZGO MÁS IMPORTANTE DEL TRABAJO: `crearObra` y `editarObra` validan bien y NO PUEDEN
// ESCRIBIR. `obra_canonica` tiene la policy `obra_canonica_write` desde el 19/07, pero el único
// grant que se le dio a `authenticated` es `select` (20260817223000_modulo_01_grants.sql:35). RLS y
// GRANT son permisos distintos —la policy dice QUÉ FILAS, el grant dice SI PODÉS TOCAR LA TABLA— y
// es el mismo defecto que dejó el módulo 01 entero en 404 el 17/08.
//
// Medido contra la base viva, entrando como el usuario de prueba (rol `direccion`) por PostgREST:
//   update public.obra_canonica set ubicacion = ubicacion where id = 'le-comedor';
//   → permission denied for table obra_canonica
//
// Lo arregla `supabase/migrations/20260818230000_obra_canonica_grant_escritura.sql`, que NO se
// aplicó: aplicar migraciones no es de este agente.
//
// ═══ POR QUÉ ESTE TEST EXIGE EL ERROR EN VEZ DE EXIGIR EL ALTA ═══
//
// Porque hoy lo que hay que garantizar es que FALLA CERRADO: que el formulario no se limpie y diga
// nada, dejando a alguien convencido de que creó una obra que no existe. Y porque es un CANARIO: el
// día que se aplique el grant, este test se pone ROJO y obliga a activar el que está abajo, en vez
// de que la capacidad quede apagada y nadie se entere.

// ENCENDIDO EL 18/08/2026, al aplicar 20260818230000_obra_canonica_grant_escritura.sql.
//
// Hasta ese momento acá vivía un CANARIO que exigía el `permission denied` — porque lo único que se
// podía garantizar era que el alta fallara CERRADO, sin limpiar el formulario ni dejar a alguien
// convencido de que creó una obra que no existe. El canario se puso rojo con el grant aplicado, que
// era exactamente su trabajo, y se retiró en el mismo commit que enciende éste. Un límite conocido
// que no está medido se olvida; uno medido avisa cuando deja de ser un límite.
test('obra: se crea desde la ficha del cliente y se edita desde la obra', async ({ page }) => {
  test.setTimeout(180000)
  const sb = await conBase()
  await limpiar(sb)
  const cliente = `${MARCA} Cliente Obra ${Date.now()}`
  const obra = `${MARCA} Obra ${Date.now()}`

  try {
    await entrar(page)

    // El cliente sí se puede crear: `clientes` tiene sus grants desde la fundación.
    await page.goto('/clientes')
    await page.getByTestId('alta-cliente').locator('summary').click()
    await page.getByTestId('form-cliente').locator('input[name="nombre"]').fill(cliente)
    await page.getByTestId('form-cliente-enviar').click()
    await expect(page.getByTestId('form-cliente-ok')).toBeVisible({ timeout: 30000 })
    const { data: cliRaw } = await sb.from('clientes').select('id, slug').eq('nombre', cliente).single()
    const cli = laFila(cliRaw, 'el cliente recién creado')

    // ── ALTA DE OBRA, COLGADA DEL CLIENTE ───────────────────────────────────
    await page.goto(`/clientes/${cli.slug}`)
    await page.getByTestId('alta-obra').locator('summary').click()
    const alta = page.getByTestId('form-obra')
    await alta.locator('input[name="nombre"]').fill(obra)
    await alta.locator('input[name="ubicacion"]').fill('San Juan')
    await alta.locator('input[name="jefe_obra"]').fill(`${MARCA} jefe`)
    await alta.locator('select[name="etapa"]').selectOption('inicio')
    await alta.locator('input[name="monto_contratado"]').fill('9000000')
    await page.getByTestId('form-obra-enviar').click()
    await expect(page.getByTestId('form-obra-ok')).toBeVisible({ timeout: 30000 })

    await page.reload()
    await expect(page.getByTestId('obras-del-cliente')).toContainText(obra)

    const { data: creadaRaw } = await sb.from('obra_canonica')
      .select('id, cliente_id, ubicacion, monto_contratado, etapa').eq('nombre', obra).single()
    const creada = laFila(creadaRaw, 'la obra recién creada')
    expect(creada.cliente_id, 'la obra nace colgada de SU cliente, no de una cadena de texto').toBe(cli.id)
    expect(creada.ubicacion).toBe('San Juan')

    // ── EDICIÓN DESDE LA OBRA ───────────────────────────────────────────────
    await page.goto(`/obras/${creada.id}`)
    await page.getByTestId('editar-obra').locator('summary').click()
    const editar = page.getByTestId('form-editar-obra')
    await editar.locator('input[name="ubicacion"]').fill('Rawson, San Juan')
    await editar.locator('input[name="monto_contratado"]').fill('12000000')
    await page.getByTestId('form-editar-obra-enviar').click()
    await expect(page.getByTestId('form-editar-obra-ok')).toBeVisible({ timeout: 30000 })

    await page.reload()
    // La ubicación NO viaja en `obra_panel`: se lee de `obra_canonica`. Si se leyera del panel, el
    // campo volvería vacío después de guardar y parecería que anduvo.
    await page.getByTestId('editar-obra').locator('summary').click()
    await expect(page.getByTestId('form-editar-obra').locator('input[name="ubicacion"]'))
      .toHaveValue('Rawson, San Juan')
    await page.goto(`/obras/${creada.id}?vista=economia`)
    await expect(page.getByTestId('economia-margen')).toContainText('$12.000.000')
  } finally {
    await limpiar(sb)
    await sb.auth.signOut()
  }
})

// ── OBRA: ARCHIVAR ES SACARLA DE LA VISTA, NUNCA DE LA BASE ─────────────────
//
// ═══ EL DEFECTO QUE ESTE TEST ATRAPA ═══
//
// `estado = 'cerrada'` se podía escribir desde siempre —el desplegable «Estado» del formulario de
// edición ya lo ofrecía— y NO PASABA NADA. `obra_panel` no filtra por estado, el portafolio pintaba
// las ocho filas y la ficha del cliente también: la obra 'galpones', cerrada en la base desde antes
// de este trabajo, seguía en la cartera del dueño como una obra más.
//
// O sea: el verbo existía y el EFECTO no. Cerrar una obra era escribir una palabra en una columna
// que nadie leía. Por eso este test no comprueba que la acción devuelva ok —eso ya lo hacía—: mide
// las cuatro consecuencias, que es lo único que se pidió.
//
//   1. la obra archivada NO está en el portafolio ni en la ficha del cliente,
//   2. la fila SIGUE en la base (archivar no es borrar),
//   3. la ficha SIGUE abriendo por su URL, y dice que está archivada,
//   4. se restaura y vuelve a los dos lugares.
//
// Revertir cualquiera de las tres piezas —la action, el filtro del portafolio, el filtro del
// cliente— pone en rojo una afirmación distinta de este test.
test('obra: se archiva, desaparece de las listas, sigue entrando por su URL y se restaura', async ({ page }) => {
  test.setTimeout(240000)
  const sb = await conBase()
  await limpiar(sb)
  const cliente = `${MARCA} Cliente Archivo ${Date.now()}`
  const obra = `${MARCA} Obra Archivo ${Date.now()}`

  try {
    await entrar(page)

    await page.goto('/clientes')
    await page.getByTestId('alta-cliente').locator('summary').click()
    await page.getByTestId('form-cliente').locator('input[name="nombre"]').fill(cliente)
    await page.getByTestId('form-cliente-enviar').click()
    await expect(page.getByTestId('form-cliente-ok')).toBeVisible({ timeout: 30000 })
    const { data: cliRaw } = await sb.from('clientes').select('id, slug').eq('nombre', cliente).single()
    const cli = laFila(cliRaw, 'el cliente recién creado')

    await page.goto(`/clientes/${cli.slug}`)
    await page.getByTestId('alta-obra').locator('summary').click()
    await page.getByTestId('form-obra').locator('input[name="nombre"]').fill(obra)
    await page.getByTestId('form-obra-enviar').click()
    await expect(page.getByTestId('form-obra-ok')).toBeVisible({ timeout: 30000 })
    const { data: creadaRaw } = await sb.from('obra_canonica').select('id, estado').eq('nombre', obra).single()
    const creada = laFila(creadaRaw, 'la obra recién creada')
    expect(creada.estado, 'una obra nace activa').toBe('activa')

    // ── LÍNEA DE BASE: ANTES DE ARCHIVAR, LA OBRA ESTÁ EN LOS DOS LUGARES ───
    // Sin esta comprobación, un test que sólo mira la ausencia pasaría igual con un selector mal
    // escrito: no encontrar nada es el resultado por defecto de buscar mal.
    await page.goto('/obras')
    await expect(page.getByTestId('portafolio-tabla')).toContainText(obra)
    await page.goto(`/clientes/${cli.slug}`)
    await expect(page.getByTestId('obras-del-cliente')).toContainText(obra)

    // ── ARCHIVAR ───────────────────────────────────────────────────────────
    await page.goto(`/obras/${creada.id}`)
    await page.getByTestId('archivar-obra').click()
    await expect(async () => {
      const { data } = await sb.from('obra_canonica').select('estado').eq('id', creada.id).single()
      expect(laFila(data, 'la obra archivada').estado).toBe('cerrada')
    }).toPass({ timeout: 30000 })

    // 1 · FUERA DEL PORTAFOLIO, pero con la puerta de vuelta a la vista.
    await page.goto('/obras')
    await expect(page.getByTestId('portafolio-tabla')).not.toContainText(obra)
    await expect(page.getByTestId('pie-archivadas')).toBeVisible()
    await page.getByTestId('ver-archivadas').click()
    await expect(page.getByTestId('portafolio-tabla')).toContainText(obra)

    // 2 · FUERA DE LA FICHA DEL CLIENTE, con la misma puerta de vuelta.
    //
    // La ausencia se mide por el ENLACE a la obra y no con `not.toContainText` sobre la tabla: este
    // cliente tiene una sola obra, así que al archivarla la tabla entera desaparece y es reemplazada
    // por «Todas las obras de este cliente están archivadas». `not.toContainText` sobre un elemento
    // que no existe no pasa —falla con "element(s) not found"—, y habría dado rojo por el motivo
    // equivocado, escondiendo si el filtro anda o no.
    await page.goto(`/clientes/${cli.slug}`)
    await expect(page.getByRole('link', { name: obra })).toHaveCount(0)
    await page.getByTestId('ver-archivadas-cliente').click()
    await expect(page.getByTestId('obras-del-cliente')).toContainText(obra)

    // 3 · LA URL SIGUE ABRIENDO, Y LA PÁGINA LO DICE. Que una obra salga de una lista no puede
    //     romper el enlace que alguien mandó por WhatsApp hace dos meses.
    await page.goto(`/obras/${creada.id}`)
    await expect(page.getByRole('heading', { name: obra })).toBeVisible()
    await expect(page.getByTestId('obra-archivada')).toBeVisible()

    // 4 · SE RESTAURA, y vuelve a los dos lugares por la puerta principal.
    await page.getByTestId('archivar-obra').click()
    await expect(async () => {
      const { data } = await sb.from('obra_canonica').select('estado').eq('id', creada.id).single()
      expect(laFila(data, 'la obra reactivada').estado).toBe('activa')
    }).toPass({ timeout: 30000 })
    await page.goto('/obras')
    await expect(page.getByTestId('portafolio-tabla')).toContainText(obra)
    await page.goto(`/clientes/${cli.slug}`)
    await expect(page.getByTestId('obras-del-cliente')).toContainText(obra)
  } finally {
    await limpiar(sb)
    await sb.auth.signOut()
  }
})
