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
  parametroParitaria, PARAMETRO_MESES_BASE, RANGO_PARITARIA, RANGO_MESES_BASE, lineaEstadoReplica,
  formulaConvenioPendiente,
} from './motor-salarial.mjs'
import { ULTIMO_TRAMO } from './uocra-paritaria.mjs'
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
  // Columna E = factor sobre la base. En la primera fila es 1 LITERAL: no hay fórmula que pueda
  // devolver otra cosa, así que no existe la celda donde escribir el doble aumento.
  assert.equal(base[4], '=1')
  assert.equal(base[3], VACIO, 'la primera fila no puede declarar un "sube en el mes"')
  assert.match(String(base[7]), /factor 1,0000/)
})

test('EL DRIVER ES EL TRAMO DE LA PARITARIA, NO EL COCIENTE DE BÁSICOS PUBLICADOS', () => {
  // ═══ EL DEFECTO (07/08) ═══
  // La columna E era `$C{r}/$C${f0}` — el cociente de básicos. Entre julio y agosto eso da +9,11%
  // mientras el acuerdo firmado dice +1,9%: la diferencia son sumas no remunerativas que el básico
  // absorbió. Ese 9,11% gobernaba las TRES proyecciones, incluidos sueldos de Oficina que no tienen
  // básico de convenio. Si alguien revierte el driver al cociente, este test se pone rojo.
  const meses = mesesDelMotor(new Date(2026, 6, 31), [{ desde: new Date(2026, 7, 1), hasta: new Date(2026, 7, 15) }])
  const esc = filasEscalon({ meses, escalones, filaInicio: 20, celdaSigmaBase: '$C$18' })
  const ago = esc.filas.find((f) => /Agosto/.test(String(f[1])))
  const r = esc.f0 + 1
  assert.equal(String(ago[4]), `=IFERROR($E${r - 1}*(1+$D${r});"")`, 'el factor volvió a salir de los básicos')
  // Y el tramo se LEE del rótulo de la réplica, con la fila ya resuelta por el parser: si mañana se
  // pega un acuerdo nuevo, la pestaña se mueve sola y sin tocar código.
  assert.match(String(ago[3]), /REGEXEXTRACT\(INDEX\('_UOCRA_RAW'!\$A\$1:\$A;\d+\)/)
  assert.match(String(ago[3]), new RegExp(`;${RANGO_PARITARIA}\\)$`), 'sin % en el rótulo tiene que caer al parámetro')
  assert.match(String(ago[7]), /✓ acuerdo firmado/)
})

test('los meses SIN acuerdo firmado repiten el último tramo, y la fila dice que es PROYECCIÓN', () => {
  const meses = mesesDelMotor(new Date(2026, 6, 31), [{ desde: new Date(2026, 8, 1), hasta: new Date(2026, 8, 15) }])
  const esc = filasEscalon({ meses, escalones, filaInicio: 20, celdaSigmaBase: '$C$18' })
  const sep = esc.filas.find((f) => String(f[1]) === 'sin acuerdo')
  assert.ok(sep, 'septiembre 2026 no está publicado: tiene que salir rotulado como proyección')
  assert.equal(String(sep[3]), `=${RANGO_PARITARIA}`, 'el mes sin acuerdo tiene que tomar el parámetro, no un número')
  assert.match(String(sep[2]), /\*\(1\+\$D\d+\)/, 'el piso estimado se encadena con el MISMO tramo que el factor')
  assert.match(String(sep[6]), /proyección/)
  assert.match(String(sep[7]), /⚠ proyección/, 'el estado dice que no hay acuerdo, al ancho de la columna')
  // Y NINGUNA celda del cuadro puede citar el bloque de inflación de Parámetros: son series distintas.
  const todo = esc.filas.flat().map(String).join(' ')
  assert.doesNotMatch(todo, /Par[áa]metros'!\$[AC]\$7[0-9]/, 'el motor está leyendo el bloque de IPC')
})

test('A3 bis · CUANDO OFICINA ANCLA EL CUADRO, OBRA NO SE COME UN MES DE AUMENTO DE MÁS', () => {
  // ═══ EL DEFECTO ADYACENTE, ENCONTRADO AL REESCRIBIR LA COLUMNA (07/08) ═══
  //
  // El cuadro 1.2 arranca en el mes MÁS VIEJO de los tres bloques, y ése suele ser el de Oficina, que
  // va un mes atrasada. La Σ $/hora, en cambio, es la del plantel de la última quincena cerrada DE
  // OBRA. Multiplicarla por el factor medido desde el mes de Oficina le agrega a obra un aumento que
  // el Σ ya tiene adentro — y el error se arrastra a las diez quincenas siguientes sin dar error: un
  // total más alto y perfectamente plausible.
  const meses = mesesDelMotor(new Date(2026, 7, 15), [{ desde: new Date(2026, 8, 1), hasta: new Date(2026, 8, 15) }], [new Date(2026, 5, 30)])
  assert.equal(meses[0].periodo, '2026-06', 'el ancla del cuadro es el mes de Oficina, no el de obra')
  const esc = filasEscalon({ meses, escalones, filaInicio: 20, celdaSigmaBase: '$C$18', periodoBase: '2026-08' })
  const rBase = esc.f0 + meses.findIndex((m) => m.periodo === '2026-08')
  for (const [i, m] of meses.entries()) {
    assert.equal(String(esc.filas[i + 1][5]), `=IFERROR($C$18*$E${esc.f0 + i}/$E$${rBase};"")`,
      `${m.periodo}: la Σ $/hora no está anclada en el mes base de OBRA`)
  }
  // Sin `periodoBase` cae a la primera fila del cuadro: es el comportamiento de antes, no una sorpresa.
  const sinBase = filasEscalon({ meses, escalones, filaInicio: 20, celdaSigmaBase: '$C$18' })
  assert.match(String(sinBase.filas[1][5]), new RegExp(`/\\$E\\$${sinBase.f0};`))
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
  // El mensaje se acortó el 13/08 (rechazo del diseño de la pestaña): 164 caracteres en una columna
  // del MEDIO desparramaban la fila sobre las seis siguientes. Lo que este test cuida no cambió —que
  // el canario exista y que compare contra la dotación real— sólo que las 16 personas ahora se leen
  // donde se MIDEN, en la condición del IF, y no repetidas en el texto de alarma.
  assert.match(String(p.filas[p.filas.length - 1][7]), /el espejo se movió/)
  assert.match(String(p.filas[p.filas.length - 1][7]), /=16;/, 'el canario dejó de contrastar la dotación')
})

test('EL PARÁMETRO ES EL TRAMO DE PARITARIA, NO EL 5,21% MEDIDO SOBRE BÁSICOS', () => {
  // El dueño resolvió el "⚠ A VERIFICAR" del parámetro viejo: el driver es el % de UOCRA. El valor
  // medido sobre básicos daba 5,21%/mes y extrapolaba, mes a mes hasta diciembre, una absorción de
  // sumas no remunerativas que ya había ocurrido. Si alguien vuelve a proponerlo, esto se pone rojo.
  const p = parametroParitaria(escalones)
  assert.equal(p.rango, RANGO_PARITARIA)
  assert.equal(p.valor, 0.019, `propuso ${p.valor}: volvió a medir sobre el básico publicado`)
  assert.ok(p.valor < 0.05, 'el parámetro volvió a un promedio de básicos')
  assert.match(p.nota, /NO ES EL IPC/)
  assert.match(p.nota, /PROYECCIÓN, no acuerdo/)
  // EL LÍMITE VIAJA CON EL NÚMERO. Las sumas no remunerativas no las tenemos: la proyección es un
  // piso, y eso se lee al lado del valor, no en un informe que nadie abre.
  assert.match(p.nota, /LÍMITE DECLARADO/)
  assert.match(p.nota, /sumas no remunerativas/)
  // Y gobierna los tres bloques: es la orden del dueño y tiene que estar escrita donde se cambia.
  assert.match(p.nota, /Obra, Oficina y Dirección/)
  // Sin réplica no inventa nada: cae al último tramo verificado.
  assert.equal(parametroParitaria([]).valor, ULTIMO_TRAMO)
  assert.equal(PARAMETRO_MESES_BASE.rango, RANGO_MESES_BASE)
})

test('EL RANGO CAMBIA DE NOMBRE: si no, la fila vieja del Sheet sigue gobernando con el 5,21%', () => {
  // `asegurarParametros` no pisa el valor de una fila que ya existe —es la pestaña del dueño— así que
  // cambiarle el número al parámetro viejo desde el código era imposible. El nombre nuevo es lo que
  // fuerza una fila nueva. Si alguien lo revierte, el 5,21% vuelve a estar vivo sin cambiar una línea.
  assert.equal(RANGO_PARITARIA, 'PARITARIA_UOCRA_PROYECTADA')
  assert.notEqual(RANGO_PARITARIA, 'AUMENTO_SALARIAL_ESPERADO')
})

test('EL CONTROL CONTRA EL CONVENIO YA NO ESPERA UNA CARGA MANUAL', () => {
  // Hasta el 07/08 la columna «Convenio» estaba vacía, el MATCH no encontraba nada y las cuatro filas
  // decían "—": el bloque que abre la pestaña no podía contestar su única pregunta. El dueño declaró
  // la equivalencia y ahora el default la aplica — sin escribir en la celda, que sigue siendo suya.
  const p = filasPlantel({
    hoja: '_J_OBREROS', bloque: { inicio: 495, fin: 510 }, categorias: ['OF', 'A M'],
    personas: 16, filaInicio: 10, escalonVigente: escalones[0],
  })
  assert.deepEqual(p.equivalencias, [['OF', 'Oficial'], ['A M', 'Ayudante']])
  const r = p.fPrimera
  assert.match(String(p.filas[1][5]), new RegExp(`MATCH\\(IF\\(\\$E${r}="";"Oficial";\\$E${r}\\)`),
    'el básico del convenio volvió a depender de que el dueño escriba la celda')
  assert.doesNotMatch(String(p.filas[1][7]), /"—"/, 'con equivalencia declarada la fila ya tiene respuesta')
  // Una categoría desconocida NO se adivina: vuelve al "—" y la línea de arriba la nombra.
  const raro = filasPlantel({
    hoja: '_J_OBREROS', bloque: { inicio: 495, fin: 510 }, categorias: ['ZZ'],
    personas: 1, filaInicio: 10, escalonVigente: escalones[0],
  })
  assert.deepEqual(raro.equivalencias, [['ZZ', null]])
  assert.match(String(raro.filas[1][7]), /"—"/)
  // La línea pasó de 180 caracteres a un rótulo (13/08). Sigue diciendo LAS DOS COSAS que decide:
  // cuál categoría no tiene equivalente —marcada con ⚠, porque el control queda ciego para ella— y
  // contra qué escala compara cada una. Lo que se fue es "si escribís otra en «Convenio», manda la
  // tuya", que ahora vive en el encabezado de esa columna.
  assert.match(formulaConvenioPendiente(11, 11, raro.equivalencias), /⚠.*ZZ/)
  assert.match(formulaConvenioPendiente(11, 12, p.equivalencias), /OF→Oficial · A M→Ayudante/)
})

test('el estado de la réplica llega a la pestaña como un sub-ítem, no como una nota escondida', () => {
  const l = lineaEstadoReplica(escalones, new Date(2026, 9, 1))
  assert.match(l, /^ {3}· /)
  assert.match(l, /vencida/i)
})
