// EL PRINCIPIO «MISMO DATO — VISTA GLOBAL Y VISTA DE OBRA», PROBADO CONTRA EL DOM REAL.
//
// El dueño (19/08), textual: *"NO crear dos sistemas. Debe ser: MISMA TABLA/FUENTE → vista global +
// filtro por obra"* · *"El Gantt global y el Gantt de una obra deben consumir exactamente las mismas
// actividades canónicas"*.
//
// ═══ QUÉ DEFECTO ATRAPA, Y POR QUÉ NINGÚN OTRO TEST LO ATRAPA ═══
//
// "Dos sistemas" no rompe nada: las dos pantallas abren, las dos muestran filas creíbles, y el
// typecheck pasa. Lo que falla es que una muestra 41 actividades de la obra y la otra 38, o una
// compra que está en la ficha y no en la lista global. Eso sólo se ve CONTANDO las dos y
// comparándolas — que es exactamente lo que hace este archivo, y en el navegador, no en una función
// pura: el defecto puede estar en el service, en el filtro de archivadas, en el recorte de
// `getMovimientos`, o en el componente. Contra el DOM, cualquiera de los cuatro sale rojo.
//
// SI SE REVIERTE LA UNIFICACIÓN —una `getActividadesGlobal()` aparte, un filtro por obra escrito de
// nuevo en la vista global, un `limit` distinto— este test se pone rojo y ningún otro se entera.
//
// LA ACTIVIDAD DE PRUEBA existe para que la comparación no sea entre dos ceros: se crea una fila
// canónica, tiene que aparecer en LAS DOS pantallas, y se borra al final.

import { expect, test } from '@playwright/test'
import { conBase, entrar, laFila, limpiar, MARCA, OBRA } from './util/obras-e2e'

/**
 * TODAS las filas de actividad de UNA obra, en cualquiera de los dos Gantt. Sin recortes.
 *
 * La primera versión de esta constante decía `:not([data-tipo="resumen"])` y era un test sin
 * dientes: al excluir las filas de resumen en LOS DOS lados, la comparación no podía ver el defecto
 * más probable de esta pantalla —que la vista global dibuje como tarea las cabeceras que la ficha
 * consume como título de sección—. Se comprobó con una mutación: borrando el `continue` de
 * `agruparPorObra` el test seguía en verde. Ahora se cuenta TODO lo que cada Gantt dibuja como
 * actividad, que es lo único que hace comparables a las dos pantallas.
 */
const BARRAS = `[data-testid="actividad-cronograma"][data-obra="${OBRA}"]`

/**
 * LA OBRA DE LA PRUEBA DE OPERACIÓN NO ES LA MISMA QUE LA DEL CRONOGRAMA, Y NO ES CAPRICHO.
 *
 * `le-comedor` tiene cronograma pero CERO pedidos, cero compras, cero herramientas y cero
 * movimientos (medido el 19/08/2026). Comparar 0 contra 0 pasa siempre y no prueba nada: un test
 * que no puede ponerse rojo es peor que no tenerlo, porque parece cobertura. `la-estrella` tiene
 * filas en las cuatro sub-vistas, y por eso la comparación mide algo.
 */
const OBRA_CON_OPERACION = 'la-estrella'

const filasDe = (testid: string, obra: string) => `[data-testid="${testid}"] tr[data-obra="${obra}"]`

test('el cronograma global y el de la obra dibujan exactamente las mismas actividades', async ({ page }) => {
  const sb = await conBase()
  await limpiar(sb)
  const nombre = `${MARCA} misma actividad`
  try {
    const { data, error } = await sb.from('obra_actividad').insert({
      obra_id: OBRA,
      clave: `zz-e2e-mismo-dato-${Date.now()}`,
      codigo: 'ZZ.1',
      nombre,
      tipo: 'tarea',
      orden: 9999,
      inicio_plan: '2026-08-10',
      fin_plan: '2026-08-24',
      pct: 10,
    }).select('id').single()
    expect(error?.message ?? null, 'la actividad de prueba tiene que poder crearse').toBeNull()
    laFila(data, 'la actividad de prueba recién creada')

    await entrar(page)

    // ── LA VISTA GLOBAL ───────────────────────────────────────────────────────
    await page.goto('/obras/cronograma')
    await expect(page.getByTestId('gantt')).toBeVisible({ timeout: 30000 })
    // La actividad canónica que se acaba de crear tiene que estar acá, agrupada bajo su obra.
    await expect(page.getByTestId('gantt').getByRole('button', { name: new RegExp(nombre) })).toHaveCount(1)
    const enLaGlobal = await page.locator(BARRAS).count()

    // ── LA VISTA DE LA OBRA ───────────────────────────────────────────────────
    await page.goto(`/obras/${OBRA}?vista=cronograma`)
    await expect(page.getByTestId('gantt')).toBeVisible({ timeout: 30000 })
    await expect(page.getByTestId('gantt').getByRole('button', { name: new RegExp(nombre) })).toHaveCount(1)
    const enLaObra = await page.locator(BARRAS).count()

    expect(enLaGlobal, 'la obra de prueba tiene cronograma: si esto es 0, la comparación no prueba nada').toBeGreaterThan(0)
    expect(
      enLaGlobal,
      `el Gantt global muestra ${enLaGlobal} actividades de ${OBRA} y el de la obra ${enLaObra}: son dos sistemas`,
    ).toBe(enLaObra)
  } finally {
    await limpiar(sb)
    await sb.auth.signOut()
  }
})

test('operación: cada sub-vista global trae, para una obra, las mismas filas que su solapa', async ({ page }) => {
  // Ocho pantallas en un solo test, y dos de ellas listan 845 y 299 filas de compras. Los 30 s por
  // defecto alcanzan para una pantalla, no para el recorrido completo: el rojo era el reloj, no el
  // código, y un test que falla por el reloj enseña a ignorarlo.
  test.setTimeout(180_000)
  const sb = await conBase()
  try {
    await entrar(page)
    const subs = [
      { sub: 'pedidos', global: 'tabla-pedidos-global', obra: 'tabla-pedidos' },
      { sub: 'compras', global: 'tabla-compras-global', obra: 'tabla-compras' },
      { sub: 'herramientas', global: 'tabla-herramientas-global', obra: 'tabla-herramientas' },
      { sub: 'movimientos', global: 'tabla-movimientos-global', obra: 'tabla-movimientos' },
    ]
    for (const s of subs) {
      await page.goto(`/obras/operacion?sub=${s.sub}`)
      await expect(page.getByTestId('nav-vistas-obras')).toBeVisible({ timeout: 30000 })
      const enLaGlobal = await page.locator(filasDe(s.global, OBRA_CON_OPERACION)).count()

      await page.goto(`/obras/${OBRA_CON_OPERACION}?vista=operacion&sub=${s.sub}`)
      await expect(page.getByTestId('tabs-obra')).toBeVisible({ timeout: 30000 })
      const enLaObra = await page.locator(filasDe(s.obra, OBRA_CON_OPERACION)).count()

      expect(enLaGlobal, `${s.sub}: sin filas, la comparación no prueba nada`).toBeGreaterThan(0)
      expect(
        enLaGlobal,
        `${s.sub}: la lista global muestra ${enLaGlobal} filas de ${OBRA_CON_OPERACION} y la solapa de la obra ${enLaObra}`,
      ).toBe(enLaObra)
    }
  } finally {
    await sb.auth.signOut()
  }
})

test('la navegación del área Obras tiene dos niveles y todas sus vistas abren', async ({ page }) => {
  await entrar(page)
  // Las seis vistas de la cartera. Que abran no es cosmético: cada una es una lectura contra la base
  // con su propio RLS, y una que devuelva 42501 se ve como una página vacía o como un 404.
  for (const [href, titulo] of [
    ['/obras', 'Portafolio'],
    ['/obras/cronograma', 'Cronograma'],
    ['/obras/personal', 'Personal'],
    ['/obras/operacion', 'Operación'],
    ['/obras/certificaciones', 'Certificaciones'],
    ['/obras/documentos', 'Documentos'],
  ] as const) {
    await page.goto(href)
    await expect(page.getByRole('heading', { name: titulo, level: 1 })).toBeVisible({ timeout: 30000 })
    await expect(page.getByTestId('nav-vistas-obras')).toBeVisible()
  }
})
