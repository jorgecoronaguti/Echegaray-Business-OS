import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aNumero, conVuelta, destinoDeVuelta, entregaParaRendir, esRutaDeRendicion, estadoVisible, fraseTePiden,
  pesos, resumenMiEfectivo, rutaDeRendicion, sufijoDeVuelta, tarjetaDeHoy, textoTengoQueRendir, textoYaTenes,
  totalDelTicket,
} from './logica.ts'
import type { EntregaSaldo, TicketRendicion } from './tipos.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN
//
//  1. Que «Tengo que rendir» sume la entrega que la persona todavía no firmó (M01 dice que recién al
//     firmar la tiene para rendir), o que esconda un saldo negativo detrás de un cero.
//  2. Que Hoy muestre dos tarjetas de efectivo, o una que dice «$ 0» todos los días.
//  3. Que a quien ya contestó un dato se le siga diciendo «te lo piden».
//  4. Que la foto se guarde fuera de `<uid>/rendicion/`: la policy la rebota con un «row-level
//     security» que no le dice nada a nadie.
//  5. Que con dos entregas abiertas el ticket se impute a una elegida a ciegas.
//  6. Que el destino de la flecha acepte cualquier cosa de la URL (redirección abierta).

const UID = '0b6f4a4e-9c7e-4d11-8a55-2a8c0d9e1f00'
const FOTO = '7d1e2c3b-4a5f-4b6c-9d8e-0f1a2b3c4d5e'

function entrega(p: Partial<EntregaSaldo> = {}): EntregaSaldo {
  return {
    id: 'e1', codigo: 'ER-0001', persona_id: 'p1', persona: 'Rubén Sosa', obra_id: 'galpon-8', obra: 'Galpón 8',
    estructura: false, fecha: '2026-09-16', entregado: 1_200_000, rendido: 840_300, filas_rendidas: 11,
    devuelto: 0, en_su_poder: 359_700, conformidad: true, estado: 'abierta', para_que: null, conformidad_en: null,
    ...p,
  }
}

function ticket(p: Partial<TicketRendicion> = {}): TicketRendicion {
  return {
    id: 't1', entrega_id: 'e1', entrega: 'ER-0001', canal: 'app', enviado_en: '2026-09-22T12:10:00Z',
    storage_path: null, nombre_archivo: null, media_type: null, motivo: null, resultado: null, monto_rendido: null,
    observacion: null, observado_en: null, respuesta: null, respondido_en: null, descartado_motivo: null,
    estado: 'leyendo', ...p,
  }
}

test('pesos: el formato del mockup, con espacio y punto de miles', () => {
  assert.equal(pesos(800000), '$ 800.000')
  assert.equal(pesos(1159700), '$ 1.159.700')
  assert.equal(pesos(96400.5), '$ 96.400,5')
})

test('aNumero lee el total del circuito en los dos formatos', () => {
  assert.equal(aNumero(96400), 96400)
  assert.equal(aNumero('96400.5'), 96400.5)
  assert.equal(aNumero('96.400,50'), 96400.5)
  assert.equal(aNumero('$ 30.000,00'), 30000)
  assert.equal(aNumero('30.000'), 30000)
  assert.equal(aNumero('1.159.700'), 1159700)
  assert.equal(aNumero(''), null)
  assert.equal(aNumero(null), null)
})

test('el total del ticket: manda la fila de Compras; si no, suma lo leído', () => {
  assert.equal(totalDelTicket(ticket({ monto_rendido: 412800, resultado: { comprobantes: [{ total: 1 }] } })), 412800)
  assert.equal(totalDelTicket(ticket({ resultado: { comprobantes: [{ total: '61.000,00' }, { total: 500 }] } })), 61500)
  assert.equal(totalDelTicket(ticket()), null)
})

test('M03: «Tengo que rendir» cuenta sólo las abiertas FIRMADAS', () => {
  const r = resumenMiEfectivo([
    entrega(),
    entrega({ id: 'e2', conformidad: false, entregado: 800000, rendido: 0, en_su_poder: 800000 }),
    entrega({ id: 'e3', estado: 'cerrada', entregado: 500000, rendido: 500000, en_su_poder: 0 }),
  ], [])
  assert.equal(r.tengoQueRendir, 359700)
  assert.equal(r.recibi, 1200000)
  assert.equal(r.rendi, 840300)
  assert.deepEqual(textoTengoQueRendir(r), { rotulo: 'Tengo que rendir', valor: '$ 359.700', detalle: null })
})

test('M03: el saldo negativo no se esconde en un cero', () => {
  const r = resumenMiEfectivo([entrega({ entregado: 100000, rendido: 130000, en_su_poder: -30000 })], [])
  const t = textoTengoQueRendir(r)
  assert.equal(t.rotulo, 'Rendiste de más')
  assert.equal(t.valor, '$ 30.000')
})

test('M03: sin entregas y en cero, cada uno con su frase', () => {
  assert.match(textoTengoQueRendir(resumenMiEfectivo([], [])).detalle ?? '', /No tenés efectivo de la empresa/)
  // Con una entrega esperando la firma NO se niega la entrega que la pantalla muestra arriba (QA 22/09/2026).
  assert.match(textoTengoQueRendir(resumenMiEfectivo([], []), 1).detalle ?? '', /Firmá la conformidad/)
  const cero = resumenMiEfectivo([entrega({ rendido: 1200000, en_su_poder: 0 })], [])
  assert.equal(textoTengoQueRendir(cero).detalle, 'Rendiste todo lo que recibiste.')
})

test('M03: lo mandado que todavía no está en Compras, con y sin total leído', () => {
  const r = resumenMiEfectivo([entrega()], [
    ticket({ id: 'a', resultado: { comprobantes: [{ total: 96400, proveedor: 'Corralón El Nogal' }] } }),
    ticket({ id: 'b' }),
    ticket({ id: 'c', estado: 'en_compras', monto_rendido: 412800 }),
    ticket({ id: 'd', estado: 'observado', observacion: 'Falta el nombre del comercio', resultado: { comprobantes: [{ total: '30.000' }] } }),
  ])
  assert.equal(r.pendienteMonto, 96400 + 30000)
  assert.equal(r.pendienteSinTotal, 1)
  assert.deepEqual(r.piden.map((t) => t.id), ['d'])
})

test('estado visible: los seis estados de la vista, y «observado» ya contestado', () => {
  assert.deepEqual(
    (['leyendo', 'en_compras', 'duplicado', 'error', 'descartado'] as const).map((e) => estadoVisible(ticket({ estado: e })).etiqueta),
    ['leyendo', 'en Compras', 'ya lo habías mandado', 'falló · se reintenta solo', 'descartado'],
  )
  const pide = estadoVisible(ticket({ estado: 'observado', observacion: 'Falta el nombre del comercio' }))
  assert.equal(pide.titulo, 'Falta el nombre del comercio')
  assert.equal(pide.pideDato, true)
  assert.equal(pide.tono, 'warn')
  const contestado = estadoVisible(ticket({ estado: 'observado', observacion: 'x', respondido_en: '2026-09-22T13:00:00Z' }))
  assert.equal(contestado.pideDato, false)
  assert.equal(contestado.etiqueta, 'contestaste · falta cargar')
  // El estado propio de la vista (22/09/2026): contestado y esperando la carga no pide nada.
  const respondido = estadoVisible(ticket({ estado: 'respondido', respondido_en: '2026-09-22T13:00:00Z' }))
  assert.equal(respondido.pideDato, false)
  assert.equal(respondido.etiqueta, 'contestaste · falta cargar')
  // Observado por la cola (sin observación de Administración): el motivo del circuito es lo que falta.
  assert.equal(estadoVisible(ticket({ estado: 'observado', motivo: 'Sin CUIT legible' })).titulo, 'Sin CUIT legible')
})

test('«Te piden un dato» arma la frase con el total y la fecha', () => {
  const t = ticket({
    estado: 'observado', observacion: 'No tiene nombre de comercio', enviado_en: '2026-09-21T12:00:00Z',
    resultado: { comprobantes: [{ total: 30000 }] },
  })
  assert.equal(fraseTePiden(t), 'El ticket de $ 30.000 del 21/09: no tiene nombre de comercio')
})

test('Hoy: la entrega sin firmar gana, con lo que ya tiene en la mano', () => {
  const nueva = entrega({ id: 'e2', conformidad: false, entregado: 800000, rendido: 0, en_su_poder: 800000, fecha: '2026-09-22' })
  const t = tarjetaDeHoy([entrega(), nueva], [])
  assert.equal(t?.tipo, 'recibir')
  if (t?.tipo !== 'recibir') return
  assert.equal(t.entrega.id, 'e2')
  assert.deepEqual(textoYaTenes(t), {
    titulo: 'Ya tenés $ 359.700 sin rendir',
    detalle: 'De la entrega del 16/09. Si firmás, vas a tener $ 1.159.700 para rendir.',
  })
})

test('Hoy: sin nada sin firmar, «Mi efectivo» sólo si hay algo que mirar', () => {
  assert.deepEqual(tarjetaDeHoy([entrega()], []), { tipo: 'mi-efectivo', tengoQueRendir: 359700, piden: 0 })
  assert.equal(tarjetaDeHoy([entrega({ en_su_poder: 0 })], []), null)
  assert.equal(tarjetaDeHoy([entrega({ estado: 'cerrada' })], []), null)
  assert.equal(tarjetaDeHoy([], []), null)
  const conPedido = tarjetaDeHoy([entrega({ en_su_poder: 0 })], [ticket({ estado: 'observado', observacion: 'x' })])
  assert.deepEqual(conPedido, { tipo: 'mi-efectivo', tengoQueRendir: 0, piden: 1 })
})

test('Hoy: la primera entrega sin firmar no dice «ya tenés» si no tiene nada', () => {
  const t = tarjetaDeHoy([entrega({ conformidad: false })], [])
  assert.equal(t?.tipo, 'recibir')
  if (t?.tipo === 'recibir') assert.equal(textoYaTenes(t), null)
})

test('la foto va a <uid>/rendicion/<uuid>.<ext>, con la extensión del tipo', () => {
  assert.equal(rutaDeRendicion({ uid: UID, id: FOTO, mediaType: 'image/heic' }), `${UID}/rendicion/${FOTO}.heic`)
  assert.equal(rutaDeRendicion({ uid: UID, id: FOTO, mediaType: 'image/jpeg' }), `${UID}/rendicion/${FOTO}.jpg`)
  assert.throws(() => rutaDeRendicion({ uid: '', id: FOTO, mediaType: 'image/jpeg' }), /tu usuario/)
  assert.throws(() => rutaDeRendicion({ uid: UID, id: '../x', mediaType: 'image/jpeg' }), /identificador/)
})

test('el servidor sólo encola rutas de SU carpeta de rendición', () => {
  assert.equal(esRutaDeRendicion(`${UID}/rendicion/${FOTO}.jpg`, UID), true)
  assert.equal(esRutaDeRendicion(`${UID}/lote/${FOTO}.jpg`, UID), false)
  assert.equal(esRutaDeRendicion(`otro/rendicion/${FOTO}.jpg`, UID), false)
  assert.equal(esRutaDeRendicion(`${UID}/rendicion/${FOTO}.jpg/x`, UID), false)
  assert.equal(esRutaDeRendicion(`${UID}/rendicion/../../x.jpg`, UID), false)
})

test('con dos entregas abiertas no se elige a ciegas', () => {
  const a = entrega()
  const b = entrega({ id: 'e2', obra_id: null, obra: null, estructura: true })
  assert.equal(entregaParaRendir([a], null)?.id, 'e1')
  assert.equal(entregaParaRendir([a, b], null), null)
  assert.equal(entregaParaRendir([a, b], 'e2')?.id, 'e2')
  assert.equal(entregaParaRendir([a, entrega({ id: 'e3', estado: 'cerrada' })], 'e3'), null)
})

test('la flecha vuelve a donde se entró, sin redirección abierta', () => {
  assert.equal(destinoDeVuelta(null, null), '/mi-informacion/efectivo')
  assert.equal(destinoDeVuelta('obra', 'galpon-8'), '/obra/efectivo?obra=galpon-8')
  assert.equal(destinoDeVuelta('obra', 'https://evil.com'), '/obra/efectivo')
  assert.equal(destinoDeVuelta('https://evil.com', null), '/mi-informacion/efectivo')
  assert.equal(conVuelta('/mi-informacion/efectivo/rendir?entrega=x', sufijoDeVuelta('obra', 'g8')),
    '/mi-informacion/efectivo/rendir?entrega=x&desde=obra&obra=g8')
  assert.equal(conVuelta('/a', sufijoDeVuelta(null, 'g8')), '/a')
})
