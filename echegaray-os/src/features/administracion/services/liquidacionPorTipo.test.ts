// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN (captura de producción del 17/09/2026, quincena 16–30/09):
//
//  1. Un mensual en la tabla de jornaleros —o un jornalero en la de mensuales—. Sus columnas significan cosas
//     distintas: el jefe quedaba con «recibo blanco» vacío.
//  2. «Efectivo redondeado $3.600.000»: el redondeo sugería en billetes el sueldo entero de los jefes sin recibo.
//  3. «el total no cierra por $3.600.000»: el cierre del pie mezclaba sueldos mensuales con Banco + Negro.
//  4. Un sueldo mensual sin recibo repartido a ciegas entre banco y efectivo.
//
// Cada uno se pone rojo con su mutación, dicha al lado del assert.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aplicarOverrides, type LineaConOverrides } from './liquidacionOverrides.ts'
import { liquidarLinea } from './liquidacionQuincena.ts'
import { cierreDeTotales } from './cuadroDeJornales.ts'
import { totalesDelEspejo, type FilaDelEspejo } from './espejoDeJornales.ts'
import type { GrupoLiquidacion } from './liquidacionQuincena.ts'
import {
  asistenciaDeReferencia, efectivoDelRedondeo, pagoDelMensual, separarPorTipo, tipoDeLiquidacion,
  totalGeneral, totalesDeJornaleros, totalesDeMensuales,
} from './liquidacionPorTipo.ts'

const fila = (linea: LineaConOverrides, grupo: GrupoLiquidacion, celdas: unknown[] = []) => ({
  personaId: linea.personaId, nombre: linea.nombre, linea, grupo, cerrada: false, cotejo: { estado: 'coincide' }, celdas,
  horasPorTipo: { normales: 0, extra50: 0, extra100: 0, total: 0 },
}) as unknown as FilaDelEspejo

// Un obrero con blanco + negro: 100 h, recibo 50 h con neto 230.000, $/h negro 6.000 → negro 300.000.
const obrero = (id: string, ov: Parameters<typeof aplicarOverrides>[1] = {}) => aplicarOverrides(liquidarLinea({
  personaId: id, nombre: id, horas: 100, tarifa: { valorHora: 6000, netoMensual: null, desde: '2026-09-01', origen: 't' },
  adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
}, 'obreros'), ov, 'obreros', null, {
  recibo: { personaId: id, cuil: null, periodo: 'Q2-09/2026', categoria: 'OFICIAL', valorHora: 6348, horasBlanco: 50, bruto: 317400, neto: 230000, driveFileId: null },
  netoDeNomina: null, pisoCategoria: 6348, proporcion: null,
})

// Maldonado y Nievas: $1.800.000 por mes, sin recibo de la quincena. Es la captura.
const jefe = (id: string, extra: { reciboNeto?: number | null; porBanco?: number } = {}) => aplicarOverrides(liquidarLinea({
  personaId: id, nombre: id, horas: 9, tarifa: { valorHora: null, netoMensual: 1_800_000, desde: '2026-09-01', origen: 'acuerdo' },
  adelanto: 0, yaTransferido: 0, reciboNeto: extra.reciboNeto ?? null, giroEnElLote: false, esJefe: true,
}, 'oficina'), extra.porBanco == null ? {} : { porBanco: extra.porBanco }, 'oficina')

test('la clasificación: el mensual nunca cae en jornaleros ni el jornalero en mensuales', () => {
  const filas = [fila(obrero('aguero'), 'obreros'), fila(jefe('maldonado'), 'oficina'), fila(obrero('tello'), 'obreros'), fila(jefe('nievas'), 'oficina')]
  const { jornaleros, mensuales } = separarPorTipo(filas)
  // MUTACIÓN: clasificar por `esJefe` o por tener $/h → un mensual sin jefe o un jefe con $/h cambia de tabla.
  assert.deepEqual(jornaleros.map((f) => f.personaId), ['aguero', 'tello'])
  assert.deepEqual(mensuales.map((f) => f.personaId), ['maldonado', 'nievas'])
  assert.ok(jornaleros.every((f) => f.linea.modalidad === 'hora'))
  assert.ok(mensuales.every((f) => f.linea.modalidad === 'mensual'))
  // Un mensual que no es jefe (neto mensual cargado) también es mensual; la modalidad sola alcanza.
  assert.equal(tipoDeLiquidacion({ grupo: 'obreros', linea: { modalidad: 'mensual' } }), 'mensual')
  assert.equal(tipoDeLiquidacion({ grupo: 'final', linea: { modalidad: 'ninguna' } }), 'jornalero')
})

test('el mensual sin recibo: el saldo total se afirma, los lados no, y no sugiere billetes por el sueldo entero', () => {
  const l = jefe('maldonado')
  const p = pagoDelMensual(l)
  assert.equal(p.sueldo, 1_800_000)
  assert.equal(p.banco, null, 'MUTACIÓN: inventar banco = 0 manda el sueldo entero al efectivo')
  assert.equal(p.negro, null)
  assert.equal(p.saldoTotal, 1_800_000)
  assert.equal(p.aPagarEfectivo, null)
  // Lo que producía «Efectivo redondeado $3.600.000»: el efectivo de la cadena es el sueldo entero.
  assert.equal(l.enEfectivo, 1_800_000)
  assert.equal(efectivoDelRedondeo(fila(l, 'oficina')), null, 'MUTACIÓN: volver a `enEfectivo` → sugiere $1.800.000 en mano')
})

test('el mensual con recibo: banco = recibo, efectivo = sueldo − recibo, y lo pagado resta por su lado', () => {
  const l = { ...jefe('nievas', { reciboNeto: 663_141.56 }), pagadoBanco: 663_141.56 }
  const p = pagoDelMensual(l)
  assert.equal(p.banco, 663_141.56)
  assert.equal(p.origenBanco, 'recibo')
  assert.equal(p.negro, 1_136_858.44)
  assert.equal(p.saldoBanco, 0)
  assert.equal(p.saldoEfectivo, 1_136_858.44)
  assert.equal(p.saldoTotal, 1_136_858.44)
  // Un banco escrito a mano gana sobre el recibo.
  assert.equal(pagoDelMensual(jefe('nievas', { reciboNeto: 663_141.56, porBanco: 700_000 })).banco, 700_000)
})

test('los subtotales no se mezclan: el cierre de jornaleros ya no arrastra los sueldos mensuales', () => {
  const jor = [fila(obrero('aguero'), 'obreros'), fila(obrero('tello', { pagadoEfectivo: 100_000 }), 'obreros')]
  const men = [fila(jefe('maldonado'), 'oficina'), fila(jefe('nievas'), 'oficina')]
  // El defecto, tal como estaba: el pie de todo junto «no cierra por 3.600.000».
  const juntos = cierreDeTotales(totalesDelEspejo([...jor, ...men]))
  assert.equal(juntos?.cierra, false)
  assert.equal(Math.abs(juntos?.diferencia ?? 0), 3_600_000)

  const j = totalesDeJornaleros(jor)
  const m = totalesDeMensuales(men)
  assert.equal(cierreDeTotales(j)?.cierra, true, 'jornaleros solos cierran')
  assert.equal(j.cobra, 2 * 530_000)
  assert.equal(j.mensuales, 0, 'MUTACIÓN: mandar un jefe a jornaleros → mensuales ≠ 0')
  assert.equal(m.sueldo, 3_600_000)
  assert.equal(m.sinRecibo, 2)
  assert.equal(m.redondeo, 0, 'sin recibo no hay billetes sugeridos para los mensuales')
  // El redondeo de jornaleros suma lo que muestran sus celdas: 300.000 y 200.000 (pagó 100.000 en mano).
  assert.equal(j.redondeo, 500_000)

  const g = totalGeneral(j, m)
  assert.equal(g.total, 1_060_000 + 3_600_000)
  assert.equal(g.pagado, 100_000)
  assert.equal(g.saldo, 960_000 + 3_600_000)
  assert.equal(g.cierra, true)
  assert.deepEqual(g.causas, [])
})

test('cuando no cierra dice por cuánto y por qué, sin repartir lo que no sabe', () => {
  const sinNegro = aplicarOverrides(liquidarLinea({
    personaId: 'x', nombre: 'x', horas: 10, tarifa: { valorHora: 5000, netoMensual: null, desde: '2026-09-01', origen: 't' },
    adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
  }, 'obreros'), {}, 'obreros')
  // Sin modelo blanco + negro: tiene cobra 50.000, pero `negroDeLaFila` = cobra − banco, así que sí hay saldo.
  assert.equal(sinNegro.pago.saldoTotal, 50_000)
  // Un Total de cobra escrito a mano que ya no da banco + negro: el total general lo marca y nombra la causa.
  const manual = obrero('aguero', { cobra: 600_000 })
  const j = totalesDeJornaleros([fila(manual, 'obreros'), fila(sinNegro, 'obreros')])
  const g = totalGeneral(j, totalesDeMensuales([]))
  assert.equal(g.cierra, false)
  assert.equal(g.descuadre, 70_000, '600.000 escritos contra 230.000 + 300.000')
  assert.deepEqual(g.causas, [{ causa: 'jornaleros: total escrito a mano distinto de banco + negro', importe: 70_000 }])
})

test('la asistencia del mensual es referencia: días con horas, ausencias y licencias', () => {
  const celdas = [
    { fecha: '2026-09-16', marca: 'cargado', horas: 9 }, { fecha: '2026-09-17', marca: 'ausencia', horas: 0 },
    { fecha: '2026-09-18', marca: 'licencia', horas: 9 }, { fecha: '2026-09-19', marca: 'sin-cargar', horas: null },
  ]
  assert.deepEqual(asistenciaDeReferencia(fila(jefe('maldonado'), 'oficina', celdas)), { dias: 1, horas: 9, ausencias: 1, licencias: 1 })
})
