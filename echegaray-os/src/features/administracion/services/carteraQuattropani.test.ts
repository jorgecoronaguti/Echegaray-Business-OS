// QUATTROPANI — SALÓN COMERCIAL: LA FILA QUE EL DUEÑO SEÑALÓ.
//
// «Pésimo por donde lo mires, desde la información hasta cómo la muestra» (10/09/2026). Era la fila
// más equivocada de la pantalla y por cuatro motivos distintos:
//
//   1 · EL CONTRATO ES EN DÓLARES —U$S 63.000— y la fila publicaba sólo pesos. Ese número es una
//       VALUACIÓN al tipo de cambio vivo: cambia todos los días sin que nadie toque nada, y sin la
//       moneda escrita eso se lee como un dato que se mueve solo.
//   2 · LA COLUMNA DE PAPELES ESTABA VACÍA. La obra no tiene orden de compra: tiene un contrato.
//       Una celda vacía en una columna de papeles se lee como «se perdió el papel».
//   3 · EL COBRADO ERA EL NETO. La pestaña OBRAS publica el TOTAL con IVA ($107.877.339) y la app
//       mostraba otra cifra bajo el mismo rótulo.
//   4 · EL COBRO PARECÍA EXCEDER EL CONTRATO. $107.877.339 al lado de $95.303.124 son 13 % de más
//       que NO existen: uno lleva IVA y el otro no. La barra compara contra el contrato llevado a
//       la misma especie y da 94 %, sin ninguna alarma.
//
// LOS NÚMEROS SON LOS DE LA PESTAÑA OBRAS LEÍDA EL 10/09/2026 A LAS 17:45, cruzados contra la vista
// `public.obra_cuenta`. Lo que este archivo fija es que la fila los publique tal cual y que ninguna
// de las cuatro cosas vuelva.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { ClientePanel } from '@/features/clientes/types'
import { armarCartera, type CobroDeObra } from './homeCartera.ts'
import type { EconomiaDeObra } from '@/features/clientes/services/economiaObras'
import { IVA_GENERAL, progresoDeCobroBruto } from '../../clientes/services/progresoCobro.ts'

const OBRA = 'quattropani'
const CONTRATO_USD = 63_000
const TC = 1_512.75
const CONTRATADO = 95_303_124
const COBRADO_TOTAL = 107_877_339
const POR_COBRAR = 52_357_048

const cliente: ClientePanel = {
  cliente_id: 'quattropani', slug: 'quattropani', nombre_comercial: 'Franco Quattropani',
  razon_social: null, cuit: null, direccion: null, telefono: null, email: null, responsable_id: null,
  responsable_nombre: null, drive_carpeta_id: null, activo: true, notas: null, n_obras: 1,
  n_obras_activas: 1, restricciones_abiertas: 0, avance_sincronizado_en: null, n_contactos: 0,
  n_documentos: 0,
}

const economia = new Map<string, EconomiaDeObra>([[OBRA, {
  obra_canonica_id: OBRA,
  contratado: CONTRATADO,
  contratado_usd: CONTRATO_USD,
  tipo_cambio: TC,
  origen: 'oc-usd-x-tc',
  referencia: null,
  nota: null,
  // NINGUNA ORDEN DE COMPRA: el trabajo se encargó por contrato. No es un papel que falte.
  oc_civa_ventana: null, oc_civa_historico: null, oc_n_ventana: 0, oc_n_historico: 0,
}]])

const cobro = new Map<string, CobroDeObra>([[OBRA, {
  total: COBRADO_TOTAL,
  neto: 89_154_825,
  porCobrar: POR_COBRAR,
  vencido: null,
  proximo: { fecha: '2026-09-25', medio: 'Transferencia' },
  imputacion: 'cliente',
}]])

const [fila] = armarCartera({
  clientes: [cliente],
  obras: [{ obra_id: OBRA, nombre: 'Quattropani - SALÓN COMERCIAL', cliente_id: 'quattropani', avance_pct: 94, jefe_obra: null }],
  cobrado: { por: cobro, disponible: true },
  certificados: [],
  economia,
})
const trabajo = fila.enCurso[0]

test('el contrato viaja en su moneda Y en su valuación de hoy, con el tipo de cambio', () => {
  assert.equal(trabajo.contratadoUsd, CONTRATO_USD, 'sin esto la celda no puede escribir «U$S 63.000»')
  assert.equal(trabajo.contratado, CONTRATADO)
  assert.equal(trabajo.tipoCambio, TC, 'sin el TC, el `title` no puede decir por qué cambia el número')
})

test('sin órdenes de compra, la fila lo dice con un cero y no con un hueco', () => {
  // `0` y `null` no son lo mismo: cero es «no hay ninguna» y `null` sería «no pude leerlas». La
  // celda dibuja «Contrato U$S 63.000 · sin OC» sólo cuando la respuesta es cero.
  assert.equal(trabajo.ocNVentana, 0)
  assert.equal(trabajo.ocCivaVentana, null)
})

test('las cuatro columnas de cobro son las de la pestaña OBRAS, con IVA donde corresponde', () => {
  assert.equal(trabajo.cobradoTotal, COBRADO_TOTAL, 'la columna «Cobrado» de OBRAS es el TOTAL')
  assert.notEqual(trabajo.cobradoTotal, trabajo.cobradoNeto, 'el neto no es lo que se dibuja')
  assert.equal(trabajo.porCobrar, POR_COBRAR)
  assert.equal(trabajo.vencido, null, 'OBRAS publica «—»: no hay mora, y un 0 diría otra cosa')
  assert.deepEqual(trabajo.proximo, { fecha: '2026-09-25', medio: 'Transferencia' })
})

test('el cobro NO excede el contrato: la diferencia de $12,6 M es el IVA, no plata de más', () => {
  const p = progresoDeCobroBruto(COBRADO_TOTAL, CONTRATADO)
  assert.equal(p?.pct, 94, 'cobrado c/IVA sobre contratado × 1,21')
  assert.equal(p?.excede, false, 'contra el contrato NETO daría 113 % y una alarma que no existe')
  // Y la cuenta que lo prueba, escrita: $95.303.124 × 1,21 = $115.316.780 > $107.877.339.
  assert.ok(CONTRATADO * IVA_GENERAL > COBRADO_TOTAL)
})

test('el cobro anotado contra el CLIENTE se le atribuye: es su único trabajo en curso', () => {
  // No hay entre qué repartir. La atribución viaja marcada `unica-obra` y el `title` dice que se
  // dedujo: un hecho y una inferencia no se publican iguales.
  assert.equal(trabajo.imputacion, 'unica-obra')
})
