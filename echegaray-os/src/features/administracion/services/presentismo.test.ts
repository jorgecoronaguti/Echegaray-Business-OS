import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cobraConPresentismo, fechasCortas, importeDePresentismo, presentismoDeLinea, totalesDePresentismo,
  PRESENTISMO_DESDE, PRESENTISMO_PCT, PARTE_EN_BLANCO, type EntradaDePresentismo,
  presentismoNoAplica,
} from './presentismo.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN (cada uno pone en rojo una mutación de la regla):
//
//  1. Que el porcentaje deje de ser 20 % o que las horas no se dividan por 2 (el ejemplo aprobado
//     por el dueño: Agüero, 105 h, oficial → $66.654 exactos).
//  2. Que el básico no sea el de SU categoría (un ayudante con el básico del oficial).
//  3. Que haga falta más de una marca para perderlo, o que «salió antes» no cuente igual que
//     «llegó tarde».
//  4. Que rija antes de la quincena 16–30/09/2026, o sobre jefes, mensuales o un cuadro cerrado.
//  5. Que sin categoría se invente un importe en vez de decir «sin categoría».
//  6. Que el descuento no salga del cobra, o que salga cuando no se perdió (plata nueva).

const AGUERO: EntradaDePresentismo = {
  categoria: 'oficial', basico: 6348, tardanzas: [], quincenaDesde: '2026-09-16',
  modalidad: 'hora', esJefe: false, cerrada: false,
}

test('el ejemplo aprobado: 20 % × (105 ÷ 2) × 6.348 = 66.654 y cobra lo mismo que hoy sin marcas', () => {
  const p = presentismoDeLinea(AGUERO, 105)
  assert.equal(p.estado, 'aplica')
  assert.equal(p.importe, 66654)
  assert.equal(cobraConPresentismo(627000, p), 627000)
})

test('el 20 % y el ÷ 2 son los del convenio: 100 h × 6.348 no da 126.960 ni 253.920', () => {
  assert.equal(importeDePresentismo(100, 6348), 63480)
  assert.notEqual(importeDePresentismo(100, 6348), 126960)
})

test('con UNA marca pierde el presentismo entero: 627.000 − 66.654 = 560.346', () => {
  const p = presentismoDeLinea({ ...AGUERO, tardanzas: [{ fecha: '2026-09-17', llegoTarde: true, salioAntes: false }] }, 105)
  assert.equal(p.estado, 'perdido')
  assert.deepEqual(p.perdido, ['2026-09-17'])
  assert.equal(cobraConPresentismo(627000, p), 560346)
})

test('salir antes cuenta igual que llegar tarde, y dos marcas no descuentan dos veces', () => {
  const p = presentismoDeLinea({ ...AGUERO, tardanzas: [
    { fecha: '2026-09-23', llegoTarde: false, salioAntes: true },
    { fecha: '2026-09-17', llegoTarde: true, salioAntes: true },
  ] }, 105)
  assert.equal(p.estado, 'perdido')
  assert.deepEqual(p.perdido, ['2026-09-17', '2026-09-23'])
  assert.equal(cobraConPresentismo(627000, p), 560346)
  assert.equal(fechasCortas(p.perdido), '17/09, 23/09')
})

test('una marca en falso no es una marca', () => {
  const p = presentismoDeLinea({ ...AGUERO, tardanzas: [{ fecha: '2026-09-17', llegoTarde: false, salioAntes: false }] }, 105)
  assert.equal(p.estado, 'aplica')
})

test('el básico es el de SU categoría: el ayudante no cobra el presentismo del oficial', () => {
  const ayudante = presentismoDeLinea({ ...AGUERO, categoria: 'ayudante', basico: 5399 }, 105)
  assert.equal(ayudante.importe, 56689.5)
  assert.notEqual(ayudante.importe, 66654)
})

test('no rige antes de la quincena 16–30/09/2026: la 01–15/09 no descuenta aunque tenga marcas', () => {
  const marcada = { ...AGUERO, tardanzas: [{ fecha: '2026-09-03', llegoTarde: true, salioAntes: false }] }
  const p = presentismoDeLinea({ ...marcada, quincenaDesde: '2026-09-01' }, 105)
  assert.equal(p.estado, 'no_rige')
  assert.equal(p.importe, null)
  assert.equal(cobraConPresentismo(627000, p), 627000)
  assert.equal(PRESENTISMO_DESDE, '2026-09-16')
  assert.equal(presentismoDeLinea({ ...marcada, quincenaDesde: '2026-10-01' }, 105).estado, 'perdido')
})

test('los jefes y quien cobra por mes quedan afuera; un cuadro cerrado también (lo sellado no se toca)', () => {
  const marcada = { ...AGUERO, tardanzas: [{ fecha: '2026-09-17', llegoTarde: true, salioAntes: false }] }
  assert.equal(presentismoDeLinea({ ...marcada, esJefe: true }, 105).estado, 'no_aplica')
  assert.equal(presentismoDeLinea({ ...marcada, modalidad: 'mensual' }, 105).estado, 'no_aplica')
  const cerrada = presentismoDeLinea({ ...marcada, cerrada: true }, 105)
  assert.equal(cerrada.estado, 'no_rige')
  assert.equal(cobraConPresentismo(627000, cerrada), 627000)
})

test('sin categoría o sin básico: «sin categoría», importe null, y el cobra no cambia aunque haya marca', () => {
  const marcada = { ...AGUERO, tardanzas: [{ fecha: '2026-09-17', llegoTarde: true, salioAntes: false }] }
  const sinCat = presentismoDeLinea({ ...marcada, categoria: null }, 105)
  assert.equal(sinCat.estado, 'sin_categoria')
  assert.equal(sinCat.importe, null)
  assert.equal(cobraConPresentismo(627000, sinCat), 627000)
  assert.equal(presentismoDeLinea({ ...marcada, basico: null }, 105).estado, 'sin_categoria')
  assert.equal(presentismoDeLinea({ ...marcada, basico: 0 }, 105).estado, 'sin_categoria')
})

test('sin horas no hay importe (null, nunca 0) y el cobra no se toca', () => {
  const p = presentismoDeLinea(AGUERO, null)
  assert.equal(p.estado, 'sin_horas')
  assert.equal(p.importe, null)
  assert.equal(cobraConPresentismo(null, p), null)
})

test('el pie: en juego suma a todos los que lo tienen; perdido sólo a quienes lo perdieron', () => {
  const t = totalesDePresentismo([
    { presentismo: presentismoDeLinea(AGUERO, 105) },
    { presentismo: presentismoDeLinea({ ...AGUERO, tardanzas: [{ fecha: '2026-09-17', llegoTarde: true, salioAntes: false }] }, 100) },
    { presentismo: presentismoDeLinea({ ...AGUERO, categoria: null }, 100) },
    { presentismo: null },
  ])
  assert.equal(t.enJuego, 66654 + 63480)
  assert.equal(t.perdido, 63480)
  assert.equal(t.perdidos, 1)
  assert.equal(t.sinCategoria, 1)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA FALTA INJUSTIFICADA TAMBIÉN LO HACE PERDER (dueño, 16/09/2026)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// *«Si tiene falta injustificada, tardanza o retiro anticipado durante la quincena → presentismo = $0»*
// y *«las novedades justificadas/excepciones UOCRA … no tratarse automáticamente como falta
// injustificada»*. Los defectos que estos tests atrapan:
//
//  7. Que una falta injustificada NO descuente (era el hueco: hasta hoy sólo miraba tardanzas).
//  8. Que una LICENCIA (enfermedad, accidente, vacaciones…) descuente: sería quitarle plata a quien
//     tiene derecho, y es exactamente lo que el dueño pidió no hacer automáticamente.
//  9. Que la lluvia, la obra parada o el paro descuenten: no dependen del trabajador.
// 10. Que un día sin motivo cargado descuente solo: no hay falta injustificada probada.
// 11. Que la base deje de ser el 50 % en blanco y se calcule sobre el jornal entero (el doble) o
//     sobre el 50 % en efectivo.

const BASE: EntradaDePresentismo = {
  categoria: 'oficial', basico: 6348, tardanzas: [], ausencias: [], quincenaDesde: '2026-09-16',
  modalidad: 'hora', esJefe: false, cerrada: false,
}
const falta = (fecha: string, motivo: string | null) =>
  ({ fecha, estado: 'ausente' as const, motivo })

test('LA BASE ES EL 50 % EN BLANCO: 105 h × 6.348 × 50 % = 333.270, y el 20 % de eso es el presentismo', () => {
  const p = presentismoDeLinea(BASE, 105)
  assert.equal(p.base, 333270, 'MUTACIÓN: la base se calculó sobre el jornal entero o sobre el efectivo')
  assert.equal(p.importe, 66654)
  // LA CADENA COMPLETA, COMO LA PIDIÓ EL DUEÑO: (básico quincenal × 50 %) × 20 %.
  assert.equal(Math.round(p.base! * PRESENTISMO_PCT * 100) / 100, p.importe)
  assert.equal(PARTE_EN_BLANCO, 0.5)
})

test('una falta injustificada pierde el presentismo entero, igual que una tardanza', () => {
  for (const motivo of ['falta', 'falta_con_aviso']) {
    const p = presentismoDeLinea({ ...BASE, ausencias: [falta('2026-09-18', motivo)] }, 105)
    assert.equal(p.estado, 'perdido', `${motivo} tendría que perderlo`)
    assert.equal(p.importe, 66654, 'el importe se sigue diciendo: es lo que se descuenta')
    assert.deepEqual(p.perdido, ['2026-09-18'])
    assert.equal(p.causas[0].causa, 'falta')
    assert.equal(cobraConPresentismo(627000, p), 560346)
  }
})

test('una LICENCIA no pierde el presentismo: enfermedad, accidente, vacaciones, licencia especial', () => {
  for (const motivo of ['enfermedad', 'accidente', 'accidente_in_itinere', 'vacaciones', 'licencia_especial']) {
    const p = presentismoDeLinea({ ...BASE, ausencias: [{ fecha: '2026-09-18', estado: 'licencia', motivo }] }, 105)
    assert.equal(p.estado, 'aplica', `${motivo} NO puede descontar`)
    assert.equal(cobraConPresentismo(627000, p), 627000, 'no se le puede tocar la plata')
  }
})

test('lo que no depende del trabajador no descuenta: lluvia, obra parada, paro, franco', () => {
  for (const motivo of ['lluvia', 'sin_tarea', 'paro', 'franco']) {
    const p = presentismoDeLinea({ ...BASE, ausencias: [falta('2026-09-18', motivo)] }, 105)
    assert.equal(p.estado, 'aplica', `${motivo} no es una falta injustificada`)
  }
})

test('un día sin motivo o con «Otro» NO descuenta solo: queda a revisar', () => {
  for (const motivo of [null, 'otro']) {
    const p = presentismoDeLinea({ ...BASE, ausencias: [falta('2026-09-18', motivo)] }, 105)
    assert.equal(p.estado, 'a_revisar', 'MUTACIÓN: descontó con un dato que nadie cargó')
    assert.deepEqual(p.aRevisar, ['2026-09-18'])
    assert.equal(cobraConPresentismo(627000, p), 627000, 'no se descuenta hasta que se clasifique')
    assert.deepEqual(p.causas, [])
  }
})

test('una causa probada gana sobre un día sin clasificar', () => {
  const p = presentismoDeLinea({
    ...BASE,
    tardanzas: [{ fecha: '2026-09-17', llegoTarde: true, salioAntes: false }],
    ausencias: [falta('2026-09-21', null)],
  }, 105)
  assert.equal(p.estado, 'perdido', 'la tardanza del 17 lo pierde aunque el 21 esté sin clasificar')
  assert.deepEqual(p.aRevisar, ['2026-09-21'], 'y el día sin clasificar se sigue diciendo')
})

test('las causas se dicen con fecha y motivo, ordenadas: es el «motivo si lo perdió» de la pantalla', () => {
  const p = presentismoDeLinea({
    ...BASE,
    tardanzas: [{ fecha: '2026-09-22', llegoTarde: true, salioAntes: true }],
    ausencias: [falta('2026-09-18', 'falta')],
  }, 105)
  assert.deepEqual(p.causas.map((c) => `${c.fecha} ${c.causa}`),
    ['2026-09-18 falta', '2026-09-22 retiro', '2026-09-22 tardanza'])
  assert.equal(p.causas[0].etiqueta, 'Faltó sin avisar', 'la etiqueta sale del catálogo único')
  assert.deepEqual(p.perdido, ['2026-09-18', '2026-09-22'], 'un día con dos marcas es UN día perdido')
})

test('NO SE TOCAN LAS QUINCENAS ANTERIORES: la falta de una quincena vieja no descuenta nada', () => {
  const p = presentismoDeLinea(
    { ...BASE, quincenaDesde: '2026-09-01', ausencias: [falta('2026-09-05', 'falta')] }, 105)
  assert.equal(p.estado, 'no_rige')
  assert.equal(p.importe, null)
  assert.deepEqual(p.causas, [], 'ni siquiera se listan causas: la regla no rige')
  assert.equal(cobraConPresentismo(627000, p), 627000)
})

test('jefes y mensuales siguen afuera aunque falten', () => {
  const conFalta = { ...BASE, ausencias: [falta('2026-09-18', 'falta')] }
  assert.equal(presentismoDeLinea({ ...conFalta, esJefe: true }, 105).estado, 'no_aplica')
  assert.equal(presentismoDeLinea({ ...conFalta, modalidad: 'mensual' }, 105).estado, 'no_aplica')
})

test('el pie cuenta cuántos quedaron a revisar, sin mezclarlos con los perdidos', () => {
  const t = totalesDePresentismo([
    { presentismo: presentismoDeLinea({ ...BASE, ausencias: [falta('2026-09-18', 'falta')] }, 105) },
    { presentismo: presentismoDeLinea({ ...BASE, ausencias: [falta('2026-09-18', null)] }, 105) },
    { presentismo: presentismoDeLinea(BASE, 105) },
  ])
  assert.equal(t.perdidos, 1)
  assert.equal(t.aRevisar, 1)
  assert.equal(t.perdido, 66654, 'sólo se descuenta el probado')
  assert.equal(t.enJuego, 66654 * 3)
})

// ═══ SUSPENSIÓN Y PERMISO DESCUENTAN (dueño, 16/09/2026) ═══
//
// 12. Que la suspensión deje de descontar porque está guardada como `licencia`. Es el defecto sutil:
//     el estado se mira DESPUÉS del motivo, y si alguien invierte el orden la decisión no se aplica
//     y nadie lo nota — la persona cobra un premio que el dueño decidió que no le corresponde.

test('la SUSPENSIÓN pierde el presentismo aunque esté guardada como licencia', () => {
  // Así la guarda la app: `motivoDeAusencia.ts` la lista entre las licencias porque tiene respaldo
  // documental, y eso decide si se PAGA el día. El premio de asistencia es otra pregunta.
  const p = presentismoDeLinea({ ...BASE, ausencias: [{ fecha: '2026-09-18', estado: 'licencia', motivo: 'suspension' }] }, 105)
  assert.equal(p.estado, 'perdido', 'MUTACIÓN: el estado se evaluó antes que el motivo')
  assert.equal(cobraConPresentismo(627000, p), 560346)
})

test('el PERMISO pierde el presentismo', () => {
  const p = presentismoDeLinea({ ...BASE, ausencias: [falta('2026-09-18', 'permiso')] }, 105)
  assert.equal(p.estado, 'perdido')
  assert.equal(p.causas[0].causa, 'falta')
})

test('lo que NO cambió: las licencias con respaldo siguen sin descontar', () => {
  for (const motivo of ['enfermedad', 'accidente', 'accidente_in_itinere', 'vacaciones', 'licencia_especial']) {
    const p = presentismoDeLinea({ ...BASE, ausencias: [{ fecha: '2026-09-18', estado: 'licencia', motivo }] }, 105)
    assert.equal(p.estado, 'aplica', `${motivo} NO puede descontar`)
  }
  // Y lo que no depende del trabajador tampoco.
  for (const motivo of ['lluvia', 'sin_tarea', 'paro', 'franco']) {
    assert.equal(presentismoDeLinea({ ...BASE, ausencias: [falta('2026-09-18', motivo)] }, 105).estado, 'aplica')
  }
})

// ═══ EL MENSUAL NO LLEVA PRESENTISMO (dueño, 17/09/2026) ═══ Atrapa: que un mensual o un jefe con marcas y
// categoría salga «aplica» o «perdido» (le descontaría un premio que no tiene), que su importe entre en lo que
// está en juego, y que el cambio arrastre al jornalero, que tiene que seguir exactamente igual.

test('mensual → no aplica · mensual: sin importe, sin base, sin causas y no toca el cobra', () => {
  const marcas = {
    tardanzas: [{ fecha: '2026-09-17', llegoTarde: true, salioAntes: false }],
    ausencias: [{ fecha: '2026-09-18', estado: 'ausente' as const, motivo: 'falta' }],
  }
  for (const quien of [{ modalidad: 'mensual' as const, esJefe: false }, { modalidad: 'mensual' as const, esJefe: true }, { modalidad: 'hora' as const, esJefe: true }]) {
    const p = presentismoDeLinea({ ...AGUERO, ...marcas, ...quien }, 105)
    assert.equal(p.estado, 'no_aplica', JSON.stringify(quien))
    assert.equal(p.motivoNoAplica, 'mensual')
    assert.equal(p.importe, null)
    assert.equal(p.base, null)
    assert.deepEqual(p.causas, [])
    assert.deepEqual(p.perdido, [])
    assert.deepEqual(p.aRevisar, [])
    assert.equal(cobraConPresentismo(1_800_000, p), 1_800_000)
  }
  // Antes de la regla también: al mensual no le corresponde nunca, no «todavía».
  assert.equal(presentismoDeLinea({ ...AGUERO, modalidad: 'mensual', quincenaDesde: '2026-09-01' }, 105).estado, 'no_aplica')
})

test('el mensual no suma a lo que está en juego ni a lo perdido; el jornalero de al lado sigue igual', () => {
  const jornalero = presentismoDeLinea({ ...AGUERO, tardanzas: [{ fecha: '2026-09-17', llegoTarde: true, salioAntes: false }] }, 105)
  assert.equal(jornalero.estado, 'perdido')
  assert.equal(jornalero.importe, 66654)
  const t = totalesDePresentismo([
    { presentismo: jornalero },
    { presentismo: presentismoDeLinea({ ...AGUERO, modalidad: 'mensual', tardanzas: jornalero.causas.map(() => ({ fecha: '2026-09-17', llegoTarde: true, salioAntes: false })) }, 105) },
    { presentismo: presentismoNoAplica() },
  ])
  assert.deepEqual(t, { enJuego: 66654, perdido: 66654, perdidos: 1, sinCategoria: 0, aRevisar: 0 })
})

test('un cuadro cerrado sigue siendo foto aunque sea de un mensual: no se reescribe como no_aplica', () => {
  assert.equal(presentismoDeLinea({ ...AGUERO, modalidad: 'mensual', cerrada: true }, 105).estado, 'no_rige')
})
