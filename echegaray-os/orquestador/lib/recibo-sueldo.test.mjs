import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CUIT_EMPRESA, nombreDelRecibo, personaDelRecibo, personaQueCorresponde } from './recibo-sueldo.mjs'

// Una página real del recibo de la 2da quincena de julio de 2026, tal como la extrae pdf-parse.
const PAGINA = `Q MES AÑO APELLIDO Y NOMBRE N° LEGAJO SUELDO BRUTO
7 2026 AGUERO CRISTIAN DOMINGO 5 324.400,00
FECHA INGRESO
REM. ASIGNADA ANTIGÜEDAD
CATEGORÍA LABORAL C.U.I.L BANCO F. PAGO APORTES
26/05/2025
5.817,00 4 Años
OFICIAL 20-29427106-7 SANTANDER RIO 08/06/2026
ECHEGARAY CONSTRUCCIONES S.A.S.
C.U.I.T.: 30-71630464-3
AV. RIOJA NORTE 75 - CAPITAL
PERIODO
05/2026
MODALIDAD DE CONTRATACION OBRA SOCIAL PERIODO DE PAGO
Personal de la Construcción L 22250 OS DE SERENOS DE BUQUES SEGUNDA QUINCENA 07/2026`

test('lee de quién es la página y de qué período', () => {
  assert.deepEqual(personaDelRecibo(PAGINA), {
    cuil: '20-29427106-7',
    nombre: 'AGUERO CRISTIAN DOMINGO',
    legajo: '5',
    periodo: '2026-07',
    quincena: 2,
  })
})

test('EL CUIT DEL EMPLEADOR NO ES EL CUIL DE NADIE', () => {
  // La hoja empieza por el empleador. Tomar el primer número de once dígitos le cargó
  // 30-71630464-3 como CUIL propio a cinco personas el 19/08. Nunca más.
  assert.notEqual(personaDelRecibo(PAGINA).cuil, CUIT_EMPRESA)
  // Y una página que SÓLO tiene el CUIT de la empresa no es de nadie.
  assert.equal(personaDelRecibo(`ECHEGARAY CONSTRUCCIONES S.A.S.\nC.U.I.T.: ${CUIT_EMPRESA}`), null)
})

test('«PERIODO 05/2026» suelto NO es el período que se paga', () => {
  // Ese es el de la obra social. El que manda es «SEGUNDA QUINCENA 07/2026».
  assert.equal(personaDelRecibo(PAGINA).periodo, '2026-07')
})

test('una página sin texto o sin CUIL no se le cuelga a nadie', () => {
  assert.equal(personaDelRecibo(''), null)
  assert.equal(personaDelRecibo('   '), null)
  assert.equal(personaDelRecibo('CARÁTULA\nRESUMEN DE LA LIQUIDACIÓN'), null)
})

test('el nombre del archivo ordena solo y dice de qué es', () => {
  assert.equal(
    nombreDelRecibo({ periodo: '2026-07', quincena: 2, nombre: 'AGUERO CRISTIAN DOMINGO' }),
    'Recibo 2026-07 Q2 · AGUERO CRISTIAN DOMINGO.pdf')
  assert.equal(nombreDelRecibo({ periodo: null, quincena: null, nombre: null }), 'Recibo sin-periodo.pdf')
})

test('se empareja por CUIL, nunca por nombre', () => {
  // El mismo apellido se escribe de dos maneras en dos papeles del mismo día: «AVALOS» y «ÁVALOS».
  // El CUIL no.
  const plantel = [
    { id: 'p1', nombre_completo: 'ÁVALOS MARCELO', cuil: '20-29427106-7' },
    { id: 'p2', nombre_completo: 'AGUERO CRISTIAN DOMINGO', cuil: '27-11111111-1' },
  ]
  assert.equal(personaQueCorresponde({ cuil: '20294271067' }, plantel).id, 'p1')
  assert.equal(personaQueCorresponde({ cuil: '20-29427106-7' }, plantel).id, 'p1')
  assert.equal(personaQueCorresponde({ cuil: '99-99999999-9' }, plantel), null)
  assert.equal(personaQueCorresponde({ cuil: null }, plantel), null)
})
