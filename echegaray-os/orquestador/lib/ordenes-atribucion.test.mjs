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
  deduplicar, documentoDeAdjunto, hashDocumento,
} from './ordenes-atribucion.mjs'
import { clasificarAdjunto, dominioDe, numeroDeRetencion } from './ordenes-cliente.mjs'

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
