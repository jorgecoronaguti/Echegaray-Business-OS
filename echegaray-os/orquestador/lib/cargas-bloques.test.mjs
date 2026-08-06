// LOS BLOQUES ESCRIBEN SOBRE UNA GRILLA COMPARTIDA Y DEVUELVEN NÚMEROS DE FILA.
//
// EL DEFECTO QUE ESTOS TESTS ATAJAN. Los siete cuadros vivían adentro de una sola función de 372
// líneas y contaban sus filas con `filas.length + 1`, una variable que tenían a mano. Al separarlos,
// ese número pasó a ser el CONTRATO entre bloques: el cuadro de la diferencia resta la fila que le
// devolvió el de lo pagado, y el hero suma la que le devolvió el de la proyección. Un off-by-one ahí
// no da error ni #REF: la fórmula apunta a la fila de al lado —el rótulo, o el mes equivocado— y
// devuelve un número plausible. Por eso no se prueba "el bloque escribió algo": se prueba que la fila
// que devuelve TIENE ADENTRO lo que dice tener, y que sigue teniéndolo después de que corran los que
// vienen abajo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { crearGrilla } from './cargas-grilla.mjs'
import { total as rotuloTotal } from './patron-pestana.mjs'
import { ROTULOS_CARGAS } from './libro-extractores-cargas.mjs'
import {
  bloqueDeclarado, bloquePagado, bloqueDiferencia, bloqueProyeccion, bloqueCaja, bloqueSac, bloquePlanes,
} from './cargas-bloques.mjs'

const ANIO = 2026
const C = {
  total: 'O', cliente: 'J', detalle: 'K', fecha: 'AD', rubro: 'AB', proveedor: 'E', fechaFactura: 'C', estado: 'X',
}
const PERIODOS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
const CONCEPTOS = [
  { codigo: '301', rotulo: 'Aportes de Seguridad Social (301)' },
  { codigo: '351', rotulo: 'Contribuciones de Seguridad Social (351)' },
]
const PS = [{
  nombre: 'Plan F931 W303094', n: 3, pagadas: 0, saldo: 7484627, proxima: '2026-09-10', total: 7484627,
  porMes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2494876, 2494876, 2494876, 0],
}]

/** La pestaña entera, armada como la arma el generador: los siete cuadros sobre UNA grilla. */
function armar() {
  const G = crearGrilla(ANIO)
  G.push(['Cargas sociales'])
  G.push()
  const decl = bloqueDeclarado(G, { anio: ANIO, periodos: PERIODOS, conceptos: CONCEPTOS })
  const pag = bloquePagado(G, { anio: ANIO, C })
  bloqueDiferencia(G, { fPagTot: pag.fPagTot, fDeclTot: decl.fDeclTot })
  const proy = bloqueProyeccion(G, {
    anio: ANIO, desdeProy: 7, filaDecl: decl.filaDecl, filaPag: pag.filaPag,
    fRem: decl.fRem, fEmp: decl.fEmp, bloqueBase: { inicio: 495, fin: 510 },
  })
  const caja = bloqueCaja(G, {
    anio: ANIO, desdeProy: 7, proyMeses: proy.proyMeses, fDeclTot: decl.fDeclTot, fProyTot: proy.fProyTot, C,
  })
  bloqueSac(G, { anio: ANIO, C, fRem: decl.fRem, fRemProy: proy.fRemProy })
  const planes = bloquePlanes(G, { ps: PS, C })
  return { G, decl, pag, proy, caja, planes }
}

/** El rótulo que quedó EN la fila que un bloque devolvió. 1-based, como las filas de un Sheet. */
const rotuloDe = (G, fila) => String(G.filas[fila - 1]?.[0] ?? '')

test('cada bloque devuelve la fila REAL de cada total, no una posición contada aparte', () => {
  const { G, decl, pag, proy, caja, planes } = armar()
  const esperado = [
    [decl.fDeclTot, rotuloTotal('Total declarado')],
    [decl.fEmp, 'Empleados en nómina'],
    [decl.fRem, 'Remuneración declarada'],
    [decl.filaDecl['301'], 'Aportes de Seguridad Social (301)'],
    [decl.filaDecl['351'], 'Contribuciones de Seguridad Social (351)'],
    [pag.fPagTot, rotuloTotal('Total pagado')],
    [pag.filaPag.F931, 'F931'],
    [pag.filaPag.FCL, 'FCL'],
    [proy.fRemProy, 'Remuneración proyectada'],
    [proy.fDot, 'Dotación proyectada'],
    [proy.fSubF931, ROTULOS_CARGAS.f931],
    [proy.fSubGremiales, ROTULOS_CARGAS.gremiales],
    [proy.fProyTot, rotuloTotal('Total devengado en el mes')],
    [proy.fFechaSalida, ROTULOS_CARGAS.fechas],
    [caja.fCuotasVencen, 'Cuotas de planes de pago que vencen'],
    [planes.fCuotasTot, rotuloTotal('Total de cuotas del año')],
  ]
  for (const [fila, rotulo] of esperado) {
    assert.equal(rotuloDe(G, fila), rotulo,
      `la fila ${fila} debería ser "${rotulo}" y dice "${rotuloDe(G, fila)}": el número que se devuelve no es el que se escribió`)
  }
})

test('las filas de un bloque siguen siendo suyas después de que corran los de abajo', () => {
  // Dos bloques que arrancan a contar desde el mismo lugar se pisan sin dar un solo error: el de
  // abajo reescribe filas del de arriba y las fórmulas que apuntaban ahí cambian de significado.
  const { G, decl, pag } = armar()
  assert.equal(rotuloDe(G, decl.fDeclTot), rotuloTotal('Total declarado'))
  assert.equal(rotuloDe(G, pag.fPagTot), rotuloTotal('Total pagado'))
  assert.notEqual(decl.fDeclTot, pag.fPagTot)
  // Y ningún bloque devuelve la fila 0: `filas.length + 1` mal traducido a `n()` daría exactamente eso.
  for (const f of [decl.fDeclTot, decl.fEmp, decl.fRem, pag.fPagTot]) assert.ok(f >= 1)
})

test('el cuadro de la diferencia resta las DOS filas que le devolvieron los de arriba', () => {
  const { G, decl, pag } = armar()
  const dif = G.filas.find((f) => /^Diferencia \(pagado − declarado\)/.test(String(f[0] ?? '')))
  assert.ok(dif, 'desapareció la fila de la diferencia')
  // Julio es la columna H. Si el bloque contara sus filas por su cuenta, acá aparecerían otros números.
  assert.equal(String(dif[7]), `=H${pag.fPagTot}-H${decl.fDeclTot}`)
})

test('ningún archivo del generador de cargas pasa de 500 líneas', () => {
  // El generador tenía 772 y adentro, mezcladas con la orquestación contra Google, las fórmulas que
  // deciden plata. Es el mismo techo —y el mismo motivo— que el generador de Impuestos.
  const archivos = [
    '../scripts/cargas-sociales-pestana.mjs', './cargas-grilla.mjs', './cargas-bloques.mjs',
    './cargas-piel.mjs', './cargas-planes.mjs', './cargas-cadena.mjs', './libro-extractores-cargas.mjs',
  ]
  for (const a of archivos) {
    const n = readFileSync(new URL(a, import.meta.url), 'utf8').split('\n').length
    assert.ok(n <= 500, `${a} tiene ${n} líneas`)
  }
})
