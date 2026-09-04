#!/usr/bin/env node
// BACKFILL DE IDENTIDAD SOBRE LOS DATOS REALES DE COMPRAS × CHEQUES.
//
// ═══ QUÉ HACE, EN UNA LÍNEA ═══
//
// Lee los nombres de proveedor que están escritos hoy en las dos planillas, siembra los aliases que
// el CUIT autoriza, resuelve cada texto a un proveedor canónico y deja la decisión escrita.
//
// ═══ POR QUÉ ARRANCA EN SECO ═══
//
// Sin `--aplicar` no escribe NADA: ni aliases, ni resoluciones. Imprime exactamente lo que haría.
// Un backfill de identidad puede fusionar dos proveedores que no son el mismo, y una fusión no se
// nota mirando totales —los totales siguen cerrando— sino meses después, cuando una deuda aparece
// colgada del proveedor equivocado. La corrida en seco es donde se buscan los falsos positivos,
// mirándolos de a uno.
//
// ═══ ES IDEMPOTENTE, Y NO POR CASUALIDAD ═══
//
// Los aliases se siembran con `on conflict do update`. Las resoluciones se saltean cuando ya existe
// una escrita con ESTA versión del resolver y de los umbrales — correrlo dos veces seguidas escribe
// cero la segunda vez. Cambiar los umbrales sí lo hace trabajar de nuevo, que es lo correcto: la
// decisión anterior se tomó con otra regla.
//
// ═══ LO QUE NO HACE, POR DISEÑO ═══
//
// No toca el Sheet. No modifica un importe, un cheque, un pago ni un CUIT. No concilia dinero.
// Identidad y conciliación son dos cosas distintas y se rompen distinto.
//
//   node orquestador/scripts/identidad-backfill.mjs              # seco, no escribe nada
//   node orquestador/scripts/identidad-backfill.mjs --aplicar    # siembra aliases y persiste

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { FILA_DATO0, FILA_FIN } from '../lib/cheques-emitidos-geometria.mjs'
import { padronDe, aliasesDe } from '../lib/ml/identidad.mjs'
import { aliasesASembrar } from '../lib/ml/sembrar-alias.mjs'
import { resolverLote, claveConsulta, drenarTrazas } from '../lib/ml/identidad-lote.mjs'
import { cuitCanonico } from '../lib/ml/entity-resolution.mjs'
import { normalizar } from '../lib/ml/embeddings.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

const APLICAR = process.argv.includes('--aplicar')

/** Los textos de proveedor que hay hoy en las dos planillas, con su CUIT cuando lo traen. */
export async function observacionesReales(google) {
  const hojas = await google.getSheetMeta(ID)
  const CH = hallarPestana(hojas, 'Cheques Emitidos').title

  const crudoCompras = await google.readSheetValues(ID, 'Compras!C4:AM', { render: 'UNFORMATTED_VALUE' })
  const I_CUIT = 36 // AM contando desde C
  // EL TEXTO VA CRUDO, TAL COMO ESTÁ ESCRITO EN LA PLANILLA. Normalizarlo acá y guardar ESO como
  // `valor_original` sería guardar una versión y llamarla el original: la pantalla que después
  // busca «Robles Pinturerías S.R.L.» no lo encontraría, porque lo escrito quedó como «ROBLES
  // PINTURERIAS». El resolver normaliza adentro, que es donde corresponde.
  const compras = crudoCompras
    .map((f) => ({ nombre: String(f?.[2] ?? '').trim(), cuit: f?.[I_CUIT], fuente: 'compras' }))
    .filter((o) => o.nombre)

  const crudoCh = await google.readSheetValues(ID, `${CH}!A${FILA_DATO0}:L${FILA_FIN}`)
  const cheques = crudoCh
    .map((f) => ({ nombre: String(f?.[4] ?? '').trim(), cuit: f?.[3], fuente: 'cheques' }))
    .filter((o) => o.nombre)

  return { compras, cheques, todas: [...compras, ...cheques] }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig() })
  console.log(APLICAR ? '═══ BACKFILL — APLICANDO ═══' : '═══ BACKFILL — CORRIDA EN SECO (no escribe nada) ═══')

  const { compras, cheques, todas } = await observacionesReales(google)
  console.log(`\nLEÍDO      Compras ${compras.length} filas con proveedor · Cheques ${cheques.length} filas con beneficiario`)

  const padron = await padronDe('proveedor')
  const aliasesPrevios = await aliasesDe('proveedor')
  console.log(`PADRÓN     ${padron.length} proveedores · ${padron.filter((p) => cuitCanonico(p.cuit)).length} con CUIT · ${aliasesPrevios.size} aliases verificados ya cargados`)

  // ── 1. ALIASES DESDE EL IDENTIFICADOR FUERTE ────────────────────────────────────────────────────
  const plan = aliasesASembrar(todas, padron, aliasesPrevios)
  console.log(`\nALIASES    a sembrar ${plan.sembrar.length} · ya estaban ${plan.yaEstaban.length} · conflictos ${plan.conflictos.length} · CUIT fuera del padrón ${dedup(plan.sinPadron).length}`)
  for (const a of plan.sembrar) console.log(`   + «${a.alias}»  →  ${a.nombreCanonico}   (CUIT ${a.cuit}, visto en ${a.fuente})`)
  for (const c of plan.conflictos) console.log(`   ✋ «${c.nombre}»: ${c.porQue}`)
  // Un CUIT que aparece en las planillas y no está en `proveedores` es trabajo concreto, y son DOS
  // trabajos distintos: o el proveedor no está dado de alta, o está dado de alta y le falta el CUIT.
  // El segundo es el que más rinde: cargar ese dato convierte un cruce por nombre —que puede
  // fallar— en un cruce por identificador fuerte, que no falla.
  const porNombre = new Map(padron.map((p2) => [normalizar(p2.nombre), p2]))
  for (const o of dedup(plan.sinPadron)) {
    const existe = porNombre.get(normalizar(o.nombre))
    console.log(existe
      ? `   ? «${o.nombre}» CUIT ${o.cuit}: el proveedor «${existe.nombre}» existe pero NO tiene CUIT cargado — cargarlo lo pasa a identificador fuerte`
      : `   ? «${o.nombre}» CUIT ${o.cuit}: no hay proveedor con ese CUIT ni con ese nombre — falta el alta`)
  }

  if (APLICAR && plan.sembrar.length) {
    for (const a of plan.sembrar) {
      await query(
        `insert into public.ml_entidad_alias (entidad, entidad_id, alias, alias_norm, fuente, confianza,
                                              verificado, verificado_por, identificador_fuerte)
         values ('proveedor',$1,$2,$3,$4,1,true,'backfill-cuit',$5)
         on conflict (entidad, alias_norm) do update
            set entidad_id = excluded.entidad_id, verificado = true,
                identificador_fuerte = excluded.identificador_fuerte`,
        [a.entidadId, a.alias, a.aliasNorm, a.fuente, a.cuit])
    }
    console.log(`   ✔ ${plan.sembrar.length} aliases sembrados`)
  }

  // ── 2. RESOLUCIÓN DE CADA TEXTO ─────────────────────────────────────────────────────────────────
  // Se recarga el mapa de aliases DESPUÉS de sembrar: el sembrado de recién es justamente lo que
  // hace que «DUPEC» deje de necesitar un modelo.
  const aliases = APLICAR ? await aliasesDe('proveedor') : conSembrado(aliasesPrevios, plan.sembrar)

  const t0 = Date.now()
  const ramAntes = Math.round(process.memoryUsage().rss / 1048576)
  const { porClave, metricas } = await resolverLote(todas, {
    entidad: 'proveedor', fuente: 'backfill-compras-cheques', persistir: APLICAR, padron, aliases,
  })
  const ms = Date.now() - t0
  const ramDespues = Math.round(process.memoryUsage().rss / 1048576)

  const M = metricas.porMetodo, E = metricas.porEstado
  console.log(`\nRESOLUCIÓN ${metricas.consultas} registros · ${metricas.unicas} identidades a resolver · reusadas ${metricas.reusadas}`)
  console.log(`   por CUIT        ${String(M.strong_id).padStart(4)}   ${pct(M.strong_id, metricas.unicas)}`)
  console.log(`   por exacto      ${String(M.exacto).padStart(4)}   ${pct(M.exacto, metricas.unicas)}`)
  console.log(`   por alias       ${String(M.alias).padStart(4)}   ${pct(M.alias, metricas.unicas)}`)
  console.log(`   por fuzzy       ${String(M.fuzzy).padStart(4)}   ${pct(M.fuzzy, metricas.unicas)}`)
  console.log(`   por embeddings  ${String(M.embedding).padStart(4)}   ${pct(M.embedding, metricas.unicas)}`)
  console.log(`   sin señal       ${String(M.ninguno).padStart(4)}   ${pct(M.ninguno, metricas.unicas)}`)
  console.log(`\n   auto-resueltos  ${String(E.auto_resuelto).padStart(4)}   sugeridos ${E.sugerido}   ambiguos ${E.ambiguo}   sin match ${E.sin_match}`)
  console.log(`   determinístico (CUIT+exacto+alias) ${M.strong_id + M.exacto + M.alias}/${metricas.unicas} = ${pct(M.strong_id + M.exacto + M.alias, metricas.unicas)}   ·   necesitó ML ${metricas.conML}`)
  console.log(`   ${ms} ms en total · ${metricas.msPromedio} ms por identidad nueva · RAM ${ramAntes} → ${ramDespues} MB`)

  // ── 3. LOS AUTO-RESUELTOS, DE A UNO. Es donde se buscan los falsos positivos. ───────────────────
  console.log('\nAUTO-RESUELTOS (revisar uno por uno):')
  for (const [k, r] of porClave) {
    if (r.estado !== 'auto_resuelto') continue
    const original = k.split('|')[0]
    console.log(`   ${(r.metodo ?? '—').padEnd(10)} «${original}»  →  ${r.match?.nombre ?? '—'}   ×${r.veces}`)
  }
  for (const rotulo of ['sugerido', 'ambiguo', 'sin_match']) {
    const lista = [...porClave].filter(([, r]) => r.estado === rotulo)
    if (!lista.length) continue
    console.log(`\n${rotulo.toUpperCase().replace('_', ' ')} (${lista.length}) — NO se vinculan:`)
    for (const [k, r] of lista) console.log(`   «${k.split('|')[0]}»  ${r.porQue ? `· ${String(r.porQue).slice(0, 100)}` : ''}`)
  }

  if (!APLICAR) console.log('\n═══ NADA SE ESCRIBIÓ. Repetir con --aplicar cuando la lista de arriba esté revisada. ═══')
  else console.log('\n═══ APLICADO ═══')
}

const pct = (n, t) => (t ? `${((n / t) * 100).toFixed(1)}%` : '—')
const dedup = (a) => [...new Map(a.map((x) => [`${x.nombre}|${x.cuit}`, x])).values()]

/** El mapa de aliases como quedaría si se sembrara, para que la corrida en seco mida lo que de
 *  verdad va a pasar y no lo que pasaría sin sembrar nada. */
function conSembrado(previos, aSembrar) {
  const m = new Map(previos)
  for (const a of aSembrar) m.set(a.aliasNorm, a.entidadId)
  return m
}

export { claveConsulta, normalizar }

if (import.meta.url === `file://${process.argv[1]}`) {
  const cerrar = async (c) => { await drenarTrazas().catch(() => {}); process.exit(c) }
  main().then(() => cerrar(0)).catch((e) => { console.error('ERROR:', e.stack || e.message); cerrar(1) })
}
