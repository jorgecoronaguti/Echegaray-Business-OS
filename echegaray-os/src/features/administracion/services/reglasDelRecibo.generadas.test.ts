// LAS REGLAS CONGELADAS, EN LA CADENA DE LA FILA: EL NETO DEL PANEL ES EL BANCO (coordinador, 14/09/2026).
//
// Primera entrega sin migración: el cuadro usa `REGLAS_GENERADAS`. Lo que tiene que valer:
//   · Rosales Q2-08 (45 + 5 feriado a $6.348) da el neto de su recibo. TOLERANCIA DECLARADA: $0,05. Las reglas
//     congeladas incluyen Q2-08 (el seguro de vida de agosto), así que esto NO es el cotejo independiente: ése
//     vive en `reciboEstimado.test.ts`, con reglas sólo de quincenas anteriores, y difiere en $1.640,82.
//   · el Banco de la fila (`aplicarOverrides` → `porBanco`) es EXACTAMENTE el neto que muestra el panel;
//   · lo manual manda: `por_banco_manual` sobre el estimado, y `horas_recibo_manual` rehace el estimado.
//
// MUTACIÓN QUE PONE ESTO ROJO: resolver el seguro de vida (sólo segunda quincena) con el `aplica` de la quincena
// para la que se generaron las reglas (Q1-09) y no con la que se estima → Q2-08 sin 4287, neto +$19.617,16.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REGLAS_GENERADAS } from './reglasDelRecibo.generadas.ts'
import { baseDelEstimado } from './reciboEstimadoService.ts'
import { entradaDeBlanco } from './sueldoBlancoNegro.ts'
import { aplicarOverrides } from './liquidacionOverrides.ts'
import { liquidarLinea, type EntradaDeLinea } from './liquidacionQuincena.ts'

const NETO_ROSALES_Q2_08 = 230240.12
const TOLERANCIA = 0.05

const base = baseDelEstimado('Q2-08/2026', REGLAS_GENERADAS, [], 1)
const blanco = entradaDeBlanco({ personaId: 'rosales', cuil: '20-35850878-3', periodo: 'Q2-08/2026', recibos: [], pisoCategoria: 6348, netoDeNomina: null, base })
const entrada: EntradaDeLinea = {
  personaId: 'rosales', nombre: 'Rosales', horas: 100,
  tarifa: { valorHora: 5000, netoMensual: null, desde: '2026-08-01', origen: 'sheet:_J_OBREROS' },
  adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
}
const linea = liquidarLinea(entrada, 'obreros', null)

test('reglas congeladas: fecha, ventana y evidencia en cada regla', () => {
  assert.ok(REGLAS_GENERADAS.periodos.length > 0)
  for (const c of REGLAS_GENERADAS.conceptos) {
    assert.ok(c.evidencia.recibos > 0, c.codigo)
    assert.ok(c.evidencia.mediana != null, c.codigo)
  }
})

test('Rosales Q2-08 con las reglas congeladas: neto del recibo real ± $0,05', () => {
  const l = aplicarOverrides(linea, {}, 'obreros', null, blanco)
  const e = l.sueldo?.reciboEstimado
  assert.ok(e, 'sin recibo estimado')
  assert.deepEqual(['0401', '0425', '0426', '0431'].map((c) => e.lineas.find((x) => x.codigo === c)?.monto), [285660, 57132, -57132, 31740])
  assert.ok(Math.abs((e.neto ?? 0) - NETO_ROSALES_Q2_08) <= TOLERANCIA, `neto ${e.neto} vs ${NETO_ROSALES_Q2_08}`)
})

test('el Banco de la fila es exactamente el neto del panel', () => {
  const l = aplicarOverrides(linea, {}, 'obreros', null, blanco)
  assert.equal(l.sueldo?.origenNeto, 'conceptos')
  assert.equal(l.porBanco, l.sueldo?.reciboEstimado?.neto)
  assert.equal(l.porBanco, l.sueldo?.neto)
})

test('lo manual manda: el Banco escrito gana; las horas del recibo escritas rehacen el estimado y el Banco lo sigue', () => {
  const conBanco = aplicarOverrides(linea, { porBanco: 200000 }, 'obreros', null, blanco)
  assert.equal(conBanco.porBanco, 200000)
  const conHoras = aplicarOverrides(linea, { horasRecibo: 40 }, 'obreros', null, blanco)
  assert.equal(conHoras.sueldo?.reciboEstimado?.horasNormales, 35)
  assert.equal(conHoras.porBanco, conHoras.sueldo?.reciboEstimado?.neto)
  assert.ok((conHoras.porBanco ?? 0) < NETO_ROSALES_Q2_08)
})
