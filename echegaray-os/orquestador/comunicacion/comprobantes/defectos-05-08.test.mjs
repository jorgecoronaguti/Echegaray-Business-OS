// LOS CUATRO DEFECTOS DEL 05/08, MEDIDOS EN LOS HILOS REALES DEL CANAL `comprobantes-gastos`.
//
// No son ejemplos: son los mensajes que el dueño recibió esta semana, con las anotaciones
// manuscritas que estaban en las fotos y con la fila de Compras donde el comprobante ya estaba.
//
//   1. LA RENDICIÓN. Un lote de 5 fotos contestó «1 listo para cargar · 1 con un dato pendiente».
//      Tres fotos no se mencionaron en ninguna línea del mensaje. Cada adjunto tiene que terminar en
//      exactamente UNO de: cargado · copia del mismo · duplicado · pendiente (con qué falta) ·
//      ilegible (con por qué). Y la cuenta tiene que cerrar contra la cantidad de adjuntos.
//
//   2. LA MANUSCRITA NO SE INTERPRETA. «Estrella / pisos - galpón 9 / c/c», «Toyota EEA885» y
//      «Autoelevador c/c». Traen obra (J), detalle (K) y CONDICIÓN DE VENTA — y la condición escrita
//      a mano por el dueño MANDA sobre la impresa en el papel.
//
//   3. LA OBRA SALE CON EL VALOR EXACTO DEL DESPLEGABLE. Se escribió «Estrella» donde la columna J
//      dice «LA ESTRELLA». Un texto libre que no matchea NO se inventa: se pregunta.
//
//   4. DEDUP ANTES DE PREGUNTAR. El tique de Barcelo 00113-00014288 se mandó TRES veces y el bot,
//      en vez de decir «ya está en la fila 822», pidió los datos que no había podido leer.

import test from 'node:test'
import assert from 'node:assert/strict'
import { procesarPost } from './flujo.mjs'
import { aplicarCorreccion } from './dialogo.mjs'
import { repoMemoria, portGuarda, mmFalso, filaCompras } from './dobles.mjs'
import { armarItem } from '../../lib/comprobantes/item.mjs'
import { indexarCompras, obrasFirmes } from '../../lib/comprobantes/compras-vivas.mjs'
import { rendicionDeAdjuntos, DESTINO, textoRendicion } from '../../lib/comprobantes/rendicion.mjs'
import { condicionDeAnotacion } from '../../lib/comprobantes/imputacion.mjs'
import { PROMPT_LECTURA } from '../../lib/comprobantes/vision.mjs'

const URL = 'https://chat.ecsas.com.ar/comprobantes/accion?t=SECRETO'
const ACTOR = { plataforma_user_id: 'u_rodrigo', plataforma_username: 'rodrigo', channel_type: 'P', channel_id: 'c_comprobantes' }

/** El desplegable REAL de la columna J. «LA ESTRELLA», no «Estrella». */
const LISTAS = Object.freeze({
  ok: true,
  proveedores: ['Combustibles Barcelo', 'Corralon Progreso', 'ALUMETAL'],
  obras: ['Administracion', 'ARCOR', 'LA ESTRELLA', 'MESSINA', 'San Francisco', 'Taller', 'Vehiculos / Maquinas'],
  unidades: ['Materiales', 'Servicios'],
  categorias: ['Materiales', 'Combustible'],
  tiposPago: ['Efectivo', 'Transferencia', 'Cheque'],
})

/** El vocabulario VIVO de la columna K, por obra. Sale de las filas de Compras, no de una lista. */
const DETALLES = Object.freeze({
  'LA ESTRELLA': ['Pisos - Galpon 9', 'Sanitarios'],
  'Vehiculos / Maquinas': ['Autoelevador', 'Toyota - EEA885'],
  MESSINA: ['Camion - BSA', 'Planta de BSA'],
})

const VOCABULARIO = Object.freeze({ ...LISTAS, detalles: DETALLES, detallesFirmes: DETALLES })

/** El tique de Combustibles Barcelo de esta semana, tal como lo leyó la visión. */
const tiqueBarcelo = (over = {}) => ({
  emisor: 'Combustibles Barcelo', cuit: '30709123453', letra: '',
  numero: '00113-00014288', fecha: '03/08/2026',
  neto_gravado: '45.516,02', iva_21: '9.558,36', otros_tributos: '8.931,69', total: '64.006,07',
  condicion_venta: 'Contado', concepto: 'Nafta Super 1 y Diesel 500',
  anotacion_manuscrita: 'Toyota EEA885', legible: true, dudas: [], ...over,
})

/** Compras con el tique YA cargado en la fila 822. */
function filasCon822() {
  const filas = Array.from({ length: 822 - 4 }, () => [])
  filas.push(filaCompras('3/8/2026', 'Combustibles Barcelo', 'F A', '00113-00014288',
    'Vehiculos / Maquinas', 'Toyota - EEA885', 'Nafta Super', '$ 64.006,07', 'Combustible'))
  return filas
}

function armar({ lecturas, filas = [], listas = LISTAS, archivos = null } = {}) {
  const repo = repoMemoria()
  const mm = mmFalso({ archivos: archivos ?? { f1: { name: 'IMG_1.jpg', mime: 'image/jpeg' } } })
  let i = 0
  return {
    repo,
    mm,
    d: {
      port: portGuarda(), repo, mattermost: mm, url: URL,
      leer: async () => {
        const l = lecturas[Math.min(i++, lecturas.length - 1)]
        return l?.error ? { ok: false, error: l.error } : { ok: true, crudo: l }
      },
      listas: async () => listas,
      comprasDe: async () => ({ ok: true, ...indexarCompras(filas) }),
    },
  }
}

const post = (o = {}) => ({
  fileIds: ['f1'], actor: ACTOR, channelId: 'c_comprobantes', postId: 'p1', rootPostId: 'p1',
  ahora: new Date('2026-08-05T10:00:00Z'), ...o,
})

// ═══ 1 · CADA ADJUNTO TIENE QUE TERMINAR EN UNA LÍNEA ════════════════════════

test('cinco fotos: la respuesta rinde cuentas de LAS CINCO, no de las dos que sobrevivieron', async () => {
  const archivos = Object.fromEntries(['f1', 'f2', 'f3', 'f4', 'f5']
    .map((id, k) => [id, { name: `IMG_${k + 1}.jpg`, mime: 'image/jpeg' }]))
  const { d } = armar({
    archivos,
    // Tres fotos del MISMO tique, una factura distinta y una que no se pudo leer.
    lecturas: [
      tiqueBarcelo(), tiqueBarcelo(), tiqueBarcelo(),
      { emisor: 'Corralon Progreso', cuit: '23369111574', letra: 'A', numero: '0004-00003700',
        fecha: '04/08/2026', neto_gravado: '10.000,00', iva_21: '2.100,00', total: '12.100,00',
        anotacion_manuscrita: 'Estrella / pisos - galpon 9 / c/c', legible: true, dudas: [] },
      { error: 'la foto salió movida' },
    ],
  })
  const r = await procesarPost(d, post({ fileIds: ['f1', 'f2', 'f3', 'f4', 'f5'] }))

  assert.match(r.texto, /5 adjuntos/, 'el mensaje tiene que decir cuántos entraron')
  assert.match(r.texto, /2 (fotos|copias) más del mismo|2 copias/i, 'las dos copias del tique se nombran')
  assert.match(r.texto, /IMG_5\.jpg/, 'la foto ilegible se nombra por su archivo')
  assert.match(r.texto, /movida/, 'y con el motivo por el que no se pudo leer')
})

test('la rendición no deja un adjunto sin destino, y lo declara si no cuadra', () => {
  const r = rendicionDeAdjuntos({
    fileIds: ['f1', 'f2', 'f3', 'f4'],
    items: [
      { origen: { fileId: 'f1', nombre: 'a.jpg' }, copias: [{ fileId: 'f2', nombre: 'b.jpg' }], yaCargado: { fila: 822 } },
      { origen: { fileId: 'f3', nombre: 'c.jpg' }, comprobante: {} },
    ],
    problemas: [{ fileId: 'f4', nombre: 'd.jpg', error: 'no puedo mirar un archivo audio/mp4' }],
  })
  assert.equal(r.total, 4)
  assert.equal(r.porAdjunto.length, 4)
  assert.equal(r.cuadra, true)
  assert.deepEqual(r.porAdjunto.map((a) => a.destino),
    [DESTINO.CARGADO, DESTINO.COPIA, DESTINO.PENDIENTE, DESTINO.ILEGIBLE])

  const roto = rendicionDeAdjuntos({ fileIds: ['f1', 'f9'], items: [{ origen: { fileId: 'f1' }, comprobante: {} }], problemas: [] })
  assert.equal(roto.cuadra, false, 'un adjunto que no aparece en ningún lado NO se calla')
  assert.equal(roto.porAdjunto[1].destino, DESTINO.SIN_RASTRO)
  assert.match(textoRendicion(roto), /sin rastro|no sé qué pasó/i)
})

// ═══ 2 · LO ESCRITO A MANO: OBRA, DETALLE Y CONDICIÓN ═════════════════════════

test('«Estrella / pisos - galpón 9 / c/c» da obra, detalle y CUENTA CORRIENTE', () => {
  const it = armarItem({
    lectura: { emisor: 'Corralon Progreso', cuit: '23369111574', letra: 'A', numero: '0004-00003700',
      fecha: '04/08/2026', total: '12.100,00', neto_gravado: '10.000,00', iva_21: '2.100,00',
      condicion_venta: 'Contado', anotacion_manuscrita: 'Estrella / pisos - galpón 9 / c/c', legible: true },
    adjunto: { fileId: 'f1', nombre: 'IMG_1.jpg' },
    listas: VOCABULARIO,
  })
  assert.equal(it.comprobante.obra, 'LA ESTRELLA')
  assert.equal(it.comprobante.detalleObra, 'Pisos - Galpon 9')
  assert.equal(it.comprobante.condicion, 'Cuenta Corriente',
    'el "c/c" de la mano del dueño MANDA sobre el "Contado" impreso')
  assert.equal(it.comprobante.condicionVia, 'manuscrita')
})

test('«Autoelevador c/c» y «Toyota EEA885» resuelven el vehículo por el vocabulario de la columna K', () => {
  const base = { emisor: 'Combustibles Barcelo', cuit: '30709123453', letra: 'A', numero: '0113-00014290',
    fecha: '04/08/2026', total: '10.000,00', legible: true }

  const auto = armarItem({ lectura: { ...base, anotacion_manuscrita: 'Autoelevador c/c' }, adjunto: {}, listas: VOCABULARIO })
  assert.equal(auto.comprobante.obra, 'Vehiculos / Maquinas')
  assert.equal(auto.comprobante.detalleObra, 'Autoelevador')
  assert.equal(auto.comprobante.condicion, 'Cuenta Corriente')

  const toyota = armarItem({ lectura: { ...base, anotacion_manuscrita: 'Toyota EEA885' }, adjunto: {}, listas: VOCABULARIO })
  assert.equal(toyota.comprobante.obra, 'Vehiculos / Maquinas')
  assert.equal(toyota.comprobante.detalleObra, 'Toyota - EEA885')
})

test('la condición manuscrita es determinística y no adivina', () => {
  assert.equal(condicionDeAnotacion('Estrella c/c'), 'Cuenta Corriente')
  assert.equal(condicionDeAnotacion('SF. Cuenta cte'), 'Cuenta Corriente')
  assert.equal(condicionDeAnotacion('Ford XLS efectivo'), 'Contado')
  assert.equal(condicionDeAnotacion('pagado'), 'Contado')
  assert.equal(condicionDeAnotacion('Toyota EEA885'), null, 'sin marca de condición no se inventa una')
  assert.equal(condicionDeAnotacion('c/c efectivo'), null, 'las dos juntas son ambiguas: se pregunta')
})

test('el prompt de visión pide explícitamente mapear lo manuscrito a obra, detalle y condición', () => {
  assert.match(PROMPT_LECTURA, /condicion_manuscrita/)
  assert.match(PROMPT_LECTURA, /c\/c/i)
  assert.match(PROMPT_LECTURA, /cuenta corriente/i)
})

// ═══ 3 · LA OBRA, CON EL VALOR EXACTO DEL DESPLEGABLE ════════════════════════

test('«Estrella» escrito a mano entra a la columna J como «LA ESTRELLA», nunca como «Estrella»', () => {
  const it = armarItem({
    lectura: { emisor: 'Combustibles Barcelo', cuit: '30709123453', letra: 'A', numero: '0113-00014291',
      fecha: '04/08/2026', total: '5.000,00', anotacion_manuscrita: 'Estrella', legible: true },
    adjunto: {},
    listas: VOCABULARIO,
  })
  assert.equal(it.comprobante.obra, 'LA ESTRELLA')
})

test('Corregir con la lista de obras caída NO escribe el texto libre: falla cerrado', () => {
  const item = { comprobante: { proveedor: 'Combustibles Barcelo', numero: '0113-00014291', total: 1000 } }
  const r = aplicarCorreccion(item, { obra: 'Estrella' }, { obras: [] })
  assert.equal(r.ok, false, 'sin la lista estricta no se puede afirmar que esa obra exista')
  assert.match(r.errors.obra, /no pude leer|lista/i)

  const bien = aplicarCorreccion(item, { obra: 'estrella' }, { obras: LISTAS.obras })
  assert.equal(bien.ok, true)
  assert.equal(bien.item.comprobante.obra, 'LA ESTRELLA')
})

test('los valores REALES de la columna J son la fuente canónica cuando el desplegable no se puede leer', async () => {
  // 293 filas de Compras con la obra escrita tal cual la escribe el dueño.
  const filas = Array.from({ length: 293 }, (_, k) => filaCompras(
    `${(k % 28) + 1}/7/2026`, 'Corralon Progreso', 'F A', `0004-000037${String(k).padStart(2, '0')}`,
    ['LA ESTRELLA', 'MESSINA', 'San Francisco'][k % 3], 'Sanitarios', 'Materiales', '$ 1.000,00', 'Materiales'))
  const indice = indexarCompras(filas)
  assert.ok(indice.obras.includes('LA ESTRELLA'))
  assert.deepEqual(obrasFirmes(indice.usosDeObra).sort(), ['LA ESTRELLA', 'MESSINA', 'San Francisco'])

  // El desplegable no se pudo leer (Google no contestó): la obra igual sale canónica.
  const { d, repo } = armar({
    filas,
    listas: { ok: false, proveedores: [], obras: [], unidades: [], categorias: [], tiposPago: [] },
    lecturas: [{ emisor: 'Corralon Progreso', cuit: '23369111574', letra: 'A', numero: '0004-00009999',
      fecha: '04/08/2026', total: '12.100,00', neto_gravado: '10.000,00', iva_21: '2.100,00',
      anotacion_manuscrita: 'Estrella', legible: true }],
  })
  const r = await procesarPost(d, post())
  const it = repo._fajos.get(r.fajoId).items[0]
  assert.equal(it.comprobante.obra, 'LA ESTRELLA')
})

// ═══ 4 · DEDUP ANTES DE PREGUNTAR ════════════════════════════════════════════

test('el tique que YA está en la fila 822 no se pregunta: se dice dónde está', async () => {
  const { d } = armar({
    filas: filasCon822(),
    // La misma foto del tique, con la fecha que la visión leyó imposible: eso es lo que hacía que el
    // bot pidiera datos de un comprobante que ya estaba cargado.
    lecturas: [tiqueBarcelo({ fecha: '05/12/2003' })],
  })
  const r = await procesarPost(d, post())
  assert.match(r.texto, /fila 822/, 'tiene que decir dónde está')
  assert.doesNotMatch(r.texto, /❓/, 'y NO puede pedir un solo dato de algo que ya está cargado')
  assert.doesNotMatch(r.texto, /Corregir/, 'ni mandar a corregirlo')
})

test('la rendición no habla en pasado si la escritura no ocurrió', () => {
  const r = rendicionDeAdjuntos({ fileIds: ['f1'], items: [{ origen: { fileId: 'f1' }, comprobante: { proveedor: 'X', total: 1, fecha: '01/08/2026', numero: '0001-00000001', tipo: 'A' } }] })
  assert.match(textoRendicion(r, { seCargaron: true }), /1 cargado ahora/)
  assert.match(textoRendicion(r, { seCargaron: false }), /1 listo/)
  assert.doesNotMatch(textoRendicion(r), /cargado ahora/,
    'con el freno de mano puesto o con la escritura fallada, decir «cargado» contradice al mensaje de arriba')
})

test('las copias siguen nombradas cuando el mensaje se redibuja desde el fajo, sin la rendición del post', async () => {
  const archivos = Object.fromEntries(['f1', 'f2', 'f3'].map((id, k) => [id, { name: `IMG_${k + 1}.jpg`, mime: 'image/jpeg' }]))
  const { d, repo } = armar({ archivos, lecturas: [tiqueBarcelo(), tiqueBarcelo(), tiqueBarcelo()] })
  const r = await procesarPost(d, post({ fileIds: ['f1', 'f2', 'f3'] }))
  const fajo = repo._fajos.get(r.fajoId)
  // El fajo es lo ÚNICO que sobrevive en Postgres: si las copias no viajan ahí, el próximo click
  // redibuja el mensaje sin ellas y las dos fotos vuelven a desaparecer.
  const { resumenFajo } = await import('../../lib/comprobantes/mensaje.mjs')
  assert.match(resumenFajo(fajo), /mandaste 3 fotos de este mismo comprobante/)
  assert.match(resumenFajo(fajo), /IMG_2\.jpg/)
})

test('el mismo tique mandado TRES veces: una sola línea, «ya cargado», y cero preguntas', async () => {
  const archivos = Object.fromEntries(['f1', 'f2', 'f3'].map((id, k) => [id, { name: `IMG_${k + 1}.jpg`, mime: 'image/jpeg' }]))
  const { d, repo } = armar({
    archivos,
    filas: filasCon822(),
    lecturas: [tiqueBarcelo(), tiqueBarcelo(), tiqueBarcelo({ fecha: null })],
  })
  const r = await procesarPost(d, post({ fileIds: ['f1', 'f2', 'f3'] }))
  const items = repo._fajos.get(r.fajoId)?.items ?? []
  assert.equal(items.length, 1, 'las tres fotos son UN comprobante')
  assert.equal(items[0].yaCargado?.fila, 822)
  assert.doesNotMatch(r.texto, /❓/)
  assert.match(r.texto, /3 adjuntos/)
})
