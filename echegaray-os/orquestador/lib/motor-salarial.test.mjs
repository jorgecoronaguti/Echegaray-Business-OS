// LO QUE SE PRUEBA ACÁ SON LOS CUATRO DEFECTOS DE LA PROYECCIÓN ANTERIOR, UNO POR UNO.
//
//   A2 · la base salía de la quincena EN CURSO (un día de horas, $262.800) y de un promedio de horas
//        del año entero (6,7 h contra una jornada de 9).
//   A3 · doble conteo de inflación en la primera quincena: el Σ$/hora ya era del mes y el factor
//        acumulado volvía a aplicarle el aumento de ese mes.
//   A8 · el mes de transición se rompía: la parte cargada de la quincena en curso se sumaba con una
//        quincena entera proyectada.
//   B3 · el "escalón que viene" resolvía a 2025.
//
// Los tres primeros mueren POR CONSTRUCCIÓN y esto lo fija: si alguien vuelve a anclar la base en el
// último bloque, o a arrancar el cuadro de escalones después del mes base, estos tests se ponen rojos.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ultimaQuincenaCerrada, categoriasDelBloque, personasDelBloque, mesesDelMotor,
  filasPlantel, filasEscalon, formulaSigmaDelMes, formulaFactorDelMes, formulaHorasPorPersona,
  parametroAumento, PARAMETRO_MESES_BASE, RANGO_AUMENTO, RANGO_MESES_BASE, lineaEstadoReplica,
} from './motor-salarial.mjs'
import { parsearAcuerdos } from './uocra-acuerdos.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

const grupo = (rotulo, [oe, of, mo, ay, se]) => [
  [rotulo, 'Oficial Especializado', 'Hora', String(oe), '', '', String(oe), String(oe)],
  ['', 'Oficial', '', String(of)], ['', 'Medio Oficial', '', String(mo)],
  ['', 'Ayudante', '', String(ay)], ['', 'Sereno', 'Mes', String(se)],
]
const { escalones } = parsearAcuerdos([
  ['Acuerdo Mayo 2026'],
  ...grupo('Agosto\n+1,9%', [7420, 6348, 5866, 5399, 980858]),
  ...grupo('Julio\n+2%', [6800, 5817, 5375, 4948, 898817]),
])

// Dos bloques del espejo: uno cerrado (julio) y uno en curso (agosto, con un día de horas).
const bloques = [
  { filaFecha: 494, inicio: 495, fin: 510 },   // cerrado: hasta 31/07
  { filaFecha: 520, inicio: 521, fin: 536 },   // en curso: hasta 15/08
]
const ultimoDiaDe = (b) => (b.inicio === 495 ? new Date(2026, 6, 31) : new Date(2026, 7, 15))
const HOY = new Date(2026, 7, 6)

test('A2 · LA BASE ES LA ÚLTIMA QUINCENA CERRADA, NO LA QUE SE ESTÁ CARGANDO', () => {
  const c = ultimaQuincenaCerrada(bloques, ultimoDiaDe, HOY)
  assert.equal(c.bloque.inicio, 495, 'tomó el bloque en curso: es el defecto que se vino a arreglar')
  assert.equal(c.indice, 0)
  assert.equal(c.hasta.getMonth(), 6)
})

test('A2 · si TODAS las quincenas están abiertas, devuelve null en vez de adivinar', () => {
  assert.equal(ultimaQuincenaCerrada(bloques, ultimoDiaDe, new Date(2026, 5, 1)), null)
})

test('el plantel se abre por la columna D del espejo — la que no tenía consumidores', () => {
  const grid = []
  const poner = (fila, cat, nombre) => { grid[fila - 1] = ['1', nombre, '45000', cat] }
  poner(495, 'OF', 'Aguero'); poner(496, 'A', 'Alaniz'); poner(497, 'A M', 'Gonzalez')
  poner(498, 'OF', 'Rosales'); poner(499, 'OF M', 'Tello')
  const b = { inicio: 495, fin: 499 }
  assert.deepEqual(categoriasDelBloque(grid, b), ['OF', 'A', 'A M', 'OF M'], 'sin repetir y en el orden en que aparecen')
  assert.equal(personasDelBloque(grid, b), 5)
})

test('A3 · EL MES BASE ABRE EL CUADRO CON FACTOR 1: no hay dónde escribir el doble aumento', () => {
  const meses = mesesDelMotor(new Date(2026, 6, 31), [
    { desde: new Date(2026, 7, 4), hasta: new Date(2026, 7, 15) },
    { desde: new Date(2026, 8, 1), hasta: new Date(2026, 8, 15) },
  ])
  assert.equal(meses[0].periodo, '2026-07', 'el cuadro tiene que arrancar en el mes de la última quincena cerrada')
  const esc = filasEscalon({ meses, escalones, filaInicio: 20, celdaSigmaBase: '$C$18' })
  const base = esc.filas[1]
  // Columna E = factor sobre la base. En la primera fila es C/C de la MISMA celda: 1 exacto.
  assert.equal(base[4], `=IFERROR($C${esc.f0}/$C$${esc.f0};"")`)
  assert.equal(base[3], VACIO, 'la primera fila no puede declarar un "sube en el mes"')
  assert.match(String(base[7]), /factor 1,0000/)
})

test('los meses SIN acuerdo publicado se encadenan con el parámetro, no con el IPC', () => {
  const meses = mesesDelMotor(new Date(2026, 6, 31), [{ desde: new Date(2026, 8, 1), hasta: new Date(2026, 8, 15) }])
  const esc = filasEscalon({ meses, escalones, filaInicio: 20, celdaSigmaBase: '$C$18' })
  const sep = esc.filas.find((f) => String(f[1]) === 'sin acuerdo publicado')
  assert.ok(sep, 'septiembre 2026 no está publicado: tiene que salir rotulado como estimado')
  assert.match(String(sep[2]), new RegExp(`\\*\\(1\\+${RANGO_AUMENTO}\\)`))
  assert.match(String(sep[7]), /⚠ estimado/)
  // Y NINGUNA celda del cuadro puede citar el bloque de inflación de Parámetros: son series distintas.
  const todo = esc.filas.flat().map(String).join(' ')
  assert.doesNotMatch(todo, /Par[áa]metros'!\$[AC]\$7[0-9]/, 'el motor está leyendo el bloque de IPC')
})

test('B3 · el cuadro no puede citar un mes de otro año: las filas las resuelve el parser', () => {
  const meses = mesesDelMotor(new Date(2026, 6, 31), [{ desde: new Date(2026, 7, 1), hasta: new Date(2026, 7, 15) }])
  const esc = filasEscalon({ meses, escalones, filaInicio: 20, celdaSigmaBase: '$C$18' })
  const todo = esc.filas.flat().map(String).join(' ')
  // Ningún MATCH por nombre de mes: ésa era la vía por la que "septiembre*" caía en 2025.
  assert.doesNotMatch(todo, /MATCH\(TEXT\(/, 'volvió el MATCH por nombre de mes sobre la réplica')
  // Y el básico del mes es un INDEX a una FILA concreta, la que devolvió el parser.
  const ago = esc.filas.find((f) => /Agosto/.test(String(f[1])))
  assert.match(String(ago[2]), /INDEX\('_UOCRA_RAW'!\$D\$1:\$D;\d+\)/)
})

test('el cuadro de escalones cubre el mes base de Oficina aunque vaya atrasada', () => {
  // La planilla de administración va un mes detrás. Si su mes no está en el cuadro, el MATCH no lo
  // encuentra, el IFERROR devuelve 1 y los sueldos se proyectan SIN un solo aumento, en silencio.
  const meses = mesesDelMotor(new Date(2026, 7, 15), [{ desde: new Date(2026, 8, 1), hasta: new Date(2026, 8, 15) }], [new Date(2026, 5, 30)])
  assert.equal(meses[0].periodo, '2026-06')
  assert.deepEqual(meses.map((m) => m.periodo), ['2026-06', '2026-07', '2026-08', '2026-09'], 'sin huecos: el factor se encadena')
})

test('Oficina se ajusta RELATIVO a su propio mes base, no al de obra', () => {
  const f = formulaFactorDelMes('EOMONTH(DATE(2026;10;1);0)', { f0: 20, f1: 25 }, 'EOMONTH(DATE(2026;7;1);0)')
  assert.match(f, /\/INDEX/, 'sin la división le aplica a un sueldo de julio el aumento acumulado desde junio')
  const sinBase = formulaFactorDelMes('EOMONTH(DATE(2026;10;1);0)', { f0: 20, f1: 25 })
  assert.doesNotMatch(sinBase, /\/INDEX/)
})

test('A2 · las horas por persona se miden en una VENTANA, no sobre el año entero', () => {
  const f = formulaHorasPorPersona({ total: 'K', sigma: 'L', dias: 'D', hasta: 'B' }, 100, 115)
  assert.match(f, new RegExp(`EDATE\\(TODAY\\(\\);-${RANGO_MESES_BASE}\\)`))
  assert.match(f, /<=TODAY\(\)/, 'una quincena abierta no puede entrar en la medición')
  // Y es Σ(plata) ÷ Σ($/hora × días): ponderado. El AVERAGE(días) de antes no ponderaba.
  assert.doesNotMatch(f, /AVERAGE/)
  assert.match(f, /SUMPRODUCT\(.*N\(\$L\$100:\$L\$115\)\*N\(\$D\$100:\$D\$115\)\)/)
})

test('la Σ $/hora de una quincena se busca por SU mes y devuelve vacío si no está', () => {
  const f = formulaSigmaDelMes('A35', { f0: 25, f1: 30 })
  assert.match(f, /MATCH\(EOMONTH\(A35;0\);\$A\$25:\$A\$30;0\)/)
  // Vacío, no cero: un cero se multiplica por los días y dice "$0 de jornales".
  assert.match(f, /;""\)$/)
})

test('la columna "Equivale a (convenio)" es DEL DUEÑO: nunca lleva el centinela', () => {
  const p = filasPlantel({
    hoja: '_J_OBREROS', bloque: { inicio: 495, fin: 510 }, categorias: ['OF', 'A'],
    personas: 16, filaInicio: 10, escalonVigente: escalones[0],
  })
  for (let i = 1; i <= 2; i++) {
    assert.equal(p.filas[i][4], '', `fila ${i}: con el centinela, la corrida siguiente le borra la categoría que cargó`)
  }
  // Y el canario del bloque del espejo, que es lo que avisa si la corrida se salteó.
  assert.match(String(p.filas[p.filas.length - 1][7]), /el bloque del espejo/)
  assert.match(String(p.filas[p.filas.length - 1][7]), /16 obreros/)
})

test('el parámetro del aumento declara su derivación y dice que NO es el IPC', () => {
  const p = parametroAumento(escalones)
  assert.equal(p.rango, RANGO_AUMENTO)
  assert.match(p.nota, /NO ES EL IPC/)
  assert.match(p.nota, /A CONFIRMAR POR EL DUEÑO/)
  assert.match(p.nota, /MEDIDO sobre el básico/)
  // El valor propuesto es el medido sobre básicos (~9% acá), no el del rótulo (1,9%).
  assert.ok(p.valor > 0.05, `propuso ${p.valor}: está usando el % del rótulo`)
  // Sin acuerdos no inventa una medición: cae al rótulo y lo dice.
  const vacio = parametroAumento([])
  assert.equal(vacio.valor, 0.019)
  assert.match(vacio.nota, /sin acuerdos suficientes/)
  assert.equal(PARAMETRO_MESES_BASE.rango, RANGO_MESES_BASE)
})

test('el estado de la réplica llega a la pestaña como un sub-ítem, no como una nota escondida', () => {
  const l = lineaEstadoReplica(escalones, new Date(2026, 9, 1))
  assert.match(l, /^ {3}· /)
  assert.match(l, /quedó vencida/)
})
