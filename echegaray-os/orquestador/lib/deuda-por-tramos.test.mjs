// LA ARITMÉTICA DE LOS TRAMOS DE PAGO — con filas REALES del archivo del 14/08/2026.
//
// Cada caso de acá salió de leer Compras, no de imaginar una fila. El que las inventa termina
// probando la fórmula que escribió, que es exactamente cómo se llegó a que el cuadro mostrara
// $15.083.922 con $11.919.063 sin contar.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  COL, PENDIENTE, clasificar, esComercial, faltaDeclarada, formulaSaldoPendiente, pagadoDe,
  paréntesisQueNoCierran, posicionComercial, saldoDeLaFila,
} from './deuda-por-tramos.mjs'

/** Arma una fila de Compras con sólo las columnas que esta aritmética mira. */
function fila({ proveedor = 'X', comprobante = '', total = 0, pagado = 0, u = 0, w = 0,
  estado = PENDIENTE, comercial = '1', totalOParcial = 'Total' } = {}) {
  const f = []
  f[COL.proveedor] = proveedor
  f[COL.comprobante] = comprobante
  f[COL.total] = total
  f[COL.totalOParcial] = totalOParcial
  f[COL.pagado] = pagado
  f[COL.parcial1] = u
  f[COL.parcial2] = w
  f[COL.estado] = estado
  f[COL.comercial] = comercial
  return f
}

// ── LAS FILAS REALES, tal como estaban en Compras el 14/08/2026 ────────────────────────────────
/** Pendiente con pago parcial: pagó $1.000.000 de $2.300.000 y U declara los $1.300.000 que faltan. */
const GERSON = fila({ proveedor: 'Gerson Castro', total: 2300000, pagado: 1000000, u: -1300000 })
/** Ídem, pero la columna S dice "Total" aunque el pago fue parcial: S no se puede usar para decidir. */
const FREDES = fila({ proveedor: 'Pedro Fredes', total: 3300000, pagado: 2000000, u: -1300000, totalOParcial: 'Total' })
/** Pendiente sin un peso pagado: U es el total entre paréntesis. */
const ALUMETAL = fila({ proveedor: 'Alumetal', comprobante: '0038-00025942', total: 2014940, pagado: 0, u: -2014940 })
/** ═══ EL AGUJERO ═══ dice "Pagado", no pagó nada, y U declara que faltan $5.124.412. */
const GRUAS = fila({ proveedor: 'Gruas San Blas', comprobante: '00060-00001275', total: 5124412, pagado: 0, u: -5124411, estado: 'Pagado' })
const HORMISERV = fila({ proveedor: 'Hormiserv', comprobante: '826666', total: 3640067, pagado: 0, u: -3640067, estado: 'Pagado' })
/** Pagada de verdad, con un parcial POSITIVO (un pago real que además superó el importe). */
const COMBUSTIBLES = fila({ proveedor: 'Combustibles Barcelo', total: 34460, pagado: 34460, u: 40000, estado: 'Pagado' })

describe('la aritmética de los tramos', () => {
  it('EL DEFECTO · un U NEGATIVO no es un pago: es lo que FALTA pagar', () => {
    // Si se lo sumara como pago, la deuda de Gerson daría 2.300.000 − 1.000.000 − 1.300.000 = 0
    // y se le deben $1,3M. Es el error que deja de pagar a un proveedor.
    assert.equal(pagadoDe(GERSON), 1000000)
    assert.equal(saldoDeLaFila(GERSON), 1300000)
    // Y si se lo restara otra vez, la deuda se duplicaría: medido, $30.167.844 contra $15.083.922.
    assert.notEqual(saldoDeLaFila(GERSON), 2300000 - 1000000 - -1300000)
  })

  it('EL DEFECTO · la deuda NO es el total del comprobante', () => {
    // Un cuadro que muestra el Total de la factura le hace apartar $1M de más sólo en esta fila.
    assert.notEqual(saldoDeLaFila(GERSON), GERSON[COL.total])
    assert.equal(saldoDeLaFila(FREDES), 1300000)
    assert.notEqual(saldoDeLaFila(FREDES), 3300000)
  })

  it('un U POSITIVO sí es un pago y se suma', () => {
    assert.equal(pagadoDe(COMBUSTIBLES), 34460 + 40000)
    assert.equal(faltaDeclarada(COMBUSTIBLES), 0, 'sin paréntesis no hay nada declarado como faltante')
  })

  it('la fila sin un peso pagado debe el comprobante entero', () => {
    assert.equal(pagadoDe(ALUMETAL), 0)
    assert.equal(saldoDeLaFila(ALUMETAL), 2014940)
  })

  it('"Total o Parcial" (S) NO decide: hay filas que dicen "Total" con la mitad pagada', () => {
    assert.equal(FREDES[COL.totalOParcial], 'Total')
    assert.ok(saldoDeLaFila(FREDES) > 0, 'creerle a S dejaría esta deuda en cero')
  })
})

describe('el agujero de $11.919.063: "Pagado" con saldo', () => {
  it('EL DEFECTO · una fila que dice "Pagado" y no pagó nada NO es una fila saldada', () => {
    assert.equal(clasificar(GRUAS), 'pagada-con-saldo')
    assert.equal(saldoDeLaFila(GRUAS), 5124412)
    // La fórmula que hoy vive en AL arranca con IF(X="Pendiente"; …; 0): ésta vale CERO en el cuadro.
    assert.equal(clasificar(ALUMETAL), 'deuda')
  })

  it('la posición trae las dos cifras juntas: la que se muestra y la que se está tapando', () => {
    const p = posicionComercial([GERSON, FREDES, ALUMETAL, GRUAS, HORMISERV, COMBUSTIBLES])
    assert.equal(p.enElCuadro.n, 3)
    assert.equal(p.enElCuadro.monto, 1300000 + 1300000 + 2014940)
    assert.equal(p.contradictorio.n, 2)
    assert.equal(p.contradictorio.monto, 5124412 + 3640067)
    assert.equal(p.techo, p.enElCuadro.monto + p.contradictorio.monto)
    // Ordenadas por plata: la que más pesa, primero — es la que hay que preguntar.
    assert.equal(p.contradictorio.filas[0].proveedor, 'Gruas San Blas')
  })

  it('una compra NO comercial no entra: su deuda vive en Impuestos y Financieros (regla 9)', () => {
    const arca = fila({ proveedor: 'ARCA', total: 7000000, comercial: '0' })
    assert.equal(esComercial(arca), false)
    assert.equal(posicionComercial([arca]).enElCuadro.monto, 0)
  })

  it('"Pendiente" sin saldo se cuenta aparte: infla las facturas y no la plata', () => {
    const saldada = fila({ proveedor: 'Y', total: 1000, pagado: 1000 })
    assert.equal(clasificar(saldada), 'pendiente-sin-saldo')
    assert.equal(posicionComercial([saldada]).pendienteSinSaldo.n, 1)
  })
})

describe('el control por dos caminos', () => {
  it('los paréntesis y la aritmética miden lo mismo, y cuando difieren se dice', () => {
    // Las reales cierran al peso (la de Corralón difiere en $1 por redondeo y no se reporta).
    assert.deepEqual(paréntesisQueNoCierran([GERSON, FREDES, ALUMETAL]), [])
    // Una mal cargada: pagó 500 de 1000 y escribió que faltan 900.
    const mala = fila({ proveedor: 'Z', total: 1000, pagado: 500, u: -900 })
    const [d] = paréntesisQueNoCierran([mala])
    assert.equal(d.saldo, 500)
    assert.equal(d.declarado, 900)
    assert.equal(d.dif, -400)
  })
})

describe('la fórmula de la columna AL', () => {
  const f = formulaSaldoPendiente()

  it('dice EXACTAMENTE lo mismo que el JS, tramo por tramo', () => {
    assert.ok(f.includes('$O$4:$O'), 'sin el Total no hay de qué restar')
    assert.ok(f.includes('$T$4:$T'), 'sin Monto Pagado la deuda es el total de la factura')
    assert.ok(f.includes('$U$4:$U') && f.includes('$W$4:$W'), 'los dos parciales, o falta un tramo')
    // El `>0` es lo que hace que un paréntesis NO se sume como pago. Sin él, Gerson da cero.
    assert.equal((f.match(/>0/g) ?? []).length, 2, 'cada parcial necesita su filtro de positivos')
  })

  it('es-AR: separador `;` y ni una coma suelta', () => {
    assert.ok(f.includes(';'), 'con coma da "Formula parse error" en un archivo es-AR')
    assert.ok(!/,/.test(f), 'una coma en un archivo es-AR es un separador decimal')
  })

  it('se ancla en una sola celda y no escribe su derrame', () => {
    assert.ok(f.startsWith('=ARRAYFORMULA('), 'escribir fila por fila deja la última sin fórmula')
    assert.ok(f.includes('IF($E$4:$E="";"";'), 'sin esto pinta ceros hasta el fin de la grilla')
  })

  it('la variante que le cree a los IMPORTES existe, y es OTRA fórmula', () => {
    const abierta = formulaSaldoPendiente({ soloPendiente: false })
    assert.notEqual(abierta, f)
    assert.ok(f.includes(`$X$4:$X="${PENDIENTE}"`), 'la de hoy filtra por el estado — ahí está el agujero')
    assert.ok(!abierta.includes(`$X$4:$X="${PENDIENTE}"`))
    // Las dos exigen proveedor comercial: la deuda con ARCA/nómina no es de esta pestaña.
    for (const x of [f, abierta]) assert.ok(x.includes('$AJ$4:$AJ=1'))
  })
})
