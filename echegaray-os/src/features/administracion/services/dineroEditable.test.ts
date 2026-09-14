// TODAS LAS COLUMNAS DE DINERO SE EDITAN (dueño, 15/09/2026).
//
// Textual: *«dejame editable todas las columnas de dinero de la seccion liquidacion en liq hs»*. Faltaban las
// derivadas: Importe negro (`negro_manual`, nueva), Total efectivo (`en_efectivo_manual`) y Cobra total
// (`cobra_manual`). Precedencia: manual > calculado, en cada celda. Editar una derivada NO recalcula en silencio
// otra que también esté escrita a mano; si con los manuales la fila deja de cerrar, se marca y se guarda igual.
//
// MUTACIONES QUE LO PONEN ROJO: el manual ignorado; un recálculo que pisa un manual.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aplicarOverrides, CAMPOS_EDITABLES, COLUMNA_DE } from './liquidacionOverrides.ts'
import { liquidarLinea } from './liquidacionQuincena.ts'
import { negroDeLaFila, type ReciboDeSueldo } from './sueldoBlancoNegro.ts'
import { totalesDelEspejo, type FilaDelEspejo } from './espejoDeJornales.ts'
import { estadoDelPago } from '../components/liquidacion/cuadro/estadoDelPago.ts'

/** Rosales Q2-08: 94 h, recibo 50 h, neto $230.240,12, negro 44 × $5.874 = $258.456; ya transferido $200.000. */
const RECIBO: ReciboDeSueldo = {
  personaId: 'rosales', cuil: null, periodo: 'Q2-08/2026', categoria: 'OFICIAL', valorHora: 6348,
  horasBlanco: 50, bruto: 317400, neto: 230240.12, driveFileId: null,
}
const base = () => liquidarLinea({
  personaId: 'rosales', nombre: 'ROSALES', horas: 94,
  tarifa: { valorHora: 5874, netoMensual: null, desde: '2026-08-16', origen: 't' },
  adelanto: 0, yaTransferido: 200000, reciboNeto: 230240.12, giroEnElLote: true,
}, 'obreros')
const blanco = { recibo: RECIBO, netoDeNomina: 230240.12, pisoCategoria: 6348, proporcion: null }
const linea = (ov: Parameters<typeof aplicarOverrides>[1]) => aplicarOverrides(base(), ov, 'obreros', null, blanco)
const fila = (l: ReturnType<typeof linea>) => ({
  personaId: l.personaId, linea: l, cerrada: false, cotejo: { estado: 'coincide' }, celdas: [],
  horasPorTipo: { normales: 0, extra50: 0, extra100: 0, total: 0 },
}) as unknown as FilaDelEspejo

test('LAS COLUMNAS: Importe negro usa una columna nueva; Cobra total y Total efectivo reusan las que había', () => {
  assert.ok(CAMPOS_EDITABLES.includes('negro'))
  assert.equal(COLUMNA_DE.negro, 'negro_manual')
  assert.equal(COLUMNA_DE.cobra, 'cobra_manual')
  assert.equal(COLUMNA_DE.enEfectivo, 'en_efectivo_manual')
})

test('IMPORTE NEGRO MANUAL CAMBIA COBRA TOTAL (y Total efectivo sigue la cadena)', () => {
  const l = linea({ negro: 300000 })
  assert.equal(l.negro, 300000, 'MUTACIÓN: el manual ignorado deja 258.456')
  assert.equal(l.manual.negro, true)
  assert.equal(l.cobra, 230240.12 + 300000, 'Cobra total = Banco + negro manual')
  assert.equal(l.enEfectivo, 230240.12 + 300000 - 230240.12 - 200000)
  assert.equal(estadoDelPago(l).noCierra, false, 'la fila cierra')
})

test('COBRA TOTAL MANUAL CAMBIA TOTAL EFECTIVO, NO EL NEGRO, Y LA FILA DICE QUE NO CIERRA', () => {
  const l = linea({ cobra: 500000 })
  assert.equal(l.cobra, 500000)
  assert.equal(l.enEfectivo, 500000 - 230240.12 - 200000, 'Total efectivo = Cobra total − Banco − adelantos')
  assert.equal(l.negro, 258456, 'el negro no se recalcula en silencio')
  const e = estadoDelPago(l)
  assert.equal(e.noCierra, true, 'Cobra total ≠ Banco + Negro')
  assert.match(e.titulo, /^no cierra: diferencia \$11\.303,88/)
})

test('DOS MANUALES QUE NO CIERRAN: se marca, se guarda igual, y el pie suma lo mostrado', () => {
  const l = linea({ cobra: 500000, enEfectivo: 1000 })
  assert.equal(l.enEfectivo, 1000, 'MUTACIÓN: un recálculo pisa el Total efectivo escrito')
  assert.equal(l.cobra, 500000)
  assert.equal(estadoDelPago(l).noCierra, true)
  assert.equal(negroDeLaFila(l), 258456, 'el Importe negro mostrado')
  const t = totalesDelEspejo([fila(l), fila(linea({}))])
  assert.equal(t.cobra, 500000 + 488696.12)
  assert.equal(t.negro, 258456 * 2, 'el pie suma el negro que muestran las filas')
  assert.equal(t.enEfectivo, 1000 + 58456)
})

test('VACIAR VUELVE AL CALCULADO', () => {
  const vacia = linea({ negro: null, cobra: null, enEfectivo: null })
  const sin = linea({})
  assert.equal(vacia.negro, sin.negro)
  assert.equal(vacia.cobra, 488696.12)
  assert.equal(vacia.enEfectivo, 58456)
  assert.equal(vacia.manual.negro || vacia.manual.cobra || vacia.manual.enEfectivo, false)
})
