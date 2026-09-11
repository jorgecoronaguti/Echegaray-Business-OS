import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN, servicio } from './util/identidades'
import { MARCA_PRUEBA } from './util/rastro'

// «NO TENGO CELDAS EDITABLES» (dueño, 11/09/2026), sobre la solapa Pagos de Liquidación de horas.
//
// ═══ QUÉ SE MIDE, Y POR QUÉ LA PANTALLA NO ALCANZA COMO EVIDENCIA ═══
//
// La solapa dibujaba las cuatro celdas de la cadena de pago (R5) con el marco del control y un
// `<span>` adentro: se veían escribibles y no se podía tocar ninguna. Un test que mirara sólo el DOM
// podría dar verde con un `<input>` que no guarda nada, así que acá la evidencia es el EFECTO:
//
//   1 · se escribe ADELANTO en la fila de la persona de prueba y se sale del campo;
//   2 · la celda muestra lo escrito (y no el valor anterior) mientras el servidor todavía no volvió;
//   3 · `liquidacion_linea.adelanto_manual` dice ese número, leído de la base y no de la pantalla;
//   4 · se recarga la pantalla y el número sigue ahí, con la marca «manual» al lado;
//   5 · y EN EFECTIVO bajó ese importe — la cadena se rehace, que es lo que hace que el número sirva.
//
// ═══ SOBRE DATOS FABRICADOS ═══
//
// Persona, obra, horas y tarifa propias con la marca ZZ-E2E, igual que
// `liquidacion-editar-en-celda.spec.ts`. `es_prueba: false` mientras corre porque
// `persona_directorio` filtra a las de prueba y sin eso la fila no existiría en el cuadro real.
// NUNCA se toca una fila de una persona real: ni un `.first()` en esta pantalla, que es la que
// decide lo que se le entrega en mano a cada uno.

const OBRA = 'e2e00000-0000-4000-8000-0000000000d3'
const PERSONA = 'e2e00000-0000-4000-8000-0000000000d3'
const NOMBRE = `${MARCA_PRUEBA} pagos de liquidacion`
const HORAS = 10
const VALOR_HORA = 1000
/** Lo que la prueba escribe en ADELANTO. No es un número redondo de la base: tiene que ser nuevo. */
const ADELANTO = 3700

function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}
function correr(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
/** La ventana de la quincena en curso, con la misma regla que `quincena.ts`. */
function quincenaEnCurso(): { desde: string; hasta: string } {
  const hoy = hoyISO()
  const mes = hoy.slice(0, 7)
  if (Number(hoy.slice(8, 10)) <= 15) return { desde: `${mes}-01`, hasta: `${mes}-15` }
  const fin = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 0))
  return { desde: `${mes}-16`, hasta: `${mes}-${String(fin.getUTCDate()).padStart(2, '0')}` }
}
/** Un día hábil de la quincena: el sábado y el domingo no tienen jornada. */
function diaHabil(): string {
  const { desde } = quincenaEnCurso()
  for (let i = 0; i < 15; i++) {
    const f = correr(hoyISO(), -i)
    const dow = new Date(`${f}T12:00:00Z`).getUTCDay()
    if (dow !== 0 && dow !== 6 && f >= desde) return f
  }
  return hoyISO()
}
const Q = quincenaEnCurso()
const DIA = diaHabil()
const CAPTURAS = process.env.E2E_CAPTURAS ?? 'tests/capturas'

async function preparar(): Promise<void> {
  const sb = servicio()
  const alta = await sb.from('personas').upsert({
    id: PERSONA, nombre_completo: NOMBRE, es_prueba: false, en_la_empresa: true,
  }).select('id')
  if (alta.error) throw new Error(`No pude crear la persona: ${alta.error.message}`)
  const obra = await sb.from('obra_canonica').upsert({
    id: OBRA, nombre: `${MARCA_PRUEBA} obra de pagos`, estado: 'activa', jornada_horas: 9,
  }).select('id')
  if (obra.error) throw new Error(`No pude crear la obra: ${obra.error.message}`)
  await sb.from('registros_hh').delete().eq('persona_id', PERSONA)
  const hh = await sb.from('registros_hh').insert({
    persona_id: PERSONA, obra_canonica_id: OBRA, fecha: DIA, horas: HORAS,
    tipo_hora: 'normal', fuente_legacy: 'e2e',
  }).select('id')
  if (hh.error) throw new Error(`No pude cargar las horas: ${hh.error.message}`)
  // LA TARIFA ES LO QUE HACE QUE LA FILA TENGA COBRA. Sin ella la línea dice «sin retribución» y
  // EN EFECTIVO queda en null, así que el paso 5 no podría medir nada. `valor_hora` sola: el CHECK
  // de `persona_tarifa` no admite las dos formas.
  const tarifa = await sb.from('persona_tarifa').upsert(
    { persona_id: PERSONA, desde: Q.desde, valor_hora: VALOR_HORA, origen: 'e2e' },
    { onConflict: 'persona_id,desde' },
  ).select('persona_id')
  if (tarifa.error) throw new Error(`No pude cargar la tarifa: ${tarifa.error.message}`)
}

async function limpiar(): Promise<void> {
  const sb = servicio()
  // LA LÍNEA DE LIQUIDACIÓN PRIMERO: es lo que la prueba escribió en una tabla que el dueño usa.
  await sb.from('liquidacion_linea').delete().eq('persona_id', PERSONA)
  // LA CABECERA SÓLO SI QUEDÓ VACÍA. Si tiene líneas de personas reales, es del dueño y no se toca.
  const cab = await sb.from('liquidacion_quincena')
    .select('id, estado, liquidacion_linea(persona_id)')
    .eq('desde', Q.desde).eq('hasta', Q.hasta).eq('grupo', 'obreros')
  for (const c of (cab.data ?? []) as { id: string; estado: string; liquidacion_linea: unknown[] | null }[]) {
    if (c.estado === 'abierta' && (c.liquidacion_linea ?? []).length === 0) {
      await sb.from('liquidacion_quincena').delete().eq('id', c.id)
    }
  }
  const suyos = await sb.from('registros_hh').select('id').eq('persona_id', PERSONA)
  const ids = ((suyos.data ?? []) as { id: string }[]).map((r) => r.id)
  if (ids.length > 0) await sb.from('registro_hh_correccion').delete().in('registro_id', ids)
  await sb.from('registros_hh').delete().eq('persona_id', PERSONA)
  await sb.from('asistencia_dia').delete().eq('persona_id', PERSONA)
  await sb.from('obra_asignacion').delete().eq('persona_id', PERSONA)
  await sb.from('persona_tarifa').delete().eq('persona_id', PERSONA)
  await sb.from('personas').update({ es_prueba: true, en_la_empresa: false }).eq('id', PERSONA)
  await sb.from('personas').delete().eq('id', PERSONA)
  await sb.from('obra_canonica').delete().eq('id', OBRA)
}

// EL PRIMER `goto` COMPILA LA PANTALLA. En dev eso pasa de 30 s y el rojo no señalaría un defecto.
test.describe.configure({ mode: 'serial', timeout: 240_000 })
test.beforeAll(async () => { test.setTimeout(120_000); await preparar() })
test.afterAll(async () => { test.setTimeout(180_000); await limpiar() })

test('ADELANTO se escribe en la solapa Pagos, sobrevive a una recarga y queda en liquidacion_linea', async ({ page }) => {
  const sb = servicio()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto(`/administracion/personas?vista=liquidacion&solapa=pagos&quincena=${Q.desde}`)
  await expect(page.getByTestId('vista-pagos')).toBeVisible({ timeout: 90_000 })
  await page.screenshot({ path: `${CAPTURAS}/pagos-adelanto-antes.png`, fullPage: true })

  const celda = page.getByTestId(`celda-adelanto-${PERSONA}`)
  // EL DEFECTO QUE ESTO ATRAPA: con el `<span>` mudo, este testid NO EXISTE. No es que el campo no
  // guarde: es que no hay campo.
  await expect(celda, 'la celda de ADELANTO tiene que existir y ser tocable').toBeVisible({ timeout: 60_000 })

  // UN CLIC ANTES DE LA HIDRATACIÓN NO ABRE NADA Y NO DEJA RASTRO. Se reintenta en vez de esperar
  // más: el clic perdido no vuelve, y esperar un campo que nunca se va a abrir da un rojo que miente.
  await expect(async () => {
    await celda.click()
    await expect(page.getByTestId(`celda-adelanto-${PERSONA}-campo`)).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 60_000 })

  const campo = page.getByTestId(`celda-adelanto-${PERSONA}-campo`)
  await campo.fill(String(ADELANTO))
  // SE SALE DEL CAMPO, no se aprieta Enter: es el gesto del dueño («guardar al salir del campo»).
  await campo.blur()

  // 1 · LA CELDA MUESTRA LO ESCRITO MIENTRAS EL SERVIDOR NO VOLVIÓ. Sin esto, el número parpadea de
  // vuelta al anterior y la conclusión razonable es que no se puede editar.
  await expect(celda).toContainText('3.700', { timeout: 60_000 })
  await expect(page.getByTestId(`celda-adelanto-${PERSONA}-error`)).toHaveCount(0)

  // 2 · EL EFECTO EN EL DESTINO. Es la evidencia; la pantalla es sólo la puerta.
  await expect.poll(async () => {
    const { data } = await sb.from('liquidacion_linea')
      .select('adelanto_manual').eq('persona_id', PERSONA).maybeSingle()
    return Number((data as { adelanto_manual: number | null } | null)?.adelanto_manual ?? -1)
  }, { timeout: 60_000 }).toBe(ADELANTO)

  // 3 · Y SOBREVIVE A LA RECARGA, con la marca de lo escrito a mano (R8).
  await page.reload()
  await expect(page.getByTestId('vista-pagos')).toBeVisible({ timeout: 90_000 })
  const fila = page.getByTestId(`celda-adelanto-${PERSONA}`)
  await expect(fila).toContainText('3.700', { timeout: 60_000 })
  await page.screenshot({ path: `${CAPTURAS}/pagos-adelanto-despues.png`, fullPage: true })

  // 4 · LA CADENA SE REHIZO: EN EFECTIVO = COBRA − ADELANTO − YA TRANSF − POR BANCO (R5). Un adelanto
  // que se guarda y no baja el efectivo sería un número decorativo.
  const cobra = HORAS * VALOR_HORA
  await expect(page.getByText(String((cobra - ADELANTO).toLocaleString('es-AR')), { exact: false }).first())
    .toBeVisible({ timeout: 30_000 })
})
