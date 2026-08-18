// LA ARITMÉTICA DE LOS TRAMOS DE PAGO — con filas REALES del archivo del 14/08/2026.
//
// Cada caso de acá salió de leer Compras, no de imaginar una fila. El que las inventa termina
// probando la fórmula que escribió, que es exactamente cómo se llegó a que el cuadro mostrara
// $15.083.922 con $11.919.063 sin contar.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  COL, PENDIENTE, clasificar, esComercial, estadoTipeadoQueContradice,
  formulaSaldoPendiente, pagadoDe, posicionComercial, saldoDeLaFila,
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
/** ═══ LAS OCHO DEL FALSO AGUJERO (re-medidas el 18/08) ═══ dicen "Pagado" con `Monto Pagado` en 0
 *  y U en −Total. Y las dos celdas son FÓRMULAS: `T` es `=IF(F="pago";O;0)` con Modalidad = "Cuenta
 *  Corriente" (rinde 0) y `U` es literalmente `=T-O`. El "Pagado" lo tipeó el dueño encima de la
 *  fórmula del Estado. No se deben. */
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

// ═══ EL ESTADO ES LA ÚNICA DECLARACIÓN, Y ES DEL DUEÑO (18/08/2026) ═══
//
// Acá vivía el bloque "el agujero de $11.919.063", que exigía que una fila con estado "Pagado" y
// `Monto Pagado` en cero se clasificara como `pagada-con-saldo` y se publicara como plata que
// posiblemente se deba. Re-medido leyendo FÓRMULAS y no valores: `Monto Pagado` es `=IF(F="pago";O;0)`
// —depende de la Modalidad— y `Monto Parcial 1` es `=T-O`. Las dos "pruebas" salían de la misma
// celda. El "Pagado" lo tipeó una persona encima de la fórmula, que es la declaración más fuerte que
// hay. El dueño lo reclamó tres veces.
describe('el estado manda: lo que dice "Pagado" no se debe', () => {
  it('EL DEFECTO · una fila que dice "Pagado" está saldada, aunque los importes deriven otra cosa', () => {
    assert.equal(clasificar(GRUAS), 'saldada')
    assert.equal(clasificar(HORMISERV), 'saldada')
    assert.equal(clasificar(ALUMETAL), 'deuda', 'y la que dice Pendiente sí se debe')
  })

  it('la posición devuelve UNA cifra: la deuda declarada, sin techo ni contradicción al lado', () => {
    const p = posicionComercial([GERSON, FREDES, ALUMETAL, GRUAS, HORMISERV, COMBUSTIBLES])
    assert.equal(p.enElCuadro.n, 3)
    assert.equal(p.enElCuadro.monto, 1300000 + 1300000 + 2014940)
    assert.equal(p.contradictorio, undefined, 'publicar lo pagado como deuda es el defecto que se sacó')
    assert.equal(p.techo, undefined)
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

// ═══ EL ÚNICO CRUCE QUE SÍ ES INDEPENDIENTE ═══
//
// Una persona tipeando una palabra contra una aritmética. Informa; no corrige, no suma, no publica un
// peso. Necesita las DOS lecturas de la misma fila —fórmula y valor—: sin la de fórmulas no hay forma
// de distinguir un estado tipeado de uno calculado, y suponerlo es el error que costó todo esto.
describe('el estado tipeado que contradice a su propia fórmula', () => {
  /** La MISMA fila, en sus dos lecturas: `X` tipeado "Pagado", `T` rindiendo 0 por la modalidad. */
  const formulaGruas = fila({ proveedor: 'Gruas San Blas', total: '=N796+M796', pagado: '=IF(F796="pago";O796;0)', u: '=T796-O796', estado: 'Pagado' })

  it('lo detecta y dice las dos versiones, sin tocar ninguna deuda', () => {
    const d = estadoTipeadoQueContradice(formulaGruas, GRUAS)
    assert.deepEqual(d, { tipeado: 'Pagado', calculado: 'Pendiente' })
  })

  it('un estado que ES una fórmula no es una declaración de nadie', () => {
    const conFormula = fila({ estado: '=IF($E796="";"";IF(ABS(N($T796)+N($W796)-N($O796))<1;"Pagado";"Pendiente"))' })
    assert.equal(estadoTipeadoQueContradice(conFormula, GRUAS), null)
  })

  it('cuando el tipeado coincide con lo calculado, no hay nada que informar', () => {
    assert.equal(estadoTipeadoQueContradice(fila({ estado: 'Pendiente' }), ALUMETAL), null)
    assert.equal(estadoTipeadoQueContradice(fila({ estado: 'ELIMINADO' }), ALUMETAL), null,
      'una fila dada de baja no contradice nada')
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

  it('NO tiene variante: no existe una segunda definición de cuánto se debe', () => {
    // Tenía un `soloPendiente:false` que producía "la que le cree a los importes". Esa segunda
    // versión no puede existir: los importes de Compras son fórmulas derivadas del propio estado y de
    // la modalidad, así que no son una segunda opinión — son la misma celda con otro nombre.
    assert.equal(formulaSaldoPendiente.length, 0, 'una fórmula con opciones son dos definiciones')
    assert.equal(formulaSaldoPendiente({ soloPendiente: false }), f, 'el parámetro viejo ya no cambia nada')
    assert.ok(f.includes(`$X$4:$X="${PENDIENTE}"`), 'se debe lo que el dueño declaró Pendiente')
    assert.ok(f.includes('$AJ$4:$AJ=1'), 'la deuda con ARCA/nómina no es de esta pestaña')
  })
})
