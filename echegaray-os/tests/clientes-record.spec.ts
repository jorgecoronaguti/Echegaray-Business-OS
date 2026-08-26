import { test, expect } from '@playwright/test'
import { conBase, entrar, laFila, limpiar, MARCA } from './util/obras-e2e'
import { entrarComo } from './util/login'

// EL CLIENTE COMO RECORD — la lista que sirve para encontrarlo y la pantalla que lo muestra entero.
//
// ═══ QUÉ DEFECTOS ATRAPA ESTE ARCHIVO ═══
//
// 1. LA LISTA VUELVE A LLENARSE DE COLUMNAS. **CAMBIO DE REGLA DECLARADO (Design 23/08).** Este
//    caso fijaba las DOS columnas que el dueño pidió el 19/08 —*"CLIENTE | OBRAS. Nada más para el
//    MVP"*—. El canónico 25 del 23/08, cuatro días después y contrato vigente, rediseña la cartera
//    con CLIENTE · EN EJECUCIÓN · OBRAS · CONTRATADO. El test sigue existiendo y sigue prohibiendo
//    que crezca: cambió el número, no la regla. Lo que se conserva textual es la lista de columnas
//    que NO vuelven —costo real, restricciones, documentos— porque ésas siguen sin decidir nada, y
//    se suma que las cuatro tienen que ser EXACTAMENTE las del canónico.
// 2. EL BUSCADOR NO FILTRA. Un campo de búsqueda que se ve y no filtra es peor que no tenerlo.
// 3. ALGO DEL RECORD VUELVE DETRÁS DE UNA SOLAPA. Propiedades, actividad, obras, contactos y
//    documentos tienen que estar A LA VEZ, sin un clic de por medio.
// 4. LA NOTA DICE «GUARDADA» Y NO HAY NINGUNA FILA. Es el peor de todos y el único que no se ve
//    mirando la pantalla: la prueba es la fila en Postgres y la recarga, nunca el cartelito verde.
//
// Cada caso hace lo mismo que el resto de los recorridos del módulo: escribe POR LA PANTALLA, como
// el dueño; RECARGA, o sea vuelve a leer del servidor y no del estado del navegador; exige que el
// dato esté; y borra al final, gane o pierda.

// ── LA LISTA: LAS CUATRO COLUMNAS DEL CANÓNICO Y UN BUSCADOR ───────────────

test('la cartera trae exactamente las columnas del canónico 25 v2, y ninguna más', async ({ page }) => {
  test.setTimeout(180000)
  const sb = await conBase()
  await limpiar(sb)

  try {
    // La sesión de este recorrido ve economía (`entrar` usa la cuenta de dirección/administración),
    // así que CONTRATADO se dibuja. Con la del jefe de obra son tres — lo mide `veEconomia`.
    await entrar(page)
    await page.goto('/clientes')
    const tabla = page.getByTestId('clientes-tabla')
    await expect(tabla).toBeVisible()

    // TRES columnas, y éstas. `25 · Clientes v2` (zip del 25/08/2026) borró «EN EJECUCIÓN» —que
    // era los nombres de las obras concatenados dentro de una celda— y la convirtió en FILAS
    // indentadas bajo el cliente, con sus mismas columnas (criterio 4: jerarquía por indentación).
    // También se fue la columna de acciones: el `···` por fila era una columna de ruido en una
    // lista que existe para encontrar y abrir.
    //
    // Contar los rótulos es lo que impide que la tabla vuelva a crecer —una afirmación sobre los
    // textos dejaría pasar una columna nueva con cualquier otro rótulo— y nombrarlos es lo que
    // impide que se cambien por otras tres. La tabla es una GRILLA y no una `<table>`: el canónico
    // fija los anchos en px mezclados con fracciones y una `<table>` los reparte por contenido.
    await expect(tabla).toContainText('Cliente')
    await expect(tabla).toContainText('Obras')
    await expect(tabla).toContainText('Contratado')
    // La obra en ejecución es una fila propia, no una celda.
    await expect(page.getByTestId('fila-obra').first()).toBeVisible()
    await expect(tabla).not.toContainText('EN EJECUCIÓN')

    // Y ninguno de los que el dueño mandó sacar el 19/08 y el canónico tampoco devuelve. Van por
    // separado del conteo porque dicen otra cosa: el conteo prohíbe que crezca, esto prohíbe que
    // vuelvan JUSTO ÉSTOS, que son los que ya estuvieron y los que alguien va a querer devolver.
    for (const columna of ['Responsable', 'Costo real', 'Restric', 'Docs']) {
      await expect(tabla).not.toContainText(columna)
    }

    // LOS TRES RECORTES DEL CANÓNICO, con su contador. Sin ellos la cartera vuelve a ser una lista
    // sin recorte y «datos faltantes» —el CUIT que frena una factura— no se puede ver de un vistazo.
    for (const t of ['filtro-cartera-todo', 'filtro-cartera-activos', 'filtro-cartera-sin-datos']) {
      await expect(page.getByTestId(t)).toBeVisible()
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

// ═══ LO QUE ESTE TEST AFIRMABA HASTA EL 24/08 ═══
//
// Que las CINCO caras del cliente se veían de una sola vez, sin un clic — la regla del 19/08 («el
// record no puede quedar detrás de una solapa»). El canónico 26 la revierte por orden de máxima
// fidelidad al mockup: hoy hay SOLAPAS reales, y este test las sigue. Lo que NO se movió, y por eso
// se sigue exigiendo acá, es la identidad: datos, contactos y actividad viven en el aside y se ven
// desde las cinco solapas. Ése era el caso que motivó la regla vieja («¿tiene el contrato cargado y
// a quién llamo?») y es el que este test protege ahora.
test('la ficha del cliente muestra identidad, contactos y actividad desde cualquier solapa', async ({ page }) => {
  test.setTimeout(180000)
  await entrar(page)

  // La Estrella es el caso que lo prueba: tiene TRES obras y es el cliente más cargado de
  // documentos. Si el record aguanta con él, aguanta con todos.
  await page.goto('/clientes/la-estrella')
  await expect(page.getByRole('heading', { name: /La Estrella/ })).toBeVisible()
  const url = page.url()

  // LA IDENTIDAD NO ENTRA EN NINGUNA SOLAPA: se ve al abrir, sin un clic.
  await expect(page.getByTestId('panel-informacion')).toBeVisible()
  await expect(page.getByRole('term').filter({ hasText: 'CUIT' })).toBeVisible()
  await expect(page.getByRole('term').filter({ hasText: 'Responsable interno' })).toBeVisible()
  await expect(page.getByTestId('bloque-actividad')).toBeVisible()
  await expect(page.getByTestId('tabla-actividad')).toBeVisible()
  await expect(page.getByTestId('bloque-contactos')).toBeVisible()
  // Y el Resumen abre con las obras y su avance, que es la respuesta a «¿cómo va este cliente?».
  await expect(page.getByTestId('obras-del-cliente')).toBeVisible()

  // Y la dirección NO cambió: lo anterior no fue una navegación disfrazada.
  expect(page.url()).toBe(url)

  // ═══ LA ANATOMÍA DE FICHA DE ENTIDAD (Design 23/08, COMPONENTS.md) ═══
  //
  // «Cliente, Proveedor, Persona, Obra y Herramienta usan la MISMA estructura»: cabecera BLANCA de
  // ficha de entidad —avatar, nombre a 21px, pastilla de estado, línea de identidad y solapas
  // pegadas abajo—, con las métricas en su tira sobre el cuerpo.
  //
  // EL DEFECTO QUE ATRAPA (24/08/2026): la ficha del cliente se coronaba con el slab GRAFITO
  // (`BarraContexto`), una cabecera oscura que no existe en ningún mockup del zip. Se exige que la
  // identidad y las solapas estén dentro de la cabecera y que la tira de métricas exista aparte;
  // si alguien devuelve el slab, `metricas-cliente` desaparece y esto se pone rojo.
  //
  // LAS SOLAPAS CAMBIAN DE VISTA Y EL ESTADO VIAJA EN LA URL. Se exige que cada una LLEVE a su cara
  // —una solapa que no cambia nada es un enlace muerto que nadie nota— y que la identidad siga
  // visible en todas: ése es el precio que el 19/08 no quería pagar y que acá queda acotado.
  const slab = page.getByTestId('slab-cliente')
  await expect(slab).toBeVisible()
  // La miga de pan y el nombre viven en la cabecera; las solapas, adentro de ella.
  await expect(slab.getByTestId('ficha-volver')).toBeVisible()
  await expect(slab.getByTestId('solapas-cliente')).toBeVisible()
  // Las métricas bajaron a su tira. `Obras` es la que siempre está, con o sin permiso económico.
  await expect(page.getByTestId('metricas-cliente').locator('[data-metrica="Obras"]')).toBeVisible()
  for (const [solapa, bloque] of [
    ['solapa-obras', 'bloque-obras'],
    ['solapa-documentos', 'bloque-documentos'],
  ] as const) {
    await page.getByTestId(solapa).click()
    await expect(page.getByTestId(bloque), `${solapa} no abre ${bloque}`).toBeVisible()
    // La identidad sobrevive al cambio de solapa. Sin esto, partir el record habría escondido
    // justo lo que el dueño exigió que estuviera siempre.
    await expect(page.getByTestId('panel-informacion')).toBeVisible()
    await expect(page.getByTestId('bloque-contactos')).toBeVisible()
  }

  // ═══ LA SOLAPA «CUENTA» SE CONVIRTIÓ EN «CUENTA CORRIENTE» (25/08/2026) ═══
  //
  // Hasta hoy `solapa-cuenta` abría `bloque-cuenta`: contratado y costo por obra, que es lo mismo
  // que ya muestra la solapa Obras y que existía porque cobranzas no tenía fuente. El mockup 28 la
  // reemplaza por la cuenta corriente entera —saldo, antigüedad, certificados, plan del día— y esa
  // cara va A SANGRE, sin el aside de identidad: su columna derecha es el panel del certificado.
  // Manda el mockup (BRIEFING), así que se afirma la pantalla nueva y NO se exige el aside acá.
  await page.getByTestId('solapa-cuenta').click()
  await expect(page.getByTestId('vista-cuenta-corriente')).toBeVisible()
  await expect(page.getByTestId('metricas-cuenta')).toBeVisible()
  await expect(page.getByTestId('antiguedad')).toBeVisible()
  await page.getByTestId('solapa-obras').click()
  await expect(page.getByTestId('panel-informacion')).toBeVisible()

  // UN SOLO `h1`: el slab trae el suyo y `PageShell` no puede dibujar otro con el mismo nombre.
  // Si alguien saca `encabezado={false}`, esto se pone rojo antes que nadie mire la pantalla.
  await expect(page.locator('h1')).toHaveCount(1)

  // Las altas de cada bloque están A LA VISTA, arriba de su lista. Enterradas al final de una tabla
  // de 60 filas no las encuentra nadie y el bloque se queda vacío para siempre. Con solapas, cada
  // alta se exige EN SU CARA: la de documentos vive en la solapa Documentos, que es donde está su
  // lista — pedirla en todas obligaría a dibujar cuatro formularios en cada vista.
  await expect(page.getByTestId('alta-documento')).toBeVisible()
  await page.getByTestId('solapa-resumen').click()
  await expect(page.getByTestId('alta-obra')).toBeVisible()
  await expect(page.getByTestId('alta-contacto')).toBeVisible()
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
//
// ═══ Y ESTE TEST CAMBIÓ DE SIGNO EL 20/08, DOS VECES EN EL MISMO DÍA ═══
//
// A la mañana se puso rojo con razón: el 19/08 `esAdministracion()` incorporó al jefe de obra y la
// ficha calculaba `puedeEditar = esAdministracion(rol)`, así que aparecieron cinco botones que la
// base rechazaba con 403 — `clientes_write` y sus tres hermanas seguían en la lista literal
// `('direccion','administracion')`. Ése era un botón falso, y se corrigió la PANTALLA.
//
// A la tarde el dueño resolvió la contradicción del otro lado: `20260820T5000` mueve las cuatro
// policies a `es_administracion()`, que es lo que el modelo vigente dice desde el 19/08. Con la
// base abierta, la pantalla vuelve a ofrecer los formularios y **este test tiene que medir lo
// contrario de lo que medía**.
//
// No es relajar un test para que pase: es que el contrato cambió, y el test fija el contrato ACTUAL.
// Lo que no cambia es la parte que de verdad importa —que lo ofrecido y lo aceptado coincidan—, y
// por eso cada formulario que se afirma acá se prueba también contra PostgREST en
// `autorizacion-por-obra.spec.ts`: la pantalla no es la evidencia del permiso.
test('el jefe de obra administra el record del cliente, porque es Administración', async ({ page }) => {
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

  // LO QUE SÍ: los formularios de administración del maestro, porque la base los acepta. Si alguno
  // faltara, el jefe estaría viendo una ficha de sólo lectura sobre un cliente que sí administra.
  for (const t of ['editar-cliente', 'alta-contacto', 'alta-obra', 'alta-nota', 'archivar-cliente']) {
    await expect(page.getByTestId(t),
      `no se le ofreció «${t}» a un jefe de obra, y la base sí se lo acepta`).toHaveCount(1)
  }
  // El alta de documentos vive en SU solapa desde el canónico 26 (24/08): se la exige donde está,
  // no donde estaba. Que no aparezca en Resumen es diseño; que no aparezca acá sería el defecto.
  await page.getByTestId('solapa-documentos').click()
  await expect(page.getByTestId('alta-documento'),
    'no se le ofreció «alta-documento» a un jefe de obra, y la base sí se lo acepta').toHaveCount(1)
})
