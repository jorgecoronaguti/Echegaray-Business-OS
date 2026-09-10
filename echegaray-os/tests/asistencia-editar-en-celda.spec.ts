import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN, JEFE, servicio } from './util/identidades'
import { MARCA_PRUEBA } from './util/rastro'

// LA EVIDENCIA DEL EFECTO DE LA SEGUNDA MITAD DEL PEDIDO DEL DUEÑO (10/09/2026).
//
// Tres cosas que ninguna función pura puede probar, porque las tres son escrituras que atraviesan
// la sesión, la RLS y un trigger `security definer`:
//
//   a · en PLANTEL se marca «Presente» y se QUITA: la fila vuelve a «sin marcar», las horas que ya
//       estaban cargadas no se tocan, y el rastro (`asistencia_dia_retiro`) queda con AUTOR — o
//       sea, `auth.uid()` llegó hasta el trigger. Un rastro con autor nulo es un rastro que no
//       sirve para lo único que se escribió.
//   b · en ASISTENCIA se programa una LICENCIA a futuro desde el casillero y se la libera con «Sin
//       novedad»: la celda vuelve a «·» y en la base no queda ni la hora ni la declaración.
//   c · en ASISTENCIA se editan las HORAS de un día pasado desde el casillero (8 → 9) y queda el
//       rastro en `registro_hh_correccion`.
//
// TODO SOBRE DATOS FABRICADOS. Persona ZZ-E2E propia y obra ZZ-E2E propia, activas mientras dura la
// prueba y borradas al final: la corrida del 07/09 dejó 77,4 HH que nadie trabajó en una obra viva,
// y esa obra alimenta el margen forecast.

const OBRA = 'zz-e2e-celda00-0000-4000-8000-0000000000c1'.slice(0, 36)
const PERSONA = 'e2e00000-0000-4000-8000-0000000000c1'
const NOMBRE = `${MARCA_PRUEBA} celda de asistencia`

/** El día de HOY como lo ve el servidor (America/Argentina/Buenos_Aires), en ISO. */
function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}
function correr(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
/** El primer día HÁBIL a partir de `iso` en la dirección `paso`. Sábado y domingo no se cargan. */
function habil(iso: string, paso: number): string {
  let f = iso
  for (let i = 0; i < 7; i++) {
    const d = new Date(`${f}T12:00:00Z`).getUTCDay()
    if (d !== 0 && d !== 6) return f
    f = correr(f, paso)
  }
  return f
}

const HOY = hoyISO()
const PASADO = habil(correr(HOY, -1), -1)
const FUTURO = habil(correr(HOY, 1), 1)

async function preparar(): Promise<string> {
  const sb = servicio()
  // `es_prueba: false` A PROPÓSITO Y SÓLO ACÁ: `persona_directorio` —la vista que dibuja PLANTEL—
  // filtra a las de prueba, así que con la marca puesta la fila no existiría y (a) no se podría
  // medir en la pantalla real. Se borra entera en `limpiar()`, y el nombre lleva ZZ-E2E adelante
  // para que, si una corrida se corta, se vea de un vistazo qué es y de dónde salió.
  const alta = await sb.from('personas').upsert({
    id: PERSONA, nombre_completo: NOMBRE, es_prueba: false, en_la_empresa: true,
  }).select('id')
  if (alta.error) throw new Error(`No pude crear la persona: ${alta.error.message}`)
  const obra = await sb.from('obra_canonica').upsert({
    id: OBRA, nombre: `${MARCA_PRUEBA} obra de la celda`, estado: 'activa', jornada_horas: 8,
  }).select('id')
  if (obra.error) throw new Error(`No pude crear la obra: ${obra.error.message}`)
  await sb.from('obra_asignacion').delete().eq('persona_id', PERSONA)
  const asig = await sb.from('obra_asignacion').insert({
    obra_id: OBRA, persona_id: PERSONA, rol: 'integrante', desde: '2026-01-01',
  }).select('id')
  if (asig.error) throw new Error(`No pude asignar: ${asig.error.message}`)
  const { data: usuarios } = await sb.from('perfiles').select('id').limit(50)
  for (const u of (usuarios ?? []) as { id: string }[]) {
    await sb.from('usuario_obra').upsert(
      { usuario_id: u.id, obra_canonica_id: OBRA, papel: 'jefe' },
      { onConflict: 'usuario_id,obra_canonica_id' },
    )
  }
  await limpiarDatosDelDia()
  // EL DÍA PASADO CON 8 HORAS: es lo que (c) va a corregir a 9, y lo que (a) mira para probar que
  // quitar el PRESENTE no toca las HORAS. Son dos fuentes distintas y ése es todo el punto.
  const hh = await sb.from('registros_hh').insert({
    persona_id: PERSONA, obra_canonica_id: OBRA, fecha: PASADO, horas: 8, tipo_hora: 'normal', fuente_legacy: 'e2e',
  }).select('id')
  if (hh.error) throw new Error(`No pude cargar las 8 horas: ${hh.error.message}`)
  return PERSONA
}

async function limpiarDatosDelDia(): Promise<void> {
  const sb = servicio()
  await sb.from('registros_hh').delete().eq('persona_id', PERSONA)
  await sb.from('asistencia_dia').delete().eq('persona_id', PERSONA)
}

async function limpiar(): Promise<void> {
  const sb = servicio()
  await limpiarDatosDelDia()
  // ═══ SI LA MARCA NO SE PUEDE BORRAR, LA PERSONA SE ESCONDE ═══
  //
  // El trigger `asistencia_dia_rastro_retiro` rechaza TODO borrado de `asistencia_dia` mientras
  // `asistencia_dia_retiro.obra_canonica_id` sea `uuid` (ver la migración 20260910T1830). Con la
  // fila en pie, `personas` no se puede borrar por la FK — y esta persona entra al PLANTEL REAL,
  // porque medir (a) exige que la vista la publique. Antes de rendirse se la marca como prueba y
  // fuera de la empresa: sale de `persona_directorio` y de cualquier listado del dueño.
  const queda = await sb.from('asistencia_dia').select('fecha').eq('persona_id', PERSONA)
  if ((queda.data ?? []).length > 0) {
    await sb.from('personas').update({ es_prueba: true, en_la_empresa: false }).eq('id', PERSONA)
  }
  await sb.from('asistencia_dia_retiro').delete().eq('persona_id', PERSONA)
  await sb.from('obra_asignacion').delete().eq('persona_id', PERSONA)
  await sb.from('usuario_obra').delete().eq('obra_canonica_id', OBRA)
  await sb.from('obra_canonica').delete().eq('id', OBRA)
  await sb.from('personas').delete().eq('id', PERSONA)
}

// ═══ EL LOCATOR SE ACOTA A LA FILA DE LA PERSONA DE PRUEBA, SIEMPRE ═══
//
// La primera corrida usó `page.locator(...).first()` para buscar el casillero del día: la grilla
// muestra la quincena ENTERA de la empresa —el filtro por obra de la URL no achica las filas—, así
// que `.first()` cayó sobre la primera fila de la tabla, que es un EMPLEADO REAL, y le escribió una
// licencia. Un test que escribe se acota a su propia fila o no se corre.
const fila = (page: import('@playwright/test').Page) =>
  page.getByTestId('fila-quincena').filter({ hasText: 'celda de asistencia' }).first()

test.describe.configure({ mode: 'serial' })
test.beforeAll(preparar)
test.afterAll(limpiar)

test('a · en Plantel se marca presente y se QUITA: vuelve a sin marcar, las horas quedan, el rastro tiene autor', async ({ page }) => {
  const sb = servicio()
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/administracion/personas')
  const fila = page.getByTestId('fila-persona').filter({ hasText: 'celda de asistencia' }).first()
  await expect(fila).toBeVisible({ timeout: 30_000 })

  await fila.getByTestId('marcar-presente').click()
  await expect(fila.getByTestId('marcado-presente')).toBeVisible({ timeout: 30_000 })
  // EL EFECTO EN LA BASE, no la pantalla que dijo que sí.
  const marcada = await sb.from('asistencia_dia').select('estado').eq('persona_id', PERSONA).eq('fecha', HOY).maybeSingle()
  expect(marcada.data?.estado, 'la marca tiene que estar en asistencia_dia').toBe('presente')

  await page.reload()
  const fila2 = page.getByTestId('fila-persona').filter({ hasText: 'celda de asistencia' }).first()
  await expect(fila2.getByTestId('quitar-presente')).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: 'qa-shots/celda-a-plantel-presente-1440.png' })
  await fila2.getByTestId('quitar-presente').click()
  await expect(fila2.getByTestId('presente-quitado')).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: 'qa-shots/celda-a-plantel-quitado-1440.png' })

  const despues = await sb.from('asistencia_dia').select('estado').eq('persona_id', PERSONA).eq('fecha', HOY)
  expect(despues.data ?? [], 'la marca se fue de asistencia_dia').toHaveLength(0)
  // LAS HORAS NO SE TOCAN. Asistencia y horas son dos fuentes: quitar una no puede borrar la otra.
  const horas = await sb.from('registros_hh').select('horas').eq('persona_id', PERSONA).eq('fecha', PASADO)
  expect(horas.data?.[0]?.horas, 'las 8 horas del día pasado siguen ahí').toBe(8)
  // EL RASTRO CON AUTOR: prueba que `auth.uid()` llegó hasta el trigger `security definer`. Con
  // autor nulo el rastro existe y no sirve — nadie puede decir quién sacó la marca.
  const rastro = await sb.from('asistencia_dia_retiro')
    .select('autor, estado_antes, fecha').eq('persona_id', PERSONA).order('retirado_en', { ascending: false })
  expect(rastro.data ?? [], 'el trigger escribió el retiro').not.toHaveLength(0)
  expect(rastro.data?.[0]?.autor, 'el autor del retiro no puede ser nulo').not.toBeNull()
  expect(rastro.data?.[0]?.estado_antes).toBe('presente')
})

test('b · una licencia a futuro se programa desde el casillero y se libera con «sin novedad»', async ({ page }) => {
  const sb = servicio()
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto(`/administracion/personas?vista=asistencia&obra=${OBRA}`)
  await expect(page.getByTestId('grilla-asistencia')).toBeVisible({ timeout: 30_000 })

  // EL CASILLERO DEL DÍA FUTURO. Se busca por su `aria-label`, que lleva la fecha: en una quincena
  // de quince columnas el índice no dice nada y el día equivocado ya se corrigió una vez.
  const abrir = fila(page).locator(`[aria-label*="${FUTURO}"][data-testid="celda-abrir-editor"]`).first()
  await expect(abrir, `tiene que existir el casillero del ${FUTURO}`).toBeVisible({ timeout: 30_000 })
  await abrir.click()
  await expect(page.getByTestId('editor-celda')).toBeVisible()
  await page.screenshot({ path: 'qa-shots/celda-b-editor-abierto-1440.png' })
  await page.getByTestId('editor-celda-estado').selectOption({ value: 'no_vino:enfermedad' })

  await expect.poll(async () => {
    const r = await sb.from('asistencia_dia').select('estado').eq('persona_id', PERSONA).eq('fecha', FUTURO)
    return r.data?.[0]?.estado ?? null
  }, { timeout: 20_000 }).toBe('licencia')
  await page.screenshot({ path: 'qa-shots/celda-b-licencia-futuro-1440.png' })

  // ── LIBERAR EL DÍA ──────────────────────────────────────────────────────────
  await page.reload()
  const otraVez = fila(page).locator(`[aria-label*="${FUTURO}"][data-testid="celda-abrir-editor"]`).first()
  await expect(otraVez).toBeVisible({ timeout: 30_000 })
  await otraVez.click()
  await page.getByTestId('editor-celda-estado').selectOption({ value: 'sin_novedad' })

  await expect.poll(async () => {
    const r = await sb.from('asistencia_dia').select('estado').eq('persona_id', PERSONA).eq('fecha', FUTURO)
    return r.data?.length ?? -1
  }, { timeout: 20_000 }).toBe(0)
  const hh = await sb.from('registros_hh').select('id').eq('persona_id', PERSONA).eq('fecha', FUTURO)
  expect(hh.data ?? [], 'sin novedad no deja ni horas').toHaveLength(0)
  await page.reload()
  await expect(page.getByTestId('grilla-asistencia')).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: 'qa-shots/celda-b-sin-novedad-1440.png' })
})

test('c · las horas de un día pasado se corrigen en el casillero: 8 → 9, con rastro', async ({ page }) => {
  const sb = servicio()
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto(`/administracion/personas?vista=asistencia&obra=${OBRA}`)
  await expect(page.getByTestId('grilla-asistencia')).toBeVisible({ timeout: 30_000 })

  const abrir = fila(page).locator(`[aria-label*="${PASADO}"][data-testid="celda-abrir-editor"]`).first()
  await expect(abrir).toBeVisible({ timeout: 30_000 })
  await abrir.click()
  await page.getByTestId('editor-celda-horas').click()
  const campo = page.getByTestId('editor-celda-horas-campo')
  await expect(campo).toBeVisible()
  await campo.fill('9')
  await page.screenshot({ path: 'qa-shots/celda-c-editando-horas-1440.png' })
  await campo.press('Enter')

  await expect.poll(async () => {
    const r = await sb.from('registros_hh').select('horas').eq('persona_id', PERSONA).eq('fecha', PASADO)
    return r.data?.[0]?.horas ?? null
  }, { timeout: 20_000 }).toBe(9)
  // ═══ QUÉ RASTRO DEJA ESTE CAMINO, Y CUÁL NO ═══
  //
  // El casillero escribe con `corregirJornada` —la misma acción del panel—, y su rastro es
  // `registros_hh.actualizado_por`, que lo pone el trigger `set_actualizado_en()` con la identidad
  // de la sesión. NO escribe `registro_hh_correccion`: esa tabla la llena `corregirHorasDelDia`, la
  // puerta de LIQUIDACIÓN, que exige `liquidaSueldos` — y mandar la grilla por ahí le sacaría al
  // jefe de obra la corrección de horas, que es su trabajo. Lo que se mide es el rastro que este
  // camino sí produce; el otro queda declarado como límite.
  const tocado = await sb.from('registros_hh').select('actualizado_por, horas')
    .eq('persona_id', PERSONA).eq('fecha', PASADO).maybeSingle()
  expect(tocado.data?.actualizado_por, 'la corrección deja autor en registros_hh').not.toBeNull()
  await page.reload()
  await expect(page.getByTestId('grilla-asistencia')).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: 'qa-shots/celda-c-nueve-horas-1440.png' })
})

test('d · el jefe de obra ve la grilla y el casillero se puede abrir', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarComo(page, JEFE.email, JEFE.password)
  await page.goto(`/administracion/personas?vista=asistencia&obra=${OBRA}`)
  await expect(page.getByTestId('grilla-asistencia')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-testid="celda-abrir-editor"]').first()).toBeVisible()
})
