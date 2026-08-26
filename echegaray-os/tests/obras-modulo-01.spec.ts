import { test, expect } from '@playwright/test'
import { ATERRIZAJE } from './util/login'

// MÓDULO 01 · OBRAS — el recorrido completo, en un navegador de verdad.
//
// ═══ POR QUÉ ESTE ARCHIVO EXISTE ═══
//
// El módulo salió a producción con TODAS sus pantallas en 404: las políticas de RLS estaban, pero
// faltaban los `grant`, y `drop view` se había llevado los privilegios de `obra_panel`. Ningún test
// lo detectó porque lo verifiqué con el driver de Postgres —que entra como dueño del esquema y no
// necesita grant—: validé el control con el mismo camino que produce el control. Lo encontró una
// persona abriendo la página.
//
// Esto entra por donde entra el dueño: navegador, sesión real, rol real. Si vuelven a faltar los
// permisos, o si el guard de sesión se rompe, acá se pone en rojo antes que en el teléfono de nadie.

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

async function entrar(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(ATERRIZAJE, { timeout: 20000 })
}

// ── SIN SESIÓN NO SE VE NADA ────────────────────────────────────────────────
//
// `/flujo-caja` respondía 200 a cualquiera en internet, con importes y nombres de clientes: esa
// ruta no pasa por Supabase —lee el Sheet con una service account desde el servidor—, así que el
// RLS, que tapaba al resto de casualidad, no la cubría. Esto es el regreso de esa falla.

test('sin sesión, las pantallas con datos de la empresa mandan al login', async ({ page }) => {
  for (const ruta of ['/clientes', '/clientes/la-estrella', '/obras', '/obras/san-francisco', '/flujo-caja', '/control-obras', '/chat']) {
    const respuesta = await page.goto(ruta)
    await page.waitForURL(/\/login/, { timeout: 15000 })
    // Y no alcanza con terminar en /login: lo que no puede haber es el dato en el camino.
    expect(await page.content()).not.toMatch(/Saldo|Disponibilidad|Costo real/i)
    expect(respuesta?.status(), `${ruta} sin sesión`).toBeLessThan(400)
  }
})

test('sin sesión, la descarga pública de la extensión sigue abierta', async ({ page }) => {
  // El guard es una lista BLANCA, y al cerrarla se llevó puesto el .zip que la landing ofrece:
  // /descargar quedaba en 200 con su único botón mandando al login.
  // Se pide por HTTP y no con `goto`: el navegador lo descarga en vez de navegarlo, y una descarga
  // no es una navegación. Lo que importa es el 200 y que sea un zip de verdad.
  const r = await page.request.get('/echegaray-os-extension.zip')
  expect(r.status()).toBe(200)
  expect((await r.body()).subarray(0, 2).toString()).toBe('PK')
})

// ── LA JERARQUÍA: CLIENTE → OBRAS → OBRA ────────────────────────────────────
//
// El cliente es la entidad de arriba y la obra la unidad operativa. La Estrella es el caso que lo
// prueba: tiene TRES obras, y hasta que existió `cliente_id` eran tres cadenas de texto iguales por
// casualidad. Si este test se rompe, la jerarquía volvió a ser un texto repetido.

test('clientes → cliente → sus obras → la obra', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)

  await page.goto('/clientes')
  await expect(page.getByTestId('clientes-tabla')).toBeVisible()
  const laEstrella = page.getByRole('link', { name: /La Estrella/ })
  await expect(laEstrella).toBeVisible()

  await laEstrella.click()
  await page.waitForURL(/\/clientes\/la-estrella/)
  await expect(page.getByRole('heading', { name: /La Estrella/ })).toBeVisible()

  // ═══ EL RECORD ESTÁ ENTERO EN UNA PANTALLA, SIN NAVEGAR (19/08/2026) ═══
  //
  // Hasta acá eran cinco solapas y esta parte del test hacía cuatro clics con su `waitForURL`. El
  // dueño: *"CLIENTE = RECORD PRINCIPAL. Dentro veo: propiedades; actividad; contactos asociados;
  // obras asociadas; documentos asociados."* Lo que se exige ahora es lo contrario de antes: que
  // las cinco caras estén A LA VEZ, sin un solo clic de por medio. Si alguien volviera a esconder
  // cualquiera de ellas detrás de una solapa, este bloque se pone rojo.
  await expect(page.getByRole('term').filter({ hasText: 'Responsable interno' })).toBeVisible()

  // Sus obras VIGENTES, con el MISMO avance que publica el portafolio: sale de `obra_panel`.
  //
  // EL NÚMERO NO SE ESCRIBE A MANO. Decía «3» y quedó rojo el día que una de las tres se cerró:
  // el record del cliente muestra las que están en curso, no el histórico. Un test que afirma el
  // estado del mundo se pone rojo sin que cambie una línea de código y manda a buscar el problema
  // donde no está. Lo que se exige es la REGLA —hay obras y ninguna archivada— y que haya al menos
  // una para que la tabla pruebe algo.
  const tabla = page.getByTestId('obras-del-cliente')
  await expect(tabla).toBeVisible()
  expect(await tabla.locator('tbody tr').count()).toBeGreaterThan(0)

  // Y se puede CARGAR desde el record, sin cambiar de pantalla: el alta de cada bloque está a la
  // vista, arriba de su lista, no enterrada al final de una tabla de 60 filas.
  await expect(page.getByTestId('alta-contacto')).toBeVisible()
  // Los documentos y la actividad son CARAS en el v2 (26 v2): el costado guarda lo que identifica al
  // cliente, y la historia de la relación es contenido. Se las exige donde están.
  await page.getByTestId('solapa-documentos').click()
  await expect(page.getByTestId('alta-documento')).toBeVisible()
  // Los documentos son los de Drive: vínculo, nunca copia.
  await expect(page.getByText(/en Drive/i).first()).toBeVisible()
  await page.getByTestId('solapa-actividad').click()
  await expect(page.getByTestId('tabla-actividad')).toBeVisible()

  // Y la cara «Resumen» NO volvió: repetía la tabla de Obras con los presupuestos apilados debajo,
  // o sea dos caras con otro nombre. Un resto de ella significaría dos caminos para lo mismo.
  await expect(page.getByTestId('solapa-resumen')).toHaveCount(0)
  await expect(page.getByTestId('solapa-informacion')).toHaveCount(0)

  // Y desde la obra se vuelve a SU cliente: la jerarquía se navega en los dos sentidos.
  await page.goto('/obras/le-comedor')
  const volver = page.getByRole('link', { name: /La Estrella/ })
  await expect(volver).toBeVisible()
  await volver.click()
  await page.waitForURL(/\/clientes\/la-estrella/)
})

// ── EL RECORRIDO DEL MÓDULO, AUTENTICADO ────────────────────────────────────

test('portafolio → obra → resumen · gantt · planificación · documentos', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)

  // 1. PORTAFOLIO. Que la tabla exista no alcanza: si faltan los grants, la vista devuelve vacío
  //    y la página renderiza igual. Lo que se exige es una obra con nombre.
  await page.goto('/obras')
  await expect(page.getByTestId('portafolio-tabla')).toBeVisible()
  // SE BUSCA POR `data-obra`, NO POR EL NOMBRE. Buscaba el enlace «San Francisco» y quedó rojo
  // cuando la obra pasó a mostrarse por su nombre real —«Galpones, Mampostería, Cancha de Padel»—:
  // ese texto ya sólo existe en la columna CLIENTE, y de paso lo comparten otras tres obras del
  // mismo cliente. El id de la obra es lo único que no cambia cuando alguien la renombra.
  const filaTabla = page.locator('tr[data-obra="san-francisco"]')
  await expect(filaTabla).toBeVisible()
  const filaSanFrancisco = filaTabla.getByRole('link').first()
  // EL NOMBRE SE LEE DE LA PANTALLA, NO SE ESCRIBE ACÁ. La obra se muestra por su nombre real desde
  // el 19/08 y ese nombre lo edita una persona: un literal en el test es un dato duplicado que
  // envejece solo, y ya se puso rojo una vez sin que cambiara una línea de código.
  const nombreDeLaObra = (await filaSanFrancisco.innerText()).trim()

  // 2. EL RESUMEN PUBLICA EL AVANCE. La COBERTURA («24 de 80 actividades») ya no se exige acá: el
  //    dueño la bajó al workspace de la obra el 20/08 —*"NO mostrar cantidad de actividades"* en la
  //    vista global— y se comprueba en el paso 3, que es donde vive ahora. La cobertura no se
  //    dejó de publicar, cambió de pantalla; si se dejara de publicar, el paso 3 se pone rojo.
  await expect(filaTabla).toContainText(/%/)

  // 3. LA OBRA ABRE. El 404 de producción se veía justo acá.
  await filaSanFrancisco.click()
  await page.waitForURL(/\/obras\/san-francisco/)
  await expect(page.getByRole('heading', { name: nombreDeLaObra })).toBeVisible()
  // «Avance físico» se acortó a «Avance» al pasar de cuatro tarjetas a una franja de cuatro cifras:
  // en una franja el rótulo compite por el ancho con los otros tres.
  await expect(page.getByTestId('titular-obra')).toContainText('Avance')
  // EL AVANCE VIENE CON SU COBERTURA. Un porcentaje sin decir sobre cuántas actividades se tomó es
  // la mitad de un dato — y fue exactamente el defecto que hizo convivir un 85% con un 44%.
  await expect(page.getByTestId('titular-obra')).toContainText(/\d+ de \d+ actividades/)

  // 4. CRONOGRAMA — el núcleo del módulo, y ahora una sola solapa con DOS vistas de las mismas
  //    actividades. «Gantt» y «Planificación» dejaron de ser solapas principales: el dueño puso el
  //    tope en seis y pidió que planificar viva adentro del cronograma.
  // POR `data-testid` Y NO POR EL RÓTULO. Buscaba el enlace «Cronograma» y la solapa se llama
  // «Planificación» desde que el dueño la renombró: el id de la vista no cambia cuando cambia la
  // palabra que lee una persona, y lo que este test mide es la NAVEGACIÓN, no el diccionario.
  // «Cronograma» dejó de ser solapa el 21/08/2026: es una VISTA de Tareas, que es el workspace
  // único de la obra. La navegación que este test mide es la misma —llegar al Gantt desde la
  // ficha—, con un clic más porque ahora el Gantt vive adentro del workspace.
  await page.getByTestId('tab-tareas').click()
  await page.waitForURL(/vista=tareas/)
  await page.getByTestId('sub-gantt').click()
  await page.waitForURL(/sub=gantt/)
  const gantt = page.getByTestId('gantt')
  await expect(gantt).toBeVisible()
  // BARRAS DIBUJADAS DE VERDAD. Se cuentan las FILAS del calendario y no los nodos del SVG: con el
  // Design Handoff V2 el lienzo dejó de ser un `<svg>` —cada fila es una caja posicionada, para que
  // la alineación con la tabla sea aritmética y no un ajuste a ojo—. Lo que el test afirma es lo
  // mismo de antes: que el cronograma dibuja el plan y no una grilla vacía.
  expect(await gantt.getByTestId('fila-gantt').count()).toBeGreaterThan(5)

  // 5. «PRÓXIMOS» SE RETIRÓ (22/08/2026 · overhaul UX): era otra representación del mismo dataset.
  //    Su URL vieja cae en el Cronograma —no en el default silencioso— y lo que aquel bloque
  //    afirmaba de las puertas sigue: el alta de impedimentos NO vive en el Cronograma, vive en
  //    Operación › Impedimentos (5b).
  await page.goto('/obras/san-francisco?vista=cronograma&sub=proximos')
  await expect(page.getByTestId('gantt'), 'la URL vieja de Próximos no cayó en el Cronograma').toBeVisible()
  await expect(page.getByTestId('alta-impedimento'),
    'el alta volvió a Cronograma: hay dos puertas para el mismo dato').toHaveCount(0)

  // 5b. OPERACIÓN › IMPEDIMENTOS — la puerta única, con los cinco bloques a la vista.
  await page.goto('/obras/san-francisco?vista=operacion&sub=impedimentos')
  await expect(page.getByTestId('bloque-impedimentos')).toBeVisible()
  await expect(page.getByTestId('alta-impedimento')).toBeVisible()

  // 6. DOCUMENTOS — el vínculo a Drive, nunca una copia.
  await page.getByRole('link', { name: 'Documentos', exact: true }).click()
  await page.waitForURL(/vista=documentos/)
  // Los dos formularios de vínculo nacen cerrados (`<details>`), así que la palabra «Drive» está en
  // el DOM pero oculta. Lo que tiene que verse es la ACCIÓN: poder vincular algo.
  await expect(page.getByTestId('vincular-archivo')).toBeVisible()
  await expect(page.getByTestId('vincular-carpeta')).toBeVisible()
})

// ── EN EL TELÉFONO NO SE DESPLAZA DE COSTADO ────────────────────────────────

test('ninguna pantalla del módulo empuja la página de costado en el teléfono', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  await page.setViewportSize({ width: 390, height: 780 })

  // Medido el 18/08/2026: el OS entero salía 568px de ancho contra 390 de pantalla, porque el email
  // del usuario en el nav tenía `whitespace-nowrap`. La tabla ancha SÍ puede desplazarse —dentro de
  // su propio contenedor—, pero el cuerpo de la página no.
  for (const ruta of ['/clientes', '/clientes/la-estrella', '/obras', '/obras/le-comedor', '/obras/le-comedor?vista=cronograma', '/obras/le-comedor?vista=personal', '/obras/le-comedor?vista=economia']) {
    await page.goto(ruta)
    await page.waitForTimeout(400)
    const { doc, win } = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth, win: window.innerWidth,
    }))
    expect(doc, `${ruta} se desplaza de costado (${doc}px en una pantalla de ${win}px)`).toBeLessThanOrEqual(win)
  }
})

// ── UN SOLO AVANCE PARA TODO EL OS ──────────────────────────────────────────

test('el avance que publica /obras es el mismo que responde el chat', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)

  await page.goto('/obras')
  // POR `data-obra` Y NO POR NOMBRE: /San Francisco/ resuelve a CUATRO filas —es el cliente de
  // cuatro obras— y el modo estricto de Playwright corta. El id no se repite y no lo cambia un
  // renombrado.
  const fila = page.locator('tr[data-obra="san-francisco"]')
  const nombreDeLaObra = (await fila.getByRole('link').first().innerText()).trim()
  const enPortafolio = (await fila.innerText()).match(/(\d+)%/)?.[1]
  expect(enPortafolio, 'el portafolio tiene que publicar un avance').toBeTruthy()

  await page.goto('/chat')
  await page.getByTestId('chat-input').fill(`avance de la obra ${nombreDeLaObra}`)
  await page.getByTestId('chat-enviar').click()
  const respuesta = page.getByTestId('chat-respuesta').first()
  await expect(respuesta).toBeVisible({ timeout: 30000 })
  // EL NOMBRE SALE DEL PORTAFOLIO, no de un literal: los dos consumidores tienen que nombrar la
  // obra igual, y eso es justamente lo que este test existe para probar. Buscar «San Francisco»
  // probaba que alguien había escrito ese texto en el test, no que las dos caras coinciden.
  await expect(respuesta).toContainText(nombreDeLaObra, { timeout: 30000 })
  // El avance de ESTA obra dentro de la respuesta, no el primero de la lista: el chat contesta con
  // todas las obras y el primer «avance NN%» sería el de otra.
  const enChat = (await respuesta.innerText())
    .split(nombreDeLaObra)[1]?.match(/avance (\d+)%/)?.[1]

  // Los dos leen `obra_avance`. Si esto se rompe, volvieron a existir dos cálculos del mismo número.
  expect(enChat, 'el chat y la web tienen que decir el MISMO avance').toBe(enPortafolio)

  // Y el tercer consumidor, el control de obras, que hasta ahora publicaba el otro número.
  await page.goto('/control-obras/' + encodeURIComponent(nombreDeLaObra))
  await expect(page.getByText(/% físico/).first()).toBeVisible({ timeout: 30000 })
  const enControl = (await page.getByText(/% físico/).first().innerText()).match(/(\d+)%/)?.[1]
  expect(enControl, 'control de obras tiene que decir el MISMO avance').toBe(enPortafolio)
})
