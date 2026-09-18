import test from 'node:test'
import assert from 'node:assert/strict'
import { planMesParcial, formaApi } from './direccion-mes-parcial-plan.mjs'
import { columnasRetiros, formulaEstadoMes } from './direccion-retiros.mjs'
import { COMPRAS_CON_OBRA } from './encabezados-referencia.mjs'

const cols = columnasRetiros(COMPRAS_CON_OBRA)
/** La pestaña viva del 18/09, sólo las filas que el plan mira (54–73), con las fórmulas del generador. */
function pestana({ C69, D69, E69, H69 } = {}) {
  const g = []
  const fila = (i, v) => { g[i - 1] = v }
  fila(54, ['1.2 · DIRECCIÓN · RETIROS MENSUALES'])
  fila(55, ['Persona', 'Retiro mensual', '', '', 'Desde'])
  fila(59, ['⇒ Retiro mensual de Dirección', '=SUM($B$56:$B$58)', '', '', '=IFERROR(MIN(…))'])
  fila(61, ['Mes', 'Ajuste escalón', 'Pagado', 'Estado', 'Se paga el', 'Banco', 'Adelanto', 'Proyectado'])
  fila(68, ['Julio', '', '=SUMPRODUCT(REGEXMATCH(LOWER(Compras!$K$4:$K&"");…)', '=IF(N(C68)>0;"pagado";IF(N(H68)>0;"proyección";""))', '=IFERROR(MAX(FILTER(Compras!$AE$4:$AE;…));…)', '', '', '=IF(N($B$59)=0;"";IF(N(C68)>0;"";IF(E68<$E$59;"";$B$59*IFERROR(IF(ISNUMBER(B68);B68;1);1))))'])
  fila(69, ['Agosto', '',
    C69 ?? '=SUMPRODUCT(REGEXMATCH(LOWER(Compras!$K$4:$K&"");…)',
    D69 ?? '=IF(N(C69)>0;"pagado";IF(N(H69)>0;"proyección";""))',
    E69 ?? '=IFERROR(MAX(FILTER(Compras!$AE$4:$AE;…));…)', '', '',
    H69 ?? '=IF(N($B$59)=0;"";IF(N(C69)>0;"";IF(E69<$E$59;"";$B$59*IFERROR(IF(ISNUMBER(B69);B69;1);1))))'])
  for (let i = 0; i < g.length; i++) g[i] ??= []
  return g
}

test('el plan ubica agosto por rótulo y cambia exactamente C, D, E y H de esa fila', () => {
  const plan = planMesParcial(pestana(), cols, { mes: 'Agosto', anio: 2026 })
  assert.ok(plan.ok, plan.motivo)
  assert.equal(plan.fila, 69)
  assert.equal(plan.filaTotal, 59)
  assert.deepEqual(plan.celdas.map((c) => c.celda), ['C69', 'D69', 'E69', 'H69'])
  assert.ok(plan.celdas.every((c) => !c.igual))
  const H = plan.celdas.find((c) => c.celda === 'H69').nueva
  assert.equal(H, '=IF(N($B$59)=0;"";IF(E69<$E$59;"";IF($B$59*IFERROR(IF(ISNUMBER(B69);B69;1);1)-N(C69)<1;"";$B$59*IFERROR(IF(ISNUMBER(B69);B69;1);1)-N(C69))))')
  assert.equal(plan.celdas.find((c) => c.celda === 'D69').nueva, formulaEstadoMes('C69', 'H69'))
  assert.match(plan.celdas.find((c) => c.celda === 'C69').nueva, /_PAGOS_NO_COMPRA_RAW.*2026-08/)
  assert.match(plan.celdas.find((c) => c.celda === 'E69').nueva, /^=IF\(MAX\(/)
})

test('idempotente: con las fórmulas nuevas ya puestas —como las devuelve la API— no hay nada que escribir', () => {
  const p1 = planMesParcial(pestana(), cols, { mes: 'Agosto', anio: 2026 })
  // Sheets guarda `Compras!` donde se escribió `'Compras'!` y conserva `'_PAGOS_NO_COMPRA_RAW'!`.
  const nuevas = Object.fromEntries(p1.celdas.map((c) => [c.celda, formaApi(c.nueva)]))
  assert.notEqual(nuevas.C69, p1.celdas[0].nueva, 'el fixture imita a la API: sin comillas en Compras')
  assert.match(nuevas.C69, /\(_PAGOS_NO_COMPRA_RAW!\$C/, 'la comparación normaliza las comillas de los dos lados')
  const p2 = planMesParcial(pestana(nuevas), cols, { mes: 'Agosto', anio: 2026 })
  assert.ok(p2.ok)
  assert.ok(p2.celdas.every((c) => c.igual))
})

test('una celda que no tiene la forma del generador es del dueño y frena el plan ENTERO', () => {
  for (const tuya of [{ H69: 7200000 }, { D69: 'parcial' }, { C69: '=1800000' }, { E69: '' }]) {
    const p = planMesParcial(pestana(tuya), cols, { mes: 'Agosto', anio: 2026 })
    assert.equal(p.ok, false, JSON.stringify(tuya))
    assert.match(p.motivo, /la tomo como tuya/)
  }
})

test('sin ancla no hay plan: bloque, total, encabezado o mes que falten', () => {
  const sinTotal = pestana(); sinTotal[58] = ['otra cosa']
  assert.equal(planMesParcial(sinTotal, cols, { mes: 'Agosto', anio: 2026 }).ok, false)
  const sinEnc = pestana(); sinEnc[60] = ['Mes', 'Ajuste', 'Pagado', 'Estado', 'Fecha', 'Banco', 'Adelanto', 'Proyectado']
  assert.equal(planMesParcial(sinEnc, cols, { mes: 'Agosto', anio: 2026 }).ok, false)
  assert.equal(planMesParcial(pestana(), cols, { mes: 'Marzo', anio: 2026 }).ok, false, 'marzo no está en el fixture')
  assert.equal(planMesParcial(pestana(), cols, { mes: 'Agosot', anio: 2026 }).ok, false)
})
