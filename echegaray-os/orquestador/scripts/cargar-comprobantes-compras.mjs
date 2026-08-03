#!/usr/bin/env node
// CARGA UN FAJO DE COMPROBANTES (fotografiados) A LA PESTAÑA "Compras" — íntegro y sin nada suelto.
//
// El OS lee cada foto y arma el JSON de entrada; este script lo escribe en Compras respetando el
// contrato de columnas (lib/carga-comprobantes.mjs): toca SÓLO las columnas del comprobante, estampa
// las fórmulas por fila copiándolas de la última fila (PASTE_FORMULA, Google ajusta las referencias)
// y NO escribe en las columnas de ARRAYFORMULA (AC/AD/AE/AF/AJ) — escribir ahí, aunque sea "",
// bloquea el derrame. Como los cruces del Sheet (Cash Flow, Proveedores, CAJA, Cheques) ya son
// fórmulas ABIERTAS sobre Compras, un comprobante bien cargado se propaga solo.
//
// FLUJO: cruza contra ARCA (duplicados) → matchea proveedor contra el desplegable estricto → asegura
// la grilla → escribe input → estampa fórmulas → verifica (sin #ERROR, totales) → reporta nuevos
// proveedores y duplicados. Después conviene: node scripts/sync-compras.mjs (→ Supabase, regla #6).
//
//   node orquestador/scripts/cargar-comprobantes-compras.mjs --file fajo.json [--dry]

import { readFileSync } from 'node:fs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { matchProveedor, valoresInput, validar, discrepanciaNeto, verificarEscritura, colIndice, GRUPOS_FORMULA } from '../lib/carga-comprobantes.mjs'
import { registrarSincronizacion } from '../lib/registrar-sincronizacion.mjs'
import { perfilesDeImputacionDesdeDB, sugerirImputacion } from '../lib/imputacion-aprendida.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const ADD_PROV = process.argv.includes('--add-proveedores')
const fileArg = (process.argv.find((a) => a.startsWith('--file=')) || '').split('=')[1]
  || process.argv[process.argv.indexOf('--file') + 1]

const idx = colIndice // 'A'->0, 'AA'->26 — una sola definición, compartida con la verificación

/** Lista viva del desplegable ESTRICTO de proveedores (columna E). */
async function listaProveedores(google) {
  const sheets = await google.readSheetValidations(ID, ['Compras!E4:E12'])
  const s = (sheets || []).find((x) => /^compras$/i.test(x.properties?.title))
  for (const row of s?.data?.[0]?.rowData || []) {
    const dv = (row.values || [])[0]?.dataValidation
    if (dv?.condition?.type === 'ONE_OF_LIST') return dv.condition.values.map((v) => v.userEnteredValue)
  }
  return []
}

/** Comprobantes de ARCA para detectar duplicados: clave laxa por número y por CUIT. */
async function indiceArca() {
  const { rows } = await query('select emisor_cuit, punto_venta, numero, imp_total::float8 imp_total from comprobantes_arca').catch(() => ({ rows: [] }))
  const porNumero = new Map()
  for (const r of rows) {
    const num = String(r.numero ?? '').replace(/\D/g, '').replace(/^0+/, '')
    if (num) porNumero.set(num, r)
  }
  return { porNumero, total: rows.length }
}

/** Traduce lo que devolvió la escritura en la razón HUMANA de por qué el destino quedó como quedó. */
function porQueNoEntro(respuesta, leidoOk) {
  if (respuesta?.congelado) return `la escritura de Sheets está CONGELADA — ${String(respuesta.motivo).split('\n')[0]}`
  if (respuesta?.noBorrar) return 'la guarda no-borrar descartó los rangos (no pudo releer el destino)'
  if (respuesta?.protegido) {
    const tabs = (respuesta.bloqueadas || []).join(', ') || 'la pestaña'
    // `porQue` viene de la guarda como pestaña → motivo (candado-dueño · firma-editada · …).
    const causa = Object.values(respuesta.porQue || {})[0] || respuesta.motivo || 'candado de pestaña o firma'
    return `la guarda protegió ${tabs} (${causa}): o la candaste a mano, o la editaste desde mi última escritura`
  }
  if (!leidoOk) return 'no pude releer las filas para verificar la escritura — no afirmo que se escribieron'
  return 'la API aceptó la escritura pero el destino no la tiene (algún filtro de la guarda descartó los rangos)'
}

/**
 * ESCRIBE LAS FILAS Y PRUEBA EL EFECTO. La respuesta de la API no es evidencia: la evidencia es el dato
 * leído en su destino. Escribe el bloque de input, RELEE exactamente las filas que dice haber escrito y
 * las compara contra lo que se quiso poner. Devuelve ok:false —con el porqué— si alguna quedó vacía o
 * distinta, para que el llamador falle en vez de felicitar. Exportada para poder probar el fallo.
 *
 * @returns {Promise<{ok:boolean, motivo?:string, vacias:object[], distintas:object[], respuesta:any}>}
 */
export async function escribirYVerificar(google, { desde, hasta, plan, fileId = ID }) {
  const letras = [...new Set(plan.flatMap((p) => Object.keys(p.valores)))]
  const data = letras.map((L) => ({
    range: `Compras!${L}${desde}:${L}${hasta}`,
    values: plan.map((p) => [p.valores[L] ?? '']),
  }))
  // REGLA 0 — NO APLICA, Y ESTÁ DECIDIDO: respetar: false.
  // Este cargador AGREGA filas de comprobante al final de "Compras". No escribe un solo rótulo:
  // escribe datos —CUIT, número, importe, fecha— en filas que antes no existían. No hay texto de
  // una persona debajo que se pueda pisar, porque debajo no había nada.
  //
  // Y ese mismo hecho es el que habilita `soloFilasVacias`: como es un APPEND, la guarda puede dejarlo
  // pasar aunque la firma de "Compras" difiera (el dueño la edita todos los días) — pero sólo después de
  // RELEER el destino y confirmarlo vacío, y nunca contra un candado puesto a mano. Ver
  // guarda-escritura.mjs. Que "debajo no había nada" deje de ser cierto no es una hipótesis: es lo que la
  // guarda verifica antes de escribir, y lo que la verificación de abajo prueba después.
  const respuesta = await google.batchUpdateValues(fileId, data, { soloFilasVacias: true })
  const leido = await google.readSheetGrid(fileId, `Compras!A${desde}:AD${hasta}`).catch(() => null)
  const v = verificarEscritura(plan.map((p) => p.valores), leido?.filas || [], { desde })
  if (v.ok && leido) return { ok: true, ...v, respuesta }
  return { ok: false, motivo: porQueNoEntro(respuesta, Boolean(leido)), ...v, respuesta }
}

async function main() {
  if (!fileArg) { console.error('Falta --file <fajo.json> (array de comprobantes parseados de las fotos)'); process.exit(1) }
  const comprobantes = JSON.parse(readFileSync(fileArg, 'utf8'))
  if (!Array.isArray(comprobantes) || !comprobantes.length) { console.error('El JSON tiene que ser un array de comprobantes no vacío'); process.exit(1) }

  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === 'Compras')
  const [lista, arca, colE, perfiles] = await Promise.all([
    listaProveedores(google), indiceArca(), google.readSheetValues(ID, 'Compras!E1:E'),
    // IMPUTACIÓN QUE APRENDE (F8): perfiles de cómo el dueño imputó comprobantes parecidos. Sólo LEE
    // (public.costos_obra, Nivel D reversible); si no hay historia, degrada y la sugerencia lo dice.
    perfilesDeImputacionDesdeDB({ query }).catch(() => null),
  ])
  let ultima = 0
  colE.forEach((r, i) => { if (r[0] != null && r[0] !== '') ultima = i + 1 })

  // Preparar cada fila: validar, matchear proveedor, cruzar ARCA.
  const plan = []
  const nuevos = new Set(); const dupes = []; const rechazos = []; const percep = []
  for (const [i, c] of comprobantes.entries()) {
    const prov = matchProveedor(c.proveedor, lista)
    const cc = { ...c, proveedor: prov.valor }
    const problemas = validar(cc)
    if (problemas.length) { rechazos.push({ i, proveedor: c.proveedor, problemas }); continue }
    if (prov.esNuevo) nuevos.add(prov.valor)
    const num = String(c.numero ?? '').replace(/\D/g, '').replace(/^0+/, '')
    const enArca = num && arca.porNumero.get(num)
    if (enArca) dupes.push({ i, numero: c.numero, arcaTotal: enArca.imp_total })
    const dif = discrepanciaNeto(c)
    if (dif) percep.push({ i, proveedor: prov.valor, dif })
    // SUGERENCIA de imputación (F8): aparece para que el dueño la vea; NO cambia lo que se escribe.
    // Sólo si el comprobante no trae la imputación explícita (no pisamos lo que el dueño ya anotó).
    const sug = perfiles && !cc.unidad && !cc.obra
      ? sugerirImputacion({ proveedor: prov.valor, concepto: c.concepto, monto: c.total ?? c.neto }, perfiles)
      : null
    plan.push({ valores: valoresInput(cc), nuevo: prov.esNuevo, proveedor: prov.valor, sug })
  }

  const desde = ultima + 1
  const hasta = ultima + plan.length
  console.log(`Compras: última fila con datos = ${ultima}. Se cargan ${plan.length} comprobante(s) → filas ${desde}..${hasta}.`)
  if (rechazos.length) { console.log(`\n⚠ ${rechazos.length} NO se cargan (dato insuficiente, no se inventa):`); rechazos.forEach((r) => console.log(`   #${r.i} ${r.proveedor || '(sin proveedor)'}: ${r.problemas.join('; ')}`)) }
  if (nuevos.size) console.log(`\n⚠ Proveedores NUEVOS (no están en el desplegable estricto — confirmá antes de fijarlos): ${[...nuevos].join(' · ')}`)
  if (percep.length) console.log(`\nℹ Percepción/impuesto interno absorbido en Importe (M = Total − IVA, para que el Total cierre): ${percep.map((p) => `${p.proveedor} (+$${Math.round(p.dif).toLocaleString('es-AR')})`).join(' · ')}`)
  if (dupes.length) console.log(`\nℹ Ya figuran en ARCA (posible duplicado, revisá): ${dupes.map((d) => `${d.numero} ($${Math.round(d.arcaTotal).toLocaleString('es-AR')})`).join(' · ')}`)

  // SUGERENCIA DE IMPUTACIÓN (F8) — el OS SUGIERE, el dueño CONFIRMA. Nunca imputa solo: estas filas se
  // escriben con Unidad/Obra VACÍAS igual que siempre (las completa el dueño, y ahí el rubro reclasifica).
  // Acá sólo mostramos, por comprobante, qué imputó históricamente a proveedores parecidos, para que el
  // dueño complete más rápido y corrija si hace falta — esa corrección re-alimenta el aprendizaje.
  const conSug = plan.map((p, k) => ({ k, p })).filter((x) => x.p.sug)
  if (!perfiles?.disponible) {
    console.log('\nℹ Imputación aprendida: sin historia espejada todavía (public.costos_obra). La máquina mide; la historia recién arranca.')
  } else if (conSug.length) {
    console.log('\n💡 Sugerencia de imputación (aprendida de cómo imputaste comprobantes parecidos — SUGIERE, no impone; completá/corregí vos):')
    for (const { p } of conSug) {
      const s = p.sug
      const dim = (d) => d.sugerido ? `${d.sugerido}${d.pide_confirmacion ? ' (?)' : ' ✓'}` : '—'
      console.log(`   ${p.proveedor}: unidad ${dim(s.unidad)} · obra ${dim(s.obra)} · rubro ${dim(s.rubro)}  [${s.pide_confirmacion ? 'confirmá' : 'alta confianza'}]`)
      console.log(`      ↳ ${s.nota}`)
    }
    console.log('   (✓ = alta confianza · (?) = necesita tu confirmación)')
  }
  if (!plan.length) { console.log('\nNada cargable.'); await closePool(); return }

  if (DRY) {
    console.log('\n(--dry) Muestra de la primera fila a escribir:')
    console.log('  ', JSON.stringify(plan[0].valores))
    console.log(`  Fórmulas a estampar por copyPaste desde la fila ${ultima}: ${GRUPOS_FORMULA.map((g) => g[0] === g[1] ? g[0] : g.join(':')).join(' ')}`)
    await closePool(); return
  }

  // Grilla: tiene que alcanzar ANTES de escribir, o el batch falla entero.
  if ((hoja.rows ?? 0) < hasta + 5) {
    await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: hasta + 20 } }, fields: 'gridProperties.rowCount' } }])
  }

  // 0) PROVEEDORES NUEVOS → al desplegable estricto (si se pidió), para que queden fijos y matcheen
  //    en la próxima carga. Se reescribe la validación de toda la columna E con la lista ampliada.
  if (ADD_PROV && nuevos.size) {
    const listaFinal = [...lista, ...nuevos]
    await google.spreadsheetBatchUpdate(ID, [{
      setDataValidation: {
        range: { sheetId: hoja.sheetId, startRowIndex: 3, endRowIndex: Math.max(hoja.rows ?? 0, hasta + 20), startColumnIndex: idx('E'), endColumnIndex: idx('E') + 1 },
        rule: { condition: { type: 'ONE_OF_LIST', values: listaFinal.map((v) => ({ userEnteredValue: v })) }, strict: true, showCustomUi: true },
      },
    }])
    console.log(`  + ${nuevos.size} proveedor(es) agregado(s) al desplegable: ${[...nuevos].join(' · ')}`)
  }

  // 1) VALORES de input y de imputación (obra), una columna por vez. NO toca fórmulas, derivadas
  //    (AC/AD/AE/AF/AJ) ni lo que el dueño completa aparte (Unidad de Negocio, Detalle).
  const escritura = await escribirYVerificar(google, { desde, hasta, plan })
  if (!escritura.ok) {
    console.error(`\n✖ NO se escribió lo que pedí: ${escritura.motivo}`)
    for (const v of escritura.vacias.slice(0, 10)) console.error(`   fila ${v.fila} col ${v.columna}: quedó VACÍA (esperaba "${v.esperado}")`)
    for (const d of escritura.distintas.slice(0, 10)) console.error(`   fila ${d.fila} col ${d.columna}: dice "${d.encontrado}", esperaba "${d.esperado}"`)
    console.error('   No estampo fórmulas sobre filas que no tienen datos. Nada quedó a medias: revisá el candado/firma de "Compras" y volvé a correr.')
    console.error('   Para devolver la pestaña al OS:  node orquestador/scripts/pestana-candado.mjs desbloquear "Compras"')
    process.exitCode = 1
    await closePool(); return
  }

  // 2) FÓRMULAS por fila: copiar de la última fila con datos a las nuevas (Google reajusta refs).
  const reqs = GRUPOS_FORMULA.map(([a, b]) => ({
    copyPaste: {
      source: { sheetId: hoja.sheetId, startRowIndex: ultima - 1, endRowIndex: ultima, startColumnIndex: idx(a), endColumnIndex: idx(b) + 1 },
      destination: { sheetId: hoja.sheetId, startRowIndex: desde - 1, endRowIndex: hasta, startColumnIndex: idx(a), endColumnIndex: idx(b) + 1 },
      pasteType: 'PASTE_FORMULA', pasteOrientation: 'NORMAL',
    },
  }))
  // EL DUEÑO TRABAJA CON UN FILTRO ACTIVO EN COMPRAS (23/07). Con un filtro puesto, copyPaste
  // revienta con "This operation is not supported on a range with a filtered out row" y, peor, el
  // batch es atómico: si tiraba la excepción, el script salía con error dejando las filas a medias.
  // Pero al AGREGAR datos debajo de columnas con fórmula consistente, Google AUTO-EXTIENDE esas
  // fórmulas por-fila solo. Entonces: si el copyPaste falla por el filtro, se verifica que la fórmula
  // clave (O = total) haya bajado sola a todas las filas nuevas. Si bajó, se sigue; si no, se falla
  // fuerte. No se toca el filtro del dueño (Regla 0: su vista es suya).
  try {
    await google.spreadsheetBatchUpdate(ID, reqs)
  } catch (e) {
    if (!/filtered out row/i.test(String(e?.message ?? e))) throw e
    const g = await google.readSheetGrid(ID, `Compras!O${desde}:O${hasta}`)
    const todasConFormula = g.filas.length === plan.length && g.filas.every((f) => f[0]?.formula)
    if (!todasConFormula) throw new Error('hay un filtro activo en Compras y la fórmula de Total (O) no se auto-extendió a todas las filas nuevas — quitá el filtro y volvé a correr')
    console.log('ℹ Compras tiene un filtro activo: copyPaste no aplica sobre filas filtradas, pero Google auto-extendió las fórmulas por fila (verificado en la columna O = Total). No se tocó tu filtro.')
  }

  // 3) VERIFICAR LAS FÓRMULAS: releer id (A), total (O) y rubro de caja (AC) de las filas nuevas.
  //    Buscar #ERROR es el chequeo de las FÓRMULAS, y sólo eso: un rango vacío no tiene errores, así que
  //    nunca podría haber detectado que la escritura no entró. Eso ya lo probó escribirYVerificar arriba,
  //    releyendo el dato en su destino — las dos verificaciones son de efectos distintos.
  const check = await google.readSheetGrid(ID, `Compras!A${desde}:AD${hasta}`)
  let errores = 0; let sinRubro = 0
  for (const f of check.filas) {
    const val = (i) => f[i]?.valor ?? ''
    if (/#(ERROR|REF|N\/A|VALUE|¿NOMBRE|NAME)/i.test([val(0), val(14), val(28)].join(' '))) errores++
    if (!val(28)) sinRubro++
  }
  console.log(`\n✔ Escritas y VERIFICADAS en el destino ${plan.length} fila(s) (${desde}..${hasta}). ${errores ? `⚠ ${errores} con #ERROR — revisar.` : 'Sin #ERROR.'}`)
  if (sinRubro) console.log(`ℹ ${sinRubro} sin Rubro de caja (AC) todavía: se clasifican cuando completes la Unidad de Negocio (I).`)
  // FRESCURA (26/07). Cargar comprobantes a mano ES una ingesta de gastos sobre el Cash Flow: el OS
  // acaba de escribir ese Sheet. Se registra por drive_file_id (la misma fila que mantiene el
  // pipeline) para que la alerta no lo dé por atrasado. No se declara coberturaHasta: un fajo suelto
  // no define hasta qué fecha llega el gasto de la empresa — eso lo fija el sync periódico de ARCA.
  try {
    const fr = await registrarSincronizacion({ query }, { driveFileId: ID })
    console.log(fr.ok ? `✓ frescura: "${fr.nombre}" → ${fr.estado}` : `· frescura no registrada: ${fr.motivo}`)
  } catch (e) {
    console.log(`· frescura no registrada: ${String(e?.message ?? e).slice(0, 120)}`)
  }
  console.log('\nSIGUIENTE: node orquestador/scripts/sync-compras.mjs  (espeja a Supabase, regla #6).')
  await closePool()
}

// Sólo corre si se lo invoca como comando: importarlo desde un test NO dispara main() —que toca Google,
// la base y el Sheet real—, así el test puede ejercitar la escritura verificada con un cliente falso.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exitCode = 1 })
}
