// QUÉ PESTAÑA NO ESTÁ MIRANDO NADIE.
//
// POR QUÉ EXISTE (13/08). `censo-numeros-pegados.mjs` y `auditar-pantalla.mjs` recorren la lista
// `PESTANAS` de este archivo. "OBRAS" y "Calendario de Cobros" nunca se anotaron ahí, así que correr
// el censo sobre OBRAS devolvía "0 números pegados" — no porque no los tuviera (tiene ~40 en el
// detalle), sino porque el censo no sabía que la pestaña existía. Una lista vacía y una pestaña
// impecable dan exactamente el mismo verde.
//
// Agregar los dos nombres a mano arreglaba el caso y dejaba el mecanismo intacto: la próxima pestaña
// nueva volvería a entrar sin que nadie la mire. Lo que se prueba acá es el MECANISMO — que el
// archivo sepa contestar "qué hay en el Sheet que no está en ninguna de mis dos listas".

import test from 'node:test'
import assert from 'node:assert/strict'
import { expandirColumnas, indiceDeColumna } from '../lib/origen-declarado.mjs'
import { PESTANAS, SIN_PANTALLA, pestanasSinCobertura } from './formato-pestanas.mjs'

/**
 * LAS 33 PESTAÑAS DEL ARCHIVO VIVO, leídas con `getSheetMeta` el 13/08/2026.
 *
 * Es una FOTO y envejece — por eso el aviso de verdad es el de runtime (`avisarSinCobertura`, que
 * corre contra el archivo en cada auditoría). Acá sirve para lo que un test sí puede probar sin red:
 * que ninguna de las que existían ese día se haya quedado afuera de las dos listas.
 */
const VIVAS_13_08 = [
  'Compras', 'Jornales por Quincena', 'Cargas Sociales', 'Impuestos y Financieros', 'Recurrentes',
  'Estructura', 'Materiales', 'Proveedores', 'Cobranzas', 'OBRAS', 'Tarjeta de Credito',
  'Cheques Recibidos', 'Cheques Emitidos', 'CAJA', 'Cash Flow Semanal', 'Cash Flow Mensual',
  '01_Valores Iniciales', '_UOCRA_RAW', '_J_OBREROS', '_J_OFICINA', 'Parámetros', '_ARCA_RAW',
  '_F931_RAW', '_BANCO_RAW', '_IIBB_RAW', '_CHEQUES_RAW', 'Deuda viva (OS)', '_PROVEEDORES_OS',
  '_CRUCE_ARCA', '_CAJA_ANEXO', '_MOVIMIENTOS', '_PRESUPUESTO_MENSUAL', 'Calendario de Cobros',
]

test('ninguna pestaña del archivo queda fuera de todo control sin que alguien lo haya declarado', () => {
  assert.deepEqual(pestanasSinCobertura(VIVAS_13_08), [],
    'una pestaña acá es una que ningún auditor mira y nadie decidió que fuera así')
})

test('OBRAS Y "Calendario de Cobros" ESTÁN EN LA LISTA — el defecto exacto que se pagó', () => {
  // Si alguien las saca, este test las nombra: no aparecen en ninguna de las dos listas y el censo
  // volvería a informar "0 pegados" sobre una pestaña que no leyó.
  const titulos = PESTANAS.map((p) => p.titulo)
  for (const t of ['OBRAS', 'Calendario de Cobros']) {
    assert.ok(titulos.includes(t), `${t} no está en PESTANAS: el censo y el auditor de pantalla no la van a mirar`)
  }
  // Las dos tienen piel propia (su generador las formatea entero), así que el formateador general no
  // las toca: entran a la lista para que las MIREN, no para que las repinten.
  for (const t of ['OBRAS', 'Calendario de Cobros']) {
    assert.equal(PESTANAS.find((p) => p.titulo === t).propio, true)
  }
})

test('una pestaña nueva que nadie declaró se reporta, y una declarada no molesta', () => {
  assert.deepEqual(pestanasSinCobertura([...VIVAS_13_08, 'Presupuestos 2027']), ['Presupuestos 2027'])
  // Los insumos con guion bajo quedan fuera por regla, no uno por uno: son entradas, no pantallas.
  assert.deepEqual(pestanasSinCobertura(['_LO_QUE_SEA']), [])
  assert.ok(Object.hasOwn(SIN_PANTALLA, 'Parámetros'), 'lo excluido se declara con su motivo, no se omite')
})

test('el ancho declarado de cada pestaña nueva es el que su generador escribe', () => {
  // Un `cols` corto hace que el auditor no mire justo la columna donde vive el número que se lee —
  // ya pasó con "Impuestos y Financieros" (cols 12 sobre una grilla de 15).
  assert.equal(PESTANAS.find((p) => p.titulo === 'OBRAS').cols, 9)
  assert.equal(PESTANAS.find((p) => p.titulo === 'Calendario de Cobros').cols, 17)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Y UNA PESTAÑA PUEDE ESTAR EN LA LISTA Y AUDITARSE A MEDIAS (15/08)
//
// "Jornales por Quincena" estaba anotada con `cols: 13` mientras su generador escribe `ANCHO = 14`.
// La columna N —«Pagado el», la del dueño— quedó fuera de todo control de pantalla durante dos
// semanas, y no estaba vacía: tenía siete seriales de fecha dibujados como importes, arriba de su
// propio encabezado. Estar en la lista con el ancho equivocado da el mismo verde que no estar.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('el ancho declarado de "Jornales por Quincena" es el que escribe su generador', async () => {
  const { ANCHO } = await import('./jornales-pestana.mjs')
  const p = PESTANAS.find((x) => x.titulo === 'Jornales por Quincena')
  assert.equal(p.cols, ANCHO,
    'el auditor de pantalla recorre PESTANAS: con cols menor que ANCHO no mira las últimas columnas')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// UNA EXCEPCIÓN DECLARADA TIENE QUE PODER DISCUTIRSE
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// `origenPorBloque` apaga un aviso del censo. Lo único que la separa de un interruptor es que diga
// POR QUÉ y que ampare un rango angosto y verificable. Un permiso sin motivo, o con un rango de
// columnas más ancho que la pestaña, es exactamente la forma de tapar el problema que
// lib/origen-declarado.mjs existe para no permitir.

test('toda declaración de origen dice qué ampara, en qué columnas y POR QUÉ', () => {
  for (const p of PESTANAS) {
    for (const d of p.origenPorBloque ?? []) {
      assert.ok(String(d.bloque ?? '').trim(), `${p.titulo}: una declaración sin bloque`)
      assert.ok(String(d.cols ?? '').trim(), `${p.titulo}: "${d.bloque}" no dice qué columnas ampara`)
      // El «por qué» es lo que la próxima persona va a discutir. Una palabra suelta no alcanza.
      assert.ok(String(d.que ?? '').trim().length >= 40,
        `${p.titulo}: "${d.bloque}" ampara sin explicar de dónde sale el dato`)
    }
  }
})

test('ninguna declaración ampara más columnas de las que la pestaña tiene, ni la misma dos veces', () => {
  for (const p of PESTANAS) {
    const vistas = new Set()
    for (const d of p.origenPorBloque ?? []) {
      for (const c of expandirColumnas(d.cols)) {
        assert.ok(indiceDeColumna(c) < p.cols,
          `${p.titulo}: "${d.bloque}" ampara ${c}, y la pestaña declara ${p.cols} columna(s)`)
        const clave = `${d.bloque}|${c}`
        assert.equal(vistas.has(clave), false, `${p.titulo}: "${d.bloque}" declara ${c} dos veces`)
        vistas.add(clave)
      }
    }
  }
})

// ═══ EL RECORTE DE GRILLA NO PUEDE BORRAR EL LIENZO DE OTRO GENERADOR (09/09/2026) ═══
//
// EL DEFECTO QUE ATRAPA, con los números medidos en el archivo vivo: CAJA tiene 68 filas de grilla y su
// última fila con texto en la columna A es la 19. El recorte «contenido + 40» la dejaba en 59, y el
// editor VIVO de Google —que sube un gráfico hasta que entre— dibujaba el tercer bloque encima del
// segundo. Pasó el 08/09 y otra vez el 09/09: `caja-graficos-verificar.mjs` dio ✓ a las 07:02:33 y a
// las 07:06 este recorte la achicó. El alto de CAJA no lo decide el texto: lo deciden los gráficos.
import { filasTrasRecorte } from './formato-pestanas.mjs'
import { altoMinimoDeCaja } from '../lib/caja-graficos.mjs'

test('el recorte respeta el piso de la pestaña: CAJA de 68 filas con texto hasta la 19 NO se toca', () => {
  const piso = altoMinimoDeCaja()
  assert.equal(piso, 68, 'el piso de CAJA sale del generador de gráficos, no de un número copiado')
  // Sin piso —el código de antes— el destino era 59, que es exactamente la pestaña rota.
  assert.equal(filasTrasRecorte({ filas: 68, ultima: 19, margen: 40, piso: 0 }), 59)
  // Con el piso, no hay recorte que hacer.
  assert.equal(filasTrasRecorte({ filas: 68, ultima: 19, margen: 40, piso }), null)
})

test('el recorte sigue recortando lo que sobra de verdad, y nunca por debajo del piso', () => {
  // Cargas Sociales: 1.092 filas de grilla para 78 de contenido — el caso que este recorte vino a resolver.
  assert.equal(filasTrasRecorte({ filas: 1092, ultima: 78, margen: 40 }), 118)
  // Una CAJA que quedó con 400 filas se recorta, pero al piso, no a 59.
  assert.equal(filasTrasRecorte({ filas: 400, ultima: 19, margen: 40, piso: altoMinimoDeCaja() }), 68)
  // Si no se pudo leer el contenido, no se toca nada: un 0 leído por error borraría la pestaña entera.
  assert.equal(filasTrasRecorte({ filas: 400, ultima: 0, margen: 40 }), null)
  // Ya está en su alto o por debajo: nada que hacer (un destino MENOR sería un deleteDimension).
  assert.equal(filasTrasRecorte({ filas: 59, ultima: 19, margen: 40, piso: 68 }), null)
})

test('CAJA declara su piso en la lista: sin la marca, el piso nunca llega al recorte', () => {
  // El invariante que hace falta además de la función pura: `filasTrasRecorte` puede ser perfecta y el
  // defecto vuelve igual si la entrada de CAJA no pide el piso. Es el `piso: 0` de arriba.
  const caja = PESTANAS.find((p) => p.titulo === 'CAJA')
  assert.ok(caja, 'CAJA tiene que seguir en la lista del formateador')
  assert.equal(caja.pisoDeGraficos, true)
  assert.ok(!caja.carga, 'si fuera de carga el margen sería 300 y el piso tampoco haría falta — no es el caso')
})
