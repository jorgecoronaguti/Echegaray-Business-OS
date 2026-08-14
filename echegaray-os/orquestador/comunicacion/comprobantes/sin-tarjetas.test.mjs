// NINGÚN CAMINO PUBLICA UNA TARJETA INTERACTIVA. Ése es el test, y es de producto.
//
// El dueño lo dijo dos veces: «no quiero mensajes del bot en la carga de comprobantes, necesito q la
// experiencia sea sin fisuras. solo quiero q confirme q termino todo». Los botones Confirmar /
// Corregir / Descartar y los desplegables de imputación eran la otra mitad del ruido.
//
// A propósito ESTE archivo NO toca `ORQ_COMPROBANTES_BOTONES`: corre con el entorno de producción.
//
// Desde el 14/08 ya no es el único: los otros cuatro archivos lo encendían para el ARCHIVO ENTERO
// —147 tests corriendo en una configuración que nadie ejecuta— y ahora lo encienden por TEST, con
// `testConBotones` (`lib/comprobantes/botones-de-prueba.mjs`). Aquéllos prueban la mecánica que quedó
// detrás del interruptor; éste prueba la POSICIÓN del interruptor, que es otra cosa.
//
// PARA VER EL ROJO: poné `ORQ_COMPROBANTES_BOTONES=1` y este archivo entero se cae.

import test from 'node:test'
import assert from 'node:assert/strict'
import { botonesFajo, botonesActivos } from '../../lib/comprobantes/fajo.mjs'
import { mensajeFajo } from '../../lib/comprobantes/mensaje.mjs'
import { procesarPost } from './flujo.mjs'
import { repoMemoria, portGuarda, mmFalso, lecturaBarcelo, LISTAS } from './dobles.mjs'

const URL = 'https://chat.ecsas.com.ar/comprobantes/accion?t=SECRETO'
const ACTOR = { plataforma_user_id: 'u_rodrigo', plataforma_username: 'rodrigo', channel_type: 'P', channel_id: 'c_comprobantes' }

test('el interruptor viene APAGADO en producción', () => {
  assert.equal(botonesActivos(), false)
})

test('botonesFajo no devuelve un solo bloque, ni siquiera con un fajo lleno y la URL puesta', () => {
  const fajo = {
    id: 'f1',
    items: [
      { comprobante: { proveedor: 'DUPEC', tipo: 'A', numero: '0004-00036542', total: 62000, fecha: '01/08/2026' } },
      { comprobante: { proveedor: 'X', tipo: 'A', numero: '0001-00000001', total: 100, fecha: '01/08/2026' }, posibleDuplicado: { fila: 840 } },
    ],
  }
  assert.deepEqual(botonesFajo(fajo, { url: URL }), [])
  assert.deepEqual(mensajeFajo(fajo, { url: URL }).attachments, [])
})

test('el camino completo —foto en el canal— no devuelve una sola tarjeta', async () => {
  const mm = mmFalso({ archivos: { f1: { name: 'factura.jpg', mime: 'image/jpeg' } } })
  const repo = repoMemoria()
  const r = await procesarPost({
    port: portGuarda(), repo, mattermost: mm, url: URL,
    leer: async () => ({ ok: true, crudo: lecturaBarcelo() }),
    listas: async () => LISTAS,
  }, {
    fileIds: ['f1'], actor: ACTOR, channelId: 'c_comprobantes', postId: 'p1', rootPostId: 'p1',
    ahora: new Date('2026-08-03T10:00:00Z'),
  })
  assert.deepEqual(r.attachments ?? [], [], 'el flujo devolvió una tarjeta')
  // Y el recuento sale igual: el mensaje único se arma con esto, no con la tarjeta.
  assert.equal(r.parte.recibidos, 1)
})

test('tampoco cuando el comprobante se CARGA solo y algo queda trabado', async () => {
  const mm = mmFalso({ archivos: { f1: { name: 'a.jpg', mime: 'image/jpeg' }, f2: { name: 'b.jpg', mime: 'image/jpeg' } } })
  const repo = repoMemoria()
  let i = 0
  const lecturas = [lecturaBarcelo(), lecturaBarcelo({ numero: null, total: null })]
  const r = await procesarPost({
    port: portGuarda(), repo, mattermost: mm, url: URL,
    leer: async () => ({ ok: true, crudo: lecturas[Math.min(i++, 1)] }),
    listas: async () => LISTAS,
    escribir: async (f) => ({ estado: 'cargado', texto: '✔ Cargado.', filas: [{ fila: 841, clave: 'k', proveedor: 'X' }], yaEstaban: 0, suma: 36460.3, sinImputar: [], avisos: [] }),
  }, {
    fileIds: ['f1', 'f2'], actor: ACTOR, channelId: 'c_comprobantes', postId: 'p1', rootPostId: 'p1',
    ahora: new Date('2026-08-03T10:00:00Z'),
  })
  assert.deepEqual(r.attachments ?? [], [], 'el camino con trabados devolvió una tarjeta')
  assert.equal(r.parte.cargados, 1)
})
