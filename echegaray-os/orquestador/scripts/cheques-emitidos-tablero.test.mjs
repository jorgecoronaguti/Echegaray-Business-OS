// La banda de "Cheques Emitidos" se construye sola: acá se prueba lo que NO se puede ver mirando.
//
// Las dos cosas que ya rompieron esta pestaña en la vida real:
//   1. Un ancla en un rótulo que una persona puede borrar (el dueño borró "TIPO" y el generador
//      insertó 12 filas a ciegas, dejando la pestaña con DOS bandas superpuestas).
//   2. Una fórmula de total que cita filas fijas y se desalinea cuando la banda cambia de alto.
import test from 'node:test'
import assert from 'node:assert/strict'
import { bandaFilas, ubicarRegistro } from './cheques-emitidos-tablero.mjs'

const HDR = 20
const banda = bandaFilas(HDR, '23/7/2026')
const colA = banda.map((f) => f[0])
const filaDe = (re) => colA.findIndex((a) => re.test(String(a ?? ''))) + 1

test('la banda tiene el alto declarado y una sola grilla de 13 columnas', () => {
  assert.equal(banda.length, HDR - 1)
  assert.ok(banda.every((f) => f.length === 13), 'alguna fila no tiene 13 columnas')
})

test('la gramática: título, subtítulo, y tres secciones numeradas y corridas', () => {
  assert.equal(banda[0][0], 'Cheques emitidos')
  assert.match(banda[1][0], /al 23\/7\/2026/)
  const secciones = colA.filter((a) => /^\d+ · /.test(String(a ?? '')))
  assert.equal(secciones.length, 3)
  secciones.forEach((s, i) => assert.match(String(s), new RegExp(`^${i + 1} · `), `la sección ${i + 1} está fuera de orden`))
})

test('ni un número pegado: todo lo que va en la columna B es fórmula', () => {
  for (const f of banda) {
    if (f[1] === '') continue
    assert.ok(String(f[1]).startsWith('=') || f[1] === 'Monto', `valor pegado en la banda: ${f[1]}`)
  }
})

test('el total de los tramos suma EXACTAMENTE las filas de los tramos', () => {
  const fTotal = filaDe(/^⇒ Comprometido, no debitado/)
  const fPrimerTramo = filaDe(/^Vencido —/)
  const fUltimoTramo = filaDe(/^Sin fecha de pago cargada/)
  assert.ok(fTotal && fPrimerTramo && fUltimoTramo)
  assert.equal(banda[fTotal - 1][1], `=SUM(B${fPrimerTramo}:B${fUltimoTramo})`)
  // Y los tramos son consecutivos: si alguien mete una fila en el medio, el total la comería.
  assert.equal(fUltimoTramo - fPrimerTramo, 4, 'los cinco tramos tienen que ir pegados')
})

test('el titular resta las dos líneas que están justo arriba', () => {
  const fTitular = filaDe(/^⇒ Con esto podés pagar/)
  assert.equal(banda[fTitular - 1][1], `=IF(ISNUMBER(B${fTitular - 2});B${fTitular - 2}-B${fTitular - 1};"⚠ falta el saldo de CAJA")`)
})

test('los tramos cubren toda la recta del tiempo, sin huecos ni superposición', () => {
  const f = (re) => String(banda[filaDe(re) - 1][1])
  assert.match(f(/^Vencido —/), /<TODAY\(\)\)/)
  assert.match(f(/^Esta semana/), />=TODAY\(\)\)\*\(\$I\$20:\$I<TODAY\(\)\+7\)/)
  assert.match(f(/^Hasta fin de este mes/), />=TODAY\(\)\+7\)/)
  assert.match(f(/^Más adelante/), />=MAX\(TODAY\(\)\+7;EOMONTH\(TODAY\(\);0\)\+1\)\)/)
  assert.match(f(/^Sin fecha/), /NOT\(ISNUMBER/)
})

test('la plata disponible se busca en CAJA POR RÓTULO, nunca por celda', () => {
  const f = String(banda[filaDe(/^Plata disponible hoy/) - 1][1])
  assert.match(f, /MATCH\("Total disponibilidades";CAJA!\$A\$1:\$A\$200;0\)/)
  assert.match(f, /IFERROR/, 'si el rótulo cambia la celda tiene que gritar, no mentir')
})

test('la banda NUNCA escribe en la columna F: CAJA la suma como si fuera un cheque', () => {
  for (const f of banda) assert.equal(f[5], '', 'hay contenido en la columna F de la banda')
})

test('el registro se ubica por el DATO (FISICO/ECHEQ), no por un rótulo borrable', () => {
  const colA = [['Cheques emitidos'], [''], ['Tipo'], ['FISICO'], ['ECHEQ']]
  assert.deepEqual(ubicarRegistro(colA), { primera: 4, hdr: 3 })
  // Sin rótulo "TIPO" —el dueño lo borró— igual encuentra el registro.
  assert.deepEqual(ubicarRegistro([['x'], [''], [''], ['ECHEQ']]), { primera: 4, hdr: 3 })
  // Y si no hay registro, no adivina: devuelve null y el script aborta.
  assert.equal(ubicarRegistro([['x'], ['y']]), null)
})
