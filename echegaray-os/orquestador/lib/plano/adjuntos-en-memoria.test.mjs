// LOS ADJUNTOS NO TOCAN DRIVE — el dueño lo pidió con estas palabras (02/09/2026):
// «no quiero que haga eso: ir a una carpeta y pegarle cosas por su cuenta».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { documentosEnMemoria } from './pipeline.mjs'
import { planosDe, partirDocumentos } from './documentos.mjs'

test('un adjunto se vuelve documento en memoria con identidad por hash, sin pisar Drive', () => {
  const docs = documentosEnMemoria([
    { nombre: 'PLANO PLANTA E-01.pdf', contenido: 'LÁMINA E-01 · zapatas Z1 60x60' },
  ])
  assert.equal(docs.length, 1)
  const d = docs[0]
  assert.match(d.drive_file_id, /^adjunto:v2:[0-9a-f]{32}$/)  // la MISMA llave del caché de interpretación
  assert.equal(d.name, 'PLANO PLANTA E-01.pdf')
  assert.equal(d.path, '(adjunto)/PLANO PLANTA E-01.pdf')
  assert.ok(Buffer.isBuffer(d._bytes))                        // los bytes viajan con el doc: nadie descarga nada
  assert.equal(d.is_folder, false)
})

test('el mismo contenido con otro nombre conserva la misma identidad de contenido', () => {
  const [a] = documentosEnMemoria([{ nombre: 'a.pdf', contenido: 'X' }])
  const [b] = documentosEnMemoria([{ nombre: 'b.pdf', contenido: 'X' }])
  assert.equal(a.drive_file_id, b.drive_file_id)              // genealogía por contenido, no por nombre
})

test('un adjunto sin nombre o sin contenido se ignora sin romper la corrida', () => {
  assert.equal(documentosEnMemoria([{ contenido: 'X' }, { nombre: 'x.pdf' }, null]).length, 0)
  assert.equal(documentosEnMemoria().length, 0)
})

test('el documento en memoria recorre el MISMO camino que uno de Drive y conserva sus bytes', () => {
  const docs = documentosEnMemoria([
    { nombre: 'PLANO PLANTA E-01.pdf', contenido: 'contenido' },
    { nombre: '01-ESTRUCTURA Galpon.dwg', contenido: 'cad' },
  ])
  const { insumos } = partirDocumentos(docs)
  const planos = planosDe(insumos)
  assert.equal(planos.legibles.length, 1)                     // el PDF entra
  assert.equal(planos.legibles[0].name, 'PLANO PLANTA E-01.pdf')
  assert.ok(!planos.legibles.some((d) => d.name.endsWith('.dwg')))  // el CAD jamás entra al camino visual
  // Los bytes SOBREVIVEN a la clasificación: si se perdieran acá, el pipeline intentaría
  // descargar «adjunto:<hash>» de Drive — que es exactamente lo que ya no debe pasar.
  assert.ok(Buffer.isBuffer(planos.legibles[0]._bytes))
})
