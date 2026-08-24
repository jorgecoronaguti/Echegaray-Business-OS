// 07 CRONOGRAMA Y 08 DOTACIÓN — MEDIDOS CONTRA EL DOM, Y CONTRA LA BASE PRIMERO.
//
// ═══ QUÉ DEFECTO ATRAPAN Y POR QUÉ NINGÚN OTRO LO ATRAPA ═══
//
// «El cronograma volvió a dibujar barras encadenadas en una obra sin secuencia» no rompe nada: la
// página abre, las barras se ven, el typecheck pasa y el jefe de obra planifica sobre un plan que
// nadie escribió. El único síntoma medible es que el aviso «Sin secuencia cargada» desaparezca
// mientras `obra_dependencia` sigue vacía — y eso hay que contarlo en la base ANTES de mirar la
// pantalla. Un test que compara la pantalla contra sí misma pasa con cualquier número.
//
// El segundo defecto es el que ya costó dinero en otras pantallas: que un dato faltante se dibuje
// como cero. Se mide contra la base cuántas actividades tienen `hh_plan` —hoy: ninguna— y se exige
// que la columna de HH restantes NO diga 0.

import { expect, test } from '@playwright/test'
import { abrir, conBase, entrar } from './util/obras-e2e'

// ═══ POR QUÉ CADA `goto` PASA POR `abrir` (24/08/2026) ═══
//
// Con la suite en paralelo, Postgres corta consultas de estas dos pantallas por `statement timeout`.
// La de Dotación no lo dice: `getObra` vuelve sin fila y la página cae en `notFound()`, así que un
// corte se publica como **«No encontramos esa obra»** — una ausencia explicada con un hecho falso.
// Está informado como defecto del producto; acá se reintenta para que el rojo de estos tests siga
// significando lo que dicen sus títulos.

const OBRA = 'messina'

/** EL NOMBRE DE LA OBRA SALE DE LA BASE, no de una constante escrita acá. Un literal sería el
 *  nombre que YO creo que tiene: el día que se renombre, el test se pone rojo por un motivo falso
 *  —o peor, pasa comparando la pantalla contra una suposición. */
async function nombreDeLaObra(sb: Awaited<ReturnType<typeof conBase>>): Promise<string> {
  const { data, error } = await sb.from('obra_panel').select('nombre').eq('obra_id', OBRA).maybeSingle()
  expect(error, error?.message).toBeNull()
  expect(data?.nombre, `la obra ${OBRA} no está en obra_panel`).toBeTruthy()
  return String(data?.nombre)
}

test('07 · sin dependencias cargadas la pantalla lo DICE y no publica fin de obra', async ({ page }) => {
  // 120 s Y NO LOS 30 POR DEFECTO: con la suite en paralelo, abrir esta pantalla puede costar varios
  // reintentos (ver `abrir`). Con el presupuesto de fábrica el test moría por el reloj a mitad del
  // primer reintento, y el rojo decía «tiempo agotado» sobre una pantalla que nadie llegó a mirar.
  test.setTimeout(120000)
  const sb = await conBase()
  // ── LA VERDAD SE MIDE EN LA BASE PRIMERO ──────────────────────────────────
  const { count, error } = await sb
    .from('obra_dependencia').select('id', { count: 'exact', head: true }).eq('obra_id', OBRA)
  expect(error, error?.message).toBeNull()

  await entrar(page)
  await abrir(page, `/obras/${OBRA}/cronograma`, 'tabs-obra')
  // LA CABECERA ES LA DE LA OBRA (24/08 · C-CANON §12), no una banda propia de la pantalla. Se
  // exige el NOMBRE DE LA OBRA como título —con «Cronograma» de título esto se pone rojo— y las
  // seis solapas visibles, que es lo que esta pantalla no tenía y por eso era un callejón.
  // `barra-obra` era el testid de la banda grafito retirada: buscarlo hoy sería verde contra nada.
  await expect(page.getByTestId('entity-header')).toContainText(await nombreDeLaObra(sb))
  await expect(page.getByTestId('tabs-obra')).toBeVisible()

  const kpis = page.getByTestId('kpis-obra')
  if (count === 0) {
    await expect(page.getByText('Sin secuencia cargada')).toBeVisible()
    // El KPI de fin dice su ausencia con una palabra, nunca con una fecha inventada.
    await expect(kpis).toContainText('sin secuencia')
  } else {
    await expect(page.getByText('Sin secuencia cargada')).toHaveCount(0)
  }

  // Y aun sin secuencia, el cronograma DIBUJA lo que sí existe: las actividades con sus fechas.
  await expect(page.getByTestId('cronograma')).toBeVisible()
  await page.screenshot({ path: 'capturas/07-cronograma-sin-secuencia.png', fullPage: true })
})

test('07 · la vista de camino crítico queda vacía sin secuencia, y explica por qué', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  await abrir(page, `/obras/${OBRA}/cronograma?vista=critico`, 'tabs-obra')
  await expect(page.getByText('No hay camino crítico que mostrar')).toBeVisible()
  await expect(page.getByText('sería inventar un camino crítico')).toBeVisible()
  await page.screenshot({ path: 'capturas/07-cronograma-critico-vacio.png', fullPage: true })
})

test('07 · las tres escalas y la vista por frente abren sin romper el lienzo', async ({ page }) => {
  // Cuatro navegaciones a rutas que el servidor de desarrollo compila por primera vez. El triple
  // de tiempo es del compilador, no de la pantalla: un rojo por el reloj enseña a ignorar los rojos.
  test.slow()
  await entrar(page)
  for (const escala of ['dia', 'semana', 'mes']) {
    await abrir(page, `/obras/${OBRA}/cronograma?escala=${escala}`, 'cronograma')
  }
  await abrir(page, `/obras/${OBRA}/cronograma?vista=frente&escala=mes`, 'cronograma')
  // Sin nada seleccionado, NINGUNA fila puede estar resaltada. `null === null` marcaba las diez
  // cabeceras de frente como si el usuario las hubiera tocado todas.
  await expect(page.locator('[data-sel="1"]')).toHaveCount(0)
  await page.screenshot({ path: 'capturas/07-cronograma-por-frente.png', fullPage: true })
})

test('08 · sin HH cargadas la dotación dice «sin dato», nunca 0', async ({ page }) => {
  test.setTimeout(120000)
  const sb = await conBase()
  const { count, error } = await sb
    .from('obra_actividad_control').select('actividad_id', { count: 'exact', head: true })
    .eq('obra_id', OBRA).eq('archivada', false).not('hh_plan', 'is', null)
  expect(error, error?.message).toBeNull()

  await entrar(page)
  await abrir(page, `/obras/${OBRA}/dotacion`, 'tabs-obra')
  // LA CABECERA ES LA DE LA OBRA (24/08 · C-CANON §12), no una banda propia de la pantalla. Se
  // exige el NOMBRE DE LA OBRA como título —con «Cronograma» de título esto se pone rojo— y las
  // seis solapas visibles, que es lo que esta pantalla no tenía y por eso era un callejón.
  // `barra-obra` era el testid de la banda grafito retirada: buscarlo hoy sería verde contra nada.
  await expect(page.getByTestId('entity-header')).toContainText(await nombreDeLaObra(sb))
  await expect(page.getByTestId('tabs-obra')).toBeVisible()

  if (count === 0) {
    await expect(page.getByText('Ninguna actividad de esta obra tiene HH del análisis cargadas')).toBeVisible()
    // La columna HH REST. dice su ausencia por su nombre. Un 0 ahí se leería «no falta nada».
    await expect(page.locator('td').filter({ hasText: /^sin dato$/ }).first()).toBeVisible()
    await expect(page.getByTestId('kpis-obra')).toContainText('sin cargar')
  }
  await page.screenshot({ path: 'capturas/08-dotacion.png', fullPage: true })
})

// CAMBIO DE REGLA DECLARADO (Design 23/08): el stepper dejó de ser un `<Link>` que navega y pasó a
// ser un `<button>` que recalcula en el navegador y sincroniza la URL con `replaceState`. Lo que el
// test verifica NO cambió —que la dotación no fabrique un plazo sin HH, y que el link siga siendo
// compartible— pero el rol del elemento sí, y por eso se busca un botón.
test('08 · el stepper recalcula sin navegar, deja la URL compartible y no inventa días sin HH', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  await abrir(page, `/obras/${OBRA}/dotacion`, 'kpis-obra')
  // Se elige un frente que NO tiene HH cargadas: es donde el defecto se ve. En un frente terminado
  // «0 días» es la verdad, y probar contra ése haría pasar el test justamente cuando está roto.
  const sinHH = page.locator('tbody tr').filter({ hasText: 'sin dato' }).first()
  await expect(sinHH).toContainText('—')
  const valor = sinHH.getByTestId('dotacion-valor')
  const antes = Number((await valor.textContent())?.trim() ?? '0')
  await sinHH.getByRole('button', { name: /Sumar una persona/ }).click()
  // El número cambia en el acto: si esto espera una navegación, es que el stepper volvió a navegar.
  await expect(valor).toHaveText(String(antes + 1))
  // Y la URL acompaña sin navegar: el link que se manda por chat abre esta misma simulación.
  await expect(page).toHaveURL(/dot=/)
  // Con gente pero sin HH, DÍAS sigue siendo «—» y FIN «sin plan»: la dotación no fabrica un plazo.
  const despues = page.locator('tbody tr').filter({ hasText: 'sin dato' }).first()
  await expect(despues).toContainText('—')
  await expect(despues).toContainText('sin plan')
  await page.screenshot({ path: 'capturas/08-dotacion-stepper.png', fullPage: true })
})
