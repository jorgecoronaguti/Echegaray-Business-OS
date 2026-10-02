import test from 'node:test'
import assert from 'node:assert/strict'
import { choquesConLaSerie, motivoDeDescarte, motivoDeSerieAjena, raicesDelCliente, ubicacionAdmisible } from './recibos-drive-sembrar.mjs'

test('la carpeta del cliente y la de cada obra son raíces, agrupadas por carpeta', () => {
  // Messina declara la MISMA carpeta de Drive para dos obras distintas.
  const raices = raicesDelCliente({ drive_carpeta_id: 'CLI' }, [
    { id: 'bsa-planta', drive_carpeta_id: 'BSA' },
    { id: 'bsa-adicional', drive_carpeta_id: 'BSA' },
    { id: 'pilon', drive_carpeta_id: 'PIL' },
    { id: 'messina', drive_carpeta_id: null },
  ])
  assert.deepEqual(raices, [
    { carpetaId: 'CLI', obraIds: [] },
    { carpetaId: 'BSA', obraIds: ['bsa-planta', 'bsa-adicional'] },
    { carpetaId: 'PIL', obraIds: ['pilon'] },
  ])
})

test('un cliente sin carpeta propia igual barre las de sus obras', () => {
  // San Francisco (Javier Sánchez): `clientes.drive_carpeta_id` es NULL.
  assert.deepEqual(raicesDelCliente({ drive_carpeta_id: null }, [{ id: 'x', drive_carpeta_id: 'X' }]),
    [{ carpetaId: 'X', obraIds: ['x'] }])
})

test('un recibo entra si está en la raíz o en su carpeta de recibos, y no más adentro', () => {
  assert.equal(ubicacionAdmisible([]), true)
  assert.equal(ubicacionAdmisible(['RECIBOS']), true)
  assert.equal(ubicacionAdmisible(['CERTIFICADOS']), true)
  // EL DEFECTO QUE ATRAPA: los recibos de sueldo del personal de SECONDI viven DENTRO de la carpeta
  // del cliente ARCOR. Aceptar cualquier profundidad se los publicaría a ARCOR.
  assert.equal(ubicacionAdmisible(['SECONDI', '8. AGOSTO']), false)
  assert.equal(ubicacionAdmisible(['SECONDI', '1. ENERO', 'RECIBOS DE SUELDO']), false)
})

test('el descarte dice POR QUÉ, con la ruta real', () => {
  const pdf = 'application/pdf'
  assert.equal(motivoDeDescarte({ name: 'RECIBO 10 - 30:6:26.pdf', mimeType: pdf, ruta: ['RECIBOS'] }), null)
  assert.match(
    motivoDeDescarte({ name: 'Recibos 1.pdf', mimeType: pdf, ruta: ['SECONDI', '8. AGOSTO'] }),
    /SECONDI\/8\. AGOSTO/)
  assert.match(
    motivoDeDescarte({ name: 'Recibo de sueldo DIAZ GOMEZ .pdf', mimeType: pdf, ruta: ['RECIBOS'] }),
    /recibo de sueldo/)
  assert.match(
    motivoDeDescarte({ name: 'Recibo 3.xlsm', mimeType: 'application/vnd.ms-excel', ruta: [] }),
    /no es un PDF ni una imagen/)
})

test('serie RC: avisa el recibo de Drive con número mayor a los de mano que no está en el libro, y el anulado', () => {
  const libro = new Map([[20, { anulado_motivo: null }], [21, { anulado_motivo: 'JSON descartado: monto mal' }]])
  const fila = (numero, nombre_archivo) => ({ numero, nombre_archivo })
  const avisos = choquesConLaSerie([
    fila('7', 'Recibo 7 - 01-03-2026.pdf'),      // a mano, antes del libro: no se reclama
    fila('19', 'Recibo 19 - 20-09-2026.pdf'),    // el último a mano
    fila('20', 'Recibo 20 - 01-10-2026.pdf'),    // tomado por la serie, con dueño
    fila('21', 'Recibo 21 - 02-10-2026.pdf'),    // anulado: el papel no debía salir
    fila('22', 'Recibo 22 - 02-10-2026.pdf'),    // hecho a mano: choca con la serie
    fila(null, 'Recibo sin numero.pdf'),
  ], { aManoHasta: 19, libro })
  assert.equal(avisos.length, 2)
  assert.match(avisos[0], /^⚠ .*Recibo 21.*ANULADO.*JSON descartado/)
  assert.match(avisos[1], /^⚠ .*Recibo 22.*n° 22 .*no está en el libro/)
})

test('un RP (pago a personal) en carpeta de cliente se descarta y nunca se juzga contra el libro RC', () => {
  // EL DEFECTO QUE ATRAPA: «RP-000012» daba numero 12 y se avisaba/guardaba como recibo RC 12.
  assert.match(motivoDeSerieAjena('RP'), /RP.*no es de cobro a cliente/)
  assert.equal(motivoDeSerieAjena('RC'), null)
  assert.equal(motivoDeSerieAjena(undefined), null)
  const avisos = choquesConLaSerie([{ numero: '25', serie: 'RP', nombre_archivo: 'RECIBO RP-000025.pdf' }],
    { aManoHasta: 19, libro: new Map() })
  assert.deepEqual(avisos, [])
})
