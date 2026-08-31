// LOS TRES DEL CORRALÓN — el duplicado que no era, medido en producción el 31/08/2026.
//
// El dueño mandó fotos toda la tarde y el bot le devolvió «5 no entraron». Tres de esos cinco eran
// comprobantes legítimos del mismo corralón, el mismo día, con números consecutivos y importes que
// no tenían nada que ver entre sí. La regla «mismo proveedor, mismo día, número a un dígito» los
// marcaba como posibles duplicados sin mirar la plata, y $86.431,32 se quedaron esperando una
// respuesta a una pregunta que no había que hacer.
//
// Lo que este archivo defiende son las DOS puntas a la vez: que el corralón entre, y que ALUMETAL
// —el caso que creó esa regla, con el número Y el importe mal leídos— siga sin entrar.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buscarEnCompras, HALLAZGO } from './compras-vivas.mjs'

/** El índice tal como lo arma `indexarCompras`, pero escrito a mano: acá lo que se prueba es la
 *  DECISIÓN de `buscarEnCompras`, no el parseo de la pestaña. */
function indice(regs) {
  const porNumero = new Map(), porFechaTotal = new Map(), porFecha = new Map()
  const empujar = (m, k, v) => { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]) }
  for (const r of regs) {
    const reg = { hoja: 'Compras', ...r }
    if (reg.numero) empujar(porNumero, reg.numero, reg)
    if (reg.fecha && reg.total != null) empujar(porFechaTotal, `${reg.fecha}|${reg.total}`, reg)
    if (reg.fecha) empujar(porFecha, reg.fecha, reg)
  }
  return { porNumero, porFechaTotal, porFecha, filas: regs.length }
}

/** Las filas reales de Compras del 27 y 28/08/2026, recortadas a lo que decide. */
function comprasDelDia() {
  return indice([
    { fila: 917, proveedor: 'Corralon Progreso', numero: '0004-00003771', fecha: '28/08/2026', total: 4903.22, tipo: 'F A' },
    { fila: 918, proveedor: 'Corralon Progreso', numero: '0006-00003453', fecha: '27/08/2026', total: 7000, tipo: 'F A' },
    { fila: 914, proveedor: 'Combustibles Barcelo', numero: '0113-00014749', fecha: '27/08/2026', total: 80000.03, tipo: 'F A' },
  ])
}

test('un corralón factura seis veces por día: números consecutivos, importes distintos, NO es duplicado', () => {
  const i = comprasDelDia()
  const casos = [
    { numero: '0006-00003450', fecha: '27/08/2026', total: 8073.24 },
    { numero: '0004-00003773', fecha: '28/08/2026', total: 13358.08 },
    { numero: '0006-00003452', fecha: '27/08/2026', total: 65000 },
  ]
  for (const c of casos) {
    const r = buscarEnCompras({ proveedor: 'Corralon Progreso', tipo: 'A', ...c }, i)
    assert.equal(r, null, `${c.numero} por $${c.total} se frenó como duplicado sin serlo`)
  }
})

test('ALUMETAL sigue frenado: número mal leído Y el importe corrido de coma es el MISMO papel', () => {
  // El importe de la fila es $2.014.940,07 y el modelo leyó $201.494.007. Mismos dígitos, otra coma.
  const i = indice([
    { fila: 797, proveedor: 'Alumetal', numero: '0038-00025942', fecha: '31/07/2026', total: 2014940.07, tipo: 'F A' },
  ])
  const r = buscarEnCompras({ proveedor: 'Alumetal', tipo: 'A', numero: '0036-00025942', fecha: '31/07/2026', total: 201494007 }, i)
  assert.ok(r, 'dejó pasar los $201M que ya estaban cargados')
  assert.equal(r.que, HALLAZGO.PROBABLE)
  assert.equal(r.fila, 797)
})

test('mismo día, número a un dígito y el MISMO importe: sigue preguntando', () => {
  const i = comprasDelDia()
  const r = buscarEnCompras({ proveedor: 'Corralon Progreso', tipo: 'A', numero: '0006-00003452', fecha: '27/08/2026', total: 7000 }, i)
  assert.ok(r, 'un importe idéntico el mismo día con el número a un dígito tiene que preguntarse')
  assert.equal(r.fila, 918)
})

test('si el importe de la foto no se pudo leer, se pregunta igual: no saber no es saber que son distintos', () => {
  const i = comprasDelDia()
  const r = buscarEnCompras({ proveedor: 'Corralon Progreso', tipo: 'A', numero: '0006-00003452', fecha: '27/08/2026', total: null }, i)
  assert.ok(r, 'sin importe legible se dejó de preguntar')
})
