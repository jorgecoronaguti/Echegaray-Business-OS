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
import { VACIO } from './preservar-anotaciones.mjs'
import { total as rotuloTotal, sub } from './patron-pestana.mjs'
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
  // El 312 es la ART DENTRO de la DDJJ: mismo PDF, mismo período, misma remuneración declarada que
  // los otros códigos. Está en el caso base porque la pestaña tiene que poder desglosarla.
  { codigo: '312', rotulo: 'L.R.T. — ART (312)' },
]
const PS = [{
  nombre: 'Plan F931 W303094', n: 3, pagadas: 0, saldo: 7484627, proxima: '2026-09-10', total: 7484627,
  porMes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2494876, 2494876, 2494876, 0],
}]

/** La pestaña entera, armada como la arma el generador: los siete cuadros sobre UNA grilla. */
function armar({ conceptos = CONCEPTOS } = {}) {
  const G = crearGrilla(ANIO)
  G.push(['Cargas sociales'])
  G.push()
  const decl = bloqueDeclarado(G, { anio: ANIO, periodos: PERIODOS, conceptos })
  const pag = bloquePagado(G, { anio: ANIO, C, fArtDecl: decl.filaDecl['312'], fDeclTot: decl.fDeclTot })
  bloqueDiferencia(G, { fPagF931: pag.filaPag.F931, fDeclTot: decl.fDeclTot })
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

test('el cuadro del "al día" compara LO MISMO CONTRA LO MISMO, y con el mes corrido', () => {
  // EL DEFECTO QUE ATAJA. Restaba `Total pagado − Total declarado`. El pagado suma FCL, UOCRA, IERIC,
  // FODECO y las cuotas de planes; el declarado sólo los seis códigos del F931. Dos canastas
  // distintas: la resta daba +$8.020.918 en el año y no significaba ni sobrepago ni deuda. Si alguien
  // vuelve a apuntar esta fila al TOTAL pagado, este test se pone rojo.
  const { G, decl, pag } = armar()
  const dif = G.filas.find((f) => /^F931 pagado − declarado el mes anterior/.test(String(f[0] ?? '')))
  assert.ok(dif, 'desapareció la fila del control de "¿estamos al día?"')
  // Julio es la columna H y su contraparte es JUNIO, la G: el F931 del mes m−1 se paga en el mes m.
  // Sin el corrimiento el cuadro no puede dar cero ningún mes y hay que pedirle perdón en una nota.
  assert.equal(String(dif[7]), `=H${pag.filaPag.F931}-G${decl.fDeclTot}`)
  assert.notEqual(pag.filaPag.F931, pag.fPagTot, 'la fila del F931 y la del total pagado no son la misma')
  // Enero no tiene contra qué compararse: su F931 es la DDJJ de diciembre del año anterior.
  assert.equal(dif[1], VACIO, 'enero comparó contra una columna que no existe en esta grilla')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL ESLABÓN ART — QUE DESGLOSE SIN SUMAR DOS VECES
//
// La evidencia con la que se decidió (06/08): `_F931_RAW` trae el código 312 leído del MISMO PDF que
// el 301/302/351/352/028, y el F931 que Compras registra en el mes m es al peso el Total declarado
// del mes m−1 —feb, mar, abr y may de 2026, cuatro meses exactos— con el 312 adentro. O sea: la ART
// se paga DENTRO del F931. Una fila que la sumara otra vez metería $10,8M inventados en el año, y
// como el hero y la serie que lee el Libro cuelgan de estos totales, la duplicación viajaría al cash
// flow sin una sola celda en rojo. Estos tres tests existen para que eso no pueda pasar de nuevo.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('la ART se desglosa DEBAJO del total pagado y FUERA del rango que el total suma', () => {
  const { G, pag } = armar()
  assert.ok(pag.fArtPag, 'no se escribió el desglose de ART: la pestaña vuelve a no poder decir si se paga')
  assert.ok(pag.fArtPag > pag.fPagTot, 'el desglose quedó ARRIBA del total: adentro del rango, se cuenta dos veces')
  // La prueba dura: el SUM del total no puede alcanzar la fila del desglose. Se lee el rango real de
  // la fórmula, no la posición — un total que sumara `B<p0>:B<fArtPag>` duplicaría la ART entera.
  const tot = String(G.filas[pag.fPagTot - 1][1])
  const [, hasta] = tot.match(/^=SUM\(B(\d+):B(\d+)\)$/).slice(1).map(Number)
  assert.ok(hasta < pag.fArtPag, `el total suma hasta la fila ${hasta} y la ART está en la ${pag.fArtPag}: se cuenta dos veces`)
})

test('el desglose de ART sale del código 312 y del F931 EFECTIVAMENTE pagado, no de una alícuota', () => {
  const { G, decl, pag } = armar()
  // Marzo (columna D) contra la DDJJ de febrero (columna C): la parte de ART del pago del mes.
  assert.equal(String(G.filas[pag.fArtPag - 1][3]),
    `=IFERROR(D${pag.filaPag.F931}*C${decl.filaDecl['312']}/C${decl.fDeclTot};0)`)
  // Y enero queda vacío: su F931 es la DDJJ de diciembre del año anterior, que esta grilla no tiene.
  // Prorratearlo contra una columna inexistente sería fabricar el dato que falta.
  assert.equal(G.filas[pag.fArtPag - 1][1], VACIO, 'enero se prorrateó contra una columna que no existe')
  // El rótulo LLEVA el veredicto: es lo único que le contesta al que abre la pestaña la pregunta que
  // la auditoría dejó abierta —"¿se paga la ART?"— sin que tenga que ir a buscar el código 312.
  assert.equal(String(G.filas[pag.fArtPag - 1][0]), sub('ART · ya incluida en el F931, no se paga aparte'))
})

test('sin código 312 en la DDJJ no se inventa la fila: no hay nada que desglosar', () => {
  // Si algún año ARCA deja de declarar la ART por el F931, la pestaña tiene que quedarse muda en vez
  // de dibujar una fila en cero que se lea como "la ART no se paga".
  const { G, pag } = armar({ conceptos: CONCEPTOS.filter((c) => c.codigo !== '312') })
  assert.equal(pag.fArtPag, 0)
  assert.equal(G.filas.filter((f) => /ART/.test(String(f[0] ?? ''))).length, 0)
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
