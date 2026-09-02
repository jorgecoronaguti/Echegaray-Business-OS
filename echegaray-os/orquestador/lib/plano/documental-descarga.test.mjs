// LOS BYTES PUEDEN NO LLEGAR Y LA CORRIDA SIGUE — el 404 del dueño (02/09/2026, log vivo):
// «procesá esto» + plano adjunto murió con «google download 404» porque la ingesta documental
// descargaba TODO de Drive: el adjunto en memoria (id «adjunto:<hash>», 404 seguro) y cualquier
// archivo del índice que Drive ya no tenga. Ahora ambos quedan DECLARADOS como no leídos y la
// corrida sigue con lo que sí se pudo abrir.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ingerir } from './documental.mjs'
import { documentosEnMemoria } from './pipeline.mjs'

// Un Drive que no tiene nada: toda descarga es el 404 del incidente.
const drive404 = () => {
  let llamadas = 0
  return {
    llamadas: () => llamadas,
    descargarBytes: async () => { llamadas++; throw new Error('google download 404') },
  }
}

const DOC_DRIVE = (name) => ({ drive_file_id: `drive-${name}`, name, path: `obra/${name}`, is_folder: false, legible: true })

test('un documento de Drive que da 404 queda en noLeidos con motivo — no tumba la ingesta', async () => {
  const google = drive404()
  const pliego = DOC_DRIVE('pliego licitacion.pdf')
  const r = await ingerir({ google, insumos: [pliego], planosLegibles: [], escribirTemporal: () => null })
  assert.equal(r.noLeidos.length, 1)
  assert.equal(r.noLeidos[0].archivo, 'pliego licitacion.pdf')
  assert.match(r.noLeidos[0].porQue, /no se pudo descargar de Drive: google download 404/)
})

test('un plano legible de Drive que da 404 tampoco tumba: declarado y se sigue', async () => {
  const google = drive404()
  const plano = DOC_DRIVE('E-01 fundaciones.pdf')
  const r = await ingerir({ google, insumos: [], planosLegibles: [plano], escribirTemporal: () => null })
  assert.equal(r.segmentaciones.length, 0)
  assert.equal(r.noLeidos.length, 1)
  assert.match(r.noLeidos[0].porQue, /404/)
})

test('un ADJUNTO en memoria jamás pide sus bytes a Drive — el 404 del incidente era exactamente esto', async () => {
  const google = drive404()
  // Un CAD adjunto: entra por la rama cadDe con sus _bytes; si la ingesta pidiera Drive, el
  // contador delataría la llamada. Que abrirCad lo rechace como ilegible es lo esperado para
  // bytes de mentira — lo que NO puede pasar es el viaje a Drive ni la excepción.
  const [cad] = documentosEnMemoria([{ nombre: 'estructura galpon.dwg', contenido: 'no es un dxf real' }])
  const r = await ingerir({ google, insumos: [cad], planosLegibles: [], escribirTemporal: () => null })
  assert.equal(google.llamadas(), 0, 'los bytes en memoria no se piden a Drive')
  assert.equal(r.noLeidos.length, 1)
  assert.doesNotMatch(r.noLeidos[0].porQue ?? '', /descargar/, 'el motivo es del CAD ilegible, no de una descarga')
})
