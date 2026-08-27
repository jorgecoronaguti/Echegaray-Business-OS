// LO QUE TIENE QUE ROMPERSE SI ALGUIEN AFLOJA LA LECTURA DE UN COMPROBANTE.
//
// Los casos no son inventados: salen de comprobantes reales de esta empresa y de los dos errores que
// ya costaron plata — la percepción que no entraba en el Total ($ mal cargados en cascada) y la nota
// de crédito contada como compra ($41,9M y $7,2M de IVA sin declarar).

import test from 'node:test'
import assert from 'node:assert/strict'
import { matchProveedor } from '../carga-comprobantes.mjs'
import {
  normalizarLectura, numeroCanonico, claveComprobante, obraDeAnotacion,
  fechaDeLectura, tipoDesdeLectura, FALTA,
} from './lectura.mjs'
import { bloqueAdjunto, leerAdjunto } from './vision.mjs'
import { valoresInput, COL } from '../carga-comprobantes.mjs'

// ── Un comprobante REAL: factura A con percepción ────────────────────────────
//
// Combustibles Barcelo, factura A 0113-00010489. El "neto gravado" impreso NO incluye la percepción
// de IIBB ni el impuesto interno del combustible: si M se cargara con ese neto, O = M+N quedaría
// corto y el total del Sheet no cerraría con la plata que salió.
const BARCELO = {
  emisor: 'COMBUSTIBLES BARCELO S.A.',
  cuit: '30-71234567-1',
  letra: 'A',
  es_nota_credito: false,
  numero: '0113-00010489',
  fecha: '05/01/2026',
  neto_gravado: '28.479,30',
  iva_21: '5.981,00',
  iva_105: '0',
  otros_tributos: '2.000,00',
  total: '36.460,30',
  condicion_venta: 'Contado',
  forma_pago: 'Efectivo',
  concepto: 'Gasoil autoelevador',
  anotacion_manuscrita: 'Estrella',
  legible: true,
  dudas: [],
}

test('parseo de un comprobante real: importes es-AR, tipo, fecha y condición', () => {
  const { comprobante: c, faltantes } = normalizarLectura(BARCELO)
  assert.deepEqual(faltantes, [])
  assert.equal(c.proveedor, 'COMBUSTIBLES BARCELO S.A.')
  // El dígito verificador cierra: desde el 26/08/2026 un CUIT que no pasa el módulo-11 se descarta
  // —entra en la clave de idempotencia, y un dígito mal leído por OCR duplica el gasto—. Este
  // fixture tenía un CUIT inventado que no cerraba, así que probaba el camino que ya no existe.
  assert.equal(c.cuit, '30712345671', 'el CUIT se guarda sin guiones')
  assert.equal(c.tipo, 'A')
  assert.equal(c.numero, '0113-00010489')
  assert.equal(c.fecha, '05/01/2026')
  // es-AR: punto = miles, coma = decimal. Leerlo al revés mete un gasto 100× o 1/100.
  assert.equal(c.total, 36460.30)
  assert.equal(c.iva, 5981)
  assert.equal(c.neto, 28479.30)
  assert.equal(c.otrosTributos, 2000)
  assert.equal(c.condicion, 'Contado')
  assert.equal(c.formaPago, 'Efectivo')
})

test('M = Total − IVA: la percepción queda ADENTRO del importe, no afuera', () => {
  const { comprobante: c } = normalizarLectura(BARCELO)
  const v = valoresInput({ ...c, proveedor: 'Combustibles Barcelo' })
  // 36.460,30 − 5.981,00 = 30.479,30 — que es el neto impreso (28.479,30) MÁS la percepción (2.000).
  assert.equal(v[COL.neto], 30479.30)
  assert.equal(v[COL.iva], 5981)
  // Y el total del Sheet (O = M+N, fórmula) reconstruye el total del papel.
  assert.equal(Math.round((v[COL.neto] + v[COL.iva]) * 100) / 100, 36460.30)
})

test('el IVA de dos alícuotas se suma para la columna N, y se conserva el detalle', () => {
  const { comprobante: c } = normalizarLectura({
    ...BARCELO, iva_21: '1.000,00', iva_105: '500,50', total: '10.000,00',
  })
  assert.equal(c.iva, 1500.50)
  assert.deepEqual(c.detalle, { iva21: 1000, iva105: 500.50 })
})

test('factura B sin IVA discriminado: N queda vacía y M es el total entero', () => {
  const { comprobante: c } = normalizarLectura({
    ...BARCELO, letra: 'B', iva_21: '0', iva_105: '0', neto_gravado: null, total: '12.100,00',
  })
  assert.equal(c.iva, null, 'no se inventa un IVA que la factura no discrimina')
  const v = valoresInput({ ...c, proveedor: 'X' })
  assert.equal(v[COL.neto], 12100)
  assert.equal(v[COL.iva], undefined)
})

// ── EL SIGNO DE LA NOTA DE CRÉDITO ───────────────────────────────────────────

test('una NOTA DE CRÉDITO entra en NEGATIVO — total, IVA e importe', () => {
  const { comprobante: c } = normalizarLectura({
    ...BARCELO, letra: 'A', es_nota_credito: true, numero: '0017-00006948',
    neto_gravado: '8.118.328,10', iva_21: '1.704.849,90', otros_tributos: '0', total: '9.823.178,00',
  })
  assert.equal(c.esNotaCredito, true)
  assert.equal(c.tipo, 'NC', 'cualquier letra de nota de crédito va al único "N C" del desplegable')
  assert.equal(c.total, -9823178)
  assert.equal(c.iva, -1704849.90)

  const v = valoresInput({ ...c, proveedor: 'ACEROLATINA' })
  assert.equal(v[COL.tipo], 'N C')
  assert.ok(v[COL.neto] < 0, 'el importe de una nota de crédito NO puede ser positivo')
  assert.equal(v[COL.neto], -8118328.10)
  assert.equal(v[COL.iva], -1704849.90)
})

test('el modelo devuelve los importes positivos (así están impresos): el signo lo pone el OS', () => {
  // Es exactamente el contrato del prompt. Si alguien "mejora" el prompt para que devuelva
  // negativos, este test sigue pasando; lo que no puede pasar es que el resultado sea positivo.
  const { comprobante: c } = normalizarLectura({ ...BARCELO, es_nota_credito: true })
  assert.ok(c.total < 0)
  const { comprobante: d } = normalizarLectura({ ...BARCELO, es_nota_credito: true, total: '-36.460,30' })
  assert.equal(d.total, -36460.30, 'si ya venía negativo tampoco se da vuelta dos veces')
})

// ── Idempotencia: la clave ───────────────────────────────────────────────────

test('el número de comprobante se canoniza: la misma factura leída de tres formas da una clave', () => {
  assert.equal(numeroCanonico('0113-00010489'), '0113-00010489')
  assert.equal(numeroCanonico('113-10489'), '0113-00010489')
  assert.equal(numeroCanonico('0113 00010489'), '0113-00010489')
  assert.equal(numeroCanonico('011300010489'), '0113-00010489')
  assert.equal(numeroCanonico(''), null)
})

test('la clave es (CUIT, tipo, número) y no depende de cómo se escribió el CUIT', () => {
  const a = claveComprobante({ cuit: '30-71234567-8', tipo: 'A', numero: '0113-00010489' })
  const b = claveComprobante({ cuit: '30712345678', tipo: 'A', numero: '113-10489' })
  assert.equal(a.clave, b.clave)
  assert.equal(a.fuerte, true)
})

test('una factura y su nota de crédito NO comparten clave aunque tengan el mismo número', () => {
  const f = claveComprobante({ cuit: '30712345678', tipo: 'A', numero: '0001-00000042' })
  const nc = claveComprobante({ cuit: '30712345678', tipo: 'NC', numero: '0001-00000042' })
  assert.notEqual(f.clave, nc.clave)
})

test('sin CUIT la clave se DEGRADA al proveedor y lo declara — nunca queda en null silencioso', () => {
  const k = claveComprobante({ tipo: 'B', numero: '0001-00000007', proveedor: 'Ferretería  El  Tornillo' })
  assert.equal(k.fuerte, false)
  assert.ok(k.clave.startsWith('p:'))
  const k2 = claveComprobante({ tipo: 'B', numero: '1-7', proveedor: 'ferreteria el tornillo' })
  assert.equal(k.clave, k2.clave, 'normaliza acentos, mayúsculas y espacios')
})

test('sin número no hay clave: un comprobante así NO se puede deduplicar y hay que decirlo', () => {
  assert.equal(claveComprobante({ cuit: '30712345678', tipo: 'A' }), null)
  assert.equal(claveComprobante({ tipo: 'A', numero: '0001-1' }), null, 'sin CUIT ni proveedor tampoco')
})

// ── La obra: se lee de la anotación o no se pone ─────────────────────────────

const OBRAS = ['Estrella', 'San Francisco', 'Messina', 'LE-2025-01']

test('la obra sale de la anotación manuscrita, matcheada contra el desplegable estricto', () => {
  assert.equal(obraDeAnotacion('Estrella', OBRAS).valor, 'Estrella')
  assert.equal(obraDeAnotacion('estrella', OBRAS).valor, 'Estrella', 'sin importar mayúsculas')
  assert.equal(obraDeAnotacion('obra Messina 2do piso', OBRAS).valor, 'Messina')
})

test('sin anotación NO se infiere una obra: se deja vacía para que la complete el dueño', () => {
  assert.equal(obraDeAnotacion(null, OBRAS), null)
  assert.equal(obraDeAnotacion('   ', OBRAS), null)
  assert.equal(obraDeAnotacion('pagado', OBRAS), null)
})

test('una anotación que matchea DOS obras no elige ninguna', () => {
  const dos = ['San Francisco', 'San Juan']
  assert.equal(obraDeAnotacion('San', dos), null, 'ambiguo no es lo mismo que resuelto')
  // Pero una coincidencia EXACTA sí resuelve, aunque haya otra obra que la contenga: escrito tal
  // cual el rótulo, no hay nada que adivinar.
  assert.equal(obraDeAnotacion('San Francisco', ['San Francisco', 'San Francisco II']).valor, 'San Francisco')
})

// ── Fechas y tipos ───────────────────────────────────────────────────────────

test('fechas: DD/MM/AAAA, año de dos dígitos y ISO; lo imposible se rechaza', () => {
  assert.equal(fechaDeLectura('5/1/2026'), '05/01/2026')
  assert.equal(fechaDeLectura('05-01-26'), '05/01/2026')
  assert.equal(fechaDeLectura('2026-01-05'), '05/01/2026')
  assert.equal(fechaDeLectura('31/13/2026'), null, 'mes 13 no existe')
  assert.equal(fechaDeLectura('enero'), null)
})

test('el tipo sale de la letra, y una nota de crédito manda sobre la letra', () => {
  assert.equal(tipoDesdeLectura({ letra: 'A' }), 'A')
  assert.equal(tipoDesdeLectura({ letra: 'Factura B' }), 'B')
  assert.equal(tipoDesdeLectura({ letra: 'A', esNotaCredito: true }), 'NC')
  assert.equal(tipoDesdeLectura({ letra: null }), null)
})

// ── Lo que falta se declara, no se rellena ───────────────────────────────────

test('un comprobante sin total se marca faltante: sin él la percepción se perdería', () => {
  const { faltantes } = normalizarLectura({ ...BARCELO, total: null })
  assert.ok(faltantes.includes(FALTA.TOTAL))
})

test('si el modelo dice que no lo pudo leer, se declara ilegible', () => {
  const { faltantes, dudas } = normalizarLectura({ ...BARCELO, legible: false, dudas: ['la foto está movida'] })
  assert.ok(faltantes.includes(FALTA.ILEGIBLE))
  assert.deepEqual(dudas, ['la foto está movida'])
})

// ── El borde con el modelo ───────────────────────────────────────────────────

test('sólo se le manda al modelo lo que puede mirar', () => {
  assert.equal(bloqueAdjunto({ data: 'x', mediaType: 'image/jpeg' }).type, 'image')
  assert.equal(bloqueAdjunto({ data: 'x', mediaType: 'application/pdf' }).type, 'document')
  assert.equal(bloqueAdjunto({ data: 'x', mediaType: 'video/mp4' }), null)
  assert.equal(bloqueAdjunto({ mediaType: 'image/png' }), null, 'sin datos no hay nada que mirar')
})

test('sin clave de API no se lanza: se devuelve el motivo y el fajo sigue', async () => {
  const r = await leerAdjunto({ data: 'x', mediaType: 'image/png' }, { apiKey: null })
  assert.equal(r.ok, false)
  assert.match(r.error, /no hay lectura/)
})

test('una respuesta del modelo que no es JSON no rompe nada', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'perdón, no sé' }] }) })
  const r = await leerAdjunto({ data: 'x', mediaType: 'image/png' }, { apiKey: 'k', fetchImpl })
  assert.equal(r.ok, false)
})

test('el modelo devuelve el JSON envuelto en prosa y se rescata igual', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ content: [{ type: 'text', text: `Acá va:\n${JSON.stringify(BARCELO)}\nlisto` }] }),
  })
  const r = await leerAdjunto({ data: 'x', mediaType: 'image/png' }, { apiKey: 'k', fetchImpl })
  assert.equal(r.ok, true)
  assert.equal(r.crudo.numero, '0113-00010489')
})

// ═══ EL CUIT IDENTIFICA AL PROVEEDOR; EL NOMBRE, NO SIEMPRE (04/08) ═══
//
// Dos veces en producción el bot frenó una carga declarando «proveedor nuevo» sobre proveedores que
// SÍ estaban en el desplegable, porque la factura trae la razón social del padrón y el desplegable
// el nombre de fantasía:
//   · «DUBOS UGARTE PEDRO LUIS RAUL» es DUPEC (CUIT 20-28773782-4) — 04/08
//   · «PEREZ GARCIA MARISOL BIBIANA» es Corralon Progreso (CUIT 23-36911157-4) — 30/07
// No se parecen en nada y no tienen por qué: ningún matcheo de texto los va a unir jamás.
test('el CUIT resuelve al proveedor cuando la razón social no se parece al nombre de fantasía', () => {
  const lista = ['DUPEC', 'Corralon Progreso', 'Alumetal']
  const porCuit = new Map([['20287737824', 'DUPEC'], ['23369111574', 'Corralon Progreso']])

  const dupec = matchProveedor('DUBOS UGARTE PEDRO LUIS RAUL', lista, { cuit: '20-28773782-4', porCuit })
  assert.equal(dupec.valor, 'DUPEC')
  assert.equal(dupec.esNuevo, false, 'no es un proveedor nuevo: está en el desplegable')
  assert.equal(dupec.motivo, 'cuit')

  const corralon = matchProveedor('PEREZ GARCIA MARISOL BIBIANA', lista, { cuit: '23369111574', porCuit })
  assert.equal(corralon.valor, 'Corralon Progreso')
})

test('SIN el mapa de CUIT, el mismo comprobante se declara proveedor nuevo — el defecto', () => {
  const m = matchProveedor('DUBOS UGARTE PEDRO LUIS RAUL', ['DUPEC'], { cuit: '20287737824' })
  assert.equal(m.esNuevo, true, 'es exactamente lo que pasaba antes, y lo que el mapa arregla')
})

test('un CUIT que NO está en la pestaña no inventa un proveedor', () => {
  const m = matchProveedor('QUIEN SEA SA', ['DUPEC'], { cuit: '30999999999', porCuit: new Map([['20287737824', 'DUPEC']]) })
  assert.equal(m.esNuevo, true)
  assert.equal(m.valor, 'QUIEN SEA SA')
})

// EL DESPLEGABLE SIGUE DECIDIENDO QUÉ SE ESCRIBE. El CUIT resuelve QUIÉN es; si ese nombre no está
// en la lista estricta, la celda quedaría en rojo — así que no entra por esta puerta tampoco.
test('un nombre que el desplegable no tiene no entra ni con el CUIT correcto', () => {
  const m = matchProveedor('DUBOS UGARTE', ['Alumetal'], { cuit: '20287737824', porCuit: new Map([['20287737824', 'DUPEC']]) })
  assert.equal(m.esNuevo, true, 'DUPEC no está en la lista: no se escribe')
})

test('un CUIT que no cierra el módulo-11 NO se propaga: rompería la clave de idempotencia', () => {
  // El CUIT viaja dentro de `claveComprobante()`. Un dígito mal leído por OCR pasa el filtro de
  // «11 dígitos», produce una clave distinta, y la barrera de duplicados deja entrar el mismo gasto
  // dos veces. Se descarta como si no se hubiera leído, que es la verdad.
  const { comprobante: conTypo } = normalizarLectura({ ...BARCELO, cuit: '30-71234567-8' })
  assert.equal(conTypo.cuit, null, 'un CUIT imposible no es un CUIT')

  // Y uno que sí cierra pasa entero. (No se usa el de Echegaray: ése se descarta por ser el
  // propio, que es otra regla y ya estaba.)
  const { comprobante: bueno } = normalizarLectura({ ...BARCELO, cuit: '20-28773782-4' })
  assert.equal(bueno.cuit, '20287737824')
})
