// EL PARSER DE LA DDJJ DE UOCRA. El fixture es el texto REAL del PDF de enero 2026.

import test from 'node:test'
import assert from 'node:assert/strict'
import { parsearUocra, monto } from './uocra-ddjj.mjs'

const ENERO = `U. O. C. R. A.
Comprobante de Presentación de
Declaración Jurada Nominativa
Fecha de aceptaci�n 7-2-2026
Periodo : 01 / 2026 \tBoleta Tipo: Rectificativa
Datos de la Empresa
CUIT: \t30716304643
Razón Social: ECHEGARAY CONSTRUCCIONES S.A.S.
Aportes Seguro de Vida Colectivo
Cantidad Total de Trabajadores \t16
Suma Total de Remuneraciones \t6654791.21
Total de Aportes Seguro de Vida \t227279.36
Aportes Fondo de Investigación, Capacitación y Seguridad (FICS)
Total Aportes Devengados al Fondo de Cese Laboral: \t721871.71
Total de Aportes FICS: \t14437.43
Otros Conceptos
Cont.Ext.Emp.Obr.Constr 2025-1273-APN-DNRYRT MCH \t72000.00
Total Otros Conceptos \t72000.00
Total Determinado
313716.79
`

test('el punto es DECIMAL en este formulario, no separador de miles', () => {
  // Las DDJJ de IIBB e IVA vienen en es-AR (721.871,71) y ésta no. Reusar aquel parser acá
  // devolvía 721 en vez de 721.871,71: un aporte de setecientos mil pesos leído como setecientos.
  assert.equal(monto('721871.71'), 721871.71)
  assert.equal(monto('313716.79'), 313716.79)
  assert.equal(monto('16'), 16)
  assert.equal(monto(''), null)
  assert.equal(monto('no es un número'), null)
})

test('el período se normaliza a ISO para poder ordenar y cruzar', () => {
  assert.equal(parsearUocra(ENERO).periodo, '2026-01')
})

test('EL FONDO DE CESE DEVENGADO SE LEE — que era lo que la pestaña decía que no existía', () => {
  // La nota al pie del cuadro afirmaba "no lo declara la DDJJ". Lo declara, en este renglón, y
  // estaba en Drive desde febrero.
  assert.equal(parsearUocra(ENERO).fondo_cese_devengado, 721871.71)
})

test('trae el resto de los conceptos que la DDJJ declara', () => {
  const d = parsearUocra(ENERO)
  assert.equal(d.trabajadores, 16)
  assert.equal(d.remuneraciones, 6654791.21)
  assert.equal(d.seguro_vida, 227279.36)
  assert.equal(d.fics, 14437.43)
  assert.equal(d.otros_conceptos, 72000)
  assert.equal(d.total_determinado, 313716.79)
  assert.equal(d.tipo_boleta, 'Rectificativa')
})

test('un PDF ilegible devuelve nulls, NUNCA ceros', () => {
  // Un cero en un aporte declarado se lee como "no se debe nada". Un null se lee como "no pude
  // leerlo", que es la verdad, y hace que la fila no entre en vez de publicar una deuda inventada.
  const d = parsearUocra('esto no es una DDJJ')
  assert.equal(d.periodo, null)
  assert.equal(d.fondo_cese_devengado, null)
  assert.equal(d.total_determinado, null)
})

// ─────────────────────────────────────────────────────────────────────────────
// UNA CARPETA EN LA PAPELERA SE LEE COMO UNA CARPETA VACÍA, Y ESO NO PUEDE PASAR CALLADO.
//
// Medido el 21/08/2026: `CARPETA_UOCRA` apuntaba a una carpeta que alguien mandó a la papelera.
// Drive la seguía devolviendo por su ID, con su nombre, y `files.list` daba cero archivos sin un
// solo error. La réplica quedó clavada en junio mientras las DDJJ de julio se subían puntualmente
// a la carpeta buena: dos meses de Fondo de Cese estimados en vez de declarados, sin ninguna alarma.
import { porQueNoSirve, CARPETA_UOCRA } from './uocra-ddjj.mjs'

test('la papelera se detecta — es el modo de fallar que no grita', () => {
  assert.match(porQueNoSirve({ trashed: true }, [{ name: 'a.pdf' }]) ?? '', /PAPELERA/)
})

test('una carpeta viva pero sin PDF tampoco sirve', () => {
  assert.match(porQueNoSirve({ trashed: false }, []) ?? '', /ningún PDF|no tiene un solo PDF/)
  assert.match(porQueNoSirve({ trashed: false }, [{ name: 'notas.txt' }]) ?? '', /no tiene un solo PDF/)
})

test('sin acceso a la carpeta tampoco se sigue de largo', () => {
  assert.ok(porQueNoSirve(null, []))
})

test('la carpeta buena pasa', () => {
  assert.equal(porQueNoSirve({ trashed: false }, [{ name: '2026-07 UOCRA.pdf' }]), null)
})

test('el ID cableado NO es el que estaba en la papelera', () => {
  assert.notEqual(CARPETA_UOCRA, '1nURWIZqNN_0TMZB--O_jSseVWGGPih0u', 'volvió el ID de la carpeta borrada')
})
