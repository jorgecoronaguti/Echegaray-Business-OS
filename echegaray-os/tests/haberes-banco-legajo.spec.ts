// EL LEGAJO MUESTRA LO QUE EL BANCO CERTIFICA — número por número contra el CSV del certificado.
//
// El control no se valida contra lo que produce: lo esperado sale del ARCHIVO transcripto del certificado
// (`datos/haberes/…csv`, que suma el IMPORTE TOTAL del pie), no de la tabla que la pantalla lee. Si el
// cargador perdiera, duplicara o reasignara una acreditación, esto se pone rojo.
//
// Cinco legajos: un jornalero activo con muchos pagos (Agüero, con la 1ª de septiembre estimada en la
// Liquidación), un jefe de obra mensual (Maldonado), un inactivo con liquidación final (Bazán), un inactivo
// cuyo pago único quedó «a confirmar» porque el último bloque con BANCO no tiene acreditación propia
// (Santander Walter, D1 de la auditoría del 18/09) y un inactivo sin fecha de egreso con un pago «a confirmar»
// (Navarro). Ninguna de las 32 personas falta en el padrón, así que no hay legajo de «fuera del padrón» que
// abrir: eso lo prueba el test del cargador.
import { test, expect } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'
import { ADMIN, JEFE, servicio, entrar, pedir } from './util/identidades'
import { entrarComo } from './util/login'

const CSV = readFileSync('datos/haberes/santander-haberes-2026-certificado-2026-09-18.csv', 'utf8')
const FILAS = CSV.trim().split('\n').slice(1).map((l) => {
  const [nombre, cuil, fecha, importe] = l.split(';')
  return { nombre, cuil, fecha, centavos: Math.round(Number(importe) * 100) }
})

const pesos = (c: number): string => {
  const n = c / 100
  const conCentavos = c % 100 !== 0
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: conCentavos ? 2 : 0, maximumFractionDigits: conCentavos ? 2 : 0 })}`
}
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

const CASOS = [
  { cuil: '20294271067', archivo: 'aguero-jornalero-activo', finales: 0, aConfirmar: 0, estimadas: 1 },
  { cuil: '20359232668', archivo: 'maldonado-jefe-mensual', finales: 0, aConfirmar: 0, estimadas: 0 },
  { cuil: '20380773091', archivo: 'bazan-inactivo-final', finales: 1, aConfirmar: 0, estimadas: 0 },
  { cuil: '20258303939', archivo: 'santander-inactivo-a-confirmar-d1', finales: 0, aConfirmar: 1, estimadas: 0 },
  { cuil: '20399947511', archivo: 'navarro-inactivo-a-confirmar', finales: 0, aConfirmar: 1, estimadas: 0 },
]

test.describe('legajo · acreditado por el banco', () => {
  test.setTimeout(300_000)

  // PRECALENTAR: en `next dev` la primera compilación del aterrizaje tarda más que los 20 s que el login
  // espera y el test caía en «Ingresando…» sin haber medido nada. Se compilan las rutas antes de medir.
  test.beforeAll(async ({ request }) => {
    for (const ruta of ['/login', '/administracion', '/administracion/personas', '/obras']) {
      await request.get(ruta, { timeout: 180_000 }).catch(() => null)
    }
  })

  test('cada acreditación del certificado está en el legajo con su fecha e importe, y el total cierra', async ({ page }) => {
    const db = servicio()
    mkdirSync('qa-shots/haberes-banco', { recursive: true })
    await entrarComo(page, ADMIN.email, ADMIN.password)
    for (const caso of CASOS) {
      const esperadas = FILAS.filter((f) => f.cuil === caso.cuil)
      expect(esperadas.length, `el CSV no tiene al CUIL ${caso.cuil}`).toBeGreaterThan(0)
      const { data: ps } = await db.from('personas').select('id, cuil')
      const persona = (ps ?? []).find((p) => String(p.cuil ?? '').replace(/\D/g, '') === caso.cuil)
      expect(persona, `el CUIL ${caso.cuil} no está en el padrón`).toBeTruthy()

      await page.goto(`/administracion/personas/${persona!.id}?v=retribucion`)
      const bloque = page.getByTestId('haberes-banco')
      await expect(bloque).toBeVisible({ timeout: 90_000 })
      await expect(page.getByTestId('haberes-banco-error')).toHaveCount(0)

      const total = esperadas.reduce((s, f) => s + f.centavos, 0)
      await expect(page.getByTestId('haberes-banco-total')).toHaveText(pesos(total))

      // Cada acreditación: su fecha y su importe, en la tabla de períodos o en una de las dos listas aparte.
      const texto = (await bloque.innerText()).replace(/\s+/g, ' ')
      for (const f of esperadas) {
        expect(texto, `${caso.archivo}: falta ${fechaCorta(f.fecha)} ${pesos(f.centavos)}`)
          .toContain(`${fechaCorta(f.fecha)} ${pesos(f.centavos)}`)
      }
      await expect(page.getByTestId('haberes-banco-finales-fila')).toHaveCount(caso.finales)
      await expect(page.getByTestId('haberes-banco-a-confirmar-fila')).toHaveCount(caso.aConfirmar)
      // La liquidación estimada se rotula «est.» como en la tabla de arriba (Agüero, 1ª de septiembre): cada
      // fila del bloque con «est.» tiene su fila de Retribución con «est.». No al revés: la tabla de arriba
      // también estima quincenas que el banco todavía no pagó, y ésas no están en el bloque.
      const est = page.getByTestId('haberes-banco-liquidacion-est')
      await expect(est).toHaveCount(caso.estimadas)
      for (const celda of await est.all()) {
        const desde = await celda.locator('xpath=ancestor::tr').getAttribute('data-desde')
        const arriba = page.getByTestId('retribucion-fila').filter({ has: page.locator(`a[href$="quincena=${desde}"]`) })
        await expect(arriba, `la fila ${desde} de Retribución no dice «est.»`).toContainText('est.')
      }

      await bloque.scrollIntoViewIfNeeded()
      await bloque.screenshot({ path: `qa-shots/haberes-banco/${caso.archivo}.png` })
    }
  })

  test('el jefe de obra no ve la solapa ni lee la tabla por la API', async ({ page }) => {
    const token = await entrar(JEFE.email, JEFE.password)
    const r = await pedir(token, 'haberes_acreditados_banco?select=importe&limit=5')
    expect(r.filas.length, 'la tabla de haberes del banco se le publicó al jefe de obra').toBe(0)

    await entrarComo(page, JEFE.email, JEFE.password)
    const { data: ps } = await servicio().from('personas').select('id, cuil')
    const persona = (ps ?? []).find((p) => String(p.cuil ?? '').replace(/\D/g, '') === '20294271067')
    await page.goto(`/administracion/personas/${persona!.id}?v=retribucion`)
    await expect(page.getByTestId('retribucion-sin-permiso')).toBeVisible({ timeout: 90_000 })
    await expect(page.getByTestId('haberes-banco')).toHaveCount(0)
  })
})
