// LOS DEFECTOS QUE ESTAS PRUEBAS ATACAN, medidos en el Sheet vivo el 04/08/2026:
//
//  1. El Cash Flow Semanal abría 53 columnas del año y el Mensual 12: los dos contestaban "¿cuánto
//     varía el efectivo en 2026?" con $125.500.568 de diferencia y signo opuesto.
//  2. El Semanal NO proyectaba los egresos y SÍ las cobranzas esperadas. Un forecast asimétrico de
//     ese lado no es conservador: es optimista, y el sesgo pega justo en la peor semana.
//  3. Cada movimiento salía sin declarar su naturaleza: un cobro esperado y un cheque ya firmado
//     caían los dos en itálica, y la itálica dice CUÁNDO, no QUÉ.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SEMANAS_HORIZONTE, lunesDe, semanasRodantes, semanasCerradas,
  formulaLineaSemana, naturalezaLinea, GLOSA_NATURALEZA,
} from './cash-flow-horizonte.mjs'
import { CUADRO } from './cash-flow-lineas.mjs'

const TABLAS = { Estructura: 15, Recurrentes: 24 }
const MARTES = new Date(Date.UTC(2026, 7, 4))   // martes 04/08/2026
const LUNES = new Date(Date.UTC(2026, 7, 3))
const iso = (d) => d.toISOString().slice(0, 10)

test('el horizonte es de 13 semanas y arranca en el LUNES de la semana en curso', () => {
  const s = semanasRodantes(MARTES)
  assert.equal(s.length, SEMANAS_HORIZONTE)
  assert.equal(iso(s[0]), '2026-08-03', 'la primera columna es la semana que está corriendo, no la que viene')
  assert.equal(iso(s[12]), '2026-10-26')
  // Todas son lunes: si una no lo fuera, la ventana [encabezado, encabezado+7) sumaría otra cosa sin
  // dar ningún error — el defecto que ya escondió $292,8M en la mensual con el día 26.
  for (const d of s) assert.equal(d.getUTCDay(), 1, `${iso(d)} no es lunes`)
})

test('es RODANTE: dentro de la misma semana no se mueve, y a la semana siguiente corre una', () => {
  const hoy = semanasRodantes(MARTES)
  const pasadoManana = semanasRodantes(new Date(Date.UTC(2026, 7, 6)))
  assert.deepEqual(pasadoManana, hoy, 'dos días distintos de la misma semana dan el mismo horizonte')
  const proxima = semanasRodantes(new Date(Date.UTC(2026, 7, 11)))
  assert.equal(iso(proxima[0]), '2026-08-10', 'se cae la que pasó')
  assert.equal(iso(proxima[12]), '2026-11-02', 'y se agrega una al final')
})

test('lunesDe no se corre cuando ya es lunes', () => {
  assert.equal(iso(lunesDe(LUNES)), '2026-08-03')
  assert.equal(iso(lunesDe(new Date(Date.UTC(2026, 7, 9)))), '2026-08-03', 'el domingo pertenece a su lunes')
})

test('las semanas cerradas son las anteriores a la actual, de la más vieja a la más nueva', () => {
  const c = semanasCerradas(MARTES, 4)
  assert.deepEqual(c.map(iso), ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27'])
  assert.ok(c.every((d) => d < lunesDe(MARTES)), 'ninguna semana del contraste puede estar abierta todavía')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA PROYECCIÓN SEMANAL
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const linea = (rubro) => CUADRO.flatMap((a) => a.grupos.flatMap((g) => g.lineas)).find((l) => l.rubro === rubro)

test('EL DEFECTO: una línea que el mensual proyecta ya no puede quedarse sólo con lo cargado', () => {
  // Materiales Civil se proyecta por ritmo; Estructura, por la tabla de su pestaña.
  for (const rubro of ['Materiales Civil', 'Estructura']) {
    const f = formulaLineaSemana(linea(rubro), 'B$3', 'B$3+7', TABLAS, 2026)
    assert.ok(f.startsWith('='), `${rubro}: es una fórmula viva`)
    assert.ok(f.includes('">="&B$3') && f.includes('"<"&B$3+7'), `${rubro}: la parte real sigue acotada a la semana`)
    assert.ok(f.includes('MAX(0;'), `${rubro}: proyecta lo que FALTA cargar del mes, no el mes entero`)
    assert.ok(f.includes('EOMONTH(B$3;-1)+1'), `${rubro}: resuelve el mes del lunes`)
    assert.ok(f.includes('EOMONTH(B$3+6;-1)+1'), `${rubro}: y el del domingo, para la semana que parte un mes`)
  }
})

test('la proyección de la semana RESTA lo ya cargado del mes: si no, se contaría dos veces', () => {
  const f = formulaLineaSemana(linea('Materiales Civil'), 'B$3', 'B$3+7', TABLAS, 2026)
  // `MAX(0; proyección(mes) − real(mes))`: sin el "− real(mes)" la semana sumaría la proyección
  // completa ENCIMA de las facturas que ya tienen fecha en ese mes. El total del mes daría real+proy
  // en vez de MAX(real;proy), y el semanal dejaría de coincidir con el mensual.
  assert.match(f, /MAX\(0;.*-SUMIFS\(/s, 'la proyección se descuenta contra lo ya cargado del mes')
  // Y el reparto es sobre los días que TODAVÍA NO PASARON: sin TODAY() la primera semana del
  // horizonte cobraría proyección por días que ya son historia.
  assert.ok(f.includes('MAX(B$3;EOMONTH(B$3;-1)+1;TODAY())'), 'el reparto arranca en hoy, no en el lunes')
})

test('fuera del año del cuadro la tabla no se lee: no hay columna, y decirlo es la verdad', () => {
  const f = formulaLineaSemana(linea('Estructura'), 'B$3', 'B$3+7', TABLAS, 2026)
  assert.ok(f.includes('YEAR(EOMONTH(B$3;-1)+1)<>2026'), 'un mes de 2027 leería la columna de su número de mes')
  // Y la referencia a la tabla se busca por MES, no por letra de columna.
  assert.ok(f.includes('INDEX(Estructura!$B$15:$M$15;1;MONTH('), 'la tabla se indexa por el mes de la fecha')
})

test('lo que no se proyecta sigue sin proyectarse: jornales, planes de pago, prendario, bienes de uso', () => {
  for (const rubro of ['Nómina · Jornales de obra', 'Deuda previsional (planes de pago)', 'Financiero']) {
    const f = formulaLineaSemana(linea(rubro), 'B$3', 'B$3+7', TABLAS, 2026)
    assert.ok(!f.includes('MAX(0;'), `${rubro}: sus cuotas ya están cargadas — proyectar inventa plata`)
  }
  const cob = CUADRO[0].grupos[0].lineas[0]
  assert.ok(!formulaLineaSemana(cob, 'B$3', 'B$3+7', TABLAS, 2026).includes('MAX(0;'), 'un cobro no se proyecta por ritmo')
})

test('las líneas que no viven en Compras devuelven null: las resuelve el generador, no esta función', () => {
  const todas = CUADRO.flatMap((a) => a.grupos.flatMap((g) => g.lineas))
  for (const l of todas.filter((x) => x.cheques || x.calendarioImpuestos || x.descubierto || x.comisionesBancarias || x.impuestoCheque)) {
    assert.equal(formulaLineaSemana(l, 'B$3', 'B$3+7', TABLAS, 2026), null, `"${l.nombre}" tiene que salir por null`)
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA CLASIFICACIÓN
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('TODA línea del cuadro declara una naturaleza conocida, y su glosa entra en la columna', () => {
  for (const l of CUADRO.flatMap((a) => a.grupos.flatMap((g) => g.lineas))) {
    const nat = naturalezaLinea(l)
    const glosa = GLOSA_NATURALEZA[nat]
    assert.ok(glosa, `"${l.nombre}" cae en la naturaleza "${nat}", que no tiene glosa`)
    assert.ok(glosa.length <= 46, `la glosa de ${nat} mide ${glosa.length}: no entra y se corta en pantalla`)
  }
})

test('un cobro esperado y un cheque firmado NO son la misma naturaleza — es el punto de todo esto', () => {
  const esperado = CUADRO[0].grupos[1].lineas[0]
  const cheque = CUADRO.flatMap((a) => a.grupos.flatMap((g) => g.lineas)).find((l) => l.cheques)
  assert.equal(naturalezaLinea(esperado), 'ESPERADO')
  assert.equal(naturalezaLinea(cheque), 'EMITIDO')
  assert.match(GLOSA_NATURALEZA.ESPERADO, /PROYECTADO/)
  assert.match(GLOSA_NATURALEZA.EMITIDO, /COMPROMETIDO/)
})

test('los grupos de control salen como MEMO: no son un movimiento de caja', () => {
  for (const g of CUADRO.flatMap((a) => a.grupos).filter((x) => x.signo === 0)) {
    for (const l of g.lineas) assert.equal(naturalezaLinea(l), 'MEMO', `"${l.nombre}" vive en un grupo memo`)
  }
})
