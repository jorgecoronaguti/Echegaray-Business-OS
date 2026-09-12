import { expect, test } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN, servicio } from './util/identidades'
import { MARCA_PRUEBA } from './util/rastro'

// ESCRIBIR UNA CELDA DE HORAS EN LA PANTALLA ESCRIBE `registros_hh` — LA EVIDENCIA QUE FALTABA.
//
// ═══ POR QUÉ NO EXISTÍA (11/09/2026) ═══
//
// La solapa Quincena es la que reemplaza a la planilla JORNALES: se teclea el número en la celda del
// día y se va. Probarlo por navegador exige escribir sobre ALGUIEN, y las dos opciones eran malas:
// sobre una persona real se le mueve el jornal a un obrero, y sobre la identidad de prueba no se
// puede porque las vistas del personal la esconden (`es_prueba`, desde el 07/09).
//
// `liquidacion-editar-en-celda.spec.ts` resolvió lo mismo creando una persona de prueba y
// declarándola `es_prueba: false` mientras corre —o sea, apagando el filtro—. Anda, pero deja una
// ventana en la que una fila de Playwright es indistinguible de un obrero en la base real.
//
// La regla del 12/09/2026 lo arregla del lado correcto: **una cuenta de prueba ve a las personas de
// prueba; una cuenta real no** (migración `20260912T1200`). Este spec es su consumidor: entra con la
// identidad ADMIN —que es `perfiles.es_prueba = true`— y escribe sobre «[PRUEBA E2E] QA Campo», que
// sigue marcada como prueba todo el tiempo. Ninguna cuenta real ve nada de esto.
//
// ═══ QUÉ MIDE, Y DÓNDE ═══
//
// La pantalla no es evidencia de nada: un `200` y un número dibujado no prueban una escritura (este
// repo ya pagó el 204 de PostgREST que no escribió). Cada uno de los tres gestos —cargar 7,5;
// corregir a 8; vaciar— se verifica LEYENDO `registros_hh` con el service role, que es el destino.
//
// Y se verifica lo que la fila DICE, no sólo el número: `tipo_hora = 'normal'` y una obra resuelta.
// Un jornal sin obra no se puede imputar a ningún costo, y uno con el tipo equivocado se paga
// distinto. `guardarHorasDeLaCelda` deduce la obra de la asignación: si eso se rompiera, la celda
// seguiría mostrando el 7,5 igual.

/** La identidad de `tests/util/identidades.ts`. NO se toca su `es_prueba`: ése es el punto. */
const PERSONA = 'e2e00000-0000-4000-8000-000000000001'
/** Una obra propia del spec: imputarle horas a una obra real ensuciaría su costo de mano de obra. */
const OBRA = 'e2e00000-0000-4000-8000-0000000000e1'

const PRIMERO = 7.5
const DESPUES = 8

function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}
function correr(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
/** La quincena en curso, con el mismo corte que `quincenaDe()`: 1–15 y 16–fin. */
function quincenaEnCurso(): { desde: string; hasta: string } {
  const hoy = hoyISO()
  const [a, m] = hoy.split('-')
  const dia = Number(hoy.slice(8, 10))
  const ultimo = new Date(Date.UTC(Number(a), Number(m), 0)).getUTCDate()
  return dia <= 15
    ? { desde: `${a}-${m}-01`, hasta: `${a}-${m}-15` }
    : { desde: `${a}-${m}-16`, hasta: `${a}-${m}-${ultimo}` }
}
/** Un día HÁBIL de la quincena en curso: sábado y domingo no se cargan y la celda se dibuja igual. */
function diaHabil(q: { desde: string; hasta: string }): string {
  for (let i = 0; i < 16; i++) {
    const f = correr(hoyISO(), -i)
    const dow = new Date(`${f}T12:00:00Z`).getUTCDay()
    if (f >= q.desde && f <= q.hasta && dow !== 0 && dow !== 6) return f
  }
  return q.desde
}

const Q = quincenaEnCurso()
const DIA = diaHabil(Q)

/**
 * ¿ESTÁ APLICADA LA MIGRACIÓN? Se le pregunta a la base, no al repositorio: una migración commiteada
 * no es una columna aplicada, y este spec no puede pasar sin ella (la persona no se dibuja).
 */
async function reglaAplicada(): Promise<boolean> {
  const { error } = await servicio().rpc('sesion_es_de_prueba')
  return !error
}

async function preparar(): Promise<void> {
  const sb = servicio()
  // LA PERSONA TIENE QUE EXISTIR Y SEGUIR MARCADA COMO PRUEBA. Si alguien la «arregló» poniéndole
  // `es_prueba: false`, este spec estaría escribiendo sobre una fila que el producto trata como un
  // obrero: se para acá.
  const p = await sb.from('personas').select('id, es_prueba, en_la_empresa').eq('id', PERSONA).maybeSingle()
  const fila = p.data as { es_prueba: boolean; en_la_empresa: boolean } | null
  if (!fila) throw new Error(`No existe la persona de prueba ${PERSONA}: la crea el fixture de E2E`)
  if (fila.es_prueba !== true) {
    throw new Error('La persona de prueba dejó de estar marcada como prueba: no escribo sobre ella')
  }
  if (!fila.en_la_empresa) {
    const r = await sb.from('personas').update({ en_la_empresa: true }).eq('id', PERSONA).select('id')
    if (r.error) throw new Error(`No pude reactivarla: ${r.error.message}`)
  }

  const obra = await sb.from('obra_canonica').upsert({
    id: OBRA, nombre: `${MARCA_PRUEBA} obra de la celda de quincena`, estado: 'activa', jornada_horas: 8,
  }).select('id')
  if (obra.error) throw new Error(`No pude crear la obra: ${obra.error.message}`)

  // LA ASIGNACIÓN ES LO QUE HACE DEDUCIBLE LA OBRA. Sin ella `guardarHorasDeLaCelda` rechaza el día
  // —y hace bien: adivinar movería costo de mano de obra entre obras—, y el spec mediría el rechazo.
  await sb.from('obra_asignacion').delete().eq('persona_id', PERSONA)
  const asignada = await sb.from('obra_asignacion').insert({
    obra_id: OBRA, persona_id: PERSONA, desde: correr(Q.desde, -30), hasta: null,
  }).select('id')
  if (asignada.error) throw new Error(`No pude asignarla a la obra: ${asignada.error.message}`)

  // Y LA TARIFA ES LO QUE LA HACE APARECER EN LA SOLAPA. `plantelDeLaQuincena` sólo dibuja a quien
  // tiene actividad en la quincena, y una persona sin horas todavía no la tiene: la tarifa nueva es
  // una de las cuatro evidencias. Sin esto la fila no existe y no hay celda que tocar.
  await sb.from('persona_tarifa').delete().eq('persona_id', PERSONA)
  const tarifa = await sb.from('persona_tarifa').insert({
    persona_id: PERSONA, desde: Q.desde, valor_hora: 1000, origen: 'e2e',
  }).select('id')
  if (tarifa.error) throw new Error(`No pude cargarle una tarifa: ${tarifa.error.message}`)

  await limpiarHoras()
}

/** Los rastros del día. Se borra ANTES y DESPUÉS: un día colgado de una corrida anterior mentiría. */
async function limpiarHoras(): Promise<void> {
  const sb = servicio()
  const suyos = await sb.from('registros_hh').select('id').eq('persona_id', PERSONA)
  const ids = ((suyos.data ?? []) as { id: string }[]).map((r) => r.id)
  if (ids.length > 0) await sb.from('registro_hh_correccion').delete().in('registro_id', ids)
  await sb.from('registros_hh').delete().eq('persona_id', PERSONA)
  await sb.from('asistencia_dia').delete().eq('persona_id', PERSONA)
}

async function limpiar(): Promise<void> {
  const sb = servicio()
  await limpiarHoras()
  await sb.from('persona_tarifa').delete().eq('persona_id', PERSONA)
  await sb.from('obra_asignacion').delete().eq('persona_id', PERSONA)
  await sb.from('obra_canonica').delete().eq('id', OBRA)
  // LA PERSONA NO SE BORRA NI SE DESACTIVA: es la identidad con la que corre la suite. Lo único que
  // la esconde del producto es `es_prueba`, que nunca se tocó.
}

/** La fila del día, leída del DESTINO. `null` si no existe: es una respuesta, no un error. */
async function filaDelDia(): Promise<{ horas: number | null; tipo: string | null; obra: string | null } | null> {
  const { data } = await servicio().from('registros_hh')
    .select('horas, tipo_hora, obra_canonica_id').eq('persona_id', PERSONA).eq('fecha', DIA)
  const filas = (data ?? []) as { horas: number | null; tipo_hora: string | null; obra_canonica_id: string | null }[]
  if (filas.length !== 1) return null
  return {
    horas: filas[0].horas == null ? null : Number(filas[0].horas),
    tipo: filas[0].tipo_hora,
    obra: filas[0].obra_canonica_id,
  }
}

// EL PRIMER `goto` COMPILA LA PANTALLA: en dev con webpack pasa de 30 s y el rojo señalaría un
// servidor frío, no un defecto. Mismo número que los otros specs de Liquidación.
test.describe.configure({ mode: 'serial', timeout: 240_000 })

let aplicada = false

test.beforeAll(async () => {
  test.setTimeout(120_000)
  aplicada = await reglaAplicada()
  if (aplicada) await preparar()
})

test.afterAll(async () => {
  test.setTimeout(180_000)
  if (aplicada) await limpiar()
})

test('teclear una celda de la quincena crea, corrige y vacía el jornal en `registros_hh`', async ({ page }) => {
  // SIN LA MIGRACIÓN APLICADA ESTO NO SE PUEDE MEDIR, Y NO SE FINGE QUE SÍ. La persona de prueba no
  // se dibuja en la pantalla, así que no hay celda: el spec dice por qué se saltea en vez de dar un
  // verde que no probó nada. Se aplica `supabase/migrations/20260912T1200_…` y vuelve a correr.
  test.skip(!aplicada,
    'la migración 20260912T1200 (`sesion_es_de_prueba`) no está aplicada: la persona de prueba no '
    + 'aparece en la pantalla y no hay celda que teclear')

  const celdaId = `espejo-dia-${PERSONA}-${DIA}`
  await page.setViewportSize({ width: 1440, height: 1000 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto(`/administracion/personas?vista=liquidacion&solapa=quincena&quincena=${Q.desde}`)
  await expect(page.getByTestId('espejo-tabla')).toBeVisible({ timeout: 90_000 })

  // LA FILA DE LA PERSONA DE PRUEBA, NUNCA `.first()`: la grilla muestra el plantel entero y un
  // `.first()` ya le escribió una licencia a un empleado real en este repo.
  await expect(
    page.getByTestId(`espejo-fila-${PERSONA}`),
    'la identidad de prueba tiene que verse para una cuenta de prueba (migración 20260912T1200)',
  ).toBeVisible({ timeout: 60_000 })

  const celda = page.getByTestId(celdaId)
  await expect(celda, `la celda del ${DIA} tiene que ser editable`).toBeVisible({ timeout: 60_000 })
  expect(await filaDelDia(), 'el día tiene que arrancar sin ninguna fila').toBeNull()

  // ── 1 · EL DÍA VACÍO SE CARGA ─────────────────────────────────────────────────────────────────
  //
  // Un clic anterior a la hidratación no abre el campo y no deja rastro: por eso se reintenta en vez
  // de esperar más a un campo que ya nunca va a aparecer.
  await expect(async () => {
    await celda.click()
    await expect(page.getByTestId(`${celdaId}-campo`)).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 60_000 })
  await page.getByTestId(`${celdaId}-campo`).fill(String(PRIMERO))
  await page.getByTestId(`${celdaId}-campo`).press('Enter')

  // EL ACUSE: `data-pendiente` aparece cuando la acción contestó OK y el re-render todavía no llegó.
  // Es la ventana en la que la celda antes volvía al valor viejo y el dueño creía que no guardaba.
  await expect(celda).toHaveAttribute('data-pendiente', '1', { timeout: 60_000 })
  await expect(page.getByTestId(`${celdaId}-error`), 'la celda no puede acusar un error').toHaveCount(0)

  // EL EFECTO, EN EL DESTINO. Y la fila entera, no sólo el número.
  await expect.poll(async () => (await filaDelDia())?.horas ?? null, { timeout: 30_000 }).toBe(PRIMERO)
  const creada = await filaDelDia()
  expect(creada?.tipo, 'un jornal de la celda es hora normal').toBe('normal')
  expect(creada?.obra, 'sin obra el jornal no se puede imputar a ningún costo').toBe(OBRA)

  // ── 2 · Y SE CORRIGE, SOBRE LA MISMA FILA ─────────────────────────────────────────────────────
  await expect(async () => {
    await celda.click()
    await expect(page.getByTestId(`${celdaId}-campo`)).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 60_000 })
  await page.getByTestId(`${celdaId}-campo`).fill(String(DESPUES))
  await page.getByTestId(`${celdaId}-campo`).press('Enter')
  await expect(page.getByTestId(`${celdaId}-error`)).toHaveCount(0)
  await expect.poll(async () => (await filaDelDia())?.horas ?? null, { timeout: 30_000 }).toBe(DESPUES)

  // CORREGIR NO ES PISAR: sin la fila del historial nadie puede decir de cuánto se venía.
  const rastro = await servicio().from('registro_hh_correccion')
    .select('horas_antes, horas_despues').order('corregido_en', { ascending: false }).limit(1)
  const ultimo = ((rastro.data ?? []) as { horas_antes: number; horas_despues: number }[])[0]
  expect(Number(ultimo?.horas_antes), 'la corrección tiene que declarar de cuánto venía').toBe(PRIMERO)
  expect(Number(ultimo?.horas_despues)).toBe(DESPUES)

  // ── 3 · VACIAR DEJA EL DÍA SIN HORAS, Y NO EN CERO ────────────────────────────────────────────
  //
  // «Todavía no lo cargué» y «no trabajó» son dos afirmaciones distintas y una de las dos se
  // liquida. `horas` es NOT NULL en la base, así que vaciar BORRA la fila: el día vuelve a
  // «todavía no lo cargué» (sin fila), nunca a 0 h.
  await expect(async () => {
    await celda.click()
    await expect(page.getByTestId(`${celdaId}-campo`)).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 60_000 })
  await page.getByTestId(`${celdaId}-campo`).fill('')
  await page.getByTestId(`${celdaId}-campo`).press('Enter')
  await expect(page.getByTestId(`${celdaId}-error`)).toHaveCount(0)
  await expect.poll(async () => {
    const f = await filaDelDia()
    return f === null ? 'sin fila' : f.horas
  }, { timeout: 30_000 }).toBe('sin fila')

  // Y RECARGANDO: lo que se ve después de volver a pedir la pantalla sale de la base, no del estado
  // optimista que quedó en el navegador. Es el paso que hace el dueño y el que ningún caso medía.
  await page.reload()
  await expect(page.getByTestId(celdaId)).toBeVisible({ timeout: 90_000 })
  expect(await filaDelDia(), 'después de recargar el día sigue sin fila').toBeNull()
})
