// EL CONSTRUCTOR COMPARTIDO DE LAS DOS FAMILIAS DE GASTO PROPIO.
//
// Lo que estos tests defienden no es una fórmula: es que NO PUEDA VOLVER A HABER DOS. Las pestañas
// «Estructura» y «Recurrentes» contestaban la misma pregunta con dos generadores, y para el 07/09
// ya habían divergido en la regla del MES EN CURSO — una lo trataba como cerrado y la otra no.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CRITERIO, COL_SUBRUBRO, COL_PROVEEDOR, RUBRO_RECURRENTE, celdasDelAnio } from './estructura-filas.mjs'
import { MIN_MESES, MES_EN_CURSO } from './cash-flow-lineas.mjs'

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
const COL = { mes0: 1, aux0: 17, nmeses: 14, prom: 15, filaCab: 5 }
const armar = (criterio, fila = 7) => celdasDelAnio({ fila, criterio, col: COL, letra })

test('doce y doce: un año tiene doce meses y cada uno trae su real y su celda visible', () => {
  const { aux, visible } = armar(CRITERIO.subrubro)
  assert.equal(aux.length, 12)
  assert.equal(visible.length, 12)
  for (const c of [...aux, ...visible]) assert.match(c, /^=/, 'toda celda es fórmula, nunca un número pegado')
})

test('el CRITERIO es lo único que cambia entre las dos familias', () => {
  const s = armar(CRITERIO.subrubro)
  const p = armar(CRITERIO.proveedor)
  // Las visibles son IDÉNTICAS: la regla de qué se muestra no depende de contra qué se empareja.
  assert.deepEqual(s.visible, p.visible, 'las dos familias tienen que mostrar con la MISMA regla')
  // Y las auxiliares difieren SÓLO en el criterio.
  assert.notDeepEqual(s.aux, p.aux)
  assert.ok(s.aux[0].includes(COL_SUBRUBRO), 'la familia Estructura empareja por sub-rubro')
  assert.ok(p.aux[0].includes(COL_PROVEEDOR) && p.aux[0].includes(`"${RUBRO_RECURRENTE}"`),
    'la familia recurrente empareja por rubro Y proveedor: sólo por proveedor traería gasto de obra')
})

test('la clave del emparejamiento es la columna A de la MISMA fila, y se ve en pantalla', () => {
  // Si el emparejamiento fallara, se ve contra qué estaba emparejando sin abrir el código.
  for (const c of [CRITERIO.subrubro, CRITERIO.proveedor]) {
    assert.ok(armar(c, 23).aux[0].includes('$A23'), 'la fila 23 empareja contra su propia A23')
  }
})

test('la ventana del mes es SEMIABIERTA: un gasto del último día no cae en dos meses', () => {
  const { aux } = armar(CRITERIO.subrubro)
  assert.ok(aux[0].includes('">="&B$5'), 'arranca en el primero del mes')
  assert.ok(aux[0].includes('"<"&EOMONTH(B$5;0)+1'), 'termina ANTES del primero del siguiente')
  assert.ok(!aux[0].includes('"<="&EOMONTH'), 'con <= el último día caía en los dos meses')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA REGLA QUE SE UNIFICÓ — y que este test impide volver a partir en dos
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('DOS ventanas: el mes cerrado muestra el real; el ABIERTO, el mayor entre real y proyección', () => {
  const v = armar(CRITERIO.subrubro).visible[7]
  // Cerrado → el real, pelado. Es lo que pasó, aunque sea cero.
  assert.match(v, new RegExp(`IF\\(I\\$5<${MES_EN_CURSO.replace(/[()+-]/g, (c) => `\\${c}`)}`), v)
  // ABIERTO (el que corre y los que vienen) → el MAYOR entre el real cargado y la proyección. Sin
  // esto, Movistar —que factura el 25— mostraba «—» veinticinco días por mes y el cuadro EMPEORABA su
  // pronóstico al llegar la primera factura parcial (13/08); y un real ya cargado en un mes FUTURO
  // hacía publicar una proyección NEGATIVA (11/09: `Estructura!O16`, −$763.364,80). Una sola regla
  // para los dos: ver estructura-proyeccion-no-negativa.test.mjs, que la evalúa en números.
  assert.ok(v.includes('MAX('), 'el mes abierto perdió el MAX: vuelven los defectos del 13/08 y del 11/09')
  assert.ok(!/IF\([A-Z]+\$\d+=EOMONTH/.test(v), 'el mes en curso ya no es una ventana aparte del futuro')
  assert.ok(v.includes('Parámetros!'), 'la proyección se ajusta por la inflación de Parámetros')
})

test('menos de MIN_MESES apariciones NO se proyecta: un gasto suelto no es una tendencia', () => {
  // La compra de una moto ($4.352.000, una vez en enero) se proyectaba todos los meses y la
  // estructura del año daba $120,8M contra $33M reales.
  const v = armar(CRITERIO.subrubro).visible[0]
  assert.ok(v.includes(`<${MIN_MESES};0;`), `el umbral de ${MIN_MESES} meses cerrados no está en la fórmula`)
})

test('el promedio sale del PROMEDIO DECLARADO, no de recalcularlo adentro de cada mes', () => {
  // Doce recálculos del mismo promedio son doce lugares donde se puede desincronizar.
  const v = armar(CRITERIO.subrubro).visible
  for (const c of v) assert.ok(c.includes(`$${letra(COL.prom)}7`), 'la celda cita el promedio de su fila')
})
