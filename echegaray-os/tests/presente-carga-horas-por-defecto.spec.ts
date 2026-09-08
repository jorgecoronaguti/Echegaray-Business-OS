import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN, servicio } from './util/identidades'

// ═══ ESTE TEST ESCRIBE EN LA BASE REAL, Y POR ESO NO CORRE SOLO ═══
//
//   E2E_ESCRIBE_ASISTENCIA=1 npx playwright test tests/presente-carga-horas-por-defecto.spec.ts
//
// Escribe SÓLO sobre la persona de prueba `e2e…0001` (`es_prueba = true`) y sobre la obra
// `prueba-e2e`, y borra todo al terminar. Ninguna obra viva recibe una sola hora — que es lo que
// hizo peligrosa la corrida del 07/09, cuando un test dejó 77,4 HH en PISOS INDUSTRIALES.
//
// LO QUE SÓLO SE PUEDE PROBAR ACÁ: que tocar «Está» en el teléfono deja la jornada del día ESCRITA
// en `registros_hh` —9 el martes, 8 el viernes, con la marca `web:presencia-defecto`— y que
// corregir a «No vino» la retira. Los tests puros ya prueban la regla; que la pantalla la ejecute
// de verdad contra Postgres, con la RLS puesta, sólo lo prueba el dato leído en su destino.
//
// ═══ LA OBRA DE PRUEBA SE ABRE Y SE VUELVE A CERRAR ═══
//
// `/campo/asistencia` sólo ofrece obras con `estado = 'activa'` (`leerDatosCampo`) y `prueba-e2e`
// está CERRADA a propósito. La alternativa era usar una obra viva, y eso es exactamente el
// accidente que no se puede repetir: preferimos tocar el estado de la obra de prueba —un campo, de
// una obra que existe para esto— antes que imputarle horas a una obra real. Se restaura en el
// `finally` y también al empezar, por si una corrida anterior murió por timeout.
const PERSONA = 'e2e00000-0000-4000-8000-000000000001'
const OBRA = 'prueba-e2e'
const MARCA = 'web:presencia-defecto'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const correr = (fecha: string, n: number) => {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}
const dow = (fecha: string) => new Date(`${fecha}T00:00:00Z`).getUTCDay()

/** El próximo día de la semana pedido, SIEMPRE en el futuro: así ninguna quincena ya liquidada
 *  recibe nada, y el día elegido no depende de cuándo se corra la suite. */
const proximo = (queDow: number): string => {
  let f = correr(iso(new Date()), 1)
  while (dow(f) !== queDow) f = correr(f, 1)
  return f
}

const MARTES = proximo(2)
const VIERNES = proximo(5)
const DESDE = MARTES < VIERNES ? MARTES : VIERNES
const HASTA = MARTES < VIERNES ? VIERNES : MARTES

interface FilaHH {
  fecha: string
  horas: number | string
  tipo_hora: string
  obra_canonica_id: string | null
  notas: string | null
  fuente_legacy: string | null
}

const leerDelDestino = async (fecha: string): Promise<FilaHH[]> => {
  const { data, error } = await servicio().from('registros_hh')
    .select('fecha, horas, tipo_hora, obra_canonica_id, notas, fuente_legacy')
    .eq('persona_id', PERSONA).eq('fecha', fecha)
  if (error) throw new Error(`No pude leer el destino: ${error.message}`)
  return (data ?? []) as FilaHH[]
}

async function limpiar(): Promise<void> {
  const sb = servicio()
  await sb.from('registros_hh').delete().eq('persona_id', PERSONA).gte('fecha', DESDE).lte('fecha', HASTA)
  await sb.from('asistencia_dia').delete().eq('persona_id', PERSONA).gte('fecha', DESDE).lte('fecha', HASTA)
  await sb.from('obra_canonica').update({ estado: 'cerrada' }).eq('id', OBRA)
}

/** Deja la persona publicada, asignada a la obra de prueba, la obra abierta y los dos días limpios.
 *  Devuelve el nombre que tiene en la base: la fila se busca por ése, no por uno inventado acá. */
async function preparar(): Promise<string> {
  const sb = servicio()
  await limpiar()
  const { data } = await sb.from('personas').select('nombre_completo').eq('id', PERSONA).maybeSingle()
  const nombre = (data as { nombre_completo: string | null } | null)?.nombre_completo
  if (!nombre) throw new Error(`No existe la persona de prueba ${PERSONA}: este test no crea gente.`)
  const alta = await sb.from('personas').update({ en_la_empresa: true, es_prueba: true })
    .eq('id', PERSONA).select('id')
  if (alta.error) throw new Error(`No pude preparar a la persona: ${alta.error.message}`)
  await sb.from('obra_asignacion').delete().eq('persona_id', PERSONA)
  const asig = await sb.from('obra_asignacion')
    .insert({ obra_id: OBRA, persona_id: PERSONA, rol: 'integrante', desde: '2026-01-01' }).select('id')
  if (asig.error) throw new Error(`No pude asignarla a ${OBRA}: ${asig.error.message}`)
  const abrir = await sb.from('obra_canonica').update({ estado: 'activa' }).eq('id', OBRA).select('id')
  if (abrir.error) throw new Error(`No pude abrir ${OBRA}: ${abrir.error.message}`)
  return nombre
}

/** Marca a la persona con uno de los tres botones y guarda. Devuelve el acuse que dio la pantalla. */
async function marcar(page: import('@playwright/test').Page, nombre: string, fecha: string, boton: string) {
  await page.goto(`/campo/asistencia?obra=${OBRA}&dia=${fecha}`)
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('form-presencia')).toBeVisible()
  const fila = page.getByTestId('fila-presencia').filter({ hasText: nombre }).first()
  await fila.getByTestId(boton).click()
  await page.getByTestId('guardar-presencia').click()
  const acuse = page.getByTestId('acuse-presencia')
  await expect(acuse).toBeVisible({ timeout: 20000 })
  return await acuse.innerText()
}

test('MARCAR «Está» DEJA LA JORNADA DEL DÍA ESCRITA, Y «No vino» LA RETIRA', async ({ page }) => {
  test.skip(process.env.E2E_ESCRIBE_ASISTENCIA !== '1',
    'Escribe en registros_hh sobre la persona de prueba. Se habilita con E2E_ESCRIBE_ASISTENCIA=1.')
  test.setTimeout(120_000)
  const nombre = await preparar()
  try {
    await page.setViewportSize({ width: 390, height: 844 })
    await entrarComo(page, ADMIN.email, ADMIN.password)

    // ── EL MARTES SON 9 ──────────────────────────────────────────────────────────────────────────
    const acuseMartes = await marcar(page, nombre, MARTES, 'esta')
    expect(acuseMartes, acuseMartes).toContain('horas cargadas por defecto')
    await page.screenshot({ path: 'tests/qa-shots/presente-horas-por-defecto-390.png', fullPage: true })

    // ═══ LA EVIDENCIA ES EL DATO EN SU DESTINO ═══
    const martes = await leerDelDestino(MARTES)
    expect(martes.length, `una sola fila el ${MARTES}`).toBe(1)
    expect(Number(martes[0].horas), 'martes: la jornada por defecto es 9').toBe(9)
    expect(martes[0].tipo_hora).toBe('normal')
    expect(martes[0].obra_canonica_id, 'se imputa a la obra donde se marcó').toBe(OBRA)
    expect(martes[0].fuente_legacy, 'la marca de origen es lo único que después se puede borrar').toBe(MARCA)
    expect(martes[0].notas, 'la jornada por defecto no lleva motivo').toBeNull()

    // ── EL VIERNES SON 8: LA JORNADA LA DECIDE EL DÍA ────────────────────────────────────────────
    await marcar(page, nombre, VIERNES, 'esta')
    const viernes = await leerDelDestino(VIERNES)
    expect(viernes.length, `una sola fila el ${VIERNES}`).toBe(1)
    expect(Number(viernes[0].horas), 'viernes: la jornada por defecto es 8').toBe(8)
    expect(viernes[0].fuente_legacy).toBe(MARCA)

    // ── VOLVER A GUARDAR NO DUPLICA ──────────────────────────────────────────────────────────────
    await marcar(page, nombre, MARTES, 'esta')
    expect((await leerDelDestino(MARTES)).length, 'guardar dos veces escribió dos jornadas').toBe(1)

    // ── CORREGIR A «No vino» RETIRA LA JORNADA QUE NADIE MIRÓ ────────────────────────────────────
    await marcar(page, nombre, VIERNES, 'no-vino')
    expect(await leerDelDestino(VIERNES), 'la jornada por defecto quedó viva con la persona ausente')
      .toEqual([])
    // Y NO SE LLEVÓ PUESTO EL OTRO DÍA: el borrado es del día que se corrigió, no de la persona.
    expect((await leerDelDestino(MARTES)).length, 'el martes desapareció al corregir el viernes').toBe(1)
  } finally {
    await limpiar()
  }
})
