// DE QUIÉN ES ESTE PAPEL, Y SI YA LO TENGO.
//
// Cada prueba de acá fija un defecto MEDIDO el 10/09/2026 contra `cliente_orden` (16 filas, todas
// de Messina) y contra las casillas jorge@ y rodrigo@:
//
//   · la OP 4865 y la OP 5156 tenían DOS filas cada una — la segunda es el certificado de retención;
//   · las cinco OC de Messina quedaron fechadas en 2086 («Fecha Inicio Act. 22-08-86»);
//   · nuestra propia factura no se atribuía a nadie cuando el reenvío venía sin asunto;
//   · el mismo PDF reenviado rodrigo→jorge entraba dos veces: dos message_id, una orden;
//   · «san francisco» del pie de un recibo de Anthropic atribuía ese PDF a un cliente de San Juan.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clienteDelDocumento, clienteDelMail, clientePorArchivo, clientePorCuit, consultasDeGmail,
  deduplicar, documentoDeAdjunto, fecharOrdenesDePagoPorSuRetencion, hashDocumento, heredarObras,
} from './ordenes-atribucion.mjs'
import {
  clasificarAdjunto, dominioDe, extraerFechaDeOrden, fechaRotulada, numeroDeRetencion,
  ordenDePagoDeLaRetencion,
} from './ordenes-cliente.mjs'

// El padrón REAL, tal como está en `public.clientes` el 10/09/2026. Se clava porque el defecto que
// estas pruebas atrapan es de identidad: con clientes inventados, cualquier regla pasa.
const CLIENTES_BD = [
  { id: 'cli-messina', nombre_comercial: 'Messina', cuit: '30620311703' },
  { id: 'cli-arcor', nombre_comercial: 'ARCOR', cuit: null },
  { id: 'cli-quattropani', nombre_comercial: 'Franco Quattropani', cuit: '30716699648' },
  { id: 'cli-sf', nombre_comercial: 'Javier Sánchez - San Francisco - IMOTOR', cuit: '30716476967' },
  { id: 'cli-estrella', nombre_comercial: 'La Estrella', cuit: '30716490498' },
]

const OBRAS = [
  { id: 'o-azufre', nombre: 'ME - PLAYÓN DE AZUFRE', cliente_id: 'cli-messina' },
  { id: 'o-escombros', nombre: 'ME - LIMPIEZA DE ESCOMBROS', cliente_id: 'cli-messina' },
]

// ── LA RETENCIÓN NO ES UNA ORDEN DE PAGO ────────────────────────────────────────────────────────

test('el certificado de retención de Messina es una retención, no la orden de pago que acompaña', () => {
  const r = clasificarAdjunto({
    asunto: 'ORDEN DE PAGO Nro 0000000004865',
    nombreArchivo: 'O_P_0000000004865_G00002208.pdf',
    textoPdf: 'CERTIFICADO DE RETENCION Impuesto a las Ganancias ORDEN DE PAGO Nro.: 0000000004865',
  })
  assert.equal(r.tipo, 'retencion', 'entraba como orden_pago y duplicaba la OP 4865 en la cartera')
})

test('la orden de pago que LISTA sus retenciones sigue siendo una orden de pago', () => {
  // El error simétrico, y el más caro: si la palabra «retención» suelta clasificara, TODAS las OP
  // pasarían a retención y la cartera se quedaría sin ningún pago.
  const r = clasificarAdjunto({
    asunto: 'ORDEN DE PAGO: 5156',
    nombreArchivo: '0000000005156.pdf',
    textoPdf: 'IMPUTACION ORDEN DE PAGO Nro.: 0000000005156 Retenciones Ganancias 145.000,00 Neto a pagar 39.325.000,00',
  })
  assert.equal(r.tipo, 'orden_pago')
})

test('el certificado se identifica por SU número, no por el de la orden que acompaña', () => {
  assert.equal(numeroDeRetencion({ nombreArchivo: 'O_P_0000000004865_G00002208.pdf' }), 'G00002208')
  assert.equal(numeroDeRetencion({ nombreArchivo: '0000000004865.pdf' }), null, 'una OP no tiene número de certificado')
})

test('ARCOR emite archivos sin ninguna palabra, y aun así se clasifican', () => {
  assert.equal(clasificarAdjunto({ nombreArchivo: '6A_50123456.PDF' }).tipo, 'orden_compra')
  assert.equal(clasificarAdjunto({ nombreArchivo: '00001_5000123_OP.PDF' }).tipo, 'orden_pago')
  assert.equal(clasificarAdjunto({ asunto: 'GENERACION OC' }).tipo, 'orden_compra')
})

// ── DE QUIÉN ES ─────────────────────────────────────────────────────────────────────────────────

test('el CUIT adentro del PDF atribuye el documento aunque el mail no diga nada', () => {
  // El caso real: rodrigo reenvía «Fwd:» con el PDF y nada más. Sin esta vía, la orden se perdía.
  const c = clienteDelDocumento({
    from: 'Rodrigo Echegaray <rodrigo@ecsas.com.ar>', asunto: 'Fwd:',
    textoPdf: 'ORDEN DE COMPRA  C.U.I.T. 30-62031170-3  Mendoza - 11 /08 /2026',
    clientes: CLIENTES_BD,
  })
  assert.equal(c.id, 'cli-messina')
  assert.equal(c.via, 'cuit', 'la vía tiene que quedar escrita: no es lo mismo probado que deducido')
})

test('NUESTRA factura se atribuye por el CUIT del RECEPTOR, no por el del emisor', () => {
  // `30716304643_001_00001_00000225.pdf` la emitimos nosotros: el primer CUIT del papel es el de
  // ECSAS. Atribuirla por ahí la dejaría archivada contra nosotros mismos.
  const c = clienteDelDocumento({
    from: 'Administración <administracion@ecsas.com.ar>', asunto: 'Factura', nombreArchivo: '30716304643_001_00001_00000225.pdf',
    textoPdf: 'FACTURA A  CUIT: 30-71630464-3  ECHEGARAY CONSTRUCCIONES SAS  Cliente: JUAN MESSINA SA  CUIT 30-62031170-3',
    clientes: CLIENTES_BD,
  })
  assert.equal(c.id, 'cli-messina')
  assert.equal(c.via, 'cuit')
})

test('un PDF con DOS clientes del padrón no se atribuye a ninguno', () => {
  const c = clientePorCuit('30-62031170-3 y 30-71649049-8 firman', CLIENTES_BD)
  assert.equal(c, null, 'elegir uno de los dos sería sortear')
})

test('el nombre de archivo del emisor atribuye cuando no hay CUIT legible', () => {
  assert.equal(clientePorArchivo('OC_32_0000200002097.pdf').clave, 'messina')
  assert.equal(clientePorArchivo('6A_50123456.PDF').clave, 'arcor')
  assert.equal(clientePorArchivo('presupuesto.pdf'), null, 'un nombre que no distingue no atribuye')
})

test('el remitente le gana al CUIT, y el CUIT al asunto: el orden de las vías es el contrato', () => {
  const porRemitente = clienteDelDocumento({
    from: 'Isabel <ivillanueva@juanmessina.com.ar>', asunto: 'ARCOR', clientes: CLIENTES_BD,
  })
  assert.deepEqual([porRemitente.clave, porRemitente.via], ['messina', 'remitente'])
  const porCuit = clienteDelDocumento({
    from: 'rodrigo@ecsas.com.ar', asunto: 'orden de compra ARCOR',
    textoPdf: 'CUIT 30-62031170-3', clientes: CLIENTES_BD,
  })
  assert.equal(porCuit.via, 'cuit', 'un asunto tipeado no puede ganarle al CUIT impreso en el papel')
  assert.equal(porCuit.id, 'cli-messina')
})

test('«San Francisco» del pie de un recibo extranjero ya no atribuye a un cliente de San Juan', () => {
  const c = clienteDelDocumento({
    from: 'rodrigo@ecsas.com.ar', asunto: 'Fwd: Your receipt from Anthropic',
    cuerpo: 'Anthropic PBC, 548 Market St, San Francisco, CA 94104',
    clientes: CLIENTES_BD,
  })
  assert.equal(c, null, 'los recibos de Anthropic entraban como órdenes de San Francisco')
})

test('un cliente RECONOCIDO que no está en el padrón se declara, no se inventa', () => {
  const c = clienteDelDocumento({ from: 'compras@saint-gobain.com', asunto: 'Orden de Compra 4500212345', clientes: CLIENTES_BD })
  assert.equal(c.nombre, 'Saint-Gobain')
  assert.equal(c.id, null, 'crear el cliente desde un parser es dar de alta una entidad que nadie autorizó')
})

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

// ── EL DOCUMENTO ENTERO ─────────────────────────────────────────────────────────────────────────

const OC_MESSINA = [
  'JUAN MESSINA S.A. ORDEN DE COMPRA Nro.: 00002-00002173',
  'C.U.I.T.: 30-62031170-3   Fecha Inicio Act. 22-08-86',
  'Mendoza - 11 /08 /2026',
  'Construccion de platea PLAYON DE AZUFRE',
  'Total :$ 78,650,000.00',
].join('\n')

test('la fecha de la orden es 11/08/2026 y no 2086: la ingesta usa la MISMA definición que la re-atribución', () => {
  const d = documentoDeAdjunto({
    from: 'Isabel <i@juanmessina.com.ar>', asunto: 'OC 2173',
    nombreArchivo: 'OC_32_0000200002173.pdf', textoPdf: OC_MESSINA,
    clientes: CLIENTES_BD, obras: OBRAS, hoy: new Date('2026-09-10T12:00:00Z'),
  })
  assert.equal(d.ok, true)
  assert.equal(d.fecha, '2026-08-11', 'las cinco OC del bucket quedaron guardadas en 2086 por leer «22-08-86»')
  assert.equal(d.tipo, 'orden_compra')
  assert.equal(d.numero, '00002-00002173')
  assert.equal(d.importe, 78650000, 'el locale del documento es US: leerlo en es_AR daba $ 78,65')
  assert.equal(d.obra.id, 'o-azufre')
})

test('un adjunto que no es ninguna de las tres cosas se descarta CON motivo', () => {
  const d = documentoDeAdjunto({ from: 'i@juanmessina.com.ar', nombreArchivo: 'plano-01.pdf', textoPdf: 'PLANTA GENERAL', clientes: CLIENTES_BD })
  assert.equal(d.ok, false)
  assert.match(d.motivo, /no es orden/)
})

test('la orden de pago se lleva las facturas que paga: sin ellas no puede encontrar su obra', () => {
  const d = documentoDeAdjunto({
    from: 'i@juanmessina.com.ar', asunto: 'ORDEN DE PAGO Nro 0000000005156',
    nombreArchivo: '0000000005156.pdf',
    textoPdf: 'ORDEN DE PAGO Nro.: 0000000005156 FAC A0000100000225 FAC A0000100000224 05/09/2026',
    clientes: CLIENTES_BD, obras: OBRAS, hoy: new Date('2026-09-10T12:00:00Z'),
  })
  assert.equal(d.tipo, 'orden_pago')
  assert.deepEqual(d.citadas, ['A-1-225', 'A-1-224'])
})

// ── ¿YA LO TENGO? ───────────────────────────────────────────────────────────────────────────────

test('el mismo PDF reenviado rodrigo→jorge entra UNA vez, aunque sean dos message_id', () => {
  const bytes = Buffer.from('%PDF-1.4 orden de compra 2173')
  const hash = hashDocumento(bytes)
  const { nuevos, repetidos } = deduplicar([
    { message_id: 'm-rodrigo', nombre_archivo: 'OC_32_0000200002173.pdf', hash_sha256: hash, cliente_id: 'cli-messina', tipo: 'orden_compra', numero: '00002-00002173' },
    { message_id: 'm-jorge', nombre_archivo: 'OC_32_0000200002173.pdf', hash_sha256: hash, cliente_id: 'cli-messina', tipo: 'orden_compra', numero: '00002-00002173' },
  ])
  assert.equal(nuevos.length, 1, 'la clave (message_id, nombre, tamaño) no ve el reenvío: son dos mensajes')
  assert.equal(repetidos.length, 1)
  assert.match(repetidos[0].porque, /mismos bytes/)
})

test('la misma orden reemitida con otro PDF tampoco entra dos veces', () => {
  const { nuevos, repetidos } = deduplicar([
    { nombre_archivo: 'OC_32_0000200002173.pdf', hash_sha256: hashDocumento(Buffer.from('a')), cliente_id: 'cli-messina', tipo: 'orden_compra', numero: '00002-00002173' },
    { nombre_archivo: 'OC 02- 00002173.pdf', hash_sha256: hashDocumento(Buffer.from('b')), cliente_id: 'cli-messina', tipo: 'orden_compra', numero: '02-2173' },
  ])
  assert.equal(nuevos.length, 1)
  assert.match(repetidos[0].porque, /ya existe orden_compra N° 2-2173/)
})

test('dos papeles SIN número no son el mismo papel', () => {
  const { nuevos } = deduplicar([
    { nombre_archivo: 'a.pdf', hash_sha256: hashDocumento(Buffer.from('a')), cliente_id: 'cli-messina', tipo: 'orden_compra', numero: null },
    { nombre_archivo: 'b.pdf', hash_sha256: hashDocumento(Buffer.from('b')), cliente_id: 'cli-messina', tipo: 'orden_compra', numero: null },
  ])
  assert.equal(nuevos.length, 2, 'unirlos por «ninguno de los dos tiene número» sería el peor invento')
})

test('la orden que ya está en la base no vuelve a entrar', () => {
  const { nuevos, repetidos } = deduplicar(
    [{ nombre_archivo: 'nuevo.pdf', hash_sha256: hashDocumento(Buffer.from('x')), cliente_id: 'cli-messina', tipo: 'orden_compra', numero: '00002-00002162' }],
    { yaEnBase: [{ nombre_archivo: 'OC_32_0000200002162.pdf', hash_sha256: hashDocumento(Buffer.from('y')), cliente_id: 'cli-messina', tipo: 'orden_compra', numero: '00002-00002162' }] },
  )
  assert.equal(nuevos.length, 0)
  assert.equal(repetidos.length, 1)
})

test('la retención y la orden de pago que la acompaña conviven: son dos papeles distintos', () => {
  const { nuevos } = deduplicar([
    { nombre_archivo: '0000000004865.pdf', hash_sha256: hashDocumento(Buffer.from('op')), cliente_id: 'cli-messina', tipo: 'orden_pago', numero: '0000000004865' },
    { nombre_archivo: 'O_P_0000000004865_G00002208.pdf', hash_sha256: hashDocumento(Buffer.from('ret')), cliente_id: 'cli-messina', tipo: 'retencion', numero: 'G00002208' },
  ])
  assert.equal(nuevos.length, 2, 'hoy son dos filas de orden_pago con el MISMO número: ése es el defecto')
})

// ── LAS CONSULTAS ───────────────────────────────────────────────────────────────────────────────

test('las consultas cubren a los cinco emisores conocidos y no usan filename:', () => {
  const qs = consultasDeGmail()
  for (const d of ['juanmessina.com.ar', 'arcor.com', 'arcornet.com.ar', 'saint-gobain.com', 'orica.com']) {
    assert.ok(qs.some((q) => q.includes(`from:${d}`)), `falta la consulta por remitente de ${d}`)
  }
  assert.ok(!qs.some((q) => /filename:/.test(q)), 'filename:OC_32 devuelve 0: el guión bajo rompe el operador')
})

// ── LA OBRA QUE EL PAPEL NO NOMBRA ──────────────────────────────────────────────────────────────

test('la orden de pago cuelga de la obra de las facturas que paga', () => {
  // La cadena real: la OP 5146 no nombra ninguna obra; nombra la FAC A0000100000225, que cita la
  // OC 2162, que describe la limpieza de escombros. Sin recorrerla, la OP queda a nivel cliente.
  const docs = [
    { cliente_id: 'c', obra_id: 'o-escombros', nombre_archivo: 'OC 02-00002162.pdf', tipo: 'factura', numero: 'A-1-225', comprobante: 'A-1-225', citadas: ['2-2162'], texto: 'Limpieza de Escombros' },
    { cliente_id: 'c', obra_id: null, nombre_archivo: '0000000005146.pdf', tipo: 'orden_pago', numero: '0000000005146', citadas: ['A-1-225'], texto: 'ORDEN DE PAGO' },
  ]
  heredarObras(docs, { obras: OBRAS })
  assert.equal(docs[1].obra_id, 'o-escombros')
  assert.match(docs[1].porque, /hereda la obra de A-1-225/)
})

test('la orden de pago que cancela facturas de DOS obras no cuelga de ninguna, y dice por qué', () => {
  const docs = [
    { cliente_id: 'c', obra_id: 'o-escombros', nombre_archivo: 'f1.pdf', tipo: 'factura', numero: 'A-1-225', comprobante: 'A-1-225', citadas: [], texto: '' },
    { cliente_id: 'c', obra_id: 'o-azufre', nombre_archivo: 'f2.pdf', tipo: 'factura', numero: 'A-1-226', comprobante: 'A-1-226', citadas: [], texto: '' },
    { cliente_id: 'c', obra_id: null, nombre_archivo: 'op.pdf', tipo: 'orden_pago', numero: '5156', citadas: ['A-1-225', 'A-1-226'], texto: '' },
  ]
  heredarObras(docs, { obras: OBRAS })
  assert.equal(docs[2].obra_id, null, 'repartir una OP entre dos obras sería inventar')
  assert.match(docs[2].porque, /2 obras distintas/)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// TEXTOS LITERALES DE PDF QUE HOY ESTÁN EN EL BUCKET (leídos el 10/09/2026)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// No son ejemplos escritos a mano: son la capa de texto real, con sus espacios y sus cortes. Un
// fixture inventado habría pasado las dos pruebas de abajo desde el primer día.

const OC_2226 = 'Orden de compra Nº: 00002-00002226 Mendoza - 24 /08 /2026 ORDEN DE COMPRA '
  + 'Manufacturas Químicas Juan Messina S.A. CUIT: 30-62031170-3 Sede Timbrado 01 S.Central '
  + 'Fecha Inicio Act. 22-08-86 Proveedor : 2113 ECHEGARAY CONSTRUCCIONES S.A.S VIGENCIA DE LA O/C: '
  + 'AUTORIZADO POR: ERICA Cond.Compra : 3 CUENTA CORRIENTE 15 DIAS COMPRADOR: VILLANUEVA ISABEL '
  + 'Observaciones: RAMPA PARA PISO 120 M2 DEPOSITO DESTINO: G3 FABRICA '
  + '1.00 SERVICIOS DE TERCEROS FCA $ 354255.3900 0.00 0.00 $ ,354,255.39 21.00 21/08/2026 1.00 '
  + 'C.COSTO: 010109 DETALLE: PLAYON AZUFRE Subtotal :$ 2,354,255.39'

const OP_730 = 'O R D E N D E P A G O MANUFACTURAS QUIMICAS JUAN MESSINA SA NºOrden de Pago: '
  + '0000000000730 Fecha : 25/09/2 Proveedor : 2113 ECHEGARAY CONSTRUCCIONES S.A.S C.U.I.T: '
  + '30-71630464-3 IMPUTACION Tipo Comp. Nro. Comprobante Fecha Vto. Importe '
  + 'FAC A0000100000165 24/09/2024 13,142,283.35 PAGO A CUENTA: 0.00 TOTAL : 13,142,283.35 '
  + 'Retención Impuesto a las Ganancias : 212,747.82 NETO A ABONAR : 12,929,535.53 '
  + 'Nro. Cheque Banco Fecha Importe 86692743 MACRO S.A. 27/09/2024 12375001.24'

const RET_730 = 'MANUFACTURAS QUIMICAS JUAN MES Av LIBERTADOR SAN MARTIN 149 SAN JUAN '
  + 'C.U.I.T- 30-62031170-3 Comprobante de Retención Nro : 00000-2024-00000347 '
  + 'O/P : 0000000000730 Fecha : 25/09/2024 Apellido y Nombre o Razón Social : '
  + 'ECHEGARAY CONSTRUCCIONES S.A.S Nro. de C.U.I.T. : 30-71630464-3 '
  + 'Concepto del Pago : Enajenación de Bienes Código de R?gimen : 78 '
  + 'Importe pagado sujeto a retención : 10861391.20 Importe retenido : 212747.82'

test('la OC 2226 es de PISOS 120 M² Y RAMPA, aunque el centro de costo diga PLAYON AZUFRE', () => {
  // El defecto medido: «Observaciones: RAMPA PARA PISO 120 M2» aportaba cero puntos porque la obra
  // se llama «PISOS» y el papel dice «PISO», y la orden se fue al playón por sus dos tokens.
  const obras = [
    { id: 'o-azufre', nombre: 'ME - PLAYÓN DE AZUFRE', cliente_id: 'cli-messina' },
    { id: 'o-pisos', nombre: 'ME - PISOS 120 M² Y RAMPA', cliente_id: 'cli-messina' },
  ]
  const d = documentoDeAdjunto({
    from: 'ivillanueva@juanmessina.com.ar', nombreArchivo: 'OC_32_0000200002226.pdf', textoPdf: OC_2226,
    clientes: CLIENTES_BD, obras, hoy: new Date('2026-09-10T12:00:00Z'),
  })
  assert.equal(d.obra?.id, 'o-pisos')
  assert.equal(d.fecha, '2026-08-24')
})

test('una orden de pago con el año cortado NO se fecha con el vencimiento de la factura que paga', () => {
  // «Fecha : 25/09/2». El papel también dice 24/09/2024 (vencimiento) y 27/09/2024 (cheque): el
  // rastreo a ciegas devolvía el 24, que es otro hecho. Sin el certificado, la respuesta es null.
  assert.equal(fechaRotulada(OP_730), 'truncada')
  assert.equal(extraerFechaDeOrden(OP_730, { hoy: new Date('2026-09-10T12:00:00Z') }), null)
})

test('la fecha de esa orden sale del certificado de retención de la MISMA O/P', () => {
  assert.equal(ordenDePagoDeLaRetencion({ nombreArchivo: 'O_P_0000000000730_G00000347.pdf' }), '730')
  assert.equal(ordenDePagoDeLaRetencion({ textoPdf: RET_730 }), '730')
  const docs = [
    { cliente_id: 'cli-messina', tipo: 'orden_pago', numero: '0000000000730', fecha: null },
    { cliente_id: 'cli-messina', tipo: 'retencion', numero: 'G00000347', fecha: '2024-09-25', opCitada: '730', nombre_archivo: 'O_P_0000000000730_G00000347.pdf' },
  ]
  const { rellenadas } = fecharOrdenesDePagoPorSuRetencion(docs)
  assert.equal(rellenadas, 1)
  assert.equal(docs[0].fecha, '2024-09-25')
  assert.match(docs[0].porqueFecha, /certificado de retención/)
})

test('el certificado de OTRA orden de pago no le presta su fecha a ésta', () => {
  const docs = [
    { cliente_id: 'cli-messina', tipo: 'orden_pago', numero: '0000000000730', fecha: null },
    { cliente_id: 'cli-messina', tipo: 'retencion', numero: 'G00000556', fecha: '2024-12-20', opCitada: '1237', nombre_archivo: 'O_P_0000000001237_G00000556.pdf' },
  ]
  assert.equal(fecharOrdenesDePagoPorSuRetencion(docs).rellenadas, 0)
  assert.equal(docs[0].fecha, null, 'un hueco declarado es mejor que la fecha de otro pago')
})

test('la fecha que el propio papel dice no se pisa con la del certificado', () => {
  const docs = [
    { cliente_id: 'cli-messina', tipo: 'orden_pago', numero: '0000000000730', fecha: '2024-09-25' },
    { cliente_id: 'cli-messina', tipo: 'retencion', numero: 'G00000347', fecha: '2024-09-30', opCitada: '730', nombre_archivo: 'x.pdf' },
  ]
  assert.equal(fecharOrdenesDePagoPorSuRetencion(docs).rellenadas, 0)
  assert.equal(docs[0].fecha, '2024-09-25')
})

test('un adjunto ya guardado no vuelve a entrar aunque hoy se clasifique distinto', () => {
  // Los doce certificados de retención están en la tabla como `otro` y con el número de la ORDEN.
  // Con el tipo y el número nuevos no coinciden por ninguna de las otras dos claves, y su hash
  // nunca se calculó: sin esta tercera clave, cada corrida los volvería a subir.
  const { nuevos, repetidos } = deduplicar(
    [{ message_id: 'm7', nombre_archivo: 'O_P_0000000000730_G00000347.pdf', tamano_bytes: 41234, hash_sha256: hashDocumento(Buffer.from('x')), cliente_id: 'cli-messina', tipo: 'retencion', numero: 'G00000347' }],
    { yaEnBase: [{ message_id: 'm7', nombre_archivo: 'O_P_0000000000730_G00000347.pdf', tamano_bytes: 41234, hash_sha256: null, cliente_id: 'cli-messina', tipo: 'otro', numero: '0000000000730' }] },
  )
  assert.equal(nuevos.length, 0)
  assert.match(repetidos[0].porque, /mismo mensaje/)
})
