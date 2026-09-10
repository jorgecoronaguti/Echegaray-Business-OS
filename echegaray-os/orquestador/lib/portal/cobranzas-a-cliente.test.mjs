// Cada test de acá corresponde a una forma concreta de equivocarse que tendría consecuencia real:
// escribir en la fila equivocada del Sheet, mostrarle a un cliente la cuenta de otro, publicar un
// cobro no facturado, o dar vuelta el signo de una nota de crédito.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filaSheetDe, normalizarTexto, resolverCliente, certificacionDeConcepto, clasificar,
  estadoDePago, estadoDeCertificado, apto_para_portal, proyectar, estadoAGuardar, huellaDe,
} from './cobranzas-a-cliente.mjs'

const ARCOR = 'aaaaaaaa-0000-0000-0000-000000000001'
const MESSINA = 'bbbbbbbb-0000-0000-0000-000000000002'
const ESTRELLA = 'cccccccc-0000-0000-0000-000000000003'
const INDICE = [
  { alias: 'arcor', cliente_id: ARCOR },
  { alias: 'messina', cliente_id: MESSINA },
  { alias: 'messinas', cliente_id: MESSINA },
  { alias: 'estrella', cliente_id: ESTRELLA },
  { alias: 'alimentos sur sas', cliente_id: ESTRELLA },
]

test('la fila física es el id de la columna A más 4 — un desfase escribe sobre otro cobro', () => {
  // Verificado contra el Sheet vivo: A=1 vive en la fila 5, A=44 en la 48.
  assert.equal(filaSheetDe('1'), 5)
  assert.equal(filaSheetDe('44'), 48)
  assert.equal(filaSheetDe(90), 94)
})

test('un id que no es entero positivo NO devuelve una fila: devolver 4 escribiría en el encabezado', () => {
  for (const malo of ['', null, undefined, 'x', '0', '-3', '2,5', ' ']) {
    assert.equal(filaSheetDe(malo), null, `«${malo}» no puede producir una fila`)
  }
})

test('normalizar saca tildes y puntuación: «MESSINAS» y «Messina» son comparables', () => {
  assert.equal(normalizarTexto('Salón Comercial'), 'salon comercial')
  assert.equal(normalizarTexto('IMOTOR/San Francisco/JAVI SANCHEZ'), 'imotor san francisco javi sanchez')
})

test('el texto real del Sheet resuelve al cliente que el dueño declaró en obra_alias', () => {
  assert.equal(resolverCliente('ARCOR', INDICE).cliente_id, ARCOR)
  assert.equal(resolverCliente('MESSINAS', INDICE).cliente_id, MESSINA)
  // El texto real trae los tres nombres juntos; ambos alias apuntan al MISMO cliente, así que resuelve.
  assert.equal(resolverCliente('LA ESTRELLA /ALIMENTOS DEL SUR SAS', INDICE).cliente_id, ESTRELLA)
})

test('DOS clientes distintos en el mismo texto NO resuelven — sería mostrarle a uno la cuenta del otro', () => {
  const r = resolverCliente('ARCOR / MESSINA obra compartida', INDICE)
  assert.equal(r.cliente_id, null)
  assert.equal(r.motivo, 'ambiguo')
  assert.equal(r.candidatos.length, 2)
})

test('un texto sin ningún alias conocido queda sin cliente, no en el primero de la lista', () => {
  assert.equal(resolverCliente('MACRO CONSTRUCCIONES SRL', INDICE).cliente_id, null)
  assert.equal(resolverCliente('MACRO CONSTRUCCIONES SRL', INDICE).motivo, 'sin_alias')
  assert.equal(resolverCliente('', INDICE).motivo, 'sin_texto')
})

test('«Certificación 3/9» se lee con y sin tilde; «4/4» es válido y «5/4» no', () => {
  assert.deepEqual(certificacionDeConcepto('Salón Comercial - Certificación 3/9'), { numero: 3, de: 9 })
  assert.deepEqual(certificacionDeConcepto('Pisos - Certificacion 4/4'), { numero: 4, de: 4 })
  assert.equal(certificacionDeConcepto('Certificación 5/4'), null, 'no existe la 5 de 4')
  assert.equal(certificacionDeConcepto('Compactacion de Terrenos'), null)
})

test('una nota de crédito NUNCA es un certificado: no se le pide a un cliente que apruebe una NC', () => {
  assert.equal(clasificar({ factura: 'NC', concepto: 'Alquiler de puntales' }), 'ajuste')
  // Y ni siquiera si el concepto dijera «Certificación».
  assert.equal(clasificar({ factura: 'NC', concepto: 'Certificación 1/2' }), 'ajuste')
})

test('con comprobante emitido o certificación numerada es certificado; el anticipo es pago', () => {
  assert.equal(clasificar({ factura: 'FA', concepto: null }), 'certificado')
  assert.equal(clasificar({ factura: null, concepto: 'Salón Comercial - Certificación 1/9' }), 'certificado')
  assert.equal(clasificar({ factura: null, concepto: 'PILON - Anticipo' }), 'pago')
  assert.equal(clasificar({ factura: null, concepto: null }), 'pago')
})

const HOY = new Date('2026-08-25T12:00:00Z')

test('el estado copia la columna U del Sheet: cobrado manda, y Q pasada es vencido', () => {
  assert.equal(estadoDePago({ estado: 'Cobrado', fecha_cobro: '2026-01-01' }, HOY), 'cobrado')
  assert.equal(estadoDePago({ estado: 'Pendiente', fecha_cobro: '2026-08-24' }, HOY), 'vencido')
  assert.equal(estadoDePago({ estado: 'Pendiente', fecha_cobro: '2026-08-28' }, HOY), 'a_vencer')
  assert.equal(estadoDePago({ estado: 'Facturado', fecha_cobro: '2026-08-01' }, HOY), 'vencido')
})

test('lo que vence HOY todavía no está vencido — la hora no puede adelantar un día de mora', () => {
  assert.equal(estadoDePago({ estado: 'Pendiente', fecha_cobro: '2026-08-25' }, HOY), 'a_vencer')
  assert.equal(estadoDePago({ estado: 'Pendiente', fecha_cobro: '2026-08-25T23:00:00Z' }, HOY), 'a_vencer')
})

test('«Proyectado» es previsión del dueño: nunca vencido, aunque su fecha haya pasado', () => {
  // Contarlo como vencido inventaría una mora y le mostraría al cliente una deuda que no contrajo.
  assert.equal(estadoDePago({ estado: 'Proyectado', fecha_cobro: '2020-01-01' }, HOY), 'previsto')
  assert.equal(estadoDePago({ estado: 'Pendiente', fecha_cobro: null }, HOY), 'previsto')
})

test('el certificado impago y vencido se marca vencido; el que aún no vence sigue emitido', () => {
  assert.equal(estadoDeCertificado({ estado: 'Cobrado', fecha_cobro: '2026-02-03' }, HOY), 'cobrado')
  assert.equal(estadoDeCertificado({ estado: 'Pendiente', fecha_cobro: '2026-07-01' }, HOY), 'vencido')
  assert.equal(estadoDeCertificado({ estado: 'Pendiente', fecha_cobro: '2026-09-01' }, HOY), 'emitido')
})

test('la fila de categoría N no se ofrece al portal — falla cerrado sobre un asunto fiscal', () => {
  assert.equal(apto_para_portal({ categoria: 'N' }), false)
  assert.equal(apto_para_portal({ categoria: 'n' }), false)
  assert.equal(apto_para_portal({ categoria: 'B' }), true)
  // Sin categoría no se puede afirmar que sea N: se deja pasar y lo decide el admin al publicar.
  assert.equal(apto_para_portal({}), true)
})

test('proyectar: el signo negativo de la NC no se toca y la NC no entra a ninguna de las dos tablas', () => {
  const r = proyectar([
    { sheet_id: '58', categoria: 'B', factura: 'NC', concepto: 'Alquiler de puntales',
      obra_cliente: 'ARCOR', total_bruto: -96800, monto_neto: -80000, estado: 'Cobrado' },
  ], INDICE, HOY)
  assert.equal(r.ajustes, 1)
  assert.equal(r.certificados.length, 0)
  assert.equal(r.pagos.length, 0)
})

test('proyectar: una fila sin cliente resoluble se REPORTA, no se cuelga del primer cliente', () => {
  const r = proyectar([
    { sheet_id: '10', categoria: 'B', obra_cliente: 'MACRO CONSTRUCCIONES SRL',
      total_bruto: 500000, estado: 'Pendiente', fecha_cobro: '2026-09-01' },
  ], INDICE, HOY)
  assert.equal(r.pagos.length, 0)
  assert.equal(r.sin_cliente.length, 1)
  assert.equal(r.sin_cliente[0].motivo, 'sin_alias')
  assert.equal(r.sin_cliente[0].total, 500000)
})

test('proyectar: la fila CANCELAR y la fila sin importe no producen nada', () => {
  const r = proyectar([
    { sheet_id: '5', categoria: 'B', obra_cliente: 'ARCOR', total_bruto: 100, estado: 'CANCELAR' },
    { sheet_id: '6', categoria: 'B', obra_cliente: 'ARCOR', total_bruto: null, estado: 'Pendiente' },
  ], INDICE, HOY)
  assert.equal(r.pagos.length, 0)
  assert.equal(r.certificados.length, 0)
  assert.equal(r.sin_cliente.length, 0)
})

test('proyectar: una certificación numerada entra a las DOS tablas, con la fila física correcta', () => {
  const r = proyectar([
    { sheet_id: '80', categoria: 'B', factura: null, concepto: 'Salón Comercial - Certificación 1/9',
      obra_cliente: 'MESSINA', total_bruto: 6564250, monto_neto: 5424174,
      estado: 'Pendiente', fecha_cobro: '2026-09-01', fecha_emision: '2026-08-18',
      forma_cobro: 'Transferencia', numero_comprobante: null },
  ], INDICE, HOY)
  assert.equal(r.pagos.length, 1)
  assert.equal(r.certificados.length, 1)
  assert.equal(r.pagos[0].cobranza_fila, 84, '80 + 4 = 84')
  assert.equal(r.pagos[0].medio, 'transferencia')
  assert.equal(r.pagos[0].estado, 'a_vencer')
  assert.equal(r.certificados[0].numero, 'Certificado 1')
  assert.equal(r.certificados[0].estado, 'emitido')
  assert.equal(r.certificados[0].huella_monto, 5424174)
})

test('proyectar: el anticipo de categoría N entra al esquema pero NO apto para el portal', () => {
  const r = proyectar([
    { sheet_id: '27', categoria: 'N', factura: null, concepto: 'BASES TANQUE SO2 - Anticipo',
      obra_cliente: 'MESSINA', total_bruto: 6700000, estado: 'Cobrado', fecha_cobro: '2026-05-02',
      forma_cobro: 'Efectivo' },
  ], INDICE, HOY)
  assert.equal(r.pagos.length, 1)
  assert.equal(r.certificados.length, 0, 'un anticipo no es un documento a aprobar')
  assert.equal(r.pagos[0].apto_para_portal, false)
  assert.equal(r.pagos[0].medio, 'efectivo')
  assert.equal(r.pagos[0].estado, 'cobrado')
})

test('una forma de cobro que no es ninguno de los tres medios queda en null, no en «transferencia»', () => {
  const r = proyectar([
    { sheet_id: '9', categoria: 'B', factura: 'FA', obra_cliente: 'ARCOR', total_bruto: 1000,
      estado: 'Cobrado', fecha_cobro: '2026-05-01', forma_cobro: 'Compensación' },
  ], INDICE, HOY)
  assert.equal(r.pagos[0].medio, null)
})

test('echeq cuenta como cheque: es el mismo instrumento y salda la obligación, no la caja', () => {
  const r = proyectar([
    { sheet_id: '9', categoria: 'B', factura: 'FA', obra_cliente: 'ARCOR', total_bruto: 1000,
      estado: 'Cobrado', fecha_cobro: '2026-05-01', forma_cobro: 'Echeq' },
  ], INDICE, HOY)
  assert.equal(r.pagos[0].medio, 'cheque')
})

// ═══ EL COBRO DEL SHEET TIENE QUE LLEGAR AL CERTIFICADO (10/09/2026) ═══
//
// Medido en producción: la fila 83 de Cobranzas (FA 01-00000225 de Messina) dice `Cobrado` desde el
// 03/09 y `certificado_cliente` la tenía `emitido`, porque el `on conflict` del sync no actualizaba
// `estado`. La ficha ofrecía «Enviar recordatorio» sobre $6.060.479 ya percibidos.

test('una factura que Cobranzas tiene COBRADA nunca se queda en «emitido»', () => {
  const fila = {
    sheet_id: '83', categoria: 'B', factura: 'FA', numero_comprobante: '01-00000225',
    obra_cliente: 'MESSINA', concepto: 'Limpieza de Escombros - Embolsado',
    monto_neto: 5008660.65, total_bruto: 5961829.95, estado: 'Cobrado',
    fecha_emision: '2026-08-06', fecha_cobro: '2026-09-03',
  }
  // Se arma con la función de producción: un certificado fabricado a mano probaría otra cosa.
  const { certificados } = proyectar([fila], INDICE, new Date('2026-09-10T12:00:00Z'))
  assert.equal(certificados.length, 1)
  assert.equal(certificados[0].estado, 'cobrado')
  // Y lo que el sync escribe sobre la fila que ya existía como «emitido» es «cobrado», no «emitido».
  assert.equal(estadoAGuardar(certificados[0].estado, 'emitido'), 'cobrado')
  assert.equal(estadoAGuardar(certificados[0].estado, 'vencido'), 'cobrado')
})

test('el cobro gana incluso sobre un documento observado: si entró la plata, la discusión terminó', () => {
  assert.equal(estadoAGuardar('cobrado', 'en_disputa'), 'cobrado')
  assert.equal(estadoAGuardar('cobrado', 'observado'), 'cobrado')
})

test('la APROBACIÓN del cliente no la pisa el sync — el Sheet no la conoce', () => {
  for (const suyo of ['en_revision', 'aprobado', 'observado', 'en_disputa']) {
    assert.equal(estadoAGuardar('emitido', suyo), suyo, `${suyo} lo puso el cliente en el portal`)
    assert.equal(estadoAGuardar('vencido', suyo), suyo)
  }
})

test('los estados que declara el Sheet SÍ se refrescan entre corridas', () => {
  assert.equal(estadoAGuardar('vencido', 'emitido'), 'vencido', 'venció: el reclamo es real')
  assert.equal(estadoAGuardar('emitido', 'vencido'), 'emitido', 'le corrieron la fecha en la columna Q')
  assert.equal(estadoAGuardar('emitido', null), 'emitido', 'fila nueva: no hay nada que respetar')
})

test('la huella del bisturí lleva el monto NATIVO: la celda J del Sheet está en la moneda de la fila', () => {
  // Desde que la réplica valúa los dólares, `monto_neto` está en pesos. Si la huella viajara valuada,
  // la fila 62 de Quattropani (U$S 15.400) no coincidiría nunca con su propia celda J y el worker
  // rechazaría todo cambio sobre ella con «huella_distinta».
  const h = huellaDe({ numero_comprobante: '01-000048', monto_neto: 15_400 * 1512.262, monto_neto_origen: 15_400 })
  assert.equal(h.huella_monto, 15_400)
  // Y la fila en pesos —que no tiene origen distinto— sigue igual que siempre.
  assert.equal(huellaDe({ monto_neto: 5_424_174, monto_neto_origen: 5_424_174 }).huella_monto, 5_424_174)
  assert.equal(huellaDe({ monto_neto: 5_424_174 }).huella_monto, 5_424_174, 'sin la migración aplicada, el valuado')
})
