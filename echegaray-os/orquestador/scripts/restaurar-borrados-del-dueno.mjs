#!/usr/bin/env node
// RESTAURAR LAS MARCAS DE BORRADO DEL DUEÑO (24/07) — deshace una purga equivocada.
//
// El 24/07 purgué 72 "falsos borrados" de sheet_rotulos creyéndolos artefactos de lecturas cortas.
// El dueño corrigió: esos borrados son SUYOS y definitivos (dejó las pestañas del Flujo minimalistas,
// sin las notas explicativas). Regla permanente: lo que él borra manda; no se reescribe.
//
// De las 72, sólo importan las de pestañas cuyo generador VIVO lee sheet_rotulos con la MISMA clave:
//   · Caja                      (caja-pestana, PESTAÑA='Caja')
//   · Cash Flow Semanal         (cash-flow-rehacer)
//   · Impuestos y Financieros   (impuestos-pestana)
// Las de 'Proveedores' (clave vieja; el generador hoy usa 'Proveedores y Materiales'), 'Estructura' y
// 'Recurrentes' (preservan por VACIO, no por sheet_rotulos) estaban huérfanas: purgarlas fue inocuo.
//
// SEGURO: sólo se restaura como borrado un rótulo que HOY sigue ausente de la pestaña. Nunca se marca
// como borrado algo que el dueño tenga escrito. Idempotente.
import { makeGoogleClient } from '../lib/google.mjs'
import { sembrarEdiciones } from '../lib/respetar-ediciones.mjs'
import { closePool } from '../lib/db.mjs'

const ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

// Rótulos que el dueño borró, por pestaña (exactos, como los escribía el generador).
const BORRADOS = {
  Caja: [
    '· El tipo de cambio se actualiza solo con la cotización del día. Si operás a otro (MEP, tarjeta), cargalo en la fila "Dólar declarado" y ése pasa a mandar.',
    '· Los saldos (las celdas amarillas) se cargan a mano o pegando el extracto en el chat: el OS lo lee y los completa. Lo que está en dólares se carga en dólares.',
    '· No hay integración con el banco. La API de banca empresa se pide al banco y hoy no está contratada — hasta entonces, el saldo entra por extracto, captura o arqueo.',
    '· Todo lo demás de esta pestaña se recalcula solo cada 2 horas junto con el resto del archivo.',
    '01_Valores Iniciales',
    'acuerdo y tarjeta sin usar — capacidad de endeudarse',
    'Arqueo de caja',
    'caja, bancos y valores a depositar',
    'De los cuales, en moneda extranjera',
    'disponibilidades menos cheques emitidos',
    'librados y todavía no debitados',
    'Origen del dato',
    'Qué hacer, y de dónde sale el número',
    'Qué pestaña lo tiene que tener',
  ],
  'Cash Flow Semanal': [
    'ACTIVIDADES DE FINANCIACIÓN',
    'ACTIVIDADES DE INVERSIÓN',
    'ACTIVIDADES OPERATIVAS',
    'Cada rubro de Compras sumado por separado. Si un rubro quedara fuera del cuadro, esto daría menos que el total de arriba.',
    'Cash Flow Semanal 2026 — cuándo entra y sale la plata',
    'Compra y venta de bienes de uso. Una moto o una grúa no son gasto del mes: se usan durante años y por eso la norma las saca de la operación. Mezclarlas hacía parecer que la estructura costaba el doble.',
    'Compras, rubro "Deuda previsional (planes de pago)" · detalle en la pestaña Cargas Sociales',
    'Compras, rubro "Estructura" (sin "Equipos y rodados (inversión)", que va a inversión) · detalle en la pestaña Estructura',
    'Compras, rubro "Financiero" · detalle en la pestaña Impuestos y Financieros',
    'Compras, rubro "Impuestos" · detalle en la pestaña Impuestos y Financieros',
    'Compras, rubro "Materiales Civil" · detalle en la pestaña Proveedores y Materiales',
    'Compras, rubro "Materiales Mantenimiento" · detalle en la pestaña Proveedores y Materiales',
    'Compras, rubro "Nómina · Cargas sociales" · detalle en la pestaña Cargas Sociales',
    'Compras, rubro "Nómina · Gremiales" · detalle en la pestaña Cargas Sociales',
    'Compras, rubro "Nómina · Jornales de obra" · detalle en la pestaña Jornales por Quincena',
    'Compras, rubro "Nómina · SAC" · detalle en la pestaña Compras',
    'Compras, rubro "Nómina · Sueldos administración" · detalle en la pestaña Compras',
    'Compras, rubro "Servicios recurrentes" · detalle en la pestaña Recurrentes',
    'Compras, rubro "undefined" · detalle en la pestaña Compras',
    'CONTROL — que no falte ni sobre nada',
    'Deuda financiera tomada y devuelta. Acá va la cuota del crédito prendario, que antes estaba entre los gastos y hacía ver como operativo un compromiso que no lo es.',
    'Distinto de cero = hay gastos en Compras que ninguna línea del cash flow está mirando.',
    'DÓNDE ESTÁ EL DETALLE DE CADA LÍNEA',
    'Efectivo y equivalentes al cierre del período',
    'El cash flow NO usa este número: usa el real de Jornales por Quincena. Por eso el total de egresos del año no coincide con el total de Compras, y está bien que no coincida.',
    'Están clasificadas pero no suman en ningún lado porque su Total no es un número. Hoy son 3 filas de Google en USD 25,20 sin convertir a pesos: la suma del Sheet las ignora y nadie se entera.',
    'Están clasificados y contados en el total, pero no se sabe CUÁNDO salen. Hay que fecharlos.',
    'FLUJO NETO DE ACTIVIDADES DE FINANCIACIÓN',
    'FLUJO NETO DE ACTIVIDADES DE INVERSIÓN',
    'FLUJO NETO DE ACTIVIDADES OPERATIVAS',
    'Lo que genera y consume la operación: cobrar obras, pagar gente, materiales, estructura e impuestos. Si esta sección da negativo de forma sostenida, la operación se está financiando con deuda o con capital de trabajo.',
    'Pestaña Cheques Emitidos y Tarjeta de Credito',
    'Pestaña Cobranzas',
    'Pestaña Estructura',
    'Todo lo que hay en la pestaña Compras, sin filtrar.',
  ],
  'Impuestos y Financieros': [
    '⚠ Los pagos de IVA e IIBB no están cargados en Compras: hoy el cash flow no ve esas salidas.',
    '⚠ La alícuota de IIBB se toma de las DDJJ leídas. Conviene que la confirme el contador.',
  ],
}

const norm = (s) => String(s ?? '').trim().replace(/^'/, '')

async function main() {
  const g = makeGoogleClient({})
  let totalRestaurados = 0
  for (const [pestana, rotulos] of Object.entries(BORRADOS)) {
    const vivo = await g.readSheetValues(ID, `${pestana}!A1:BZ400`).catch(() => [])
    const presentes = new Set()
    for (const f of vivo) for (const c of f || []) { const t = norm(c); if (t) presentes.add(t) }
    const ausentes = rotulos.filter((r) => !presentes.has(norm(r)))
    const presentesYa = rotulos.filter((r) => presentes.has(norm(r)))
    if (ausentes.length) await sembrarEdiciones(ID, pestana, ausentes)
    totalRestaurados += ausentes.length
    console.log(`  ${pestana}: restaurados ${ausentes.length} · ya presentes (no se tocan) ${presentesYa.length}`)
    for (const p of presentesYa) console.log(`      (presente, se respeta) "${String(p).slice(0, 60)}"`)
  }
  console.log(`\nTotal marcas de borrado restauradas: ${totalRestaurados}. Los generadores ya no reescribirán esos rótulos.`)
  await closePool()
}
main().catch((e) => { console.error(e); process.exit(1) })
