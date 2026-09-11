import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  avisoDeReapertura, compararValorHora, estadoDeCierre, filasDeQuincenaCerrada, sellarLineas,
  validarMotivoDeReapertura, type LineaParaCerrar, type SelloDeLinea,
} from './liquidacionCierre.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//  1. Cerrar una quincena a la que le falta una tarifa: el sello vuelve indistinguible una línea
//     incompleta de una correcta, y a esa persona se le pagó de menos con firma.
//  2. Sellar `valor_hora` en NULL. La base lo aceptaría (el CHECK sólo exige `sellado_en`) y la
//     línea diría «se liquidó sin tarifa», que es falso sobre plata entregada en mano.
//  3. «$/h hoy: igual» cuando hoy no hay tarifa. Afirmaría que la retribución se mantuvo cuando lo
//     que pasó es que desapareció.
//  4. Reabrir y mostrar la diferencia DESPUÉS: pedirle a alguien que compare contra un número que
//     ya no existe.
//  5. Un motivo de reapertura vacío o de dos letras: la firma sin contenido explica lo mismo que
//     el silencio.

const linea = (p: Partial<LineaParaCerrar>): LineaParaCerrar => ({
  personaId: 'p1', nombre: 'Aguero Cristian', horas: 96, valorHora: 5250, netoMensual: null,
  modalidad: 'hora', cobra: 504000,
  porBanco: 215565, enEfectivo: 188435, total: 404000, sinTarifa: false, reciboSinGiro: false,
  ...p,
})

/** Una fila de Oficina: neto mensual acordado, sin horas y con valor hora NULL por definición. */
const oficina = (p: Partial<LineaParaCerrar> = {}): LineaParaCerrar => linea({
  personaId: 'o1', nombre: 'Maldonado Ana Laura', horas: null, valorHora: null,
  netoMensual: 1800000, modalidad: 'mensual', cobra: 1800000,
  porBanco: 0, enEfectivo: 1800000, total: 1800000, sinTarifa: false, ...p,
})

test('no se puede cerrar con una línea sin tarifa, y el botón dice quién', () => {
  const e = estadoDeCierre([
    linea({}),
    linea({ personaId: 'p2', nombre: 'Castillo Benitez Juan Carlos', valorHora: null, cobra: null, sinTarifa: true }),
  ])
  assert.equal(e.puedeCerrar, false)
  assert.equal(e.liquidadas, 1)
  assert.equal(e.personas, 2)
  assert.match(e.pendientes[0].texto, /Castillo Benitez Juan Carlos/)
})

test('sin pendientes se puede cerrar, y el total sellado no incluye lo que no se liquidó', () => {
  const e = estadoDeCierre([
    linea({}),
    linea({ personaId: 'p3', cobra: 660000, porBanco: 330000, enEfectivo: 330000, total: 660000 }),
  ])
  assert.equal(e.puedeCerrar, true)
  assert.equal(e.pendientes.length, 0)
  assert.equal(e.totalSellado, 1064000)
})

test('un recibo sin giro NO bloquea el cierre: es un estado legítimo (R7)', () => {
  const e = estadoDeCierre([linea({ reciboSinGiro: true })])
  assert.equal(e.puedeCerrar, true)
})

test('sellar copia el valor hora, la categoría y el convenio del legajo, con fecha', () => {
  const { selladas, sinSellar } = sellarLineas(
    [linea({})],
    [{ personaId: 'p1', categoria: 'Oficial', convenio: 'UOCRA — Ley 22.250 (construcción)' }],
    '2026-09-09T18:00:00.000Z',
  )
  assert.equal(sinSellar.length, 0)
  assert.deepEqual(selladas[0], {
    persona_id: 'p1', horas: 96, valor_hora: 5250,
    categoria_sellada: 'Oficial', convenio_sellado: 'UOCRA — Ley 22.250 (construcción)',
    sellado_en: '2026-09-09T18:00:00.000Z',
  })
})

test('una línea sin valor hora NO se sella: se devuelve por nombre', () => {
  const { selladas, sinSellar } = sellarLineas(
    [linea({ valorHora: null, nombre: 'Zogbe Fabian' })], [], '2026-09-09T18:00:00.000Z',
  )
  assert.equal(selladas.length, 0)
  assert.deepEqual(sinSellar, ['Zogbe Fabian'])
})

test('«$/h hoy» sin tarifa vigente dice «sin dato», nunca «igual»', () => {
  assert.equal(compararValorHora(5250, null), 'sin dato')
  assert.equal(compararValorHora(null, 5250), 'sin dato')
  assert.equal(compararValorHora(5250, 5250), 'igual')
  assert.equal(compararValorHora(7500, 8125), 'cambió')
})

test('reabrir avisa la diferencia ANTES de guardar, y sólo lista las que cambian', () => {
  const hoy: Record<string, number | null> = { p1: 8125, p2: 3650, p3: 5250 }
  const aviso = avisoDeReapertura(
    [
      { personaId: 'p1', nombre: 'Maldonado', horas: 88, valorHoraSellado: 7500, cobraSellado: 660000 },
      { personaId: 'p3', nombre: 'Aguero', horas: 96, valorHoraSellado: 5250, cobraSellado: 504000 },
    ],
    (id) => hoy[id] ?? null,
  )
  assert.equal(aviso.sinCambios, false)
  assert.equal(aviso.cambian.length, 1)
  assert.equal(aviso.cambian[0].nombre, 'Maldonado')
  assert.equal(aviso.cambian[0].cobraRecalculado, 715000)
  assert.equal(aviso.total, 55000)
})

test('reabrir sin ningún cambio lo dice: sinCambios, y el total es 0', () => {
  const aviso = avisoDeReapertura(
    [{ personaId: 'p3', nombre: 'Aguero', horas: 96, valorHoraSellado: 5250, cobraSellado: 504000 }],
    () => 5250,
  )
  assert.equal(aviso.sinCambios, true)
  assert.equal(aviso.total, 0)
})

test('una persona que hoy no tiene tarifa entra en el aviso: no se puede recalcular su línea', () => {
  const aviso = avisoDeReapertura(
    [{ personaId: 'p9', nombre: 'Alaniz', horas: 105, valorHoraSellado: 3400, cobraSellado: 357000 }],
    () => null,
  )
  assert.equal(aviso.sinCambios, false)
  assert.equal(aviso.cambian[0].diferencia, null)
})

test('el motivo de reapertura tiene que estar escrito', () => {
  assert.equal(validarMotivoDeReapertura('   ').ok, false)
  assert.equal(validarMotivoDeReapertura('ok').ok, false)
  const r = validarMotivoDeReapertura('  Faltó   cargar el jueves 27  ')
  assert.deepEqual(r, { ok: true, motivo: 'Faltó cargar el jueves 27' })
})

// ═══ PANTALLA 11 · «$/h HOY» TIENE QUE PODER DECIR «CAMBIÓ» ═══
//
// La pantalla comparaba el valor hora contra SÍ MISMO y decía «igual» siempre. Estos tres casos
// mueren si alguien vuelve a alimentar la comparación con una sola fuente: el primero exige rojo
// donde la tarifa cambió, el segundo exige que dos fuentes distintas puedan coincidir de verdad, y
// el tercero exige que la ausencia de tarifa no se disfrace de «igual».

const sello = (valorHora: number | null): SelloDeLinea => ({
  horas: 88, valorHora, cobra: valorHora == null ? null : 88 * valorHora,
  porBanco: 0, enEfectivo: null, total: null,
})

const PERSONAS = [
  { personaId: 'p1', nombre: 'Maldonado', horas: 88 },
  { personaId: 'p2', nombre: 'Aguero', horas: 96 },
  { personaId: 'p3', nombre: 'Alaniz', horas: 105 },
]

test('pantalla 11 · el sellado se compara contra la tarifa VIGENTE, no contra sí mismo', () => {
  const filas = filasDeQuincenaCerrada(
    PERSONAS,
    new Map([['p1', sello(7_500)], ['p2', sello(5_250)], ['p3', sello(3_400)]]),
    new Map([['p1', 8_125], ['p2', 5_250]]),
  )
  assert.equal(filas[0].comparacion, 'cambió', 'subir la tarifa tiene que dar rojo')
  assert.equal(filas[0].valorHoraSellado, 7_500, 'el sellado NO se pisa con el de hoy')
  assert.equal(filas[0].valorHoraHoy, 8_125)
  assert.equal(filas[1].comparacion, 'igual', 'dos fuentes que coinciden de verdad')
  // R1: sin tarifa vigente hoy, «igual» afirmaría que la retribución se mantuvo. Desapareció.
  assert.equal(filas[2].comparacion, 'sin dato')
})

test('pantalla 11 · sin línea sellada no se completa con el cálculo de hoy', () => {
  const filas = filasDeQuincenaCerrada(PERSONAS.slice(0, 1), new Map(), new Map([['p1', 8_125]]))
  assert.equal(filas[0].valorHoraSellado, null)
  assert.equal(filas[0].cobra, null, 'publicar un cobra recalculado diría que se pagó algo que nadie selló')
  assert.equal(filas[0].total, null)
  assert.equal(filas[0].comparacion, 'sin dato')
})

// ═══ EL DEFECTO 6: EL CIERRE NO SE HABILITABA NUNCA CON EL PLANTEL REAL ═══
//
// `estadoDeCierre` contaba como pendiente a toda línea con `valorHora == null`, y la gente de
// Oficina cobra un neto MENSUAL: su valor hora es NULL siempre. Con Oficina en la quincena —o sea,
// siempre— el botón «Cerrar y sellar» quedaba gris para todo el plantel. Si se revierte el arreglo,
// el primero de estos tres tests se pone rojo.

test('OFICINA CON NETO MENSUAL NO ES «SIN TARIFA»: la quincena con obreros y oficina cierra', () => {
  const e = estadoDeCierre([linea({}), oficina()])
  assert.equal(e.puedeCerrar, true, 'un neto mensual cargado es una tarifa, no un hueco')
  assert.deepEqual(e.pendientes, [])
  assert.equal(e.liquidadas, 2)
  assert.equal(e.totalSellado, 2204000)
})

test('la MISMA persona de oficina sin neto y sin valor hora SÍ queda pendiente «sin tarifa»', () => {
  const e = estadoDeCierre([
    linea({}),
    oficina({ netoMensual: null, cobra: null, enEfectivo: null, total: null }),
  ])
  assert.equal(e.puedeCerrar, false)
  assert.equal(e.pendientes[0].clave, 'sin-tarifa')
  assert.match(e.pendientes[0].texto, /Maldonado Ana Laura/)
  assert.equal(e.liquidadas, 1)
})

test('un obrero (modalidad hora) sin valor hora sigue bloqueando: R1 no se relajó', () => {
  const e = estadoDeCierre([oficina(), linea({ personaId: 'p9', nombre: 'Alaniz', valorHora: null })])
  assert.equal(e.puedeCerrar, false)
  assert.equal(e.pendientes[0].clave, 'sin-tarifa')
  assert.match(e.pendientes[0].texto, /Alaniz/)
})

test('oficina se sella con valor_hora NULL: el neto ya está en «cobra», no se inventa un $/h', () => {
  const { selladas, sinSellar } = sellarLineas(
    [oficina()],
    [{ personaId: 'o1', categoria: 'Administrativa', convenio: 'Fuera de convenio' }],
    '2026-09-10T12:00:00.000Z',
  )
  assert.deepEqual(sinSellar, [], 'una línea mensual NO queda sin sellar')
  assert.deepEqual(selladas[0], {
    persona_id: 'o1', horas: null, valor_hora: null,
    categoria_sellada: 'Administrativa', convenio_sellado: 'Fuera de convenio',
    sellado_en: '2026-09-10T12:00:00.000Z',
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// UNA AUSENCIA SIN MOTIVO TRABA EL SELLO — la misma traba que la grilla de Horas
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// EL DEFECTO, visto en la pantalla real el 11/09/2026 sobre la 1ª quincena de septiembre:
//
//   solapa Horas   →  «PENDIENTE · 9 ausencias sin motivo ›»  y  «Cerrar quincena» GRIS
//   solapa Cierre  →  «Cerrar y sellar» AMARILLO Y ACTIVO
//
// La misma quincena, la misma acción, dos criterios — y el que sella era el permisivo. `estadoDeCierre`
// sólo miraba tarifas, importes y que la cadena cerrara; las ausencias sin motivo las contaba nada más
// que la grilla.
//
// No es cosmético: sin motivo el día vale 0 h (R4). El día que alguien le ponga el motivo, ese día
// puede pasar a valer la jornada entera. Sellar antes congela el 0 y manda la corrección al camino de
// «reabrir con motivo escrito», que existe para los errores y no para lo que ya se sabía que faltaba.

test('LAS AUSENCIAS SIN MOTIVO TRABAN EL CIERRE Y SE NOMBRAN', () => {
  const completa = [linea({ personaId: 'p1', nombre: 'A', cobra: 100, porBanco: 0, enEfectivo: 100, total: 100 })]
  // Sin la traba, esta quincena cierra: no le falta ni una tarifa ni un importe.
  assert.equal(estadoDeCierre(completa).puedeCerrar, true)
  // EL DEFECTO QUE ATRAPA: con nueve ausencias sin motivo seguía diciendo que sí.
  const con = estadoDeCierre(completa, { diasSinMotivo: 9 })
  assert.equal(con.puedeCerrar, false)
  const p = con.pendientes.find((x) => x.clave === 'sin-motivo')
  assert.ok(p, 'el pendiente tiene que tener nombre propio, no ser un botón gris sin explicación')
  assert.equal(p.cuantas, 9)
  assert.match(p.texto, /9 ausencia/)
})

test('CERO AUSENCIAS SIN MOTIVO NO INVENTA UN PENDIENTE', () => {
  // El control tiene que poder decir SÍ: si trabara siempre, nadie podría cerrar nunca y el botón
  // gris dejaría de significar algo.
  const completa = [linea({ personaId: 'p1', nombre: 'A', cobra: 100, porBanco: 0, enEfectivo: 100, total: 100 })]
  for (const carga of [{}, { diasSinMotivo: 0 }]) {
    const e = estadoDeCierre(completa, carga)
    assert.equal(e.puedeCerrar, true)
    assert.equal(e.pendientes.filter((x) => x.clave === 'sin-motivo').length, 0)
  }
})
