import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// RESOLVER DESDE LA PANTALLA, Y LEER EL EFECTO EN LA BASE.
//
// ═══ QUÉ PRUEBA Y QUÉ NO ═══
//
// No prueba que la pantalla diga "Resuelto". Prueba que después de resolver exista la fila en
// Postgres —`obra_alias` para una imputación, `proveedor_alias` para un nombre de proveedor— y que
// al RECARGAR la pantalla el pendiente ya no esté. Es la diferencia entre el intento y el efecto: un
// formulario que se limpia y no escribe nada se ve exactamente igual que uno que funcionó.
//
// La escritura va por la SESIÓN DEL USUARIO, no por service_role: lo que se está probando es que
// Administración puede escribir con sus propios permisos. `service_role` se usa sólo para preparar y
// borrar las filas de prueba, y para LEER el efecto — leerlo con la misma sesión que lo escribió no
// probaría que quedó guardado.
//
// TODO lo que crea lleva la marca ZZ-E2E y se borra al final. No toca una sola fila real: los
// pendientes de verdad del dueño se quedan donde están.

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const ADMIN = {
  email: 'jorge.o.corona+direccion-test-1783513222134@gmail.com',
  password: 'TestPassword123!',
}
const MARCA = 'ZZ-E2E'
const OBRA_DESTINO = 'le-comedor'

const base = (): SupabaseClient => createClient(URL_SB, SRV, { auth: { persistSession: false } })

/** Réplica de `public.norm_obra()`, la misma que usa la pantalla. */
const normObra = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\b(la|el|los|las|de|del)\b/g, ' ').replace(/\s+/g, ' ').trim()

type Pagina = import('@playwright/test').Page

/**
 * ESPERAR A QUE REACT SE HAYA HIDRATADO ANTES DE APRETAR UN BOTÓN DE FORMULARIO.
 *
 * Medido acá (18/08/2026): al volver del buscador, el clic en «Vincular» llegaba ANTES de que React
 * enganchara el `onSubmit`. Sin ese `preventDefault`, el navegador hace el envío nativo del `<form>`
 * —que no tiene `action`—, o sea un GET a la ruta actual SIN la query: la pantalla volvía al maestro
 * y no se escribía nada. El test daba rojo sin que hubiera un defecto en la resolución.
 *
 * La señal es la única fiable: react-dom cuelga sus claves internas (`__reactFiber$…`) del nodo DOM
 * recién cuando lo hidrató. `networkidle` no sirve — la red se calla antes que React.
 */
async function esperarHidratacion(page: Pagina, testid: string) {
  await page.waitForFunction((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    return !!el && Object.keys(el).some((k) => k.startsWith('__react'))
  }, testid, { timeout: 20000 })
}

async function entrar(page: Pagina) {
  await page.goto('/login')
  await page.fill('input[name="email"]', ADMIN.email)
  await page.fill('input[name="password"]', ADMIN.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(obras|clientes|flujo-caja)/, { timeout: 30000 })
}

test.describe('pendientes de imputación', () => {
  test('resolver un texto lo escribe en el diccionario y lo saca de la cola', async ({ page }) => {
    test.setTimeout(180000)
    const sb = base()
    const texto = `${MARCA} OBRA SIN CLASIFICAR ${Date.now()}`
    const clave = normObra(texto)

    // Una compra de prueba con un texto de obra que ningún alias conoce: eso ES un pendiente.
    const alta = await sb.from('costos_obra').insert({
      obra_texto: texto,
      proveedor: `${MARCA} PROVEEDOR`,
      concepto: `${MARCA} hierro del 8`,
      comprobante: `${MARCA}-FA-1`,
      total: 123456,
      fecha: '2026-08-01',
      origen: 'e2e',
    }).select('id').single()
    expect(alta.error, `no pude preparar la compra de prueba: ${alta.error?.message}`).toBeNull()

    try {
      await entrar(page)
      await page.goto('/administracion/pendientes')

      const fila = page.getByTestId('fila-pendiente').filter({ hasText: texto })
      await expect(fila, 'la compra sin clasificar no apareció en la cola').toHaveCount(1)

      await fila.getByTestId('abrir-pendiente').click()
      await expect(page.getByTestId('panel-pendiente')).toBeVisible()

      // SIN EVIDENCIA NO HAY SUGERENCIA. Es un texto que nadie vio nunca y su proveedor tampoco
      // tiene historial: proponer una obra acá sería inventarla.
      await expect(page.getByTestId('sin-sugerencia')).toBeVisible()
      await expect(page.getByTestId('sugerencia')).toHaveCount(0)

      // El detalle trae lo que hace falta para decidir, incluido de dónde salió la fila.
      await expect(page.getByTestId('fila-detalle')).toHaveCount(1)
      await expect(page.getByTestId('fila-detalle')).toContainText('costos_obra')
      await expect(page.getByTestId('fila-detalle')).toContainText(`${MARCA}-FA-1`)

      await page.getByTestId('obra-destino').selectOption(OBRA_DESTINO)
      await esperarHidratacion(page, 'form-resolver')
      await page.getByTestId('form-resolver-enviar').click()

      // EL EFECTO, LEÍDO EN LA BASE CON OTRA CONEXIÓN.
      await expect.poll(async () => {
        const { data } = await sb.from('obra_alias').select('obra_id, clasificacion').eq('alias', clave).maybeSingle()
        return data ? `${data.obra_id}/${data.clasificacion}` : null
      }, { timeout: 30000, message: 'la resolución no llegó a obra_alias' }).toBe(`${OBRA_DESTINO}/obra`)

      // Y RECARGANDO YA NO ESTÁ: si siguiera, Administración volvería a resolver lo mismo mañana.
      await page.goto('/administracion/pendientes')
      await expect(page.getByTestId('fila-pendiente').filter({ hasText: texto })).toHaveCount(0)
    } finally {
      await sb.from('obra_alias').delete().eq('alias', clave)
      await sb.from('costos_obra').delete().eq('obra_texto', texto)
    }
  })
})

test.describe('nombres de proveedor sin dueño', () => {
  test('vincular un nombre legacy a un proveedor canónico escribe el alias y limpia la cola', async ({ page }) => {
    test.setTimeout(180000)
    const sb = base()
    const sello = Date.now()
    const nombreSheet = `${MARCA} SHEET ${sello}`
    const nombreCanonico = `${MARCA} CANONICO ${sello}`
    let proveedorId = ''

    const prov = await sb.from('proveedores').insert({ nombre: nombreCanonico }).select('id').single()
    expect(prov.error, `no pude crear el proveedor canónico: ${prov.error?.message}`).toBeNull()
    proveedorId = prov.data!.id as string

    // La compra se cuelga de un texto de obra YA resuelto: esta prueba es de proveedores y no tiene
    // por qué ensuciar la cola de imputación.
    const compra = await sb.from('costos_obra').insert({
      obra_texto: 'SAN FRANCISCO',
      proveedor: nombreSheet,
      concepto: `${MARCA} chapa`,
      total: 99999,
      fecha: '2026-08-01',
      origen: 'e2e',
    }).select('id').single()
    expect(compra.error, `no pude preparar la compra: ${compra.error?.message}`).toBeNull()

    try {
      await entrar(page)
      await page.goto('/administracion/proveedores?vista=resolver')

      const fila = page.getByTestId('nombre-pendiente').filter({ hasText: nombreSheet })
      await expect(fila, 'el nombre nuevo del Sheet no entró a la cola').toHaveCount(1)
      await fila.getByTestId('abrir-nombre').click()
      await expect(page.getByTestId('panel-nombre')).toBeVisible()

      // EL BUSCADOR CONTRA EL MAESTRO. Sin esto la vinculación se elige de una lista entera, que es
      // como se termina vinculando el proveedor de nombre parecido.
      await page.getByTestId('buscar-proveedor-q').fill(nombreCanonico)
      await page.getByTestId('buscar-proveedor').getByRole('button', { name: 'Buscar' }).click()
      await expect(page.getByTestId('candidato')).toHaveCount(1)
      await expect(page.getByTestId('candidato')).toContainText(nombreCanonico)

      await esperarHidratacion(page, `vincular-${proveedorId}`)
      await page.getByTestId(`vincular-${proveedorId}-enviar`).click()

      // EL EFECTO EN LA BASE: el texto del Sheet quedó atado a ese proveedor y a ningún otro.
      await expect.poll(async () => {
        const { data } = await sb.from('proveedor_alias')
          .select('proveedor_id, estado').eq('nombre_norm', nombreSheet.toUpperCase()).maybeSingle()
        return data ? `${data.proveedor_id}/${data.estado}` : null
      }, { timeout: 30000, message: 'la vinculación no llegó a proveedor_alias' }).toBe(`${proveedorId}/vinculado`)

      await page.goto('/administracion/proveedores?vista=resolver')
      await expect(page.getByTestId('nombre-pendiente').filter({ hasText: nombreSheet })).toHaveCount(0)
    } finally {
      await sb.from('proveedor_alias').delete().eq('nombre_norm', nombreSheet.toUpperCase())
      await sb.from('costos_obra').delete().eq('proveedor', nombreSheet)
      await sb.from('proveedores').delete().eq('id', proveedorId)
      const quedan = await sb.from('proveedores').select('id').like('nombre', `${MARCA}%`)
      expect(quedan.data?.length ?? 0, 'la prueba dejó proveedores colgados').toBe(0)
    }
  })
})
