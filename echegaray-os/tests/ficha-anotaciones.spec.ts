import { test, expect, type Page } from '@playwright/test'
import { ADMIN, CAMPO, JEFE, entrar as token, pedir, servicio } from './util/identidades'

// ANOTACIONES EN LA FICHA DE UNA PERSONA — quién ve el bloque y quién no.
//
// ═══ ESTE SPEC NO ESCRIBE NADA ═══
//
// La base es la del dueño y la comparte el sistema vivo. Todo lo que hay acá es lectura: se abre la
// ficha con cada identidad y se mira qué dibuja. La escritura —que la firma la ponga la base, que
// el `campo` no pueda insertar, que nadie pueda editar ni borrar— se prueba contra un Postgres
// descartable en `supabase/pruebas/persona_nota_02_rls.sql`, que ejecuta las policies de verdad.
//
// ═══ LO QUE ESTOS TESTS ATRAPAN ═══
//
// Uno solo, y es el que importa en una ficha de empleador: que el bloque aparezca para quien no
// debe verlo. `campo` es la propia persona marcando asistencia; si alcanza a leer lo que su jefe
// anotó de él, nadie vuelve a anotar nada honesto y el bloque se muere solo.
//
// ═══ MIENTRAS LA MIGRACIÓN NO ESTÉ APLICADA ═══
//
// `20260908T1700_anotaciones_de_la_persona` está escrita y NO aplicada (las aplica quien integra).
// La pantalla lo dice y el formulario queda bloqueado, así que los tests de la PANTALLA miden igual:
// el bloque, el campo y el botón tienen que estar. El test que pregunta a PostgREST por la tabla se
// SALTEA declarando por qué —un verde que no midió nada es peor que un salteo visible— y empieza a
// medir solo el día que la tabla exista.

const ANCHO_ESCRITORIO = { width: 1440, height: 900 }
const ANCHO_TELEFONO = { width: 390, height: 844 }

async function ingresar(page: Page, quien: { email: string; password: string }) {
  // Por `name` y no por label: los dos campos del login son inputs dentro de una caja dibujada, sin
  // `<label for>`. Es la misma forma que usan `login-aterrizaje` y `administracion-imputacion`.
  await page.goto('/login')
  await page.fill('input[name="email"]', quien.email)
  await page.fill('input[name="password"]', quien.password)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}

/** UNA persona real de la base, leída con el rol de servicio. Sólo se necesita su id para abrir la
 *  ficha: qué se ve adentro lo decide la sesión del navegador, no esta lectura. */
async function unaPersona(): Promise<{ id: string; nombre: string }> {
  const { data, error } = await servicio()
    .from('personas').select('id, nombre_completo').limit(1).single()
  expect(error, error?.message).toBeNull()
  return { id: data!.id as string, nombre: data!.nombre_completo as string }
}

test.describe('el bloque de anotaciones, por rol', () => {
  test('DIRECCIÓN: el bloque está, con su campo y su botón «Anotar»', async ({ page }) => {
    const persona = await unaPersona()
    await page.setViewportSize(ANCHO_ESCRITORIO)
    await ingresar(page, ADMIN)
    await page.goto(`/administracion/personas/${persona.id}`)

    const bloque = page.getByTestId('bloque-anotaciones')
    await expect(bloque).toBeVisible()
    await expect(bloque.getByTestId('campo-anotacion')).toBeVisible()
    const boton = bloque.getByTestId('form-anotacion-enviar')
    await expect(boton).toHaveText(/Anotar/)

    // VA DEBAJO DE «OBRAS EN LAS QUE TRABAJÓ», que es donde lo pidió el dueño: primero dónde
    // estuvo, después qué pasó con él.
    const obras = await page.getByTestId('bloque-obras-persona').boundingBox()
    const anot = await bloque.boundingBox()
    expect(obras, 'el bloque de obras tiene que estar en el Resumen').not.toBeNull()
    expect(anot!.y).toBeGreaterThan(obras!.y)

    await page.screenshot({ path: 'qa-shots/ficha-anotaciones-1440.png', fullPage: true })
  })

  test('EN EL TELÉFONO: el botón tiene alto de dedo y la página no se va de costado', async ({ page }) => {
    const persona = await unaPersona()
    await page.setViewportSize(ANCHO_TELEFONO)
    await ingresar(page, ADMIN)
    await page.goto(`/administracion/personas/${persona.id}`)

    const bloque = page.getByTestId('bloque-anotaciones')
    await expect(bloque).toBeVisible()
    // 44px es el mínimo táctil que pidió el dueño; el token del sistema en móvil es 48
    // (`--os-control-h-mobile`). Se mide el alto REAL, no la clase.
    const boton = await bloque.getByTestId('form-anotacion-enviar').boundingBox()
    expect(boton!.height).toBeGreaterThanOrEqual(44)

    // El contrato del Design: la página nunca scrollea de costado.
    const ancho = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    )
    expect(ancho, 'la ficha se desplaza de costado en 390px').toBe(true)

    await page.screenshot({ path: 'qa-shots/ficha-anotaciones-390.png', fullPage: true })
  })

  test('JEFE DE OBRA: ve el bloque y puede anotar — es quien ve trabajar a la gente', async ({ page }) => {
    const persona = await unaPersona()
    await page.setViewportSize(ANCHO_ESCRITORIO)
    await ingresar(page, JEFE)
    await page.goto(`/administracion/personas/${persona.id}`)

    const bloque = page.getByTestId('bloque-anotaciones')
    await expect(bloque).toBeVisible()
    // No alcanza con ver el bloque: el jefe TIENE que poder escribir. Si mañana alguien cierra la
    // escritura a `ve_economia()`, este aserto se pone rojo antes de que el jefe pierda la función.
    await expect(bloque.getByTestId('campo-anotacion')).toBeVisible()
  })

  test('CAMPO: no hay bloque de anotaciones en ninguna parte de su navegador', async ({ page }) => {
    const persona = await unaPersona()
    await page.setViewportSize(ANCHO_TELEFONO)
    await ingresar(page, CAMPO)
    await page.goto(`/administracion/personas/${persona.id}`)
    // Dos desenlaces posibles y los dos son correctos: el guard lo saca de `/administracion`, o
    // entra y el bloque no se dibuja. Lo que se mide es lo único que importa —que no lo vea— sin
    // atarse a cuál de los dos mecanismos lo impidió.
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('bloque-anotaciones')).toHaveCount(0)
    await expect(page.getByTestId('campo-anotacion')).toHaveCount(0)
    // Y el HTML tampoco lo trae escondido: esconder por CSS lo que el servidor mandó igual es la
    // forma de que el dato viaje al navegador de quien no puede verlo.
    expect(await page.content()).not.toContain('bloque-anotaciones')
  })
})

test.describe('la cerradura de la base, medida sin la pantalla', () => {
  test('persona_nota le contesta a Administración y no al rol campo', async () => {
    const admin = await token(ADMIN.email, ADMIN.password)
    const sonda = await pedir(admin, 'persona_nota?select=id&limit=1')
    // PGRST205 = la tabla todavía no existe en esta base. Se dice y se saltea: un test que pasa
    // porque la tabla no está no está midiendo la cerradura.
    test.skip(
      sonda.status === 404,
      'persona_nota todavía no existe en esta base: falta aplicar 20260908T1700_anotaciones_de_la_persona',
    )

    expect(sonda.status, 'Administración tiene que poder leer persona_nota').toBe(200)
    const jefe = await pedir(await token(JEFE.email, JEFE.password), 'persona_nota?select=id&limit=1')
    expect(jefe.status, 'el jefe de obra tiene que poder leer persona_nota').toBe(200)

    // El rol `campo` no está en `es_administracion()`: la RLS le devuelve CERO filas (200 vacío) o
    // le niega el acceso (403). Lo que NO puede pasar es que le devuelva una anotación.
    const campo = await pedir(await token(CAMPO.email, CAMPO.password), 'persona_nota?select=id,texto')
    expect(campo.filas.length, 'el rol campo leyó anotaciones de la ficha del empleador').toBe(0)
  })
})
