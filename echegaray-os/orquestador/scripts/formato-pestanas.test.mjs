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
