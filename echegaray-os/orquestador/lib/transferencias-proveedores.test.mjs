// Los tres textos de abajo son RECORTES LITERALES de PDFs reales del buzón de jorge@ecsas.com.ar
// (09/09/2026), con el CUIT y el nombre de quien cobra intactos: son datos de la empresa, no
// inventados. Si el Santander cambia el rótulo de un campo, estos tests se ponen rojos — que es
// exactamente lo que tiene que pasar.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CUIT_ECSAS, normalizarCuit, importeArgentino, fechaISO,
  extraerComprobante, clasificarTexto, resolverProveedor, rutaObjeto,
} from './transferencias-proveedores.mjs'

const CON_TITULO = `09/09/2026 16:21 Comprobante de transferencia Estado : procesada Datos de transferencia Importe $ 696.502,61 Fecha de ejecución 09/09/2026 Plazo de acreditación Inmediato Concepto Honorarios Información adicional 0000100000211 Número de comprobante 87690673 Datos de quien recibe la transferencia Nombre o razón social Jose Maria Robles CBU 0000003100051806233208 CUIT o CUIL 20-37924019-5 Tipo de cuenta Cuenta virtual Entidad financiera MERCADO LIBRE S.R.L Datos de quien realizó la transferencia Nombre o razón social ECHEGARAY CONSTRUCCIONES SAS CUIT 30-71630464-3 Cuenta de débito CC en pesos 179-091383/6 Banco Santander Argentina S.A | CUIT 30-50000845-4`

// EL MISMO DOCUMENTO SIN EL TÍTULO. Es el que baja desde el detalle del movimiento y es la mitad de
// los ejemplares reales: si la clasificación exigiera «Comprobante de transferencia», este se perdía.
const SIN_TITULO = `09-09-2026 17:14 Importe $ 67.797,51 Fecha de ejecución 09/09/2026 Plazo de acreditación Inmediato Concepto Factura Información adicional 001100088676 Número de comprobante 88101787 Nombre o razón social AC SAT SRL CBU 0110197920019701001319 CUIT o CUIL 30-71096504-4 Tipo de cuenta Cuenta corriente Entidad financiera BANCO DE LA NACION ARGENTINA Nombre o razón social ECHEGARAY CONSTRUCCIONES SAS CUIT 30-71630464-3 Cuenta de débito CC en pesos 179-091383/6 Banco Santander Argentina S.A | CUIT 30-50000845-4`

// UN COBRO: el mismo formulario con los dos lados dados vuelta. No va a la ficha de ningún proveedor.
const COBRO = SIN_TITULO
  .replace('CUIT o CUIL 30-71096504-4', 'CUIT o CUIL 30-71630464-3')
  .replace('CUIT 30-71630464-3 Cuenta de débito', 'CUIT 30-71096504-4 Cuenta de débito')

// LITERAL de `Comprobante_16301130.pdf` (02/09/2026): el banco escribió «14.675,5», con UN decimal.
// Exigir dos descartaba este comprobante sin decir nada. Si alguien vuelve a poner `\d{2}`, esto
// se pone rojo.
const UN_DECIMAL = `02-09-2026 08:56 Importe $ 14.675,5 Fecha de ejecución 02/09/2026 Plazo de acreditación 24h Concepto Varios Información adicional autos CP7937816 Número de comprobante 04168228 Nombre o razón social DATA 2000 SA C AGUERO CRISTIAN DOMINGO CBU 0450009402800048169079 CUIT o CUIL 30-99907064-3 Tipo de cuenta Caja de ahorro Entidad financiera BANCO DE SAN JUAN S.A. Nombre o razón social ECHEGARAY CONSTRUCCIONES SAS CUIT 30-71630464-3 Cuenta de débito CC en pesos 179-091383/6 Banco Santander Argentina S.A | CUIT 30-50000845-4`

test('un importe con UN solo decimal es un importe: no se descarta el comprobante', () => {
  const r = clasificarTexto(UN_DECIMAL)
  assert.equal(r.es, true, r.motivo)
  assert.equal(r.datos.importe, 14675.5)
  assert.equal(r.datos.numero, '04168228')
  assert.equal(r.datos.cuitDestino, '30999070643')
})

test('normalizarCuit acepta con y sin guiones, y rechaza lo que no tiene 11 dígitos', () => {
  assert.equal(normalizarCuit('20-37924019-5'), '20379240195')
  assert.equal(normalizarCuit('20379240195'), '20379240195')
  assert.equal(normalizarCuit('2037924019'), null)
  assert.equal(normalizarCuit(null), null)
})

test('el importe se lee en criterio argentino: el punto es miles', () => {
  assert.equal(importeArgentino('696.502,61'), 696502.61)
  assert.equal(importeArgentino('67.797,51'), 67797.51)
  // Sin esto, «696.502,61» leído a la inglesa daría 696,50: cuatro órdenes de magnitud de error.
  assert.notEqual(importeArgentino('696.502,61'), 696.5)
  assert.equal(importeArgentino('nada'), null)
})

test('la fecha de ejecución sale en ISO desde los dos separadores', () => {
  assert.equal(fechaISO('09/09/2026'), '2026-09-09')
  assert.equal(fechaISO('07-08-2026'), '2026-08-07')
  assert.equal(fechaISO('2026-09-09'), null)
  assert.equal(fechaISO('99/99/2026'), null)
})

test('extrae número, importe, fecha, CBU, CUIT y nombre de quien cobra', () => {
  const d = extraerComprobante(CON_TITULO)
  assert.equal(d.numero, '87690673')
  assert.equal(d.importe, 696502.61)
  assert.equal(d.fecha, '2026-09-09')
  assert.equal(d.cbuDestino, '0000003100051806233208')
  assert.equal(d.cuitDestino, '20379240195')
  assert.equal(d.nombreDestino, 'Jose Maria Robles')
  assert.equal(d.ordenanteEsEcsas, true)
})

test('el CUIT que se toma es el de quien COBRA, nunca el de ECSAS ni el del banco', () => {
  const d = extraerComprobante(SIN_TITULO)
  assert.equal(d.cuitDestino, '30710965044')
  assert.notEqual(d.cuitDestino, CUIT_ECSAS)
  assert.notEqual(d.cuitDestino, '30500008454') // el del Santander, que está en el pie
})

test('clasifica el comprobante CON título y también el que no lo trae', () => {
  assert.equal(clasificarTexto(CON_TITULO).es, true)
  assert.equal(clasificarTexto(SIN_TITULO).es, true)
})

test('un COBRO no es un pago a proveedor: se descarta con motivo', () => {
  const r = clasificarTexto(COBRO)
  assert.equal(r.es, false)
  assert.match(r.motivo, /COBRO/)
})

test('una factura o un texto cualquiera no pasan por comprobante', () => {
  assert.equal(clasificarTexto('FACTURA A 0001-00000229 Total $ 100.000,00 CUIT 30-71630464-3').es, false)
  assert.equal(clasificarTexto('').es, false)
  assert.equal(clasificarTexto('   ').es, false)
})

test('un comprobante sin número, importe o fecha NO se guarda a medias', () => {
  const mutilado = CON_TITULO.replace('Número de comprobante 87690673', 'Número de comprobante')
  const r = clasificarTexto(mutilado)
  assert.equal(r.es, false)
  assert.match(r.motivo, /faltan/)
})

const PADRON = [
  { id: 'p-robles', cuit: '20379240195' },
  { id: 'p-mass', cuit: '27326890397' },
]

test('resuelve por CUIT del padrón', () => {
  const d = extraerComprobante(CON_TITULO)
  const r = resolverProveedor(d, { padron: PADRON })
  assert.equal(r.proveedorId, 'p-robles')
  assert.equal(r.criterio, 'cuit')
})

test('CUIT que no está en el padrón NO se resuelve por nombre parecido', () => {
  const d = extraerComprobante(SIN_TITULO) // AC SAT SRL, no está en el padrón
  const r = resolverProveedor(d, { padron: [...PADRON, { id: 'p-acsat-parecido', cuit: '30710965040' }] })
  assert.equal(r.proveedorId, null)
  assert.match(r.motivo, /no está en el padrón/)
})

test('el cruce por importe+fecha sólo resuelve con UN candidato, y es exacto al centavo', () => {
  const d = { cuitDestino: null, importe: 67797.51, fecha: '2026-09-09' }
  const uno = resolverProveedor(d, { pagos: [
    { proveedorId: 'p-x', importe: 67797.51, fecha: '2026-09-09' },
    { proveedorId: 'p-y', importe: 67797.52, fecha: '2026-09-09' },
    { proveedorId: 'p-z', importe: 67797.51, fecha: '2026-09-08' },
  ] })
  assert.equal(uno.proveedorId, 'p-x')
  const dos = resolverProveedor(d, { pagos: [
    { proveedorId: 'p-x', importe: 67797.51, fecha: '2026-09-09' },
    { proveedorId: 'p-y', importe: 67797.51, fecha: '2026-09-09' },
  ] })
  assert.equal(dos.proveedorId, null, 'dos candidatos no eligen: eligen NADA')
})

test('un CUIT repetido en el padrón no elige ninguno', () => {
  const d = { cuitDestino: '20379240195' }
  const r = resolverProveedor(d, { padron: [{ id: 'a', cuit: '20379240195' }, { id: 'b', cuit: '20379240195' }] })
  assert.equal(r.proveedorId, null)
  assert.match(r.motivo, /repetido/)
})

test('la ruta del objeto lleva el uid adelante y el proveedor después; sin proveedor, su carpeta', () => {
  const con = rutaObjeto({ uid: 'u1', proveedorId: 'p1', messageId: 'm1', identificador: '87690673', extension: 'pdf' })
  assert.equal(con, 'u1/p1/m1-87690673.pdf')
  const sin = rutaObjeto({ uid: 'u1', proveedorId: null, messageId: 'm1', identificador: '87690673' })
  assert.equal(sin, 'u1/sin-proveedor/m1-87690673.pdf')
})

test('la ruta NO depende del attachmentId de Gmail, que cambia entre lecturas', () => {
  // MEDIDO: dos corridas seguidas dejaron 8 objetos para 4 comprobantes porque Gmail devolvió un
  // `attachmentId` distinto en cada lectura del mismo mail. La ruta se arma con el número del
  // comprobante, que es lo que identifica el papel, y por eso la segunda corrida sobreescribe.
  const a = rutaObjeto({ uid: 'u1', proveedorId: 'p1', messageId: 'm1', identificador: '87690673' })
  const b = rutaObjeto({ uid: 'u1', proveedorId: 'p1', messageId: 'm1', identificador: '87690673' })
  assert.equal(a, b)
  assert.notEqual(a, rutaObjeto({ uid: 'u1', proveedorId: 'p1', messageId: 'm1', identificador: '04074824' }))
})
