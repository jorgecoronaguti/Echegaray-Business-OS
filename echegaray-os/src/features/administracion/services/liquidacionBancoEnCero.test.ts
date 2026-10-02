// BANCO 0 ESCRITO A MANO = TODO EN EFECTIVO (dueño, 02/10/2026, Tello Juan Q2-09: «necesito dejar registro de cero
// pesos y que se paga todo en efectivo porque esa persona justo no tiene banco … habilitada para todo el personal»).
//
// El defecto: `por_banco_manual = 0` entraba al modelo como NETO MANUAL, así que el total pasaba a ser 0 + negro y el
// neto del recibo del estudio desaparecía de lo que cobra la persona (Tello: −$234.963,32). Además el arrastre volvía
// a sumarse a un banco que no existe y el recibo imprimía «Depósito en banco $ 0» con el desglose del estudio.
//
// MUTACIONES QUE PONEN ESTO EN ROJO: volver a pasar el 0 como neto manual (`netoManual` sin el `!== 0`); que
// `todoEnEfectivo` acepte un 0 calculado; sacar el corte de `conArrastre`; sacar el `continue` del recibo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aplicarOverrides } from './liquidacionOverrides.ts'
import { liquidarLinea } from './liquidacionQuincena.ts'
import { cierreDeLaFila } from './cuadroDeJornales.ts'
import { entradaDeBlanco, todoEnEfectivo, type ReciboDeSueldo } from './sueldoBlancoNegro.ts'
import { totalesDelEspejo, type FilaDelEspejo } from './espejoDeJornales.ts'
import { conArrastre } from './liquidacionArrastre.ts'
import { armarRecibo, eleccionInicial, ROTULO } from './reciboDeLaQuincena.ts'
import { sellarRecibo } from './reciboEmitido.ts'
import { motivoContraElEstudio } from './controlContraElEstudio.ts'
import { efectivoDelRedondeo, pagoDelMensual } from './liquidacionPorTipo.ts'

// El recibo del estudio de Tello Juan, Q2-09/2026 (`nomina_recibo_neto`: neto $234.963,32; 50 h × $6.468).
const RECIBO: ReciboDeSueldo = {
  personaId: 'tello', cuil: '20304020181', periodo: 'Q2-09/2026', categoria: 'Oficial',
  valorHora: 6468, horasBlanco: 50, bruto: 323400, neto: 234963.32, driveFileId: 'pdf',
}
const blanco = entradaDeBlanco({
  personaId: 'tello', cuil: '20304020181', periodo: 'Q2-09/2026', recibos: [RECIBO], pisoCategoria: 6468, netoDeNomina: 234963.32,
})
const base = (adelanto = 0) => liquidarLinea({
  personaId: 'tello', nombre: 'TELLO JUAN ALBERTO', nombreOrden: 'TELLO JUAN ALBERTO', horas: 100,
  tarifa: { valorHora: 6400, netoMensual: null, desde: '2026-09-16', origen: 'test' },
  adelanto, yaTransferido: 0, reciboNeto: 234963.32, giroEnElLote: true,
}, 'obreros')
const fila = (linea: ReturnType<typeof aplicarOverrides>) =>
  ({ linea, cotejo: { estado: 'coincide' }, celdas: [], horasPorTipo: { normales: 0, extra50: 0, extra100: 0, total: 0, automaticas: 0 } }) as unknown as FilaDelEspejo

const fmt = (n: number) => String(n)

test('banco 0 a mano: el total NO cambia, banco 0 y todo lo que cobra pasa a efectivo', () => {
  const antes = aplicarOverrides(base(), {}, 'obreros', null, blanco)
  const l = aplicarOverrides(base(), { porBanco: 0 }, 'obreros', null, blanco)
  assert.equal(antes.porBanco, 234963.32, 'sin escribir nada, el banco es el neto del estudio')
  assert.equal(l.cobra, antes.cobra, 'el 0 no achica lo que cobra')
  assert.equal(l.total, antes.total)
  assert.equal(l.porBanco, 0)
  assert.equal(l.manual.porBanco, true, 'queda como decisión manual (punto amarillo)')
  assert.equal(l.enEfectivo, l.cobra, 'efectivo = total − 0')
  assert.equal(l.sueldo?.neto, 234963.32, 'el neto del estudio sigue como referencia')
  assert.equal(l.pago.banco, 0)
  assert.equal(l.pago.saldoBanco, 0, 'nada queda debiendo por banco')
  assert.equal(l.pago.negro, l.cobra)
  assert.equal(l.pago.aPagarEfectivo, l.cobra)
  assert.equal(cierreDeLaFila(l)?.cierra, true, 'la fila no se pinta «no cierra» por el neto que pasó a efectivo')
})

test('banco 0 a mano: «Efect. red.» redondea el efectivo entero, descontado el adelanto en mano', () => {
  const l = aplicarOverrides(base(122200), { porBanco: 0 }, 'obreros', null, blanco)
  const cobra = l.cobra as number
  assert.equal(efectivoDelRedondeo(fila(l)), Math.round((cobra - 122200) * 100) / 100)
})

test('vacío ≠ 0: borrar el 0 vuelve al neto del recibo del estudio', () => {
  const l = aplicarOverrides(base(), { porBanco: null }, 'obreros', null, blanco)
  assert.equal(l.porBanco, 234963.32)
  assert.equal(l.manual.porBanco, false)
  assert.equal(todoEnEfectivo(l), false)
  // Un 0 que nadie escribió (sin neto) no es «todo en efectivo».
  assert.equal(todoEnEfectivo({ porBanco: 0, manual: { porBanco: false } }), false)
})

test('un banco manual distinto de 0 sigue siendo el neto manual (regla del 14/09, sin cambios)', () => {
  const l = aplicarOverrides(base(), { porBanco: 100000 }, 'obreros', null, blanco)
  const antes = aplicarOverrides(base(), {}, 'obreros', null, blanco)
  assert.equal(l.porBanco, 100000)
  assert.equal(l.cobra, Math.round(((antes.cobra as number) - 234963.32 + 100000) * 100) / 100)
})

test('los totales del pie: banco baja en el neto, efectivo sube lo mismo, el total igual, y cierran', () => {
  const antes = totalesDelEspejo([fila(aplicarOverrides(base(), {}, 'obreros', null, blanco))])
  const t = totalesDelEspejo([fila(aplicarOverrides(base(), { porBanco: 0 }, 'obreros', null, blanco))])
  assert.equal(t.cobra, antes.cobra)
  assert.equal(t.porBanco, 0)
  assert.equal(t.netoBandas, 0)
  assert.equal(t.negro, t.cobra, 'banco + negro + mensuales = total')
  assert.equal(t.pago.aPagarBanco, 0)
  assert.equal(t.pago.aPagarEfectivo, Math.round((antes.pago.aPagarEfectivo! + 234963.32) * 100) / 100)
})

test('el arrastre de la 1ª quincena con banco 0: no va a banco, queda en el efectivo y el total no cambia', () => {
  const arrastre = { importe: 54580.48, motivo: 'Saldo 1ª quincena', periodoOrigen: 'Q1-09/2026' }
  // Regresión, sin override: Agüero 234.963,32 + 54.580,48 = 289.543,80 por banco.
  const sinOverride = conArrastre(aplicarOverrides(base(), {}, 'obreros', null, blanco), arrastre)
  assert.equal(sinOverride.porBanco, 289543.8)
  const l0 = aplicarOverrides(base(), { porBanco: 0 }, 'obreros', null, blanco)
  const l = conArrastre(l0, arrastre)
  assert.equal(l.porBanco, 0)
  assert.equal(l.enEfectivo, l0.cobra, 'la resta no se pierde: el efectivo ya la incluye')
  assert.equal(l.pago.negro, l0.cobra)
  assert.equal(l.arrastre, undefined)
})

test('el recibo de pago con banco 0: sin sección de banco, sólo efectivo, y el control deja emitir', () => {
  const l = aplicarOverrides(base(), { porBanco: 0 }, 'obreros', null, blanco)
  const r = armarRecibo(l, eleccionInicial(l), fmt)
  assert.equal(r.medios.some((m) => m.rotulo.startsWith(ROTULO.banco)), false, 'ni un renglón de $ 0')
  assert.equal(r.medios.filter((m) => !m.sub).map((m) => m.rotulo).join('|'), ROTULO.efectivo)
  assert.equal(r.total, r.medios.find((m) => m.rotulo === ROTULO.efectivo)?.importe)
  const s = sellarRecibo({ personaId: 'tello', nombre: 'Tello', categoria: null, desde: '2026-09-16', hasta: '2026-09-30' }, r)
  assert.equal(motivoContraElEstudio({ nombre: 'Tello', estimado: false, banco: s.banco, netoDelEstudio: 234963.32, arrastre: 0 }), null)
  // Regresión: sin override el banco sigue en el papel.
  const sin = aplicarOverrides(base(), {}, 'obreros', null, blanco)
  assert.equal(armarRecibo(sin, eleccionInicial(sin), fmt).medios[0].rotulo, ROTULO.banco)
})

test('mensual con banco 0 a mano: todo el sueldo en efectivo y el recibo sin banco', () => {
  const mensual = liquidarLinea({
    personaId: 'jefe', nombre: 'JEFE', nombreOrden: 'JEFE', horas: 0,
    tarifa: { valorHora: null, netoMensual: 1800000, desde: '2026-09-16', origen: 'test' },
    adelanto: 0, yaTransferido: 0, reciboNeto: 500000, giroEnElLote: true,
  }, 'oficina')
  const l = aplicarOverrides(mensual, { porBanco: 0 }, 'oficina')
  const p = pagoDelMensual(l)
  assert.equal(p.banco, 0)
  assert.equal(p.negro, l.cobra)
  const r = armarRecibo(l, eleccionInicial(l, true), fmt, true)
  assert.equal(r.medios.some((m) => m.rotulo.startsWith(ROTULO.banco)), false)
})
