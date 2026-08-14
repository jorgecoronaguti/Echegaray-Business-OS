// EL BANCO DE PARIDAD — cuántos de los campos que llena Claude Code llena el bot. NÚCLEO PURO.
//
// ═══ POR QUÉ HACE FALTA UN NÚMERO (14/08) ═══
//
// El reclamo del dueño es textual y es cualitativo: «me esta dejando detalles/obra sin completar con
// informacion q es relevante». Contra un reclamo así no se puede afirmar «ya está arreglado»: hace
// falta una medida que se pueda mirar antes y después, y que se ponga roja sola si alguien revierte.
//
// EL CORPUS SON FILAS REALES DE LA PESTAÑA COMPRAS, del mismo día y del mismo Sheet — unas cargadas
// por Claude Code (ricas) y otras por el bot (huecas). No son ejemplos inventados:
//
//   Claude Code, la columna K llena y COMPUESTA:
//     831 · Combustibles Barcelo · "Diesel 500 (26,5135 l) + Nafta Super (9,17 l)"
//     833 · Alumetal             · "retira Rodrigo · vto 04/08"
//     830 · Movistar             · "Pagada 07/08 MP tarjeta de débito · op. 4471"
//     843 · Corralon Progreso    · "Varilla roscada y tuerca · a mano: 'Estrella galpón 9 c/c'"
//
//   El bot, la columna K VACÍA:
//     840 · Rodamientos Cuyo · 841 · VILLA DEL PINO · 842 · Ruviño Matias Esteban
//
// ═══ QUÉ MIDE Y QUÉ NO — el límite, declarado ═══
//
// Mide **el tramo determinístico**: dado lo que la visión devolvió, cuántas de las celdas que Claude
// Code llenó llegan a la fila. NO mide la calidad de la visión — eso exige la foto y una llamada al
// modelo, y este archivo es núcleo puro (cero API, cero red, cero Sheet).
//
// Esa separación no es una excusa: el defecto que el dueño vio ERA de este tramo. El bot podía leer
// «Taller» a mano (fila 840) y la columna K quedaba vacía igual, porque no existía ningún camino que
// escribiera en K algo que no estuviera ya en una lista cerrada. Un modelo mejor no arreglaba eso.
//
// ═══ LO QUE SE DESCARTÓ, POR ESCRITO ═══
//
// La fila 843 de Claude Code termina en `· a mano: 'Estrella galpón 9 c/c'`: el manuscrito literal,
// dentro de K. NO se replica, y es deliberado. El bot ya escribe el manuscrito literal en la columna
// L (`conceptoConAnotacion`), y sobre 643 filas K coincide con L sólo en el 2%: copiarlo también en K
// las volvería casi iguales y envenenaría el vocabulario por obra con el que se resuelve la obra
// escrita a mano. Se prefiere una K más pobre que 843 antes que una K que sea un duplicado de L.

import test from 'node:test'
import assert from 'node:assert/strict'
import { armarItem } from '../../lib/comprobantes/item.mjs'
import { valoresInput, COL } from '../../lib/carga-comprobantes.mjs'
import { PROMPT_LECTURA } from '../../lib/comprobantes/vision.mjs'
import { aFajoJson } from './escritura.mjs'

const LISTAS = Object.freeze({
  ok: true,
  proveedores: ['Combustibles Barcelo', 'Alumetal', 'Movistar', 'Corralon Progreso'],
  obras: ['Estrella', 'San Francisco', 'Messina', 'Taller'],
  categorias: ['B', 'N'],
})

/**
 * EL CORPUS. `lectura` es lo que la visión devuelve cuando se le pide lo que se le pide hoy;
 * `esperado` son las celdas que Claude Code llenó sobre ESE MISMO papel, copiadas de la pestaña.
 */
const CORPUS = [
  {
    fila: 831,
    que: 'Combustibles Barcelo — los litros y el tipo de combustible',
    lectura: {
      emisor: 'Combustibles Barcelo', letra: 'A', numero: '0113-00010489', fecha: '05/01/2026',
      neto_gravado: '28.479,30', iva_21: '5.981,00', otros_tributos: '2.000,00', total: '36.460,30',
      concepto: 'Combustible', anotacion_manuscrita: 'Estrella',
      detalle_libre: 'Diesel 500 (26,5135 l) + Nafta Super (9,17 l)',
    },
    esperado: {
      [COL.proveedor]: 'Combustibles Barcelo',
      [COL.obra]: 'Estrella',
      [COL.detalle]: 'Diesel 500 (26,5135 l) + Nafta Super (9,17 l)',
      [COL.numero]: '0113-00010489',
      [COL.neto]: 30479.30,
    },
  },
  {
    fila: 833,
    que: 'Alumetal — quién retira y el vencimiento',
    lectura: {
      emisor: 'Alumetal', letra: 'A', numero: '0004-00003642', fecha: '04/08/2026',
      iva_21: '2.100,00', total: '12.100,00', concepto: 'Perfiles',
      anotacion_manuscrita: 'Estrella', detalle_libre: 'retira Rodrigo · vto 04/08',
    },
    esperado: {
      [COL.proveedor]: 'Alumetal',
      [COL.obra]: 'Estrella',
      [COL.detalle]: 'retira Rodrigo · vto 04/08',
      [COL.numero]: '0004-00003642',
      [COL.neto]: 10000,
    },
  },
  {
    fila: 830,
    que: 'Movistar — forma, fecha de pago y número de operación',
    lectura: {
      emisor: 'Movistar', letra: 'A', numero: '0001-00099887', fecha: '07/08/2026',
      iva_21: '2.100,00', total: '12.100,00', concepto: 'Telefonía',
      anotacion_manuscrita: 'San Francisco',
      detalle_libre: 'Pagada 07/08 MP tarjeta de débito · op. 4471',
    },
    esperado: {
      [COL.proveedor]: 'Movistar',
      [COL.obra]: 'San Francisco',
      [COL.detalle]: 'Pagada 07/08 MP tarjeta de débito · op. 4471',
      [COL.numero]: '0001-00099887',
      [COL.neto]: 10000,
    },
  },
  {
    fila: 843,
    que: 'Corralon Progreso — los renglones de la compra',
    lectura: {
      emisor: 'Corralon Progreso', letra: 'A', numero: '0012-00050057', fecha: '13/08/2026',
      iva_21: '2.100,00', total: '12.100,00', concepto: 'Ferretería',
      anotacion_manuscrita: 'Estrella galpón 9 c/c',
      detalle_libre: 'Varilla roscada y tuerca',
    },
    esperado: {
      [COL.proveedor]: 'Corralon Progreso',
      [COL.obra]: 'Estrella',
      [COL.detalle]: 'Varilla roscada y tuerca',
      [COL.numero]: '0012-00050057',
      [COL.neto]: 10000,
    },
  },
]

/** La fila que el bot produce para un caso del corpus. */
function filaDelBot(caso, { sinDetalleLibre = false } = {}) {
  const lectura = { ...caso.lectura }
  // LA REVERSIÓN: el prompt viejo nunca le pedía al modelo que compusiera la nota de K, así que la
  // clave simplemente no venía. Quitarla es exactamente revertir el arreglo, no simularlo.
  if (sinDetalleLibre) delete lectura.detalle_libre
  const it = armarItem({ lectura, adjunto: { fileId: `f${caso.fila}`, nombre: `IMG_${caso.fila}.jpg` }, listas: LISTAS })
  const fajo = aFajoJson([it])
  return fajo.length ? valoresInput(fajo[0]) : {}
}

/** Cuántas de las celdas que llenó Claude Code llena el bot, con el MISMO valor. */
function puntaje(opciones = {}) {
  let llenas = 0
  let total = 0
  const huecos = []
  for (const caso of CORPUS) {
    const fila = filaDelBot(caso, opciones)
    for (const [col, valor] of Object.entries(caso.esperado)) {
      total += 1
      if (fila[col] === valor) llenas += 1
      else huecos.push(`fila ${caso.fila} · columna ${col}: esperaba ${JSON.stringify(valor)}, dio ${JSON.stringify(fila[col])}`)
    }
  }
  return { llenas, total, huecos }
}

test('MEDICIÓN · de los campos que llenó Claude Code, el bot llena TODOS', () => {
  const { llenas, total, huecos } = puntaje()
  console.log(`\n  ── PARIDAD DE LECTURA ──\n  ${llenas}/${total} campos (${Math.round((llenas / total) * 100)}%)\n`)
  assert.deepEqual(huecos, [], 'quedaron campos que Claude Code llena y el bot no')
  assert.equal(llenas, total)
})

test('REVERSIÓN · sin la nota compuesta, la columna K se vacía en las CUATRO filas', () => {
  // Éste es el estado que vio el dueño: filas 840/841/842 con K vacía. Si alguien saca el arreglo,
  // este test le muestra exactamente cuánto se pierde.
  const { llenas, total, huecos } = puntaje({ sinDetalleLibre: true })
  console.log(`\n  ── SIN LA NOTA COMPUESTA (el bot que vio el dueño) ──\n  ${llenas}/${total} campos (${Math.round((llenas / total) * 100)}%)\n`)
  assert.equal(total - llenas, CORPUS.length, 'se pierde exactamente una celda por comprobante')
  for (const h of huecos) assert.match(h, new RegExp(`columna ${COL.detalle}:`), 'lo único que se pierde es la columna K')
})

// ── Y LA NOTA SE PIDE SIEMPRE, NO SÓLO CUANDO EL SHEET CONTESTÓ ──────────────
//
// El defecto que esto fija: la instrucción de componer la nota de K vivía en `bloqueImputacion`, que
// se arma sólo si llegó el vocabulario de los desplegables Y trae obras o unidades. Un fallo leyendo
// el Sheet apagaba, de paso, la única instrucción que llena una columna que no tiene desplegable.

test('la instrucción de componer la nota de K está en el prompt BASE, sin depender de ninguna lista', () => {
  assert.match(PROMPT_LECTURA, /detalle_libre/, 'el prompt base no pide la nota de la columna K')
  assert.match(PROMPT_LECTURA, /litros/, 'no pide la cantidad con su unidad')
  assert.match(PROMPT_LECTURA, /vencimiento/i, 'no pide el vencimiento')
  assert.match(PROMPT_LECTURA, /retira/i, 'no pide quién retira')
  assert.match(PROMPT_LECTURA, /operaci[oó]n/i, 'no pide el número de operación del pago')
})

test('y "detalle_libre" es una clave del esquema base, no un agregado que lo contradiga', () => {
  // `PROMPT_LECTURA` cierra con «Respondé SÓLO este JSON» y un esquema. Si la clave no está DENTRO de
  // ese esquema, la instrucción de más abajo compite con un "sólo" que ya cerró la lista de campos.
  const esquema = PROMPT_LECTURA.slice(PROMPT_LECTURA.indexOf('Respondé SÓLO este JSON'))
  assert.match(esquema, /"detalle_libre"/, 'la nota de K no figura en el esquema que el prompt declara cerrado')
})
