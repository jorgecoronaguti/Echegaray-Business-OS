import test from 'node:test'
import assert from 'node:assert/strict'

import {
  parsearBoletaIeric, boletasIericVigentes, incoherencia, importeEsAr, periodoDesde, leerBoletasIeric,
  RE_ARCHIVO_BOLETA,
} from './cargas-boletas-ieric.mjs'

// ═══ EL TEXTO ES EL REAL: `pdf-parse` sobre los PDF de archivo-fiscal/2026/IERIC, leídos el 11/09/2026 ═══
// (recortado al primer talón; el segundo repite lo mismo)
const IERIC_08 = 'SR. CAJERO: ESTE COMPROBANTE DEBE SER LEIDO ELECTRONICAMENTE A\nTRAVES DEL CODIGO DE BARRAS Y COBRADO HASTA EL VENCIMIENTO\n'
  + 'EMPLEADOR FECHA DE\nVENCIMIENTO DE PAGO\n15/09/26\nTOTAL A PAGAR\n$ 13.794,56\nCUIT: 30-71630464-3 Nº IERIC: 173621\n'
  + 'PAGO 1% IERIC $ 13.794,56\tX\nForma de pago: Efectivo o Cheque (solo BBVA) Clave de pago electrónico: 30716304643\n'
  + 'Número de Boleta: 5776268\nFirma y Sello del Recaudador\nGenerado el 09/09/2026 07:48:00 p.m.\nECHEGARAY CONSTRUCCIONES S.A.S.\n'
  + 'PERIODO DE APORTE\n2026/08\nFONDO CESE LABORAL\nDepositado\nEfectivo\nCONTRIBUCION\n1% IERIC\n(Art. 12 Ley 22.250)\nACTUALIZACION\n'
  + 'Art. 12 y 30 Ley 22.250\nArt. 15 Decreto 1342/81\n1% IERIC\nTOTAL TRABAJADORES\n23\n1.160.400,00\n219.055,92\n13.794,56\n0,00\n'
  + 'TOTAL A PAGAR\n$ 13.794,56\nDestino Final de Fondos Cuenta 35220/46 de Banco de la\nNación Argentina (Sucursal 85).\n'
  + 'TOTAL 1.379.455,92\n906900000137945626091500577626800000010078\n'
const FODECO_08 = IERIC_08.replace(/1% IERIC/g, '1% FODECO').replace('5776268', '5776271')
  .replace('TOTAL 1.379.455,92\n', 'TOTAL 1.379.455,92\n(Solo RED BANELCO / PMC)\n')
const IERIC_07 = IERIC_08.replace(/13\.794,56/g, '13.191,19').replace('2026/08', '2026/07').replace('15/09/26', '17/08/26')
  .replace('5776268', '5736249').replace('1.160.400,00', '1.222.596,00').replace('219.055,92', '96.523,20')
  .replace('TOTAL 1.379.455,92', 'TOTAL 1.319.119,20').replace('\n23\n', '\n21\n')

test('la boleta de IERIC de agosto se lee entera: organismo, período, total al centavo, número y vencimiento', () => {
  const b = parsearBoletaIeric(IERIC_08)
  assert.deepEqual(b, {
    organismo: 'IERIC', periodo: '2026-08', total: 13794.56, boleta: '5776268', vence: '2026-09-15',
    cuit: '30-71630464-3', trabajadores: 23, base: 1379455.92,
  })
})

test('la de FODECO es otra boleta del mismo período por el mismo importe — y el texto extra de PMC no la rompe', () => {
  const b = parsearBoletaIeric(FODECO_08)
  assert.equal(b.organismo, 'FODECO')
  assert.equal(b.boleta, '5776271')
  assert.equal(b.total, 13794.56)
  assert.equal(b.base, 1379455.92)
})

test('julio: otro período, otro total — el parser no clava agosto', () => {
  const b = parsearBoletaIeric(IERIC_07)
  assert.equal(b.periodo, '2026-07')
  assert.equal(b.total, 13191.19)
  assert.equal(b.vence, '2026-08-17')
  assert.equal(b.trabajadores, 21)
})

test('sin período, sin total o sin organismo NO hay boleta: no se inventa un declarado', () => {
  assert.equal(parsearBoletaIeric(IERIC_08.replace('PERIODO DE APORTE\n2026/08', 'PERIODO DE APORTE\n')), null)
  assert.equal(parsearBoletaIeric(IERIC_08.replace(/TOTAL A PAGAR\n\$ 13\.794,56/g, 'TOTAL A PAGAR\n$')), null)
  assert.equal(parsearBoletaIeric(IERIC_08.replace(/PAGO 1% IERIC \$/g, 'PAGO $')), null)
  assert.equal(parsearBoletaIeric(''), null)
  assert.equal(parsearBoletaIeric(IERIC_08.replace('2026/08', '2026/13')), null, 'no existe el mes 13')
})

test('los importes vienen en es-AR: el punto es de miles y la coma de centavos', () => {
  assert.equal(importeEsAr('13.794,56'), 13794.56)
  assert.equal(importeEsAr('1.379.455,92'), 1379455.92)
  assert.equal(importeEsAr('0,00'), 0)
  assert.equal(importeEsAr('13,794.56'), null, 'un importe en inglés no es un importe')
})

test('el nombre del archivo y el texto tienen que contar la misma boleta', () => {
  assert.equal(incoherencia('ContribucionIERIC30716304643202608.pdf', parsearBoletaIeric(IERIC_08)), null)
  assert.match(incoherencia('ContribucionFODECO30716304643202608.pdf', parsearBoletaIeric(IERIC_08)), /nombre dice FODECO/)
  assert.match(incoherencia('ContribucionIERIC30716304643202607.pdf', parsearBoletaIeric(IERIC_08)), /nombre dice 2026-07/)
  assert.match(incoherencia('ContribucionIERIC30716304643202608.pdf', null), /no parsea/)
  const ajena = parsearBoletaIeric(IERIC_08.replace('30-71630464-3', '30-99999999-9'))
  assert.match(incoherencia('ContribucionIERIC30999999999202608.pdf', ajena), /otro empleador/,
    'la boleta de otro empleador en nuestra carpeta no es una obligación nuestra')
  assert.equal(incoherencia('boleta renombrada.pdf', parsearBoletaIeric(IERIC_08)), null,
    'un nombre que no sigue el patrón del portal no contradice nada: manda el texto')
  assert.ok(RE_ARCHIVO_BOLETA.test('ContribucionFODECO30716304643202606.pdf'))
  assert.ok(!RE_ARCHIVO_BOLETA.test('IERIC CONT 1P - 08-2026 - pago 11-09-2026.pdf'), 'el comprobante de pago no es una boleta')
})

test('vigentes: una boleta de cada organismo por período, y la reimpresión más nueva le gana a la vieja', () => {
  const lista = [
    parsearBoletaIeric(IERIC_08), parsearBoletaIeric(FODECO_08), parsearBoletaIeric(IERIC_07),
    { ...parsearBoletaIeric(IERIC_08), boleta: '5700000', total: 1 }, // una emisión anterior del mismo período
    { organismo: 'IERIC', periodo: '2026-09', total: 0 },             // sin importe no es una obligación
  ]
  const v = boletasIericVigentes(lista)
  assert.deepEqual([...v.keys()].sort(), ['2026-07', '2026-08'])
  assert.equal(v.get('2026-08').IERIC.boleta, '5776268', 'gana el número de boleta más alto')
  assert.equal(v.get('2026-08').FODECO.total, 13794.56)
  assert.equal(v.get('2026-07').FODECO, null, 'julio sólo tiene la de IERIC en esta lista: no se inventa la otra')
})

test('la ventana de lectura arranca 13 meses atrás, en AAAAMM', () => {
  assert.equal(periodoDesde(new Date(Date.UTC(2026, 8, 11))), '202508')
  assert.equal(periodoDesde(new Date(Date.UTC(2026, 0, 5))), '202412')
})

// ═══ EL LECTOR, CON DOBLES: índice de Drive y PDF falsos ═══

const INDICE = [
  { name: 'ContribucionIERIC30716304643202608.pdf', drive_file_id: 'A', path: 'archivo-fiscal/2026/IERIC/x', modified_time: '2026-09-10' },
  { name: 'ContribucionFODECO30716304643202608.pdf', drive_file_id: 'B', path: 'archivo-fiscal/2026/IERIC/y', modified_time: '2026-09-10' },
  { name: 'ContribucionIERIC30716304643202608.pdf', drive_file_id: 'A2', path: 'copia vieja', modified_time: '2026-09-01' },
  { name: 'ContribucionIERIC30716304643202607.pdf', drive_file_id: 'C', path: 'archivo-fiscal/2026/IERIC/z', modified_time: '2026-08-10' },
  { name: 'ContribucionFODECO30716304643202607.pdf', drive_file_id: 'D', path: 'archivo-fiscal/2026/IERIC/w', modified_time: '2026-08-10' },
]
const PDFS = { A: IERIC_08, B: FODECO_08, A2: 'no debería leerse', C: IERIC_07, D: '' }
const google = (leidos = []) => ({
  async readPdfText(id) { leidos.push(id); const text = PDFS[id] ?? ''; return { text, scanned: text.trim().length < 40 } },
})

test('el lector toma la copia más nueva de cada nombre, lee el PDF y devuelve la boleta con su drive_file_id', async () => {
  const leidos = []
  const avisos = []
  const sql = []
  const boletas = await leerBoletasIeric({
    query: async (q, params) => { sql.push([q, params]); return { rows: INDICE } },
    google: google(leidos), aviso: (m) => avisos.push(m), hoy: new Date(Date.UTC(2026, 8, 11)),
  })
  assert.deepEqual(leidos, ['A', 'B', 'C', 'D'], 'la copia vieja A2 no se lee')
  assert.deepEqual(boletas.map((b) => [b.organismo, b.periodo, b.total, b.drive_file_id]),
    [['IERIC', '2026-08', 13794.56, 'A'], ['FODECO', '2026-08', 13794.56, 'B'], ['IERIC', '2026-07', 13191.19, 'C']])
  assert.equal(avisos.length, 1)
  assert.match(avisos[0], /202607\.pdf es un PDF escaneado/, 'el que no se pudo leer se nombra, no se inventa')
  assert.match(sql[0][0], /drive_index/)
  assert.deepEqual(sql[0][1], ['202508'], 'la consulta acota la ventana por AAAAMM del nombre')
})

test('una boleta cuyo nombre contradice su texto NO entra', async () => {
  const avisos = []
  const boletas = await leerBoletasIeric({
    query: async () => ({ rows: [{ name: 'ContribucionFODECO30716304643202608.pdf', drive_file_id: 'A' }] }),
    google: google(), aviso: (m) => avisos.push(m),
  })
  assert.deepEqual(boletas, [])
  assert.match(avisos[0], /nombre dice FODECO y el texto IERIC/)
})

test('sin base, el lector devuelve [] y avisa: la corrida del Libro no se cae por esto', async () => {
  const avisos = []
  const boletas = await leerBoletasIeric({
    query: async () => { throw new Error('authentication did not complete within 15000ms') },
    google: google(), aviso: (m) => avisos.push(m),
  })
  assert.deepEqual(boletas, [])
  assert.match(avisos[0], /no pude consultar drive_index/)
})
