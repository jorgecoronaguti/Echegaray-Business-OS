import { test, expect } from '@playwright/test'
import { conBase, entrar, laFila, limpiar, MARCA } from './util/obras-e2e'
import { entrarComo } from './util/login'

// EL CLIENTE COMO RECORD — la lista que sirve para encontrarlo y la pantalla que lo muestra entero.
//
// ═══ QUÉ DEFECTOS ATRAPA ESTE ARCHIVO ═══
//
// 1. LA LISTA VUELVE A LLENARSE DE COLUMNAS. Tenía siete (responsable, contratado, costo real,
//    restricciones, documentos, CUIT de subtítulo) y ninguna decidía nada: nadie elige a quién
//    llamar por su costo real acumulado. El dueño pidió CLIENTE | OBRAS. Es la clase de decisión que
//    se revierte sola en tres semanas «porque el dato ya lo teníamos», y sin un test que la defienda
//    nadie se entera.
// 2. EL BUSCADOR NO FILTRA. Un campo de búsqueda que se ve y no filtra es peor que no tenerlo.
// 3. ALGO DEL RECORD VUELVE DETRÁS DE UNA SOLAPA. Propiedades, actividad, obras, contactos y
//    documentos tienen que estar A LA VEZ, sin un clic de por medio.
// 4. LA NOTA DICE «GUARDADA» Y NO HAY NINGUNA FILA. Es el peor de todos y el único que no se ve
//    mirando la pantalla: la prueba es la fila en Postgres y la recarga, nunca el cartelito verde.
//
// Cada caso hace lo mismo que el resto de los recorridos del módulo: escribe POR LA PANTALLA, como
// el dueño; RECARGA, o sea vuelve a leer del servidor y no del estado del navegador; exige que el
// dato esté; y borra al final, gane o pierda.

// ── LA LISTA: DOS COLUMNAS Y UN BUSCADOR ───────────────────────────────────

test('la lista de clientes trae el nombre y cuántas obras tiene, y nada más', async ({ page }) => {
  test.setTimeout(180000)
  const sb = await conBase()
  await limpiar(sb)

  try {
    await entrar(page)
    await page.goto('/clientes')
    const tabla = page.getByTestId('clientes-tabla')
    await expect(tabla).toBeVisible()

    // DOS columnas. Contar los encabezados es lo que impide que vuelva a crecer: una afirmación
    // sobre los textos dejaría pasar una columna nueva con cualquier otro rótulo.
    const encabezados = tabla.locator('thead th')
    await expect(encabezados).toHaveCount(2)
    await expect(encabezados.nth(0)).toHaveText('Cliente')
    await expect(encabezados.nth(1)).toHaveText('Obras')

    // Y ninguno de los que el dueño mandó sacar. Van por separado del conteo porque dicen otra cosa:
    // el conteo prohíbe que crezca, esto prohíbe que vuelvan JUSTO ESTOS, que son los que ya
    // estuvieron y los que alguien va a querer devolver.
    for (const columna of ['Responsable', 'Contratado', 'Costo real', 'Restric', 'Docs']) {
      await expect(tabla).not.toContainText(columna)
    }
  } finally {
    await limpiar(sb)
    await sb.auth.signOut()
  }
})

test('el buscador deja sólo los clientes que se llaman así', async ({ page }) => {
  test.setTimeout(180000)
  const sb = await conBase()
  await limpiar(sb)
  // Dos clientes propios, con nombres que no comparten ninguna palabra: el test no depende de qué
  // clientes reales existan hoy en la base, que cambian.
  const gaviota = `${MARCA} Gaviota ${Date.now()}`
  const petunia = `${MARCA} Petunia ${Date.now()}`

  try {
    await entrar(page)
    for (const nombre of [gaviota, petunia]) {
      // EL ALTA VIVE EN LA URL desde el Design Handoff V2: la primaria `+ Nuevo cliente` va al lado
      // del buscador y un `<summary>` tiene que ser el primer hijo de su `<details>`, así que ese
      // botón no podía seguir siendo el control que despliega el formulario. Se navega, no se
      // despliega — y de paso la dirección con el alta abierta se puede compartir.
      await page.goto('/clientes?nuevo=1')
      await page.getByTestId('form-cliente').locator('input[name="nombre_comercial"]').fill(nombre)
      await page.getByTestId('form-cliente-enviar').click()
      await expect(page.getByTestId('form-cliente-ok')).toBeVisible({ timeout: 30000 })
    }

    await page.goto('/clientes')
    const tabla = page.getByTestId('clientes-tabla')
    await expect(tabla).toContainText(gaviota)
    await expect(tabla).toContainText(petunia)

    // EL FILTRO. Sin acentos y sin mayúsculas: nadie escribe los acentos cuando busca, y una
    // búsqueda sensible a mayúsculas no encuentra nada la mitad de las veces.
    await page.getByTestId('buscar-cliente').fill('gaviota')
    await expect(tabla).toContainText(gaviota)
    await expect(tabla).not.toContainText(petunia)

    // Y cuando no hay ninguno, lo dice en vez de dejar una tabla vacía sin encabezado ni explicación.
    await page.getByTestId('buscar-cliente').fill('zzzz-no-existe-ningun-cliente-asi')
    await expect(page.getByTestId('sin-resultados')).toBeVisible()

    // Vaciar el campo devuelve la lista entera: filtrar no puede ser un camino de ida.
    await page.getByTestId('buscar-cliente').fill('')
    await expect(tabla).toContainText(petunia)
  } finally {
    await limpiar(sb)
    await sb.auth.signOut()
  }
})

// ── EL RECORD: LAS CINCO CARAS A LA VEZ ────────────────────────────────────

test('el record del cliente muestra propiedades, actividad, obras, contactos y documentos sin navegar', async ({ page }) => {
  test.setTimeout(180000)
  await entrar(page)

  // La Estrella es el caso que lo prueba: tiene TRES obras y es el cliente más cargado de
  // documentos. Si el record aguanta con él, aguanta con todos.
  await page.goto('/clientes/la-estrella')
  await expect(page.getByRole('heading', { name: /La Estrella/ })).toBeVisible()
  const url = page.url()

  // LAS CINCO CARAS, TODAS A LA VEZ. Ni un clic entre una y otra.
  await expect(page.getByTestId('panel-informacion')).toBeVisible()
  await expect(page.getByRole('term').filter({ hasText: 'CUIT' })).toBeVisible()
  await expect(page.getByRole('term').filter({ hasText: 'Responsable interno' })).toBeVisible()
  await expect(page.getByTestId('bloque-actividad')).toBeVisible()
  await expect(page.getByTestId('tabla-actividad')).toBeVisible()
  await expect(page.getByTestId('obras-del-cliente')).toBeVisible()
  await expect(page.getByTestId('bloque-contactos')).toBeVisible()
  await expect(page.getByTestId('bloque-documentos')).toBeVisible()

  // Y la dirección NO cambió: lo anterior no fue una navegación disfrazada.
  expect(page.url()).toBe(url)

  // Las altas de cada bloque están A LA VISTA, arriba de su lista. Enterradas al final de una tabla
  // de 60 filas no las encuentra nadie y el bloque se queda vacío para siempre.
  await expect(page.getByTestId('alta-obra')).toBeVisible()
  await expect(page.getByTestId('alta-contacto')).toBeVisible()
  await expect(page.getByTestId('alta-documento')).toBeVisible()
  await expect(page.getByTestId('alta-nota')).toBeVisible()

  // ═══ EL RECORD ENTRA EN UN TELÉFONO SIN CORRERSE DE COSTADO ═══
  //
  // El dueño lo pidió explícitamente. Se mide contra el ancho del documento y no contra el de una
  // tabla: cada tabla se desplaza sola dentro de su bloque, y lo que no puede pasar es que la
  // PÁGINA entera se corra —ahí se pierde el menú, el título y la mitad de las propiedades—.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.getByTestId('panel-informacion')).toBeVisible()
  const desborde = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(desborde, `la página se desplaza ${desborde}px de costado en un teléfono`).toBeLessThanOrEqual(1)
})

// ── LA NOTA MANUAL: LA ÚNICA ESCRITURA DE ACTIVIDAD ────────────────────────
//
// ═══ POR QUÉ ESTE TEST FALLA —Y NO SE SALTEA— SI LA MIGRACIÓN NO ESTÁ APLICADA ═══
//
// `20260819T2000_la_nota_manual_del_cliente` la escribió un agente y la aplica quien integra. Un
// `test.skip()` sobre esa condición dejaría la suite en verde con la capacidad entera sin probar, y
// verde es exactamente la señal que dice «esto anda». Un rojo que nombra la migración que falta es
// la información correcta: no hay defecto en el código, hay un paso pendiente en la base.

test('nota manual: se escribe, queda en Postgres y sigue ahí después de recargar', async ({ page }) => {
  test.setTimeout(240000)
  const sb = await conBase()

  // LA SONDA VA PRIMERO. Sin esto, el test fallaría más adelante con un mensaje del formulario y
  // habría que leer el código para entender que lo que falta es una migración.
  const sonda = await sb.from('cliente_nota').select('id').limit(1)
  expect(
    sonda.error,
    'FALTA APLICAR EN LA BASE LA MIGRACIÓN supabase/migrations/20260819T2000_la_nota_manual_del_cliente.sql. '
    + 'Sin ella no existe public.cliente_nota y la capacidad de notas no se puede probar. '
    + `Postgres/PostgREST contestó: ${sonda.error?.code ?? ''} ${sonda.error?.message ?? ''}`,
  ).toBeNull()

  await limpiar(sb)
  const nombre = `${MARCA} Cliente nota ${Date.now()}`
  const texto = `${MARCA} Llamé al arquitecto: la certificación de agosto entra recién en septiembre`

  try {
    await entrar(page)
    await page.goto('/clientes?nuevo=1')
    await page.getByTestId('form-cliente').locator('input[name="nombre_comercial"]').fill(nombre)
    await page.getByTestId('form-cliente-enviar').click()
    await expect(page.getByTestId('form-cliente-ok')).toBeVisible({ timeout: 30000 })

    const { data: cliRaw } = await sb.from('clientes').select('id, slug').eq('nombre_comercial', nombre).single()
    const cli = laFila(cliRaw, 'el cliente recién creado')

    // ── SE ESCRIBE POR LA PANTALLA, COMO EL DUEÑO ───────────────────────────
    await page.goto(`/clientes/${cli.slug}`)
    await page.getByTestId('alta-nota').locator('summary').click()
    await page.getByTestId('form-nota').locator('textarea[name="texto"]').fill(texto)
    await page.getByTestId('form-nota-enviar').click()
    await expect(page.getByTestId('form-nota-ok')).toBeVisible({ timeout: 30000 })

    // ── LA EVIDENCIA ES LA FILA EN POSTGRES, NO EL CARTELITO VERDE ─────────
    const { data: notaRaw } = await sb.from('cliente_nota')
      .select('id, texto, autor_id, creado_en').eq('cliente_id', cli.id).single()
    const nota = laFila(notaRaw, 'la nota recién escrita')
    expect(nota.texto).toBe(texto)
    expect(nota.creado_en, 'sin fecha la nota no puede entrar a la línea de tiempo').not.toBeNull()
    // LA FIRMA NO ES FALSIFICABLE: sale de `auth.uid()` por DEFAULT y la policy exige que coincida
    // con la sesión. El formulario no manda ningún autor — si algún día lo mandara, esto seguiría
    // pasando y por eso además se compara contra el usuario de la sesión.
    const { data: sesion } = await sb.auth.getUser()
    expect(nota.autor_id, 'la nota tiene que quedar firmada por quien la escribió')
      .toBe(sesion.user?.id)

    // ── Y SOBREVIVE A LA RECARGA: se LEE del servidor, no del navegador ────
    await page.reload()
    const actividad = page.getByTestId('tabla-actividad')
    await expect(actividad).toContainText(texto)
    // Con su firma: una nota sin autor visible no se distingue de un evento derivado del sistema.
    await expect(actividad).toContainText('Nota de')

    // ── UNA NOTA VACÍA NO ENTRA, Y LA PANTALLA LO DICE ─────────────────────
    //
    // Dos cerraduras y las dos importan: el `required` del navegador, y Zod detrás —que es la que
    // vale cuando el pedido no viene de un navegador—. Lo que se mide es el EFECTO: sigue habiendo
    // UNA sola nota, no dos.
    await page.getByTestId('alta-nota').locator('summary').click()
    const campo = page.getByTestId('form-nota').locator('textarea[name="texto"]')
    await campo.fill('   ')
    await page.getByTestId('form-nota-enviar').click()
    await expect(page.getByTestId('form-nota-error')).toBeVisible({ timeout: 30000 })
    const { count } = await sb.from('cliente_nota')
      .select('id', { count: 'exact', head: true }).eq('cliente_id', cli.id)
    expect(count, 'una nota en blanco no puede haber entrado').toBe(1)
  } finally {
    await limpiar(sb)
    await sb.auth.signOut()
  }
})


// ═══ EL RECORD VISTO POR UN JEFE DE OBRA — LA MITAD QUE NO SE MIRÓ (19/08/2026) ═══
//
// Quien construyó el record declaró que `puedeEditar` estaba conservado en los cinco bloques y
// `+ Nota` gateado, pero que su evidencia era LECTURA DE CÓDIGO, no una sesión real. Un prop que se
// pasa bien y un componente que lo ignora se ven idénticos en el diff y distinto en la pantalla.
//
// El dueño abrió la ficha del cliente al nivel Obras a propósito —*"Un usuario Obras debe poder
// consultar clientes, contactos…"*— pero CONSULTAR no es ADMINISTRAR. La cerradura sigue siendo la
// RLS, que rechaza la escritura; esto mide que no se le OFREZCA un formulario que la base va a
// rechazar, que es lo que el dueño llama un botón falso.
test('el jefe de obra lee el record del cliente, y no se le ofrece editarlo', async ({ page }) => {
  test.setTimeout(120000)
  await entrarComo(page, 'qa.jefe.obra@ecsas.com.ar', 'TestJefe123!')

  const sb = await conBase()
  const { data } = await sb.from('clientes').select('slug').not('slug', 'is', null).limit(1).single()
  const slug = laFila(data, 'un cliente cualquiera').slug as string
  await sb.auth.signOut()

  await page.goto(`/clientes/${slug}`)

  // LO QUE SÍ: el record se lee entero. Sin esto, una pantalla rota pasaría el test de abajo.
  await expect(page.getByTestId('cliente-informacion'),
    'el jefe de obra no puede leer la ficha del cliente de su obra').toBeVisible()

  // LO QUE NO: ni un formulario de escritura.
  for (const t of ['editar-cliente', 'carpeta-drive', 'alta-contacto', 'alta-obra', 'alta-nota',
    'alta-documento', 'archivar-cliente']) {
    await expect(page.getByTestId(t), `se le ofreció «${t}» a un jefe de obra`).toHaveCount(0)
  }
})
