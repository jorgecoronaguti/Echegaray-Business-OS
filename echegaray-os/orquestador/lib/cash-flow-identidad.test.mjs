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
import { MEDIDAS, formulaMedida, particionExacta, ventanas, ventanasDiarias } from './cash-flow-matriz.mjs'
import { grillaSemanal } from './cash-flow-semanas.mjs'
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
  const refs = { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', minima: 'CAJA_MINIMA' }
  const sem = grillaSemanal({ hoy: new Date(Date.UTC(2026, 7, 5)), refs })
  const mes = grillaMeses({ anio: 2026, refs })
  const claves = ['ingresoReal', 'ingresoProyectado', 'egresoReal', 'egresoProyectado']
  claves.forEach((clave, k) => {
    // Las dos vistas ponen cada medida en la MISMA fila —es la geometría compartida— y en la primera
    // columna de tiempo. Lo único que puede diferir es la ventana, y eso es lo que se quita.
    const enElSemanal = sinVentana(sem.filas[sem.meta.fila[clave] - 1][sem.meta.cab.col0])
    const enElMensual = sinVentana(mes.filas[mes.meta.fila[clave] - 1][mes.meta.cab.col0])
    assert.equal(enElSemanal, enElMensual, `la medida ${MEDIDAS[k].clave} no está escrita igual en las dos pestañas`)
    assert.equal(sem.meta.fila[clave], mes.meta.fila[clave], `${clave} no está en la misma fila en las dos vistas`)
  })
})

test('PARTICIÓN COHERENTE: semana y mes son uniones de las mismas ventanas diarias', () => {
  // No se testea "la suma de las semanas de un mes da el mes" porque NO ES CIERTO: una semana cruza el
  // fin de mes y sus movimientos caen a los dos lados. Repartirla es una convención, y cualquiera que
  // se elija genera diferencias de borde que no son defectos. Lo que hace imposible la contradicción es
  // que las dos ventanas salgan de la misma función sobre la misma unidad atómica: el día.
  for (const v of [...ventanas('semana', { hoy: new Date(Date.UTC(2026, 7, 5)) }), ...ventanas('mes', { anio: 2026 })]) {
    const dias = ventanasDiarias(v.desde, v.hasta)
    assert.deepEqual(particionExacta(dias, v.desde, v.hasta).huecos, [])
  }
})
