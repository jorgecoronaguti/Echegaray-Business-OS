import test from 'node:test'
import assert from 'node:assert/strict'
import { motivoDeDescarte, raicesDelCliente, ubicacionAdmisible } from './recibos-drive-sembrar.mjs'

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
