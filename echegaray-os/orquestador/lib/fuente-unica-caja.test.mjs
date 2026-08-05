// UNA SOLA DEFINICIÓN DE QUÉ ENTRA Y QUÉ SALE DE LA CAJA — PROBADA, NO DECLARADA.
//
// ═══ EL DEFECTO QUE ESTOS TESTS ATRAPAN ═══
//
// El 04/08/2026 el calendario de vencimientos de CAJA decía que a fin de agosto quedaban
// $237.288.082 y el Cash Flow Mensual decía $195.583.731 para el MISMO mes, arrancando del MISMO
// saldo. $41.704.351 de desacuerdo entre dos vistas de la misma plata hace inservibles a las dos.
// La causa no fue una fórmula mal escrita: fue que cada cuadro tenía SU PROPIA LISTA de qué sale.
//
// La cura fue estructural —`calendario-egresos.mjs` toma el CUADRO del cash flow y lo expone por
// ventana de fechas— pero una cura estructural sin test se deshace sola: alcanza con que alguien
// agregue una línea a un lado. Estos tests son el candado.
//
// ═══ POR QUÉ SE COMPARAN FÓRMULAS Y NO NÚMEROS ═══
//
// Un test que leyera el Sheet diría "hoy no coinciden" y no diría por qué. La causa vive en el
// GENERADOR: qué función produce cada celda. Comparar las fórmulas que las tres pestañas escriben
// prueba la propiedad que importa —misma definición, distinta ventana— sin depender del estado de
// la planilla, de credenciales, ni del día en que se corre.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { CUADRO, expresionReal, formulaLineaMes } from './cash-flow-lineas.mjs'
import { formulaLineaSemana } from './cash-flow-horizonte.mjs'
import {
  lineasDeCaja, sumandosEnVentana, conceptosFueraDelCalendario, marcaDeLinea,
} from './calendario-egresos.mjs'
import { desdeTramo, hastaTramo, resolutorDeTramo, BORDES } from './caja-calendario.mjs'
import { grilla } from '../scripts/cash-flow-rehacer.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..')

/** Las filas de las tablas de proyección: para una prueba de FORMA cualquiera sirve. */
const TABLAS = { Estructura: 15, Recurrentes: 24, 'Materiales y Proveedores': 30 }
/** Las filas del calendario fiscal que el resolutor de CAJA necesita para IVA/IIBB. */
const FILAS_CAL = { iva: 20, iibb: 21 }
/** Las tablas tal como las ubica el generador contra el Sheet: para una prueba de FORMA da igual cuál. */
const TABLAS_GRILLA = { Estructura: 10, Recurrentes: 10, 'Materiales y Proveedores': 10 }
/** Un martes fijo: un cuadro probado contra `new Date()` cambia de premisa todos los días. */
const HOY = new Date(Date.UTC(2026, 7, 4))

/** Las líneas que saben calcularse solas en cualquier ventana — las que las tres pestañas comparten. */
const lineasConFormulaPropia = () => lineasDeCaja()
  .filter(({ linea }) => expresionReal(linea, 'X', 'Y') !== null)

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · EL CRITERIO DE ACEPTACIÓN: LA MISMA FUNCIÓN, SÓLO CAMBIA LA VENTANA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

// El truco que hace exacta la comparación: `expresionReal` sustituye `desde` y `hasta` TEXTUALMENTE.
// Pidiéndole la fórmula con dos marcas imposibles de confundir con una referencia de Sheets se
// obtiene la PLANTILLA de esa línea. Si la celda del Semanal, la del Mensual y la de CAJA son esa
// plantilla con su ventana puesta, entonces las tres salen de la misma función y está probado por
// igualdad de strings, no por lectura del código.
const MARCA_D = '«DESDE»'
const MARCA_H = '«HASTA»'
const plantilla = (l) => expresionReal(l, MARCA_D, MARCA_H)
const conVentana = (l, desde, hasta) => plantilla(l).split(MARCA_D).join(desde).split(MARCA_H).join(hasta)

test('CAJA, el Semanal y el Mensual escriben LA MISMA fórmula con distinta ventana', () => {
  const lineas = lineasConFormulaPropia()
  assert.ok(lineas.length >= 10, `sólo ${lineas.length} líneas comparables: el test no probaría nada`)

  // Las tres ventanas reales, tal como las arma cada generador.
  const MES = 'B$3'
  const finMes = `EOMONTH(${MES};0)+1`
  const SEM = 'B$3'
  const finSem = 'B$3+7'
  const tramo = 2 // un tramo cualquiera del calendario de CAJA que no sea el primero ni el último
  const desdeCaja = desdeTramo(tramo)
  const hastaCaja = hastaTramo(tramo)

  // Las tres fórmulas que CAJA escribe para su tramo, indexadas por nombre de línea.
  const deCaja = new Map(
    sumandosEnVentana(-1, desdeCaja, hastaCaja, resolutorDeTramo(tramo, FILAS_CAL, 2026))
      .map((s) => [s.nombre, s.expresion]))

  for (const { linea: l, signo } of lineas) {
    // MENSUAL: la celda del mes contiene la plantilla con la ventana del mes.
    const mensual = formulaLineaMes(l, 'B', 'B', 3, TABLAS, 2026)
    assert.ok(mensual.includes(conVentana(l, MES, finMes)),
      `${l.nombre}: el MENSUAL no usa expresionReal — tiene una definición propia de qué suma`)

    // SEMANAL: la misma plantilla, con la ventana de la semana.
    const semanal = formulaLineaSemana(l, SEM, finSem, TABLAS, 2026)
    assert.ok(semanal.includes(conVentana(l, SEM, finSem)),
      `${l.nombre}: el SEMANAL no usa expresionReal — tiene una definición propia de qué suma`)

    // CAJA: sólo el lado que sale, que es el que produce el piso proyectado de caja.
    if (signo !== -1) continue
    assert.equal(deCaja.get(l.nombre), conVentana(l, desdeCaja, hastaCaja),
      `${l.nombre}: CAJA suma algo distinto de lo que suman los dos cash flow`)
  }
})

test('la ventana es LO ÚNICO que cambia: sacándola, las tres fórmulas son idénticas', () => {
  // La prueba de arriba al revés, y es la que hace inútil trampear: se le quita a cada fórmula su
  // propia ventana y lo que queda tiene que ser el MISMO texto en las tres. Si alguien duplicara
  // `expresionReal` en otro archivo y la copia divergiera aunque sea en un rango, acá se ve.
  const l = lineasConFormulaPropia().find(({ signo }) => signo === -1).linea
  // `hasta` PRIMERO, Y NO ES UN CAPRICHO DE ORDEN. La ventana del mes es `desde='B$3'` y
  // `hasta='EOMONTH(B$3;0)+1'`: el `hasta` CONTIENE al `desde`. Sustituyendo `desde` primero, el
  // `hasta` queda mutilado (`EOMONTH(«DESDE»;0)+1`) y ya no se lo encuentra — el test acusaba a
  // `formulaJornales` de ignorar la ventana cuando el que la ignoraba era el test. Siempre se
  // reemplaza primero la expresión más larga, que es la que puede contener a la otra.
  const sinVentana = (f, d, h) => f.split(h).join(MARCA_H).split(d).join(MARCA_D)

  const finMes = 'EOMONTH(B$3;0)+1'
  const mensual = sinVentana(conVentana(l, 'B$3', finMes), 'B$3', finMes)
  const semanal = sinVentana(conVentana(l, 'B$3', 'B$3+7'), 'B$3', 'B$3+7')
  const caja = sinVentana(conVentana(l, desdeTramo(2), hastaTramo(2)), desdeTramo(2), hastaTramo(2))

  assert.equal(mensual, plantilla(l))
  assert.equal(semanal, plantilla(l))
  assert.equal(caja, plantilla(l))
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · NADIE VE DE MENOS — el error que peor se paga
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('CAJA suma TODOS los conceptos de egreso del cuadro, sin excepción', () => {
  // El error de los $41,7M no fue simétrico: el que veía de menos era el calendario de CAJA, que es
  // justamente el que produce el PISO proyectado. Un piso más alto que el real es el error que peor
  // se paga — se coloca plata a 30 días y no se llega a pagar los sueldos.
  for (const k of BORDES.keys()) {
    const nombres = sumandosEnVentana(-1, desdeTramo(k), hastaTramo(k), resolutorDeTramo(k, FILAS_CAL, 2026))
      .map((s) => s.nombre)
    const faltan = conceptosFueraDelCalendario(nombres)
    assert.deepEqual(faltan, [],
      `el tramo ${k} de CAJA no ve ${faltan.length} concepto(s) que el cash flow sí suma: ${faltan.join(' · ')}`)
  }
})

test('una línea que nadie sabe resolver ROMPE — no se descarta en silencio', () => {
  // Es la propiedad que sostiene todo lo de arriba. Sin resolutor, las cinco líneas que no viven en
  // Compras (cheques, tarjeta, IVA/IIBB, descubierto, comisiones, impuesto al cheque) desaparecerían
  // del calendario sin un solo error: plata que nadie suma y nada avisa.
  assert.throws(() => sumandosEnVentana(-1, 'A', 'B', {}), /sin forma de calcularse en una ventana/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · NO PUEDE EXISTIR UNA SEGUNDA LISTA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** Los archivos del orquestador, recursivo, sin node_modules. */
function fuentes(dir = RAIZ, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) fuentes(p, out)
    else if (e.name.endsWith('.mjs')) out.push(p)
  }
  return out
}

/** Los dos archivos donde la definición VIVE. */
const DUEÑOS = ['cash-flow-lineas.mjs', 'calendario-egresos.mjs']

/**
 * LO QUE SE DESCARTA, SE DESCARTA POR ESCRITO. Estos cuatro citan rótulos de línea y NO son una
 * segunda definición de la plata. Cada uno con su razón, para que agregar un quinto sea una decisión
 * y no un descuido:
 *
 *  · `cash-flow-mapa.mjs` — es el CONTROL INDEPENDIENTE: recalcula el cuadro desde los datos crudos
 *    en JavaScript para compararlo contra lo que el Sheet devolvió. Si consumiera `expresionReal`
 *    dejaría de controlar nada: un control no puede validarse contra la información que produce.
 *    Su duplicación es el punto, no el defecto. (Lo que sí se le exige está en el test de abajo.)
 *  · `banco-santander.mjs` y `banco-vs-cuadro.mjs` — mapean una naturaleza del extracto bancario a
 *    la línea del cuadro donde ese movimiento tiene que aparecer. Es un mapa de destino, no una suma.
 *  · `impuestos-pestana.mjs` — nombra líneas para rotular el detalle de su propia pestaña.
 *
 * Ninguno SUMA plata a partir de su lista: los cinco totales del cuadro salen de `lineasDeCaja()`.
 */
const EXCEPCIONES = ['cash-flow-mapa.mjs', 'banco-santander.mjs', 'banco-vs-cuadro.mjs', 'impuestos-pestana.mjs']

test('ningún archivo nuevo enumera las líneas de la caja por su nombre', () => {
  // Copiar tres rótulos a un array es exactamente cómo nació la segunda lista que costó $41,7M: no
  // se siente como duplicar una definición, se siente como "traer los que me interesan". Cuando el
  // cuadro cambia, la copia no cambia, y el que ve de menos no avisa.
  const nombres = lineasDeCaja().map(({ linea }) => linea.nombre).filter((n) => n.length > 12)
  const culpables = []
  for (const f of fuentes()) {
    if ([...DUEÑOS, ...EXCEPCIONES].some((d) => f.endsWith(d)) || f.endsWith('.test.mjs')) continue
    const src = readFileSync(f, 'utf8')
    const citados = nombres.filter((n) => src.includes(`'${n}'`) || src.includes(`"${n}"`))
    if (citados.length >= 3) culpables.push(`${f.slice(RAIZ.length + 1)} cita ${citados.length}: ${citados.slice(0, 3).join(' · ')}…`)
  }
  assert.deepEqual(culpables, [],
    `hay una segunda lista de qué mueve la caja. Si es un control independiente, agregalo a `
    + `EXCEPCIONES con su razón escrita; si no, consumí lineasDeCaja():\n  ${culpables.join('\n  ')}`)
})

test('el control independiente apunta a la fila que el generador escribe, con el rótulo que escribe', () => {
  // La independencia de `cash-flow-mapa.mjs` está bien: recalcula el cuadro en JavaScript desde los
  // datos crudos y lo compara contra lo que el Sheet devolvió. Lo que NO puede ser independiente es
  // DÓNDE mira: sus anclas son números de fila escritos a mano (`fila: 24`). Si el cuadro cambia de
  // forma, el control sigue leyendo la fila 24 —que ahora es otra línea— y sigue dando verde.
  //
  // MEDIDO AL ESCRIBIR ESTE TEST (05/08/2026): las 41 filas apuntaban bien, pero CUATRO rótulos ya
  // habían derivado del cuadro — "Cobranzas esperadas (proyección)" cuando la línea se llama
  // "Cobranzas esperadas — de este mes en adelante (suma al flujo)", y tres más. Nadie lo veía porque
  // el rótulo del control sólo se usa para nombrar el hallazgo: el número seguía saliendo. Un informe
  // de conciliación que nombra una línea que no existe es exactamente cómo se descarta un desvío real
  // creyendo que era de otra cosa.
  const src = readFileSync(join(RAIZ, 'lib', 'cash-flow-mapa.mjs'), 'utf8')
  const entradas = [...src.matchAll(/fila:\s*(\d+),[^}]*?concepto:\s*'([^']+)'/g)]
    .map((m) => ({ fila: Number(m[1]), concepto: m[2] }))
  assert.ok(entradas.length >= 30,
    `el mapa declara ${entradas.length} filas: cambió de forma y este test dejó de leerlo — arreglar el test, no bajarle el umbral`)

  const g = grilla('mensual', [], null, null, TABLAS_GRILLA, FILAS_CAL, HOY)
  const mal = entradas
    .map((e) => ({ ...e, enGrilla: String(g.filas[e.fila - 1]?.[0] ?? '').trim() }))
    .filter((e) => e.enGrilla !== e.concepto)
  assert.deepEqual(mal.map((e) => `fila ${e.fila}: el control dice "${e.concepto}" y el cuadro escribe "${e.enGrilla}"`), [],
    'el control quedó apuntando a un cuadro que ya no existe')
})

test('el CUADRO es el único que decide el signo de una línea', () => {
  // El signo —entra o sale— es la otra mitad de la definición, y es la que se rompe callada: una
  // nota de crédito sumada como compra ya costó $41,9M en este mismo Sheet. Vive en el grupo del
  // CUADRO y en ningún otro lado: `lineasDeCaja` lo lee de ahí y nadie más lo declara.
  const porNombre = new Map()
  for (const a of CUADRO) {
    for (const g of a.grupos) {
      for (const l of g.lineas) {
        const previo = porNombre.get(l.nombre)
        // Un mismo rótulo con dos signos distintos es plata que se suma y se resta según quién mire.
        assert.ok(previo === undefined || previo === g.signo,
          `"${l.nombre}" aparece con signo ${previo} y ${g.signo}: el mismo concepto entra y sale a la vez`)
        porNombre.set(l.nombre, g.signo)
      }
    }
  }
  // Y las cinco que no viven en Compras se identifican por MARCA, no por rótulo: comparar rótulos es
  // lo que se rompe cuando alguien corrige una tilde.
  const sinFormula = lineasDeCaja().filter(({ linea }) => expresionReal(linea, 'X', 'Y') === null)
  for (const { linea } of sinFormula) {
    assert.ok(marcaDeLinea(linea) !== null,
      `"${linea.nombre}" no tiene fórmula NI marca: el resolutor no puede encontrarla y el calendario la perdería`)
  }
})
