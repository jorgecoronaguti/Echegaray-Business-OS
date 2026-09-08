import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN, servicio } from './util/identidades'

// ═══ ESTE TEST ESCRIBE EN LA BASE REAL, Y POR ESO NO CORRE SOLO ═══
//
//   E2E_ESCRIBE_ASISTENCIA=1 npx playwright test tests/ausencia-por-tramo.spec.ts
//
// Escribe SÓLO sobre la persona de prueba `e2e…0001` (`es_prueba = true`, fuera de
// `persona_directorio`) y borra lo suyo al terminar. Ninguna fila lleva obra: una licencia es de la
// persona, así que ninguna obra viva recibe nada — que es lo que hacía peligrosa la corrida del
// 07/09, cuando un test dejó 77,4 HH en PISOS INDUSTRIALES.
//
// LO QUE SÓLO SE PUEDE PROBAR ACÁ: que el tramo llega a `registros_hh` con una fila POR DÍA HÁBIL,
// sin domingo, con las horas de cada día —9 de lunes a jueves, 8 los viernes— y en días que
// TODAVÍA NO LLEGARON; y que esos días futuros se ven en la grilla con su letra. Los módulos puros
// ya prueban la regla; lo que la pantalla afirma sólo lo prueba la pantalla.
const PERSONA = 'e2e00000-0000-4000-8000-000000000001'
const OBRA = 'prueba-e2e'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const correr = (fecha: string, n: number) => {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}
const dow = (fecha: string) => new Date(`${fecha}T00:00:00Z`).getUTCDay()

const HOY = iso(new Date())
/** MAÑANA: el tramo tiene que caer en días que no llegaron — de eso se trata el pedido. */
const DESDE = correr(HOY, 1)
/** Seis días de calendario para que el domingo quede ADENTRO del rango y se lo vea faltar. */
const HASTA = correr(DESDE, 5)

/** Los días que la prueba espera encontrar, contados sin mirar el código que los produce. */
const HABILES = (() => {
  const dias: string[] = []
  for (let f = DESDE; f <= HASTA; f = correr(f, 1)) if (dow(f) !== 0) dias.push(f)
  return dias
})()

interface FilaHH {
  fecha: string
  horas: number | string
  tipo_hora: string
  obra_canonica_id: string | null
  notas: string | null
}

const leerDelDestino = async (): Promise<FilaHH[]> => {
  const { data, error } = await servicio().from('registros_hh')
    .select('fecha, horas, tipo_hora, obra_canonica_id, notas')
    .eq('persona_id', PERSONA).gte('fecha', DESDE).lte('fecha', HASTA)
    .order('fecha', { ascending: true })
  if (error) throw new Error(`No pude leer el destino: ${error.message}`)
  return (data ?? []) as FilaHH[]
}

/** Deja a la persona de prueba con una asignación vigente y el rango LIMPIO. Devuelve su nombre:
 *  la fila de la grilla se busca por el nombre que la base tenga, no por uno inventado acá. */
async function prepararPersona(): Promise<string> {
  const sb = servicio()
  const { data } = await sb.from('personas')
    .select('nombre_completo').eq('id', PERSONA).maybeSingle()
  const nombre = (data as { nombre_completo: string | null } | null)?.nombre_completo
  if (!nombre) throw new Error(`No existe la persona de prueba ${PERSONA}: este test no crea gente.`)
  // `en_la_empresa` es lo que la publica en `persona_plantel`, de donde la grilla saca la fila.
  const alta = await sb.from('personas').update({ en_la_empresa: true, es_prueba: true })
    .eq('id', PERSONA).select('id')
  if (alta.error) throw new Error(`No pude preparar a la persona: ${alta.error.message}`)
  // LA ASIGNACIÓN SIN `hasta`: la policy `marca_ausencia_de` mira la vigencia A LA FECHA DEL
  // REGISTRO, y un tramo hacia el futuro choca contra una asignación que se cierra antes.
  await sb.from('obra_asignacion').delete().eq('persona_id', PERSONA)
  const asig = await sb.from('obra_asignacion')
    .insert({ obra_id: OBRA, persona_id: PERSONA, rol: 'integrante', desde: '2026-01-01' })
    .select('id')
  if (asig.error) throw new Error(`No pude asignarla a ${OBRA}: ${asig.error.message}`)
  await sb.from('registros_hh').delete().eq('persona_id', PERSONA).gte('fecha', HOY).lte('fecha', HASTA)
  // ═══ LA ESCALERA PARA LLEGAR A LA PANTALLA, Y NO LA EVIDENCIA ═══
  //
  // La grilla arma una fila por asignación a obra ACTIVA (`elegible` en `quincenaPorObra`) o por
  // alguien que ya tenga algo declarado en la ventana. La persona de prueba está asignada a
  // `prueba-e2e`, que está CERRADA a propósito: sin esta semilla no tiene fila y no hay «corregir»
  // que tocar. La alternativa —fabricar una obra activa, o reabrir la de prueba— le tocaría el
  // estado a una obra compartida y ya se vio que un timeout puede saltearse la limpieza.
  //
  // Va en HOY, FUERA del tramo: los días que la prueba mide siguen siendo inserts que hace la
  // pantalla, no filas que este helper dejó puestas.
  const semilla = await sb.from('registros_hh').insert({
    persona_id: PERSONA, obra_canonica_id: null, actividad_id: null,
    fecha: HOY, fecha_inicio_semana: HOY, horas: 9, tipo_hora: 'ausencia', notas: 'falta',
    fuente_legacy: 'e2e:semilla-ausencia-por-tramo',
  }).select('id')
  if (semilla.error) throw new Error(`No pude sembrar el día de hoy: ${semilla.error.message}`)
  return nombre
}

/**
 * Barre lo que la prueba escribió: las horas del rango, la semilla incluida.
 *
 * LA ASIGNACIÓN QUEDA, Y NO ES UN OLVIDO. La persona de prueba viene de fábrica asignada a
 * `prueba-e2e`, que es exactamente lo que `prepararPersona` deja: borrarla acá dejaría el fixture
 * peor de lo que estaba para el test siguiente. La persona y su nombre tampoco se tocan: son de la
 * base, no de este test.
 */
async function limpiar(): Promise<void> {
  await servicio().from('registros_hh')
    .delete().eq('persona_id', PERSONA).gte('fecha', HOY).lte('fecha', HASTA)
}

test('UN TRAMO DE LICENCIA SE ASIENTA DÍA POR DÍA, SIN DOMINGO Y EN DÍAS QUE NO LLEGARON', async ({ page }) => {
  test.skip(process.env.E2E_ESCRIBE_ASISTENCIA !== '1',
    'Escribe en registros_hh sobre la persona de prueba. Se habilita con E2E_ESCRIBE_ASISTENCIA=1.')
  // NOVENTA SEGUNDOS: el login, dos cargas de la grilla entera y la escritura de cinco días no
  // entran en los treinta por defecto — y un timeout SALTEA el `finally`, o sea que deja rastro.
  test.setTimeout(90_000)
  const nombre = await prepararPersona()
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto(`/administracion/personas?vista=asistencia&quincena=${DESDE}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('grilla-asistencia')).toBeVisible()

    const fila = page.locator('tr', { hasText: nombre }).last()
    await fila.getByTestId('abrir-correccion').click()
    await expect(page.getByTestId('panel-correccion')).toBeVisible()

    await page.getByTestId('correccion-dia').selectOption(DESDE)
    await page.getByTestId('correccion-estado').selectOption('ausente')
    await page.getByTestId('correccion-motivo').selectOption('accidente')

    // EL CAMPO SÓLO APARECE CON MOTIVO DECLARADO: una enfermedad se sabe cuánto dura, un «sin
    // declarar todavía» no dura nada todavía.
    await expect(page.getByTestId('correccion-hasta')).toBeVisible()
    await page.getByTestId('tramo-fecha').click()
    await page.getByTestId('correccion-hasta').fill(HASTA)
    await page.screenshot({ path: 'tests/qa-shots/ausencia-por-tramo-1440.png', fullPage: true })

    await page.getByTestId('guardar-correccion').click()
    const acuse = page.getByTestId('acuse-correccion')
    await expect(acuse).toBeVisible({ timeout: 20000 })
    const texto = await acuse.innerText()
    expect(texto, texto).toMatch(/Licencia asentada del /)
    expect(texto, texto).toMatch(new RegExp(`${HABILES.length} días hábiles`))
    // LA FRASE QUE EL DUEÑO EXIGIÓ, TAMBIÉN EN EL TRAMO: nadie va a buscar estos días a una obra.
    expect(texto, texto).toContain('no se cargó a ninguna obra')

    // ═══ LA EVIDENCIA ES EL DATO EN SU DESTINO ═══
    const filas = await leerDelDestino()
    expect(filas.map((f) => f.fecha), 'una fila por día hábil, sin domingo').toEqual(HABILES)
    for (const f of filas) {
      expect(f.obra_canonica_id, `el ${f.fecha} quedó cargado a una obra`).toBeNull()
      expect(f.tipo_hora, f.fecha).toBe('licencia')
      expect(f.notas, f.fecha).toBe('accidente')
      expect(dow(f.fecha), 'ningún domingo').not.toBe(0)
      // 9 DE LUNES A JUEVES, 8 LOS VIERNES (dueño, 08/09/2026). El sábado no tiene jornada por
      // defecto: lleva la que la pantalla mostró, y lo único exigible es que no sea cero.
      const esperado = dow(f.fecha) === 5 ? 8 : dow(f.fecha) === 6 ? null : 9
      if (esperado !== null) expect(Number(f.horas), `las horas del ${f.fecha}`).toBe(esperado)
      else expect(Number(f.horas), `las horas del sábado ${f.fecha}`).toBeGreaterThan(0)
    }

    // ═══ Y SE VEN EN LA GRILLA, EN DÍAS QUE TODAVÍA NO PASARON ═══
    await page.goto(`/administracion/personas?vista=asistencia&quincena=${DESDE}`)
    await page.waitForLoadState('networkidle')
    const suFila = page.locator('tr', { hasText: nombre }).last()
    // TRES COMO PISO Y NO LOS CINCO: el tramo puede cruzar el corte de la quincena, y la grilla
    // dibuja una sola. Lo que se afirma es que los días futuros NO salen vacíos.
    const conLicencia = suFila.locator('[data-estado="licencia"]')
    await expect(conLicencia.first()).toBeVisible()
    expect(await conLicencia.count(), 'los días futuros del tramo muestran su licencia')
      .toBeGreaterThanOrEqual(3)
    await page.screenshot({ path: 'tests/qa-shots/ausencia-por-tramo-grilla-1440.png', fullPage: true })
  } finally {
    await limpiar()
  }
})

// ═══ EL DEFECTO VISTO EN PRODUCCIÓN EL 08/09/2026, CON DOS PERSONAS ═══
//
// «Horas que corresponden» nacía con la jornada del PRIMER día montado y no se movía nunca más:
// elegido un viernes seguía diciendo 9 —el lunes— cuando el viernes vale 8, y ese 9 era lo que se
// guardaba. La regla pura ya está probada en `ausenciaDeLaPersona.test.ts`; lo que sólo puede
// probar la pantalla es que el campo se RECALCULA al cambiar de día y al pasar a «No vino».
//
// NO ESCRIBE NADA: abre el panel, cambia el día y lee el campo. Por eso corre siempre, sin
// `E2E_ESCRIBE_ASISTENCIA`, y nunca toca `registros_hh`.
test('LAS HORAS QUE CORRESPONDEN SON LAS DEL DÍA ELEGIDO: 8 EL VIERNES, 9 EL LUNES', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/administracion/personas?vista=asistencia')
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('grilla-asistencia')).toBeVisible()

  const abrir = page.getByTestId('abrir-correccion').first()
  await abrir.click()
  await expect(page.getByTestId('panel-correccion')).toBeVisible()

  // DÍAS SIN NADA CARGADO: si el día ya tuviera una ausencia registrada, el campo mostraría ESAS
  // horas —que es lo correcto— y el test estaría midiendo otra regla.
  const dia = page.getByTestId('correccion-dia')
  const opciones = await dia.locator('option').evaluateAll(
    (os) => os.map((o) => ({ valor: (o as HTMLOptionElement).value, texto: o.textContent ?? '' })))
  const libre = (dow: number) => opciones.find((o) =>
    o.texto.includes('sin cargar') && new Date(`${o.valor}T00:00:00Z`).getUTCDay() === dow)?.valor
  const viernes = libre(5)
  const lunes = libre(1)
  test.skip(!viernes || !lunes, 'la quincena a la vista no tiene un viernes y un lunes sin cargar')

  const campo = page.getByTestId('correccion-horas-ausencia')
  // EL ORDEN IMPORTA: primero el viernes. Al montar, el panel se para en el primer día con algo
  // cargado —casi siempre un lunes—, así que un campo que no se recalcula muestra 9 acá.
  await dia.selectOption(viernes!)
  await page.getByTestId('correccion-estado').selectOption('ausente')
  await expect(campo).toHaveValue('8')

  await dia.selectOption(lunes!)
  await page.getByTestId('correccion-estado').selectOption('ausente')
  await expect(campo).toHaveValue('9')

  // ═══ Y DE PASO, LOS CHIPS DEL «HASTA» A LA MEDIDA DE UN CONTROL ═══
  await page.getByTestId('correccion-motivo').selectOption('accidente')
  const chip = page.getByTestId('tramo-semana')
  await expect(chip).toBeVisible()
  const alto = (await chip.boundingBox())?.height ?? 0
  expect(alto, 'el chip mide como un control del panel, no 23 px').toBeGreaterThanOrEqual(34)
  // EL INACTIVO NO PUEDE PESAR MÁS QUE EL ELEGIDO: antes era negro con letra blanca.
  const fondoInactivo = await chip.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(fondoInactivo, 'un chip no elegido no lleva fondo pintado').toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
  await page.getByTestId('tramo-semana').click()
  await expect(page.getByTestId('hasta-legible')).toContainText(/hasta (lun|mar|mié|jue|vie|sáb) \d\d\/\d\d/)
  await page.screenshot({ path: 'tests/qa-shots/panel-hasta-chips-1440.png', fullPage: false })
})
