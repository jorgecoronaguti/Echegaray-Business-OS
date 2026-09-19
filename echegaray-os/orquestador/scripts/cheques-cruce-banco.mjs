#!/usr/bin/env node
// EL CRUCE DE LOS CHEQUES CONTRA EL EXTRACTO. Cada cheque tiene que poder explicarse con el banco.
//
// ═══ POR QUÉ EXISTE (30/07) ═══
//
// El dueño manda las pantallas de eCHEQ del Santander y el extracto, y pide "hacé todos los cruces".
// Hasta ahora el cruce se hacía suelto, dentro del importador y sólo para los depositados. Faltaba la
// pregunta completa, que es la que da confianza:
//
//     ¿CADA CHEQUE DEL OS TIENE SU MOVIMIENTO EN EL BANCO, Y CADA MOVIMIENTO DE CHEQUE DEL BANCO
//     TIENE SU CHEQUE EN EL OS?
//
// Son DOS direcciones y las dos importan. La primera dice si el OS inventa; la segunda, si el OS es
// ciego. Un registro que sólo controla una dirección puede estar completo y equivocado a la vez.
//
// ═══ LO QUE HAY QUE SABER PARA QUE EL CRUCE NO GRITE EN FALSO ═══
//
//   · EL BANCO NO ACREDITA CHEQUE POR CHEQUE. Los 5 cheques de la O/P 4865 entraron como UN
//     movimiento ("Deposito e-cheq 48hs presencia bsr $16.807.425,92"). Se cruza primero el LOTE
//     (la suma del grupo) y sólo si no cierra se cae al cheque individual.
//   · UN CHEQUE EN CUSTODIA NO TIENE MOVIMIENTO, Y ESTÁ BIEN. Todavía no se depositó: si apareciera
//     en el extracto sería el error. Lo mismo el endosado (salió sin pasar por la cuenta).
//   · LOS CONCEPTOS DEL BANCO son varios para lo mismo: "Deposito e-cheq …" (entra un recibido),
//     "Echeq clearing recibido" / "Echeq canje interno recibido" (sale un emitido), "Cheque debitado"
//     y "Canje interno recibido" (sale un cheque FÍSICO).
//
//   node orquestador/scripts/cheques-cruce-banco.mjs

import { query, closePool } from '../lib/db.mjs'

const $ = (n) => `$${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
const R2 = (n) => Math.round(Number(n) * 100) / 100

/** Qué significa cada concepto del extracto en términos de cheques. null = no habla de cheques. */
export function claseMovimiento(concepto) {
  const c = String(concepto ?? '').toLowerCase()
  if (/deposito e-?cheq/.test(c)) return 'entra_recibido'
  if (/echeq (clearing|canje)/.test(c)) return 'sale_emitido'
  if (/cheque debitado|canje interno recibido/.test(c)) return 'sale_fisico'
  return null
}

/** Los estados que EXIGEN un movimiento en el banco, y los que exigen que NO haya. */
export const EXIGE_BANCO = new Set(['Depositado', 'Pagado'])
export const NO_DEBE_ESTAR = new Set(['En custodia', 'Aceptado', 'Por aceptar', 'Endosado'])

/**
 * EL EMPAREJADOR CONSUME. Es la diferencia entre un cruce que sirve y uno que grita en falso.
 *
 * ═══ EL BUG QUE ESTO ARREGLA (visto en la primera corrida, 30/07) ═══
 *
 * La primera versión buscaba por importe y NO marcaba el movimiento como usado. El extracto tiene
 * CUATRO débitos de $383.175 el mismo día (los echeq 360 a 363) y TRES depósitos de $10.000.000. Sin
 * consumir:
 *
 *   · los 4 cheques de $383.175 matcheaban todos contra EL MISMO movimiento, y los otros 3
 *     movimientos quedaban reportados como "no los explica ningún cheque" — huérfanos FALSOS;
 *   · y al revés, un cheque En custodia de $10.000.000 se daba por presente en el banco porque había
 *     OTRO depósito de $10.000.000 de otro cheque — alarma FALSA de "está en custodia pero se
 *     depositó", que es de las peores: acusa un error que no existe.
 *
 * Un cheque y un movimiento se emparejan UNO A UNO. Y cuando hay varios candidatos del mismo importe
 * gana el de fecha más cercana a la fecha de pago del cheque, que es la que el banco respeta.
 */
export function emparejador(movimientos = []) {
  const pool = new Map()
  for (const m of movimientos) {
    const k = R2(Math.abs(m.importe))
    if (!pool.has(k)) pool.set(k, [])
    pool.get(k).push(m)
  }
  const usados = new Set()
  return {
    usados,
    /** Toma un movimiento por ese importe y lo CONSUME. null si no queda ninguno libre. */
    tomar(monto, fechaRef = null) {
      const libres = (pool.get(R2(Math.abs(monto))) ?? []).filter((m) => !usados.has(m.id))
      if (!libres.length) return null
      const m = fechaRef
        ? libres.slice().sort((a, b) => Math.abs(Date.parse(a.fecha) - Date.parse(fechaRef)) - Math.abs(Date.parse(b.fecha) - Date.parse(fechaRef)))[0]
        : libres[0]
      usados.add(m.id)
      return m
    },
    /** ¿Queda algún movimiento libre por ese importe? NO consume: es sólo la pregunta. */
    hayLibre(monto) {
      return (pool.get(R2(Math.abs(monto))) ?? []).some((m) => !usados.has(m.id))
    },
  }
}

/**
 * NÚCLEO PURO — el cruce completo, en las dos direcciones, con emparejamiento uno a uno.
 *
 * EL ORDEN IMPORTA: primero se consumen los lotes (una orden de pago se deposita junta), después los
 * cheques sueltos que EXIGEN movimiento, y sólo al final se pregunta por los que no deberían estar.
 * Preguntar antes daría por ocupado un movimiento que en realidad le pertenece a otro cheque.
 */
export function planCruce(cheques = [], movimientos = []) {
  const E = emparejador(movimientos)
  const conBanco = cheques.filter((c) => EXIGE_BANCO.has(c.estado))
  const grupos = new Map()
  for (const c of conBanco) {
    const k = c.orden_pago || `__suelto__${c.tipo}|${c.numero}`
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(c)
  }
  const lotes = []; const sueltos = []; const sinMovimiento = []
  const pendientes = []
  for (const [k, g] of grupos) {
    if (g.length > 1) {
      const suma = R2(g.reduce((s, c) => s + Number(c.importe), 0))
      const m = E.tomar(suma, g[0].fecha_pago)
      if (m) { lotes.push({ clave: k, cheques: g, suma, mov: m }); continue }
    }
    pendientes.push(...g)
  }
  for (const c of pendientes) {
    const m = E.tomar(c.importe, c.fecha_pago)
    if (m) sueltos.push({ cheque: c, mov: m })
    else sinMovimiento.push(c)
  }
  // AL FINAL, con los movimientos legítimos ya consumidos: los que por su estado NO deben estar en el
  // extracto. Recién ahora un movimiento libre por ese importe es una señal y no el de otro cheque.
  const noCorresponde = cheques
    .filter((c) => NO_DEBE_ESTAR.has(c.estado))
    .map((c) => ({ cheque: c, sospecha: E.hayLibre(c.importe) }))
  // Dirección 2: lo que el banco movió por cheques y ningún cheque del OS explica. Es la medida de la
  // CEGUERA del registro. Se calcula del MISMO emparejamiento, no de otro: si no, no cuadra.
  const huerfanos = movimientos
    .filter((m) => claseMovimiento(m.concepto) && !E.usados.has(m.id))
    .map((m) => ({ ...m, clase: claseMovimiento(m.concepto) }))
  return { lotes, sueltos, sinMovimiento, noCorresponde, huerfanos }
}

async function main() {
  const { rows: cheques } = await query(
    `select tipo, numero, banco, librador, contraparte, importe::float8, estado,
            fecha_pago::text, orden_pago, obra
       from public.cheques order by tipo desc, fecha_pago, numero`)
  const { rows: movs } = await query(
    `select id, fecha::text, concepto, importe::float8 from public.banco_movimientos order by fecha`)
  console.log(`${cheques.length} cheque(s) en el OS · ${movs.length} movimiento(s) del banco\n`)

  const p = planCruce(cheques, movs)

  console.log('═══ DIRECCIÓN 1: ¿cada cheque del OS está en el banco? ═══')
  for (const l of p.lotes) {
    console.log(`  ✓ LOTE ${l.clave} — ${l.cheques.length} cheques por ${$(l.suma)}`)
    console.log(`      → ${l.mov.fecha} "${String(l.mov.concepto).slice(0, 50)}"`)
    l.cheques.forEach((c) => console.log(`        · ${String(c.numero).padEnd(10)} ${$(c.importe).padStart(16)}  ${c.banco ?? ''}`))
  }
  for (const s of p.sueltos) console.log(`  ✓ ${s.cheque.tipo} ${String(s.cheque.numero).padEnd(10)} ${$(s.cheque.importe).padStart(16)} → ${s.mov.fecha} "${String(s.mov.concepto).slice(0, 46)}"`)
  if (p.sinMovimiento.length) {
    console.log(`\n  ⚠ ${p.sinMovimiento.length} cheque(s) que el OS dice ${[...EXIGE_BANCO].join('/')} y NO tienen movimiento:`)
    p.sinMovimiento.forEach((c) => console.log(`     ${c.tipo} ${c.numero} ${$(c.importe)} (${c.estado}) — o el estado está mal, o falta ese tramo del extracto`))
  }

  console.log('\n═══ EL CONTROL AL REVÉS: los que NO deben estar en el banco ═══')
  let mal = 0
  for (const x of p.noCorresponde) {
    if (x.sospecha) { mal++; console.log(`  ⚠ ${x.cheque.numero} está ${x.cheque.estado} y queda un movimiento LIBRE por ${$(x.cheque.importe)} — revisar si en realidad ya se movió`) } else console.log(`  ✓ ${String(x.cheque.numero).padEnd(10)} ${x.cheque.estado.padEnd(12)} ${$(x.cheque.importe).padStart(16)} — correctamente ausente del extracto`)
  }

  console.log('\n═══ DIRECCIÓN 2: ¿qué movimiento de cheque no explica ningún cheque del OS? ═══')
  const h = p.huerfanos
  const porClase = new Map()
  for (const m of h) {
    const a = porClase.get(m.clase) ?? { n: 0, total: 0 }
    a.n++; a.total = R2(a.total + Math.abs(m.importe)); porClase.set(m.clase, a)
  }
  h.forEach((m) => console.log(`  · ${m.fecha} ${String(m.clase).padEnd(16)} ${$(Math.abs(m.importe)).padStart(16)}  ${String(m.concepto).slice(0, 44)}`))
  console.log('\n  RESUMEN de la ceguera del registro:')
  for (const [k, v] of porClase) console.log(`    ${k.padEnd(16)} ${String(v.n).padStart(3)} movimiento(s) · ${$(v.total)}`)
  if (!h.length) console.log('    ninguno: cada movimiento de cheque del banco tiene su cheque en el OS')

  // ── LO QUE IMPORTA PARA DECIDIR ─────────────────────────────────────────────────────────────────
  // Un depositado ya es plata y está en la cadena de saldos: si falta en el OS, es historial, no un
  // agujero. Lo que NO puede faltar es la CARTERA (lo que todavía se va a cobrar) ni lo EMITIDO no
  // debitado (lo que todavía va a salir): esos dos son los que mueven una decisión de pago.
  const cartera = R2(cheques.filter((c) => c.tipo === 'recibido' && c.estado === 'En custodia').reduce((s, c) => s + c.importe, 0))
  const endosado = R2(cheques.filter((c) => c.tipo === 'recibido' && c.estado === 'Endosado').reduce((s, c) => s + c.importe, 0))
  const porSalir = R2(cheques.filter((c) => c.tipo === 'emitido' && !EXIGE_BANCO.has(c.estado)).reduce((s, c) => s + c.importe, 0))
  console.log('\n═══ LO QUE MUEVE UNA DECISIÓN ═══')
  console.log(`  cartera en custodia (se va a cobrar)   ${$(cartera)}`)
  console.log(`  endosado (ya salió, no vuelve)         ${$(endosado)}`)
  console.log(`  emitido todavía no debitado (va a salir) ${$(porSalir)}`)
  if (mal) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => closePool()).catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
}
