import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { servicio } from './util/identidades'
import { MARCA_PRUEBA } from './util/rastro'
import { entrarComo } from './util/login'

// SUBIR UN DOCUMENTO DESDE EL PANEL LATERAL DE PROVEEDORES — el circuito entero, contra la base real.
//
// ═══ EL DEFECTO QUE ESTO ATRAPA ═══
//
// El dueño, 09/09/2026, con la captura del panel abierto: «sigo sin tener forma de cargarle docs a
// proveedores». La sección Documentos existía sólo en la ficha completa. Un test de fuente puede
// probar que el componente está importado; no puede probar que el archivo llega al bucket, que la
// fila nace, que la firma baja el archivo y que la baja en dos pasos escribe en Postgres. Eso es lo
// que mide este spec, y por eso lee el EFECTO —la fila y el objeto— y no la pantalla que dijo que sí.
//
// ═══ SIN RECARGAR SE PRUEBA CON UNA MARCA EN `window` ═══
//
// «la lista se refresca al subir» es `router.refresh()`, un refetch de los server components sin
// navegación. La única forma de distinguirlo de un `location.reload()` es dejar algo en la página
// antes de subir y comprobar que sigue ahí después: una recarga se lo lleva puesto.
//
// ═══ LO QUE ESCRIBE Y CÓMO SE BARRE ═══
//
// Crea UN proveedor marcado (`ZZ-E2E …`, la marca del repo) y le sube UN pdf de 300 bytes. El
// `afterAll` borra las tres cosas en el orden que manda la clave foránea: el objeto del bucket, la
// fila de `proveedor_documento` y el proveedor. Un fallo de limpieza se informa, no tumba el test.

// La marca del repo, escrita a la vista: `marca()` es una llamada y el auditor de
// `orquestador/lib/marca-de-prueba-e2e.mjs` no puede seguir una llamada hasta su literal — con
// ella, este spec quedaba señalado como si escribiera un nombre sin marcar.
const NOMBRE = `${MARCA_PRUEBA} proveedor documentos panel ${Date.now()}`
const CUIT_FICTICIO = '30999999997'
const RODRIGO = { email: 'rodrigo@ecsas.com.ar', password: 'test123' }
const BUCKET = 'proveedores-documentos'
const ARCHIVO = 'contrato-de-prueba.pdf'

/** Un PDF chico de verdad: cabecera, un objeto y el EOF. 300 bytes alcanzan para probar el circuito. */
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
  + '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
  + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n'
  + 'trailer<</Root 1 0 R>>\n%%EOF\n',
  'latin1',
)

let proveedorId = ''

test.beforeAll(async () => {
  const sb = servicio()
  const { data, error } = await sb.from('proveedores').insert({
    nombre: NOMBRE,
    razon_social: 'ZZ-E2E RAZON SOCIAL',
    cuit: CUIT_FICTICIO,
    notas: 'Proveedor de prueba del spec del panel de documentos.',
    activo: true,
  }).select('id').single()
  if (error) throw new Error(`no pude crear el proveedor de prueba: ${error.message}`)
  proveedorId = data.id as string
})

test.afterAll(async () => {
  const sb = servicio()
  const problemas: string[] = []
  const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Lo de ESTA corrida y lo abandonado por una corrida vieja. No se barre todo lo marcado: otro
  // worker puede estar usando su propio proveedor en este mismo momento.
  const mios = await sb.from('proveedores').select('id').eq('nombre', NOMBRE)
  const viejos = await sb.from('proveedores').select('id')
    .like('nombre', `${MARCA_PRUEBA}%`).lt('created_at', ayer)
  const ids = [...new Set([...(mios.data ?? []), ...(viejos.data ?? [])].map((p) => p.id as string))]
  if (!ids.length) return

  const docs = await sb.from('proveedor_documento').select('id, storage_path').in('proveedor_id', ids)
  const rutas = (docs.data ?? []).map((d) => d.storage_path as string)
  if (rutas.length) {
    const r = await sb.storage.from(BUCKET).remove(rutas)
    if (r.error) problemas.push(`bucket: ${r.error.message}`)
    const { error } = await sb.from('proveedor_documento').delete().in('proveedor_id', ids)
    if (error) problemas.push(`proveedor_documento: ${error.message}`)
  }
  const { error } = await sb.from('proveedores').delete().in('id', ids)
  if (error) problemas.push(`proveedores: ${error.message}`)
  if (problemas.length) console.warn(`limpieza incompleta: ${problemas.join(' · ')}`)
})

test('el panel lateral carga, lista, baja y da de baja un documento del proveedor', async ({ page, request }) => {
  const sb = servicio()
  await entrarComo(page, RODRIGO.email, RODRIGO.password)
  await page.goto(`/administracion/proveedores?p=${proveedorId}`)

  const seccion = page.getByTestId('documentos-proveedor')
  await expect(seccion).toBeVisible()
  // ANTES: la sección existe y dice el estado leído, no un vacío mudo.
  await expect(page.getByTestId('documentos-vacio')).toHaveText('0 documentos')
  await page.screenshot({ path: 'tests/qa-shots/proveedor-panel-documentos-antes.png', fullPage: true })

  // La huella que una recarga completa se llevaría puesta.
  await page.evaluate(() => { (window as unknown as { __qa?: string }).__qa = 'sin-recargar' })

  await seccion.getByTestId('abrir-subida-documento').click()
  await seccion.getByTestId('archivos-documento').setInputFiles({
    name: ARCHIVO, mimeType: 'application/pdf', buffer: PDF,
  })
  await seccion.getByTestId('categoria-documento').selectOption('contrato')
  await seccion.getByTestId('descripcion-documento').fill('QA del panel')
  await seccion.getByTestId('enviar-documento').click()
  await expect(seccion.getByTestId('ok-documento')).toHaveText('Documento guardado.')

  // ═══ LA LISTA SE REFRESCÓ, Y LA PÁGINA NO SE RECARGÓ ═══
  const fila = seccion.getByTestId('fila-documento')
  await expect(fila).toHaveCount(1)
  await expect(fila.getByTestId('bajar-documento')).toHaveText(ARCHIVO)
  expect(await page.evaluate(() => (window as unknown as { __qa?: string }).__qa)).toBe('sin-recargar')
  // El panel de carga flota SOBRE la lista mientras está abierto —ahí vive el «Documento
  // guardado.»—, así que se cierra con su propio botón, que es lo que hace la persona.
  await seccion.getByTestId('cerrar-subida-documento').click()
  await expect(seccion.getByTestId('panel-subida-documento')).toHaveCount(0)
  // DESPUÉS: el documento listado en el panel, sin haber ido a la ficha ni recargado.
  await page.screenshot({ path: 'tests/qa-shots/proveedor-panel-documentos-despues.png', fullPage: true })

  // ═══ EL EFECTO EN LA BASE, NO LA PANTALLA QUE DIJO QUE SÍ ═══
  const { data: filaBd } = await sb.from('proveedor_documento')
    .select('id, storage_path, nombre_archivo, tipo_mime, tamano_bytes, categoria, descripcion, eliminado_en')
    .eq('proveedor_id', proveedorId).single()
  expect(filaBd?.nombre_archivo).toBe(ARCHIVO)
  expect(filaBd?.categoria).toBe('contrato')
  expect(filaBd?.tipo_mime).toBe('application/pdf')
  expect(filaBd?.tamano_bytes).toBe(PDF.byteLength)
  expect(filaBd?.eliminado_en).toBe(null)

  // Y EL OBJETO EN EL BUCKET: la fila sin archivo es una ficha que lista un contrato que no está.
  const bajado = await sb.storage.from(BUCKET).download(filaBd?.storage_path as string)
  expect(bajado.error).toBe(null)
  expect(Buffer.from(await bajado.data!.arrayBuffer()).equals(PDF)).toBe(true)

  // ═══ BAJARLO DESDE LA PANTALLA: LA FIRMA CONTESTA 200 ═══
  const descarga = page.waitForEvent('download')
  await fila.getByTestId('bajar-documento').click()
  const d = await descarga
  expect(d.suggestedFilename()).toBe(ARCHIVO)
  expect(readFileSync(await d.path()).equals(PDF)).toBe(true)
  const respuesta = await request.get(d.url())
  expect(respuesta.status()).toBe(200)

  // ═══ LA FICHA COMPLETA SIGUE SIENDO LA FICHA ═══
  //
  // Es el MISMO componente en su otro ancho: si el porte al panel rompiera la tabla de la ficha,
  // nadie lo vería hasta que alguien fuera a buscar un contrato ahí. El documento subido DESDE el
  // panel se lista en la ficha sin haberlo tocado.
  await page.goto(`/administracion/proveedores/${proveedorId}?vista=documentos`)
  await expect(page.getByTestId('fila-documento')).toHaveCount(1)
  await expect(page.getByTestId('fila-documento').getByTestId('bajar-documento')).toHaveText(ARCHIVO)
  await page.screenshot({ path: 'tests/qa-shots/proveedor-ficha-documentos.png', fullPage: true })
  await page.goto(`/administracion/proveedores?p=${proveedorId}`)

  // ═══ LA BAJA ES EN DOS PASOS: UN CLIC NO BORRA NADA ═══
  const baja = fila.getByTestId('baja-documento')
  await expect(baja).toHaveText('dar de baja')
  await baja.click()
  await expect(baja).toHaveText('confirmar baja')
  const { data: intacta } = await sb.from('proveedor_documento')
    .select('eliminado_en').eq('id', filaBd?.id as string).single()
  expect(intacta?.eliminado_en).toBe(null)

  await baja.click()
  // 20 s y no los 5 por defecto: la baja es una Server Action y, en `next dev`, la primera de una
  // ruta recién navegada paga la compilación. Un timeout corto acá informa «no se dio de baja»
  // cuando lo único que pasó es que el servidor todavía estaba compilando.
  await expect(seccion.getByTestId('fila-documento')).toHaveCount(0, { timeout: 20000 })
  await expect(page.getByTestId('documentos-vacio')).toHaveText('0 documentos')
  const { data: dadaDeBaja } = await sb.from('proveedor_documento')
    .select('eliminado_en, eliminado_por').eq('id', filaBd?.id as string).single()
  expect(dadaDeBaja?.eliminado_en).not.toBe(null)
  expect(dadaDeBaja?.eliminado_por).not.toBe(null)
  await page.screenshot({ path: 'tests/qa-shots/proveedor-panel-documentos-baja.png', fullPage: true })
})
