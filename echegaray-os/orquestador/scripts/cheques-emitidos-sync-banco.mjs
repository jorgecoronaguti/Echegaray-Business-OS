#!/usr/bin/env node
// SINCRONIZA EL DEBITADO DEL REGISTRO DE "Cheques Emitidos" CONTRA LA FUENTE ÚNICA DE CHEQUES.
//
// POR QUÉ (22/07). El dueño trajo la consulta completa de echeq emitidos del Santander y pidió que el
// DEBITADO de la pestaña quede bien "en todos los casos". El estado de un echeq (Pagado = ya salió de
// la cuenta / Aceptado = todavía no) lo sabe el BANCO, no una marca a mano — y la pestaña tenía al 305
// como "No" cuando el banco ya lo había pagado, inflando el outstanding en $893.098,79.
//
// ═══ QUÉ CAMBIÓ EL 30/07: LA FUENTE ═══
//
// Antes leía `ECHEQS_EMITIDOS`, un array ESCRITO A MANO en banco-santander.mjs. Un array a mano no es
// una fuente: tiene un corte congelado, envejece sin gritar, y obliga a editar código cada vez que el
// banco emite un cheque. Ahora la fuente es `public.cheques` —la puerta de entrada real, que llena
// `importar-cheques.mjs` verificando el cierre de la orden de pago y cruzando el depósito contra el
// extracto—. Eso es lo que hace VIVO al registro: cada echeq que entra al OS mantiene su propio
// DEBITADO, sin que nadie toque código.
//
// El array queda donde está (otros scripts lo usan como foto del extracto), pero ya no manda acá: un
// concepto vive en un solo lugar, y el estado de un cheque vive en public.cheques.
//
// QUÉ HACE, y qué NO. Por (instrumento, número) escribe en la columna DEBITADO: Pagado→"SI",
// Aceptado→"No". Agrega al final los que falten. NO toca ninguna otra columna, NO borra, NO reordena y
// NO agrega los MUERTOS (anulado, repudiado): un repudiado suele ser el duplicado de uno que sí se
// pagó (el 281 es el gemelo del 282), y contarlo sería inventar una deuda que no existe. Es idempotente.
//
//   node orquestador/scripts/cheques-emitidos-sync-banco.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { planSync, filaRegistro, verificarEncabezado, COL, norm } from '../lib/cheques-emitidos-sync.mjs'
import { bloquear, desbloquear } from '../lib/pestana-bloqueada.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'Cheques Emitidos'
const DRY = process.argv.includes('--dry')
// --forzar-candado: intención explícita del dueño. "Cheques Emitidos" está candada y la firma difiere,
// así que el portón descarta el contenido y los cheques nuevos no entran: el 31/07 quedaron 4 eCheqs por
// $34.307.410 afuera del registro, y con eso la propia pestaña afirmaba "con esto podés pagar
// $74.870.956" cuando el comprometido real dejaba ~$40,6M. Un número de decisión equivocado por $34,3M.
// Deja snapshot, destraba, escribe con yaGuardado y vuelve a candar SIEMPRE.
const FORZAR = process.argv.includes('--forzar-candado')
const $ = (n) => `$${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  // EL CANDADO TAMBIÉN ACÁ (24/07). Sincroniza la columna DEBITADO por rango suelto (no pasa por
  // escribirPreservando): en la corrida reactivada escribió sobre la pestaña aunque estaba candada.
  // Si el dueño la tomó, no se le toca ninguna columna hasta que la devuelva.
  const { estaBloqueada } = await import('../lib/pestana-bloqueada.mjs')
  if (await estaBloqueada({}, ID, PESTANA).catch(() => false) && !FORZAR) {
    console.log(`🔒 "${PESTANA}" está bajo tu control (candado): no la toco.`)
    console.log('   Si querés que agregue igual los cheques que faltan: --forzar-candado (deja snapshot y vuelve a candar).')
    return
  }

  // ── LA FUENTE ────────────────────────────────────────────────────────────────────────────────────
  const { rows: base } = await query(
    `select numero, banco, contraparte, contraparte_cuit, importe::float8, estado,
            fecha_pago::text, cuenta, orden_pago, obra, origen, corte::text
       from public.cheques
      where tipo = 'emitido'
      order by fecha_pago, numero`)
  if (!base.length) {
    console.log('public.cheques no tiene emitidos — corré importar-cheques.mjs primero. No toco nada.')
    return
  }
  const corte = base.reduce((mx, r) => (String(r.corte) > mx ? String(r.corte) : mx), '')
  console.log(`fuente: public.cheques — ${base.length} emitido(s) · corte ${corte}`)

  // ── EL REGISTRO, UBICADO POR SU ENCABEZADO ───────────────────────────────────────────────────────
  const col = await google.readSheetValues(ID, `${PESTANA}!A1:A30`)
  const filaHdr = col.findIndex((r) => String(r?.[0]).toUpperCase() === 'TIPO') + 1
  if (!filaHdr) {
    console.error(`ABORTA: no encuentro el encabezado del registro (ninguna fila con "Tipo" en la columna A de ${PESTANA}).`)
    process.exitCode = 1; return
  }
  // SI EL DUEÑO MOVIÓ UNA COLUMNA, ABORTA. Escribir el DEBITADO sobre otra columna no da error: da un
  // dato equivocado en la pestaña con la que se decide qué se puede pagar. Misma defensa que ya usa el
  // generador de Proveedores contra Compras — ubicar por encabezado, y si no coincide, no escribir.
  const encab = (await google.readSheetValues(ID, `${PESTANA}!A${filaHdr}:L${filaHdr}`))[0] ?? []
  const problemas = verificarEncabezado(encab)
  if (problemas.length) {
    console.error(`ABORTA: el encabezado del registro no es el que este sync asume (fila ${filaHdr}):`)
    problemas.forEach((p) => console.error(`   ${p}`))
    console.error('Alguien insertó o borró una columna. No escribo a ciegas.')
    process.exitCode = 1; return
  }

  const grid = await google.readSheetValues(ID, `${PESTANA}!A${filaHdr + 1}:L400`)
  const registro = []
  let ultima = filaHdr
  grid.forEach((r, i) => {
    const fila = filaHdr + 1 + i
    if (r?.[COL.tipo] || r?.[COL.numero]) ultima = fila
    if (!norm(r?.[COL.numero])) return
    registro.push({ fila, tipo: r[COL.tipo], numero: r[COL.numero], debitado: r[COL.debitado], proveedor: r[COL.proveedor], monto: r[COL.monto] })
  })
  console.log(`registro: ${registro.length} cheque(s) desde la fila ${filaHdr + 1}, última con dato ${ultima}`)

  // ── EL PLAN ──────────────────────────────────────────────────────────────────────────────────────
  const p = planSync(base, registro)
  console.log(`\n${p.updates.length} DEBITADO a corregir · ${p.agregar.length} a agregar · ${p.iguales} ya correcto(s) · ${p.muertos.length} muerto(s) · ${p.soloEnPestana.length} sólo en la pestaña`)
  p.updates.forEach((u) => console.log(`  fila${u.fila} ${u.instrumento} ${u.numero}: ${u.de} → ${u.a}`))
  p.agregar.forEach((c) => console.log(`  + ${c.instrumento} ${norm(c.numero)} ${String(c.contraparte ?? '').slice(0, 28)} ${$(c.importe)} ${c.estado} · paga ${c.fecha_pago}`))
  p.muertos.forEach((c) => console.log(`  (muerto, no se agrega) ${norm(c.numero)} ${c.contraparte ?? ''} ${c.estado}`))
  p.sinInstrumento.forEach((c) => console.log(`  ⚠ ${norm(c.numero)} ${c.contraparte ?? ''}: no puedo afirmar si es FISICO o ECHEQ — no lo agrego (origen: ${c.origen})`))
  if (p.soloEnPestana.length) {
    // NO es un error: el registro tiene los cheques FÍSICOS, que el banco no lista en su pantalla de
    // eCHEQs. Es la medida de cuánto del registro todavía no pasa por la puerta de entrada del OS.
    const fis = p.soloEnPestana.filter((r) => /fisico/i.test(String(r.tipo))).length
    console.log(`  ℹ ${p.soloEnPestana.length} del registro no están en public.cheques (${fis} físicos, ${p.soloEnPestana.length - fis} echeq): no se tocan, el registro es del dueño`)
  }

  if (DRY) { console.log('\n(--dry) no escribí nada.'); return }
  if (!p.updates.length && !p.agregar.length) { console.log('\nnada que sincronizar: el registro ya coincide con la base.'); return }

  const data = p.updates.map((u) => ({ range: `${PESTANA}!K${u.fila}`, values: [[u.a]] }))
  if (p.agregar.length) data.push({ range: `${PESTANA}!A${ultima + 1}`, values: p.agregar.map(filaRegistro) })
  // REGLA 0 — NO APLICA, Y ESTÁ DECIDIDO: respetar: false.
  // Escribe un HECHO verificado contra el banco, celda por celda, en la columna de estado — no un
  // rótulo redactado por nadie. Respetar acá sería dejar que una edición a mano contradiga al banco.
  if (FORZAR) {
    const { tomarSnapshot } = await import('../lib/sheet-snapshot.mjs')
    console.log(`snapshot → ${await tomarSnapshot({ google, fileId: ID, pestana: PESTANA, tool: 'cheques-emitidos-sync-banco', directive: 'agregar al registro los eCheqs emitidos que la pestaña no tiene, por pedido explícito' }) ?? 'no se pudo'}`)
    await desbloquear({ query }, ID, PESTANA)
  }
  try {
    const res = await google.batchUpdateValues(ID, data, FORZAR ? { yaGuardado: true } : {})
    if (res?.protegido) {
      console.error('\n⚠ el portón descartó la escritura: la pestaña está candada o la editaste. Repetilo con --forzar-candado.')
      process.exitCode = 1
    }
  } finally {
    if (FORZAR) await bloquear({ query }, ID, PESTANA, { motivo: 'el dueño edita — re-candada tras agregar los cheques emitidos que faltaban', por: 'OS' })
  }
  console.log(`\n✔ ${p.updates.length} corregido(s) + ${p.agregar.length} agregado(s)`)

  // ── VERIFICACIÓN: releer y probar que quedó como el plan decía ───────────────────────────────────
  const rel = await google.readSheetValues(ID, `${PESTANA}!A${filaHdr + 1}:L400`)
  const reg2 = []
  rel.forEach((r, i) => { if (norm(r?.[COL.numero])) reg2.push({ fila: filaHdr + 1 + i, tipo: r[COL.tipo], numero: r[COL.numero], debitado: r[COL.debitado] }) })
  const p2 = planSync(base, reg2)
  const ok = !p2.updates.length && !p2.agregar.length
  console.log(`verificación: ${reg2.length} cheque(s) en el registro · ${ok ? '✓ la base y el registro coinciden' : `✖ quedaron ${p2.updates.length} diferencia(s) y ${p2.agregar.length} sin agregar`}`)
  if (!ok) process.exitCode = 1
}

main()
  .catch((e) => { console.error(`Falló: ${String(e?.message ?? e)}`); process.exitCode = 1 })
  .finally(() => closePool().catch(() => {}))
