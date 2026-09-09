import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { JEFE, servicio } from './util/identidades'

// ═══ ESTE TEST ESCRIBE EN LA BASE REAL, Y POR ESO NO CORRE SOLO ═══
//
//   E2E_ESCRIBE_ASISTENCIA=1 E2E_PORT=3241 npx playwright test tests/plantel-marcar-presente.spec.ts
//
// Escribe SÓLO sobre la persona de prueba `e2e…0001` (`es_prueba = true`) y sobre la obra
// `prueba-e2e`, y borra todo al terminar. Ninguna obra viva recibe una sola hora — que es lo que
// hizo peligrosa la corrida del 07/09, cuando un test dejó 77,4 HH en PISOS INDUSTRIALES.
//
// ═══ QUÉ PRUEBA QUE NINGÚN TEST PURO PUEDE PROBAR ═══
//
// Que el botón «Presente» de la columna HOY del Plantel —el que pidió el dueño el 09/09/2026—
// DEJA LA FILA ESCRITA en `asistencia_dia`, con la obra asignada de la persona, `estado=presente` y
// `origen='declarada'`, y que lo hace con la sesión de un JEFE DE OBRA: la RLS
// (`es_administracion()`) es la cerradura de verdad, y una policy que rechazara al jefe volvería
// inútil el botón sin que un test puro se entere. La evidencia es el dato leído en su destino, no
// el verde de la pantalla — por eso la celda y la base se miran las dos.
//
// ═══ EL DÍA ES HOY, Y NO PUEDE SER OTRO ═══
//
// A diferencia de `presente-carga-horas-por-defecto.spec.ts` —que elige un día futuro— esta
// pantalla declara HOY y nada más. Por eso el `finally` borra sí o sí: una fila de hoy sobre la
// persona de prueba entra en la quincena viva.
const PERSONA = 'e2e00000-0000-4000-8000-000000000001'
const OBRA = 'prueba-e2e'

/** El mismo día que calcula el servidor (`hoyEnObra`), en la zona de la obra. Con el reloj de la VM
 *  en UTC, después de las 21 h un `toISOString()` diría mañana y el test buscaría la fila vacía. */
const hoyEnObra = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/San_Juan', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

const HOY = hoyEnObra()

interface FilaDia {
  persona_id: string
  fecha: string
  obra_canonica_id: string | null
  estado: string
  motivo: string | null
  origen: string
}

const leerDelDestino = async (): Promise<FilaDia[]> => {
  const { data, error } = await servicio().from('asistencia_dia')
    .select('persona_id, fecha, obra_canonica_id, estado, motivo, origen')
    .eq('persona_id', PERSONA).eq('fecha', HOY)
  if (error) throw new Error(`No pude leer el destino: ${error.message}`)
  return (data ?? []) as FilaDia[]
}

/** Todo lo que este test escribió: el día, las horas que el día arrastra, la asignación, y la
 *  persona de vuelta detrás de `es_prueba`. Corre al empezar y en el `finally`. */
async function limpiar(): Promise<void> {
  const sb = servicio()
  await sb.from('registros_hh').delete().eq('persona_id', PERSONA).eq('fecha', HOY)
  await sb.from('asistencia_dia').delete().eq('persona_id', PERSONA).eq('fecha', HOY)
  await sb.from('obra_asignacion').delete().eq('persona_id', PERSONA)
  await sb.from('personas').update({ es_prueba: true }).eq('id', PERSONA)
}

/**
 * Deja la persona VISIBLE en el Plantel y asignada a la obra de prueba, y el día de hoy vacío.
 * Devuelve el nombre que tiene en la base: la fila se busca por ÉSE, no por uno inventado acá.
 *
 * ═══ POR QUÉ HAY QUE APAGARLE `es_prueba` ═══
 *
 * `persona_directorio` filtra `es_prueba is not true` a propósito (migración 20260822T6400: «lo que
 * existe para probar se declara y no entra a los listados»). Es la razón de que la persona de
 * prueba NO se vea en el Plantel — y también de que el botón que se quiere medir no exista para
 * ella. La alternativa era medir sobre una persona real, y eso es exactamente el accidente que no
 * se puede repetir: le imputaría 9 h de hoy a una obra viva. Se prefiere destapar por treinta
 * segundos a la persona que existe para esto. Se vuelve a tapar en `limpiar()`, que corre también
 * ANTES de empezar por si una corrida anterior murió por timeout.
 */
async function preparar(): Promise<string> {
  const sb = servicio()
  await limpiar()
  const { data } = await sb.from('personas').select('nombre_completo').eq('id', PERSONA).maybeSingle()
  const nombre = (data as { nombre_completo: string | null } | null)?.nombre_completo
  if (!nombre) throw new Error(`No existe la persona de prueba ${PERSONA}: este test no crea gente.`)
  const alta = await sb.from('personas').update({ en_la_empresa: true, es_prueba: false })
    .eq('id', PERSONA).select('id')
  if (alta.error) throw new Error(`No pude publicar a la persona: ${alta.error.message}`)
  const asig = await sb.from('obra_asignacion')
    .insert({ obra_id: OBRA, persona_id: PERSONA, rol: 'integrante', desde: '2026-01-01' }).select('id')
  if (asig.error) throw new Error(`No pude asignarla a ${OBRA}: ${asig.error.message}`)
  return nombre
}

test('EL BOTÓN «PRESENTE» DEL PLANTEL DEJA LA PRESENCIA DECLARADA EN LA BASE', async ({ page }) => {
  test.skip(process.env.E2E_ESCRIBE_ASISTENCIA !== '1',
    'Escribe en asistencia_dia sobre la persona de prueba. Se habilita con E2E_ESCRIBE_ASISTENCIA=1.')
  test.setTimeout(120_000)
  const nombre = await preparar()
  try {
    // 1440 PORQUE LA COLUMNA SE SUELTA POR DEBAJO DE 1250 px: en angosto quedan PERSONA y OBRA, y
    // el test no estaría mirando la celda que dice medir. Es, además, la «vista de computadora»
    // que el dueño nombró.
    await page.setViewportSize({ width: 1440, height: 900 })
    await entrarComo(page, JEFE.email, JEFE.password)
    await page.goto(`/administracion/personas?q=${encodeURIComponent(nombre)}`)
    await expect(page.getByTestId('tabla-personas')).toBeVisible()

    const fila = page.getByTestId('fila-persona').filter({ hasText: nombre }).first()
    await expect(fila).toBeVisible()
    const celda = fila.getByTestId('hoy-persona')

    // ═══ ANTES: LA CELDA DICE EL SILENCIO Y OFRECE RESOLVERLO ═══
    await expect(celda).toHaveAttribute('data-estado', 'sin_marcar')
    await expect(celda).toContainText('sin marcar')
    await page.screenshot({ path: 'tests/qa-shots/plantel-marcar-presente-antes.png' })

    const boton = celda.getByTestId('marcar-presente')
    await expect(boton).toBeVisible()
    await boton.click()

    // ═══ DESPUÉS: LA CELDA PASA A «● presente» SIN RECARGAR LA PÁGINA ═══
    await expect(celda).toContainText('presente', { timeout: 20000 })
    await expect(celda).not.toContainText('sin marcar')
    await page.screenshot({ path: 'tests/qa-shots/plantel-marcar-presente-despues.png' })

    // ═══ LA EVIDENCIA ES EL DATO EN SU DESTINO ═══
    //
    // La pantalla puede pintarse de verde con estado local; lo que prueba la escritura es la fila.
    const filas = await leerDelDestino()
    // LA FILA SE IMPRIME. El verde de un test dice que la afirmación se cumplió; quien audita
    // necesita ver QUÉ quedó escrito, y esta fila se borra en el `finally`.
    console.info('asistencia_dia →', JSON.stringify(filas))
    expect(filas.length, `una sola fila de ${PERSONA} el ${HOY}`).toBe(1)
    expect(filas[0].estado, 'el estado declarado es «presente»').toBe('presente')
    expect(filas[0].obra_canonica_id, 'se imputa a la obra asignada, no a otra').toBe(OBRA)
    // ORIGEN `declarada` Y NO `horas`: alguien eligió el estado. Si esto dijera «horas», la
    // presencia se estaría deduciendo de un número —la regla que el dueño prohibió el 08/09— y
    // además la borraría el día que se saquen las horas.
    expect(filas[0].origen, 'la presencia la declaró una persona').toBe('declarada')
    expect(filas[0].motivo, 'una presencia no lleva motivo').toBeNull()

    // ═══ EL JEFE DE OBRA NO SE MARCA A SÍ MISMO ═══
    //
    // La regla del móvil, en la lista de escritorio: ninguna fila del grupo de jefes ofrece el
    // botón. Sin esto, la pantalla que el jefe abre todas las mañanas le ofrecería declararse
    // presente —y cargarse la jornada— en su propia fila.
    await page.goto('/administracion/personas')
    await expect(page.getByTestId('tabla-personas')).toBeVisible()
    const grupoJefes = page.getByTestId('grupo-jefes')
    if (await grupoJefes.count() > 0) {
      await expect(grupoJefes.getByTestId('marcar-presente')).toHaveCount(0)
    }
  } finally {
    await limpiar()
  }
})
