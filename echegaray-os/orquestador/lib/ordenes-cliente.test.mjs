import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clasificarAdjunto, claveDocumento, dominioDe, extensionDe,
  extraerFecha, extraerImporte, extraerNumero, facturaPropiaDe, formatoNumerico, mapaDeCitas,
  resolverObraDeTexto, TIPOS, tokensDeObra,
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

// LOS CUATRO TESTS DE «DE QUIÉN ES ESTE MAIL» VIVEN AHORA EN `ordenes-atribucion.test.mjs`,
// junto a la función que los responde.

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
  agruparPorNumero, comprobantePropio, comprobantesCitados, extraerFechaDeOrden, fechaImposible,
  mapaDeEvidencia, numeroCanonico, numeroCorto,
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

test('el número corto hereda, salvo que signifique dos obras', () => {
  const mapa = mapaDeEvidencia([
    { numero: '00002-00002173', obra_id: 'messina-playon-azufre' },
    { numero: '00001-00000225', comprobante: 'A-1-225', obra_id: 'limpieza-de-escombros' },
    { numero: null, obra_id: 'x' },
  ])
  // «ADICIONAL OC 2173» es una cita real de la OC 2256: sin la clave corta el motivo impreso era
  // «no está en el OS», que es falso.
  assert.equal(mapa.get('2173'), 'messina-playon-azufre')
  assert.equal(mapa.get('2-2173'), 'messina-playon-azufre')
  assert.equal(mapa.get('A-1-225'), 'limpieza-de-escombros')
  // Dos puntos de venta que terminan igual y van a obras distintas: «2173» deja de significar algo.
  const ambiguo = mapaDeEvidencia([
    { numero: '00002-00002173', obra_id: 'obra-a' },
    { numero: '00003-00002173', obra_id: 'obra-b' },
  ])
  assert.equal(ambiguo.get('2173'), undefined)
  assert.equal(ambiguo.get('2-2173'), 'obra-a')
})

test('la fecha de la orden no depende de en qué orden el PDF derramó el encabezado', () => {
  // El MISMO texto de OC_32_0000200002173.pdf con el encabezado al revés — que es como lo derrama
  // el mismo emisor con otra plantilla. Antes devolvía null: la primera fecha caía fuera de la
  // ventana y la función se rendía sin mirar el resto del papel.
  const alReves = 'ORDEN DE COMPRA Manufacturas Químicas Juan Messina S.A. Sede Timbrado 01 '
    + 'Fecha Inicio Act. 22-08-86 Orden de compra Nº: 00002-00002173 Mendoza - 11 /08 /2026'
  assert.equal(extraerFechaDeOrden(alReves), '2026-08-11')
})

test('la fecha de la orden no es «Fecha Inicio Act. 22-08-86»', () => {
  // Texto real de OC_32_0000200002173.pdf. Las cinco OC de Messina quedaron fechadas 22/08/86.
  const oc = 'Orden de compra Nº: 00002-00002173 Mendoza - 11 /08 /2026 ORDEN DE COMPRA Manufacturas '
    + 'Químicas Juan Messina S.A. ... Sede Timbrado 01 S.Central Fecha Inicio Act. 22-08-86 Proveedor'
  assert.equal(extraerFecha(oc), '2086-08-22')          // el defecto, tal cual estaba
  assert.equal(extraerFechaDeOrden(oc), '2026-08-11')   // corregido
  const op = 'IMPUTACION ORDEN DE PAGO Nro.: 0000000004865 Fecha de emisión: 28/07/2026 30-71630464-3'
  assert.equal(extraerFechaDeOrden(op), '2026-07-28')
  assert.equal(extraerFechaDeOrden('sin ninguna fecha'), null)
  assert.equal(fechaImposible('2086-08-22'), true)
  assert.equal(fechaImposible('2026-08-11'), false)
  assert.equal(fechaImposible(null), false)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL LOCALE DEL DINERO — el defecto que dejó la OC 2173 guardada por $ 78,65
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Los dos textos son literales de PDF que están HOY en el bucket: la OC 2173 la imprime el sistema
// de Messina en formato norteamericano, y la factura A 225 la imprime ARCA en es_AR. Si alguien
// vuelve a cablear un locale, uno de los dos se pone rojo.
const OC_2173_US = 'Precio Unitario $   000000.0000   0.00   0.00 '
  + 'Subtotal :$   65,000,000.00 I.V.A.   :$   13,650,000.00 Total   :$   78,650,000.00'
const FACTURA_225_AR = 'FACTURA A  Comp. Nro: 00001   00000225 '
  + 'Limpieza de Escombros Embolsado OC 02- 00002162   1,00   unidades   5008660,65   0,00 '
  + 'Importe Neto Gravado: $   5008660,65 IVA 21%: $   1051818,74 Importe Total: $   6060479,39'

test('el importe se lee en el locale que el propio documento declara', () => {
  assert.equal(formatoNumerico(OC_2173_US), 'US')
  assert.equal(formatoNumerico(FACTURA_225_AR), 'AR')
  // EL DEFECTO: con el parser es_AR cableado, «78,650,000.00» daba 78,65 — cinco órdenes de
  // magnitud abajo y escrito como si fuera un hecho.
  assert.deepEqual(extraerImporte(OC_2173_US), { importe: 78650000, moneda: 'ARS' })
  assert.deepEqual(extraerImporte(FACTURA_225_AR), { importe: 6060479.39, moneda: 'ARS' })
})

test('el mismo importe escrito en los dos formatos da el mismo número', () => {
  assert.equal(extraerImporte('Total: $ 10.133.750,00').importe, 10133750)
  assert.equal(extraerImporte('Total: $ 10,133,750.00').importe, 10133750)
  // Un documento sin ninguna evidencia de locale sigue leyéndose como es_AR, que es el de la casa.
  assert.equal(formatoNumerico('Total: $ 1.089.000,00'), 'AR')
  // Y el locale forzado manda sobre la detección: es la puerta para un emisor que ya se conoce.
  assert.equal(extraerImporte('1.089.000,00', { formato: 'AR' }).importe, 1089000)
})

test('un número que no parece dinero no es un importe, en ningún locale', () => {
  assert.deepEqual(extraerImporte('CUIT 30-62031170-3 tel (0264) 4941119'), { importe: null, moneda: null })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA FACTURA NUESTRA NO ES UNA ORDEN DEL CLIENTE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('el PDF que se declara factura A es una factura, con SU número y la OC que cita', () => {
  // EL DEFECTO: seis filas guardadas como `orden_compra` con el número de la OC ajena. El archivo
  // se llama «OC 02-00002162.pdf» y el detalle cita la OC: las dos señales engañan.
  assert.equal(clasificarAdjunto({ nombreArchivo: 'OC 02-00002162.pdf' }).tipo, 'orden_compra')
  assert.deepEqual(facturaPropiaDe(FACTURA_225_AR), { tipo: 'factura', numero: 'A-1-225', cita: '2-2162' })
  // La OC que emitió el cliente NO se convierte en factura por nombrar la palabra.
  assert.equal(facturaPropiaDe(OC_2173_US), null)
  assert.ok(TIPOS.includes('factura'))
})

test('la obra que probó la factura llega a la OC que factura, y no cuando hay dos', () => {
  // Antes esto pasaba de rebote —la factura quedaba con el número de la OC y `agruparPorNumero`
  // las confundía—. Separados los tipos, la regla tiene que estar escrita o la OC pierde su obra.
  const mapa = mapaDeCitas([
    { obra_id: 'playon', citadas: ['2-2173', 'A-1-225'] },
    { obra_id: null, citadas: ['2-2266'] },
  ])
  assert.equal(mapa.get('2-2173'), 'playon')
  // Un comprobante propio no atribuye obra a nadie: no es una orden.
  assert.equal(mapa.has('A-1-225'), false)
  // Una OC citada por dos facturas de obras distintas deja de distinguir: la clave se cae.
  const ambiguo = mapaDeCitas([
    { obra_id: 'playon', citadas: ['2-2173'] },
    { obra_id: 'acido', citadas: ['2-2173'] },
  ])
  assert.equal(ambiguo.has('2-2173'), false)
})
