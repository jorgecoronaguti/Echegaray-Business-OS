// La rutina de anticipos de San Francisco escribe celdas y una fila entera en Cobranzas. Con «Obra»
// insertada en H, la fila posicional se habría escrito corrida una columna. El oráculo de "hoy" es la
// función tal como estaba antes de migrarla: la migración no puede cambiar ni un carácter con el
// encabezado de hoy.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ANTICIPOS, CERTIFICACIONES, COLUMNAS_ANTICIPOS, F, filaDeAnticipo, planDeEscritura, serie } from './cobranzas-san-francisco-anticipos.mjs'
import { columnasCobranzas } from '../lib/cobranzas-columnas.mjs'
import { COBRANZAS_1409, COBRANZAS_CON_OBRA } from '../lib/encabezados-referencia.mjs'

const HOY = columnasCobranzas(COBRANZAS_1409, COLUMNAS_ANTICIPOS)
const OBRA = columnasCobranzas(COBRANZAS_CON_OBRA, COLUMNAS_ANTICIPOS)

/** La fila como la armaba el script el 13/09, con las letras adentro: el oráculo del layout de hoy. */
const filaVieja = (a, n) => [
  `=IF(C${n}="";"";ROW()-4)`, 'N', serie('2026-07-31'), '', '', 'Civil', 'San Francisco', a.h2, a.obra,
  `=${a.contrato}*25%`, '', `=IF(SUM(X${n}:AA${n})=0;"";SUM(X${n}:AA${n}))`, `=J${n}+K${n}-L${n}`, 'Efectivo', 'Pendiente',
  serie('2026-07-31'), serie(F.ANT_2), `=TEXT(Q${n};"mmm-yy")`, 1, `=IF(M${n}="";"";M${n}*S${n})`,
  `=IF(J${n}="";"";IF(O${n}="Cobrado";"Cobrado";IF(O${n}="Pendiente";IF(Q${n}<TODAY();"Vencido";Q${n}-TODAY());O${n})))`,
  `=IF(J${n}="";"";IF(O${n}="Cobrado";"✓ Cobrado";IF(O${n}="Vencido";"▲ Vencido";IF(O${n}="Proyectado";"⊘ Proyectado";IF(Q${n}<TODAY();"▲ Vencido";IF(Q${n}-TODAY()<=7;"⇒ Por vencer";"· Vigente"))))))`,
]

test('con el encabezado de hoy, la fila nueva es EXACTAMENTE la de antes de migrar', () => {
  for (const a of ANTICIPOS) assert.deepEqual(filaDeAnticipo(a, a.filaNueva, HOY), filaVieja(a, a.filaNueva))
})

test('con «Obra» en H, cada celda de la fila cae bajo su rótulo y las fórmulas citan las letras nuevas', () => {
  const a = ANTICIPOS[0]
  const fila = filaDeAnticipo(a, 96, OBRA)
  assert.equal(fila.length, 23)
  assert.equal(fila[7], '', 'la columna «Obra» queda vacía: la rutina no inventa la obra')
  const en = (rotulo) => fila[COBRANZAS_CON_OBRA.indexOf(rotulo)]
  assert.equal(en('ORDEN DE  COMPRA'), a.h2)
  assert.equal(en('Monto neto'), `=${a.contrato}*25%`)
  assert.equal(en('TOTAL a cobrar (neto de retenciones)'), '=K96+L96-M96')
  assert.equal(en('Retenciones / descuentos'), '=IF(SUM(Y96:AB96)=0;"";SUM(Y96:AB96))')
  assert.equal(en('Mes cobro (auto)'), '=TEXT(R96;"mmm-yy")')
  assert.equal(en('Fecha cobro'), serie(F.ANT_2))
})

test('el plan escribe Q/H/J hoy y R/I/K con «Obra»; la fila nueva va de A hasta «Estado cobro»', () => {
  const rangos = (cols) => planDeEscritura(cols).map((p) => p.rango)
  const hoy = rangos(HOY)
  assert.equal(hoy[0], `Cobranzas!Q${CERTIFICACIONES[0].fila}`)
  assert.ok(hoy.includes('Cobranzas!H67') && hoy.includes('Cobranzas!J67') && hoy.includes('Cobranzas!A96:V96'))
  const obra = rangos(OBRA)
  assert.equal(obra[0], `Cobranzas!R${CERTIFICACIONES[0].fila}`)
  assert.ok(obra.includes('Cobranzas!I67') && obra.includes('Cobranzas!K67') && obra.includes('Cobranzas!A96:W96'))
  assert.equal(planDeEscritura(OBRA).filter((p) => p.campo === 'fechaCobro').length, CERTIFICACIONES.length + ANTICIPOS.length)
  assert.throws(() => planDeEscritura({}), /faltan columnas de Cobranzas/)
})
