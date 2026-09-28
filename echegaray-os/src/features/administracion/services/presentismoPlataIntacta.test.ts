// EL PRESENTISMO CAMBIÓ DE LUGAR EN EL PANEL, NO DE IMPORTE (dueño, 28/09/2026).
//
// *«no quiero que se discrimine tanto el presentismo de todos los demás conceptos en el desplegable de la
// derecha»*. El primer intento (31312cd0) movió la plata junto con la vista: puso en el 0425 de jornada
// completa el importe de `presentismo.ts` —que corre sobre el 50 % del básico— cuando los recibos reales
// pagan 0425 = 20 % del 0401 (29 de 29), y con el presentismo perdido lo descontaba dos veces.
//
// Este test fija la plata de la cadena ANTES de tocar la vista: los números salieron de correr este mismo
// armado sobre origin/main (bb48c98f) el 28/09/2026, sin ningún cambio en los servicios. Si un arreglo «de
// pantalla» vuelve a mover remunerativo, descuentos, neto, negro o total en cualquiera de los seis casos, se
// pone rojo. MUTACIÓN: saltear el 0425 entero con `presentismoPropio` (jornada completa pierde el 20 % del 0401), o
// descontar el perdido del neto en vez del negro → rojo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reglasDelRecibo, type ConceptoDeRecibo, type ReciboParaReglas, type SeccionDelConcepto } from './reglasDelRecibo.ts'
import type { BaseDelEstimado, EntradaDeBlanco } from './sueldoBlancoNegro.ts'
import { aplicarOverrides, type LineaConOverrides } from './liquidacionOverrides.ts'
import { liquidarLinea } from './liquidacionQuincena.ts'

type Tupla = [string, string, number, number, number, number, [string, string, number | null, number | null, number][]]
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/recibos-2026-q2-06-a-q2-08.json', import.meta.url), 'utf8')) as
  { rosales: string; catalogo: Record<string, string>; recibos: Tupla[] }
const SECCION: Record<string, SeccionDelConcepto> = { R: 'remunerativo', N: 'no_remunerativo', D: 'descuento', C: 'contribucion' }
const RECIBOS: ReciboParaReglas[] = FIXTURE.recibos.map(([alias, periodo, valorHora, horasNormales, horasFeriado, horasOtras, cs]) => ({
  persona: alias, periodo, valorHora, horasNormales, horasFeriado, horasOtras,
  conceptos: cs.map(([codigo, s, unidad, base, monto]): ConceptoDeRecibo => ({ codigo, descripcion: FIXTURE.catalogo[codigo], seccion: SECCION[s], unidad, base, monto })),
}))
const reglas = reglasDelRecibo(RECIBOS, 'Q2-09/2026')
// La quincena que liquida con el presentismo del OS: el estimado de media jornada ya no trae el par 0425/0426.
const BASE: BaseDelEstimado = { periodo: 'Q2-09/2026', reglas, feriados: 0, recibos: RECIBOS, presentismoPropio: true }
const BLANCO: EntradaDeBlanco = {
  recibo: null, netoDeNomina: null, pisoCategoria: 6348,
  proporcion: { cociente: 0.73, origen: 'persona', recibos: 6 }, estimacion: { base: BASE, persona: 'X' },
}
const P = { categoria: 'oficial', basico: 6348, quincenaDesde: '2026-09-16', modalidad: 'hora' as const, esJefe: false, cerrada: false }
const CUMPLE = { ...P, tardanzas: [] }
const TARDE = { ...P, tardanzas: [{ fecha: '2026-09-17', llegoTarde: true, salioAntes: false }] }
const obrero = (horas: number) => liquidarLinea({
  personaId: 'p', nombre: 'N', nombreOrden: 'N', horas, tarifa: { valorHora: 7000, netoMensual: null, desde: '2026-09-01', origen: 'x' },
  adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
}, 'obreros', null)
const oficina = liquidarLinea({
  personaId: 'o', nombre: 'O', nombreOrden: 'O', horas: 100, tarifa: { valorHora: null, netoMensual: 1_800_000, desde: '2026-09-01', origen: 'x' },
  adelanto: 0, yaTransferido: 20_000, reciboNeto: 30_000, giroEnElLote: true,
}, 'oficina', null)
const COMPLETA = { horasRecibo: 88 }

/** La plata de la línea, sin nada de la vista. */
function plata(r: LineaConOverrides) {
  const s = r.sueldo
  const e = s?.reciboEstimado ?? null
  return {
    presentismo: [r.presentismo?.estado ?? null, r.presentismo?.importe ?? null],
    jornada: e?.jornada ?? null,
    asistencia: e ? e.lineas.filter((l) => l.codigo === '0425' || l.codigo === '0426').map((l) => [l.codigo, l.monto]) : null,
    remunerativo: e?.remunerativo ?? null, descuentos: e?.descuentos ?? null, netoRecibo: e?.neto ?? null,
    neto: s?.neto ?? null, negro: s?.negro ?? null, totalSueldo: s?.total ?? null,
    cobra: r.cobra, porBanco: r.porBanco, enEfectivo: r.enEfectivo, total: r.total,
  }
}

const RECIBO_MEDIA = { jornada: 'parcial', asistencia: [], remunerativo: 317400, descuentos: 87159.88, netoRecibo: 230240.12, neto: 230240.12 }
const RECIBO_COMPLETA = { jornada: 'completa', asistencia: [['0425', 111724.8]], remunerativo: 670348.8, descuentos: 146983.43, netoRecibo: 523365.37, neto: 523365.37 }

test('media jornada: cumple y pierde — el perdido sale del negro, el recibo no se mueve', () => {
  assert.deepEqual(plata(aplicarOverrides(obrero(100), {}, 'obreros', null, BLANCO, CUMPLE)), {
    presentismo: ['aplica', 63480], ...RECIBO_MEDIA, negro: 350000, totalSueldo: 580240.12,
    cobra: 580240.12, porBanco: 230240.12, enEfectivo: 350000, total: 580240.12,
  })
  assert.deepEqual(plata(aplicarOverrides(obrero(100), {}, 'obreros', null, BLANCO, TARDE)), {
    presentismo: ['perdido', 63480], ...RECIBO_MEDIA, negro: 286520, totalSueldo: 516760.12,
    cobra: 516760.12, porBanco: 230240.12, enEfectivo: 286520, total: 516760.12,
  })
})

test('jornada completa: el 0425 es 20 % del 0401 y el perdido se descuenta UNA vez, del negro', () => {
  assert.deepEqual(plata(aplicarOverrides(obrero(100), COMPLETA, 'obreros', null, BLANCO, CUMPLE)), {
    presentismo: ['aplica', 63480], ...RECIBO_COMPLETA, negro: 84000, totalSueldo: 607365.37,
    cobra: 607365.37, porBanco: 523365.37, enEfectivo: 84000, total: 607365.37,
  })
  assert.deepEqual(plata(aplicarOverrides(obrero(100), COMPLETA, 'obreros', null, BLANCO, TARDE)), {
    presentismo: ['perdido', 63480], ...RECIBO_COMPLETA, negro: 20520, totalSueldo: 543885.37,
    cobra: 543885.37, porBanco: 523365.37, enEfectivo: 20520, total: 543885.37,
  })
})

test('mensual y sin horas: nada que cobrar ni descontar', () => {
  assert.deepEqual(plata(aplicarOverrides(oficina, {}, 'oficina', null, null, TARDE)), {
    presentismo: ['no_aplica', null], jornada: null, asistencia: null,
    remunerativo: null, descuentos: null, netoRecibo: null, neto: null, negro: null, totalSueldo: null,
    cobra: 1800000, porBanco: 30000, enEfectivo: 1750000, total: 1780000,
  })
  assert.deepEqual(plata(aplicarOverrides(obrero(0), {}, 'obreros', null, BLANCO, CUMPLE)), {
    presentismo: ['sin_horas', null], ...RECIBO_MEDIA, negro: 0, totalSueldo: 230240.12,
    cobra: 230240.12, porBanco: 230240.12, enEfectivo: 0, total: 230240.12,
  })
})
