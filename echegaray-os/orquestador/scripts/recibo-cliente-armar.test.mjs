// EL RECIBO DE COBRO DICE EL CÓDIGO DE LA SERIE RC — se arma con `armarDatos`, se dibuja con el `.py` de
// verdad y se lee el texto del PDF que salió. No un regex sobre el fuente: el auditor rechazó la rama
// porque `armarDatos` devolvía `codigo` y el papel seguía imprimiendo «RECIBO N° 20».
//
// Sin python3 + PyMuPDF en la máquina, se saltea diciéndolo (no se simula el dibujo).
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { armarDatos, referenciaDelCobro } from './recibo-cliente-armar.mjs'

const PY = join(import.meta.dirname, '..', 'lib', 'recibo-cliente-pdf.py')
const hayPyMuPDF = spawnSync('python3', ['-c', 'import fitz'], { encoding: 'utf8' }).status === 0

// Un cliente inventado: el test no lee Cobranzas ni la base.
const FILAS = [
  { fila: 10, fecha: '2026-09-01', concepto: 'Anticipo', forma: 'Transferencia', total: 1000, estado: 'Cobrado' },
  { fila: 11, fecha: '2026-10-01', concepto: '2ª cuota', forma: 'Transferencia', total: 500, estado: 'Cobrado' },
  { fila: 12, fecha: '2026-11-01', concepto: '3ª cuota', forma: '', total: 700, estado: 'Pendiente' },
]
const PAGO = {
  fecha: '2026-10-01', cliente: 'Cliente de Prueba SA', cuit_cliente: '30-00000000-0',
  pago: { forma: 'transferencia', monto: 500, aplica: [{ concepto: '2ª cuota', monto: 500 }] },
  filas_de_este_pago: [11],
}

/** Dibuja `datos` con el .py y devuelve { status, texto del PDF, stderr }. */
function dibujarYLeer(datos) {
  const dir = mkdtempSync(join(tmpdir(), 'recibo-rc-'))
  try {
    const json = join(dir, 'datos.json')
    const pdf = join(dir, 'recibo.pdf')
    writeFileSync(json, JSON.stringify(datos))
    const r = spawnSync('python3', [PY, json, pdf], { encoding: 'utf8' })
    if (r.status !== 0) return { status: r.status, texto: '', stderr: r.stderr }
    const leer = spawnSync('python3', ['-c', 'import fitz,sys; print("".join(p.get_text() for p in fitz.open(sys.argv[1])))', pdf], { encoding: 'utf8' })
    return { status: 0, texto: leer.stdout, stderr: leer.stderr }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('armarDatos: con el número tomado devuelve el número pelado (portal) y el código RC', () => {
  const d = armarDatos(FILAS, PAGO, 20)
  assert.equal(d.numero, '20')
  assert.equal(d.codigo, 'RC-000020')
})

test('el PDF del recibo de cobro imprime «RECIBO N° RC-000020», no el número pelado', { skip: !hayPyMuPDF && 'sin python3 + PyMuPDF' }, () => {
  const { status, texto, stderr } = dibujarYLeer(armarDatos(FILAS, PAGO, 20))
  assert.equal(status, 0, stderr)
  assert.match(texto, /RECIBO N° RC-000020/)
  assert.doesNotMatch(texto, /RECIBO N° 20\b/, 'el número pelado no es el que se entrega')
})

test('la vista previa (sin número tomado) NO se dibuja: un papel sin código repetiría un número', { skip: !hayPyMuPDF && 'sin python3 + PyMuPDF' }, () => {
  const { status, stderr } = dibujarYLeer(armarDatos(FILAS, PAGO, null))
  assert.notEqual(status, 0)
  assert.match(stderr, /código de la serie RC/)
})

test('un JSON viejo, con número pero sin código, tampoco se dibuja', { skip: !hayPyMuPDF && 'sin python3 + PyMuPDF' }, () => {
  const viejo = armarDatos(FILAS, PAGO, 18)
  delete viejo.codigo
  const { status, stderr } = dibujarYLeer(viejo)
  assert.notEqual(status, 0)
  assert.match(stderr, /código de la serie RC/)
})

test('la referencia que se asienta con el número dice cliente, CUIT, fecha, forma e importe', () => {
  assert.equal(referenciaDelCobro(PAGO), 'Cliente de Prueba SA · CUIT 30-00000000-0 · 01/10/2026 · transferencia $500')
})

test('sin cliente, fecha o importe no hay referencia: no se toma un número sin dueño', () => {
  assert.throws(() => referenciaDelCobro({ ...PAGO, cliente: '  ' }), /cliente, fecha/)
  assert.throws(() => referenciaDelCobro({ ...PAGO, fecha: '1/10/26' }), /cliente, fecha/)
  assert.throws(() => referenciaDelCobro({ ...PAGO, pago: { ...PAGO.pago, monto: 0 } }), /cliente, fecha/)
})
