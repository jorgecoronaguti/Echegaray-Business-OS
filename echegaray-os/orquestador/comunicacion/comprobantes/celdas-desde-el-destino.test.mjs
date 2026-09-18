// EL AVISO DE «QUÉ QUEDÓ VACÍO» SE ARMA LEYENDO LA FILA ESCRITA, NO LO QUE SE MANDÓ (18/09/2026).
//
// ═══ EL RECLAMO (dueño, 17/09): «no está completando todas las columnas» ═══
//
// El bot decía «quedó con la imputación por completar → falta Obra (J), Unidad (I)» mirando el
// ÍTEM. Pero el cargador completa después (anotación a mano, historial, catálogo) y también puede
// no escribir lo que el ítem traía. Y cerraba SIEMPRE con «Completá vos la Unidad de Negocio y el
// Tipo de Costo», estuviera o no la Unidad escrita. El dueño no podía saber, sin abrir Compras,
// qué le faltaba de verdad. Estos tests fijan que el aviso sale de la fila releída, con la letra
// viva, y que el respaldo por intento se declara como tal.

import test from 'node:test'
import assert from 'node:assert/strict'
import { escribirFajo } from './escritura.mjs'
import { repoMemoria } from './dobles.mjs'
import { COMPRAS_1809 } from '../../lib/comprobantes/encabezado-vivo-compras.mjs'

const NEUMAGOM = {
  proveedor: 'Neumagom', cuit: '30691853825', tipo: 'A', numero: '0002-00004213', fecha: '16/09/2026',
  concepto: 'Neumático Goodyear', iva: 100661.16, total: 580000, categoria: 'B', condicion: 'Cuenta Corriente',
}

/** La fila 981 tal como quedaría en Compras, por RÓTULO contra el encabezado vivo. */
function fila981(valores = {}) {
  const f = Array(COMPRAS_1809.length).fill('')
  const base = { Proveedor: 'Neumagom', 'N° Comprobante': '0002-00004213', 'Fecha factura': 46011, Importe: 479338.84, IVA: 100661.16, Total: 580000, Categoría: 'B', 'Detalles / Obra': 'Neumático Goodyear' }
  for (const [rotulo, v] of Object.entries({ ...base, ...valores })) f[COMPRAS_1809.indexOf(rotulo)] = v
  return f
}

const hojaCon = (fila) => ({ encabezado: [...COMPRAS_1809], filas: [...Array(981 - 4).fill([]), fila] })

async function cargar({ item = {}, fila, leer, datosExtra = {}, filaExtra = {} } = {}) {
  const repo = repoMemoria()
  const fajo = await repo.abrirFajo(null, { userId: 'u1', channelId: 'c1', items: [{ comprobante: { ...NEUMAGOM, ...item } }] })
  const r = await escribirFajo({
    port: null, repo, congelado: () => null,
    correr: async () => ({
      ok: true,
      datos: {
        ok: true, desde: 981, hasta: 981, escritas: 1, duplicados: [], rechazos: [],
        filas: [{ i: 0, fila: 981, proveedor: 'Neumagom', ...filaExtra }],
        ...datosExtra,
      },
    }),
    leerCompras: leer ?? (async () => hojaCon(fila)),
    respaldar: async () => ({}),
  }, fajo)
  return r
}

test('lo que falta se lee de la FILA: el ítem decía todo completo, la fila tiene L y Q vacías', async () => {
  const r = await cargar({
    item: { unidad: 'Estructura', obra: 'Taller', detalleObra: 'Neumático Goodyear' },
    fila: fila981({ 'Unidad de Negocio': 'Estructura', 'Cliente / Asignación': 'Taller', 'CUIT (OS)': '30-69185382-5' }),
  })
  assert.equal(r.estado, 'cargado')
  assert.match(r.texto, /fila 981 .*→ falta Obra \(L\), Tipo pago \(Q\)/)
  assert.doesNotMatch(r.texto, /Completá vos/)
  assert.doesNotMatch(r.texto, /Tipo de Costo/)
  assert.deepEqual(r.sinImputar[0].campos, ['obraFila', 'tipoPago'])
  assert.equal(r.sinImputar[0].origen, 'destino')
})

test('lo que el cargador completó DESPUÉS no se reclama: el ítem iba sin Unidad, la fila la tiene', async () => {
  const r = await cargar({
    item: { unidad: null, obra: null },
    fila: fila981({ 'Unidad de Negocio': 'Estructura', 'Cliente / Asignación': 'Taller', Obra: 'ES-TAL · Estructura – Taller', 'Tipo pago': 'Echeq', 'CUIT (OS)': '30-69185382-5' }),
  })
  assert.doesNotMatch(r.texto, /por completar/)
  assert.deepEqual(r.sinImputar, [])
})

test('si no se pudo releer, el respaldo es lo que se MANDÓ vacío, y se dice que es eso', async () => {
  const r = await cargar({
    item: { unidad: null, obra: 'Taller', detalleObra: 'x' },
    leer: async () => { throw new Error('504') },
  })
  assert.match(r.texto, /no pude releer la fila: es lo que mandé vacío/)
  assert.match(r.texto, /falta Unidad de Negocio \(I\)/)
  assert.equal(r.sinImputar[0].origen, 'intento')
})

test('la obra que salió del historial se dice como tal en el renglón de la fila', async () => {
  const r = await cargar({
    item: { unidad: 'Estructura', obra: 'Taller', detalleObra: 'x' },
    fila: fila981({ 'Unidad de Negocio': 'Estructura', 'Cliente / Asignación': 'Taller', Obra: 'ES-TAL · Estructura – Taller', 'Tipo pago': 'Echeq', 'CUIT (OS)': 'x' }),
    filaExtra: { obra: 'ES-TAL · Estructura – Taller', obraEscrita: true, obraVia: 'historial' },
  })
  assert.match(r.texto, /Obra: \*\*ES-TAL · Estructura – Taller\*\* _\(del historial del proveedor\)_/)
})

test('«CUIT (OS)» vacía se nombra como lo que es: falta en el MAESTRO, no en Compras', async () => {
  const completa = fila981({ 'Unidad de Negocio': 'Estructura', 'Cliente / Asignación': 'Taller', Obra: 'ES-TAL · Estructura – Taller', 'Tipo pago': 'Echeq' })
  const sin = await cargar({ item: { unidad: 'Estructura', obra: 'Taller', detalleObra: 'x' }, fila: completa })
  assert.match(sin.texto, /«CUIT \(OS\)» \(AN\) vacía — el maestro de proveedores no tiene el CUIT de «Neumagom»/)
  assert.doesNotMatch(sin.texto, /por completar/, 'el CUIT no es una celda que se complete en Compras')
  // Y cuando el cargador lo completó en el maestro con el CUIT que ARCA confirmó, se dice eso y no «vacía».
  const con = await cargar({
    item: { unidad: 'Estructura', obra: 'Taller', detalleObra: 'x' }, fila: completa,
    datosExtra: { cuitsCompletados: [{ id: 'x', nombre: 'Neumagom', cuit: '30691853825' }] },
  })
  assert.match(con.texto, /CUIT completado en el maestro \(lo confirma ARCA\): Neumagom → 30691853825/)
  assert.doesNotMatch(con.texto, /vacía — el maestro/)
})

test('una fila releída EN BLANCO no es «todo vacío»: para esa fila vale lo que se mandó, y se dice', async () => {
  // El rango releído vino corto (o la escritura no entró, que lo caza el cargador): afirmar «falta
  // Proveedor, Categoría, …» sobre una fila que no se leyó sería afirmar sobre lo que no se miró.
  const r = await cargar({
    item: { unidad: null, obra: 'Taller', detalleObra: 'x' },
    leer: async () => ({ encabezado: [...COMPRAS_1809], filas: Array(981 - 4).fill([]) }),
  })
  assert.match(r.texto, /no pude releer la fila: es lo que mandé vacío/)
  assert.match(r.texto, /falta Unidad de Negocio \(I\)/)
  assert.doesNotMatch(r.texto, /Proveedor \(E\)/)
  assert.equal(r.sinImputar[0].origen, 'intento')
})

// ── Los cuatro arreglos de la revisión del 18/09 que se ven en el mensaje ────

test('el aviso nombra la EXCEPCIÓN: la Q quedó vacía porque el papel decía algo que no es opción', async () => {
  const r = await cargar({
    item: { unidad: 'Estructura', obra: 'Taller', detalleObra: 'x', formaPago: null, formaPagoLeida: 'Mercado Pago' },
    fila: fila981({ 'Unidad de Negocio': 'Estructura', 'Cliente / Asignación': 'Taller', Obra: 'ES-TAL · Estructura – Taller', 'CUIT (OS)': 'x' }),
  })
  assert.match(r.texto, /falta Tipo pago \(Q\) — el papel dice «Mercado Pago», que no es una opción de «Tipo pago»/)
  assert.equal(r.sinImputar[0].pagoLeido, 'Mercado Pago')
})

test('un proveedor recién dado de ALTA con su CUIT no recibe «el maestro no tiene el CUIT»', async () => {
  // La ARRAYFORMULA «CUIT (OS)» lee la auxiliar `_PROVEEDORES_OS`, que se regenera después: la celda
  // se relee vacía aunque el maestro ya tenga el CUIT desde hace un segundo. El aviso descontaba
  // `cuitsCompletados` pero no las altas de esta misma corrida, y decía algo falso.
  const completa = fila981({ 'Unidad de Negocio': 'Estructura', 'Cliente / Asignación': 'Taller', Obra: 'ES-TAL · Estructura – Taller', 'Tipo pago': 'Echeq' })
  const r = await cargar({
    item: { unidad: 'Estructura', obra: 'Taller', detalleObra: 'x' }, fila: completa,
    datosExtra: { altasAplicadas: { creados: [{ nombre: 'Neumagom', cuit: '30691853825', id: 'x' }], yaEstaban: [], alias: [], rechazos: [] } },
  })
  assert.doesNotMatch(r.texto, /el maestro de proveedores no tiene el CUIT/)
  // Y el que ya existía en la base por CUIT (`yaEstaban`) tampoco.
  const ya = await cargar({
    item: { unidad: 'Estructura', obra: 'Taller', detalleObra: 'x' }, fila: completa,
    datosExtra: { altasAplicadas: { creados: [], yaEstaban: [{ nombre: 'Neumagom', cuit: '30691853825', id: 'x' }], alias: [], rechazos: [] } },
  })
  assert.doesNotMatch(ya.texto, /el maestro de proveedores no tiene el CUIT/)
  // Pero si nadie resolvió el CUIT, el aviso sigue saliendo: no se apagó, se acotó.
  const nadie = await cargar({ item: { unidad: 'Estructura', obra: 'Taller', detalleObra: 'x' }, fila: completa })
  assert.match(nadie.texto, /el maestro de proveedores no tiene el CUIT de «Neumagom»/)
})

test('proveedor fuera del desplegable + ticket sin número: la fila SE RELEYÓ, y el aviso no dice lo contrario', async () => {
  const sinEyH = fila981({
    Proveedor: '', 'N° Comprobante': '', 'Unidad de Negocio': 'Estructura', 'Cliente / Asignación': 'Taller',
    Obra: 'ES-TAL · Estructura – Taller', 'Tipo pago': 'Echeq', 'CUIT (OS)': 'x',
  })
  const r = await cargar({ item: { unidad: 'Estructura', obra: 'Taller', detalleObra: 'x' }, fila: sinEyH })
  assert.doesNotMatch(r.texto, /no pude releer/)
  assert.match(r.texto, /falta Proveedor \(E\)/, 'la E vacía es una celda para completar, no una fila sin leer')
  assert.equal(r.sinImputar[0].origen, 'destino')
})
