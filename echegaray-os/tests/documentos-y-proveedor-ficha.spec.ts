import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// 23 · PROVEEDOR FICHA y 27 · DOCUMENTOS — la pantalla y el permiso, medidos por separado.
//
// ═══ EL PERMISO NO SE MIDE EN LA PANTALLA ═══
//
// Una tabla vacía puede estar vacía por tres razones y sólo una es seguridad. Los tests de permiso
// piden el dato directo a PostgREST con el token de cada rol: lo que devuelve la base es lo que
// hay, sin React en el medio. Es la misma forma que usa `control-obra-permisos.spec.ts`.
//
// NO ESCRIBE NADA. Las dos pantallas son de lectura y estos tests también.

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string

const DIRECCION = { email: 'jorge.o.corona+direccion-test-1783513222134@gmail.com', clave: 'TestPassword123!' }
const JEFE = { email: 'qa.jefe.obra@ecsas.com.ar', clave: 'TestJefe123!' }

async function sesion(quien: { email: string; clave: string }): Promise<SupabaseClient> {
  const c = createClient(SUPA, ANON, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email: quien.email, password: quien.clave })
  expect(error, error?.message).toBeNull()
  return c
}

async function entrar(page: Page, quien: { email: string; clave: string }) {
  await page.goto('/login')
  await page.getByLabel(/correo|email/i).fill(quien.email)
  await page.getByLabel(/contraseña|clave/i).fill(quien.clave)
  await page.getByRole('button', { name: /ingresar|entrar|iniciar/i }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}

test.describe('permiso, medido contra la base', () => {
  test('el jefe de obra NO ve las obras ajenas en los comprobantes del proveedor', async () => {
    // `costos_obra_select` filtra por `ve_obra_texto(obra_texto)`. La ficha muestra el importe —es
    // costo, y el dueño lo autorizó— pero sólo de sus obras. Si esta cuenta creciera hasta el total
    // de Dirección, el corte por obra habría dejado de funcionar.
    const jefe = await sesion(JEFE)
    const direccion = await sesion(DIRECCION)
    const [d, j] = await Promise.all([
      direccion.from('costos_obra').select('id', { count: 'exact', head: true }),
      jefe.from('costos_obra').select('id', { count: 'exact', head: true }),
    ])
    expect(d.error, d.error?.message).toBeNull()
    expect(j.error, j.error?.message).toBeNull()
    expect(d.count ?? 0).toBeGreaterThan(0)
    expect(j.count ?? 0).toBeLessThan(d.count ?? 0)
  })

  test('EL AGUJERO DECLARADO: `drive_index` está abierto a cualquier sesión', async () => {
    // La ruta `/documentos` está cerrada por `RUTAS_SOLO_ECONOMIA`, pero la policy de la tabla es
    // `using (true)`. Este test NO comprueba que esté bien: DOCUMENTA que la puerta no tiene
    // cerradura detrás, para que el día que se cierre por migración este test se ponga rojo y
    // alguien tenga que venir a leer esto en vez de descubrirlo por casualidad.
    const jefe = await sesion(JEFE)
    const { count, error } = await jefe
      .from('drive_index').select('drive_file_id', { count: 'exact', head: true })
    expect(error, error?.message).toBeNull()
    expect(
      count ?? 0,
      'drive_index dejó de estar abierto: revisar el comentario de RUTAS_SOLO_ECONOMIA y borrar esta advertencia',
    ).toBeGreaterThan(0)
  })
})

test.describe('las dos pantallas, con los datos que hay', () => {
  test('la ficha del proveedor abre desde la cartera y muestra su identidad', async ({ page }) => {
    await entrar(page, DIRECCION)
    await page.goto('/administracion/proveedores')
    await page.getByTestId('abrir-proveedor').first().click()
    await page.getByTestId('abrir-ficha-proveedor').click()
    await expect(page.getByTestId('titulo-ficha')).toBeVisible()
    // El CUIT no puede dibujarse vacío: o está, o dice «sin CUIT». El v2 lo pone bajo el nombre y
    // repetido en el costado, que es el renglón que se afirma acá.
    await expect(page.getByTestId('dato-cuit')).toContainText(/\d|sin CUIT/)
    await page.getByTestId('solapa-nombres').click()
    await expect(page.getByTestId('nombres-proveedor')).toBeVisible()
  })

  test('un proveedor que no existe NO se dibuja como uno vacío', async ({ page }) => {
    await entrar(page, DIRECCION)
    await page.goto('/administracion/proveedores/00000000-0000-0000-0000-000000000000')
    await expect(page.getByTestId('proveedor-no-encontrado')).toBeVisible()
  })

  // ═══ ESTA ASERCIÓN ESTABA MIDIENDO LO QUE NO PODÍA CAMBIAR (corregido 24/08/2026) ═══
  //
  // Medía las FILAS DIBUJADAS antes y después de buscar «recibo», y exigía que el número cambiara.
  // Pero la tabla se recorta a un tope, y medido contra la base real hay 3.128 archivos y 907 que
  // coinciden con «recibo»: los dos números están por encima del tope, así que antes y después
  // dibujaban exactamente la misma cantidad de filas. La prueba no podía pasar con datos reales, y
  // el defecto que decía cuidar —el buscador no filtra— quedaba sin cubrir.
  //
  // Lo que SÍ cambia y es la señal correcta es el TOTAL que la consulta contó: 3.128 → 907. Se mide
  // eso, que es lo que prueba que el filtro corrió en Postgres y no en el navegador.
  test('Documentos filtra al teclear y abre el panel del archivo', async ({ page }) => {
    await entrar(page, DIRECCION)
    await page.goto('/documentos')
    await expect(page.getByTestId('tabla-documentos')).toBeVisible()
    const antes = await page.getByTestId('pie-documentos').textContent()
    await page.getByTestId('buscar-documento').fill('recibo')
    // Filtra SIN Enter: el contrato de diseño lo pide y el buscador de la URL lo cumple.
    await expect
      .poll(async () => page.getByTestId('pie-documentos').textContent(), { timeout: 15_000 })
      .not.toBe(antes)
    await page.getByTestId('abrir-documento').first().click()
    await expect(page.getByTestId('panel-documento')).toBeVisible()
    // EL ARCHIVO NO SE COPIA: el único botón lleva a Drive.
    await expect(page.getByTestId('abrir-en-drive')).toHaveAttribute('href', /drive\.google\.com/)
  })

  // ═══ EL TOPE TIENE PUERTA ═══
  //
  // Antes el pie decía «está fuera del tope de 200 filas» y ahí terminaba: el archivo de la fila 201
  // no se alcanzaba desde ninguna parte de la pantalla, ni filtrando —el filtro también recorta—.
  // «Cargar más» pide otra página A LA CONSULTA (`?n=`); si alguien la vuelve a dibujar en el
  // navegador, la cuenta del pie no sube y esto se pone rojo.
  test('el archivo que cae fuera del tope se alcanza con «Cargar más»', async ({ page }) => {
    await entrar(page, DIRECCION)
    await page.goto('/documentos')
    const primera = await page.getByTestId('abrir-documento').count()
    await page.getByTestId('cargar-mas-documentos').click()
    await expect
      .poll(async () => page.getByTestId('abrir-documento').count(), { timeout: 20_000 })
      .toBeGreaterThan(primera)
    expect(new URL(page.url()).searchParams.get('n')).toBe('2')
  })

  // ═══ DE QUIÉN CUELGA EL ARCHIVO ═══
  //
  // `obra_documento` estaba en 0 filas el 21/08 y la pantalla dejó de mirarla; el 24/08 tiene 32. El
  // recorte se resuelve EN POSTGRES contra la tabla de vínculo: si volviera a descartarse en el
  // navegador sobre las filas ya traídas, «De obras» devolvería vacío casi siempre —las 32 no entran
  // en las 100 más recientes— y alguien concluiría que la obra no tiene papeles cargados.
  test('el filtro por entidad recorta contra la tabla de vínculo, no contra la página', async ({ page }) => {
    await entrar(page, DIRECCION)
    await page.goto('/documentos?ent=obra')
    await expect(page.getByTestId('tabla-documentos')).toBeVisible()
    const filas = await page.getByTestId('abrir-documento').count()
    expect(filas, 'el filtro «De obras» no devolvió ningún archivo vinculado a una obra')
      .toBeGreaterThan(0)
    // Y CADA FILA tiene su vínculo: un recorte que devolviera archivos sueltos sería un filtro que
    // no filtra. La columna dice «sin vincular» cuando no hay ninguno.
    await expect(page.getByTestId('tabla-documentos')).not.toContainText('sin vincular')
  })

  test('el jefe de obra rebota en /documentos', async ({ page }) => {
    await entrar(page, JEFE)
    await page.goto('/documentos')
    await expect(page.getByTestId('tabla-documentos')).toHaveCount(0)
    expect(new URL(page.url()).pathname).not.toBe('/documentos')
  })
})
