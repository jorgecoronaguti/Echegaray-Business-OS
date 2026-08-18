import test from 'node:test'
import assert from 'node:assert/strict'

import {
  deCargasSociales, mesesCubiertos, cubiertaPorLaCadena, cargasEnCompras, reemplazadasPorLaCadena,
  rangosDeCargas, ROTULOS_CARGAS, NOMBRES_CARGAS, RUBRO_CARGAS, RUBRO_GREMIALES, PESTANA_CARGAS,
} from './libro-extractores-cargas.mjs'
import { deCompras } from './libro-extractores.mjs'
import { serialDe } from './libro-extractores-fechas.mjs'
import { verificarRangos } from './rangos-con-nombre.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

// ═══ LOS DATOS SON LOS REALES, MEDIDOS CONTRA EL SHEET EL 06/08/2026 ═══
//
// La cadena (sección 4 de "Cargas Sociales", "⇒ Total devengado en el mes") para jul–dic:
//   jul 8.569.344,73 · ago 7.608.663 · sep 8.633.543 · oct 9.082.359 · nov 9.121.411 · dic 10.507.157
// y cada uno sale de la caja el 10 del mes siguiente — diciembre, el 10/01/2027.
const S = (iso) => serialDe(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)))
const NADA = ''
/** Los doce meses: 1..6 vacíos (ya declarados y pagados), 7..12 con la proyección de la cadena. */
const FECHAS = [NADA, NADA, NADA, NADA, NADA, NADA,
  S('2026-08-10'), S('2026-09-10'), S('2026-10-10'), S('2026-11-10'), S('2026-12-10'), S('2027-01-10')]
const F931 = [NADA, NADA, NADA, NADA, NADA, NADA, 6955255, 6162164, 7015286, 7385454, 7421414, 8551190]
const GREMIALES = [NADA, NADA, NADA, NADA, NADA, NADA, 1614090, 1446499, 1618257, 1696905, 1699997, 1955967]
const CORTE = S('2026-08-06')

test('la cadena entra al libro: una fila por mes devengado, con la fecha que publica la pestaña', () => {
  const ms = deCargasSociales({ fechas: FECHAS, f931: F931, gremiales: GREMIALES }, CORTE)
  assert.equal(ms.length, 12, 'seis meses × dos rubros: F931 y gremiales viajan separados')
  const primero = ms.find((m) => m.rubro === RUBRO_CARGAS)
  assert.equal(primero.fecha, S('2026-08-10'))
  assert.equal(primero.importe, 6955255)
  assert.equal(primero.signo, -1)
  assert.equal(primero.estado, 'PROYECTADO')
  assert.equal(primero.origen.pestana, PESTANA_CARGAS)
})

test('EL DEVENGADO DE DICIEMBRE SALE EN ENERO DEL AÑO SIGUIENTE — y nadie lo levantaba', () => {
  const ms = deCargasSociales({ fechas: FECHAS, f931: F931, gremiales: GREMIALES }, CORTE)
  const enero = ms.filter((m) => m.fecha === S('2027-01-10'))
  assert.equal(enero.length, 2, 'el devengado de diciembre tiene que estar, y con sus dos rubros')
  assert.equal(enero.reduce((a, m) => a + m.importe, 0), 8551190 + 1955967)
})

test('cada mes es un movimiento distinto: la clave no puede colapsar los seis en uno', () => {
  const ms = deCargasSociales({ fechas: FECHAS, f931: F931, gremiales: GREMIALES }, CORTE)
  assert.equal(new Set(ms.map((m) => m.clave)).size, ms.length,
    'dos meses con la misma clave: uno de los dos desaparece del libro sin que ninguna suma se rompa')
})

test('un vencimiento que ya pasó y nadie pagó es VENCIDO, no PROYECTADO', () => {
  const ms = deCargasSociales({ fechas: FECHAS, f931: F931, gremiales: GREMIALES }, S('2026-10-01'))
  const ago = ms.find((m) => m.fecha === S('2026-08-10') && m.rubro === RUBRO_CARGAS)
  assert.equal(ago.estado, 'VENCIDO')
})

test('EL HECHO LE GANA A LA PROYECCIÓN: el mes que Compras ya pagó, la cadena no lo emite', () => {
  const avisos = []
  const ms = deCargasSociales({ fechas: FECHAS, f931: F931, gremiales: GREMIALES }, CORTE,
    { mesesPagados: new Set([`2026-08·${RUBRO_CARGAS}`, `2026-08·${RUBRO_GREMIALES}`]), aviso: (m) => avisos.push(m) })
  assert.equal(ms.filter((m) => m.fecha === S('2026-08-10')).length, 0,
    'la cadena volvió a proyectar un mes que ya salió de la caja: son $8,5M contados dos veces')
  assert.equal(ms.length, 10)
  assert.match(avisos.join(' '), /2026-08/, 'saltear un mes en silencio esconde por qué el cuadro bajó')
})

test('sin la serie publicada no hay movimientos — y por lo tanto no hay exclusión', () => {
  assert.deepEqual(deCargasSociales({}, CORTE), [])
  assert.deepEqual(deCargasSociales({ fechas: [], f931: [], gremiales: [] }, CORTE), [])
  assert.equal(mesesCubiertos([]).size, 0)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA PRECEDENCIA CONTRA COMPRAS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Compras, con su encabezado real en la fila 3 y las columnas que el extractor resuelve por rótulo. */
const ENC = ['Fecha', 'x', 'Fecha factura', 'y', 'Proveedor', 'CUIT (OS)', 'N° Comprobante', 'z', 'w',
  'Cliente / Asignación', 'Detalles / Obra', 'a', 'b', 'c', 'Total', 'Estado', 'Tipo pago',
  'Monto Pagado', 'Monto Parcial 2', 'Rubro de caja', 'Fecha de caja']
const I = Object.fromEntries(ENC.map((n, i) => [n, i]))
const filaCompras = ({ prov, total, estado, rubro, fecha, tipo = 'Transferencia' }) => {
  const f = Array(ENC.length).fill('')
  f[I.Proveedor] = prov; f[I.Total] = total; f[I.Estado] = estado
  f[I['Rubro de caja']] = rubro; f[I['Fecha de caja']] = fecha; f[I['Tipo pago']] = tipo
  return f
}
/** Las filas reales de Compras del 06/08: dos pagadas de julio y las previstas de agosto. */
const COMPRAS = [[], [], ENC,
  filaCompras({ prov: 'ARCA', total: 8974572, estado: 'Pagado', rubro: RUBRO_CARGAS, fecha: S('2026-06-10') }),
  filaCompras({ prov: 'ARCA', total: 8000000, estado: 'Proyectado', rubro: RUBRO_CARGAS, fecha: S('2026-08-10') }),
  filaCompras({ prov: 'FCL', total: 800000, estado: 'Proyectado', rubro: RUBRO_GREMIALES, fecha: S('2026-08-10') }),
  filaCompras({ prov: 'SINDICATOS', total: 700000, estado: 'Proyectado', rubro: RUBRO_GREMIALES, fecha: S('2026-08-17') }),
  filaCompras({ prov: 'ARCA', total: 2494876, estado: 'Pendiente', rubro: 'Deuda previsional (planes de pago)', fecha: S('2026-08-16') }),
]

test('cargasEnCompras separa lo pagado (el mes que la cadena no debe emitir) de lo previsto', () => {
  const { mesesPagados, previstas } = cargasEnCompras(COMPRAS)
  assert.deepEqual([...mesesPagados], [`2026-06·${RUBRO_CARGAS}`])
  assert.equal(previstas.length, 3, 'las tres previstas de agosto; la cuota del plan NO es de este rubro')
  assert.equal(previstas.reduce((a, p) => a + p.total, 0), 9500000)
})

test('LA CADENA PUBLICA → LAS FILAS PLANAS DE COMPRAS NO ENTRAN (y las pagadas sí)', () => {
  const cadena = deCargasSociales({ fechas: FECHAS, f931: F931, gremiales: GREMIALES }, CORTE)
  const cubiertos = mesesCubiertos(cadena)
  const libro = deCompras(COMPRAS, CORTE, { cargasCubiertas: cubiertos })
  const rubros = libro.map((m) => `${m.rubro}|${m.importe}`)
  assert.ok(!rubros.some((r) => r.startsWith(`${RUBRO_CARGAS}|8000000`)), 'entró la fila plana de $8.000.000')
  assert.ok(!rubros.some((r) => r.startsWith(`${RUBRO_GREMIALES}|`)), 'entraron los gremiales planos')
  assert.ok(rubros.includes(`${RUBRO_CARGAS}|8974572`), 'la fila PAGADA de junio tiene que seguir entrando')
  assert.ok(rubros.includes('Deuda previsional (planes de pago)|2494876'),
    'las cuotas de planes NO las cubre la cadena: si desaparecen, faltan $2,97M en agosto')
})

test('FAIL-SAFE: si la cadena no publica, Compras vuelve a entrar entero', () => {
  const libro = deCompras(COMPRAS, CORTE, { cargasCubiertas: mesesCubiertos([]) })
  const total = libro.reduce((a, m) => a + m.importe, 0)
  assert.equal(total, 8974572 + 8000000 + 800000 + 700000 + 2494876,
    'un rango con nombre vacío no puede significar "borrá la proyección de cargas del cash flow"')
  // Y el default: quien no pasa la opción se comporta como antes de que esto existiera.
  assert.equal(deCompras(COMPRAS, CORTE).length, libro.length)
})

test('la exclusión es por (MES · RUBRO) CUBIERTO: septiembre sin cadena sigue saliendo de Compras', () => {
  const sept = filaCompras({ prov: 'ARCA', total: 6500000, estado: 'Proyectado', rubro: RUBRO_CARGAS, fecha: S('2026-09-10') })
  const libro = deCompras([...COMPRAS, sept], CORTE, { cargasCubiertas: new Set([`2026-08·${RUBRO_CARGAS}`]) })
  assert.ok(libro.some((m) => m.importe === 6500000), 'se excluyó un mes que la cadena no cubre')
})

test('cubiertaPorLaCadena: los tres motivos por los que una fila NO se excluye', () => {
  const cubiertos = new Set([`2026-08·${RUBRO_CARGAS}`])
  const base = { rubro: RUBRO_CARGAS, fecha: S('2026-08-10'), pagada: false }
  assert.equal(cubiertaPorLaCadena(base, cubiertos), true)
  assert.equal(cubiertaPorLaCadena({ ...base, pagada: true }, cubiertos), false, 'una salida real no se descarta nunca')
  assert.equal(cubiertaPorLaCadena({ ...base, rubro: 'Materiales' }, cubiertos), false)
  assert.equal(cubiertaPorLaCadena({ ...base, fecha: S('2026-09-10') }, cubiertos), false)
  assert.equal(cubiertaPorLaCadena(base, new Set()), false, 'sin cadena publicada no se excluye nada')
})

test('reemplazadasPorLaCadena da el monto del swap: una exclusión sin monto no se audita', () => {
  const cadena = deCargasSociales({ fechas: FECHAS, f931: F931, gremiales: GREMIALES }, CORTE)
  const r = reemplazadasPorLaCadena(cargasEnCompras(COMPRAS), mesesCubiertos(cadena))
  assert.equal(r.length, 3)
  assert.equal(r.reduce((a, x) => a + x.total, 0), 9500000)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA GEOMETRÍA PUBLICADA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('los tres rangos se declaran anclados a su rótulo, y un rango ciego no se publica', () => {
  const grilla = []
  const fila = (rot, valores) => { grilla.push([rot, ...valores]); return grilla.length }
  const fF931 = fila(ROTULOS_CARGAS.f931, Array.from({ length: 12 }, (_, i) => (i < 6 ? VACIO : 1)))
  const fGremiales = fila(ROTULOS_CARGAS.gremiales, Array.from({ length: 12 }, (_, i) => (i < 6 ? VACIO : 1)))
  const fFechas = fila(ROTULOS_CARGAS.fechas, Array.from({ length: 12 }, (_, i) => (i < 6 ? VACIO : '=DATE(2026;8;10)')))
  const rangos = rangosDeCargas({ fF931, fGremiales, fFechas })
  assert.deepEqual(rangos.map((r) => r.nombre), Object.values(NOMBRES_CARGAS))
  assert.deepEqual(verificarRangos(grilla, rangos), [])

  // Y si la fila se mueve sin que el rótulo la acompañe, salta ANTES de publicar.
  const problemas = verificarRangos(grilla, rangosDeCargas({ fF931: fGremiales, fGremiales, fFechas }))
  assert.equal(problemas.length, 1)
  assert.equal(problemas[0].problema, 'desanclado')
})


test('EL CASO DEL AUDITOR: los gremiales pagados NO tiran abajo el F931 del mismo mes', () => {
  // Con la precedencia por mes entero, marcar "Pagado" la fila de gremiales del 17/08 ($700k)
  // hacía desaparecer también el F931 de agosto ($7,0M) de la cadena, y el cash flow volvía a los
  // números redondos tipeados a mano. Los dos rubros vencen en días distintos (10 y 17): hay una
  // semana por mes con el mes pagado a medias, y cada rubro decide solo.
  const pagados = new Set([`2026-08·${RUBRO_GREMIALES}`])
  const ms = deCargasSociales({ fechas: FECHAS, f931: F931, gremiales: GREMIALES }, CORTE, { mesesPagados: pagados })
  const agosto = ms.filter((m) => m.fecha === S('2026-08-10'))
  assert.equal(agosto.filter((m) => m.rubro === RUBRO_CARGAS).length, 1, 'el F931 de agosto desapareció')
  assert.equal(agosto.filter((m) => m.rubro === RUBRO_GREMIALES).length, 0, 'los gremiales pagados volvieron')
})

test('EL AÑO ES DEL DEVENGADO: la nómina de diciembre que sale en enero se llama dic-26, no dic-27', () => {
  // Leído en el Sheet vivo por el auditor: "F931 · nómina de dic-27" en la fila del 10/01/2027.
  const ms = deCargasSociales({ fechas: FECHAS, f931: F931, gremiales: GREMIALES }, CORTE)
  const dic = ms.filter((m) => String(m.concepto).includes('dic-'))
  assert.ok(dic.length >= 1, 'el fixture tiene que cubrir diciembre para probar el cruce de año')
  for (const m of dic) assert.match(String(m.concepto), /dic-26/, `el concepto dice: ${m.concepto}`)
  assert.ok(!ms.some((m) => /-27$/.test(String(m.concepto).slice(-3)) && !String(m.concepto).includes('dic')),
    'ningún concepto puede citar un año que la serie no devenga')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CANDADO: LA CADENA NO RETIRA DEUDA PORQUE UNA FECHA HAYA VENCIDO (17/08/2026)
//
// Vino un pedido a arreglar esto: *"el F931 de julio salió publicado como deuda VENCIDA, pero la
// pestaña Cargas Sociales ya declaraba en su fila 25 (bloque «2 · PAGADO») que en ago-26 salieron
// $10.494.876 — el dato existía y el libro no lo miraba"*. La premisa era falsa y medirla lo probó:
// esos $10.494.876 los armaban la fila 469 de Compras ($8.000.000, estado «Proyectado») y la 725
// ($2.494.876, cuota de plan «Pendiente»). No había un peso pagado. El cuadro sumaba por fecha.
//
// HACERLO HABRÍA SIDO LA SÉPTIMA PÉRDIDA, y por dos motivos que se suman:
//
//   1. **Es un control validado contra la información que produce.** La fila 25 sale de Compras; la
//      cadena existe precisamente para reemplazar las filas planas de Compras (ver la precedencia
//      declarada arriba de este archivo). Leerla de vuelta cierra un círculo: la previsión tipeada
//      terminaría probando que la obligación que ella misma proyecta ya se pagó.
//   2. **Una fecha vencida no es un pago.** Es exactamente lo contrario: una obligación con la fecha
//      pasada y sin marcar es lo que hay que MIRAR, no lo que hay que dar por saldado.
//
// El bloque 2 de la pestaña quedó arreglado (`cargas-bloques.mjs`: exige "Pagado" y acota por rubro),
// así que hoy la fila 25 diría $0 en ago-26 y ni siquiera sostendría el retiro. Estos tests fijan que
// el criterio del libro no se afloje: PAGADO ES LO QUE EL CARGADOR MARCÓ, y sólo eso.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const VENCIDO_YA = S('2026-08-20') // corte posterior a TODAS las fechas de caja del fixture de agosto

test('CANDADO · una fila con la fecha ya vencida y sin marcar NO cuenta como pagada', () => {
  // Con corte al 20/08, las cuatro filas de agosto del fixture tienen la fecha pasada y ninguna está
  // marcada. Si algún día `cargasEnCompras` empezara a leerlas como pagadas —que es lo que hacía el
  // cuadro de la pestaña—, agosto desaparecería de `mesesPagados` y la cadena dejaría de emitirlo.
  const { mesesPagados } = cargasEnCompras(COMPRAS)
  assert.ok(!mesesPagados.has(`2026-08·${RUBRO_CARGAS}`),
    'el F931 de agosto figura pagado y la única fila de Compras que lo respalda dice «Proyectado»')
  assert.ok(!mesesPagados.has(`2026-08·${RUBRO_GREMIALES}`),
    'los gremiales de agosto figuran pagados y sus filas dicen «Proyectado»')
  // Y lo que SÍ está marcado sigue contando: el candado no puede apagar la precedencia real.
  assert.ok(mesesPagados.has(`2026-06·${RUBRO_CARGAS}`), 'la fila «Pagado» de junio dejó de contar')
})

test('CANDADO · la obligación proyectada se sigue publicando aunque su fecha ya haya pasado', () => {
  // El renglón no se retira: se marca VENCIDO, que es el estado que el libro define para "estaba
  // previsto para una fecha que ya pasó y nadie lo marcó como real". Retirarlo sería inventar un pago.
  const ms = deCargasSociales({ fechas: FECHAS, f931: F931, gremiales: GREMIALES }, VENCIDO_YA,
    { mesesPagados: cargasEnCompras(COMPRAS).mesesPagados })
  const agosto = ms.filter((m) => m.fecha === S('2026-08-10'))
  assert.equal(agosto.length, 2, 'la obligación de agosto desapareció del libro sin que nadie la pagara')
  for (const m of agosto) {
    assert.equal(m.estado, 'VENCIDO', `la obligación vencida salió ${m.estado}: eso la esconde del trabajo pendiente`)
  }
  assert.equal(agosto.reduce((a, m) => a + m.importe, 0), 6955255 + 1614090)
})

test('CANDADO · el importe publicado es el que la cadena MIDIÓ, no el que Compras preveía', () => {
  // La fila 469 de Compras dice $8.000.000 (redondo, tipeado); la cadena mide $6.955.255. Si el
  // extractor tomara el número de Compras para "cerrar" contra el cuadro de lo pagado, el libro
  // volvería a publicar el presupuesto que este archivo entero vino a reemplazar.
  const ms = deCargasSociales({ fechas: FECHAS, f931: F931, gremiales: GREMIALES }, VENCIDO_YA)
  const f931Agosto = ms.find((m) => m.fecha === S('2026-08-10') && m.rubro === RUBRO_CARGAS)
  assert.equal(f931Agosto.importe, 6955255)
  assert.notEqual(f931Agosto.importe, 8000000, 'volvió el número redondo tipeado en Compras')
})
