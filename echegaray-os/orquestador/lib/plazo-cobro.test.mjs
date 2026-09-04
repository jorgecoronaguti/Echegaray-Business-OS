// LO QUE ESTOS TESTS ATRAPAN: que un plazo SUPUESTO se pueda hacer pasar por PACTADO.
//
// Cada caso sale del archivo vivo del 04/09/2026, no de un ejemplo inventado. Los textos de las
// celdas y los textos de los PDF están copiados literales: si el extractor deja de reconocer la
// forma real, el test cae.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  numeroDeOrdenDeCompra, claveDeBusquedaDrive, plazoTipeadoEnCelda, condicionDeOrdenDeCompra,
  resolverPlazoDeCobro, fechaDeCobroProyectada, ORIGEN, CERTEZA, PLAZO_SUPUESTO_DIAS,
} from './plazo-cobro.mjs'
import { PLAZO_COBRO_DIAS, repartirPorAntiguedad } from './cobranzas-vencido.mjs'

// El PDF de la OC 00002-00002266, tal cual lo devuelve readPdfText (fragmento verificado).
const OC_2266 = `Proveedor : 2113 ECHEGARAY CONSTRUCCIONES S.A.S VIGENCIA DE LA O/C:
Cond.Compra : 6 CUENTA CORRIENTE 30 DIAS COMPRADOR: VILLANUEVA ISABEL
Observaciones: PLAYON DIL ACIDO DEPOSITO DESTINO: G3 FABRICA`

test('EL DEFECTO: la celda dice "cta. cte. 15 días" y la OC dice 30 — gana la OC y la contradicción se publica', () => {
  const ocLeidas = new Map([['00002-00002266', { dias: 30, descripcion: 'CUENTA CORRIENTE 30 DIAS', tipo: 'cuenta_corriente', drive_file_id: '1Vox' }]])
  const r = resolverPlazoDeCobro({ textoOrdenCompra: '00002-00002266 · cta. cte. 15 días', cliente: 'MESSINA', ocLeidas })
  assert.equal(r.dias, 30)
  assert.equal(r.origen, ORIGEN.ORDEN_DE_COMPRA)
  assert.equal(r.certeza, CERTEZA.PACTADO)
  assert.deepEqual(r.discrepancia, { tipeado_en_celda: 15, pactado_en_oc: 30, dias_de_diferencia: 15 })
  // Y la fecha proyectada se corre 15 días sobre la que hoy publica Q100 (=P100+15).
  assert.equal(fechaDeCobroProyectada(46300, r.dias) - fechaDeCobroProyectada(46300, 15), 15)
})

test('un plazo supuesto NUNCA se ve igual que uno pactado: origen y certeza viajan siempre', () => {
  const sinNada = resolverPlazoDeCobro({ textoOrdenCompra: 'Anticipo 50% inicio obra ', cliente: 'Quattropani - Melisa García SAS' })
  assert.equal(sinNada.dias, PLAZO_SUPUESTO_DIAS)
  assert.equal(sinNada.origen, ORIGEN.SUPUESTO_GLOBAL)
  assert.equal(sinNada.certeza, CERTEZA.SUPUESTO)
  assert.match(sinNada.evidencia, /no declara orden de compra/)
})

test('la constante es UNA: plazo-cobro no redefine el 30 de cobranzas-vencido', () => {
  assert.equal(PLAZO_SUPUESTO_DIAS, PLAZO_COBRO_DIAS)
  // Comparar los valores no alcanza: dos `30` escritos en dos archivos son iguales hasta el día que
  // uno cambia. Lo que hay que probar es que hay UNA definición, y eso se ve en el import.
  const fuente = readFileSync(new URL('./plazo-cobro.mjs', import.meta.url), 'utf8')
  assert.match(fuente, /import \{ PLAZO_COBRO_DIAS \} from '\.\/cobranzas-vencido\.mjs'/)
  assert.match(fuente, /export const PLAZO_SUPUESTO_DIAS = PLAZO_COBRO_DIAS\b/)
})

test('la OC leída cuya condición NO se mide en días corta la cascada en FALTA_DATO y no cae al supuesto', () => {
  const ocLeidas = new Map([['00002-00002173', { dias: null, descripcion: '50% ANTICIPADO - 50% CONTRA ENTREGA', tipo: 'hitos' }]])
  // Hay condición cargada para el cliente Y existe la constante: ninguna de las dos debe ganarle al documento.
  const condicionesCliente = new Map([['MESSINA', { dias: 30, fuente: 'acordado por teléfono' }]])
  const r = resolverPlazoDeCobro({
    textoOrdenCompra: 'Resto 50% s/ total 65.000.000 — certificación quincenal 1/2 · OC 00002-00002173',
    cliente: 'MESSINA', ocLeidas, condicionesCliente,
  })
  assert.equal(r.dias, null)
  assert.equal(r.certeza, CERTEZA.FALTA_DATO)
  assert.match(r.evidencia, /50% ANTICIPADO - 50% CONTRA ENTREGA/)
})

test('la cascada respeta la precedencia OC > condición del cliente > constante', () => {
  const ocLeidas = new Map([['00002-00000279', { dias: 15, descripcion: 'CUENTA CORRIENTE 15 DIAS', tipo: 'cuenta_corriente' }]])
  const condicionesCliente = new Map([['MESSINA', { dias: 45, fuente: 'acuerdo comercial 2026' }]])
  assert.equal(resolverPlazoDeCobro({ textoOrdenCompra: '00002-00000279', cliente: 'MESSINA', ocLeidas, condicionesCliente }).dias, 15)
  // Misma fila sin la OC archivada: baja un escalón, no dos.
  const b = resolverPlazoDeCobro({ textoOrdenCompra: '00002-00000279', cliente: 'MESSINA', condicionesCliente })
  assert.equal(b.dias, 45)
  assert.equal(b.origen, ORIGEN.CONDICION_CLIENTE)
  // Y sin ninguna de las dos, el último recurso queda MARCADO.
  const c = resolverPlazoDeCobro({ textoOrdenCompra: '00002-00000279', cliente: 'MESSINA' })
  assert.equal(c.origen, ORIGEN.SUPUESTO_GLOBAL)
  assert.match(c.evidencia, /sin la OC 00002-00000279 archivada/)
})

test('un mismo cliente con dos OC de plazos distintos NO puede resolverse con una constante', () => {
  const ocLeidas = new Map([
    ['00002-00000279', { dias: 15, descripcion: 'CUENTA CORRIENTE 15 DIAS', tipo: 'cuenta_corriente' }],
    ['00002-00002266', { dias: 30, descripcion: 'CUENTA CORRIENTE 30 DIAS', tipo: 'cuenta_corriente' }],
  ])
  const a = resolverPlazoDeCobro({ textoOrdenCompra: '00002-00000279', cliente: 'MESSINA', ocLeidas })
  const b = resolverPlazoDeCobro({ textoOrdenCompra: '00002-00002266', cliente: 'MESSINA', ocLeidas })
  assert.notEqual(a.dias, b.dias)
})

test('EL EXTRACTOR NO CONFUNDE UN IMPORTE CON UN NÚMERO DE ORDEN — los textos reales de la columna H', () => {
  // Declaran OC (las tres formas que usa el archivo).
  assert.equal(numeroDeOrdenDeCompra('00002-00002266 · cta. cte. 15 días'), '00002-00002266')
  assert.equal(numeroDeOrdenDeCompra('02-00002097'), '00002-00002097')   // se normaliza al mismo número
  assert.equal(numeroDeOrdenDeCompra('53312775 6A'), '53312775')
  assert.equal(numeroDeOrdenDeCompra('OC 53239034 - FIN'), '53239034')
  assert.equal(numeroDeOrdenDeCompra('Resto 50% s/ total 65.000.000 — certificación quincenal 1/2 · OC 00002-00002173'), '00002-00002173')
  // NO declaran ninguna: son importes de contrato, y leerlos como OC daría un plazo creíble y falso.
  for (const t of [
    'Anticipo inicio obra Pisos Industriales - Total Obra: $47.590.272',
    'Anticipo inicio obra 50% $ 47.590.272 — 1ª de 2 cuotas quincenales',
    'Venta propia s/ total 9.273.576,40 — saldo de mampostería y cierre pádel (precio 14.273.576,40; 5.000.000 cobrados el 17/07 en la fila 50)',
    'Resto 50% s/ contrato U$S 63.000 + IVA — certificación quincenal 1/9',
    'Saldo 50% de todas las obras — cuota quincenal 1 de 4', 'RECLAMAR OC!', 'Certificado 2', '',
  ]) assert.equal(numeroDeOrdenDeCompra(t), null, `no debería leer una OC en: ${t}`)
})

test('la clave de búsqueda en Drive es la que nombra al archivo real', () => {
  assert.equal(claveDeBusquedaDrive('00002-00002266'), '0000200002266')  // OC_32_0000200002266.pdf
  assert.equal(claveDeBusquedaDrive('53312775'), '53312775')
})

test('el campo Cond.Compra se lee del texto real del PDF, con su código', () => {
  const c = condicionDeOrdenDeCompra(OC_2266)
  assert.deepEqual(c, { codigo: '6', descripcion: 'CUENTA CORRIENTE 30 DIAS', tipo: 'cuenta_corriente', dias: 30, instrumento: null })
})

test('cada condición observada se clasifica, y la que no se reconoce NO inventa días', () => {
  const con = (d) => condicionDeOrdenDeCompra(`Cond.Compra : ${d} COMPRADOR: VILLANUEVA ISABEL`)
  assert.equal(con('3 CUENTA CORRIENTE 15 DIAS').dias, 15)
  assert.equal(con('18 CHEQUE A 30 DIAS').instrumento, 'cheque')
  assert.equal(con('18 CHEQUE A 30 DIAS').dias, 30)
  assert.equal(con('21 50% ANTICIPADO - 50% CONTRA ENTREGA').dias, null)
  assert.equal(con('21 50% ANTICIPADO - 50% CONTRA ENTREGA').tipo, 'hitos')
  // Un hito con un número adentro sigue siendo un hito: el número no lo convierte en cuenta corriente.
  assert.equal(con('99 50% ANTICIPADO - SALDO CONTRA ENTREGA A 30 DIAS').dias, null)
  const raro = con('47 PAGO SEGUN CONVENIO PARTICULAR')
  assert.equal(raro.dias, null)
  assert.equal(raro.tipo, 'no_reconocida')
  assert.equal(condicionDeOrdenDeCompra('un PDF que no declara la condición'), null)
})

test('el plazo tipeado a mano se lee para CONTRASTAR, y por sí solo nunca resuelve nada', () => {
  assert.equal(plazoTipeadoEnCelda('00002-00002266 · cta. cte. 15 días'), 15)
  assert.equal(plazoTipeadoEnCelda('00002-00002266'), null)
  // Sin OC leída, el texto tipeado NO se usa como fuente: la fila queda en supuesto declarado.
  const r = resolverPlazoDeCobro({ textoOrdenCompra: '00002-00009999 · cta. cte. 15 días', cliente: 'MESSINA' })
  assert.equal(r.dias, PLAZO_SUPUESTO_DIAS)
  assert.equal(r.certeza, CERTEZA.SUPUESTO)
})

test('sin fecha de factura o sin plazo no se proyecta ninguna fecha: una proyección desde 1899 se suma a la caja de esta semana', () => {
  assert.equal(fechaDeCobroProyectada(0, 30), null)
  assert.equal(fechaDeCobroProyectada(46300, null), null)
  assert.equal(fechaDeCobroProyectada(46300, 30), 46330)
})

test('el aging usa el plazo DE CADA FILA, y una fila sin plazo en días sale aparte en vez de repartirse', () => {
  const hoy = 46330
  const filas = [
    { emision: 46300, importe: 1000, plazo: 15 },   // 30 días de antigüedad, plazo 15 → 15 de atraso
    { emision: 46300, importe: 2000, plazo: 75 },   // mismo día, ARCOR a 75 → todavía no vence
    { emision: 46300, importe: 4000, plazo: null }, // "50% contra entrega": no se mide en días
    { emision: 46300, importe: 8000 },              // no opina → toma el supuesto (30) → no vence
  ]
  const r = repartirPorAntiguedad(filas, hoy)
  assert.equal(r.tramos['1–30'], 1000)
  assert.equal(r.porVencer, 10000)
  assert.equal(r.sinPlazo, 4000)
  assert.equal(r.total, 15000)
  // Con el plazo único de antes, las dos primeras caían igual y el vencido era otro número.
  const conConstante = repartirPorAntiguedad(filas.map((f) => ({ emision: f.emision, importe: f.importe })), hoy)
  assert.equal(conConstante.vencido, 0)
  assert.notEqual(conConstante.vencido, r.vencido)
})

test('EL DATASET DE OC ES EL QUE SE LEYÓ DE DRIVE, Y NINGUNA FILA SIN DÍAS TRAE UN NÚMERO INVENTADO', () => {
  const doc = JSON.parse(readFileSync(new URL('../datos/plazos-cobro-oc.json', import.meta.url), 'utf8'))
  assert.ok(doc.ordenes.length >= 20, 'el archivo debe cubrir las OC que declara Cobranzas')
  for (const o of doc.ordenes) {
    if (o.estado === 'leida') {
      assert.ok(Number.isFinite(o.dias), `${o.orden_compra} dice "leida" y no trae días`)
      assert.ok(o.descripcion && o.drive_file_id, `${o.orden_compra} no trae su evidencia`)
    } else {
      assert.equal(o.dias, null, `${o.orden_compra} no se leyó y sin embargo trae días`)
    }
  }
  // La que motivó todo esto, con su valor verificado contra el PDF.
  assert.equal(doc.ordenes.find((o) => o.orden_compra === '00002-00002266').dias, 30)
})
