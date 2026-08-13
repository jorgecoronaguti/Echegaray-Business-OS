// LOS TRES DEFECTOS DE "RECURRENTES", CADA UNO CON SU TEST.
//
// 1. EL ENCABEZADO FANTASMA DE LA FILA 2. Las filas se armaban con `Array(ANCHO).fill('')`, y la
//    fusión lee la cadena vacía como "no es mi celda, preservala". Cuando el layout creció, el
//    encabezado de la versión anterior quedó clavado en la fila 2 —los doce primeros-de-mes en crudo,
//    pintados como moneda: "$46.023", "$46.054"…— y una fila de ceros en la 3. Se veía en el archivo
//    real el 04/08, sin un solo #ERROR.
// 2. EL CONTROL EN ROJO CON LOS DATOS PERFECTOS. La diferencia daba -0,004 y el formato la dibujaba
//    "-$0" en rojo. Un control que grita por medio centavo se deja de mirar.
// 3. UNA COLUMNA DE PROSA POR FILA DE CONTROL. Cuatro oraciones que el dueño borraba a mano y volvían
//    en cada corrida del worker.
import test from 'node:test'
import assert from 'node:assert/strict'
import { grilla, formatosPropios, declaradosSinFila, RANGO_COMPRAS } from './recurrentes-pestana.mjs'
import { mesCerrado } from '../lib/cash-flow-lineas.mjs'
import { fusionar, tiene, VACIO } from '../lib/preservar-anotaciones.mjs'
import { CONTADOR, MONEDA_CUERPO, MONEDA_TOTAL, MONEDA_CONTROL } from '../lib/formato-statement.mjs'

const g = grilla(['Movistar', 'RSV', 'Robles Jose Maria'])

test('EL FANTASMA: la fusión borra el encabezado que dejó el layout anterior en la fila 2', () => {
  // "Antes": la pestaña real tenía en la fila 2 la nota del generador MÁS los doce seriales de fecha
  // y los tres rótulos de la derecha, sobrevivientes de cuando el encabezado vivía ahí.
  const enLaPestana = g.filas.map(() => [])
  enLaPestana[1] = ['(la nota vieja)', 46023, 46054, 46082, 46113, 46143, 46174, 46204, 46235, 46266, 46296, 46327, 46357, 'Total real', 'Meses con gasto', 'Promedio mensual']
  enLaPestana[2] = ['1 · EL GASTO RECURRENTE, MES A MES', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

  const fusion = fusionar(g.filas, enLaPestana)
  for (let c = 1; c <= 15; c++) {
    assert.equal(fusion[1][c], '', `B2:P2 tiene que quedar vacía; en la columna ${c} sobrevivió "${fusion[1][c]}"`)
    assert.equal(fusion[2][c], '', `la fila del título de sección no lleva números; en la columna ${c} sobrevivió "${fusion[2][c]}"`)
  }
  assert.equal(fusion[1][0], g.filas[1][0], 'el subtítulo del generador sí se escribe')
})

test('lo que la persona anota FUERA del ancho del bloque se sigue preservando', () => {
  // El centinela no puede convertirse en una licencia para barrer: más allá del footprint del
  // generador, la celda es del dueño y no se toca. Es la contracara de la regla, y la que ya costó
  // catorce fechas borradas dos veces.
  const enLaPestana = g.filas.map(() => [])
  enLaPestana[4] = Array(40).fill('')
  enLaPestana[4][35] = 'ojo: Movistar sube en septiembre'
  const fusion = fusionar(g.filas, enLaPestana)
  assert.equal(fusion[4][35], 'ojo: Movistar sube en septiembre')
})

test('EL FALSO ROJO: la diferencia se redondea a peso dentro de la fórmula', () => {
  const dif = String(g.filas[g.fDif - 1][1])
  assert.match(dif, /^=ROUND\(/, 'sin ROUND, medio centavo de residuo pintaba el control de rojo')
  assert.match(dif, /;0\)$/, 'redondeo a peso: en esta empresa no hay decisión que dependa de centavos')
})

test('NI UNA COLUMNA DE PROSA: ninguna fila lleva un párrafo al lado del número', () => {
  for (const [i, f] of g.filas.entries()) {
    for (const [j, c] of f.entries()) {
      // Se miran sólo las columnas VISIBLES (A..P): la columna auxiliar oculta lleva un cartel de
      // "no borrar" que nadie ve, y los doce encabezados son fechas, no texto.
      if (j === 0 || j >= 16 || c instanceof Date || !tiene(c)) continue
      const t = String(c)
      if (t.startsWith('=')) continue
      assert.ok(t.length <= 40 && !/\. /.test(t),
        `fila ${i + 1}, columna ${j + 1}: "${t.slice(0, 60)}" es prosa. El dueño las borra y vuelven en cada corrida.`)
    }
  }
})

test('el subtítulo entra en una línea: el muro de texto se cortaba contra enero', () => {
  assert.ok(String(g.filas[1][0]).length <= 130, `el subtítulo mide ${String(g.filas[1][0]).length} caracteres`)
})

test('EL CONTADOR NO ES PLATA: "Meses con gasto" declara su propio formato', () => {
  const reqs = formatosPropios({ sheetId: 1, rows: 60 }, g)
  const patrones = reqs
    .filter((r) => r.repeatCell?.cell?.userEnteredFormat?.numberFormat)
    .map((r) => ({ rango: r.repeatCell.range, nf: r.repeatCell.cell.userEnteredFormat.numberFormat }))
  // La columna O (índice 14) sobre las filas de proveedores tiene que terminar en formato de contador:
  // gana el ÚLTIMO request que la cubre, que es como los aplica la API.
  const cubren = patrones.filter((p) => p.rango.startColumnIndex <= 14 && p.rango.endColumnIndex > 14
    && p.rango.startRowIndex <= g.f0 - 1 && p.rango.endRowIndex >= g.f1)
  assert.deepEqual(cubren.at(-1).nf, CONTADOR, 'antes heredaba el formato de moneda y mostraba "$5"')
})

test('el "$" es del total: el cuerpo va sin símbolo y el cero se dibuja raya', () => {
  assert.equal(MONEDA_CUERPO.pattern.includes('$'), false)
  assert.ok(MONEDA_CUERPO.pattern.endsWith('"—"'))
  assert.ok(MONEDA_TOTAL.pattern.includes('"$"'))
  // El rojo es del control, no del número: un negativo del cuerpo (una nota de crédito) no es un error.
  assert.equal(MONEDA_CUERPO.pattern.includes('[Red]'), false)
  assert.ok(MONEDA_CONTROL.pattern.includes('[Red]'))
})

test('la fila del encabezado no se mueve: el Cash Flow Mensual la lee por posición absoluta', () => {
  assert.equal(g.filas[3][0], 'Proveedor', 'FILA_CAB = 4, y las fórmulas de cada mes la referencian en absoluto')
  assert.ok(g.filas[3][1] instanceof Date)
  assert.equal(g.filas[g.fTot - 1][0], 'TOTAL', 'el rótulo es el ancla que usa cash-flow-lineas')
})

test('cada celda que el generador deja vacía lleva el centinela, no cadena vacía', () => {
  const separadora = g.filas[g.fTot] // la fila en blanco entre el total y el bloque de control
  assert.ok(separadora.every((c) => c === VACIO), 'una separadora con "" preserva lo que hubiera abajo')
})

// ═══ EL MES EN CURSO — LOS TESTS DEL 13/08/2026 ═══
//
// El dueño: "no noto q se hayan actualizado las pestañas de recurrentes". Tenía razón y la causa era
// de forma, no de datos: hasta el día en que llegaba la factura, la celda del mes corriente mostraba
// "—" como si el mes no fuera a costar nada. Movistar factura el 25: veinticinco días por mes el
// cuadro decía cero de un gasto de ~$360.000 que se sabe que viene.
//
// La cura es MAX(real; esperado) SÓLO en el mes en curso. Sobre un mes CERRADO sería inventar plata
// —esta pestaña ya nació de ese defecto: la versión hecha a mano rellenaba junio con $374.260 de
// Movistar cuando el real era $0— y sobre uno futuro no hay real que comparar.

const MES = 'EOMONTH(TODAY();-1)+1'
const celdaEnero = String(g.filas[g.f0 - 1][1])

test('EL MES EN CURSO deja de mostrarse vacío: es el MAYOR entre lo real y lo esperado', () => {
  assert.ok(celdaEnero.startsWith(`=IF(B$4<${MES};R${g.f0};IF(B$4=${MES};MAX(R${g.f0};`),
    `la celda no compara el mes con el mes en curso: ${celdaEnero}`)
})

test('UN MES CERRADO SIGUE MOSTRANDO EL REAL Y NADA MÁS: proyectar hacia atrás inventa plata', () => {
  // La rama de la izquierda del primer IF es la del mes ya terminado. Tiene que ser la columna
  // auxiliar sola: ni el promedio, ni el factor de inflación, ni un MAX que los meta por la ventana.
  const cerrada = celdaEnero.slice(0, celdaEnero.indexOf(';IF('))
  assert.ok(cerrada.endsWith(`;R${g.f0}`), `un mes cerrado no muestra el real solo: ${cerrada}`)
  assert.ok(!cerrada.includes('Parámetros'), 'un mes cerrado no se ajusta por inflación')
  assert.ok(!cerrada.includes('MAX('), 'un mes cerrado no se compara contra ninguna expectativa')
  assert.ok(!cerrada.includes(`$P${g.f0}`), 'un mes cerrado no mira el promedio')
})

test('UNA SOLA DEFINICIÓN DE "MES EN CURSO": la celda y el control no pueden discrepar', () => {
  // Antes la celda trataba agosto como mes abierto y el control de abajo lo contaba entre los
  // "meses cerrados en $0": la misma pestaña decía las dos cosas del mismo mes el mismo día.
  const control = String(g.filas[g.ctrl + 4][1])
  assert.ok(control.includes(`<${MES}`), `el control usa otra definición de mes cerrado: ${control}`)
  assert.ok(!control.includes('<=EOMONTH(TODAY();0)'), 'el mes en curso volvió a contarse como cerrado')
  assert.equal((celdaEnero.match(new RegExp(MES.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length, 2)
})

test('EL REAL ACUMULADO NO INCLUYE LA PROYECCIÓN: sale de las auxiliares, no de lo que se ve', () => {
  // Si el "Total real" sumara las columnas visibles, desde hoy incluiría la expectativa del mes en
  // curso y el control contra Compras —que compara este cuadro contra la planilla— empezaría a
  // fallar por una diferencia que no es un error de carga. Y el promedio se alimentaría de sí mismo.
  const fila = g.filas[g.f0 - 1]
  assert.equal(String(fila[13]), `=SUM(R${g.f0}:AC${g.f0})`, 'el total real tiene que sumar las auxiliares')
  assert.match(String(fila[17]), /^=SUMIFS\(/, 'la auxiliar es el real de Compras y nada más')
  assert.ok(!String(fila[17]).includes('MAX('), 'la auxiliar no puede tener la proyección adentro')
  assert.ok(!String(fila[17]).includes('Parámetros'), 'la auxiliar no se ajusta por inflación')
  // Y el control del bloque 2 suma la columna del real, no la fila de totales de los meses.
  assert.equal(String(g.filas[g.ctrl + 1][1]), `=SUM(N${g.f0}:N${g.f1})`)
})

test('LO ESTIMADO EN ITÁLICA INCLUYE EL MES EN CURSO: si no, se presenta como un hecho', () => {
  // Regla de oro 2. La itálica arrancaba en el mes SIGUIENTE, así que desde que la celda del mes
  // corriente puede mostrar una expectativa, la mostraba en redonda — igual que un importe real.
  const reqs = formatosPropios({ sheetId: 1, rows: 60 }, g)
  const ital = reqs.filter((r) => r.repeatCell?.cell?.userEnteredFormat?.textFormat?.italic)
  assert.equal(ital.length, 1, 'hay una sola marca de proyectado, y es la itálica')
  assert.equal(ital[0].repeatCell.range.startColumnIndex, 1 + new Date().getUTCMonth(),
    'la itálica tiene que empezar en la columna del mes en curso')
  assert.equal(ital[0].repeatCell.range.endColumnIndex, 13)
})

test('EL SUBTÍTULO DECLARA LA VENTANA DE TIEMPO: por fecha de caja, no de factura', () => {
  // El dueño leyó agosto vacío porque pagó Movistar el 07/08 con facturas fechadas en julio. El
  // cuadro imputa por la fecha en que SALE la plata (columna AD), y decía sólo "lo que se pagó".
  // Mezclar las dos ventanas sin decir cuál se usa es la regla de oro 3.
  const sub = String(g.filas[1][0])
  assert.match(sub, /FECHA DE CAJA/, 'el subtítulo tiene que decir por qué fecha entra cada gasto')
  assert.match(sub, /no de factura/)
  assert.doesNotMatch(sub, /agosto|enero|febrero|marzo|abril|mayo|junio|julio|septiembre|octubre|noviembre|diciembre/,
    'un mes tipeado a mano en el rótulo miente solo el mes que viene')
})

test('un recurrente DECLARADO que el cuadro no lista se dice, no se adivina', () => {
  // Los cuatro que hoy no tienen fila. Para los baños de obra eso está bien —su gasto es de la obra—;
  // para MASS CONSULTORA no, y la diferencia sólo se puede ver si el que corre el generador la lee.
  const faltan = declaradosSinFila(['Movistar', 'RSV', 'Robles Jose Maria'])
  assert.ok(faltan.includes('mass consultora'), 'MASS CONSULTORA está declarada y no tiene fila')
  assert.ok(faltan.includes('sanitarios od s.a.s.'))
  assert.ok(!faltan.includes('movistar'), 'el que sí tiene fila no se reporta')
  // Compara normalizado: la planilla escribe "RSV" y la lista "rsv".
  assert.deepEqual(declaradosSinFila(['  MASS CONSULTORA  ']).includes('mass consultora'), false)
})

test('la lectura de Compras no tiene techo: un rango fijo esconde al proveedor nuevo', () => {
  // Decía A4:AC940 con la planilla en la fila 818. Cuando la pase, el proveedor recurrente nuevo
  // deja de aparecer y no lo dice nadie: los SUMIFS del cuadro sí son abiertos.
  assert.doesNotMatch(RANGO_COMPRAS, /\d+$/, `el rango de lectura volvió a tener techo: ${RANGO_COMPRAS}`)
})

test('el Cash Flow Mensual NO toma de esta pestaña el mes en curso', () => {
  // La pestaña y el cash flow usan definiciones DISTINTAS de "mes cerrado", a propósito: acá el mes
  // en curso se muestra como expectativa (con su itálica) y allá se muestra sólo lo real, porque
  // proyectar el mes corriente sobre el saldo de caja ya costó $177M de contradicción entre el
  // mensual y el semanal. Eso sólo es sostenible mientras el cash flow no LEA de acá el mes en
  // curso. Si alguien cambia ese "<=", el MAX de esta pestaña empieza a alimentar el cuadro de caja
  // y el mismo mes se cuenta como real y como proyección: este test se pone rojo primero.
  assert.match(mesCerrado('B$3'), /<=/,
    'el cash flow dejó de tratar el mes en curso como cerrado — revisar la interacción con el MAX de esta pestaña')
})

test('TODA fórmula de la grilla cierra paréntesis y está en es-AR', () => {
  // La celda del mes ahora anida tres IF y un MAX armados por concatenación, y la proyección aparece
  // dos veces en la misma cadena. Un paréntesis de menos no lo ve nadie hasta que la pestaña muestra
  // #ERROR! — o peor, hasta que Google interpreta la coma como decimal y el número queda mal sin
  // avisar. Las dos cosas se miden acá, sobre las 29 columnas de todas las filas.
  for (const [i, f] of g.filas.entries()) {
    for (const [j, c] of f.entries()) {
      const t = String(c ?? '')
      if (!t.startsWith('=')) continue
      const balance = [...t].reduce((n, x) => n + (x === '(' ? 1 : x === ')' ? -1 : 0), 0)
      assert.equal(balance, 0, `fila ${i + 1} columna ${j + 1}: paréntesis sin cerrar en ${t}`)
      assert.ok(!t.replace(/"[^"]*"/g, '""').includes(','),
        `fila ${i + 1} columna ${j + 1}: separador con coma (es-AR usa ";") en ${t}`)
    }
  }
})
