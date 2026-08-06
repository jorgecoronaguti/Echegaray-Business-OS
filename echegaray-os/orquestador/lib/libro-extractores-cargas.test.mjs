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
    { mesesPagados: new Set(['2026-08']), aviso: (m) => avisos.push(m) })
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
  'Monto Pagado', 'Rubro de caja', 'Fecha de caja']
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
  assert.deepEqual([...mesesPagados], ['2026-06'])
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

test('la exclusión es por MES CUBIERTO: septiembre sin cadena sigue saliendo de Compras', () => {
  const sept = filaCompras({ prov: 'ARCA', total: 6500000, estado: 'Proyectado', rubro: RUBRO_CARGAS, fecha: S('2026-09-10') })
  const libro = deCompras([...COMPRAS, sept], CORTE, { cargasCubiertas: new Set(['2026-08']) })
  assert.ok(libro.some((m) => m.importe === 6500000), 'se excluyó un mes que la cadena no cubre')
})

test('cubiertaPorLaCadena: los tres motivos por los que una fila NO se excluye', () => {
  const cubiertos = new Set(['2026-08'])
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
