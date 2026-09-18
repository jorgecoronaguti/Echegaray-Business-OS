// EL NÚMERO MAL LEÍDO SE CORRIGE CONTRA ARCA — y contra nada más.
//
// Los datos de este archivo NO son inventados: son las dos filas que `public.comprobantes_arca`
// tiene de Corralón Progreso el 30/07/2026, y la lectura textual que la visión hizo de la foto que
// falló. Un test con datos de fantasía habría pasado igual con la lógica rota.

import test from 'node:test'
import assert from 'node:assert/strict'
import { conciliarConArca, aplicarArca, numeroDeArca, importesCierran, ESTADO_ARCA, VIA } from './arca.mjs'
import { normalizarLectura } from './lectura.mjs'

/** Las dos filas REALES de ARCA. Corralón factura como PEREZ GARCIA MARISOL BIBIANA. */
const ARCA = [
  {
    emisor_cuit: '23369111574', emisor_nombre: 'PEREZ GARCIA MARISOL BIBIANA',
    punto_venta: '4', numero: '3642', cae: '86316017919602', fecha_emision: '2026-07-30',
    imp_total: 62000, total_iva: 10760.33, neto_gravado: 51239.67,
  },
  {
    emisor_cuit: '23369111574', emisor_nombre: 'PEREZ GARCIA MARISOL BIBIANA',
    punto_venta: '6', numero: '3366', cae: '86316052354343', fecha_emision: '2026-07-30',
    imp_total: 31533.9, total_iva: 5355.02, neto_gravado: 26178.88,
  },
]

const leido = (over = {}) => normalizarLectura({
  emisor: 'Corralon Progreso', cuit: '23369111574', letra: 'A', numero: '0004-00036542',
  fecha: '30/07/2026', total: '62.000,00', iva_21: '10.760,33', ...over,
}).comprobante

// ── El formato, que es lo que hace que esto matchee o no matchee NUNCA ────────

test('ARCA guarda punto de venta y número SUELTOS y sin ceros: se arma la forma de Compras', () => {
  assert.equal(numeroDeArca({ punto_venta: '4', numero: '3642' }), '0004-00003642')
  assert.equal(numeroDeArca({ punto_venta: '0004', numero: '00003642' }), '0004-00003642')
  assert.equal(numeroDeArca({ punto_venta: null, numero: '12' }), '0000-00000012')
  assert.equal(numeroDeArca({ punto_venta: '4' }), null, 'sin número no hay número')
})

// ── El defecto: un dígito de más ─────────────────────────────────────────────

test('CUIT + fecha + total identifican la fila, y el número bueno es el de ARCA', () => {
  const c = leido()
  const r = conciliarConArca(c, ARCA)
  assert.equal(r.estado, ESTADO_ARCA.COINCIDE)
  assert.equal(r.via, VIA.CUIT_FECHA_TOTAL)
  assert.equal(r.numeroArca, '0004-00003642')
  assert.equal(r.numeroCorregido, true)

  const bloque = aplicarArca(c, r)
  assert.equal(c.numero, '0004-00003642', 'el comprobante queda con el número verdadero')
  assert.equal(c.numeroLeidoMal, '0004-00036542', 'y con el rastro de lo que se había leído')
  assert.equal(bloque.emisorNombre, 'PEREZ GARCIA MARISOL BIBIANA')
})

test('sin CUIT —la foto trae dos y el modelo no elige— fecha + total alcanzan para la FILA, no para el emisor', () => {
  // Hasta el 18/09 este test afirmaba además `c.cuit === '23369111574'`: «el CUIT del emisor sale del
  // padrón, no de la foto». Es cierto para la fila que se encontró, y acá se cumple porque las filas
  // de esta fixture son las dos REALES de Corralón Progreso — pero se cumplía por la fixture, no por
  // la lógica. `candidatasArca` trae las filas del día de CUALQUIER emisor y esta vía no mira el
  // CUIT: con una factura ajena del mismo día y el mismo importe, el comprobante se llevaba el CUIT
  // de otra empresa, y de ahí a la columna E (el CUIT manda sobre el nombre en `matchProveedor`).
  // Desde el 18/09 el CUIT sólo se escribe si la vía lo identificó (`emisorConfirmado`); lo que esta
  // vía sí corrige —número, total, fecha— no cambió.
  const c = leido({ cuit: null })
  const r = conciliarConArca(c, ARCA)
  assert.equal(r.via, VIA.FECHA_TOTAL)
  const bloque = aplicarArca(c, r)
  assert.equal(c.numero, '0004-00003642', 'la fila encontrada sigue corrigiendo el número')
  assert.equal(c.cuit, null, 'pero no se afirma quién la emitió: esta vía no lo miró')
  assert.equal(bloque.emisorCuit, '23369111574', 'el bloque lo muestra con su vía, para poder verlo')
})

test('el CAE manda sobre todo lo demás: identifica UNO en todo ARCA', () => {
  const c = leido({ cae: '86316052354343', total: '31.533,90', iva_21: '5.355,02', cuit: null })
  const r = conciliarConArca(c, ARCA)
  assert.equal(r.via, VIA.CAE)
  assert.equal(r.numeroArca, '0006-00003366')
})

test('un CAE que no cierra por importe NO se acepta: sería conciliar contra otra factura', () => {
  const c = leido({ cae: '86316052354343' }) // CAE del de $31.533,90 con el total del de $62.000
  const r = conciliarConArca(c, ARCA)
  assert.notEqual(r.via, VIA.CAE)
})

// ── La contención ────────────────────────────────────────────────────────────

test('DOS filas candidatas no son una coincidencia: no se corrige nada', () => {
  const gemelas = [ARCA[0], { ...ARCA[0], punto_venta: '9', numero: '1', cae: '86316017919999' }]
  const c = leido()
  assert.equal(conciliarConArca(c, gemelas).estado, ESTADO_ARCA.SIN_REGISTRO)
  assert.equal(c.numero, '0004-00036542', 'el número queda como se leyó')
})

test('no estar en ARCA es INFORMACIÓN, no un error, y no toca el comprobante', () => {
  const c = leido({ fecha: '15/03/2026' })
  const r = conciliarConArca(c, ARCA)
  assert.equal(r.estado, ESTADO_ARCA.SIN_REGISTRO)
  const bloque = aplicarArca(c, r)
  assert.equal(bloque.estado, ESTADO_ARCA.SIN_REGISTRO)
  assert.equal(c.numero, '0004-00036542')
})

test('sin padrón que consultar no se afirma nada', () => {
  assert.equal(conciliarConArca(leido(), []).estado, ESTADO_ARCA.SIN_REGISTRO)
})

test('sin neto leído no se puede afirmar que algo no cierre: no se toca ningún importe', () => {
  const c = leido({ total: '62.000,00' }) // sin neto_gravado: la verificación no puede pronunciarse
  assert.equal(importesCierran(c), null)
  aplicarArca(c, conciliarConArca(c, ARCA))
  assert.equal(c.total, 62000)
  assert.equal(c.iva, 10760.33)
})

test('una NOTA DE CRÉDITO concilia igual: ARCA la guarda positiva y el OS la lleva en negativo', () => {
  const c = normalizarLectura({
    emisor: 'Corralon Progreso', cuit: '23369111574', letra: 'A', es_nota_credito: true,
    numero: '0004-00099999', fecha: '30/07/2026', total: '62.000,00', iva_21: '10.760,33',
  }).comprobante
  assert.equal(c.total, -62000)
  const r = conciliarConArca(c, ARCA)
  assert.equal(r.numeroArca, '0004-00003642')
})

// ── El separador de miles que se come la visión ──────────────────────────────

test('un IVA leído como $10,76 en vez de $10.760,33 se corrige con el libro fiscal', () => {
  // Es textual: la visión leyó "10,76" de la foto real. Sin esto, la columna M de Compras habría
  // quedado $10.750 arriba, y M es lo que suma el gasto de la obra.
  const c = leido({ iva_21: '10,76', neto_gravado: '51,24' })
  assert.equal(importesCierran(c), false, 'el síntoma se ve sin ningún modelo: no cierra')
  const bloque = aplicarArca(c, conciliarConArca(c, ARCA))
  assert.equal(c.iva, 10760.33)
  assert.equal(c.neto, 51239.67)
  assert.equal(c.total, 62000)
  assert.equal(bloque.importesCorregidos.iva, 10.76, 'y queda dicho qué se había leído')
})

test('si los importes CIERRAN, ARCA no los toca: manda el papel que el dueño está mirando', () => {
  const c = leido({ neto_gravado: '51.239,67' })
  assert.equal(importesCierran(c), true)
  const bloque = aplicarArca(c, conciliarConArca(c, ARCA))
  assert.equal(bloque.importesCorregidos, undefined)
  assert.equal(c.iva, 10760.33)
})

test('sin fila de ARCA, un importe que no cierra NO se arregla solo: se muestra como está', () => {
  const c = leido({ iva_21: '10,76', neto_gravado: '51,24', fecha: '15/03/2026' })
  aplicarArca(c, conciliarConArca(c, ARCA))
  assert.equal(c.iva, 10.76, 'inventar el importe que "debería" ser es peor que mostrar el mal leído')
})

test('el signo de una nota de crédito sobrevive a la corrección de importes', () => {
  const c = normalizarLectura({
    emisor: 'Corralon Progreso', cuit: '23369111574', letra: 'A', es_nota_credito: true,
    numero: '0004-00003642', fecha: '30/07/2026', total: '62.000,00', iva_21: '10,76', neto_gravado: '51,24',
  }).comprobante
  aplicarArca(c, conciliarConArca(c, ARCA))
  assert.equal(c.total, -62000)
  assert.equal(c.iva, -10760.33)
})

// ════════════════════════════════════════════════════════════════════════════
// «COINCIDE» NO ES «SÉ QUIÉN LA EMITIÓ» (18/09/2026) — ver `emisorConfirmado`
// ════════════════════════════════════════════════════════════════════════════
import { emisorConfirmado, VIAS_CON_EMISOR } from './arca.mjs'

const bloque = (via, emisorCuit = '30691853825') => ({ estado: 'coincide', via, emisorCuit })

test('EL DEFECTO: una coincidencia por fecha+total puede ser la factura de OTRO emisor — no confirma el CUIT', () => {
  // `candidatasArca` trae todas las filas del libro de esa fecha, de cualquier emisor, y `resolver`
  // nunca compara el emisor contra el proveedor leído. Con el CUIT ilegible en la foto y una única
  // fila de otro emisor con la misma fecha y el mismo total, `emisorCuit` es ajeno.
  assert.equal(emisorConfirmado(bloque(VIA.FECHA_TOTAL)), null)
})

test('las vías que SÍ identifican al emisor son las que usaron el CUIT o el CAE para encontrar la fila', () => {
  assert.deepEqual([...VIAS_CON_EMISOR], [VIA.CAE, VIA.CUIT_FECHA_TOTAL, VIA.CUIT_NUMERO])
  for (const via of VIAS_CON_EMISOR) assert.equal(emisorConfirmado(bloque(via)), '30691853825', via)
})

test('sin coincidencia, sin vía o con un CUIT que no son once dígitos no se confirma nada', () => {
  assert.equal(emisorConfirmado({ estado: 'sin_registro', via: VIA.CAE, emisorCuit: '30691853825' }), null)
  assert.equal(emisorConfirmado({ estado: 'no_verificado' }), null)
  assert.equal(emisorConfirmado(bloque(VIA.CAE, '3069185')), null)
  assert.equal(emisorConfirmado(bloque(VIA.CAE, null)), null)
  assert.equal(emisorConfirmado(bloque(undefined)), null)
  assert.equal(emisorConfirmado({}), null)
  assert.equal(emisorConfirmado(), null)
})

test('el CUIT se normaliza a dígitos: el libro puede traerlo con guiones', () => {
  assert.equal(emisorConfirmado(bloque(VIA.CUIT_NUMERO, '30-69185382-5')), '30691853825')
})

test('la vía débil sigue sirviendo para lo que describe el comprobante — sólo no para la identidad', () => {
  // El bloque entero no cambia: `conciliarConArca` sigue devolviendo `coincide` por fecha+total y el
  // número/total/fecha se siguen corrigiendo con él. Lo único que no se deriva de ahí es QUIÉN emitió.
  const conciliacion = conciliarConArca(
    { fecha: '16/09/2026', total: 580000 },
    [{ emisor_cuit: '30111111117', emisor_nombre: 'OTRO SA', punto_venta: '2', numero: '4213', fecha_emision: '2026-09-16', imp_total: 580000 }],
  )
  assert.equal(conciliacion.estado, 'coincide')
  assert.equal(conciliacion.via, VIA.FECHA_TOTAL)
  assert.equal(conciliacion.numeroArca, '0002-00004213')
  assert.equal(emisorConfirmado({ estado: conciliacion.estado, via: conciliacion.via, emisorCuit: conciliacion.emisorCuit }), null,
    'el CUIT de OTRO SA no puede terminar en la ficha del proveedor que se está cargando')
})

// ════════════════════════════════════════════════════════════════════════════
// Y EL CUIT TAMPOCO SE ESCRIBE EN EL COMPROBANTE SI LA VÍA NO SUPO QUIÉN ES
// ════════════════════════════════════════════════════════════════════════════
import { matchProveedor } from '../carga-comprobantes.mjs'

/** Una factura de OTRA empresa, el mismo día y por el mismo importe que la que se está cargando. */
const AJENA = Object.freeze({
  emisor_cuit: '30111111117', emisor_nombre: 'OTRA SA', punto_venta: '2', numero: '4213',
  fecha_emision: '2026-09-16', imp_total: 580000, total_iva: 100661.16, neto_gravado: 479338.84, cae: null,
})

test('EL DEFECTO: un papel sin CUIT conciliado por fecha+total se llevaba el CUIT del OTRO emisor', () => {
  // El caso: la foto de Neumagom no dejó leer el CUIT. `candidatasArca` trae las filas del libro de
  // ese día de cualquier emisor y sólo hay una que cierra por importe: la de OTRA SA.
  const c = { proveedor: 'NEUMAGOM SAS', fecha: '16/09/2026', total: 580000, iva: 100661.16, neto: 479338.84 }
  const conciliacion = conciliarConArca(c, [AJENA])
  assert.equal(conciliacion.estado, ESTADO_ARCA.COINCIDE)
  assert.equal(conciliacion.via, VIA.FECHA_TOTAL)
  aplicarArca(c, conciliacion)
  assert.equal(c.cuit, undefined, 'el CUIT de OTRA SA no puede quedar pegado al comprobante')
})

test('…y ese CUIT decidía el PROVEEDOR: `matchProveedor` lo hace mandar sobre el nombre', () => {
  // Es lo que hacía caro al defecto: no quedaba en un campo interno, terminaba en la columna E.
  const lista = ['NEUMAGOM SAS', 'OTRA SA']
  const porCuit = { 30111111117: 'OTRA SA', 30691853825: 'NEUMAGOM SAS' }
  // Con el CUIT ajeno pegado (el comportamiento viejo), la E resolvía al proveedor equivocado:
  assert.equal(matchProveedor('NEUMAGOM SAS', lista, { cuit: '30111111117', porCuit }).valor, 'OTRA SA')
  // Sin CUIT —lo que queda ahora— la identidad la resuelve el nombre, como antes de que ARCA opinara:
  const c = { proveedor: 'NEUMAGOM SAS', fecha: '16/09/2026', total: 580000, iva: 100661.16, neto: 479338.84 }
  aplicarArca(c, conciliarConArca(c, [AJENA]))
  assert.equal(matchProveedor(c.proveedor, lista, { cuit: c.cuit, porCuit }).valor, 'NEUMAGOM SAS')
})

test('lo que la vía débil SÍ corrige no cambia: número, total y fecha siguen saliendo del libro', () => {
  const c = { proveedor: 'NEUMAGOM SAS', fecha: '16/09/2026', numero: null, total: 580000, iva: 100661.16, neto: 479338.84 }
  const bloque = aplicarArca(c, conciliarConArca(c, [AJENA]))
  assert.equal(c.numero, '0002-00004213', 'el número del libro describe la FILA, no al emisor')
  assert.equal(c.fechaVerificadaArca, true)
  assert.equal(bloque.estado, ESTADO_ARCA.COINCIDE)
  assert.equal(bloque.emisorCuit, '30111111117', 'el bloque lo sigue mostrando con su vía: es informativo')
})

test('con el CUIT en el papel la vía es fuerte y el padrón sí manda, como siempre', () => {
  const propia = { ...AJENA, emisor_cuit: '30691853825', emisor_nombre: 'NEUMAGOM SAS' }
  const c = { proveedor: 'Neumagom', cuit: '30691853825', fecha: '16/09/2026', total: 580000, iva: 100661.16, neto: 479338.84 }
  const conciliacion = conciliarConArca(c, [propia])
  assert.equal(conciliacion.via, VIA.CUIT_FECHA_TOTAL)
  aplicarArca(c, conciliacion)
  assert.equal(c.cuit, '30691853825')
})
