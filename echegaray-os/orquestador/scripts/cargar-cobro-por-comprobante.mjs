#!/usr/bin/env node
// UN COBRO PROBADO POR COMPROBANTE ENTRA A LA CAJA HOY, NO CUANDO LLEGUE EL EXTRACTO.
//
// ═══ POR QUÉ (26/08) ═══
//
// El dueño mandó el comprobante de una transferencia de $12.100.000 acreditada a las 09:35. El
// extracto se había bajado a las 08:25. Resultado: Cobranzas decía "Cobrado", el dinero estaba en la
// cuenta, y CAJA publicaba $4.495.916 — doce millones menos de los que había.
//
// La línea "Movimientos posteriores al corte" no lo salvó: su ventana es `fecha > corte`, el corte es
// la fecha del último movimiento del extracto (26/08) y el cobro es del MISMO día. Ampliarla a `>=`
// no arregla nada y rompe otra cosa: esa línea es NETA, y del lado que resta están los cheques y las
// compras del día del corte que el extracto YA trae. Con `>=` se restarían dos veces.
//
// ═══ QUÉ HACE ═══
//
// Carga el movimiento en la réplica del banco —que es la ÚNICA fuente del saldo de la cuenta— marcado
// como PROVISORIO. Cuando llega el extracto que lo contiene, `insertarMovimientos` lo borra solo
// (`purgarProvisorios`). Así el saldo se corrige hoy y nunca queda contado dos veces.
//
// ═══ QUÉ NO HACE ═══
//
// No da de alta la cobranza: eso es trabajo de la pestaña Cobranzas y ya está hecho cuando se llega
// acá. Acá sólo se registra que la plata entró a la CUENTA.
//
//   node orquestador/scripts/cargar-cobro-por-comprobante.mjs \
//     --fecha 2026-08-26 --importe 12100000 \
//     --concepto "Transferencia recibida - Imotor Srl (30-71647696-7)" \
//     --referencia MP-174750988287 --motivo "comprobante MP enviado por el dueño 26/08 09:35"
//
//   ...--dry   muestra qué haría y no escribe.

import { query, closePool } from '../lib/db.mjs'
import { insertarMovimientos, releerMovimientos, PROVISORIO } from '../lib/banco-escribir.mjs'
import { CUENTA } from '../lib/banco-santander.mjs'

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null }
const DRY = process.argv.includes('--dry')
const $ = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

const fecha = arg('fecha')
const importe = Number(arg('importe'))
const concepto = arg('concepto')
const referencia = arg('referencia')
const motivo = arg('motivo') || ''

if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) fallar('--fecha AAAA-MM-DD es obligatoria')
if (!Number.isFinite(importe) || importe === 0) fallar('--importe es obligatorio y distinto de cero')
if (!concepto) fallar('--concepto es obligatorio')
// LA REFERENCIA NO ES OPCIONAL. Es la única identidad de la fila; sin ella el índice único de la base
// vive sobre NULLs y el mismo comprobante puede entrar dos veces.
if (!referencia) fallar('--referencia es obligatoria (el nº de operación del comprobante)')

function fallar(m) { console.error(`✖ ${m}`); process.exit(1) }

async function main() {
  // ── EL SALDO DEL QUE SE PARTE: el último de la base, que es el que CAJA publica ────────────────
  const { rows: ult } = await query(
    `select fecha, concepto, importe, saldo_despues, origen from public.banco_movimientos
      where cuenta = $1 order by (saldo_despues is null), fecha desc, id desc limit 1`, [CUENTA.numero])
  const anterior = ult[0]
  if (!anterior || anterior.saldo_despues == null) fallar('la base no tiene un último saldo del que partir')

  const fechaUlt = String(anterior.fecha instanceof Date ? anterior.fecha.toISOString().slice(0, 10) : anterior.fecha).slice(0, 10)
  // EL COBRO NO PUEDE SER ANTERIOR AL ÚLTIMO MOVIMIENTO DEL EXTRACTO: si lo fuera, o ya está cargado
  // —y esto lo duplicaría— o el saldo corrido que se calcula acá sería falso.
  if (fecha < fechaUlt) fallar(`el cobro (${fecha}) es anterior al último movimiento del extracto (${fechaUlt}): o ya está cargado, o hay que bajar el extracto`)

  const saldo = Number(anterior.saldo_despues) + importe

  console.log(`CUENTA ${CUENTA.numero}`)
  console.log(`  último movimiento cargado   ${fechaUlt}  ${String(anterior.concepto).slice(0, 48)}`)
  console.log(`  saldo del que se parte      ${$(anterior.saldo_despues).padStart(16)}`)
  console.log(`  + cobro por comprobante     ${$(importe).padStart(16)}   ${concepto}`)
  console.log(`  = saldo que va a publicar   ${$(saldo).padStart(16)}`)
  console.log(`  referencia                  ${referencia}`)
  if (motivo) console.log(`  motivo                      ${motivo}`)

  if (DRY) { console.log('\n(en seco: no se escribió nada)'); return }

  const origen = `${PROVISORIO} · ${motivo || 'sin motivo declarado'} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const { insertados, ids } = await insertarMovimientos({ query }, [{ fecha, concepto, importe, saldo, referencia }], origen)
  if (!insertados) { console.log('\n= ya estaba cargado (la referencia ya existe): no se duplicó'); return }

  // LA EVIDENCIA ES EL DATO LEÍDO EN SU DESTINO, no el contador del que escribió.
  const [fila] = await releerMovimientos({ query }, ids)
  console.log(`\n✓ cargado y releído de la base: ${fila.fecha} · ${fila.concepto} · ${$(fila.importe)} · saldo ${$(fila.saldo)} · ref ${fila.referencia}`)
  console.log('  SIGUIENTE PASO: node orquestador/scripts/banco-raw-pestana.mjs   (para que CAJA lo vea)')
}

main().catch((e) => { console.error('✖', e.message); process.exitCode = 1 }).finally(() => closePool())
