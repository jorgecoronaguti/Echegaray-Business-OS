#!/usr/bin/env node
/**
 * ¿DE QUÉ FACTURA ES CADA CHEQUE QUE TODAVÍA NO DEBITÓ, Y CUÁNTA PLATA QUEDA SIN EXPLICAR?
 *
 * SÓLO LEE. No escribe una celda. Se puede correr contra el Sheet real sin riesgo.
 *
 * ═══ POR QUÉ NO ALCANZA CON QUE EL CRUCE ESTÉ EN EL LIBRO ═══
 *
 * El libro consume el cruce y produce COMPROMETIDO donde antes había REAL. Eso arregla el número —
 * pero deja invisible lo que NO se pudo cruzar, que es justamente la parte que el dueño puede cerrar
 * cargando un dato. Un cheque ambiguo y uno sin factura son dos trabajos distintos:
 *
 *   · AMBIGUO         → hay dos filas de Compras que podrían ser; hace falta desempatar el N°.
 *   · FALTA LA FACTURA→ el N° existe y no está cargado; hace falta cargar el comprobante.
 *   · SIN RESPALDO    → no hay N° ni conjunto que dé; hace falta escribir el N° en la columna H.
 *
 * Y el veredicto NO se valida contra lo que produce: el monto que queda afuera se mide sobre el
 * REGISTRO DE CHEQUES (la fuente), no sobre el libro (el producto). Preguntarle al libro si el libro
 * está completo no prueba nada.
 *
 *   node orquestador/scripts/cruce-cheque-factura-informe.mjs
 */

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { cruzar, chequesDelRegistro, puertaDeCheque, PUERTA, CONFIANZA } from '../lib/cruce-cheque-factura.mjs'
import { comprasPagadasConCheque, deCompras, deChequesEmitidos } from '../lib/libro-extractores.mjs'
import { MARCAS } from '../lib/cheques-cobertura.mjs'
import { isoDeSerial } from '../lib/libro-extractores-fechas.mjs'
import { ubicarRegistro } from './cheques-emitidos-tablero.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const pesos = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-AR')
// EL SERIAL SE RENDERIZA CON EL HELPER DEL REPO, no con `toLocaleDateString`: éste último interpreta
// la medianoche UTC en el huso local (UTC−3) y devuelve el DÍA ANTERIOR. El primer informe decía que
// el cheque 316 se paga el 11/8 cuando la celda dice 12/8 — un día de error en una fecha de pago
// mueve el compromiso de semana en la escalera.
const dia = (s) => isoDeSerial(s) || '—'

/**
 * NÚCLEO PURO: el renglón por clase, con su plata. Contar cheques no distingue $323.000 de $7,6M.
 * @returns {Array<{clase:string, cheques:number, monto:number, cierra:boolean}>}
 */
export function renglones(resumen = {}) {
  const { vivos, ...resto } = resumen
  const filas = Object.values(resto)
  const suma = filas.reduce((a, r) => a + r.monto, 0)
  // El control: las cinco clases tienen que sumar el registro vivo entero. Si no suman, se cayó un
  // cheque del veredicto — y un cheque que no está en ninguna clase es exactamente el hueco que este
  // informe existe para no tener.
  return [...filas, { ...vivos, cierra: Math.abs(suma - vivos.monto) < 1 }]
}

/**
 * NÚCLEO PURO: la ventana del mes en curso, en seriales de Sheets. Es la pregunta que hizo el dueño
 * ("los cheques que vencen ESTE MES"), y el límite superior es EXCLUYENTE para que el último día del
 * mes no caiga también en el siguiente.
 */
export function mesEnCurso(hoy = new Date()) {
  const serial = (d) => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000)
  return { desde: serial(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: serial(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1)) }
}

async function main() {
  const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const leer = (r) => g.readSheetValues(ID, r, { render: 'UNFORMATTED_VALUE' })
  const [compras, chequesRaw, banco] = await Promise.all([
    leer('Compras!A1:AN'), leer("'Cheques Emitidos'!A1:M"), leer('_BANCO_RAW!A1:F'),
  ])
  const reg = ubicarRegistro(chequesRaw.map((f) => [f?.[0]]))
  if (!reg) throw new Error('no encontré el registro de Cheques Emitidos: sin él no hay nada que cruzar.')
  // EL CORTE ES EL DEL EXTRACTO —la última fecha de la réplica del banco—, no el de hoy: es hasta ahí
  // que el saldo publicado prueba algo. Con el corte de hoy la ventana quedaría más corta que la real.
  const corte = (banco ?? []).slice(3).reduce((mx, f) => (typeof f?.[0] === 'number' && f[0] > mx ? f[0] : mx), 0) || null

  const cheques = chequesDelRegistro(chequesRaw, { fila0: reg.primera })
  const cruce = cruzar(cheques, comprasPagadasConCheque(compras))

  console.log(`\nCRUCE CHEQUE ↔ FACTURA — corte del extracto ${dia(corte)}`)
  console.log('─'.repeat(94))
  for (const r of renglones(cruce.resumen)) {
    const marca = r.cierra === false ? '✗' : r.cierra ? '=' : ' '
    console.log(`  ${marca} ${String(r.clase).padEnd(26)} ${String(r.cheques).padStart(4)} cheque(s)  ${pesos(r.monto).padStart(16)}`)
  }
  if (renglones(cruce.resumen).at(-1).cierra === false) {
    console.log('  ✗ LAS CLASES NO SUMAN EL REGISTRO VIVO: un cheque se cayó del veredicto.')
    process.exitCode = 1
  }

  console.log('\nLO QUE CRUZÓ, Y CON QUÉ CLAVE')
  console.log('─'.repeat(94))
  for (const [fila, v] of [...cruce.porCheque].sort((a, b) => a[0] - b[0])) {
    const glifo = v.confianza === CONFIANZA.comprobante ? '✓' : '≈'
    console.log(`  ${glifo} f${String(fila).padEnd(4)} ${v.cheque.proveedor.slice(0, 26).padEnd(26)} ${pesos(v.cheque.importe).padStart(14)}`
      + `  paga ${dia(v.cheque.fechaPago)}  → Compras ${v.compras.map((c) => 'f' + c.fila).join('+')}  [${v.confianza}]`)
  }

  console.log('\nLO QUE NO CRUZÓ — cada renglón es una carga del dueño, no un bug del código')
  console.log('─'.repeat(94))
  for (const x of [...cruce.ambiguos, ...cruce.sinCruce].sort((a, b) => b.cheque.importe - a.cheque.importe)) {
    console.log(`  ✗ f${String(x.cheque.fila).padEnd(4)} ${x.cheque.proveedor.slice(0, 26).padEnd(26)} ${pesos(x.cheque.importe).padStart(14)}`
      + `  paga ${dia(x.cheque.fechaPago)}  ${x.porque}${x.candidatas?.length ? ` (candidatas: ${x.candidatas.join(', ')})` : ''}`)
  }

  // ── LA PARTICIÓN, SOBRE LA FUENTE ──────────────────────────────────────────────────────────────
  const vivos = cheques.filter((c) => !c.debitado)
  const bolsas = new Map(Object.values(PUERTA).map((p) => [p, []]))
  for (const c of vivos) bolsas.get(puertaDeCheque(c, cruce, { marcaFalta: MARCAS.falta })).push(c)
  console.log(`\n¿POR QUÉ PUERTA ENTRA CADA UNO DE LOS ${vivos.length} CHEQUES VIVOS AL LIBRO?`)
  console.log('─'.repeat(94))
  for (const [puerta, cs] of bolsas) {
    console.log(`  ${puerta.padEnd(30)} ${String(cs.length).padStart(4)} cheque(s)  ${pesos(cs.reduce((a, c) => a + c.importe, 0)).padStart(16)}`)
  }
  const total = [...bolsas.values()].reduce((a, cs) => a + cs.length, 0)
  console.log(total === vivos.length ? '  ✓ exactamente una puerta por cheque' : '  ✗ LA PARTICIÓN NO CIERRA')
  if (total !== vivos.length) process.exitCode = 1

  // ── EL EFECTO EN EL LIBRO, MEDIDO CONTRA SÍ MISMO SIN EL CRUCE ─────────────────────────────────
  const antes = [...deCompras(compras, corte, { aviso: () => {} }), ...deChequesEmitidos(chequesRaw, { fila0: reg.primera })]
  const desp = [...deCompras(compras, corte, { aviso: () => {}, cruce }), ...deChequesEmitidos(chequesRaw, { fila0: reg.primera, cruce })]
  const por = (ms, e) => ms.filter((m) => m.estado === e).reduce((a, m) => a + m.signo * m.importe, 0)
  const neto = (ms) => ms.reduce((a, m) => a + m.signo * m.importe, 0)
  console.log('\nQUÉ CAMBIA EN EL LIBRO (Compras + Cheques Emitidos)')
  console.log('─'.repeat(94))
  for (const e of ['REAL', 'COMPROMETIDO', 'PROYECTADO', 'VENCIDO']) {
    console.log(`  ${e.padEnd(14)} antes ${pesos(por(antes, e)).padStart(16)}   después ${pesos(por(desp, e)).padStart(16)}   Δ ${pesos(por(desp, e) - por(antes, e)).padStart(14)}`)
  }
  const cierra = Math.abs(neto(desp) - neto(antes)) < 1
  console.log(`  ${cierra ? '✓' : '✗'} el NETO no se mueve: ${pesos(neto(antes))} → ${pesos(neto(desp))}`)
  console.log('    El cruce no inventa ni borra plata — la cambia de estado y de fecha.')
  if (!cierra) process.exitCode = 1

  // ── LA PREGUNTA DEL DUEÑO: ¿qué vence ESTE MES y ahora sí se ve? ────────────────────────────────
  const { desde, hasta } = mesEnCurso()
  const cuotas = desp.filter((m) => String(m.origen.fila).includes('· cheque') && m.fecha >= desde && m.fecha < hasta)
  const ciegos = vivos.filter((c) => !cruce.porCheque.has(c.fila) && c.fechaPago >= desde && c.fechaPago < hasta
    && puertaDeCheque(c, cruce, { marcaFalta: MARCAS.falta }) === PUERTA.ninguna)
  console.log('\nCHEQUES QUE VENCEN ESTE MES')
  console.log('─'.repeat(94))
  console.log(`  ✓ AHORA VISIBLES como COMPROMETIDO : ${String(cuotas.length).padStart(3)} cuota(s)  ${pesos(cuotas.reduce((a, m) => a + m.importe, 0)).padStart(16)}`)
  console.log(`  ✗ TODAVÍA INVISIBLES (sin cruce)   : ${String(ciegos.length).padStart(3)} cheque(s) ${pesos(ciegos.reduce((a, c) => a + c.importe, 0)).padStart(16)}`)
  for (const c of ciegos) console.log(`      · f${c.fila} ${c.proveedor.slice(0, 26).padEnd(26)} ${pesos(c.importe).padStart(14)}  paga ${dia(c.fechaPago)}`)
  console.log('')
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1 })

// ── LA PREGUNTA AL REVÉS: ¿qué compra con cheque quedó pendiente y sin respaldo? ───────────────
//
// El informe de arriba va del CHEQUE a la factura. El dueño (21/08/2026) preguntó al revés: *"todo
// aquello que diga en Compras que se paga por ese medio, buscar en Cheques Emitidos, ver si los
// montos se cubren y a qué corresponden, y pasar a pagado"*.
//
// La vuelta importa porque las dos preguntas NO son la misma. Un cheque vivo cruza contra facturas
// que en Compras YA dicen "Pagado" —por eso el cruce existe: para descubrir que esa fila era mitad
// hecho y mitad compromiso—. Una compra PENDIENTE con medio "Cheque" es otra cosa: es una factura
// que todavía no tiene instrumento emitido.
//
// **Y por eso ninguna se pasa a Pagado sola.** Marcar "Pagado" una fila sin cheque que la respalde
// sería declarar un pago que no ocurrió: la plata seguiría en la cuenta y el cuadro diría que salió.
export function comprasConChequeSinRespaldo(compras, cheques, { col, norm }) {
  const n = (s) => Number(String(s ?? '').replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
  const sinRespaldo = []
  for (const [i, f] of compras.entries()) {
    const medio = String(f[col.tipoPago] ?? '')
    if (!/cheque|echeq/i.test(medio)) continue
    if (/pagado/i.test(String(f[col.estado] ?? ''))) continue
    const importe = n(f[col.total])
    const prov = norm(f[col.proveedor])
    const respaldo = cheques.filter((c) =>
      Math.abs(Number(c.importe) - importe) < 1 && norm(c.contraparte) === prov)
    if (!respaldo.length) sinRespaldo.push({ fila: i + 1, proveedor: String(f[col.proveedor] ?? ''), importe, medio })
  }
  return sinRespaldo
}
