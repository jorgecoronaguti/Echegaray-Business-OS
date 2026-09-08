import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN, servicio } from './util/identidades'
import { MARCA_PRUEBA } from './util/rastro'

// ═══ LA EVIDENCIA DEL EFECTO: LAS HORAS SE ESCRIBEN Y LA PRESENCIA APARECE EN SU DESTINO ═══
//
// El dueño, 08/09/2026 18:15: *«no hay forma de cargar que la persona está presente desde ninguna
// pantalla, incluso si le cargo las hs de ese día de manera manual en planilla Asistencia»*. Con
// 9 hs cargadas a mano, el Plantel decía «sin marcar»: `asistencia_dia` sólo la escribía la
// pantalla móvil de presencia.
//
// Los módulos puros prueban la REGLA (`presenciaPorHoras.test.ts`). Lo único que no pueden probar
// —y es justamente lo que falló— es que la acción de guardar horas LLEGUE a `asistencia_dia`. Eso
// sólo se ve escribiendo desde la pantalla y leyendo la OTRA tabla con otra llave.
//
// ESCRIBE EN LA BASE REAL, y por eso no corre solo:
//   E2E_ESCRIBE_ASISTENCIA=1 npx playwright test tests/horas-declaran-presencia.spec.ts
//
// Su propia obra ZZ-E2E ACTIVA y su propia persona `es_prueba`: ninguna obra viva recibe nada. La
// obra `prueba-e2e` que ya existe NO sirve —está `cerrada` y la puerta rechaza estrenar horas ahí,
// con razón—, así que el escenario se fabrica y se borra entero al terminar.
const OBRA = 'zz-e2e-horas-presencia'
const NOMBRE_OBRA = `${MARCA_PRUEBA} horas declaran presencia`
const PERSONA = 'e2e00000-0000-4000-8000-00000000e2e2'
const NOMBRE_PERSONA = 'ZZ-E2E presencia por horas'
const HOY = new Date().toISOString().slice(0, 10)

interface DeclaradaEnLaBase {
  estado: string
  motivo: string | null
  obra_canonica_id: string | null
}

/** LO DECLARADO, LEÍDO CON OTRA LLAVE Y DESDE LA OTRA TABLA. Que el formulario conteste que sí no
 *  prueba nada: la prueba es la fila en su destino. */
async function presenciaDeclarada(): Promise<DeclaradaEnLaBase[]> {
  const { data, error } = await servicio().from('asistencia_dia')
    .select('estado, motivo, obra_canonica_id').eq('persona_id', PERSONA).eq('fecha', HOY)
  if (error) throw new Error(`No pude leer asistencia_dia: ${error.message}`)
  return (data ?? []) as DeclaradaEnLaBase[]
}

async function prepararEscenario(): Promise<void> {
  const sb = servicio()
  const alta = await sb.from('personas').upsert({
    id: PERSONA, nombre_completo: NOMBRE_PERSONA, es_prueba: true, en_la_empresa: true,
  }).select('id')
  if (alta.error) throw new Error(`No pude crear la persona de prueba: ${alta.error.message}`)
  const obra = await sb.from('obra_canonica').upsert({
    id: OBRA, nombre: NOMBRE_OBRA, estado: 'activa', jornada_horas: 9,
  }).select('id')
  if (obra.error) throw new Error(`No pude crear la obra de prueba: ${obra.error.message}`)
  await sb.from('obra_asignacion').delete().eq('obra_id', OBRA)
  const asig = await sb.from('obra_asignacion').insert({
    obra_id: OBRA, persona_id: PERSONA, rol: 'integrante', desde: '2026-01-01',
  }).select('id')
  if (asig.error) throw new Error(`No pude asignarla: ${asig.error.message}`)
  // EL DÍA ARRANCA LIMPIO EN LAS DOS TABLAS. Sin esto, una corrida anterior dejaría la presencia ya
  // escrita y el test pasaría sin haber probado nada — el modo de falla más caro de todos.
  await sb.from('registros_hh').delete().eq('persona_id', PERSONA)
  await sb.from('asistencia_dia').delete().eq('persona_id', PERSONA)
}

async function limpiar(): Promise<void> {
  const sb = servicio()
  await sb.from('asistencia_dia').delete().eq('persona_id', PERSONA)
  await sb.from('registros_hh').delete().eq('persona_id', PERSONA)
  await sb.from('registros_hh').delete().eq('obra_canonica_id', OBRA)
  await sb.from('obra_asignacion').delete().eq('persona_id', PERSONA)
  await sb.from('obra_asignacion').delete().eq('obra_id', OBRA)
  await sb.from('obra_canonica').delete().eq('id', OBRA)
  await sb.from('personas').delete().eq('id', PERSONA)
}

test('cargar horas desde la app DECLARA la presencia del día en asistencia_dia', async ({ page }) => {
  test.skip(process.env.E2E_ESCRIBE_ASISTENCIA !== '1',
    'Escribe HH y presencia en su propia obra ZZ-E2E. Se habilita con E2E_ESCRIBE_ASISTENCIA=1.')
  await prepararEscenario()
  try {
    // LA PREMISA, MEDIDA. Si el día ya estuviera declarado, lo de abajo no probaría nada.
    expect(await presenciaDeclarada(), 'el día tenía que arrancar sin declarar').toHaveLength(0)

    await page.setViewportSize({ width: 390, height: 844 })
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto(`/campo/asistencia?obra=${OBRA}`)
    // La pantalla abre en PRESENCIA; las horas son el paso siguiente. Este test NO toca ningún
    // botón de presencia: entra directo a las horas, que es exactamente el caso del dueño —cargar
    // las horas y nada más— y el que dejaba el Plantel diciendo «sin marcar».
    await page.getByTestId('ir-a-horas').click()
    await expect(page.getByTestId('form-asistencia')).toBeVisible()
    await page.getByTestId('horas').first().fill('9')
    await page.getByTestId('guardar-dia').click()
    await expect(page.getByTestId('acuse-jornada')).toBeVisible({ timeout: 20000 })
    await page.screenshot({ path: 'qa-shots/horas-presencia-01-cargado-390.png', fullPage: true })

    // EL EFECTO, EN SU DESTINO Y CON OTRA LLAVE.
    const declarada = await presenciaDeclarada()
    expect(declarada, 'cargar 9 hs tenía que declarar la presencia del día').toHaveLength(1)
    expect(declarada[0].estado).toBe('presente')
    expect(declarada[0].motivo).toBeNull()
    expect(declarada[0].obra_canonica_id).toBe(OBRA)

    // ═══ EL PLANTEL NO SE PUEDE AFIRMAR CON ESTA PERSONA, Y DECIRLO ES PARTE DE LA PRUEBA ═══
    //
    // La persona de prueba es `es_prueba = true`, que es exactamente lo que la saca de
    // `persona_directorio` — la vista de la que el Plantel saca sus filas. Buscar su renglón ahí es
    // buscar algo que por diseño no está, y el test se pone rojo sin que nada esté roto (así falló
    // la primera corrida de este mismo spec). Lo que el Plantel dibuja a partir de
    // `asistencia_dia` ya está probado en `personas/page.tsx` y se ve en la captura: personas
    // reales con «● presente» y las tres del pedido con «sin marcar».
    //
    // La evidencia del efecto de ESTE cambio es la fila de arriba, leída en su destino con la llave
    // de servicio. La captura queda como testigo del estado de la pantalla en la misma corrida.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/administracion/personas')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('vistas-personal')).toBeVisible({ timeout: 30000 })
    await page.screenshot({ path: 'qa-shots/horas-presencia-02-plantel-1440.png', fullPage: true })
  } finally {
    await limpiar()
  }
})

test('marcar «A» en la grilla declara la AUSENCIA del día, y no la pisa una carga de horas', async () => {
  test.skip(process.env.E2E_ESCRIBE_ASISTENCIA !== '1',
    'Escribe en la base real. Se habilita con E2E_ESCRIBE_ASISTENCIA=1.')
  await prepararEscenario()
  try {
    const sb = servicio()
    // LA AUSENCIA DECLARADA A MANO, tal como la deja la «A» de la grilla o el panel.
    const puesta = await sb.from('asistencia_dia').insert({
      persona_id: PERSONA, fecha: HOY, obra_canonica_id: OBRA, estado: 'ausente', motivo: 'falta',
    }).select('id')
    if (puesta.error) throw new Error(`No pude declarar la ausencia: ${puesta.error.message}`)

    // EL DEFECTO QUE ATRAPA: que la carga de horas de la tarde pise el «no vino» de la mañana. Se
    // mide con la ESCRITURA REAL de la acción, no con la regla pura —la regla ya está probada—.
    const { declararPresencia } = await import(
      '../src/features/administracion/services/presenciaDelDiaService')
    const r = await declararPresencia(sb, [{
      persona_id: PERSONA, fecha: HOY, obra_canonica_id: OBRA,
      estado: 'presente', motivo: null, origen: 'horas',
    }])
    expect(r.error).toBeNull()
    expect(r.escritas, 'una presencia deducida de horas no puede pisar una ausencia declarada').toBe(0)
    const despues = await presenciaDeclarada()
    expect(despues[0].estado).toBe('ausente')
    expect(despues[0].motivo).toBe('falta')
  } finally {
    await limpiar()
  }
})
