// Cada test es un defecto medido el 10/09/2026 sobre la base viva. Si se revierte el arreglo, dan rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { archivosPorClave, papelDelGasto, papelDeCadaGasto, todosConPapel, ESTADO } from './papel-por-clave.mjs'

const espejo = [
  { fila: 813, clave: 'p:villa del pino|0001-00015751', proveedor: 'VILLA DEL PINO' },
  { fila: 818, clave: 'p:axion servicentro media agua|0016-00029784', proveedor: 'AXION SERVICENTRO MEDIA AGUA' },
]

test('EL DEFECTO DE LA MEDICIÓN: el papel existe y el conteo por igualdad de claves lo daba faltante', () => {
  // El bot registra `c:<cuit>|…`, el espejo nombra `p:<proveedor>|…`, y el adjunto cuelga del segundo.
  // Comparar los dos rótulos daba «sin archivo»; seguir la cadena física dice que está a la vista.
  const r = papelDelGasto(
    { clave: 'c:30714340677|0001-00015751', proveedor: 'VILLA DEL PINO' },
    {
      archivos: [{ fileId: 'f1', nombre: 'IMG.jpg', postId: 'p1' }],
      adjuntos: new Map([['f1', { id: 'a1', compra_clave: 'p:villa del pino|0001-00015751', fila_compras: 813 }]]),
      espejo,
    })
  assert.equal(r.estado, ESTADO.VISIBLE)
  assert.equal(r.fila, 813)
})

test('el hueco se repone: archivo guardado sin clave → se vincula a la fila conciliada', () => {
  const r = papelDelGasto(
    { clave: 'c:30714340677|0001-00015751', proveedor: 'VILLA DEL PINO' },
    {
      archivos: [{ fileId: 'f1', nombre: 'IMG.jpg', postId: 'p1' }],
      adjuntos: new Map([['f1', { id: 'a1', compra_clave: null, fila_compras: null }]]),
      espejo,
    })
  assert.equal(r.estado, ESTADO.A_VINCULAR)
  assert.deepEqual(r.accion, { tipo: 'vincular', id: 'a1', fileId: 'f1', clave: 'p:villa del pino|0001-00015751', fila: 813 })
})

test('NUNCA PISA UN VÍNCULO AJENO: si el archivo ya cuelga de otra fila, se declara, no se reasigna', () => {
  const r = papelDelGasto(
    { clave: 'c:30714340677|0001-00015751', proveedor: 'VILLA DEL PINO' },
    {
      archivos: [{ fileId: 'f1', nombre: 'IMG.jpg', postId: 'p1' }],
      adjuntos: new Map([['f1', { id: 'a1', compra_clave: 'p:axion servicentro media agua|0016-00029784', fila_compras: 818 }]]),
      espejo,
    })
  assert.equal(r.estado, ESTADO.SIN_FILA)
  assert.equal(r.accion, null)
})

test('sin respaldo: el archivo del registro no está en el bucket → hay que bajarlo, con su clave ya sabida', () => {
  const r = papelDelGasto(
    { clave: 'c:30714340677|0001-00015751', proveedor: 'VILLA DEL PINO' },
    { archivos: [{ fileId: 'f9', nombre: 'IMG.jpg', postId: 'p9' }], adjuntos: new Map(), espejo })
  assert.equal(r.estado, ESTADO.SIN_RESPALDO)
  assert.equal(r.accion.tipo, 'bajar')
  assert.equal(r.accion.clave, 'p:villa del pino|0001-00015751')  // no hace falta leer el papel
  assert.equal(r.accion.fila, 813)
})

test('el punto de venta distinto NO se concilia: 0011 no es 0113 y colgarlo sería el papel equivocado', () => {
  const r = papelDelGasto(
    { clave: 'c:33708332599|0011-00014305', proveedor: 'Combustibles Barcelo' },
    {
      archivos: [{ fileId: 'f1' }],
      adjuntos: new Map([['f1', { id: 'a1', compra_clave: 'c:33708332599|0113-00014305', fila_compras: 900 }]]),
      espejo: [{ fila: 900, clave: 'c:33708332599|0113-00014305', proveedor: 'Combustibles Barcelo' }],
    })
  assert.equal(r.estado, ESTADO.SIN_FILA)
})

test('sin fuente: el registro no guardó el archivo del que salió el gasto', () => {
  const r = papelDelGasto({ clave: 'c:1|0001-00000001' }, { archivos: [], adjuntos: new Map(), espejo })
  assert.equal(r.estado, ESTADO.SIN_FUENTE)
})

test('archivosPorClave cruza por CLAVE y deduplica los reenvíos del mismo archivo', () => {
  const m = archivosPorClave([{
    post_ids: ['P'],
    items: [
      { clave: 'c:1|0001-1', origen: { fileId: 'a', nombre: 'a.jpg' }, copias: [{ fileId: 'a' }, { fileId: 'b' }] },
      { clave: 'c:2|0002-2', origen: { fileId: 'c' } },
    ],
    filas: [{ clave: 'c:2|0002-2', fila: 7 }],  // filas NO va en el orden de items: cruzar por índice miente
  }])
  assert.deepEqual(m.get('c:1|0001-1').map((x) => x.fileId), ['a', 'b'])
  assert.equal(m.get('c:1|0001-1')[0].postId, 'P')
  assert.deepEqual(m.get('c:2|0002-2').map((x) => x.fileId), ['c'])
})

test('todosConPapel PUEDE dar rojo: sólo es verde si no queda nada fuera de visible', () => {
  const cargados = [{ clave: 'c:30714340677|0001-00015751', proveedor: 'VILLA DEL PINO' }]
  const fuentes = new Map([['c:30714340677|0001-00015751', [{ fileId: 'f1' }]]])
  const visible = papelDeCadaGasto({
    cargados, fuentes, espejo,
    adjuntos: new Map([['f1', { id: 'a1', compra_clave: 'p:villa del pino|0001-00015751', fila_compras: 813 }]]),
  })
  assert.equal(todosConPapel(visible.resumen), true)
  const roto = papelDeCadaGasto({ cargados, fuentes, espejo, adjuntos: new Map() })
  assert.equal(todosConPapel(roto.resumen), false)
})
