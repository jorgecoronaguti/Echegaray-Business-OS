#!/usr/bin/env node
// «TIPO DE COSTO» EN COMPRAS: clasificar las celdas VACÍAS de la columna, con respaldo, ensayo y relectura.
//
// ═══ EL PEDIDO (dueño, 18/09/2026, textual) ═══
//
// «En pestaña Compras del Sheet Flujo de Fondos hay una columna que indica "Tipo de Costo". Quiero que
// crees un criterio y determines los que son directos de los indirectos, siendo los directos aquellos que
// impactan en la obra; determinalos y escribilos en esa columna.»
//
// Es la autorización explícita para escribir en el Sheet real, con este alcance y ningún otro:
//   · pestaña Compras, columna «Tipo de Costo» —ubicada por RÓTULO contra la fila de rótulos viva
//     (`contratoContra`), nunca por letra fija—, y SÓLO las celdas vacías.
//   · lo que ya cargó una persona no se toca, aunque la regla diga otra cosa: se informa.
//   · sólo el vocabulario que él ya usa: Directo · Indirecto · Estructura.
//
// La regla vive en `lib/compras-tipo-costo.mjs` (pura, con tests). Acá está el efecto y su evidencia.
//
// ═══ CÓMO SE USA ═══
//
//   node orquestador/scripts/compras-tipo-costo.mjs                     → ENSAYO: lee, mide la regla contra
//        las etiquetas del dueño, arma el plan y lo guarda; guarda el respaldo de la columna. No escribe.
//   node orquestador/scripts/compras-tipo-costo.mjs --aplicar           → lo mismo y ESCRIBE; después relee la
//        columna entera y la compara celda por celda con el plan y con el respaldo.
//   node orquestador/scripts/compras-tipo-costo.mjs --revertir <plan.json>            → ensayo de la reversa
//   node orquestador/scripts/compras-tipo-costo.mjs --revertir <plan.json> --aplicar  → vacía SÓLO las celdas
//        del plan que siguen diciendo exactamente lo que se escribió y estaban vacías en el respaldo; las de
//        una corrección vuelven a su valor previo del respaldo.
//   node orquestador/scripts/compras-tipo-costo.mjs --corregir directo-a-indirecto-estructura [--aplicar]
//        → LA CORRECCIÓN DEL 18/09 (tarde): las filas con L = ES-ADM/ES-TAL que dicen «Directo» pasan a
//        «Indirecto». Es la única escritura sobre celdas CON contenido: lo autorizó el dueño («sí»), se
//        escribe con guarda por valor esperado, respaldo de la columna entera y relectura celda por celda.
//        Por eso pasa con `yaGuardado`: la guarda por celda respetaría sus propias etiquetas y la orden
//        no aterrizaría. Las guardas quedan en este script, no en el portón.
//
// ═══ POR QUÉ ESCRIBE POR `batchUpdateValues` CON `confirmacion` ═══
//
// Es la única entrada de escritura que acepta la confirmación humana del freno de mano
// (`congelador-sheets.mjs`): la escritura queda logueada con actor y motivo en cada llamada. Con
// `soloFilasVacias` la guarda relee cada rango y sólo lo deja pasar si está COMPLETAMENTE vacío; no-borrar
// impide que nada se vacíe. El freno no se desactiva para nada más. La reversa vacía celdas, y eso
// `batchUpdateValues` no lo permite: va por `updateCells` (`spreadsheetBatchUpdate`), que respeta el
// freno duro — si la marca está puesta, la reversa se corre con `ORQ_SHEETS_DESCONGELAR="motivo"`.
//
// La evidencia es la columna RELEÍDA, no la respuesta de la API (05/08/2026: `totalUpdatedCells: 2` y la
// celda intacta).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { CASHFLOW_ID } from '../lib/cash-briefing.mjs'
import { PRIMERA_FILA, contratoDeColumnas, filaACompra } from '../lib/compras-fila.mjs'
import { PESTANAS, rangoFilas } from '../lib/columnas-por-encabezado.mjs'
import { contratoContra, colDelCargador, indiceDe } from '../lib/comprobantes/contrato-columnas.mjs'
import { asignadorDeCompras, catalogosDeAsignacion } from '../lib/compras-obra-asignada.mjs'
import { catalogoDeDestinos, proyectarObraDeFila } from '../lib/obra-destino.mjs'
import {
  medirContraEtiquetas, planDeReversa, planDeTipoCosto, tramosDeEscritura, verificarRelectura, VOCABULARIO,
  planDeCorreccionPorDestino, CORRECCIONES,
} from '../lib/compras-tipo-costo.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || CASHFLOW_ID
const PESTANA = 'Compras'
const ROTULO = 'Tipo de Costo'
const argv = process.argv.slice(2)
const APLICAR = argv.includes('--aplicar')
const iRev = argv.indexOf('--revertir')
const REVERTIR = iRev >= 0 ? argv[iRev + 1] : null
const iCor = argv.indexOf('--corregir')
const CORREGIR = iCor >= 0 ? argv[iCor + 1] : null

const RESPALDOS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../datos/respaldos')
const sello = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')
const T = (v) => String(v ?? '').trim()

/** LA CONFIRMACIÓN HUMANA que levanta el freno para ESTA escritura. Queda en el log en cada llamada. */
export const CONFIRMACION = Object.freeze({
  actor: 'Jorge (dueño) — pedido textual del 18/09/2026',
  motivo: 'Tipo de Costo en Compras: «determinalos y escribilos en esa columna» (18/09/2026) · sólo celdas vacías',
})

/** Lee la pestaña entera (rótulos incluidos) y la proyecta como el sync: la MISMA fila, el MISMO destino. */
async function leer(google) {
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === PESTANA)
  if (!hoja) throw new Error(`no encontré la pestaña «${PESTANA}»`)
  const filas = await google.readSheetValues(ID, rangoFilas(PESTANA, PESTANAS.Compras.filaEncabezado, hoja.rows), { render: 'UNFORMATTED_VALUE' })
  if (!filas.length) throw new Error('no leí nada de Compras')
  const encabezado = filas[0]
  // La columna se ubica POR RÓTULO contra la fila viva. Si el contrato no coincide, aborta: no se escribe a ciegas.
  const letra = colDelCargador(contratoContra(encabezado)).tipoCosto
  if (!letra) throw new Error(`el contrato no resuelve «${ROTULO}» contra la fila de rótulos viva`)
  const idxZ = indiceDe(letra)
  if (T(encabezado[idxZ]) !== ROTULO) throw new Error(`la columna ${letra} dice «${T(encabezado[idxZ])}», no «${ROTULO}»`)
  const idx = contratoDeColumnas(encabezado)

  const catalogos = await catalogosDeAsignacion(query)
  const cat = catalogoDeDestinos({ obras: catalogos.canonicas, clienteAlias: catalogos.clienteAlias })
  const asignar = asignadorDeCompras(catalogos)

  const compras = []
  const columna = [] // el respaldo: TODA la columna, fila por fila, tal como está
  filas.slice(1).forEach((f, i) => {
    const fila = i + PRIMERA_FILA
    columna.push({ fila, valor: T(f?.[idxZ]) })
    const c = filaACompra(f, idx, fila)
    if (!c) return
    Object.assign(c, proyectarObraDeFila(c, cat))
    if (!T(c.obra_celda)) { const a = asignar(c); c.via = a.via; c.obra_id = a.obra_id }
    compras.push(c)
  })
  return { hoja, letra, compras, columna }
}

function guardar(nombre, objeto) {
  fs.mkdirSync(RESPALDOS, { recursive: true })
  const ruta = path.join(RESPALDOS, nombre)
  fs.writeFileSync(ruta, JSON.stringify(objeto, null, 2))
  return ruta
}

async function releerColumna(google, letra, hasta) {
  const v = await google.readSheetValues(ID, `'${PESTANA}'!${letra}${PRIMERA_FILA}:${letra}${hasta}`, { render: 'FORMATTED_VALUE' })
  const m = new Map()
  for (let i = PRIMERA_FILA; i <= hasta; i++) m.set(i, T(v[i - PRIMERA_FILA]?.[0]))
  return m
}

function imprimirMedicion(m) {
  console.log(`\n── MEDICIÓN contra las ${m.total} filas que el dueño ya etiquetó ──`)
  console.log(`  la regla reproduce ${m.aciertos} (${(100 * m.aciertos / Math.max(1, m.total)).toFixed(1)} %) · desacuerdos ${m.desacuerdos.length} · sin decisión ${m.sinDecision.length}`)
  for (const [t, x] of Object.entries(m.porTipo)) console.log(`  ${t.padEnd(11)} n=${x.n}  reproduce ${x.aciertos}  desacuerdo ${x.desacuerdos}  sin decisión ${x.sinDecision}`)
  const porPar = {}
  for (const d of m.desacuerdos) { const k = `${d.dueno} → regla ${d.regla}`; porPar[k] = (porPar[k] ?? 0) + 1 }
  for (const [k, n] of Object.entries(porPar)) console.log(`    ${k}: ${n}`)
}

async function principal() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const { hoja, letra, compras, columna } = await leer(google)
  const ultima = columna.length ? columna[columna.length - 1].fila : PRIMERA_FILA
  console.log(`«${PESTANA}» · ${compras.length} filas con ID · columna «${ROTULO}» = ${letra} (por rótulo) · filas ${PRIMERA_FILA}–${ultima}`)

  const medicion = medirContraEtiquetas(compras)
  imprimirMedicion(medicion)

  const plan = planDeTipoCosto(compras)
  const porValor = {}
  for (const e of plan.escribir) porValor[e.valor] = (porValor[e.valor] ?? 0) + 1
  const vacias = plan.escribir.length + plan.excepciones.length
  console.log(`\n── PLAN ──`)
  console.log(`  ya cargadas (no se tocan): ${plan.yaTenian} · fuera de alcance (anuladas/vacías): ${plan.fueraDeAlcance}`)
  console.log(`  vacías candidatas: ${vacias} → escribir ${plan.escribir.length} (${Object.entries(porValor).map(([k, n]) => `${k} ${n}`).join(' · ')}) · excepciones ${plan.excepciones.length}`)
  for (const e of plan.escribir) {
    console.log(`  ✎ ${letra}${e.fila} = ${e.valor.padEnd(10)} · ${e.proveedor ?? '-'} · ${(e.concepto ?? e.detalle ?? '-').slice(0, 40)} · ${e.obra_celda ?? e.cliente ?? '-'} · ${plata(e.total)}${e.nota ? `  ⚠ ${e.nota}` : ''}`)
  }
  if (plan.excepciones.length) {
    console.log(`\n── EXCEPCIONES (no se escriben; para el dueño) ──`)
    for (const x of plan.excepciones) console.log(`  ? fila ${x.fila} · ${x.proveedor ?? '-'} · ${(x.concepto ?? x.detalle ?? '-').slice(0, 40)} · ${plata(x.total)} · ${x.motivo}`)
  }
  const raro = plan.escribir.filter((e) => !VOCABULARIO.includes(e.valor))
  if (raro.length) throw new Error(`el plan trae un valor fuera del vocabulario: ${raro.map((e) => e.valor).join(', ')}`)

  const ts = sello()
  const modo = APLICAR ? 'aplicar' : 'dry'
  const rutaRespaldo = guardar(`compras-tipo-costo-respaldo-${ts}.json`, {
    sheet: ID, pestana: PESTANA, columna: { rotulo: ROTULO, letra }, leido_en: new Date().toISOString(), modo, filas: columna,
  })
  const rutaPlan = guardar(`compras-tipo-costo-plan-${ts}.json`, {
    sheet: ID, pestana: PESTANA, columna: { rotulo: ROTULO, letra }, generado_en: new Date().toISOString(), modo,
    respaldo: rutaRespaldo, confirmacion: CONFIRMACION, resumen: { ...porValor, excepciones: plan.excepciones.length, yaTenian: plan.yaTenian },
    escribir: plan.escribir, excepciones: plan.excepciones, medicion,
  })
  console.log(`\n  respaldo de la columna: ${rutaRespaldo}\n  plan: ${rutaPlan}`)

  if (!plan.escribir.length) { console.log('\n✓ nada que escribir.'); return }
  if (!APLICAR) { console.log('\n(ensayo: no escribí nada. Para escribir: --aplicar)'); return }

  // ── ESCRIBIR: sólo la columna, sólo tramos de celdas vacías, con la confirmación del dueño.
  const tramos = tramosDeEscritura(plan.escribir, { pestana: PESTANA, letra })
  console.log(`\n── ESCRITURA: ${plan.escribir.length} celda(s) en ${tramos.length} tramo(s) ──`)
  const r = await google.batchUpdateValues(ID, tramos, { confirmacion: CONFIRMACION, soloFilasVacias: true })
  if (r?.congelado) { console.error('🧊 el freno de mano está puesto y la confirmación no lo levantó: no escribí nada.'); process.exit(2) }
  if (r?.protegido) { console.error(`🔒 la guarda descartó la escritura: ${r.motivo ?? ''} ${(r.bloqueadas ?? []).slice(0, 5).join(', ')}`); process.exit(2) }
  console.log(`  API: ${r?.totalUpdatedCells ?? '?'} celda(s) reportadas — no es la evidencia; se relee.`)

  // ── LA EVIDENCIA: la columna entera releída y comparada celda por celda.
  const leido = await releerColumna(google, letra, ultima)
  const v = verificarRelectura({ respaldo: columna, escribir: plan.escribir, leido })
  console.log(`\n── RELECTURA de ${letra}${PRIMERA_FILA}:${letra}${ultima} ──`)
  console.log(`  previstas ${v.previstas} · confirmadas en el destino ${v.confirmadas} · no aterrizaron ${v.noAterrizo.length} · celdas ajenas cambiadas ${v.ajenasCambiadas.length}`)
  for (const x of v.noAterrizo.slice(0, 20)) console.error(`  ✖ ${letra}${x.fila}: esperaba «${x.esperaba}», dice «${x.leido}»`)
  for (const x of v.ajenasCambiadas.slice(0, 20)) console.error(`  ✖ ${letra}${x.fila} NO estaba en el plan y cambió: «${x.antes}» → «${x.ahora}»`)
  guardar(`compras-tipo-costo-relectura-${ts}.json`, { plan: rutaPlan, relectura: v, leido_en: new Date().toISOString() })
  if (v.noAterrizo.length || v.ajenasCambiadas.length || v.confirmadas !== v.previstas) { console.error('\n✖ el destino no dice lo que se escribió.'); process.exit(1) }
  console.log(`\n✓ ${v.confirmadas} celdas leídas = ${v.previstas} previstas. Reversa: node orquestador/scripts/compras-tipo-costo.mjs --revertir ${rutaPlan} --aplicar`)
}

async function revertir(rutaPlan) {
  const plan = JSON.parse(fs.readFileSync(rutaPlan, 'utf8'))
  const respaldo = JSON.parse(fs.readFileSync(plan.respaldo, 'utf8'))
  if (plan.sheet !== ID || respaldo.sheet !== ID) throw new Error('el plan es de otro Sheet')
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  // La letra se vuelve a resolver por rótulo: si el dueño insertó una columna, la del plan ya no es ésta.
  const { hoja, letra, columna } = await leer(google)
  if (letra !== plan.columna.letra) throw new Error(`«${ROTULO}» hoy es ${letra} y el plan escribió en ${plan.columna.letra}: no revierto a ciegas`)
  const ultima = columna.length ? columna[columna.length - 1].fila : PRIMERA_FILA
  const leido = await releerColumna(google, letra, Math.max(ultima, ...plan.escribir.map((e) => e.fila)))
  const r = planDeReversa({ escribir: plan.escribir, respaldo: respaldo.filas, leido })
  console.log(`── REVERSA de ${rutaPlan} ──`)
  console.log(`  vaciar ${r.vaciar.length} celda(s) · restaurar ${r.restaurar.length} · no son mías ${r.noSonMias.length}`)
  for (const x of r.noSonMias) console.log(`  ✋ ${letra}${x.fila}: ${x.motivo}`)
  for (const x of r.vaciar) console.log(`  ⌫ ${letra}${x.fila} «${x.valor}» → vacía`)
  for (const x of r.restaurar) console.log(`  ↩ ${letra}${x.fila} «${x.valor}» → «${x.antes}»`)
  if (!r.vaciar.length && !r.restaurar.length) { console.log('\n✓ nada que revertir.'); return }
  if (!APLICAR) { console.log('\n(ensayo: no toqué nada. Para revertir: --revertir <plan> --aplicar)'); return }
  const col = indiceDe(letra)
  if (r.vaciar.length) {
    const requests = r.vaciar.map((x) => ({ updateCells: {
      range: { sheetId: hoja.sheetId, startRowIndex: x.fila - 1, endRowIndex: x.fila, startColumnIndex: col, endColumnIndex: col + 1 },
      rows: [{ values: [{ userEnteredValue: null }] }],
      fields: 'userEnteredValue',
    } }))
    const res = await google.spreadsheetBatchUpdate(ID, requests)
    if (res?.congelado) { console.error('🧊 el freno de mano está puesto: la reversa va con ORQ_SHEETS_DESCONGELAR="motivo".'); process.exit(2) }
    if (res?.protegido) { console.error('🔒 la guarda descartó la reversa.'); process.exit(2) }
  }
  if (r.restaurar.length) {
    // Devolver el valor previo del dueño a una celda que hoy dice lo que escribió la corrección: misma puerta
    // que la corrección (`yaGuardado`), mismas guardas (valor actual = lo escrito, previo = el del respaldo).
    const tramos = tramosDeEscritura(r.restaurar.map((x) => ({ fila: x.fila, valor: x.antes })), { pestana: PESTANA, letra })
    const res = await google.batchUpdateValues(ID, tramos, { yaGuardado: true, confirmacion: CONFIRMACION })
    if (res?.congelado) { console.error('🧊 el freno de mano está puesto: no restauré nada.'); process.exit(2) }
    if (res?.protegido) { console.error('🔒 la guarda descartó la restauración.'); process.exit(2) }
  }
  const despues = await releerColumna(google, letra, Math.max(ultima, ...plan.escribir.map((e) => e.fila)))
  const quedan = [
    ...r.vaciar.filter((x) => T(despues.get(x.fila)) !== '').map((x) => `${letra}${x.fila} sigue diciendo «${despues.get(x.fila)}»`),
    ...r.restaurar.filter((x) => T(despues.get(x.fila)) !== x.antes).map((x) => `${letra}${x.fila} dice «${despues.get(x.fila)}», no «${x.antes}»`),
  ]
  for (const q of quedan) console.error(`  ✖ ${q}`)
  if (quedan.length) { console.error('\n✖ la reversa no aterrizó entera.'); process.exit(1) }
  console.log(`\n✓ ${r.vaciar.length} celda(s) vacías y ${r.restaurar.length} restaurada(s), releídas.`)
}

/**
 * UNA CORRECCIÓN POR NOMBRE: plan puro con guarda por valor esperado → listado y conteo por texto de la J →
 * respaldo de la columna entera → (con --aplicar) escritura → relectura celda por celda de TODA la columna.
 */
async function corregir(nombre) {
  const correccion = CORRECCIONES[nombre]
  if (!correccion) throw new Error(`no conozco la corrección «${nombre}». Conozco: ${Object.keys(CORRECCIONES).join(', ')}`)
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const { letra, compras, columna } = await leer(google)
  const ultima = columna.length ? columna[columna.length - 1].fila : PRIMERA_FILA
  const plan = planDeCorreccionPorDestino(compras, correccion)
  console.log(`«${PESTANA}» · corrección «${nombre}» · «${correccion.de}» → «${correccion.a}» donde la L dice ${correccion.destinos.join(' / ')}`)
  console.log(`  ${correccion.pedido}`)
  console.log(`  columna «${ROTULO}» = ${letra} (por rótulo) · ${compras.length} filas con ID · filas ${PRIMERA_FILA}–${ultima}`)
  console.log(`\n── FILAS (${plan.escribir.length}) ──`)
  for (const e of plan.escribir) console.log(`  ✎ ${letra}${e.fila} «${e.antes}» → «${e.valor}» · ${e.proveedor ?? '-'} · J «${e.cliente ?? '-'}» · L «${(e.obra_celda ?? '').slice(0, 6)}» · ${(e.concepto ?? '-').slice(0, 32)} · ${plata(e.total)}`)
  console.log(`\n  por texto de la J: ${Object.entries(plan.porCliente).map(([k, n]) => `${k} ${n}`).join(' · ')} · total ${plan.escribir.length}`)
  for (const x of plan.excluidas) console.log(`  ✋ fila ${x.fila} · ${x.proveedor ?? '-'} · ${x.motivo}`)
  const raro = plan.escribir.filter((e) => !VOCABULARIO.includes(e.valor))
  if (raro.length) throw new Error(`el plan trae un valor fuera del vocabulario: ${raro.map((e) => e.valor).join(', ')}`)
  const ts = sello()
  const modo = APLICAR ? 'aplicar' : 'dry'
  const rutaRespaldo = guardar(`compras-tipo-costo-respaldo-${nombre}-${ts}.json`, {
    sheet: ID, pestana: PESTANA, columna: { rotulo: ROTULO, letra }, leido_en: new Date().toISOString(), modo, correccion: nombre, filas: columna,
  })
  const rutaPlan = guardar(`compras-tipo-costo-plan-${nombre}-${ts}.json`, {
    sheet: ID, pestana: PESTANA, columna: { rotulo: ROTULO, letra }, generado_en: new Date().toISOString(), modo, correccion,
    respaldo: rutaRespaldo, confirmacion: CONFIRMACION, resumen: { escribir: plan.escribir.length, porCliente: plan.porCliente, excluidas: plan.excluidas.length },
    escribir: plan.escribir, excluidas: plan.excluidas,
  })
  console.log(`\n  respaldo de la columna: ${rutaRespaldo}\n  plan: ${rutaPlan}`)
  if (!plan.escribir.length) { console.log('\n✓ nada que escribir.'); return }
  if (!APLICAR) { console.log('\n(ensayo: no escribí nada. Para escribir: --corregir ' + nombre + ' --aplicar)'); return }

  const tramos = tramosDeEscritura(plan.escribir, { pestana: PESTANA, letra })
  console.log(`\n── ESCRITURA: ${plan.escribir.length} celda(s) en ${tramos.length} tramo(s), con yaGuardado (celdas del dueño, orden del dueño) ──`)
  const r = await google.batchUpdateValues(ID, tramos, { yaGuardado: true, confirmacion: CONFIRMACION })
  if (r?.congelado) { console.error('🧊 el freno de mano está puesto: no escribí nada.'); process.exit(2) }
  if (r?.protegido) { console.error(`🔒 la guarda descartó la escritura: ${r.motivo ?? ''}`); process.exit(2) }
  console.log(`  API: ${r?.totalUpdatedCells ?? '?'} celda(s) reportadas — no es la evidencia; se relee.`)
  const leido = await releerColumna(google, letra, ultima)
  const v = verificarRelectura({ respaldo: columna, escribir: plan.escribir, leido })
  console.log(`\n── RELECTURA de ${letra}${PRIMERA_FILA}:${letra}${ultima} ──`)
  console.log(`  previstas ${v.previstas} · confirmadas en el destino ${v.confirmadas} · no aterrizaron ${v.noAterrizo.length} · celdas ajenas cambiadas ${v.ajenasCambiadas.length}`)
  for (const x of v.noAterrizo.slice(0, 20)) console.error(`  ✖ ${letra}${x.fila}: esperaba «${x.esperaba}», dice «${x.leido}»`)
  for (const x of v.ajenasCambiadas.slice(0, 20)) console.error(`  ✖ ${letra}${x.fila} NO estaba en el plan y cambió: «${x.antes}» → «${x.ahora}»`)
  guardar(`compras-tipo-costo-relectura-${nombre}-${ts}.json`, { plan: rutaPlan, relectura: v, leido: [...leido].filter(([f]) => plan.escribir.some((e) => e.fila === f)), leido_en: new Date().toISOString() })
  if (v.noAterrizo.length || v.ajenasCambiadas.length || v.confirmadas !== v.previstas) { console.error('\n✖ el destino no dice lo que se escribió.'); process.exit(1) }
  console.log(`\n✓ ${v.confirmadas} celdas leídas = ${v.previstas} previstas. Reversa: node orquestador/scripts/compras-tipo-costo.mjs --revertir ${rutaPlan} --aplicar`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const corrida = REVERTIR ? revertir(REVERTIR) : CORREGIR ? corregir(CORREGIR) : principal()
  corrida.catch((e) => { console.error('ERROR:', e.stack || e.message); process.exitCode = 1 }).finally(() => closePool())
}
