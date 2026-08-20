import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  actoDeLaConstancia, coberturaDeLaConstancia, cuilDelTexto, fechasDeLaConstancia, mismaPersona,
  nombreDelTexto, tipoSegunContenido, libretaDelIeric, dniDelCuil, categoriaDeConvenio,
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

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// LA LIBRETA DEL IERIC — los dos órdenes en que sale del PDF, y el domicilio del empleador
// ═════════════════════════════════════════════════════════════════════════════════════════════════

const LIB_A = `INSTITUTO DE ESTADISTICA Y REGISTRO DE LA INDUSTRIA DE LA CONSTRUCCION Libreta de
Fondo de Cese Laboral Ley Nro 22.250 ORIGINAL N° 000005861940 Datos del trabajador Apellido y
nombre [ ] __ __ ALANIZ, EMANUEL ARIEL CUIL [ ] __ __ 20-38218815-3 Domicilio [ ] __ __ CANDELARES
MZA E CASA Nro [ ] __ 03 Piso [ ] __ Depto [ ] __ Localidad [ ] __ SAN JUAN Código Postal [ ] __
5400 Provincia [ ] __ SAN JUAN Doc. identidad [ ] __ DNI 38218815 A.R.T [ ] __ PREVENSION
Nacionalidad [ ] __ ARGENTINA Fecha de nacimiento [ ] __ 26/07/1994 Categoría [ ] __ AYUDANTE
Especialidad [ ] __ ALBAÑIL Fecha de ingreso del trabajador [ ] __ 21/01/2026 Datos del empleador
Apellido y nombre o Razón Social [ ] __ ECHEGARAY CONSTRUCCIONES S.A.S. CUIT [ ] __ 30-71630464-3
Domicilio [ ] __ AV. RIOJA (NORTE) Nro [ ] __ 75 Localidad [ ] __ SAN JUAN Código Postal [ ] __ 5400
Provincia [ ] __ SAN JUAN Nro telefónico [ ] __ 0264 -4544550`

// El MISMO formulario, con los corchetes al otro lado: así sale de la mitad de los PDF.
const LIB_B = `INSTITUTO DE ESTADISTICA Y REGISTRO DE LA INDUSTRIA DE LA CONSTRUCCION Libreta de
Fondo de Cese Laboral ORIGINAL N° 000005914316 Datos del trabajador Apellido y nombre __ __] [
CASTRO PEREZ, ROBERTO EDGAR CUIL __ __] [ 20-25830350-5 Domicilio __ __] [ QUIROZ Nro __] [ 68
Piso __] [ Depto __] [ Localidad __] [ RAWSON Código Postal __] [ 5425 Provincia __] [ SAN JUAN
Doc. identidad __] [ DNI 25830350 A.R.T __] [ PREVENCION Nacionalidad __] [ ARGENTINA Fecha de
nacimiento __] [ 25/04/1977 Categoría __] [ MEDIO OFICIAL Especialidad __] [ ALBAÑIL Fecha de
ingreso del trabajador __] [ 02/03/2026 Datos del empleador Apellido y nombre o Razón Social __] [
ECHEGARAY CONSTRUCCIONES S.A.S. CUIT __] [ 30-71630464-3 Domicilio __] [ AV. RIOJA (NORTE)`

test('la libreta se lee igual con los corchetes de los dos lados', () => {
  const a = libretaDelIeric(LIB_A)
  const b = libretaDelIeric(LIB_B)
  assert.equal(a.documento, '38218815')
  assert.equal(a.nacimiento, '1994-07-26')
  assert.equal(a.categoria, 'ayudante')
  assert.equal(a.ingreso, '2026-01-21')
  assert.equal(b.documento, '25830350')
  assert.equal(b.nacimiento, '1977-04-25')
  assert.equal(b.categoria, 'medio_oficial')
  assert.equal(b.ingreso, '2026-03-02')
})

test('EL DOMICILIO DE LA EMPRESA NO ES EL DE NADIE', () => {
  // La hoja repite Domicilio/Localidad/Provincia después de «Datos del empleador». Leer el segundo
  // le ponía AV. RIOJA (NORTE) 75 como domicilio propio a los sesenta trabajadores.
  assert.equal(libretaDelIeric(LIB_A).domicilio, 'CANDELARES MZA E CASA 03, SAN JUAN (5400)')
  assert.equal(libretaDelIeric(LIB_B).domicilio, 'QUIROZ 68, RAWSON (5425), SAN JUAN')
  assert.ok(!libretaDelIeric(LIB_A).domicilio.includes('RIOJA'))
})

test('un papel que no es la libreta devuelve null, no un objeto vacío', () => {
  assert.equal(libretaDelIeric(ALTA), null)
  assert.equal(libretaDelIeric(''), null)
})

test('el DNI está adentro del CUIL: son sus ocho dígitos del medio', () => {
  assert.equal(dniDelCuil('20-38218815-3'), '38218815')
  assert.equal(dniDelCuil('27432212950'), '43221295')
  // Con documento de menos de ocho cifras el CUIL rellena con ceros: no se publican.
  assert.equal(dniDelCuil('20-09123456-7'), '9123456')
  assert.equal(dniDelCuil('123'), null)
})

test('jefe de obra es un puesto, no una categoría del convenio', () => {
  assert.equal(categoriaDeConvenio('OFICIAL ESPECIALIZADO'), 'oficial_especializado')
  assert.equal(categoriaDeConvenio('Medio Oficial'), 'medio_oficial')
  assert.equal(categoriaDeConvenio('JEFE DE OBRA'), null)
})
