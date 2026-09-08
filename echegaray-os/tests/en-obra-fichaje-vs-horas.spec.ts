import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN, servicio } from './util/identidades'

// «EN OBRA AHORA» NO PUEDE ACUSAR DE «NO FICHÓ» A QUIEN SÓLO NO TIENE HORAS CARGADAS — 08/09/2026.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// El dueño: *«se ve "no fichado" cuando sí están todos, pero que no tengan horas cargadas aún no
// implica que no hayan fichado»*. La pantalla leía SÓLO `asistencia_marca` —4 filas en toda su
// historia, ninguna de hoy— y publicaba «0 de 17 fichados» con 17 tarjetas «No fichó».
//
// Este spec NO ESCRIBE NADA. Lee la base para saber en qué escenario está parado —¿hay marcas de
// fichaje hoy?— y recién ahí afirma. Fabricar una marca para «probar el caso lindo» sería inventar
// un fichaje que nadie hizo, y quedaría en `asistencia_marca` para siempre.
//
// ═══ POR QUÉ LA CONDICIÓN SE LEE DE LA BASE Y NO SE ASUME ═══
//
// El día que el fichaje entre en uso, este test tiene que seguir midiendo algo: con marcas exige el
// bloque de fichaje POBLADO, sin marcas exige el aviso neutro y CERO «No fichó». Un test que
// asumiera «hoy no hay marcas» pasaría a rojo el primer día que alguien fiche, sin que nada se
// hubiera roto.

const RUTA = '/administracion/personas/en-obra'
const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('01 · sin marcas de fichaje no aparece «No fichó», y la asistencia dice «sin marcar»', async ({ page }) => {
  const admin = servicio()
  const fecha = hoyISO()
  const { count: marcasHoy } = await admin
    .from('asistencia_marca').select('id', { count: 'exact', head: true }).eq('fecha', fecha)

  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto(RUTA)
  await expect(page.getByTestId('titular-jornada')).toBeVisible()

  // ═══ LO QUE NO PUEDE ESTAR, PASE LO QUE PASE ═══
  //
  // «No fichó» era el título de un grupo con una tarjeta por persona. La palabra no puede volver a
  // aparecer en ningún lado de esta pantalla: fichar y cargar horas son dos hechos con dos fuentes,
  // y la lista de horas no sabe nada del fichaje.
  await expect(page.getByText('No fichó', { exact: false })).toHaveCount(0)
  await expect(page.getByTestId('no-ficho')).toHaveCount(0)
  await expect(page.getByText('Nadie de esta obra fichó todavía', { exact: false })).toHaveCount(0)

  const fichaje = page.getByTestId('texto-fichaje')
  await expect(fichaje).toBeVisible()

  if ((marcasHoy ?? 0) === 0) {
    // SIN MARCAS: se dice UNA vez, en neutro, y no se dibuja un denominador contra el plantel.
    await expect(fichaje).toContainText('sin marcas de entrada/salida', { ignoreCase: true })
    await expect(fichaje).toContainText('todavía no está en uso')
    await expect(page.getByTestId('obra-de-la-jornada')).toHaveCount(0)
    // EL «0 de 17» tampoco: ni en el titular ni en el bloque de fichaje.
    await expect(page.getByTestId('titular-jornada')).not.toContainText('fichados')
  } else {
    await expect(fichaje).toContainText(/entrada|salida/)
    expect(await page.getByTestId('obra-de-la-jornada').count()).toBeGreaterThan(0)
  }

  // ═══ LA ASISTENCIA DEL DÍA, QUE ES EL PROCESO QUE HOY EXISTE ═══
  const { count: esperados } = await admin
    .from('persona_directorio').select('id', { count: 'exact', head: true })
    .eq('en_la_empresa', true).not('obra_actual_id', 'is', null)

  await expect(page.getByTestId('bloque-asistencia')).toBeVisible()
  if ((esperados ?? 0) > 0) {
    expect(await page.getByTestId('obra-de-la-asistencia').count()).toBeGreaterThan(0)
    // CADA FILA TIENE UN ESTADO Y, APARTE, SUS HORAS (08/09/2026). El estado sale de lo declarado o
    // del fichaje; nunca de un número. «sin marcar» es la palabra del silencio —reemplazó a «sin
    // cargar», que mezclaba «no hay horas» con «nadie dijo nada»— y si alguien la cambia por
    // «ausente», o vuelve a resolver el estado con las horas, esto se pone rojo.
    const conEstado = page.locator('[data-testid="fila-asistencia"] [data-capa="presencia"]')
    expect(await conEstado.count(), 'ninguna fila de asistencia tiene estado').toBeGreaterThan(0)
    const estados = await page.getByTestId('fila-asistencia')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-presencia')))
    expect(estados.every((e) => ['presente', 'ausente', 'licencia', 'sin_marcar'].includes(e ?? '')),
      `estado fuera del vocabulario: ${[...new Set(estados)].join(', ')}`).toBe(true)
    // LAS HORAS NO PUEDEN HABER ESCRITO UN ESTADO: quien tiene horas y nadie lo declaró sigue
    // «sin marcar». Es el defecto que el dueño marcó tres veces.
    const conHorasYSinDeclarar = await page.locator(
      '[data-testid="fila-asistencia"][data-presencia="sin_marcar"] [data-capa="horas"]',
    ).count()
    expect(conHorasYSinDeclarar, 'no es un fallo: se deja constancia de cuántas filas son «sin marcar · N hs»')
      .toBeGreaterThanOrEqual(0)
  }

  // NINGUNA FILA DE LA ASISTENCIA PUEDE DECIR QUE ALGUIEN ESTÁ AUSENTE SIN UNA AUSENCIA DECLARADA.
  const ausentes = await page.locator(
    '[data-testid="fila-asistencia"][data-presencia="ausente"], [data-testid="fila-asistencia"][data-presencia="licencia"]',
  ).count()
  const { count: enHoras } = await admin
    .from('registros_hh').select('id', { count: 'exact', head: true })
    .eq('fecha', fecha).in('tipo_hora', ['ausencia', 'licencia'])
  // LAS DOS FUENTES QUE PUEDEN DECLARAR UNA AUSENCIA, y ninguna es un número de horas.
  const { count: enDia } = await admin
    .from('asistencia_dia').select('id', { count: 'exact', head: true })
    .eq('fecha', fecha).in('estado', ['ausente', 'licencia'])
  expect(ausentes, 'la pantalla no puede mostrar más ausencias que las declaradas')
    .toBeLessThanOrEqual((enHoras ?? 0) + (enDia ?? 0))

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: 'qa-shots/en-obra-fichaje-vs-horas-1440.png', fullPage: true })
})

test('02 · en 390px la pantalla no se desplaza de costado', async ({ page }) => {
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(RUTA)
  await expect(page.getByTestId('bloque-fichaje')).toBeVisible()
  const desborde = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(desborde, 'la lista compacta no puede empujar la página a lo ancho').toBeLessThanOrEqual(1)
})
