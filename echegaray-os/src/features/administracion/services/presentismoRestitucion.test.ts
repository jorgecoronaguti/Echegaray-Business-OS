// LA RESTITUCIÓN MANUAL DEL PRESENTISMO (dueño, 30/09/2026): «perdido 24/09» pasa a ser un botón que vuelve a
// considerar el presentismo a esa persona.
//
// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN (cada uno se pone en rojo revirtiendo su pieza):
//
//  1. Que la restitución exista en la base pero el cálculo la ignore: la celda seguiría «perdido» y el 0426 seguiría
//     anulando el 0425 en el blanco (test 1 y 3).
//  2. Que perdone de más: una tardanza cargada DESPUÉS de restituir (otra fecha) tiene que volver a perder el
//     presentismo. Perdonar el «24/09» no es perdonar el «29/09» (test 2).
//  3. Que la plata no salga por el camino normal: el blanco tiene que subir exactamente el 0425 y desaparecer el
//     0426, sin tocar el negro (test 3).
//  4. Que la lectura de la pantalla no le pase la restitución al cálculo, o que la acción deje escribir en una
//     quincena cerrada o a quien no liquida (tests 4 y 5).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cobraConPresentismo, presentismoDeLinea, type EntradaDePresentismo } from './presentismo.ts'
import { aplicarOverrides } from './liquidacionOverrides.ts'
import { liquidarLinea } from './liquidacionQuincena.ts'
import { entradaDeBlanco, type BaseDelEstimado, type ReciboDeSueldo } from './sueldoBlancoNegro.ts'
import { reglasDelRecibo, type ConceptoDeRecibo, type ReciboParaReglas, type SeccionDelConcepto } from './reglasDelRecibo.ts'
import { decidirRestitucion } from './presentismoRestitucionRegla.ts'

const TARDANZA_24 = { fecha: '2026-09-24', llegoTarde: true, salioAntes: false }
const RESTITUCION = { por: 'Jorge', en: '2026-09-30T15:00:00Z', motivo: null, fechas: ['2026-09-24'] }
const AGUERO: EntradaDePresentismo = {
  categoria: 'oficial', basico: 6348, tardanzas: [TARDANZA_24], quincenaDesde: '2026-09-16',
  modalidad: 'hora', esJefe: false, cerrada: false,
}

test('1. restituida, la persona vuelve a «cumple»: mismo importe, no descuenta y queda dicho quién y qué se perdonó', () => {
  const perdido = presentismoDeLinea(AGUERO, 105)
  assert.equal(perdido.estado, 'perdido')
  assert.equal(cobraConPresentismo(627000, perdido), 560346)

  const p = presentismoDeLinea({ ...AGUERO, restitucion: RESTITUCION }, 105)
  assert.equal(p.estado, 'aplica')
  assert.equal(p.importe, 66654)
  assert.deepEqual(p.perdido, [], 'ya no figura como perdido: ninguna pantalla lo cuenta como pérdida')
  assert.equal(cobraConPresentismo(627000, p), 627000, 'la plata vuelve por el camino normal')
  assert.equal(p.restituido?.por, 'Jorge')
  assert.deepEqual(p.restituido?.fechas, ['2026-09-24'])
})

test('2. una tardanza posterior NO está perdonada: vuelve a perder, y la restitución previa no la tapa', () => {
  const p = presentismoDeLinea({
    ...AGUERO, restitucion: RESTITUCION,
    tardanzas: [TARDANZA_24, { fecha: '2026-09-29', llegoTarde: true, salioAntes: false }],
  }, 105)
  assert.equal(p.estado, 'perdido')
  assert.deepEqual(p.perdido, ['2026-09-24', '2026-09-29'])
  assert.equal(p.restituido ?? null, null)
})

// El blanco estimado de Q2-09 con las mismas reglas que las del estudio (fixture del 0425/0426 real).
type Tupla = [string, string, number, number, number, number, [string, string, number | null, number | null, number][]]
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/recibos-2026-q2-06-a-q2-08.json', import.meta.url), 'utf8')) as
  { rosales: string; catalogo: Record<string, string>; recibos: Tupla[] }
const SECCION: Record<string, SeccionDelConcepto> = { R: 'remunerativo', N: 'no_remunerativo', D: 'descuento', C: 'contribucion' }
const CUIL = '20358508783'
const RECIBOS: ReciboParaReglas[] = FIXTURE.recibos.map(([alias, periodo, valorHora, hn, hf, ho, cs]) => ({
  persona: alias === FIXTURE.rosales ? CUIL : alias, periodo, valorHora, horasNormales: hn, horasFeriado: hf, horasOtras: ho,
  conceptos: cs.map(([codigo, s, unidad, base, monto]): ConceptoDeRecibo => ({ codigo, descripcion: FIXTURE.catalogo[codigo], seccion: SECCION[s], unidad, base, monto })),
}))
const BASE: BaseDelEstimado = { periodo: 'Q2-09/2026', reglas: reglasDelRecibo(RECIBOS, 'Q2-09/2026'), feriados: 0, recibos: RECIBOS, presentismoPropio: true }
const RECIBO_ANTERIOR: ReciboDeSueldo = {
  personaId: 'rosales', cuil: CUIL, periodo: 'Q2-08/2026', categoria: 'Oficial',
  valorHora: 6348, horasBlanco: 50, bruto: 317400, descuentos: 87159.88, neto: 230240.12, driveFileId: 'pdf',
}
const blanco = entradaDeBlanco({
  personaId: 'rosales', cuil: CUIL, periodo: 'Q2-09/2026', recibos: [RECIBO_ANTERIOR], pisoCategoria: 6348, netoDeNomina: null, base: BASE,
})
const linea = liquidarLinea({
  personaId: 'rosales', nombre: 'ROSALES', nombreOrden: 'ROSALES',
  horas: 100, tarifa: { valorHora: 5000, netoMensual: null, desde: '2026-09-16', origen: 'test' },
  adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: true,
}, 'obreros')

test('3. el blanco sube por el camino normal: aparece el 0425, desaparece el 0426 y el negro no se toca', () => {
  const entrada = { ...AGUERO, basico: 6348 }
  const antes = aplicarOverrides(linea, {}, 'obreros', null, blanco, entrada)
  const despues = aplicarOverrides(linea, {}, 'obreros', null, blanco, { ...entrada, restitucion: RESTITUCION })
  const lineas = (l: typeof antes) => l.sueldo?.reciboEstimado?.lineas ?? []
  const monto = (l: typeof antes, c: string) => lineas(l).find((x) => x.codigo === c)?.monto
  assert.equal(antes.presentismo?.estado, 'perdido')
  assert.ok(monto(antes, '0426') != null, 'perdido: el 0426 anula el 0425')
  assert.equal(despues.presentismo?.estado, 'aplica')
  assert.equal(monto(despues, '0426'), undefined, 'restituido: sin 0426')
  assert.ok((monto(despues, '0425') ?? 0) > 0)
  assert.ok((despues.sueldo?.neto ?? 0) > (antes.sueldo?.neto ?? 0), 'el neto del blanco sube')
  assert.equal(despues.sueldo?.negro, antes.sueldo?.negro, 'el negro no se toca')
  const esperado = (antes.total ?? 0) + ((despues.sueldo?.neto ?? 0) - (antes.sueldo?.neto ?? 0))
  assert.ok(Math.abs((despues.total ?? 0) - esperado) < 0.01, 'el total sigue al blanco (a menos del centavo de coma flotante)')
})

test('4. la decisión: sólo se restituye lo que está perdido, en quincena abierta, y deshacer no exige nada más', () => {
  assert.equal(decidirRestitucion({ estaCerrada: true, fechasPerdidas: ['2026-09-24'] }).ok, false)
  assert.equal(decidirRestitucion({ estaCerrada: false, fechasPerdidas: [] }).ok, false, 'nada que restituir: no se guarda una fila vacía')
  const ok = decidirRestitucion({ estaCerrada: false, fechasPerdidas: ['2026-09-24'] })
  assert.deepEqual(ok.ok && ok.fechas, ['2026-09-24'])
})

test('5. la pantalla le entrega la restitución al cálculo, y la acción vive detrás de la puerta de Liquidación', () => {
  const servicio = readFileSync(new URL('./liquidacionQuincenaService.ts', import.meta.url), 'utf8')
  assert.match(servicio, /restitucion: restituciones\.get\(l\.personaId\)/)
  const acciones = readFileSync(new URL('./presentismoRestitucionActions.ts', import.meta.url), 'utf8')
  assert.match(acciones, /puedeLiquidar|permisoDeLiquidacion/)
  const regla = readFileSync(new URL('./presentismoRestitucionRegla.ts', import.meta.url), 'utf8')
  assert.match(regla, /quincena está cerrada/)
  // El efecto se lee de vuelta: un 204 no prueba una escritura.
  assert.match(acciones, /\.select\(/)
})

test('6. deshacer no borra ni pisa lo anotado: sella quién y cuándo, y la lectura sólo toma las vigentes', () => {
  const acciones = readFileSync(new URL('./presentismoRestitucionActions.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(acciones, /\.delete\(|\.upsert\(/, 'ni delete ni upsert: se perdería lo anotado')
  assert.match(acciones, /deshecho_por: quien\.id/)
  const lectura = readFileSync(new URL('./presentismoRestitucionService.ts', import.meta.url), 'utf8')
  assert.match(lectura, /\.is\('deshecho_en', null\)/, 'una restitución deshecha no puede seguir perdonando')
  const sql = readFileSync(new URL('../../../../supabase/migrations/20260930T2000_presentismo_restitucion.sql', import.meta.url), 'utf8')
  assert.doesNotMatch(sql, /for delete/, 'la tabla no tiene policy de borrado')
})
