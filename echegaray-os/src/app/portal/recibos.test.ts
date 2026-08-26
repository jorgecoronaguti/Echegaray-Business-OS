import test from 'node:test'
import assert from 'node:assert/strict'
import {
  claveDeRecibo, costurarRecibos, nombreDeDescarga, puedeBajarElRecibo, recibosDelPortal,
  rutaDeDescarga, visibleAlCliente, type FilaRecibo,
} from './recibos.ts'
import { aPagoDelPortal, type FilaEsquema } from './esquema.ts'
import { alcanzaLaObra } from './permisos.ts'

function fila(cambios: Partial<FilaRecibo> = {}): FilaRecibo {
  return {
    id: 'r1',
    obra_id: null,
    numero: '10',
    fecha: '2026-06-30',
    monto: '10000000.00',
    moneda: 'ARS',
    nombre_archivo: 'RECIBO 10 - 30:6:26.pdf',
    visible_portal: true,
    ...cambios,
  }
}

function pago(cambios: Partial<FilaEsquema> = {}) {
  return aPagoDelPortal({
    id: 'p1', obra_id: 'la-estrella', concepto: 'Pago a cuenta', fecha: '2026-06-30',
    monto: '10000000', reparo: null, estado: 'cobrado', medio: 'transferencia',
    visible_portal: true, publicado_at: '2026-08-26T12:00:00Z', cambio_pendiente: false, orden: 1,
    factura_numero: 'FA 01-0000228', recibo_numero: null, ...cambios,
  }, 'La Estrella')
}

const TODAS = (obraId: string | null) => alcanzaLaObra(null, obraId)
const NOMBRES = new Map([['la-estrella', 'La Estrella']])

test('UN RECIBO SIN OBRA NO SE DESCARTA', () => {
  // EL DEFECTO QUE ATRAPA: los 23 recibos que hay hoy en Drive viven en la carpeta del CLIENTE y
  // ninguno dice de qué obra es. Un filtro que exigiera obra dejaría la pantalla exactamente como
  // estaba —vacía— y sin que nadie se entere de que faltan 23 papeles.
  const salida = recibosDelPortal([fila({ obra_id: null })], NOMBRES, TODAS, true)
  assert.equal(salida.length, 1)
  assert.equal(salida[0].obraId, null)
  assert.equal(salida[0].obraNombre, '')
})

test('un acceso acotado a obras NO ve el recibo sin obra — falla cerrado', () => {
  const acotado = (obraId: string | null) => alcanzaLaObra(['la-estrella'], obraId)
  assert.equal(recibosDelPortal([fila({ obra_id: null })], NOMBRES, acotado, true).length, 0)
  assert.equal(recibosDelPortal([fila({ obra_id: 'la-estrella' })], NOMBRES, acotado, true).length, 1)
})

test('visible_portal = false no se muestra', () => {
  assert.equal(visibleAlCliente({ visible_portal: false }), false)
  assert.equal(recibosDelPortal([fila({ visible_portal: false })], NOMBRES, TODAS, true).length, 0)
})

test('SIN puede_ver_montos NO SALE UN IMPORTE — ni el archivo que los tiene todos', () => {
  // EL DEFECTO QUE ATRAPA: retirar el importe de la fila y dejar el enlace al PDF devuelve por la
  // puerta de atrás exactamente lo que el permiso retira — el PDF ES el estado de cuenta completo.
  const [r] = recibosDelPortal([fila()], NOMBRES, TODAS, false)
  assert.equal(r.monto, null)
  assert.equal(r.descargaEn, null)
  const [conMontos] = recibosDelPortal([fila()], NOMBRES, TODAS, true)
  assert.equal(conMontos.monto, 10000000)
  assert.equal(conMontos.descargaEn, rutaDeDescarga('r1'))
})

test('un importe ausente sigue ausente: null, nunca 0', () => {
  assert.equal(recibosDelPortal([fila({ monto: null })], NOMBRES, TODAS, true)[0].monto, null)
})

test('los recibos se ordenan por fecha y los sin fecha van al final', () => {
  const salida = recibosDelPortal([
    fila({ id: 'a', fecha: null, numero: '2' }),
    fila({ id: 'b', fecha: '2026-01-19', numero: null }),
    fila({ id: 'c', fecha: '2026-07-31', numero: '11' }),
  ], NOMBRES, TODAS, true)
  assert.deepEqual(salida.map((r) => r.id), ['c', 'b', 'a'])
})

test('el número se compara por su parte numérica: «010» es el recibo 10', () => {
  assert.equal(claveDeRecibo('Recibo N° 010'), '10')
  assert.equal(claveDeRecibo('10'), '10')
  assert.equal(claveDeRecibo(null), null)
  assert.equal(claveDeRecibo('sin número'), null)
})

test('UN RECIBO YA REPRESENTADO POR recibo_numero NO SE DUPLICA', () => {
  // EL DEFECTO QUE ATRAPA: dibujar el archivo como fila propia además de la factura que ya lo
  // declara pagado le muestra al cliente dos veces el mismo cobro.
  const facturas = [pago({ id: 'p1', recibo_numero: '10' })]
  const recibos = recibosDelPortal([fila({ numero: '10' })], NOMBRES, TODAS, true)
  const { archivoDelPago, sueltos } = costurarRecibos(facturas, recibos)
  assert.equal(sueltos.length, 0)
  assert.equal(archivoDelPago.get('p1')?.id, 'r1')
})

test('el recibo que no corresponde a ninguna fila en pantalla sale solo', () => {
  const facturas = [pago({ id: 'p1', recibo_numero: '99' })]
  const recibos = recibosDelPortal([fila({ numero: '10' })], NOMBRES, TODAS, true)
  const { archivoDelPago, sueltos } = costurarRecibos(facturas, recibos)
  assert.equal(archivoDelPago.size, 0)
  assert.deepEqual(sueltos.map((r) => r.id), ['r1'])
})

test('un recibo sin número nunca se ata a un pago sin número', () => {
  // Los dos lados en null NO son «el mismo recibo»: son dos ausencias.
  const facturas = [pago({ id: 'p1', recibo_numero: null })]
  const recibos = recibosDelPortal([fila({ numero: null })], NOMBRES, TODAS, true)
  const { archivoDelPago, sueltos } = costurarRecibos(facturas, recibos)
  assert.equal(archivoDelPago.size, 0)
  assert.equal(sueltos.length, 1)
})

test('dos archivos con el mismo número: el segundo no desaparece', () => {
  const facturas = [pago({ id: 'p1', recibo_numero: '10' })]
  const recibos = recibosDelPortal(
    [fila({ id: 'r1', numero: '10' }), fila({ id: 'r2', numero: '10', fecha: '2026-06-29' })],
    NOMBRES, TODAS, true)
  const { archivoDelPago, sueltos } = costurarRecibos(facturas, recibos)
  assert.equal(archivoDelPago.size, 1)
  assert.deepEqual(sueltos.map((r) => r.id), ['r2'])
})

test('el archivo se baja con su nombre real, aunque tenga tildes y dos puntos', () => {
  // `inline` POR DEFECTO desde el 26/08/2026: el cliente toca el recibo para MIRARLO, y bajarlo es
  // la excepción («no quiero q se descargue, quiero q el archivo se pueda ver»). El nombre real sigue
  // viajando en las dos formas, que es lo que este test cuida.
  // EL DEFECTO QUE ATRAPA: sin `Content-Disposition` el navegador guarda el PDF con el nombre de la
  // URL —el uuid— y el cliente termina con doce archivos que no puede distinguir.
  const h = nombreDeDescarga('RECIBO 10 - 30:6:26.pdf')
  assert.match(h, /^inline; filename="RECIBO 10 - 30:6:26\.pdf"/)
  assert.match(h, /filename\*=UTF-8''RECIBO%2010/)
  // Una comilla o un salto de línea en el nombre cortaría el encabezado: quedan sólo las dos que
  // el propio encabezado pone, y ningún salto de línea.
  const sucio = nombreDeDescarga('mal"nombre\n.pdf')
  assert.equal((sucio.match(/"/g) ?? []).length, 2)
  assert.equal(/[\r\n]/.test(sucio), false)
  assert.match(nombreDeDescarga('Recibo ñandú.pdf'), /filename="Recibo nandu\.pdf"/)
})

// ── LA PUERTA DE DESCARGA ──────────────────────────────────────────────────────────────────────

const ACCESO = { clienteId: 'cli-1', puedeVerMontos: true, obras: null as string[] | null }
const ARCHIVO = { cliente_id: 'cli-1', obra_id: null as string | null, visible_portal: true }

test('la puerta de descarga deja pasar al cliente del recibo', () => {
  assert.equal(puedeBajarElRecibo(ACCESO, ARCHIVO), true)
})

test('la puerta NO deja bajar el archivo de otro cliente', () => {
  // EL DEFECTO QUE ATRAPA: la URL se puede tipear. Sin esta comprobación, un cliente con sesión
  // válida se baja el estado de cuenta de otro cambiando el uuid.
  assert.equal(puedeBajarElRecibo(ACCESO, { ...ARCHIVO, cliente_id: 'cli-2' }), false)
})

test('la puerta NO deja bajar sin puede_ver_montos, ni lo retirado del portal, ni sin acceso', () => {
  assert.equal(puedeBajarElRecibo({ ...ACCESO, puedeVerMontos: false }, ARCHIVO), false)
  assert.equal(puedeBajarElRecibo(ACCESO, { ...ARCHIVO, visible_portal: false }), false)
  assert.equal(puedeBajarElRecibo(null, ARCHIVO), false)
  assert.equal(puedeBajarElRecibo(ACCESO, null), false)
})

test('un acceso acotado no baja un recibo sin obra, y sí el de su obra', () => {
  const acotado = { ...ACCESO, obras: ['la-estrella'] }
  assert.equal(puedeBajarElRecibo(acotado, ARCHIVO), false)
  assert.equal(puedeBajarElRecibo(acotado, { ...ARCHIVO, obra_id: 'la-estrella' }), true)
  assert.equal(puedeBajarElRecibo(acotado, { ...ARCHIVO, obra_id: 'otra' }), false)
})

test('bajarlo sigue siendo posible, pero es la excepción', () => {
  // La fila abre el archivo; el iconito de la derecha manda `?descargar=1`. Dos gestos distintos
  // para dos intenciones distintas, y el nombre real viaja igual en los dos.
  assert.match(nombreDeDescarga('RECIBO 10 - 30:6:26.pdf', true), /^attachment; filename="RECIBO 10 - 30:6:26\.pdf"/)
  assert.match(nombreDeDescarga('RECIBO 10 - 30:6:26.pdf'), /^inline;/)
})
