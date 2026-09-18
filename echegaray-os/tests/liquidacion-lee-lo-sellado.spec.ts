import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { entrarComo } from './util/login'
import { ADMIN, ANON, URL } from './util/identidades'

// LA QUINCENA CERRADA MUESTRA LO SELLADO — medido en la pantalla contra `liquidacion_linea`, peso por peso.
//
// ═══ EL DEFECTO (auditor independiente, 18/09/2026; la pantalla ya había sido rechazada DOS veces) ═══
//
// La rama `liq-ui-limpia` dijo haberlo corregido y no lo hizo: el cuadro de una quincena cerrada seguía saliendo de
// `registros_hh` y `persona_tarifa` de hoy. Medido contra la base real:
//
//   Bazán, 16–31/03        sellado 9 h × $4.300 = $38.700     pantalla «Se liquidó a $4.000/h» · Cobra $36.000
//   1ª de junio, obreros   20 líneas · 1.886,5 h · $9.393.250  pantalla 1.676,5 h · $7.970.750
//   Agüero, 1ª de junio    87 h · 469.800 · pagado 469.800 → 0  pantalla «Cobra $91.800 · saldo $-378.000»
//   Rosales / Alaniz       $504.000 (96 h) / $412.800            pantalla $136.500 (26 h) / $111.800
//   Gonzales Abel          94 h × $4.000 = $376.000              pantalla «sin tarifa»
//   Pie de marzo 16–31     cobra sellado $9.006.818              pantalla $8.103.618
//
// ═══ CÓMO SE MIDE, Y POR QUÉ ASÍ ═══
//
// Lo esperado NO está escrito a mano: se lee de `liquidacion_linea` con la MISMA sesión de Dirección, y se compara con
// lo que la pantalla dibuja en cada testid. Un control nunca se valida contra la información que produce: acá la
// fuente es la base y el seguidor es el DOM. Si alguien vuelve a armar la cerrada con la tarifa de hoy, Bazán da rojo
// (su única tarifa cargada es $4.000 y el sello dice $4.300).
//
// Y LA ABIERTA SIGUE VIVA: la 1ª de septiembre no lleva `data-sellado` y su $/h se escribe.
//
//   E2E_PORT=3317 npx playwright test tests/liquidacion-lee-lo-sellado.spec.ts

const SALIDA = 'test-results/liquidacion-lee-lo-sellado'
const RUTA = '/administracion/personas?vista=liquidacion'

const pesos = (n: number): string => {
  const conCentavos = Math.round(n * 100) % 100 !== 0
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: conCentavos ? 2 : 0, maximumFractionDigits: conCentavos ? 2 : 0 })}`
}
const horas = (n: number): string => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })
const r2 = (n: number): number => Math.round(n * 100) / 100

interface Sellada {
  persona_id: string
  nombre: string
  grupo: string
  horas: number | null
  valor_hora: number | null
  cobra: number
  adelanto: number
  ya_transferido: number
  pagado_banco: number | null
  pagado_efectivo: number | null
}

/** Lo sellado de una quincena, leído con la sesión de Dirección (la misma RLS que la pantalla). */
async function leerSellado(desde: string): Promise<Sellada[]> {
  const sb = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await sb.auth.signInWithPassword({ email: ADMIN.email, password: ADMIN.password })
  expect(error, 'sesión de Dirección para leer la base').toBeNull()
  const cab = await sb.from('liquidacion_quincena')
    .select('grupo, estado, liquidacion_linea(persona_id, horas, valor_hora, cobra, adelanto, ya_transferido, pagado_banco, pagado_efectivo)')
    .eq('desde', desde).eq('estado', 'cerrada')
  expect(cab.error).toBeNull()
  const dir = await sb.from('persona_directorio').select('id, nombre_completo')
  expect(dir.error).toBeNull()
  const nombreDe = new Map((dir.data ?? []).map((p) => [p.id as string, p.nombre_completo as string]))
  const num = (v: unknown): number | null => (v == null ? null : Number(v))
  const out: Sellada[] = []
  for (const q of (cab.data ?? []) as { grupo: string; liquidacion_linea: Record<string, unknown>[] }[]) {
    for (const l of q.liquidacion_linea ?? []) {
      out.push({
        persona_id: String(l.persona_id), nombre: nombreDe.get(String(l.persona_id)) ?? '', grupo: q.grupo,
        horas: num(l.horas), valor_hora: num(l.valor_hora), cobra: Number(l.cobra), adelanto: Number(l.adelanto),
        ya_transferido: Number(l.ya_transferido), pagado_banco: num(l.pagado_banco), pagado_efectivo: num(l.pagado_efectivo),
      })
    }
  }
  expect(out.length, `líneas selladas de ${desde}`).toBeGreaterThan(0)
  return out
}

async function abrirQuincena(page: Page, desde: string) {
  await page.goto(`${RUTA}&quincena=${desde}`)
  await expect(page.getByTestId('vista-quincena')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByTestId('quincena-error')).toHaveCount(0)
  await expect(page.getByTestId('espejo-total')).toBeVisible({ timeout: 60_000 })
}

/** La fila de una persona, columna por columna, contra su línea sellada. */
async function filaComoSellada(page: Page, s: Sellada) {
  const id = s.persona_id
  const fila = page.getByTestId(`espejo-fila-${id}`)
  await expect(fila, `${s.nombre} tiene fila`).toBeVisible()
  // CUÁNTO COBRA, PEGADO AL NOMBRE: el cobra sellado.
  // «COBRA AL MES» NUNCA EN UNA CERRADA: la foto es lo liquidado en la quincena (Maldonado 16–31/03, 105 h × $8.125).
  await expect(page.getByTestId(`cobro-total-${id}`), `${s.nombre}: cobra`).toHaveText(`Cobra ${pesos(s.cobra)}`)
  // ═══ EL SALDO NO SE ESPERA CON LA FÓRMULA DE LA APP (auditor, 18/09/2026) ═══
  //
  // Antes este spec calculaba el saldo esperado igual que `pagoDeLaLinea` —adelantos por defecto, compensación por
  // lado— y certificaba así el saldo fantasma de las cerradas: un control contra la misma derivación. Ahora la
  // expectativa sale de la BASE y de una regla que la app no usa para calcularlo:
  //   · con lo pagado REGISTRADO (`pagado_banco`/`pagado_efectivo` no nulos): saldo = cobra − registrado, en SQL-aritmética.
  //   · sin registro: la fila NO afirma saldo y lo dice («pago sin registrar»). Cualquier «saldo $…» es un rojo.
  const cobro = page.getByTestId(`cobro-${id}`)
  if (s.pagado_banco != null || s.pagado_efectivo != null) {
    const registrado = r2((s.pagado_banco ?? 0) + (s.pagado_efectivo ?? 0))
    await expect(cobro, `${s.nombre}: pagado registrado`).toContainText(`pagado ${pesos(registrado)}`)
    if (s.grupo === 'obreros') await expect(cobro, `${s.nombre}: saldo`).toContainText(`saldo ${pesos(r2(s.cobra - registrado))}`)
    // UN MENSUAL CERRADO NO AFIRMA SALDO POR QUINCENA: se salda por mes.
    else await expect(cobro).toContainText('saldo del mes')
  } else {
    await expect(cobro, `${s.nombre}: sin registro no hay saldo`).not.toContainText('saldo $')
    await expect(page.getByTestId(`cobro-sin-saldo-${id}`), `${s.nombre}: dice por qué`).toHaveText('pago sin registrar')
    await expect(page.getByTestId(`saldo-total-${id}`)).toHaveText('sin registrar')
  }
  if (s.grupo === 'obreros') {
    // LAS HORAS Y EL $/H SELLADOS. `hora-categoria` lleva `data-sellado="1"`: es la foto, no el modelo.
    if (s.horas != null) await expect(page.getByTestId(`espejo-hs-pagas-${id}`), `${s.nombre}: horas`).toHaveText(horas(s.horas))
    if (s.valor_hora != null) {
      await expect(page.getByTestId(`tarifa-${id}`), `${s.nombre}: $/h`).toHaveText(pesos(s.valor_hora))
      await expect(page.getByTestId(`tarifa-${id}`)).toHaveAttribute('data-solo-lectura', '1')
      const cat = page.getByTestId(`hora-categoria-${id}`)
      await expect(cat, `${s.nombre}: $/h cat. sellado`).toHaveAttribute('data-sellado', '1')
      await expect(cat).toHaveText(pesos(s.valor_hora))
      await expect(page.getByTestId(`categorias-${id}`)).toContainText(`Se liquidó a $${Math.round(s.valor_hora).toLocaleString('es-AR')}/h`)
    }
    await expect(fila.getByTestId('sin-tarifa'), `${s.nombre}: nunca «sin tarifa» en una quincena pagada`).toHaveCount(0)
    await expect(page.getByTestId(`cobro-total-${id}`)).not.toContainText('sin tarifa')
  }
}

const escapar = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * LO QUE RODEA A LAS FILAS DE UNA CERRADA (auditor, 18/09/2026): ni días vivos, ni saldos que nadie registró como
 * alarma, ni «sueldo del mes», ni avisos de pendiente.
 */
async function sinNadaVivoAlrededor(page: Page) {
  // LOS DÍAS NO SE SELLAN: ni celdas de día ni totales por día (la 1ª de junio mostraba 1.676,5 h vivas ahí).
  await expect(page.locator('[data-testid^="espejo-dia-"]')).toHaveCount(0)
  await expect(page.getByTestId('quincena-sellada-nota')).toBeVisible()
  // EL PIE GENERAL NO GRITA: si lo único que falta es lo que nadie registró, se dice apagado.
  await expect(page.getByTestId('pie-general-no-cierra')).toHaveCount(0)
  // NI «SUELDO DEL MES» NI «COBRA AL MES» NI PENDIENTES DE CARGA.
  await expect(page.getByText('Cobra al mes', { exact: false })).toHaveCount(0)
  await expect(page.getByText('sin sueldo cargado')).toHaveCount(0)
  await expect(page.getByText('importe no cargado')).toHaveCount(0)
  await expect(page.getByText('sin recibo todavía')).toHaveCount(0)
}

test.describe('Liquidación · la quincena cerrada muestra lo sellado', () => {
  test.describe.configure({ timeout: 240_000 })
  test.beforeAll(() => mkdirSync(SALIDA, { recursive: true }))
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1200 })
    await entrarComo(page, ADMIN.email, ADMIN.password)
  })

  test('16–31/03: Bazán a $4.300/h y $38.700 (no $4.000 · $36.000); el pie es la suma de lo sellado', async ({ page }) => {
    const sellado = await leerSellado('2026-03-16')
    const bazan = sellado.find((s) => s.nombre.startsWith('BAZAN'))
    expect(bazan, 'Bazán tiene línea sellada en 16–31/03').toBeTruthy()
    expect(bazan!.valor_hora, 'el fixture real: sellado a $4.300 con tarifa vigente $4.000').toBe(4300)

    await abrirQuincena(page, '2026-03-16')
    await sinNadaVivoAlrededor(page)
    await filaComoSellada(page, bazan!)
    // TODAS LAS FILAS DE OBREROS, NO SÓLO LA DEL CASO: cada una contra su línea.
    for (const s of sellado.filter((x) => x.grupo === 'obreros')) await filaComoSellada(page, s)
    // EL PIE = SUMA DE LAS FILAS VISIBLES = SUMA DE LO SELLADO.
    const obreros = sellado.filter((s) => s.grupo === 'obreros')
    await expect(page.getByTestId('pie-total')).toHaveText(`Total ${pesos(r2(obreros.reduce((a, s) => a + s.cobra, 0)))}`)
    await expect(page.getByTestId('pie-horas')).toHaveText(`Horas ${horas(r2(obreros.reduce((a, s) => a + (s.horas ?? 0), 0)))}`)
    await expect(page.getByTestId('espejo-total-cobra')).toHaveText(pesos(r2(obreros.reduce((a, s) => a + s.cobra, 0))))
    await page.getByTestId(`espejo-fila-${bazan!.persona_id}`).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${SALIDA}/2026-03-16-bazan.png`, fullPage: false })
    await page.screenshot({ path: `${SALIDA}/2026-03-16-completa.png`, fullPage: true })
  })

  test('1ª de junio: Agüero, Rosales, Alaniz y Gonzales Abel como se sellaron; 20 líneas · 1.886,5 h · $9.393.250', async ({ page }) => {
    const sellado = await leerSellado('2026-06-01')
    const obreros = sellado.filter((s) => s.grupo === 'obreros')
    const de = (prefijo: string) => {
      const s = sellado.find((x) => x.nombre.startsWith(prefijo))
      expect(s, `${prefijo} tiene línea sellada`).toBeTruthy()
      return s!
    }
    await abrirQuincena(page, '2026-06-01')
    await sinNadaVivoAlrededor(page)
    for (const s of [de('AGUERO'), de('ROSALES'), de('ALANIZ'), de('GONZALES ABEL')]) await filaComoSellada(page, s)
    for (const s of obreros) await filaComoSellada(page, s)
    // EL PIE DE JORNALEROS: la cantidad de filas, las horas y el cobra sellados.
    expect(await page.locator('[data-testid^="espejo-fila-"][data-tipo="jornalero"]').count()).toBe(obreros.length)
    await expect(page.getByTestId('pie-horas')).toHaveText(`Horas ${horas(r2(obreros.reduce((a, s) => a + (s.horas ?? 0), 0)))}`)
    await expect(page.getByTestId('pie-total')).toHaveText(`Total ${pesos(r2(obreros.reduce((a, s) => a + s.cobra, 0)))}`)
    // LOS MENSUALES CERRADOS NO SE ROTULAN «SUELDO DEL MES»: la foto es lo liquidado en la quincena. Se mira ANTES del
    // recorte «Por quincena», que saca ese cuadro de la pantalla.
    await expect(page.getByTestId('cuadro-mensuales')).not.toContainText('Sueldo del mes')
    await expect(page.getByTestId('cuadro-mensuales')).toContainText('Liquidado en la quincena')
    // Y EL RECORTE POR CATEGORÍA SIGUE CERRANDO: con «Por quincena» el pie sigue siendo la suma de lo visible.
    await page.goto(`${RUTA}&quincena=2026-06-01&grupo=obreros`)
    await expect(page.getByTestId('espejo-total')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('pie-total')).toHaveText(`Total ${pesos(r2(obreros.reduce((a, s) => a + s.cobra, 0)))}`)
    await page.screenshot({ path: `${SALIDA}/2026-06-01-completa.png`, fullPage: true })
    await page.getByTestId(`espejo-fila-${de('AGUERO').persona_id}`).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${SALIDA}/2026-06-01-aguero.png`, fullPage: false })
  })

  test('16–31/08: Oficina sin línea sellada no muestra el recibo de hoy como banco ni saldo', async ({ page }) => {
    const sellado = await leerSellado('2026-08-16')
    expect(sellado.filter((s) => s.grupo === 'oficina').length, 'Oficina no tiene cabecera en 16–31/08: hereda el cierre').toBe(0)
    await abrirQuincena(page, '2026-08-16')
    await sinNadaVivoAlrededor(page)
    const mensuales = page.locator('[data-testid^="espejo-fila-"][data-tipo="mensual"]')
    const n = await mensuales.count()
    expect(n, 'los jefes siguen en el cuadro').toBeGreaterThan(0)
    for (let i = 0; i < n; i++) {
      const id = (await mensuales.nth(i).getAttribute('data-testid'))!.replace('espejo-fila-', '')
      // NADA VIVO SE CUELA: ni el recibo del estudio como Banco, ni un saldo.
      await expect(page.getByTestId(`banco-mensual-${id}`)).toHaveText('sin línea sellada')
      await expect(page.getByTestId(`saldo-total-${id}`)).toHaveText('sin línea sellada')
      await expect(page.getByTestId(`cobro-${id}`)).not.toContainText('saldo $')
      await expect(page.getByTestId(`cobro-${id}`)).not.toContainText('pagado')
      // NI «$0» PAGADO: sin foto, un cero es una afirmación que nadie hizo.
      await expect(page.getByTestId(`pagado-banco-${id}`)).toHaveText('—')
      await expect(page.getByTestId(`pagado-efectivo-${id}`)).toHaveText('—')
    }
    // EL PIE Y EL SUBTOTAL DE MENSUALES TAMPOCO DICEN «$0» NI «falta recibo».
    await expect(page.getByTestId('pie-mensuales')).not.toContainText('$0')
    await expect(page.getByTestId('pie-mensuales')).not.toContainText('falta recibo')
    await expect(page.getByTestId('mensuales-total-sueldo')).toHaveText('—')
    // Y EL ENCABEZADO NO DICE «Sueldo del mes» sobre algo que no es un sueldo mensual.
    await expect(page.getByTestId('cuadro-mensuales')).not.toContainText('Sueldo del mes')
    await expect(page.getByText('$663.141')).toHaveCount(0)
    await page.screenshot({ path: `${SALIDA}/2026-08-16-oficina.png`, fullPage: true })
  })

  test('la ABIERTA sigue viva: sin sello, con el $/h escribible y sin «sin dato sellado»', async ({ page }) => {
    await abrirQuincena(page, '2026-09-01')
    await expect(page.locator('[data-sellado="1"]')).toHaveCount(0)
    // LA ABIERTA SÍ DIBUJA LOS DÍAS: se escriben en la celda.
    expect(await page.locator('[data-testid^="espejo-dia-"]').count()).toBeGreaterThan(0)
    await expect(page.getByTestId('quincena-sellada-nota')).toHaveCount(0)
    await expect(page.locator('[data-sin-sello="1"]')).toHaveCount(0)
    await expect(page.getByText('sin dato sellado')).toHaveCount(0)
    await expect(page.getByText('sin línea sellada')).toHaveCount(0)
    // EL $/H SE ESCRIBE: es un botón, no un span de sólo lectura.
    const tarifas = page.locator('button[data-testid^="tarifa-"]')
    expect(await tarifas.count()).toBeGreaterThan(0)
    await expect(page.locator('span[data-testid^="tarifa-"][data-solo-lectura="1"]')).toHaveCount(0)
    await page.screenshot({ path: `${SALIDA}/2026-09-01-abierta.png`, fullPage: true })
  })
})
