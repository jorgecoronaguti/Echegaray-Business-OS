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
    await alta.locator('input[name="nombre_comercial"]').fill(nombre)
    await alta.locator('input[name="cuit"]').fill('30-71234567-4')
    await page.getByTestId('form-cliente-enviar').click()
    await expect(page.getByTestId('form-cliente-ok')).toBeVisible({ timeout: 30000 })

    // LA PRUEBA ES LA RECARGA: lo que se lee después de volver a pedirle la página al servidor.
    await page.reload()
    await expect(page.getByRole('link', { name: new RegExp(nombre) })).toBeVisible()

    const { data: creadoRaw } = await sb.from('clientes').select('id, slug, cuit').eq('nombre_comercial', nombre).single()
    const creado = laFila(creadoRaw, 'el cliente recién creado')
    // El CUIT se guarda con 11 dígitos y sin guiones: escrito de dos formas distintas deja de servir
    // para cruzar contra ARCA, que es para lo único que existe esa columna.
    expect(creado.cuit).toBe('30712345674')

    // ── EDICIÓN ─────────────────────────────────────────────────────────────
    // El formulario vive plegado: la ficha existe para LEERSE, y un formulario permanentemente
    // abierto compite con lo que se vino a mirar.
    await page.goto(`/clientes/${creado.slug}`)
    await page.getByTestId('editar-cliente').locator('summary').click()
    await page.getByTestId('form-editar-cliente').locator('textarea[name="notas"]').fill(`${MARCA} nota editada`)
    await page.getByTestId('form-editar-cliente-enviar').click()
    await expect(page.getByTestId('form-editar-cliente-ok')).toBeVisible({ timeout: 30000 })

    await page.reload()
    // Se busca en el PÁRRAFO de la ficha, no en cualquier lugar: la nota también vive dentro del
    // textarea del formulario de edición, y lo que se quiere probar es que se LEE de la base.
    await expect(page.getByRole('paragraph').filter({ hasText: `${MARCA} nota editada` })).toBeVisible()

    // ── CONTACTO: ALTA, EDICIÓN Y BAJA ──────────────────────────────────────
    await page.goto(`/clientes/${creado.slug}`)
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

    // EDITAR EXISTE PORQUE BORRAR Y RECARGAR NO ES EDITAR: sin esto, corregir un teléfono obligaba a
    // borrar la persona y volver a cargarla, y con eso se perdía la fecha en que entró a la relación
    // —que es un evento de la solapa Actividad—. La edición viaja en la URL: la fila se abre con un
    // enlace, no con estado de navegador.
    await fila.getByTestId('editar-contacto').click()
    const fe = page.getByTestId('form-editar-contacto')
    await fe.locator('input[name="telefono"]').fill('264 400 0000')
    await fe.locator('input[name="rol"]').fill('gerente de compras')
    await page.getByTestId('form-editar-contacto-enviar').click()
    await expect(page.getByTestId('form-editar-contacto-ok')).toBeVisible({ timeout: 30000 })

    // LA EVIDENCIA ES LA FILA EN LA BASE, no el cartelito verde del formulario.
    const { data: contactoRaw } = await sb.from('cliente_contacto')
      .select('id, telefono, rol, creado_en').eq('cliente_id', creado.id).single()
    const elContacto = laFila(contactoRaw, 'el contacto editado')
    expect(elContacto.telefono).toBe('264 400 0000')
    expect(elContacto.rol).toBe('gerente de compras')
    // Y la fecha de alta SIGUE siendo la original: editar no puede reescribir la historia.
    expect(elContacto.creado_en).not.toBeNull()

    await page.reload()
    await expect(page.getByTestId('tabla-contactos')).toContainText('264 400 0000')

    await fila.getByTestId('borrar-contacto').click()
    await expect(page.getByTestId('tabla-contactos')).toHaveCount(0, { timeout: 30000 })
    await page.reload()
    await expect(page.getByText(`${MARCA} Contacto`)).toHaveCount(0)

    // ── DOCUMENTO SUELTO DE DRIVE, PEGANDO LA URL ENTERA ────────────────────
    const idFalso = `zzE2E${'x'.repeat(20)}`
    await page.goto(`/clientes/${creado.slug}`)
    await page.getByTestId('alta-documento').locator('summary').click()
    await page.getByTestId('form-documento').locator('input[name="url"]')
      .fill(`https://drive.google.com/file/d/${idFalso}/view`)
    // «Para qué sirve» es un vocabulario CERRADO, no un campo de texto: escrito a mano, el mismo
    // contrato entra como «contrato», «Contrato» y «cto», y la clasificación deja de servir.
    await page.getByTestId('form-documento').locator('select[name="rol"]').selectOption('contrato')
    await page.getByTestId('form-documento-enviar').click()
    await expect(page.getByTestId('form-documento-ok')).toBeVisible({ timeout: 30000 })

    await page.reload()
    // El id se extrajo de la URL entera: nadie tiene por qué saber dónde termina dentro del enlace.
    const { data: docs } = await sb.from('cliente_documento')
      .select('drive_file_id, rol').eq('cliente_id', creado.id)
    expect(docs?.map((d) => d.drive_file_id)).toContain(idFalso)
    expect(docs?.[0]?.rol).toBe('contrato')
    // Y se ve en la pantalla aunque el índice de Drive no lo conozca: el vínculo vale igual.
    //
    // Se busca el ENLACE del bloque de documentos y no el texto suelto (19/08/2026): con el record
    // en una sola pantalla, la ACTIVIDAD del mismo cliente publica «Documento vinculado: <id>» y el
    // id aparece dos veces en la página. Buscarlo suelto falla por ambigüedad, que es un rojo que
    // no habla del defecto que este caso vino a medir.
    await expect(page.getByTestId('documento-cliente-enlace')).toHaveText(idFalso)

    // ── RECLASIFICAR DESDE LA LISTA ─────────────────────────────────────────
    // Es lo que convierte 214 vínculos en un archivo consultable. El desplegable guarda al soltarlo:
    // un botón por fila duplica los clics y a la mitad de la tarea se abandona.
    await page.getByTestId('rol-documento').selectOption('plano')
    await expect(async () => {
      const { data } = await sb.from('cliente_documento')
        .select('rol').eq('cliente_id', creado.id).eq('drive_file_id', idFalso).single()
      expect(laFila(data, 'el documento reclasificado').rol).toBe('plano')
    }).toPass({ timeout: 30000 })
    // Y sobrevive a la recarga: lo que se lee del servidor, no lo que quedó pintado.
    await page.reload()
    await expect(page.getByTestId('rol-documento')).toHaveValue('plano')

    // ── LA CARPETA DEL CLIENTE, PEGANDO LA URL ENTERA ───────────────────────
    // Distinto de vincular UN documento: esto es la carpeta raíz, y es la que abre el enlace de la
    // solapa Documentos.
    const carpetaFalsa = `zzE2Ecarpeta${'y'.repeat(20)}`
    await page.goto(`/clientes/${creado.slug}`)
    await page.getByTestId('carpeta-drive').locator('summary').click()
    await page.getByTestId('form-carpeta-drive').locator('input[name="url"]')
      .fill(`https://drive.google.com/drive/folders/${carpetaFalsa}?usp=sharing`)
    await page.getByTestId('form-carpeta-drive-enviar').click()
    await expect(page.getByTestId('form-carpeta-drive-ok')).toBeVisible({ timeout: 30000 })

    const { data: conCarpeta } = await sb.from('clientes').select('drive_carpeta_id').eq('id', creado.id).single()
    // El id se extrae de la URL entera, sin el `?usp=sharing` pegado atrás: pedir el id suelto es la
    // forma más rápida de que se cargue mal.
    expect(laFila(conCarpeta, 'el cliente con carpeta').drive_carpeta_id).toBe(carpetaFalsa)

    // Y la solapa Documentos deja de decir que no hay por dónde entrar.
    await page.goto(`/clientes/${creado.slug}`)
    await expect(page.getByRole('link', { name: /Abrir la carpeta del cliente en Drive/ }))
      .toHaveAttribute('href', `https://drive.google.com/drive/folders/${carpetaFalsa}`)

    // ── LA SOLAPA ACTIVIDAD MUESTRA HECHOS REALES, CON SU FECHA ─────────────
    //
    // No hay tabla de eventos: la lista se DERIVA de las fechas que ya están guardadas. Lo que se
    // exige acá es que los hechos que este mismo test provocó —el alta del cliente y el vínculo del
    // documento— aparezcan; y que NO aparezca el contacto, que fue borrado. Un timeline que
    // inventara eventos, o que se quedara con los borrados, falla en este punto.
    await page.goto(`/clientes/${creado.slug}`)
    const actividad = page.getByTestId('tabla-actividad')
    await expect(actividad).toContainText('Alta del cliente')
    await expect(actividad).toContainText('Documento vinculado')
    await expect(actividad).not.toContainText(`${MARCA} Contacto`)
    // La fecha de cada hecho está: una línea de tiempo sin fechas es una lista.
    const hoy = new Date().toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC',
    })
    await expect(actividad).toContainText(hoy)
    // Y no habla en idioma de base de datos.
    for (const jerga of ['created_at', 'cliente_documento', 'drive_file_id']) {
      await expect(actividad).not.toContainText(jerga)
    }
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
    await page.getByTestId('form-cliente').locator('input[name="nombre_comercial"]').fill(cliente)
    await page.getByTestId('form-cliente-enviar').click()
    await expect(page.getByTestId('form-cliente-ok')).toBeVisible({ timeout: 30000 })
    const { data: cliRaw } = await sb.from('clientes').select('id, slug').eq('nombre_comercial', cliente).single()
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

    // EL CONTRATO NO SE LEE DE LA TABLA, NI SIQUIERA ACÁ (19/08/2026). `authenticated` perdió SELECT
    // sobre `obra_canonica.monto_contratado`: el único camino es `obra_panel`, que lo devuelve por
    // una función `security definer` con `es_administracion()` adentro. Este test entra con la
    // sesión de Dirección, así que recorre exactamente el camino de la web — y si alguien rompiera
    // ese camino, acá se vería, que es más de lo que probaba leyendo la columna cruda.
    const { data: creadaRaw } = await sb.from('obra_canonica')
      .select('id, cliente_id, ubicacion, etapa').eq('nombre', obra).single()
    const creada = laFila(creadaRaw, 'la obra recién creada')
    expect(creada.cliente_id, 'la obra nace colgada de SU cliente, no de una cadena de texto').toBe(cli.id)
    expect(creada.ubicacion).toBe('San Juan')

    const { data: panelRaw } = await sb.from('obra_panel')
      .select('monto_contratado').eq('obra_id', creada.id).single()
    expect(Number(laFila(panelRaw, 'la obra en el panel').monto_contratado),
      'el contrato no le llega a Administración por el único camino que quedó').toBe(9000000)

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
    // El monto contratado se mudó del bloque «Contrato y margen» al bloque «Contrato» cuando Economía
  // pasó a los cuatro bloques del MVP. El número es el mismo.
  await expect(page.getByTestId('economia-contrato')).toContainText('$12.000.000')
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
    await page.getByTestId('form-cliente').locator('input[name="nombre_comercial"]').fill(cliente)
    await page.getByTestId('form-cliente-enviar').click()
    await expect(page.getByTestId('form-cliente-ok')).toBeVisible({ timeout: 30000 })
    const { data: cliRaw } = await sb.from('clientes').select('id, slug').eq('nombre_comercial', cliente).single()
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
    //
    // Y se mide DENTRO del bloque de obras (19/08/2026). Con el record en una sola pantalla, la
    // ACTIVIDAD del mismo cliente publica «Alta de la obra: <nombre>» como enlace: buscar el enlace
    // en toda la página lo encontraría ahí y daría rojo diciendo que la obra sigue en la lista
    // cuando no está. El bloque es el que tiene que contestar por su propia lista.
    await page.goto(`/clientes/${cli.slug}`)
    await expect(page.getByTestId('bloque-obras').getByRole('link', { name: obra })).toHaveCount(0)
    // Y en la actividad SÍ sigue estando: archivar una obra no borra que se dio de alta.
    await expect(page.getByTestId('bloque-actividad')).toContainText(obra)
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

// ── CLIENTE: ARCHIVAR ES SACARLO DE LA VISTA, NUNCA DE LA BASE ──────────────
//
// ═══ EL DEFECTO QUE ESTE TEST ATRAPA ═══
//
// `archivarCliente` escribía `activo = false` desde el primer día y `/clientes` NO MIRABA esa
// columna: el cliente archivado seguía en la lista, en la misma posición y con los mismos números.
// El verbo existía y el EFECTO no — el mismo patrón que tenía «cerrar una obra» hasta el 18/08.
//
// Un test que sólo comprobara que la acción devuelve `ok` habría pasado en verde todo ese tiempo,
// porque la escritura SÍ ocurría. Lo que faltaba era que alguien la leyera. Por eso acá no se mide
// la respuesta de la acción: se miden las cuatro consecuencias.
//
//   1. sale de /clientes, y el pie dice cuántos quedaron guardados,
//   2. la fila SIGUE en la base y la ficha SIGUE abriendo por su URL, diciendo que está archivada,
//   3. la puerta de vuelta los trae a la lista,
//   4. se reactiva y vuelve por la puerta principal.
//
// Revertir cualquiera de las dos piezas —la action o el filtro de la lista— pone en rojo una
// afirmación distinta.
test('cliente: se archiva, sale de la lista, sigue entrando por su URL y se reactiva', async ({ page }) => {
  test.setTimeout(240000)
  const sb = await conBase()
  await limpiar(sb)
  const nombre = `${MARCA} Cliente Archivo ${Date.now()}`

  try {
    await entrar(page)

    await page.goto('/clientes')
    await page.getByTestId('alta-cliente').locator('summary').click()
    await page.getByTestId('form-cliente').locator('input[name="nombre_comercial"]').fill(nombre)
    await page.getByTestId('form-cliente-enviar').click()
    await expect(page.getByTestId('form-cliente-ok')).toBeVisible({ timeout: 30000 })
    const { data: cliRaw } = await sb.from('clientes').select('id, slug, activo').eq('nombre_comercial', nombre).single()
    const cli = laFila(cliRaw, 'el cliente recién creado')
    expect(cli.activo, 'un cliente nace activo').toBe(true)

    // LÍNEA DE BASE. Sin esto, un test que sólo mira la ausencia pasaría igual con un selector mal
    // escrito: no encontrar nada es el resultado por defecto de buscar mal.
    await page.reload()
    await expect(page.getByTestId('clientes-tabla')).toContainText(nombre)

    // ── ARCHIVAR ───────────────────────────────────────────────────────────
    await page.goto(`/clientes/${cli.slug}`)
    await page.getByTestId('archivar-cliente').click()
    await expect(async () => {
      const { data } = await sb.from('clientes').select('activo').eq('id', cli.id).single()
      expect(laFila(data, 'el cliente archivado').activo).toBe(false)
    }).toPass({ timeout: 30000 })

    // 1 · FUERA DE LA LISTA, con la puerta de vuelta a la vista.
    await page.goto('/clientes')
    await expect(page.getByTestId('clientes-tabla')).not.toContainText(nombre)
    await expect(page.getByTestId('pie-archivados')).toBeVisible()

    // 2 · LA FICHA SIGUE ABRIENDO, Y LA PÁGINA LO DICE. Que un cliente salga de una lista no puede
    //     romper el enlace que alguien mandó por WhatsApp hace dos meses.
    await page.goto(`/clientes/${cli.slug}`)
    await expect(page.getByRole('heading', { name: nombre })).toBeVisible()
    await expect(page.getByTestId('cliente-archivado')).toBeVisible()

    // 3 · LA PUERTA DE VUELTA lo trae sin cambiar de pantalla.
    await page.goto('/clientes')
    await page.getByTestId('ver-archivados').click()
    await expect(page.getByTestId('clientes-tabla')).toContainText(nombre)

    // 4 · SE REACTIVA y vuelve por la puerta principal.
    await page.goto(`/clientes/${cli.slug}`)
    await page.getByTestId('archivar-cliente').click()
    await expect(async () => {
      const { data } = await sb.from('clientes').select('activo').eq('id', cli.id).single()
      expect(laFila(data, 'el cliente reactivado').activo).toBe(true)
    }).toPass({ timeout: 30000 })
    await page.goto('/clientes')
    await expect(page.getByTestId('clientes-tabla')).toContainText(nombre)
  } finally {
    await limpiar(sb)
    await sb.auth.signOut()
  }
})


// ── CLIENTE: LOS CAMPOS QUE HACEN QUE SEA UNA RELACIÓN Y NO UNA CARPETA ────
//
// ═══ POR QUÉ ESTE TEST EXISTE, Y QUÉ REEMPLAZÓ ═══
//
// Hasta que se aplicó `20260819T0500_cliente_es_una_relacion`, acá vivía un CANARIO que exigía que
// cargar un teléfono FALLARA CERRADO: lo único que se podía garantizar era que nadie escribiera un
// dato, viera «guardado» y se fuera convencido de que había quedado registrado. El canario se puso
// rojo con la migración aplicada —que era exactamente su trabajo— y se retiró en el mismo commit que
// enciende éste. Un límite conocido que no está medido se olvida; uno medido avisa cuando deja de
// ser un límite.
//
// ═══ QUÉ MIDE ═══
//
// El circuito entero, y contra la base: cargar por pantalla → LEER LA FILA EN POSTGRES → recargar la
// página → el mismo dato. El paso del medio es el que importa: sin él sólo se probaría que React
// pintó lo que le acaban de tipear.
//
// El responsable NO es un texto: es una fila de `perfiles`. Se elige del desplegable y se compara el
// UUID guardado contra el que traía la opción — si alguien convirtiera el campo en texto libre,
// «Rodrigo», «R. Echegaray» y «rodri» serían tres responsables y este test se pondría rojo.
test('cliente: dirección, teléfono, email y responsable se guardan y se leen de la base', async ({ page }) => {
  test.setTimeout(240000)
  const sb = await conBase()
  await limpiar(sb)
  const nombre = `${MARCA} Cliente Relacion ${Date.now()}`
  // Colgada del nombre único del caso: «Alimentos del Sur» existe de verdad en la base (es parte
  // del nombre de La Estrella) y buscar por ahí devolvería dos filas.
  const razonSocial = `${nombre} Sociedad Anónima`

  try {
    await entrar(page)

    await page.goto('/clientes')
    await page.getByTestId('alta-cliente').locator('summary').click()
    await page.getByTestId('form-cliente').locator('input[name="nombre_comercial"]').fill(nombre)
    await page.getByTestId('form-cliente-enviar').click()
    await expect(page.getByTestId('form-cliente-ok')).toBeVisible({ timeout: 30000 })
    const { data: cliRaw } = await sb.from('clientes')
      .select('id, slug, razon_social').eq('nombre_comercial', nombre).single()
    const cli = laFila(cliRaw, 'el cliente recién creado')

    // LA RAZÓN SOCIAL NACE VACÍA (20/08/2026). El dueño pidió separar los dos conceptos y NO
    // inventar valores. El defecto que esto atrapa es el «arreglo» cómodo: copiarle el nombre
    // comercial a la razón social para que la ficha no muestre un hueco. Sería un dato fabricado
    // en el campo que termina en un contrato y en una factura, y encima parecería cargado.
    expect(cli.razon_social, 'la razón social no se deriva del nombre comercial').toBeNull()

    // ── CARGA ───────────────────────────────────────────────────────────────
    await page.goto(`/clientes/${cli.slug}`)
    await page.getByTestId('editar-cliente').locator('summary').click()
    const f = page.getByTestId('form-editar-cliente')
    await f.locator('input[name="razon_social"]').fill(razonSocial)
    await f.locator('input[name="direccion"]').fill('Av. Libertador 1234, Rivadavia, San Juan')
    await f.locator('input[name="telefono"]').fill('264 400 1111')
    await f.locator('input[name="email"]').fill('compras@ejemplo.com')

    // La primera opción es «sin asignar»; la segunda es una persona real del OS.
    const sel = f.locator('select[name="responsable_id"]')
    const opcion = sel.locator('option').nth(1)
    const idResponsable = await opcion.getAttribute('value')
    const nombreResponsable = (await opcion.textContent())?.trim() ?? ''
    expect(idResponsable, 'tiene que haber al menos una persona en el OS para asignar').toBeTruthy()
    await sel.selectOption(idResponsable as string)

    await page.getByTestId('form-editar-cliente-enviar').click()
    await expect(page.getByTestId('form-editar-cliente-ok')).toBeVisible({ timeout: 30000 })

    // ── LA EVIDENCIA ES LA FILA EN LA BASE ──────────────────────────────────
    const { data: guardadoRaw } = await sb.from('clientes')
      .select('nombre_comercial, razon_social, direccion, telefono, email, responsable_id')
      .eq('id', cli.id).single()
    const guardado = laFila(guardadoRaw, 'el cliente con su ficha cargada')
    // LOS DOS NOMBRES CONVIVEN Y NO SE PISAN: cargar el legal no puede cambiar con qué nombre la
    // empresa llama al cliente, que es el que arma su dirección y el que sale en el portafolio.
    expect(guardado.razon_social).toBe(razonSocial)
    expect(guardado.nombre_comercial, 'guardar la razón social pisó el nombre comercial').toBe(nombre)
    expect(guardado.direccion).toBe('Av. Libertador 1234, Rivadavia, San Juan')
    expect(guardado.telefono).toBe('264 400 1111')
    expect(guardado.email).toBe('compras@ejemplo.com')
    expect(guardado.responsable_id, 'el responsable es una fila de perfiles, no un texto')
      .toBe(idResponsable)

    // ── Y SOBREVIVE A LA RECARGA: se LEE del servidor, no del navegador ─────
    await page.reload()
    const info = page.getByTestId('cliente-informacion')
    await expect(info, 'la ficha tiene que mostrar los dos nombres, no uno').toContainText(razonSocial)
    await expect(info).toContainText(nombre)
    await expect(page.getByText('Av. Libertador 1234, Rivadavia, San Juan')).toBeVisible()
    await expect(page.getByText('264 400 1111')).toBeVisible()
    await expect(page.getByRole('link', { name: 'compras@ejemplo.com' }))
      .toHaveAttribute('href', 'mailto:compras@ejemplo.com')
    // El nombre del responsable NO está guardado en `clientes`: sale del join de `cliente_panel`
    // contra `perfiles`. Si la vista dejara de traerlo, acá se vería «sin cargar».
    await expect(page.getByText(nombreResponsable).first()).toBeVisible()

    // ── Y LA LISTA NO LO REPITE (19/08/2026) ───────────────────────────────
    //
    // El dueño: *"Quiero CLIENTE | OBRAS. Nada más para el MVP. Eliminar del listado: Responsable,
    // Contratado, Costo real, Restricciones, Documentos, CUIT como subtítulo permanente."* El
    // responsable no se perdió —se acaba de leer arriba, en el record—: dejó de ocupar ancho en una
    // lista que existe para ENCONTRAR Y ABRIR un cliente. Este test defiende esa decisión: si
    // alguien vuelve a colgar columnas del listado, acá se pone rojo.
    await page.goto('/clientes')
    // SE BUSCA POR LOS DOS NOMBRES. El que teclea la razón social la tiene delante en una factura
    // o en un contrato; si la búsqueda sólo mirara el comercial, no encontraría nada y el dato
    // recién cargado sería inútil. La fila que aparece sigue mostrando el nombre comercial.
    await page.getByTestId('buscar-cliente').fill('Sociedad Anónima')
    await expect(page.getByTestId('clientes-tabla').locator('tbody tr')).toHaveCount(1)
    await expect(page.getByTestId('clientes-tabla')).toContainText(nombre)
    await page.getByTestId('buscar-cliente').fill('')

    const fila = page.getByTestId('clientes-tabla').locator('tr', { hasText: nombre })
    await expect(fila).not.toContainText(nombreResponsable)
    // Lo único que la fila lleva además del nombre es el conteo de obras: este cliente no tiene
    // ninguna, y por eso el guion.
    await expect(fila).toContainText('—')

    // ── UN EMAIL MAL ESCRITO NO LLEGA A LA BASE ────────────────────────────
    //
    // Dos cerraduras, y las dos importan: el campo es `type="email"`, así que el navegador ni siquiera
    // manda el formulario —por eso acá no aparece el error del servidor, y eso ES el comportamiento
    // correcto—, y detrás está Zod, que es la que vale cuando el pedido no viene de un navegador.
    // Lo que se mide es el EFECTO: el email guardado sigue siendo el bueno.
    await page.goto(`/clientes/${cli.slug}`)
    await page.getByTestId('editar-cliente').locator('summary').click()
    const campoEmail = page.getByTestId('form-editar-cliente').locator('input[name="email"]')
    await campoEmail.fill('esto no es un email')
    await page.getByTestId('form-editar-cliente-enviar').click()
    expect(await campoEmail.evaluate((el: HTMLInputElement) => el.checkValidity()),
      'el navegador tiene que marcar el campo como inválido').toBe(false)
    const { data: intacto } = await sb.from('clientes').select('email').eq('id', cli.id).single()
    expect(laFila(intacto, 'el cliente que no se debía tocar').email).toBe('compras@ejemplo.com')
  } finally {
    await limpiar(sb)
    await sb.auth.signOut()
  }
})
