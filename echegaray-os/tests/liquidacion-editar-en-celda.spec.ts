import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN, servicio } from './util/identidades'
import { MARCA_PRUEBA } from './util/rastro'

// «TODO EL MÓDULO DE LIQUIDACIÓN ESTÁ INUTILIZABLE Y NO SE PUEDE EDITAR NADA» (dueño, 10/09/2026).
//
// ═══ QUÉ SE MIDE, Y POR QUÉ NO ALCANZABA CON LEER LA BASE ═══
//
// La escritura NUNCA estuvo rota: `registros_hh` pasaba de 8 a 6 y `registro_hh_correccion` guardaba
// el rastro. Lo que estaba roto era lo que se veía: la celda volvía a dibujar el valor anterior
// apenas se soltaba el campo, y recién mostraba el nuevo entre diez y veinte segundos después,
// cuando llegaba el re-render de `revalidatePath`. Un test que sólo consultara la base habría dado
// verde sobre la pantalla que el dueño llamó inutilizable.
//
// Por eso se mide en dos lugares y en este orden:
//   1 · la celda muestra el valor nuevo MIENTRAS el servidor todavía no lo confirmó
//       (`data-pendiente="1"`, que es exactamente la ventana en la que antes mostraba el viejo);
//   2 · y `registros_hh` dice 6, leído del destino y no de la pantalla que dijo que sí.
//
// ═══ SOBRE DATOS FABRICADOS ═══
//
// Persona y obra ZZ-E2E propias, y las 8 horas las carga la prueba. `es_prueba: false` mientras
// corre —igual que `asistencia-editar-en-celda.spec.ts`— porque `persona_directorio` filtra a las de
// prueba y sin eso la fila no existiría en la grilla real que hay que medir. La guarda
// `orquestador/lib/personas-de-prueba.test.mjs` perdona un día justamente por esta ventana.

const OBRA = 'e2e00000-0000-4000-8000-0000000000d1'
const PERSONA = 'e2e00000-0000-4000-8000-0000000000d1'
const NOMBRE = `${MARCA_PRUEBA} celda de liquidacion`
/** Las horas que carga la prueba y las que va a escribir la edición. Ni una ni otra existían antes. */
const ANTES = 8
const DESPUES = 6

function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}
function correr(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
/** Un día HÁBIL de la quincena en curso: el sábado y el domingo no se cargan. */
function diaHabilDeLaQuincena(): string {
  const hoy = hoyISO()
  const dentro = (f: string) => (Number(hoy.slice(8, 10)) <= 15
    ? Number(f.slice(8, 10)) >= 1 && Number(f.slice(8, 10)) <= 15
    : Number(f.slice(8, 10)) >= 16)
  for (let i = 0; i < 15; i++) {
    const f = correr(hoy, -i)
    const dow = new Date(`${f}T12:00:00Z`).getUTCDay()
    if (dow !== 0 && dow !== 6 && dentro(f)) return f
  }
  return hoy
}
const DIA = diaHabilDeLaQuincena()

async function preparar(): Promise<void> {
  const sb = servicio()
  const alta = await sb.from('personas').upsert({
    id: PERSONA, nombre_completo: NOMBRE, es_prueba: false, en_la_empresa: true,
  }).select('id')
  if (alta.error) throw new Error(`No pude crear la persona: ${alta.error.message}`)
  const obra = await sb.from('obra_canonica').upsert({
    id: OBRA, nombre: `${MARCA_PRUEBA} obra de liquidacion`, estado: 'activa', jornada_horas: 8,
  }).select('id')
  if (obra.error) throw new Error(`No pude crear la obra: ${obra.error.message}`)
  await sb.from('registros_hh').delete().eq('persona_id', PERSONA)
  const hh = await sb.from('registros_hh').insert({
    persona_id: PERSONA, obra_canonica_id: OBRA, fecha: DIA, horas: ANTES,
    tipo_hora: 'normal', fuente_legacy: 'e2e',
  }).select('id')
  if (hh.error) throw new Error(`No pude cargar las ${ANTES} horas: ${hh.error.message}`)
}

async function limpiar(): Promise<void> {
  const sb = servicio()
  const suyos = await sb.from('registros_hh').select('id').eq('persona_id', PERSONA)
  const ids = ((suyos.data ?? []) as { id: string }[]).map((r) => r.id)
  if (ids.length > 0) await sb.from('registro_hh_correccion').delete().in('registro_id', ids)
  await sb.from('registros_hh').delete().eq('persona_id', PERSONA)
  await sb.from('asistencia_dia').delete().eq('persona_id', PERSONA)
  await sb.from('obra_asignacion').delete().eq('persona_id', PERSONA)
  // SI LA PERSONA NO SE PUEDE BORRAR, SE ESCONDE: `es_prueba` es lo que `persona_directorio` mira.
  await sb.from('personas').update({ es_prueba: true, en_la_empresa: false }).eq('id', PERSONA)
  await sb.from('personas').delete().eq('id', PERSONA)
  await sb.from('obra_canonica').delete().eq('id', OBRA)
}

// EL PRIMER `goto` DE LA PANTALLA LA COMPILA. En dev con webpack eso pasa de 30 s y el rojo no
// señala un defecto: señala que el servidor estaba frío. Es el mismo motivo —y el mismo número— que
// `liquidacion-fidelidad.spec.ts` documenta para sus casos.
test.describe.configure({ mode: 'serial', timeout: 180_000 })
// LOS HOOKS NO HEREDAN EL TIMEOUT DEL `configure`, Y ACÁ ESCRIBEN EN LA BASE REAL. Con 30 s, un
// `insert` en `registros_hh` que tarda —la base dio «canceling statement due to statement timeout»
// el 11/09/2026— deja el spec en rojo sin que nada del producto esté mal, y peor: `afterAll`
// también se corta y la persona de prueba queda VISIBLE en el plantel. Se extienden los dos, y el
// de limpieza más que el de alta: no dejar basura pesa más que fallar rápido.
test.beforeAll(async () => {
  test.setTimeout(120_000)
  await preparar()
})
test.afterAll(async () => {
  test.setTimeout(180_000)
  await limpiar()
})

test('corregir las horas de un día se ve en la celda antes de que el servidor conteste, y queda en la base', async ({ page }) => {
  const sb = servicio()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/administracion/personas?vista=liquidacion&solapa=horas')
  await expect(page.getByTestId('vista-horas')).toBeVisible({ timeout: 60_000 })

  // LA FILA DE LA PERSONA DE PRUEBA, NUNCA `.first()`: la grilla muestra el plantel entero y
  // `.first()` ya le escribió una licencia a un empleado real en este repo.
  const fila = page.locator(`[data-testid="fila-${PERSONA}"]`)
  await expect(fila, 'la persona de prueba tiene que estar en la grilla').toBeVisible({ timeout: 60_000 })
  // ═══ UN CLIC ANTES DE LA HIDRATACIÓN NO ABRE NADA, Y NO DEJA RASTRO ═══
  //
  // 11/09/2026, corriendo este spec junto a `liquidacion-fidelidad` con dos workers sobre un solo
  // `next dev`: la fila existía, el clic salía, y `panel-persona` no aparecía nunca. No era un dato
  // faltante —`porPersona` y las filas se arman del MISMO `directorioFilas`, no pueden diferir—:
  // era el clic cayendo sobre el HTML del servidor antes de que React enganchara su `onClick`. El
  // manejador se pierde y la pantalla no dice nada, que es la queja del dueño vista desde adentro.
  //
  // Se reintenta en vez de esperar más: `toBeVisible` con un timeout más largo espera un panel que
  // ya nunca va a abrirse, porque el clic que lo abría se perdió.
  await expect(async () => {
    await fila.click()
    await expect(page.getByTestId('panel-persona')).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 60_000 })

  const suyos = await sb.from('registros_hh').select('id').eq('persona_id', PERSONA)
  const registroId = ((suyos.data ?? []) as { id: string }[])[0]?.id
  expect(registroId, 'la prueba tiene que haber cargado su día').toBeTruthy()

  const celda = page.getByTestId(`hh-${registroId}`)
  await expect(celda).toHaveText(String(ANTES), { timeout: 30_000 })
  await celda.click()
  await page.getByTestId(`hh-${registroId}-campo`).fill(String(DESPUES))
  await page.getByTestId(`hh-${registroId}-campo`).press('Enter')

  // 1 · EL DEFECTO: mientras el servidor no confirmó, la celda tiene que mostrar LO QUE SE ESCRIBIÓ.
  // Sin el arreglo, `data-pendiente` no existe y acá se cae — que es exactamente lo que veía el
  // dueño: el número volviendo solo al valor anterior.
  await expect(celda).toHaveAttribute('data-pendiente', '1', { timeout: 60_000 })
  await expect(celda, 'la celda volvió al valor anterior después de guardar').toHaveText(String(DESPUES))
  await expect(page.getByTestId(`hh-${registroId}-error`)).toHaveCount(0)

  // 2 · EL EFECTO EN EL DESTINO, no la pantalla que dijo que sí.
  await expect.poll(async () => {
    const { data } = await sb.from('registros_hh').select('horas').eq('id', registroId).maybeSingle()
    return Number((data as { horas: number } | null)?.horas ?? -1)
  }, { timeout: 30_000 }).toBe(DESPUES)

  // 3 · Y EL RASTRO: corregir no es pisar. Sin la fila del historial nadie puede decir de cuánto se venía.
  const rastro = await sb.from('registro_hh_correccion')
    .select('horas_antes, horas_despues, autor').eq('registro_id', registroId)
  expect(rastro.data ?? [], 'la corrección tiene que dejar rastro').toHaveLength(1)
  expect(Number(rastro.data?.[0]?.horas_antes)).toBe(ANTES)
  expect(Number(rastro.data?.[0]?.horas_despues)).toBe(DESPUES)
  expect(rastro.data?.[0]?.autor, 'el autor de la corrección no puede ser nulo').not.toBeNull()
})

// ═══ LA CELDA DE LA GRILLA, SIN ABRIR EL PANEL (dueño, 11/09/2026) ═══
//
// Textual: *«tenés que permitirme editar en cada celda de ahí de la sección Horas del módulo
// Personal, no sé por qué me quitaste esa opción»*. Hasta hoy esta grilla era de sólo lectura
// entera: el número estaba a la vista y para corregirlo había que hacer clic en la persona, esperar
// el panel y buscar el día en la lista de abajo.
//
// Este caso NO abre el panel a propósito: si lo abriera estaría midiendo el camino que ya prueba el
// test de arriba. Escribe sobre la celda de la grilla y después lee `registros_hh` del destino.
test('corregir las horas desde la celda de la GRILLA, sin abrir el panel, queda en la base', async ({ page }) => {
  const sb = servicio()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/administracion/personas?vista=liquidacion&solapa=horas')
  await expect(page.getByTestId('vista-horas')).toBeVisible({ timeout: 60_000 })

  const suyos = await sb.from('registros_hh').select('id, horas').eq('persona_id', PERSONA)
  const registro = ((suyos.data ?? []) as { id: string; horas: number }[])[0]
  expect(registro?.id, 'la prueba tiene que haber cargado su día').toBeTruthy()
  const desde = Number(registro.horas)
  const hasta = desde === 7 ? 5 : 7

  // LA CELDA VIVE EN LA FILA, NO EN EL PANEL. `grilla-hh-` la distingue de la `hh-` del panel: son
  // dos lugares distintos que escriben con la MISMA acción, y el testid tiene que decir cuál se tocó.
  const celda = page.getByTestId(`grilla-hh-${registro.id}`)
  await expect(celda, 'la celda de la grilla tiene que ser editable').toBeVisible({ timeout: 60_000 })
  // EL PANEL NO SE ABRIÓ, y no puede abrirse al tocar la celda: la fila entera es un botón que lo
  // despliega, así que sin frenar el clic el campo quedaba debajo de un panel que aparece y se va.
  await expect(page.getByTestId('panel-persona')).toHaveCount(0)

  // Mismo reintento que arriba: un clic anterior a la hidratación no abre el campo y no deja rastro.
  await expect(async () => {
    await celda.click()
    await expect(page.getByTestId(`grilla-hh-${registro.id}-campo`)).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 60_000 })
  await expect(page.getByTestId('panel-persona'), 'escribir en la celda no abre el panel').toHaveCount(0)

  await page.getByTestId(`grilla-hh-${registro.id}-campo`).fill(String(hasta))
  await page.getByTestId(`grilla-hh-${registro.id}-campo`).press('Enter')

  await expect(celda).toHaveText(String(hasta), { timeout: 60_000 })
  await expect(page.getByTestId(`grilla-hh-${registro.id}-error`)).toHaveCount(0)

  // EL EFECTO EN EL DESTINO. Es lo único que prueba que se guardó.
  await expect.poll(async () => {
    const { data } = await sb.from('registros_hh').select('horas').eq('id', registro.id).maybeSingle()
    return Number((data as { horas: number } | null)?.horas ?? -1)
  }, { timeout: 30_000 }).toBe(hasta)

  // Y RECARGANDO: lo que se ve después de volver a pedir la pantalla sale de la base, no del estado
  // optimista que quedó en el navegador. Es el paso que el dueño hace y que ningún caso medía.
  await page.reload()
  await expect(page.getByTestId(`grilla-hh-${registro.id}`)).toHaveText(String(hasta), { timeout: 60_000 })
})
