import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  actoDeLaConstancia, coberturaDeLaConstancia, cuilDelTexto, fechasDeLaConstancia, mismaPersona,
  nombreDelTexto, tipoSegunContenido,
} from './legajos-contenido.mjs'

// Los textos son RECORTES REALES de los papeles del data room, no inventados: lo que se prueba es
// que el parser aguanta cómo escriben estos dos formularios, no una versión idealizada de ellos.

const ALTA = `Simplificación Registral CONSTANCIA DEL TRABAJADOR Alta Original para el empleador,
duplicado para el empleado. Empleador: CUIT: 30-71630464-3 Nombre y apellido o Denominación:
ECHEGARAY CONSTRUCCIONES S.A.S. Datos del Empleado Apellido y nombre: QUIROGA SEBASTIAN ADOLFO
CUIL: 20-30501290-5 Fecha Inicio: 26/06/2023 Fecha Cese: Obra Social: 105408 - O.S.DEL PERSONAL DE
LA CONSTRUCCION Modalidad de contrato: 024 - Personal de la construcción Ley N°22250 Situación de
Revista: 01 - Activo ART vigente: 00027 - PREVENCION ASE DE RIESGOS DEL TRABAJO SA Regimen: SIPA`

const BAJA = ALTA.replace('CONSTANCIA DEL TRABAJADOR Alta', 'CONSTANCIA DEL TRABAJADOR Baja')
  .replace('Fecha Cese:', 'Fecha Cese: 18/03/2026')

const LIBRETA = `INSTITUTO DE ESTADISTICA Y REGISTRO DE LA INDUSTRIA DE LA CONSTRUCCION Libreta de
Fondo de Cese Laboral Ley Nro 22.250 Decreto Nro 1.309/96 ORIGINAL N° 000004977978 Datos del
trabajador Apellido y nombre [ ] __ __ __ __ __ QUIROGA, SEBASTIAN A. CUIL [ ] __ __ __
20-30501290-5 Domicilio [ ] __ __ MZA B C-17 - BARRIO EL PRADO Nro [ ] 17 Localidad [ ] CHIMBAS`

const EPP = `ENTREGA DE ROPA DE TRABAJO Y ELEMENTOS DE PROTECCION PERSONAL Resolución 299/11 Anexo I
Razón Social: Echegaray Construcciones SAS C.U.I.T.: 30716304643 Nombre y Apellido del Trabajador:
Alejandro Ferreyra (8) D.N.I.: 22322045 Producto Tipo Modelo Marca`

test('el mismo formulario es un alta o una baja según lo que dice al lado del título', () => {
  assert.equal(tipoSegunContenido(ALTA), 'alta_temprana')
  assert.equal(tipoSegunContenido(BAJA), 'baja')
  assert.equal(actoDeLaConstancia(ALTA), 'alta')
  assert.equal(actoDeLaConstancia(BAJA), 'baja')
})

test('la libreta del IERIC no es un examen médico aunque el archivo se llame HM', () => {
  assert.equal(tipoSegunContenido(LIBRETA), 'libreta_fondo_cese')
})

test('la planilla de la 299/11 es la entrega de EPP', () => {
  assert.equal(tipoSegunContenido(EPP), 'epp')
})

test('un escaneo sin texto no se clasifica: devuelve null, no adivina', () => {
  assert.equal(tipoSegunContenido('4 -- 1 of 1 --'), null)
  assert.equal(tipoSegunContenido(''), null)
})

test('EL CUIT DEL EMPLEADOR NO ES EL CUIL DE NADIE', () => {
  // Todos los formularios empiezan por el empleador. Tomar el primer número de once dígitos le
  // cargaba 30-71630464-3 —ECHEGARAY CONSTRUCCIONES— como CUIL propio a cinco personas.
  assert.equal(cuilDelTexto(ALTA), '20305012905')
  assert.equal(cuilDelTexto(LIBRETA), '20305012905')
  // La planilla de EPP trae el CUIT de la empresa y el DNI del trabajador, pero ningún CUIL.
  assert.equal(cuilDelTexto(EPP), null)
})

test('las fechas salen de la constancia, y el alta no tiene cese', () => {
  assert.deepEqual(fechasDeLaConstancia(ALTA), { inicio: '2023-06-26', cese: null })
  assert.deepEqual(fechasDeLaConstancia(BAJA), { inicio: '2023-06-26', cese: '2026-03-18' })
})

test('la obra social y la ART vienen sin el código de tabla', () => {
  const c = coberturaDeLaConstancia(ALTA)
  assert.equal(c.obraSocial, 'O.S.DEL PERSONAL DE LA CONSTRUCCION')
  assert.equal(c.art, 'PREVENCION ASE DE RIESGOS DEL TRABAJO SA')
})

test('el nombre se lee de los dos formularios, que lo rotulan distinto', () => {
  assert.equal(nombreDelTexto(ALTA), 'QUIROGA SEBASTIAN ADOLFO')
  assert.equal(nombreDelTexto(LIBRETA), 'QUIROGA SEBASTIAN A')
  assert.equal(nombreDelTexto(EPP), 'Alejandro Ferreyra')
})

test('un legajo de un solo apellido se compara por el apellido, y uno completo por los dos', () => {
  // Cinco legajos del data room se llaman con un apellido y nada más.
  assert.ok(mismaPersona('BALMACEDA GONZALEZ MAXIMILIANO A', 'BALMACEDA'))
  assert.ok(mismaPersona('SANCHEZ ACOSTA LEONARDO G', 'SANCHEZ'))
  // Y con nombre y apellido sí se exigen los dos: éste es un papel en el legajo de otro.
  assert.ok(!mismaPersona('CONTRERAS LUCAS LEONEL', 'CONTRERAS JAVIER'))
  assert.ok(mismaPersona('CONTRERAS ALDANA JAVIER O', 'CONTRERAS JAVIER'))
})
