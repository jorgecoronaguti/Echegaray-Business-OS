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
import { total as rotuloTotal } from './patron-pestana.mjs'
import { ROTULOS_CARGAS } from './libro-extractores-cargas.mjs'
import { bloqueDeclarado, bloquePagado, bloqueProyeccion, bloquePlanes } from './cargas-bloques.mjs'
import { SIN_DDJJ } from './cargas-grilla.mjs'

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

/** La pestaña entera, armada como la arma el generador: los cuatro cuadros sobre UNA grilla. */
function armar({ conceptos = CONCEPTOS } = {}) {
  const G = crearGrilla(ANIO)
  G.push(['Cargas sociales'])
  G.push()
  const decl = bloqueDeclarado(G, { anio: ANIO, periodos: PERIODOS, conceptos })
  const pag = bloquePagado(G, { anio: ANIO, C, fArtDecl: decl.filaDecl['312'], fDeclTot: decl.fDeclTot })
  const proy = bloqueProyeccion(G, {
    anio: ANIO, desdeProy: 7, filaDecl: decl.filaDecl, filaPag: pag.filaPag,
    fRem: decl.fRem, fEmp: decl.fEmp, fDeclTot: decl.fDeclTot, bloqueBase: { inicio: 495, fin: 510 },
  })
  const planes = bloquePlanes(G, { ps: PS, C })
  return { G, decl, pag, proy, planes }
}

/** El rótulo que quedó EN la fila que un bloque devolvió. 1-based, como las filas de un Sheet. */
const rotuloDe = (G, fila) => String(G.filas[fila - 1]?.[0] ?? '')

test('cada bloque devuelve la fila REAL de cada total, no una posición contada aparte', () => {
  const { G, decl, pag, proy, planes } = armar()
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
    [planes.fCuotasTot, rotuloTotal('Total de cuotas del año')],
    [planes.fSinPagar, rotuloTotal('Cuotas sin pagar')],
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

test('EL CUADRO DEL «AL DÍA» NO VUELVE: era un hallazgo con cara de control', () => {
  // ═══ LO QUE MIDIÓ, EL 09/09/2026, EN EL ARCHIVO VIVO ═══
  //
  // La fila «F931 pagado − declarado el mes anterior» daba −$14.538.743 acumulado y siempre por los
  // MISMOS dos meses: febrero −$2.587.890 (la DDJJ de enero-26, que se pagó en parte) y julio
  // −$11.950.854 (la DDJJ de junio-26, que no se pagó). Los otros nueve meses daban $0.
  //
  // Y los dos rojos tienen la misma explicación: enero-26 y junio-26 son exactamente los dos
  // períodos FINANCIADOS en planes de pago (ver PLANES_F931), cuyas cuotas están en el cuadro 4 y
  // cierran contra Compras al peso. O sea: no hay un solo F931 impago sin explicar, y el cuadro
  // pintaba de rojo el año entero por dos hechos ya resueltos en otro cuadro de la misma pestaña.
  //
  // Un rojo estructural que no puede volverse verde no es un control: es un cartel. Y entrena al que
  // mira a ignorar el color, que es lo que después se lleva puesto a un control de verdad.
  const { G } = armar()
  const dif = G.filas.find((f) => /pagado − declarado|al día/i.test(String(f[0] ?? '')))
  assert.equal(dif, undefined, 'volvió el cuadro del «al día»: si hace falta, es un hallazgo del reporte, no una fila')
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
  // EL RÓTULO NOMBRA Y NADA MÁS (09/09): pasó por «ART · ya incluida en el F931, no se paga aparte»
  // y por «   · ART (dentro del F931)». Las dos explicaban lo mismo que ya prueba su POSICIÓN, que
  // es lo que mide el test de arriba. Y no es un sub-ítem: no cuelga de la fila de arriba.
  assert.equal(String(G.filas[pag.fArtPag - 1][0]), 'ART')
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
    // Salió de cargas-bloques el 11/09 por este mismo techo, y le toca igual.
    './cargas-bloque-pagado.mjs',
    // Entró el 10/09 con el apareo contra el banco: es parte de la cadena y le toca el mismo techo.
    './cargas-pagos-banco.mjs',
  ]
  for (const a of archivos) {
    const n = readFileSync(new URL(a, import.meta.url), 'utf8').split('\n').length
    assert.ok(n <= 500, `${a} tiene ${n} líneas`)
  }
})

// ═══ UN MES SIN DDJJ NO PUEDE VERSE COMO UN CERO (07/09/2026) ═══
//
// El dueño: «como puede ser q salgan meses en cero? mal conceptualmente». El total mensual hacía
// `SUM` sobre las celdas vacías de los meses sin declaración; `SUM` de vacías da 0 y el formato de
// moneda lo dibuja «—», igual que un mes declarado en cero. Son dos hechos distintos y sólo uno es
// un dato. Si alguien vuelve a poner un SUM incondicional acá, esto se pone rojo.
test('el total declarado de un mes SIN DDJJ dice la ausencia, no suma cero', () => {
  const G = crearGrilla(2026)
  const conceptos = [{ codigo: '301', rotulo: 'Aportes de Seguridad Social' }]
  // Ocho declaraciones de doce: es el estado real al 07/09/2026.
  const periodos = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
  const { fDeclTot } = bloqueDeclarado(G, { anio: 2026, periodos, conceptos })
  const fila = G.filas[fDeclTot - 1]
  // B..M son los doce meses. Agosto (índice 8) suma; septiembre (índice 9) declara la ausencia.
  assert.match(String(fila[8]), /^=SUM\(/, 'agosto tiene DDJJ: suma')
  assert.equal(fila[9], SIN_DDJJ, 'septiembre no tiene DDJJ: lo dice')
  assert.equal(fila[12], SIN_DDJJ, 'diciembre tampoco')
  // Y no es un número disfrazado: nada que pueda entrar en una aritmética.
  assert.equal(Number.isFinite(Number(SIN_DDJJ)), false)
})

test('EL BLOQUE PAGADO NO PUEDE REFERENCIAR COMPRAS — la mudanza al Libro del 11/09/2026', () => {
  // El dueño ordenó vaciar de Compras todo lo que no sea Civil/Estructura/Mantenimiento. Mientras estas
  // celdas leyeran Compras, la sección que contesta «¿cuánto salió efectivamente de la caja?» se iba a
  // CERO sin dar un solo error el día del vaciado. Si alguien las devuelve a Compras, esto se pone rojo.
  const { G, pag } = armar()
  const filasDelBloque = [pag.filaPag.F931, pag.filaPag.plan, pag.filaPag.FCL, pag.filaPag.UOCRA,
    pag.filaPag.IERIC, pag.filaPag.FODECO]
  for (const f of filasDelBloque) {
    // B..M son los doce meses; la N es el total de la fila (`SUM($B:$M`) y no lee ninguna fuente.
    const celdas = G.filas[f - 1].slice(1, 13).filter((c) => typeof c === 'string' && c.startsWith('='))
    assert.equal(celdas.length, 12, `la fila ${f} tiene que traer los doce meses con fórmula`)
    for (const c of celdas) {
      assert.ok(!/Compras!/.test(c), `fila ${f}: volvió a leer Compras — ${c.slice(0, 90)}`)
      assert.ok(/_MOVIMIENTOS!/.test(c), `fila ${f}: no lee el Libro — ${c.slice(0, 90)}`)
      assert.ok(/\$H\$2:\$H="REAL"/.test(c), `fila ${f}: "pagado" tiene que ser estado REAL`)
    }
  }
})

test('las cuatro filas de gremiales se reparten el rubro por CONTRAPARTE, con su control', () => {
  const { G, pag } = armar()
  const celda = (f) => String(G.filas[f - 1][1])
  assert.match(celda(pag.filaPag.FCL), /\$J\$2:\$J="Fondo de Cese"/)
  assert.match(celda(pag.filaPag.FCL), /\$J\$2:\$J="FCL"/,
    'el mismo acreedor se llama distinto según quién probó el pago: los dos nombres hacen falta')
  assert.match(celda(pag.filaPag.UOCRA), /\$J\$2:\$J="UOCRA"/)
  // El control resta el rubro ENTERO contra la suma de las cuatro: un organismo cuyo nombre el
  // desglose no conoce aparece acá en vez de desaparecer. Medido el 11/09: $4.697.639 («SINDICATOS»).
  const ctrl = G.filas.find((f) => String(f[0]).includes('gremiales sin clasificar'))
  assert.ok(ctrl, 'sin el control, una contraparte desconocida se pierde en silencio')
  assert.match(String(ctrl[1]), /^=SUMPRODUCT.*-\(/)
})

test('las «Cuotas sin pagar» miden lo que NO es REAL, no lo que la planilla no marcó', () => {
  const { G, planes } = armar()
  const celda = String(G.filas[planes.fSinPagar - 1][1])
  assert.ok(!/Compras!/.test(celda), `volvió a leer Compras: ${celda.slice(0, 90)}`)
  assert.match(celda, /\$H\$2:\$H="COMPROMETIDO"/)
  assert.ok(!/"REAL"/.test(celda), 'una cuota pagada no es una cuota sin pagar')
})

test('EL SELLO DE FRESCURA Y EL AVISO DE PLAN SIN CRONOGRAMA no corren ninguna fila', () => {
  // Los dos nacieron de la auditoría del 11/09/2026 y los dos viajan en una fila QUE YA EXISTÍA: una
  // fila nueva corre todo lo de abajo y la pestaña tiene rangos con nombre atados a esas posiciones
  // (probado: agregarla puso 13 tests en rojo). Si alguien los mueve a su propia fila, esto lo caza.
  const { G, pag, planes } = armar()
  // El rótulo de sección lleva su numeral y su glifo: se busca por «Pagado» dentro del texto.
  const seccion = G.filas.find((f) => /pagado/i.test(String(f?.[0] ?? '')) && String(f?.[1] ?? '').startsWith('='))
  assert.match(String(seccion[1]), /_MOVIMIENTOS!\$H\$2:\$H="REAL"/, 'el sello lee el libro, no una fecha pegada')
  assert.match(String(seccion[1]), /TEXT\(MAX\(/, 'muestra el último día con dato, no la hora de la corrida')
  const sinPagar = G.filas[planes.fSinPagar - 1]
  assert.match(String(sinPagar[2]), /sin cronograma de «Mis Facilidades»/)
  assert.match(String(sinPagar[2]), /^=IF\(/, 'el aviso se apaga solo cuando la celda tenga cuotas')
  assert.equal(sinPagar.length, G.filas[pag.filaPag.F931 - 1].length,
    'la fila del aviso tiene el mismo ancho que el resto: un ancho distinto desalinea la grilla')
})
