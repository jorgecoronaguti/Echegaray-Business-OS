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
// El array se retiró el 14/08: mientras existió, decía que el 307 seguía "Aceptado" y el banco lo
// había pagado el 03/08. Un concepto vive en un solo lugar, y el estado de un cheque vive en la base.
//
// ═══ QUÉ CAMBIÓ EL 14/08: LA SEGUNDA FUENTE, LA DE LOS FÍSICOS ═══
//
// `public.cheques` sólo tiene eCHEQ: es lo que el banco lista en su pantalla. Los cheques FÍSICOS —los
// de papel— no aparecen ahí, así que su DEBITADO no lo cubría NADIE y se marcaba a mano. Medido hoy
// contra el archivo: FISICO 316, 318 y 325 figuraban vivos y el banco ya los había debitado.
// $1.590.000 contados como comprometidos que ya habían salido de la cuenta.
//
// El banco sí los informa, en el otro documento: el extracto. Ahora el sync también cruza
// `banco_movimientos` con el registro por (instrumento, número) + importe —`cheques-debito-banco.mjs`,
// el núcleo que ya hacía ese diagnóstico y sólo lo imprimía— y fusiona las dos fuentes. Cuando se
// contradicen gana el extracto: un débito asentado es plata que ya no está.
//
// ═══ QUÉ CAMBIÓ EL 17/08: EL NÚMERO DE LA FILA TAMBIÉN PUEDE ESTAR MAL ═══
//
// El registro tiene DOS filas "FISICO 316" (Diesel Rodriguez): la 101 por $500.000 y la 102 por
// $510.000. El extracto dice 316 → $500.000 y 317 → $510.000. O sea que el número de la 102 está mal,
// y por eso el cruce por número no la encontraba nunca: sus $510.000 salieron el 13/08 y la fila
// seguía con DEBITADO = "No", figurando como plata comprometida que ya no estaba.
//
// El sync ahora aplica también el rescate por IMPORTE ÚNICO (`cheques-debito-banco.mjs`, segundo
// pase) y hace las dos cosas que corresponden, que son distintas:
//
//   · MARCA el DEBITADO. Es completar un dato que el banco prueba, y es lo que el dueño autorizó
//     cuando dijo "el registro es tuyo, así q si detectas eso lo tenés q agregar".
//   · NO TOCA el número. Corregirlo reescribe la identidad de la fila y podría fusionar dos cheques
//     distintos —ya hay dos 316—. Se publican las dos lecturas y lo decide él.
//
// QUÉ HACE, y qué NO. Por (instrumento, número) —y por importe único cuando el número no explica
// nada— escribe en la columna DEBITADO: Pagado→"SI", Aceptado→"No". Agrega al final los eCheq de
// `public.cheques` que falten. NO toca ninguna otra columna, NO borra, NO reordena, NO cambia el
// número de ninguna fila, NO agrega los MUERTOS (anulado, repudiado: un repudiado suele ser el
// duplicado de uno que sí se pagó — el 281 es el gemelo del 282) y NO INVENTA UNA FILA para un débito
// que el registro no explica: eso se declara como hallazgo en `backlog_autonomo`. Es idempotente.
//
//   node orquestador/scripts/cheques-emitidos-sync-banco.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { planSync, filaRegistro, verificarEncabezado, sinComprobante, COL, norm } from '../lib/cheques-emitidos-sync.mjs'
import { conciliarDebitosDeCheques } from '../lib/cheques-debito-banco.mjs'
import { fusionarDebitado, huerfanosDeDebito, anotarHuerfanos, numerosQueElBancoDesmiente } from '../lib/cheques-debitado-fusion.mjs'
import { parseMonto } from '../lib/cash-briefing.mjs'
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

/**
 * Una fila del registro, en la forma que espera la conciliación contra el extracto.
 *
 * Sólo participan las filas cuyo TIPO es uno de los dos instrumentos reales. Una fila con número y sin
 * tipo no se puede identificar —y el importe solo alcanzaría para emparejarla con cualquier débito de
 * ese monto—: emparejar mal deja vivo un cheque que ya salió y mata uno que no. Se queda afuera.
 */
function paraConciliar(r) {
  const instrumento = String(r?.tipo ?? '').trim().toUpperCase()
  if (instrumento !== 'FISICO' && instrumento !== 'ECHEQ') return null
  return {
    instrumento,
    numero: r.numero,
    importe: Number(r.monto) || 0,
    beneficiario: String(r.proveedor ?? '').trim(),
    debitado: String(r.debitado ?? '').trim().toUpperCase() === 'SI',
    fila: r.fila,
  }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  // EL CANDADO TAMBIÉN ACÁ (24/07). Sincroniza la columna DEBITADO por rango suelto (no pasa por
  // escribirPreservando): en la corrida reactivada escribió sobre la pestaña aunque estaba candada.
  // Si el dueño la tomó, no se le toca ninguna columna hasta que la devuelva.
  //
  // --dry NO SE FRENA CON EL CANDADO. El candado protege la ESCRITURA; en seco no se escribe nada y
  // frenarlo ahí sólo esconde el diagnóstico —que es exactamente lo que hay que poder mirar antes de
  // decidir si se fuerza—. Se avisa, eso sí, para que nadie confunda "esto marcaría" con "esto marcó".
  const { estaBloqueada } = await import('../lib/pestana-bloqueada.mjs')
  const candada = await estaBloqueada({}, ID, PESTANA).catch(() => false)
  if (candada && !FORZAR && !DRY) {
    console.log(`🔒 "${PESTANA}" está bajo tu control (candado): no la toco.`)
    console.log('   Si querés que agregue igual los cheques que faltan: --forzar-candado (deja snapshot y vuelve a candar).')
    console.log('   Para ver qué haría sin escribir nada: --dry.')
    return
  }
  if (candada && DRY) console.log(`🔒 "${PESTANA}" está candada: en seco igual te muestro el plan, pero sin --forzar-candado no se escribiría.`)

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

  // UNFORMATTED_VALUE: el importe del registro es lo que CORROBORA que el débito del banco es de ESE
  // cheque y no de otro con el mismo número. Leído formateado llega como "$ 500.000,00" y la
  // corroboración compara contra NaN — o sea, no corrobora nada y emparejaría a ciegas.
  const grid = await google.readSheetValues(ID, `${PESTANA}!A${filaHdr + 1}:L400`, { render: 'UNFORMATTED_VALUE' })
  const registro = []
  let ultima = filaHdr
  grid.forEach((r, i) => {
    const fila = filaHdr + 1 + i
    if (r?.[COL.tipo] || r?.[COL.numero]) ultima = fila
    if (!norm(r?.[COL.numero])) return
    registro.push({
      fila, tipo: r[COL.tipo], numero: r[COL.numero], debitado: r[COL.debitado],
      proveedor: r[COL.proveedor], monto: parseMonto(r[COL.monto]), nroComp: r[COL.nroComp],
    })
  })
  console.log(`registro: ${registro.length} cheque(s) desde la fila ${filaHdr + 1}, última con dato ${ultima}`)

  // ── LA SEGUNDA FUENTE: EL EXTRACTO ───────────────────────────────────────────────────────────────
  // Los cheques FÍSICOS no están en public.cheques (el banco no los lista) y su DEBITADO no lo cubría
  // nadie. El extracto sí los tiene, con el número en la referencia.
  const { rows: movs } = await query(
    `select fecha::text, concepto, importe::float8, referencia
       from public.banco_movimientos where importe < 0 order by fecha, id`)
  const { resultados: conciliacion, resumen } = conciliarDebitosDeCheques(movs, registro.map(paraConciliar).filter(Boolean))
  // LA IDENTIDAD QUE CIERRA: cada salida de cheque del extracto tiene una fila que la explica, o un
  // motivo declarado. Sin este renglón, "3 marcados" no dice nada sobre los que quedaron afuera.
  const salidas = conciliacion.filter((r) => r.estado !== 'no_es_debito_de_cheque').length
  const cuadra = resumen.emparejados + resumen.emparejados_por_importe + resumen.ambiguos
    + resumen.sin_cheque + resumen.sin_referencia === salidas
  console.log(`extracto: ${movs.length} débito(s) · ${salidas} son salidas de cheque = ${resumen.emparejados} emparejada(s)`
    + ` + ${resumen.emparejados_por_importe} por importe + ${resumen.ambiguos} ambigua(s)`
    + ` + ${resumen.sin_cheque} sin fila + ${resumen.sin_referencia} sin referencia${cuadra ? '' : '  ✖ NO CIERRA'}`)
  if (!cuadra) process.exitCode = 1
  // Un cheque sin NÚMERO no puede cruzarse contra el extracto nunca: queda fuera del cruce por
  // construcción, y callarlo haría pasar por "todo conciliado" a un registro con puntos ciegos.
  const sinNumero = grid.filter((r) => ['FISICO', 'ECHEQ'].includes(String(r?.[COL.tipo] ?? '').trim().toUpperCase()) && !norm(r?.[COL.numero]))
  if (sinNumero.length) {
    console.log(`  ℹ ${sinNumero.length} fila(s) del registro tienen instrumento y NO tienen número de cheque `
      + `(${$(sinNumero.reduce((s, r) => s + parseMonto(r?.[COL.monto]), 0))}): quedan fuera del cruce contra el banco.`)
  }

  // ── EL PLAN ──────────────────────────────────────────────────────────────────────────────────────
  const p = planSync(base, registro)
  const { updates, conflictos } = fusionarDebitado({ base, planBase: p, conciliacion })
  p.updates = updates
  console.log(`\n${p.updates.length} DEBITADO a corregir · ${p.agregar.length} a agregar · ${p.iguales} ya correcto(s) · ${p.muertos.length} muerto(s) · ${p.soloEnPestana.length} sólo en la pestaña`)
  p.updates.forEach((u) => console.log(`  fila${u.fila} ${u.instrumento} ${u.numero}: ${u.de} → ${u.a}  [${u.fuentes.join('+')}]${u.evidencia ? ` — ${u.evidencia}` : ''}`))
  p.agregar.forEach((c) => console.log(`  + ${c.instrumento} ${norm(c.numero)} ${String(c.contraparte ?? '').slice(0, 28)} ${$(c.importe)} ${c.estado} · paga ${c.fecha_pago}`))
  p.muertos.forEach((c) => console.log(`  (muerto, no se agrega) ${norm(c.numero)} ${c.contraparte ?? ''} ${c.estado}`))
  p.sinInstrumento.forEach((c) => console.log(`  ⚠ ${norm(c.numero)} ${c.contraparte ?? ''}: no puedo afirmar si es FISICO o ECHEQ — no lo agrego (origen: ${c.origen})`))
  if (p.soloEnPestana.length) {
    // NO es un error: el registro tiene los cheques FÍSICOS, que el banco no lista en su pantalla de
    // eCHEQs. Es la medida de cuánto del registro todavía no pasa por la puerta de entrada del OS.
    const fis = p.soloEnPestana.filter((r) => /fisico/i.test(String(r.tipo))).length
    console.log(`  ℹ ${p.soloEnPestana.length} del registro no están en public.cheques (${fis} físicos, ${p.soloEnPestana.length - fis} echeq): no se tocan, el registro es del dueño`)
  }

  // ── LO QUE EL EXTRACTO DICE Y LA BASE CONTRADICE ─────────────────────────────────────────────────
  if (conflictos.length) {
    console.log(`\n⚠ ${conflictos.length} cheque(s) que public.cheques da por VIVOS y el extracto ya pagó — gana el extracto:`)
    for (const c of conflictos) console.log(`    ${c.clave.padEnd(12)} fila ${String(c.fila).padStart(4)}  ${c.evidencia}`)
    console.log('    La foto de public.cheques quedó vieja: corré `importar-cheques.mjs` con la pantalla de eCHEQ del banco.')
  }

  // ── EL NÚMERO DE LA FILA CONTRA EL NÚMERO DEL BANCO ──────────────────────────────────────────────
  // Se marca el DEBITADO (el banco prueba que la plata salió) y NO se toca el número: corregirlo
  // reescribe la identidad de la fila, y en el registro real ya hay dos "FISICO 316" — un número mal
  // corregido fusiona dos cheques distintos. Lo decide el dueño, con las dos lecturas a la vista.
  const desmentidos = numerosQueElBancoDesmiente(conciliacion)
  if (desmentidos.length) {
    console.log(`\n⚠ ${desmentidos.length} fila(s) con el NÚMERO de cheque en discusión — el DEBITADO sí se marca, el número NO:`)
    for (const d of desmentidos) {
      console.log(`    fila ${String(d.fila).padStart(4)}  dice N° ${String(d.numeroDeLaFila).padEnd(5)} y el banco dice N° ${String(d.referenciaDelBanco).padEnd(5)}`
        + `  ${$(d.importe).padStart(16)}  ${d.beneficiario}`)
      console.log(`      ${d.evidencia}`)
    }
    console.log('    Decidilo vos: o la fila tiene mal el número, o el extracto lo trajo mal. El importe coincide al centavo.')
  }

  // ── PLATA QUE SALIÓ SIN UNA FILA QUE LA RESPALDE ─────────────────────────────────────────────────
  const huerfanos = huerfanosDeDebito(conciliacion)
  if (huerfanos.length) {
    const t = huerfanos.reduce((s, h) => s + h.importe, 0)
    console.log(`\n⛔ ${huerfanos.length} débito(s) de cheque que NINGUNA fila del registro explica — ${$(t)}:`)
    for (const h of huerfanos) console.log(`    ${h.fecha}  N° ${String(h.numero ?? 's/n').padStart(4)}  ${$(h.importe).padStart(16)}  ${h.motivo}`)
    console.log('    NO se agrega ninguna fila: el registro es del dueño y una fila fabricada es peor que un hueco visible.')
    // Anotarlo es lo que lo hace consultable después de que este log se pierda. En seco no se anota:
    // --dry no escribe en ningún lado, ni en el Sheet ni en la base.
    if (!DRY) {
      const a = await anotarHuerfanos({ query }, huerfanos)
      if (a.anotados == null) console.log(`    (no se pudo anotar en el backlog: ${a.motivo})`)
      else console.log(`    ${a.anotados} anotado(s) en backlog_autonomo para consultarlo · ${a.yaEstaban} ya estaba(n).`)
    }
  }
  const sinRef = conciliacion.filter((r) => r.estado === 'sin_referencia')
  if (sinRef.length) {
    // NO son hallazgos sobre el registro: es un límite del documento. Sin número no hay nada que
    // buscar, y emparejar por importe suelto ya se pagó caro.
    console.log(`\nℹ ${sinRef.length} débito(s) de cheque sin referencia en el extracto: el banco no mandó el número, no se pueden atribuir.`)
  }

  avisarSinComprobante(p)

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
  // Contra LAS DOS fuentes, no sólo contra la base: si sólo se verificara public.cheques, un físico que
  // no se llegó a marcar daría verde igual — que es exactamente el agujero que este cambio cierra.
  const rel = await google.readSheetValues(ID, `${PESTANA}!A${filaHdr + 1}:L400`, { render: 'UNFORMATTED_VALUE' })
  const reg2 = []
  rel.forEach((r, i) => {
    if (!norm(r?.[COL.numero])) return
    reg2.push({
      fila: filaHdr + 1 + i, tipo: r[COL.tipo], numero: r[COL.numero], debitado: r[COL.debitado],
      proveedor: r[COL.proveedor], monto: parseMonto(r[COL.monto]),
    })
  })
  const p2 = planSync(base, reg2)
  const { resultados: c2 } = conciliarDebitosDeCheques(movs, reg2.map(paraConciliar).filter(Boolean))
  const f2 = fusionarDebitado({ base, planBase: p2, conciliacion: c2 })
  const ok = !f2.updates.length && !p2.agregar.length
  console.log(`verificación: ${reg2.length} cheque(s) en el registro · ${ok ? '✓ el registro coincide con public.cheques Y con el extracto' : `✖ quedaron ${f2.updates.length} diferencia(s) y ${p2.agregar.length} sin agregar`}`)
  if (!ok) process.exitCode = 1
}

/**
 * EL AVISO QUE TIENE QUE LLEGAR EN EL MOMENTO DE LA CARGA, NO EN LA CONCILIACIÓN.
 *
 * Un cheque sin N° de comprobante no se puede cruzar contra Compras nunca más, y eso no es un detalle
 * de archivo: el calendario de CAJA decide con la marca de ese cruce, así que un cheque sin número es
 * plata que el piso proyectado no puede afirmar ni negar. Al 05/08 eran $8.424.279 en once cheques no
 * debitados. Cada uno de ellos fue, alguna vez, una fila que acababa de entrar y a la que le faltaban
 * diez segundos de alguien que tenía el papel en la mano.
 *
 * No bloquea el sync: el cheque tiene que entrar igual —el DEBITADO es un hecho del banco y no puede
 * esperar—. Lo que no puede pasar es que entre en silencio.
 */
function avisarSinComprobante(p) {
  const { yaEnElRegistro, seEstanAgregando } = sinComprobante(p)
  if (seEstanAgregando.length) {
    console.log(`\n⚠ ${seEstanAgregando.length} cheque(s) entran SIN N° de comprobante — el banco no lo informa, lo tenés vos:`)
    for (const c of seEstanAgregando) console.log(`    ${c.instrumento} ${norm(c.numero)}  ${String(c.contraparte ?? '').slice(0, 28).padEnd(29)} ${$(c.importe)}  paga ${c.fecha_pago}`)
    console.log('    Cargales el N° en la columna H de "Cheques Emitidos". Sin él no se pueden cruzar contra Compras')
    console.log('    y el piso proyectado de caja no va a poder afirmar si esa plata ya está contemplada.')
  }
  if (yaEnElRegistro.length) {
    // `monto` ya viene numérico (el registro se lee con UNFORMATTED_VALUE y pasa por parseMonto): el
    // parseo es-AR que vivía acá convertía 8.424.279,50 leído como número en 84.242.795 — diez veces.
    const t = yaEnElRegistro.reduce((s, r) => s + (Number(r.monto) || 0), 0)
    console.log(`\n⚠ ${yaEnElRegistro.length} cheque(s) YA en el registro, todavía no debitados y sin N° de comprobante — ${$(t)}:`)
    for (const r of yaEnElRegistro) console.log(`    fila ${String(r.fila).padStart(4)}  ${String(r.proveedor ?? '').slice(0, 28).padEnd(29)} ${$(r.monto)}`)
    console.log('    Ésta es exactamente la banda que "el ancho de la banda" publica en CAJA: se cierra cargando estos números.')
  }
}

main()
  .catch((e) => { console.error(`Falló: ${String(e?.message ?? e)}`); process.exitCode = 1 })
  .finally(() => closePool().catch(() => {}))
