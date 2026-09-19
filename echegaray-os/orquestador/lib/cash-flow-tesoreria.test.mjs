// LOS DEFECTOS QUE ESTAS PRUEBAS ATACAN:
//
//  1. Ninguno de los dos cuadros contestaba "¿cuál es la peor semana y qué la explica?": había que
//     recorrer 53 columnas a ojo.
//  2. Ninguno mostraba cobertura de obligaciones a 30/60/90 ni concentración de cobranza — y hoy
//     tres clientes concentran el 87% de $352.667.788 pendientes. Eso es riesgo comercial
//     disfrazado de riesgo financiero.
//  3. El contraste "proyectado contra lo que ocurrió" no existía en ningún Sheet real (gap que la
//     skill de tesorería declara confirmado). La trampa al construirlo es compararlo contra sí
//     mismo: si las dos filas leyeran la MISMA columna de fecha, el desvío daría siempre cero y el
//     control se validaría con la información que él mismo produce.

import test from 'node:test'
import assert from 'node:assert/strict'
import { bloqueDecision, bloqueContraste, bloqueNaturaleza } from './cash-flow-tesoreria.mjs'

const fechaAR = (d) => `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`
const arma = (periodo = 'semanal') => bloqueDecision({
  periodo, fila0: 57, colN: 'N', filaCab: 3, filaCierre: 55,
  filasEgreso: [14, 23, 28, 31, 37, 42], filasIngreso: [6, 10], refCaja: 'CAJA_TOTAL_DISPONIBLE',
})
/** Toda celda que no sea el rótulo tiene que ser fórmula: un indicador de riesgo pegado envejece. */
const celdasCalculadas = (filas) => filas.flatMap((f) => f.slice(1)).filter((c) => String(c ?? '').trim())

test('NI UN NÚMERO PEGADO: todo indicador del bloque sale por fórmula', () => {
  for (const b of [arma('semanal'), arma('mensual')]) {
    for (const c of celdasCalculadas(b.filas)) {
      assert.ok(String(c).startsWith('='), `"${String(c).slice(0, 40)}" no es una fórmula`)
    }
  }
})

test('ningún rótulo se corta en pantalla: la columna A mide 340px y entran 66 caracteres', () => {
  // Es el defecto `texto_cortado` que el auditor de pantalla marcaba en las dos pestañas.
  for (const b of [arma('semanal'), arma('mensual')]) {
    for (const f of b.filas) assert.ok(String(f[0]).length <= 66, `"${f[0]}" mide ${String(f[0]).length}`)
  }
})

test('la peor columna se encuentra por el MÍNIMO del cierre, y se identifica por su FECHA', () => {
  const b = arma('semanal')
  const peor = b.filas[1]
  assert.match(String(peor[1]), /MIN\(\$B\$55:\$N\$55\)/, 'el peor período es el de menor efectivo al cierre')
  assert.match(String(peor[1]), /INDEX\(\$B\$3:\$N\$3/, 'y se devuelve su fecha, no su número de columna')
  // Anclar en la POSICIÓN de la peor columna es el defecto que ya rompió tres enlaces en silencio:
  // el resto del bloque la vuelve a buscar por la fecha que quedó escrita.
  const explica = b.filas[3]
  assert.match(String(explica[1]), /MATCH\(\$B\$58;\$B\$3:\$N\$3;0\)/, 'la explicación busca la columna por su fecha')
})

test('qué explica la peor semana: el mayor egreso de ESA columna, con su nombre al lado', () => {
  const b = arma('semanal')
  const [rotulo, monto, nombre] = b.filas[3]
  assert.match(rotulo, /explica/)
  assert.match(String(monto), /^=IFERROR\(MAX\(/, 'el monto es el máximo de las categorías de egreso')
  for (const f of [14, 23, 28, 31, 37, 42]) {
    assert.ok(String(monto).includes(`$B$${f}:$N$${f}`), `mira la categoría de la fila ${f}`)
    assert.ok(String(nombre).includes(`$A$${f}`), `y puede devolver el rótulo de la fila ${f}`)
  }
  assert.ok(!String(monto).includes('$B$6:'), 'un cobro no explica una caja negativa: sólo se miran egresos')
})

test('la cobertura de obligaciones es (caja + cobros de la ventana) / pagos de la ventana', () => {
  const b = arma('semanal')
  const filas = b.filas.filter((f) => String(f[0]).startsWith('Cobertura'))
  assert.deepEqual(filas.map((f) => f[0]), [
    'Cobertura de obligaciones a 30 días',
    'Cobertura de obligaciones a 60 días',
    'Cobertura de obligaciones a 90 días',
  ])
  for (const [i, d] of [30, 60, 90].entries()) {
    const f = String(filas[i][1])
    assert.ok(f.includes('CAJA_TOTAL_DISPONIBLE'), 'la caja de hoy sale de la fuente única, no se recalcula')
    assert.ok(f.includes(`TODAY()+${d}`), `la ventana es de ${d} días`)
    assert.ok(f.includes('$B$6:$N$6+$B$10:$N$10'), 'numerador: cobros ya cobrados + esperados')
    assert.ok(f.includes('$B$14:$N$14+'), 'denominador: las categorías de egreso')
    // La ventana incluye el período EN CURSO (su fin todavía no pasó): si se filtrara por el
    // encabezado >= TODAY(), el mes o la semana en la que estamos parados se caería del cálculo.
    assert.ok(f.includes('>TODAY()'), 'el período en curso entra: su fin todavía no pasó')
  }
})

test('la ventana del mensual se cierra con EOMONTH, no sumando 7 días', () => {
  const f = String(arma('mensual').filas.find((x) => String(x[0]).startsWith('Cobertura'))[1])
  assert.ok(f.includes('ARRAYFORMULA(EOMONTH($B$3:$N$3;0)+1)'), 'febrero no tiene 30 días')
  assert.ok(!f.includes('$3+7)'), 'un mes no dura una semana')
})

test('la concentración de cobranza agrupa POR CLIENTE y sale de Cobranzas, no de un número escrito', () => {
  const b = arma('semanal')
  const pend = b.filas.find((f) => String(f[0]).startsWith('Cobranza pendiente'))
  const uno = b.filas.find((f) => String(f[0]).includes('mayor cliente'))
  const tres = b.filas.find((f) => String(f[0]).includes('tres mayores'))
  for (const f of [pend, uno, tres]) assert.match(String(f[1]), /QUERY\(Cobranzas!\$G\$5:\$P\$400/)
  assert.ok(String(pend[1]).includes('group by Col1'), 'agrupa por la columna de cliente (G)')
  assert.ok(String(uno[1]).includes('limit 1') && String(tres[1]).includes('limit 3'))
  assert.ok(String(uno[2]).includes(';1;1)'), 'y dice QUIÉN es ese cliente, no sólo cuánto')
  // Un cobro ya cobrado o endosado no es exposición: esa plata entró o se entregó a un tercero.
  for (const f of [pend, uno, tres]) {
    assert.ok(String(f[1]).includes("lower(Col9)<>'cobrado'") && String(f[1]).includes("lower(Col9)<>'endosado'"))
  }
})

test('lo vencido se mide contra la fecha comprometida, no contra la de cobro', () => {
  const f = String(arma('semanal').filas.find((x) => String(x[0]).includes('ya venció'))[1])
  assert.ok(f.includes("Col10 < date '"), 'Col10 es la columna P de Cobranzas: la fecha comprometida')
  assert.ok(f.includes('TEXT(TODAY();"yyyy-mm-dd")'), 'y se compara contra hoy, no contra una fecha escrita')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════

const contraste = () => bloqueContraste({
  fila0: 77,
  periodo: 'semanal',
  fechaAR,
  periodos: [0, 1, 2, 3].map((i) => new Date(Date.UTC(2026, 6, 6 + i * 7))),
})

test('EL CONTRASTE NO SE VALIDA CONTRA SÍ MISMO: lo esperado sale de P y lo cobrado de Q', () => {
  const b = contraste()
  const esperado = b.filas.find((f) => String(f[0]).includes('vencían'))
  const cobrado = b.filas.find((f) => String(f[0]).includes('efectivamente cobradas'))
  assert.ok(String(esperado[1]).includes('Cobranzas!$P$5:$P$400'), 'la fecha COMPROMETIDA con el cliente')
  assert.ok(!String(esperado[1]).includes('Cobranzas!$Q$'), 'lo esperado no puede mirar la fecha de cobro real')
  assert.ok(String(cobrado[1]).includes('Cobranzas!$Q$5:$Q$400'), 'la fecha REAL de cobro')
  assert.ok(!String(cobrado[1]).includes('Cobranzas!$P$'), 'lo ocurrido no puede mirar la fecha prometida')
  // Y el estado tiene que mandar del lado de lo cobrado: "cobrado" es un hecho, no una expectativa.
  assert.ok(String(cobrado[1]).includes('="cobrado"'))
})

test('el contraste lleva su PROPIO encabezado de fechas: es otra ventana de tiempo', () => {
  const b = contraste()
  // El cuadro semanal mira 13 semanas hacia adelante: adentro de esa ventana no hay ni un período
  // cerrado. Pintar el contraste sobre esas columnas lo dejaría vacío entero.
  assert.equal(b.filaCab, 78)
  assert.deepEqual(b.filas[1], ['Período cerrado', '6/7/2026', '13/7/2026', '20/7/2026', '27/7/2026'])
  assert.ok(b.filas[2][1].includes('B$78'), 'cada columna suma contra SU propio encabezado')
})

test('el desvío distingue el atraso que ya se resolvió del que sigue abierto', () => {
  const b = contraste()
  assert.ok(b.filas.some((f) => String(f[0]).startsWith('⇒ Desvío')), 'lo que se esperaba y no entró')
  const vencido = b.filas.find((f) => String(f[0]).includes('VENCIDO'))
  assert.ok(vencido, 'y de eso, lo que HOY sigue sin cobrarse — que es lo que hay que ir a reclamar')
  assert.ok(String(vencido[1]).includes('<>"cobrado"'))
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('la composición parte el flujo en cajas DISJUNTAS y lo prueba contra la variación neta', () => {
  const b = bloqueNaturaleza({
    fila0: 70,
    colTotal: 'O',
    filaVariacion: 53,
    partes: [{ fila: 7, signo: 1, real: null }, { fila: 24, signo: -1, real: 'SUMIFS(X)' }],
    filasEsperado: [11, 12],
    filasModelo: [44, 45],
  })
  const [, comp, esp, proy, mod, ctrl] = b.filas
  assert.equal(comp[1], '=+O7-(SUMIFS(X))', 'lo que no proyecta entra entero; lo que proyecta, sólo por su parte real')
  assert.equal(esp[1], '=+O11+O12')
  assert.equal(proy[1], '=-(O24-(SUMIFS(X)))', 'lo proyectado es lo que le falta a la línea para llegar a su total')
  assert.equal(mod[1], '=-O44-O45')
  // EL CONTROL: si las cuatro cajas no dan la variación neta, alguna línea quedó sin clasificar o
  // su parte real no cuadra con su total. Sin esta fila, la clasificación sería una promesa.
  assert.equal(ctrl[1], '=ROUND($B$71+$B$72+$B$73+$B$74-O53;0)')
  assert.deepEqual(b.formatos.control, [75], 'el control se pinta en rojo cuando no da cero')
  // Ninguna fila del cuadro puede estar en dos cajas: sería contar la misma plata dos veces.
  assert.equal(new Set([7, 24, 11, 12, 44, 45]).size, 6)
})
