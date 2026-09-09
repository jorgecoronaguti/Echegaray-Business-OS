import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clasificarAdjunto, claveDocumento, clienteDelMail, dominioDe, extensionDe,
  extraerFecha, extraerImporte, extraerNumero, resolverObraDeTexto, tokensDeObra,
} from './ordenes-cliente.mjs'

// Las obras REALES de Messina y San Francisco, tal como están en obra_canonica el 09/09/2026.
// Se clavan acá porque el defecto que estos tests atrapan es de AMBIGÜEDAD ENTRE ELLAS: dos playones
// que empiezan igual, dos obras que dicen «pisos». Con obras inventadas el test pasa siempre.
const OBRAS_MESSINA = [
  { id: 'o1', nombre: 'ME - PLAYÓN DE AZUFRE' },
  { id: 'o2', nombre: 'ME - PLAYÓN DILUCIÓN DE ÁCIDO' },
  { id: 'o3', nombre: 'ME - PISOS 120 M² Y RAMPA' },
  { id: 'o4', nombre: 'ME - ADICIONAL TERCER MURO' },
  { id: 'o5', nombre: 'ME - BSA' },
]

test('el dominio del remitente prueba el cliente', () => {
  assert.equal(dominioDe('Isabel Villanueva <ivillanueva@juanmessina.com.ar>'), 'juanmessina.com.ar')
  const c = clienteDelMail({ from: 'Isabel <ivillanueva@juanmessina.com.ar>', asunto: 'OC' })
  assert.deepEqual({ clave: c.clave, via: c.via }, { clave: 'messina', via: 'remitente' })
})

test('un reenvío interno se atribuye por el texto, y queda MARCADO como deducido', () => {
  // Es el caso mayoritario: rodrigo@ecsas.com.ar reenvía la notificación de Messina. Si esto se
  // atribuyera por remitente, todas las órdenes serían «de ECSAS» y no habría ninguna del cliente.
  const c = clienteDelMail({ from: 'Rodrigo Echegaray <rodrigo@ecsas.com.ar>', asunto: 'Fwd: Construccion de Playon de Azufre', cuerpo: 'Juan Messina S.A.' })
  assert.equal(c.clave, 'messina')
  assert.equal(c.via, 'texto', 'un reenvío NO puede figurar como probado por el remitente')
})

test('un tercero identificado que NOMBRA a un cliente no se vuelve ese cliente', () => {
  // El defecto: un proveedor escribe «para la obra de Messina» y su remito termina archivado como
  // documento de Messina. El texto sólo decide cuando el remitente es de casa o desconocido.
  assert.equal(clienteDelMail({ from: 'ventas@arcor.com', cuerpo: 'para la obra de Messina' }).clave, 'arcor')
})

test('sin ninguna marca de cliente el mail queda SIN cliente, no adivinado', () => {
  assert.equal(clienteDelMail({ from: 'rodrigo@ecsas.com.ar', asunto: 'Fwd: Recibo de Starlink' }), null)
})

test('una notificación de pago que CITA la OC se clasifica como pago, no como compra', () => {
  // El defecto real: «Notificación de orden de pago O/P 0000000005156» cuyo cuerpo lista la orden de
  // compra que está pagando. Clasificarla como OC duplicaría la compra en la ficha del cliente.
  const r = clasificarAdjunto({
    asunto: 'Fwd: Notificación de orden de pago O/P 0000000005156',
    nombreArchivo: 'OP5156.pdf',
    textoPdf: 'ORDEN DE PAGO 5156 — cancela ORDEN DE COMPRA 2173',
  })
  assert.equal(r.tipo, 'orden_pago')
})

test('la sigla suelta no clasifica sin un número al lado', () => {
  // «OC» aparece dentro de palabras y de códigos. Sin el dígito, cualquier mail con la palabra
  // «choque» o un asunto en mayúsculas se volvía una orden de compra.
  assert.equal(clasificarAdjunto({ asunto: 'Reunion OC del jueves', nombreArchivo: 'acta.pdf' }).tipo, 'otro')
  assert.equal(clasificarAdjunto({ nombreArchivo: 'OC-00002173.pdf' }).tipo, 'orden_compra')
})

test('el plano que viaja en el mismo mail queda como otro', () => {
  assert.equal(clasificarAdjunto({ asunto: 'Orden de compra playón', nombreArchivo: 'plano-estructura.pdf', textoPdf: 'ESCALA 1:100' }).senal, 'asunto')
  assert.equal(clasificarAdjunto({ nombreArchivo: 'plano.pdf', textoPdf: 'ESCALA 1:100' }).tipo, 'otro')
})

test('número, fecha e importe salen del PDF, y valen null cuando no están', () => {
  const t = 'ORDEN DE COMPRA N° 00002-00002173\nFecha: 01/09/2026\nSubtotal $ 1.000.000,00\nTOTAL $ 12.345.678,90'
  assert.equal(extraerNumero(t), '00002-00002173')
  assert.equal(extraerFecha(t), '2026-09-01')
  assert.deepEqual(extraerImporte(t), { importe: 12345678.90, moneda: 'ARS' })
  assert.equal(extraerNumero('Adjunto la orden firmada'), null)
  assert.equal(extraerFecha('sin fecha'), null)
  assert.deepEqual(extraerImporte('CUIT 30712345678 tel 2644123456'), { importe: null, moneda: null })
})

test('la fecha se lee DD/MM y nunca MM/DD', () => {
  // 03/09/2026 es 3 de septiembre. Leída al revés sería 9 de marzo: seis meses de error en una
  // orden que después se cruza contra el flujo de caja.
  assert.equal(extraerFecha('Emitida el 03/09/2026'), '2026-09-03')
  assert.equal(extraerFecha('32/01/2026'), null, 'un día imposible no es una fecha')
})

test('el importe es el TOTAL, no el primer número que aparece', () => {
  assert.equal(extraerImporte('Item 1: 250.000,00\nItem 2: 1.750.000,00\nTOTAL: 2.000.000,00').importe, 2000000)
})

test('dos obras que empiezan igual NO se resuelven por sorteo', () => {
  // ÉSTE es el defecto que justifica la función: «PLAYÓN DE AZUFRE» y «PLAYÓN DILUCIÓN DE ÁCIDO».
  // Un mail que sólo dice «playón» tiene que quedar a nivel cliente.
  assert.equal(resolverObraDeTexto(OBRAS_MESSINA, 'Orden de compra por el playón'), null)
  assert.equal(resolverObraDeTexto(OBRAS_MESSINA, 'Construccion de Playon de Azufre').id, 'o1')
  assert.equal(resolverObraDeTexto(OBRAS_MESSINA, 'Cotización Playón para disolución de ácidos'), null,
    'disolución no es dilución: no se atribuye por parecido')
  assert.equal(resolverObraDeTexto(OBRAS_MESSINA, 'playon dilucion de acido - OC').id, 'o2')
})

test('las palabras de relleno no atribuyen una obra', () => {
  // Sin la lista de vacías, «ME - ADICIONAL TERCER MURO» matcheaba cualquier mail con la palabra
  // «adicional», y el prefijo «ME» matcheaba media casilla.
  assert.deepEqual(tokensDeObra('ME - ADICIONAL TERCER MURO'), ['tercer', 'muro'])
  assert.equal(resolverObraDeTexto(OBRAS_MESSINA, 'te paso el adicional de la obra'), null)
})

test('una obra que no es del cliente nunca puede ganar', () => {
  // La función recibe SÓLO las obras del cliente resuelto. Con la cartera entera, «PISOS» de San
  // Francisco competiría con «PISOS 120 M² Y RAMPA» de Messina.
  assert.equal(resolverObraDeTexto(OBRAS_MESSINA, 'SF - PISOS INDUSTRIALES'), null)
})

test('la clave de idempotencia NO depende del attachment_id', () => {
  // Gmail regenera `attachmentId` entre lecturas del mismo mensaje. Si la clave lo usara, la segunda
  // corrida del script duplicaría cada documento sin violar ninguna restricción.
  const a = claveDocumento({ messageId: 'm1', nombreArchivo: 'OC.pdf', tamanoBytes: 8123 })
  const b = claveDocumento({ messageId: 'm1', nombreArchivo: 'oc.PDF', tamanoBytes: 8123 })
  assert.equal(a, b, 'el mismo archivo con otra caja de letras es el mismo archivo')
  assert.notEqual(a, claveDocumento({ messageId: 'm1', nombreArchivo: 'OC.pdf', tamanoBytes: 9000 }))
  assert.notEqual(a, claveDocumento({ messageId: 'm2', nombreArchivo: 'OC.pdf', tamanoBytes: 8123 }))
})

test('la extensión del objeto no se inventa', () => {
  assert.equal(extensionDe('Orden de compra.PDF'), 'pdf')
  assert.equal(extensionDe('adjunto sin extension'), 'bin')
})
