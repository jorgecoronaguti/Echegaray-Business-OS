// EL PORTÓN, EN FRÍO — sin red, con un libro armado a mano.
//
// Lo que estos tests tienen que poder detectar es que el VEREDICTO esté mal: que dé por buena una
// diferencia (el defecto del portón informativo, que salía con código 0 con $120M de desvío) o que
// grite por una ventana mal calculada. Por eso el libro sintético se arma con los bordes ya evaluados
// y se compara contra números de CAJA escritos a mano: si la ventana se corre un día, el test se pone
// rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluarBorde, ventanasDeTramo, conciliar, libroEntra, libroSale, residuosDeclarados,
  rubrosDelCuadro, FUENTE, TOLERANCIA,
} from './conciliar-libro.mjs'
import { BORDES } from '../lib/caja-calendario.mjs'
import { serialDe, isoDeSerial, eomonth } from '../lib/libro-extractores-fechas.mjs'

// Un miércoles de agosto, para que TODAY()+14 y el fin de mes no caigan juntos.
const HOY = serialDe(2026, 8, 5)
const CORTE = serialDe(2026, 8, 1)

test('los cinco bordes se evalúan con la MISMA aritmética que sus expresiones', () => {
  const v = BORDES.map(([, e]) => evaluarBorde(e, HOY))
  assert.deepEqual(v.slice(0, 3), [HOY, HOY + 7, HOY + 14])
  // "Resto de este mes": MAX(TODAY()+14; fin de mes). El 05/08 + 14 = 19/08, y el mes cierra el 31/08.
  assert.equal(isoDeSerial(v[3]), '2026-08-31')
  assert.equal(isoDeSerial(v[4]), '2026-09-30')
  assert.equal(v[5], Infinity, '"Más adelante" no tiene techo, y una ventana necesita dos')
})

test('el MAX de los bordes es un MAX de verdad: a fin de mes gana TODAY()+14', () => {
  // El 28/08: +14 = 11/09, que pasa el fin de agosto. Sin el MAX el borde retrocedería y el tramo
  // "Resto de este mes" quedaría ANTES que "Semana que viene" — dos tramos contando el mismo cheque.
  const fin = serialDe(2026, 8, 28)
  assert.equal(evaluarBorde(BORDES[3][1], fin), fin + 14)
  assert.ok(evaluarBorde(BORDES[3][1], fin) >= evaluarBorde(BORDES[2][1], fin), 'los bordes son crecientes')
  assert.equal(evaluarBorde(BORDES[4][1], fin), eomonth(fin, 1))
})

test('un borde que este portón no sabe evaluar ROMPE — no compara contra una ventana inventada', () => {
  assert.throws(() => evaluarBorde('WORKDAY(TODAY();3)', HOY), /no sé evaluar el borde/)
})

test('las ventanas: el que SALE arranca en el corte, el cheque en el serial 0, el que ENTRA en −∞', () => {
  const v0 = ventanasDeTramo(0, HOY, CORTE)
  assert.equal(v0.sale.desde, CORTE, 'lo anterior al corte ya está adentro del saldo del banco')
  assert.equal(v0.cheques.desde, 0, 'un cheque viejo y no debitado todavía va a salir')
  assert.equal(v0.entra.desde, -Infinity, 'un cobro atrasado sigue siendo plata que va a entrar')
  const v1 = ventanasDeTramo(1, HOY, CORTE)
  assert.deepEqual([v1.sale.desde, v1.sale.hasta], [HOY, HOY + 7])
  assert.deepEqual([v1.cheques.desde, v1.cheques.hasta], [HOY, HOY + 7])
})

// ── Un libro sintético: cada fuente con un movimiento en un tramo conocido ────────────────────────
const mov = (o) => ({ signo: -1, importe: 0, rubro: 'Materiales Civil', estado: 'PROYECTADO', ...o })
const LIBRO = [
  // Tramo 0 (vencido: [corte, hoy) para lo que sale)
  mov({ fecha: serialDe(2026, 8, 3), importe: 1000, origen: FUENTE.compras }),
  mov({ fecha: serialDe(2026, 8, 3), importe: 200, origen: FUENTE.compras, signo: 1 }), // nota de crédito
  mov({ fecha: serialDe(2026, 7, 20), importe: 5000, origen: FUENTE.cheques, estado: 'COMPROMETIDO' }),
  // Posterior al corte y por lo tanto DENTRO de la ventana: el calendario igual no lo cuenta.
  mov({ fecha: serialDe(2026, 8, 3), importe: 900, origen: FUENTE.banco, estado: 'REAL' }), // excluido
  mov({ fecha: serialDe(2026, 8, 2), importe: 777, origen: FUENTE.compras, rubro: 'SIN CLASIFICAR' }), // excluido
  mov({ fecha: serialDe(2026, 7, 15), importe: 400, origen: FUENTE.cobranzas, signo: 1, estado: 'VENCIDO' }),
  // Tramo 1 (esta semana: [hoy, hoy+7))
  mov({ fecha: HOY + 2, importe: 3000, origen: FUENTE.nomina, rubro: 'Nómina · Jornales de obra' }),
  mov({ fecha: HOY + 3, importe: 250, origen: FUENTE.cartera, signo: 1, estado: 'COMPROMETIDO' }),
  // Tramo 3 (resto del mes)
  mov({ fecha: serialDe(2026, 8, 20), importe: 6000, origen: FUENTE.impuestos, rubro: 'Impuestos' }),
  mov({ fecha: serialDe(2026, 8, 25), importe: 111, origen: FUENTE.tarjeta, estado: 'COMPROMETIDO' }),
  // Un cobro ya REAL: NO entra — está adentro del saldo del que arranca la escalera.
  mov({ fecha: HOY + 1, importe: 999999, origen: FUENTE.cobranzas, signo: 1, estado: 'REAL' }),
]

/** Lo que mostraría CAJA si contara exactamente lo mismo. */
const CAJA_QUE_CIERRA = [
  // CAMBIO DE CONTRATO (05/08): la portada publica el NETO del tramo, no entra/sale por separado.
  { rotulo: 'Vencido — ya pasó la fecha', neto: 400 - (1000 - 200 + 5000) },
  { rotulo: 'Esta semana', neto: 250 - 3000 },
  { rotulo: 'Semana que viene', neto: 0 },
  { rotulo: 'Resto de este mes', neto: 0 - 6111 },
  { rotulo: 'El mes que viene', neto: 0 },
  { rotulo: 'Más adelante', neto: 0 },
]

test('VEREDICTO: un libro que cuenta lo mismo que el calendario cierra y habilita la migración', () => {
  const r = conciliar(LIBRO, CAJA_QUE_CIERRA, { hoy: HOY, corte: CORTE })
  assert.equal(r.cierra, true, JSON.stringify(r.filas.map((f) => [f.rotulo, f.delta])))
  assert.ok(r.peor < TOLERANCIA)
})

test('VEREDICTO: una diferencia de un solo tramo abre el portón y NO se compensa entre tramos', () => {
  const caja = CAJA_QUE_CIERRA.map((t, i) => (i === 1 ? { ...t, neto: t.neto - 1_000_000 } : t))
  const r = conciliar(LIBRO, caja, { hoy: HOY, corte: CORTE })
  assert.equal(r.cierra, false)
  assert.equal(Math.round(r.filas[1].delta), -1_000_000)
  // El desglose por fuente tiene que decir DÓNDE mirar: el tramo 1 sale de la nómina.
  assert.equal(r.filas[1].salePorFuente.nomina, 3000)
})

test('VEREDICTO: dos errores que se cancelan ENTRE tramos no pasan — el neto es por tramo', () => {
  const caja = CAJA_QUE_CIERRA.map((t, i) => {
    if (i === 1) return { ...t, neto: t.neto - 500 }
    if (i === 3) return { ...t, sale: t.sale - 500 }
    return t
  })
  assert.equal(conciliar(LIBRO, caja, { hoy: HOY, corte: CORTE }).cierra, false)
})

test('el cheque del 20/07 pesa aunque sea anterior al corte, y la compra del 20/07 no', () => {
  const v = ventanasDeTramo(0, HOY, CORTE)
  assert.equal(libroSale(LIBRO, v).porFuente.cheques, 5000, 'la ventana del cheque abre en el serial 0')
  const compraVieja = [...LIBRO, mov({ fecha: serialDe(2026, 7, 20), importe: 40000, origen: FUENTE.compras })]
  assert.equal(libroSale(compraVieja, v).porFuente.compras, 800,
    'una factura anterior al corte ya está descontada del saldo: sumarla la contaría dos veces')
})

test('COMPRAS va NETO de notas de crédito: el SUMIFS de CAJA las resta', () => {
  const v = ventanasDeTramo(0, HOY, CORTE)
  assert.equal(libroSale(LIBRO, v).porFuente.compras, 1000 - 200)
})

test('ENTRA: sólo cartera y cobranzas esperadas — un cobro ya REAL está en el saldo', () => {
  const v = ventanasDeTramo(1, HOY, CORTE)
  const e = libroEntra(LIBRO, v)
  assert.equal(e.porFuente.cartera, 250)
  assert.equal(e.porFuente.cobranzas, 0, 'los $999.999 cobrados ya están adentro del saldo')
  assert.equal(e.total, 250)
})

test('las exclusiones tienen nombre y monto: nada se descuenta en silencio', () => {
  const v = ventanasDeTramo(0, HOY, CORTE)
  const r = residuosDeclarados(LIBRO, v)
  assert.equal(r.banco, 900, 'el calendario declara $0 por tramo para los cargos sin factura')
  assert.equal(r.comprasSinRubroDelCuadro, 777)
  assert.deepEqual(r.rubrosSueltos, ['SIN CLASIFICAR'])
})

test('los rubros que se comparan salen del CUADRO, no de una lista copiada acá', () => {
  const rubros = rubrosDelCuadro()
  assert.ok(rubros.has('Materiales Civil') && rubros.has('Impuestos') && rubros.has('Estructura'))
  assert.ok(!rubros.has('SIN CLASIFICAR'), 'no es una línea de ninguna actividad: el calendario no lo ve')
})

test('si CAJA muestra otra cantidad de tramos que BORDES, ROMPE en vez de comparar de a pares', () => {
  assert.throws(() => conciliar(LIBRO, CAJA_QUE_CIERRA.slice(0, 3), { hoy: HOY, corte: CORTE }),
    /no están hablando del mismo calendario/)
})

test('si el borde de la pestaña no coincide con el calculado, no cierra aunque los deltas den cero', () => {
  const caja = CAJA_QUE_CIERRA.map((t, i) => (i === 0 ? { ...t, hasta: HOY - 1 } : t))
  const r = conciliar(LIBRO, caja, { hoy: HOY, corte: CORTE })
  assert.equal(r.bordesEnDesacuerdo.length, 1)
  assert.equal(r.cierra, false, 'si no miran el mismo día, ninguna comparación vale')
})
