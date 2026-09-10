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

test('una obra que se llama como el cliente no se lleva todo', () => {
  // MEDIDO el 09/09/2026 sobre la casilla real: existe `obra_canonica` «Messina», de un solo token
  // que es el nombre del cliente. Sin descontarlo, la orden de «Clasificación de Escombros» y la de
  // «Pisos Industriales» aterrizaban las dos ahí, bajo una obra que no las produjo.
  const conGenerica = [...OBRAS_MESSINA, { id: 'og', nombre: 'Messina' }, { id: 'oe', nombre: 'Limpieza de Escombros' }]
  assert.deepEqual(tokensDeObra('Messina', 'Messina'), [])
  // «Clasificación de Escombros» NO es la obra «Limpieza de Escombros»: queda a nivel cliente. Antes
  // caía en la obra «Messina», que es peor que quedar sin obra — parecía atribuida.
  assert.equal(resolverObraDeTexto(conGenerica, 'Presupuesto Clasificación de Escombros — Juan Messina', { nombreCliente: 'Messina' }), null)
  assert.equal(resolverObraDeTexto(conGenerica, 'OC limpieza de escombros', { nombreCliente: 'Messina' })?.id, 'oe')
  assert.equal(resolverObraDeTexto(conGenerica, 'Orden de compra Juan Messina S.A.', { nombreCliente: 'Messina' }), null)
})

test('la sigla con el número corto del comprobante también clasifica', () => {
  // «OC 02-00002097.pdf» quedaba como `otro` porque la regla exigía tres dígitos pegados a la sigla
  // y el punto de venta son dos. Once adjuntos reales caían por eso.
  assert.equal(clasificarAdjunto({ nombreArchivo: 'OC 02-00002097.pdf' }).tipo, 'orden_compra')
  assert.equal(clasificarAdjunto({ nombreArchivo: '50% OC 02-00000279.pdf' }).tipo, 'orden_compra')
  assert.equal(clasificarAdjunto({ nombreArchivo: 'ocupacion del predio.pdf' }).tipo, 'otro')
})

test('la extensión del objeto no se inventa', () => {
  assert.equal(extensionDe('Orden de compra.PDF'), 'pdf')
  assert.equal(extensionDe('adjunto sin extension'), 'bin')
})

// ═══ IDENTIDAD Y HERENCIA (10/09/2026) ═══════════════════════════════════════════════════════════
//
// Todos los textos de acá están COPIADOS de los PDF reales del bucket `obras-documentos` (leídos el
// 10/09/2026 con `orquestador/lib/ingesta/pdf.mjs`). Un texto inventado prueba la expresión regular
// contra sí misma; éstos prueban contra el papel que manda Messina.
import {
  agruparPorNumero, comprobantePropio, comprobantesCitados, numeroCanonico, numeroCorto,
  obraPorReferencia, ocsCitadas,
} from './ordenes-cliente.mjs'

test('«Nro.» también trae número: la orden de pago quedaba sin identidad', () => {
  const pdf = 'IMPUTACION ORDEN DE PAGO Nro.: 0000000004865 Fecha de emisión: 28/07/2026'
  assert.equal(extraerNumero(pdf), '0000000004865')
  assert.equal(numeroCorto(extraerNumero(pdf)), '4865')
})

test('el número partido por el PDF es el mismo número', () => {
  // La factura nuestra parte el número: «OC 02- 00002162». La orden que emitió Messina dice
  // «00002-00002162». Sin canónico son dos órdenes y la pantalla dibuja dos chips de una sola OC.
  assert.equal(extraerNumero('0001 Limpieza de Escombros Embolsado OC 02- 00002162 1,00 unidades'), '02-00002162')
  assert.equal(numeroCanonico('02-00002162'), numeroCanonico('00002-00002162'))
  assert.equal(numeroCanonico('00002-00002162'), '2-2162')
  assert.equal(numeroCorto('00002-00002162'), '2162')
  assert.equal(numeroCanonico(null), null)
})

test('«VIGENCIA DE LA O/C:» sin número no inventa uno', () => {
  assert.equal(extraerNumero('VIGENCIA DE LA O/C: AVDA RIOJA NORTE 75 (5400 ) SAN JUAN'), null)
})

test('la factura cita la OC que factura, y ésa es la evidencia de la obra', () => {
  assert.deepEqual(ocsCitadas('0001 Planta BSA 50% OC 00002-00000279 1,00 unidades 4073021,70'), ['2-279'])
  assert.deepEqual(ocsCitadas('0001 Pisos 120m2 - OC: 02-00002097 1,00 unidades'), ['2-2097'])
  assert.deepEqual(ocsCitadas('Comprobante de Retención Nro : 00000-2026-00002208'), [])
})

test('la orden de pago cita FACTURAS, no OC: sin ese eslabón la cadena se corta', () => {
  const op = 'Nro. de Comp. Tipo Comp. Importe 1 FAC A0000100000225 22/08/2026 6.060.479,39 '
    + '2 FAC A0000100000223 22/08/2026 4.300.876,36 3 FAC A0000100000227 05/09/2026 4.928.356,26'
  assert.deepEqual(comprobantesCitados(op), ['A-1-225', 'A-1-223', 'A-1-227'])
})

test('una factura sabe qué comprobante es; una orden de compra no es una factura', () => {
  const fac = 'Punto de Venta: Comp. Nro: 00001 00000225 Razón Social: ECHEGARAY CONSTRUCCIONES '
    + 'S.A.S. FACTURA A COD. 01 IVA Responsable Inscripto'
  assert.equal(comprobantePropio(fac), 'A-1-225')
  assert.equal(comprobantePropio('Orden de compra Nº: 00002-00002162 Mendoza - 05 /08 /2026'), null)
})

test('hereda la obra sólo cuando la referencia apunta a UNA obra', () => {
  const mapa = new Map([['A-1-225', 'limpieza-de-escombros'], ['A-1-223', 'pisos-120m2']])
  assert.equal(obraPorReferencia(['A-1-225'], mapa).obraId, 'limpieza-de-escombros')
  // La OP 5146 cancela tres facturas de tres obras: repartirla sería inventar. Queda sin obra Y
  // con el motivo escrito — una lista de nueve órdenes sin motivo no sirve para decidir nada.
  const varias = obraPorReferencia(['A-1-225', 'A-1-223'], mapa)
  assert.equal(varias.obraId, null)
  assert.match(varias.porque, /2 obras distintas/)
  assert.match(obraPorReferencia(['A-1-999'], mapa).porque, /no está en el OS/)
  assert.match(obraPorReferencia([], mapa).porque, /no cita/)
})

test('la OC 2162 es UNA orden aunque haya llegado en dos mails', () => {
  const filas = [
    { id: 'a', tipo: 'orden_compra', numero: '00002-00002162' },
    { id: 'b', tipo: 'orden_compra', numero: '02-00002162' },
    { id: 'c', tipo: 'orden_pago', numero: '0000000004865' },
    { id: 'd', tipo: 'orden_compra', numero: null },
    { id: 'e', tipo: 'orden_compra', numero: null },
  ]
  const grupos = agruparPorNumero(filas)
  assert.equal(grupos.length, 4)
  assert.deepEqual(grupos[0].filas.map((f) => f.id), ['a', 'b'])
  // Dos documentos sin número NO son el mismo documento: agruparlos por su falta sería el peor
  // de los inventos.
  assert.deepEqual(grupos.slice(2).map((g) => g.filas.length), [1, 1])
})
