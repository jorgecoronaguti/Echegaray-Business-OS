// Tests de la lectura de la escala del convenio. Las filas son las REALES de _UOCRA_RAW al 31/07/2026.
import test from 'node:test'
import assert from 'node:assert/strict'
import { escalaDeRaw, mesDeRotulo, porcentajeDeRotulo, encabezadoDeAcuerdo, vigenciaMaxima, CATEGORIAS } from './uocra-raw-a-base.mjs'

// Tal como viene del Sheet: el mes con el porcentaje pegado y saltos de línea, y las cuatro filas
// siguientes con la columna de mes VACÍA.
const RAW = [
  ['Mes', 'Categoría', 'Por', 'Básico', 'Adic. Zona desfavorable'],
  ['', '', '', '', 'B', 'C', 'Austral', 'A'],
  ['Acuerdo Mayo 2026'],
  ['*(más Suma No Remunerativa)'],
  ['Agosto\n+1,9%', 'Oficial Especializado', 'Hora', '7420', '816', '3971', '7420', '7420'],
  ['', 'Oficial', '', '6348', '702', '4333', '6348', '6348'],
  ['', 'Medio Oficial', '', '5866', '636', '4440', '5866', '5866'],
  ['', 'Ayudante', '', '5399', '621', '4608', '5399', '5399'],
  ['', 'Sereno', 'Mes', '980858', '111861', '658924', '980858', '980858'],
  ['Julio\n+2%', 'Oficial Especializado', 'Hora', '6800', '748', '3639', '6800', '6800'],
  ['', 'Oficial', '', '5817', '643', '3970', '5817', '5817'],
  ['', 'Medio Oficial', '', '5375', '583', '4069', '5375', '5375'],
  ['', 'Ayudante', '', '4948', '569', '4223', '4948', '4948'],
  ['', 'Sereno', 'Mes', '898817', '102505', '603810', '898817', '898817'],
]

test('EL CASO DEL DUEÑO: agosto YA estaba en la réplica y la base no lo tenía', () => {
  const e = escalaDeRaw(RAW)
  const ago = e.filter((x) => x.vigencia === '2026-08-01')
  assert.equal(ago.length, 5, 'las cinco categorías de agosto')
  const por = (c) => ago.find((x) => x.categoria === c)
  assert.equal(por('Oficial Especializado').basico_hora, 7420)
  assert.equal(por('Oficial').basico_hora, 6348)
  assert.equal(por('Medio Oficial').basico_hora, 5866)
  assert.equal(por('Ayudante').basico_hora, 5399)
  // El Sereno se paga por MES: su valor NO va en básico por hora.
  assert.equal(por('Sereno (mensual)').mensual, 980858)
  assert.equal(por('Sereno (mensual)').basico_hora, null)
  assert.equal(vigenciaMaxima(e), '2026-08-01')
})

test('el mes se reconoce con el porcentaje pegado y los saltos de línea', () => {
  assert.equal(mesDeRotulo('Agosto\n+1,9%', { anioAcuerdo: 2026, mesAcuerdo: 5 }).vigencia, '2026-08-01')
  assert.equal(mesDeRotulo('Julio\n+2%', { anioAcuerdo: 2026, mesAcuerdo: 5 }).vigencia, '2026-07-01')
  assert.equal(mesDeRotulo('Febrero\n(1,8%\ns/Ene)', { anioAcuerdo: 2026, mesAcuerdo: 1 }).vigencia, '2026-02-01')
  assert.equal(porcentajeDeRotulo('Agosto\n+1,9%'), 1.9)
  assert.equal(porcentajeDeRotulo('Febrero\n(1,8%\ns/Ene)'), 1.8)
  assert.equal(porcentajeDeRotulo('Sereno'), null)
})

test('UN ACUERDO PUEDE FIJAR MESES DEL AÑO SIGUIENTE', () => {
  // Un acuerdo de mayo 2026 que fija "enero" habla de enero de 2027. Sin esto, la escala de enero
  // quedaría pisando la del enero que ya pasó — y el mes en curso leería un básico viejo.
  assert.equal(mesDeRotulo('Enero\n+1%', { anioAcuerdo: 2026, mesAcuerdo: 5 }).vigencia, '2027-01-01')
  assert.equal(mesDeRotulo('Diciembre\n+1%', { anioAcuerdo: 2026, mesAcuerdo: 5 }).vigencia, '2026-12-01')
})

test('las filas de encabezado de bloque NO son datos', () => {
  assert.deepEqual(encabezadoDeAcuerdo('Acuerdo Mayo 2026'), { mes: 5, anio: 2026, nombre: 'Acuerdo Mayo 2026' })
  assert.equal(encabezadoDeAcuerdo('Agosto\n+1,9%'), null)
  assert.equal(encabezadoDeAcuerdo('*(más Suma No Remunerativa)'), null)
  // Y no generan filas de escala.
  const e = escalaDeRaw(RAW)
  assert.ok(e.every((x) => x.categoria && x.vigencia), 'toda fila de salida tiene categoría y vigencia')
  assert.equal(e.length, 10, 'dos meses × cinco categorías, ni una fila de más')
})

test('cada escala queda con el acuerdo del que salió — origen trazable', () => {
  const e = escalaDeRaw(RAW)
  assert.ok(e.every((x) => x.acuerdo === 'Acuerdo Mayo 2026'), 'las dos vigencias vienen del mismo acuerdo')
  assert.equal(e.find((x) => x.vigencia === '2026-08-01').porcentaje, 1.9)
})

test('EL ORDEN DE LAS CATEGORÍAS IMPORTA: "Oficial" no puede comerse a "Oficial Especializado"', () => {
  // El match es por prefijo. Si 'Oficial' estuviera antes en el array, "Oficial Especializado" caería
  // en 'Oficial' y las dos categorías tendrían el mismo básico.
  assert.ok(CATEGORIAS.indexOf('Oficial Especializado') < CATEGORIAS.indexOf('Oficial'))
  const e = escalaDeRaw(RAW).filter((x) => x.vigencia === '2026-08-01')
  assert.notEqual(e.find((x) => x.categoria === 'Oficial Especializado').basico_hora,
    e.find((x) => x.categoria === 'Oficial').basico_hora)
})

test('un pegado vacío o sin acuerdo no inventa nada', () => {
  assert.deepEqual(escalaDeRaw([]), [])
  assert.deepEqual(escalaDeRaw([['Agosto\n+1,9%', 'Oficial', 'Hora', '7420']]).length, 1,
    'sin encabezado de acuerdo usa el año en curso, pero no se pierde la fila')
  assert.deepEqual(escalaDeRaw([['Acuerdo Mayo 2026'], ['', 'Categoría rara', 'Hora', '999']]), [])
})
