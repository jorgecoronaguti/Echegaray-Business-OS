// LA IDENTIDAD ENTRE LAS DOS VISTAS — un mes sumado día por día tiene que dar el mes del mensual.
//
// ═══ POR QUÉ ESTE TEST EXISTE ═══
//
// Es el defecto más caro que tuvo este archivo: el semanal y el mensual contestaban la misma pregunta
// y daban $125.500.568 de diferencia, con signo opuesto. No fue un error de tipeo — fue que cada
// pestaña definía por su cuenta qué sumaba.
//
// Se prueba SIMBÓLICAMENTE, comparando las fórmulas generadas, y no numéricamente contra el Sheet.
// Dos razones: no hace falta la red, y un test contra el Sheet mide un dato que cambia todos los días,
// mientras que lo que tiene que quedar fijo es la DEFINICIÓN. Si las dos vistas piden el mismo filtro
// al mismo libro y las ventanas diarias particionan exactamente la del mes, la suma coincide por
// aritmética: no hay forma de que difieran.

import test from 'node:test'
import assert from 'node:assert/strict'
import { MEDIDAS, formulaMedida, particionExacta } from './cash-flow-bloques.mjs'
import { grillaAgenda } from './cash-flow-agenda.mjs'
import { grillaMeses } from './cash-flow-meses.mjs'

/** Saca de un término las dos condiciones de fecha, respetando paréntesis balanceados.
 *  Se hace a mano y no con una regex: la ventana del mes es EOMONTH(...;0)+1, con paréntesis adentro,
 *  y una regex perezosa cortaba en el paréntesis equivocado — dejaba comparando basura contra basura. */
function sinVentana(formula) {
  let s = String(formula)
  for (const marca of ['*(_MOVIMIENTOS!$A$2:$A>=', '*(_MOVIMIENTOS!$A$2:$A<']) {
    for (;;) {
      const i = s.indexOf(marca)
      if (i < 0) break
      let prof = 0
      let j = i + 1
      for (; j < s.length; j++) {
        if (s[j] === '(') prof++
        else if (s[j] === ')') { prof--; if (prof === 0) break }
      }
      s = s.slice(0, i) + s.slice(j + 1)
    }
  }
  return s
}

const diasDelMes = (anio, mes) => {
  const out = []
  for (let d = new Date(Date.UTC(anio, mes, 1)); d.getUTCMonth() === mes; d = new Date(d.getTime() + 86400000)) out.push(new Date(d))
  return out
}

test('mismo filtro: lo único que distingue un día de un mes es la ventana', () => {
  for (const m of MEDIDAS) {
    const delMes = sinVentana(formulaMedida(m, '$A$10', 'EOMONTH($A$10;0)+1'))
    const delDia = sinVentana(formulaMedida(m, '$A$25', '$A$25+1'))
    assert.equal(delDia, delMes,
      `la medida ${m.clave} se define distinto en la agenda y en el mensual: por ahí entra la contradicción`)
  }
})

test('partición exacta: los días de agosto cubren el mes entero, sin huecos ni solapamientos', () => {
  const dias = diasDelMes(2026, 7)
  const ventanas = dias.map((d) => ({ desde: d, hasta: new Date(d.getTime() + 86400000) }))
  const r = particionExacta(ventanas, new Date(Date.UTC(2026, 7, 1)), new Date(Date.UTC(2026, 8, 1)))
  assert.deepEqual(r.huecos, [])
  assert.equal(r.ok, true)
  assert.equal(dias.length, 31)
})

test('la partición detecta un hueco: si un día se cae, el test se pone rojo', () => {
  const dias = diasDelMes(2026, 7).filter((d) => d.getUTCDate() !== 15)
  const ventanas = dias.map((d) => ({ desde: d, hasta: new Date(d.getTime() + 86400000) }))
  const r = particionExacta(ventanas, new Date(Date.UTC(2026, 7, 1)), new Date(Date.UTC(2026, 8, 1)))
  assert.equal(r.ok, false)
  assert.equal(r.huecos.length, 1)
})

test('febrero: la ventana del mes se cierra con EOMONTH, no con desde+30', () => {
  const feb = diasDelMes(2026, 1)
  assert.equal(feb.length, 28)
  const ventanas = feb.map((d) => ({ desde: d, hasta: new Date(d.getTime() + 86400000) }))
  assert.equal(particionExacta(ventanas, new Date(Date.UTC(2026, 1, 1)), new Date(Date.UTC(2026, 2, 1))).ok, true)
  // Y la fórmula del mes usa EOMONTH: un +30 fijo se comería el 31 de enero o inventaría el 29 de febrero.
  assert.ok(formulaMedida(MEDIDAS[0], '$A$10', 'EOMONTH($A$10;0)+1').includes('EOMONTH'))
})

test('las cuatro medidas son una partición del flujo: real y pendiente, sin superponerse', () => {
  const estados = MEDIDAS.map((m) => m.estados.join('|'))
  assert.deepEqual(estados, [
    'REAL', 'PROYECTADO|VENCIDO|COMPROMETIDO', 'REAL', 'PROYECTADO|VENCIDO|COMPROMETIDO',
  ], 'un estado en dos medidas del mismo signo se contaría dos veces; uno en ninguna desaparece')
  assert.deepEqual(MEDIDAS.map((m) => m.signo), [1, 1, -1, -1])
  assert.deepEqual(MEDIDAS.map((m) => m.signoNeto), [1, 1, -1, -1])
})

test('las fórmulas que quedan ESCRITAS en las dos pestañas son la misma definición', () => {
  // Éste es el que importa: no compara la función con sí misma, compara lo que cada vista PONE en su
  // celda. Si mañana alguien escribe un SUMPRODUCT a mano en una de las dos, acá se pone rojo.
  const hoy = new Date(Date.UTC(2026, 7, 5))
  const refs = { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', minima: 'CAJA_MINIMA' }
  const agenda = grillaAgenda({ hoy, refs })
  const mensual = grillaMeses({ anio: 2026, refs, hoy })
  const dia = agenda.meta.dias[0]
  const mes = mensual.meta.meses[7]
  const cols = [mensual.meta.aux.col.ingReal, mensual.meta.aux.col.ingProy, mensual.meta.aux.col.egrReal, mensual.meta.aux.col.egrProy]
  MEDIDAS.forEach((m, k) => {
    const enLaAgenda = sinVentana(agenda.filas[dia.filasMedida[k] - 1][1])
    const enElMensual = sinVentana(mensual.filas[mes.filaAux - 1][cols[k]])
    assert.equal(enLaAgenda, enElMensual, `la medida ${m.clave} no está escrita igual en las dos pestañas`)
  })
})
