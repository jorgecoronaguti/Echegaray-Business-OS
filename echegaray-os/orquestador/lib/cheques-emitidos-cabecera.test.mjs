// LA CABECERA DE "Cheques Emitidos", VERIFICADA EN FRÍO.
//
// Lo que estos tests atajan es lo que NO se ve mirando la pestaña:
//   1. Que la banda escriba algo que rompa CAJA!B14 o CAJA!H15 — los dos leen DESDE LA FILA 2, o sea
//      desde adentro de la banda. Es el único defecto de acá que se lleva plata puesta.
//   2. Que los seis tramos del resumen dejen un hueco o se pisen. Con hueco, el total miente para
//      abajo; con solapamiento, para arriba. En los dos casos el "control" cierra igual si se calcula
//      sobre las mismas filas, así que mirar la pestaña no alcanza.
//   3. Que una fórmula lleve coma. En es-AR la coma es el separador DECIMAL: parte la fórmula.

import test from 'node:test'
import assert from 'node:assert/strict'
import { BANDA, FILA_DATO0 } from './cheques-emitidos-geometria.mjs'
import {
  COLS, FILAS, COL_SELECTOR, SEMANAS, DIAS, SELECTOR_DEFECTO, SEL, TRAMOS, COMPROMETIDO,
  bandaFilas, celdaDelDia, selectorAConservar, mesesDelSelector, validacionDelSelector,
  reglasDelCalendario, indicesPropios,
} from './cheques-emitidos-cabecera.mjs'

const banda = bandaFilas()
const celda = (fila, col) => String(banda[fila - 1][col] ?? '')
const I = `$I$${FILA_DATO0}:$I`
const K = `$K$${FILA_DATO0}:$K`

test('la banda mide exactamente BANDA filas de COLS columnas y termina en REGISTRO', () => {
  assert.equal(banda.length, BANDA)
  assert.ok(banda.every((f) => f.length === COLS), 'alguna fila no tiene 13 columnas')
  assert.equal(celda(FILAS.registro, 0), 'REGISTRO')
  assert.equal(FILAS.registro, BANDA, 'REGISTRO tiene que ser la última fila de la banda')
  assert.equal(celda(FILAS.titulo, 0), 'CHEQUES EMITIDOS')
})

// ═══ 1. EL CONTRATO CON CAJA, QUE ESTÁ CONGELADA ═══
//
//   CAJA!B14 = SUMIFS('Cheques Emitidos'!$F$2:$F ; $K$2:$K;"SI" ; $I$2:$I;">"&fecha)
//   CAJA!H15 = SUMPRODUCT(($M$2:$M$400="⚠ sin N° de comprobante — no se puede cruzar") * … * F…)
//
// Las dos arrancan en la fila 2 y las dos filtran ANTES de mirar F. Mientras la banda no diga "SI" en
// K ni lleve esa marca en M, puede poner números donde quiera — y los pone: el jueves del calendario
// y el indicador de 30 días caen en la columna F.
const MARCA_H15 = '⚠ sin N° de comprobante — no se puede cruzar'

test('ninguna celda de la banda dice "SI" en la columna K ni lleva la marca de H15 en la M', () => {
  banda.forEach((fila, i) => {
    const k = String(fila[10] ?? '').trim().toUpperCase()
    assert.notEqual(k, 'SI', `la fila ${i + 1} dice "SI" en la columna K: CAJA!B14 la sumaría como un cheque debitado`)
    assert.ok(!String(fila[12] ?? '').includes(MARCA_H15), `la fila ${i + 1} lleva la marca de CAJA!H15 en la columna M`)
  })
  // Y por si alguien mueve una celda de columna: la marca no puede aparecer en NINGÚN lado de la banda.
  assert.ok(!JSON.stringify(banda).includes(MARCA_H15))
})

test('la banda SÍ escribe en la columna F, y eso está declarado', () => {
  // La versión anterior tenía la regla "la banda nunca escribe en F". Se levantó a propósito: el
  // calendario ocupa B..H. Este test existe para que el cambio sea explícito — si alguien vuelve a la
  // regla vieja, que sea decidiéndolo, no por accidente.
  const enF = banda.filter((f) => String(f[5] ?? '') !== '').length
  assert.ok(enF > 0, 'si la banda dejó de usar la columna F, revisar si hace falta esta excepción')
})

// ═══ 2. LOS SIETE INDICADORES ═══

test('los siete indicadores están, en orden, y sus siete valores son fórmula', () => {
  assert.deepEqual(banda[FILAS.rotulosKpi - 1].slice(0, 7),
    ['DISPONIBLE', 'COMPROMETIDO', 'PROYECTADO', 'VENCIDO', 'PRÓX. 7 DÍAS', 'PRÓX. 30 DÍAS', 'MAYOR VENC. DIARIO'])
  for (let c = 0; c < 7; c++) {
    assert.ok(celda(FILAS.kpi, c).startsWith('='), `el indicador ${c} no es fórmula: "${celda(FILAS.kpi, c)}"`)
  }
  assert.equal(banda[FILAS.kpi - 1].slice(7).join(''), '', 'la fila de indicadores no puede tener nada más a la derecha')
})

test('el comprometido de arriba es LA definición, no una copia parecida', () => {
  assert.equal(celda(FILAS.kpi, 1), `=${COMPROMETIDO}`)
  assert.equal(celda(FILAS.kpi, 3), `=SUMPRODUCT((UPPER(${K})<>"SI")*${TRAMOS.vencido}*IF(ISNUMBER($F$${FILA_DATO0}:$F);$F$${FILA_DATO0}:$F;0))`,
    'VENCIDO de arriba tiene que ser exactamente el tramo VENCIDO de abajo')
})

test('la plata disponible se cita POR NOMBRE — ni por celda ni por rótulo', () => {
  // Un match exacto contra un texto es un contrato escrito en el idioma equivocado: cuando el
  // rediseño de CAJA le agregó tres palabras al rótulo, la celda quedó gritando "⚠ no está en CAJA"
  // sobre una CAJA que tenía su total perfectamente calculado. Un nombre sobrevive al rótulo.
  const f = celda(FILAS.kpi, 0)
  assert.ok(f.includes('CAJA_TOTAL_DISPONIBLE'))
  assert.doesNotMatch(f, /MATCH\(/)
  assert.doesNotMatch(f, /CAJA!\$?[A-Z]/)
})

test('el proyectado es disponible menos comprometido, apuntado a sus propias celdas', () => {
  assert.equal(celda(FILAS.kpi, 2), `=A${FILAS.kpi}-B${FILAS.kpi}`)
})

// ═══ 3. LOS TRAMOS SON UNA PARTICIÓN ═══
//
// No se prueba mirando el texto: se EVALÚAN. El traductor de abajo entiende exactamente la gramática
// que genera el módulo y ROMPE ante cualquier otra — un traductor que ignora lo que no entiende
// convierte este test en un adorno.

const FIN_MES_TXT = 'MAX(TODAY()+8;EOMONTH(TODAY();0)+1)'

function valorDe(expr, { hoy, finMes }) {
  const t = expr.trim()
  if (t === 'TODAY()') return hoy
  if (t === FIN_MES_TXT) return finMes
  const m = /^TODAY\(\)\+(\d+)$/.exec(t)
  if (m) return hoy + Number(m[1])
  throw new Error(`el test no sabe evaluar el borde "${t}" — si cambió la gramática, actualizar el traductor`)
}

const COMPARA = { '<': (a, b) => a < b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '>=': (a, b) => a >= b, '=': (a, b) => a === b }

/** ¿Este tramo se lleva un cheque con esta fecha de pago? `fecha === null` = sin fecha cargada. */
function cumple(cond, fecha, ctx) {
  const esSinFecha = cond.includes('NOT(ISNUMBER(')
  if (esSinFecha) return fecha === null
  assert.ok(cond.includes(`ISNUMBER(${I})`), `el tramo no exige que la fecha sea un número: ${cond}`)
  if (fecha === null) return false
  const cs = [...cond.matchAll(/\(\$I\$\d+:\$I(<=|>=|<|>|=)(.+?)\)(?=\*|$)/g)]
  assert.ok(cs.length, `el tramo no tiene ningún borde reconocible: ${cond}`)
  return cs.every(([, op, ex]) => COMPARA[op](fecha, valorDe(ex, ctx)))
}

for (const [nombre, hoy, finMes] of [['mes largo', 1000, 1020], ['fin de mes', 1000, 1008]]) {
  test(`los seis tramos son una partición exacta de la recta del tiempo (${nombre})`, () => {
    const ctx = { hoy, finMes }
    const fechas = [null, hoy - 40, hoy - 1, hoy, hoy + 1, hoy + 6, hoy + 7, hoy + 8, finMes - 1, finMes, finMes + 1, finMes + 200]
    for (const f of fechas) {
      const cae = Object.entries(TRAMOS).filter(([, c]) => cumple(c, f, ctx)).map(([k]) => k)
      assert.equal(cae.length, 1, `la fecha ${f === null ? 'sin cargar' : f - hoy + ' días desde hoy'} cae en ${cae.length} tramos (${cae.join(', ')})`)
    }
  })
}

test('"próximos 7 días" de arriba es exactamente "hoy" + "próximos 7 días" de abajo', () => {
  // Dos números con el mismo nombre y distinto criterio en la misma pestaña es peor que no tenerlos.
  const ctx = { hoy: 1000, finMes: 1020 }
  const indicador = /=SUMPRODUCT\(\(UPPER\(.+?\)<>"SI"\)\*(.+)\*IF\(ISNUMBER/.exec(celda(FILAS.kpi, 4))[1]
  for (let d = -3; d <= 12; d++) {
    const f = ctx.hoy + d
    assert.equal(cumple(indicador, f, ctx), cumple(TRAMOS.hoy, f, ctx) || cumple(TRAMOS.siete, f, ctx),
      `día ${d}: el indicador de 7 días y el resumen no coinciden`)
  }
})

test('el total del resumen suma los seis tramos y ni una fila más', () => {
  const orden = [FILAS.vencido, FILAS.hoy, FILAS.siete, FILAS.restoMes, FILAS.posteriores, FILAS.sinFecha]
  orden.forEach((f, i) => assert.equal(f, FILAS.vencido + i, 'los seis tramos tienen que ir pegados: un renglón en el medio lo comería el SUM'))
  assert.equal(celda(FILAS.total, 1), `=SUM(B${FILAS.vencido}:B${FILAS.sinFecha})`)
  assert.equal(celda(FILAS.total, 2), `=SUM(C${FILAS.vencido}:C${FILAS.sinFecha})`)
  assert.match(celda(FILAS.total, 0), /^⇒ /, 'un total lleva el marcador de total de la gramática del repo')
})

test('cada tramo publica su monto Y su cantidad, y los dos salen del mismo filtro', () => {
  for (const [clave, fila] of [['vencido', FILAS.vencido], ['hoy', FILAS.hoy], ['siete', FILAS.siete],
    ['restoMes', FILAS.restoMes], ['posteriores', FILAS.posteriores], ['sinFecha', FILAS.sinFecha]]) {
    assert.ok(celda(fila, 0).trim(), `el tramo ${clave} se quedó sin rótulo`)
    assert.ok(celda(fila, 1).includes(TRAMOS[clave]), `el monto del tramo ${clave} no usa su condición`)
    assert.ok(celda(fila, 2).includes(TRAMOS[clave]), `la cantidad del tramo ${clave} no usa su condición`)
    assert.ok(celda(fila, 1).includes('UPPER(') && celda(fila, 2).includes('UPPER('), `el tramo ${clave} no filtra los debitados`)
  }
})

// ═══ 4. EL CALENDARIO ═══

test('las 42 celdas del calendario cuelgan del selector de mes y del registro', () => {
  const cal0 = FILAS.semana0
  for (let s = 0; s < SEMANAS; s++) {
    for (let d = 0; d < DIAS; d++) {
      const f = celda(cal0 + s, COL_SELECTOR + d)
      assert.ok(f.startsWith('=LET('), `la celda ${s},${d} no es la fórmula del día`)
      assert.ok(f.includes(`DATE(YEAR(${SEL});MONTH(${SEL});1)`), `la celda ${s},${d} no arma el mes desde el selector`)
      assert.ok(f.includes(I), `la celda ${s},${d} no mira la fecha de pago del registro`)
      assert.ok(f.includes(`${K};"SI"`), `la celda ${s},${d} no descuenta los cheques ya debitados`)
    }
  }
})

test('la primera celda es el lunes de la semana del día 1, y los 42 días corren de a uno', () => {
  assert.equal(celda(FILAS.semana0, COL_SELECTOR), celdaDelDia(0))
  assert.match(celdaDelDia(0), /dia_;ini_-WEEKDAY\(ini_;3\)\+0;/, 'la semana tiene que arrancar el lunes (WEEKDAY tipo 3)')
  // El día 41 es el último de la sexta semana: si el paso no fuera de uno, el calendario saltearía días.
  assert.equal(celda(FILAS.semana0 + SEMANAS - 1, COL_SELECTOR + DIAS - 1), celdaDelDia(SEMANAS * DIAS - 1))
  const ns = []
  for (let s = 0; s < SEMANAS; s++) for (let d = 0; d < DIAS; d++) ns.push(Number(/\+(\d+);mto_/.exec(celda(FILAS.semana0 + s, COL_SELECTOR + d))[1]))
  assert.deepEqual(ns, ns.map((_, i) => i))
})

test('el encabezado de días arranca en lunes y ocupa las siete columnas del calendario', () => {
  assert.deepEqual(banda[FILAS.diasSemana - 1].slice(COL_SELECTOR, COL_SELECTOR + DIAS), ['L', 'M', 'M', 'J', 'V', 'S', 'D'])
})

test('un selector vacío deja el calendario en blanco en vez de mostrar diciembre de 1899', () => {
  // DATE(YEAR(0);MONTH(0);1) es una fecha perfectamente válida y completamente falsa.
  assert.ok(celdaDelDia(5).includes(`N(${SEL})=0`))
})

// ═══ 5. EL SELECTOR DE MES ES UNA CELDA DEL DUEÑO ═══

test('el selector: lo que el dueño eligió manda, y sólo el vacío recibe el default', () => {
  assert.equal(selectorAConservar('', ''), SELECTOR_DEFECTO)
  assert.equal(selectorAConservar(undefined, undefined), SELECTOR_DEFECTO)
  // Su fórmula (o la mía de una corrida anterior) vuelve tal cual.
  assert.equal(selectorAConservar(SELECTOR_DEFECTO, 46234), SELECTOR_DEFECTO)
  assert.equal(selectorAConservar('=DATE(2026;12;1)', 46357), '=DATE(2026;12;1)')
  // Un mes elegido del desplegable queda como serial: vuelve como NÚMERO. Devolverlo como texto lo
  // convertiría en cadena y las 42 fórmulas del calendario pasarían a decir #VALUE!.
  assert.equal(selectorAConservar('', 46357), 46357)
  assert.equal(typeof selectorAConservar('', '46357'), 'number')
  // Basura → default, nunca una fecha inventada.
  assert.equal(selectorAConservar('septiembre', 'septiembre'), SELECTOR_DEFECTO)
})

test('el default del selector es una fórmula: un mes pegado se queda clavado para siempre', () => {
  assert.ok(SELECTOR_DEFECTO.startsWith('='))
  assert.ok(SELECTOR_DEFECTO.includes('TODAY()'))
  assert.equal(bandaFilas()[FILAS.calendario - 1][COL_SELECTOR], SELECTOR_DEFECTO)
  assert.equal(bandaFilas({ selector: 46357 })[FILAS.calendario - 1][COL_SELECTOR], 46357)
})

test('el desplegable ofrece doce meses consecutivos empezando por el corriente', () => {
  const ms = mesesDelSelector(new Date(2026, 7, 6))
  assert.equal(ms.length, 12)
  assert.equal(ms[0], '01/08/2026')
  assert.equal(ms[4], '01/12/2026')
  assert.equal(ms[5], '01/01/2027', 'el año tiene que rodar solo')
  const v = validacionDelSelector(7, new Date(2026, 7, 6)).setDataValidation
  assert.equal(v.range.startRowIndex, FILAS.calendario - 1)
  assert.equal(v.range.startColumnIndex, COL_SELECTOR)
  assert.equal(v.rule.strict, false, 'una validación que rechaza es una pestaña que pelea con el dueño')
})

// ═══ 6. FORMATO CONDICIONAL ═══

test('las reglas condicionales se borran antes de ponerse: addConditionalFormatRule APILA', () => {
  const reqs = reglasDelCalendario(7, [0, 2])
  const borra = reqs.filter((r) => r.deleteConditionalFormatRule)
  assert.deepEqual(borra.map((r) => r.deleteConditionalFormatRule.index), [2, 0],
    'hay que borrar de mayor a menor índice: deleteConditionalFormatRule reindexa lo que queda')
  assert.equal(reqs.filter((r) => r.addConditionalFormatRule).length, 3)
  assert.ok(reqs.indexOf(borra[borra.length - 1]) < reqs.findIndex((r) => r.addConditionalFormatRule))
})

test('sólo se borran las reglas que caen enteras dentro de la banda', () => {
  // Una regla que toca el registro es del dueño. Borrarle el formato condicional es la versión visual
  // de borrarle los datos.
  const cfs = [
    { ranges: [{ endRowIndex: BANDA }] }, // mía
    { ranges: [{ endRowIndex: 409 }] }, // del registro
    { ranges: [{ endRowIndex: 5 }, { endRowIndex: BANDA + 1 }] }, // mitad y mitad → no es mía
    { ranges: [{}] }, // sin tope: la hoja entera
    { ranges: [] }, // sin rangos: no se toca
    { ranges: [{ endRowIndex: 3 }] }, // mía
  ]
  assert.deepEqual(indicesPropios(cfs), [0, 5])
  assert.deepEqual(indicesPropios(), [])
})

test('las tres reglas del calendario cubren las 42 celdas y ninguna otra', () => {
  for (const r of reglasDelCalendario(7).filter((x) => x.addConditionalFormatRule)) {
    const [rango] = r.addConditionalFormatRule.rule.ranges
    assert.equal(rango.startRowIndex, FILAS.semana0 - 1)
    assert.equal(rango.endRowIndex, FILAS.semana0 - 1 + SEMANAS)
    assert.equal(rango.startColumnIndex, COL_SELECTOR)
    assert.equal(rango.endColumnIndex, COL_SELECTOR + DIAS)
    const f = r.addConditionalFormatRule.rule.booleanRule.condition.values[0].userEnteredValue
    assert.ok(f.startsWith('='), 'un CUSTOM_FORMULA empieza con =')
    assert.doesNotMatch(f, /CAJA_[A-Z_]+/, 'CUSTOM_FORMULA no acepta rangos con nombre directos: hace falta INDIRECT')
  }
  // HOY va última en la lista y por eso queda PRIMERA en la pestaña: con `index: 0` cada regla empuja
  // a la anterior. Si hoy vence un cheque, lo que el ojo tiene que encontrar es el día de hoy.
  const adds = reglasDelCalendario(7).filter((x) => x.addConditionalFormatRule)
  assert.match(adds[adds.length - 1].addConditionalFormatRule.rule.booleanRule.condition.values[0].userEnteredValue, /=TODAY\(\)$/)
})

// ═══ 7. LOCALE Y ANCLAJE ═══

test('separador es-AR: ni una coma fuera de un literal de texto, en toda la banda', () => {
  // La coma es el separador DECIMAL en es-AR: una coma entre argumentos parte la fórmula. Se miran
  // sólo los operadores — adentro de una máscara ("$#,##0") o de un rótulo la coma es legítima.
  banda.forEach((fila, i) => fila.forEach((c, j) => {
    if (typeof c !== 'string' || !c.startsWith('=')) return
    const soloCalculo = c.replace(/"(?:[^"]|"")*"/g, '')
    assert.doesNotMatch(soloCalculo, /,/, `coma separando argumentos en la fila ${i + 1}, columna ${j}: ${soloCalculo.slice(0, 90)}`)
  }))
})

test('todos los rangos al registro arrancan en la primera fila de datos y quedan ABIERTOS', () => {
  const texto = JSON.stringify(banda)
  const refs = texto.match(/\$[A-Z]\$\d+:\$[A-Z]/g) || []
  assert.ok(refs.length > 40, `esperaba muchas referencias y encontré ${refs.length}`)
  for (const r of refs) assert.match(r, new RegExp(`^\\$[A-Z]\\$${FILA_DATO0}:`), `"${r}" no arranca en la primera fila de datos`)
  // Un rango cerrado al registro se quedaría corto en cuanto se carguen cheques: acá no hay ninguno.
  assert.equal((texto.match(/\$[A-Z]\$\d+:\$[A-Z]\$\d+/g) || []).length, 0, 'quedó un rango cerrado apuntando al registro')
})

test('el corte del subtítulo sale del registro y no del reloj de la corrida', () => {
  // El registro lo carga el dueño A MANO y cambia sin que corra nadie: una fecha estampada se queda
  // atrás para siempre. Dos corridas del constructor tienen que dar el MISMO texto.
  const sub = celda(FILAS.corte, 0)
  assert.equal(sub, String(bandaFilas()[FILAS.corte - 1][0]))
  assert.ok(sub.startsWith('='))
  assert.match(sub, new RegExp(`\\$C\\$${FILA_DATO0}:\\$C`), 'la emisión tiene que contar')
  assert.match(sub, new RegExp(`UPPER\\(\\$K\\$${FILA_DATO0}:\\$K\\)="SI"`), 'marcar DEBITADO=SI es la puerta del extracto y tiene que mover el corte')
  assert.match(sub, /<=TODAY\(\)/, 'ninguna de las dos puertas puede declarar frescura del futuro')
  assert.doesNotMatch(sub.replace(/"[^"]*"/g, ''), /\d{1,2}\/\d{1,2}\/\d{2,4}/, 'quedó una fecha estampada')
  assert.match(sub, /cheques vivos/)
})

test('cero prosa: ninguna celda de la banda es un párrafo', () => {
  // La columna "Qué significa" de la versión anterior tenía renglones de 130 caracteres al lado de
  // cada número. Un tablero que hay que leer no es un tablero.
  banda.forEach((fila, i) => fila.forEach((c) => {
    if (typeof c !== 'string' || c.startsWith('=')) return
    assert.ok(c.length <= 24, `la fila ${i + 1} tiene prosa: "${c}"`)
  }))
})
