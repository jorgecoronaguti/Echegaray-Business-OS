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
import { matchProveedor, valoresInput, validar, discrepanciaNeto, GRUPOS_FORMULA } from '../lib/carga-comprobantes.mjs'
import { bloquear, desbloquear } from '../lib/pestana-bloqueada.mjs'
import { registrarSincronizacion } from '../lib/registrar-sincronizacion.mjs'
import { perfilesDeImputacionDesdeDB, sugerirImputacion } from '../lib/imputacion-aprendida.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const ADD_PROV = process.argv.includes('--add-proveedores')
// --forzar-candado: intención explícita del dueño para cargar sobre una "Compras" candada. Deja snapshot,
// destraba, escribe con yaGuardado y vuelve a candar siempre. Sin esto, si el portón descarta, se corta.
const FORZAR = process.argv.includes('--forzar-candado')
const fileArg = (process.argv.find((a) => a.startsWith('--file=')) || '').split('=')[1]
  || process.argv[process.argv.indexOf('--file') + 1]

const idx = (l) => { let c = 0; for (const ch of l) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1 } // 'A'->0, 'AA'->26

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
  // ═══ EL PORTÓN Y LA PESTAÑA CANDADA (31/07) ═══
  //
  // "Compras" está candada desde el 25/07 por un candado AUTOMÁTICO ("sin baseline y una persona tocó
  // el archivo: la tomo como tuya"). El portón de escritura es ASIMÉTRICO: deja pasar la ESTRUCTURA y
  // DESCARTA EL CONTENIDO. Resultado medido hoy al cargar la factura de Gruas San Blas: las fórmulas se
  // estamparon en la fila 796, los datos NO, y el script igual imprimió "✔ Escritas 1 fila(s). Sin
  // #ERROR." — porque su verificación sólo buscaba textos de error, y una fila vacía no tiene ninguno.
  // Un log que miente es peor que un error: la factura quedaba por cargada y no estaba.
  //
  // Con --forzar-candado el dueño declara la intención: snapshot, se destraba, se escribe con
  // yaGuardado (la misma figura que usan cash-flow-encabezados y caja-cartera-viva), y se vuelve a
  // candar SIEMPRE, pase lo que pase. Sin la bandera, si el portón descarta, se dice y se corta.
  const deps = { query }
  if (FORZAR) {
    const { tomarSnapshot } = await import('../lib/sheet-snapshot.mjs')
    console.log(`\nsnapshot → ${await tomarSnapshot({ google, fileId: ID, pestana: 'Compras', tool: 'cargar-comprobantes-compras', directive: `cargar ${plan.length} comprobante(s) sobre una pestaña candada, por pedido explícito` }) ?? 'no se pudo'}`)
    await desbloquear(deps, ID, 'Compras')
  }
  try {
    const res = await google.batchUpdateValues(ID, data, FORZAR ? { yaGuardado: true } : {})
    if (res?.protegido) {
      throw new Error('el portón descartó el CONTENIDO: "Compras" está candada o la editaste. Las fórmulas pueden haberse estampado, pero los datos NO se escribieron. Repetilo con --forzar-candado si querés cargarlo igual (deja snapshot y vuelve a candar).')
    }
  } catch (e) {
    if (FORZAR) await bloquear(deps, ID, 'Compras', { motivo: 'el dueño edita — re-candada tras una carga de comprobantes que falló', por: 'OS' })
    throw e
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
  // CON --forzar-candado LAS FÓRMULAS TAMBIÉN TIENEN QUE PASAR (31/07). Si sólo pasan los valores, la
  // fila nueva se queda con las fórmulas que ya hubiera en la cola de la pestaña — y la cola de este
  // archivo estaba PODRIDA: las filas 796 a 800 tenían `IF(#REF!<TODAY())` en la columna Z en vez de
  // `IF(Q796<TODAY())`. El error estaba LATENTE porque en una fila vacía el IF exterior corta antes de
  // evaluar el #REF!; apareció recién cuando la fila 796 tuvo datos. El copyPaste desde la última fila
  // con datos es justamente lo que cura eso, así que no puede quedar afuera del permiso.
  try {
    await google.spreadsheetBatchUpdate(ID, reqs, FORZAR ? { yaGuardado: true } : {})
  } catch (e) {
    if (!/filtered out row/i.test(String(e?.message ?? e))) throw e
    const g = await google.readSheetGrid(ID, `Compras!O${desde}:O${hasta}`)
    const todasConFormula = g.filas.length === plan.length && g.filas.every((f) => f[0]?.formula)
    if (!todasConFormula) throw new Error('hay un filtro activo en Compras y la fórmula de Total (O) no se auto-extendió a todas las filas nuevas — quitá el filtro y volvé a correr')
    console.log('ℹ Compras tiene un filtro activo: copyPaste no aplica sobre filas filtradas, pero Google auto-extendió las fórmulas por fila (verificado en la columna O = Total). No se tocó tu filtro.')
  }

  // 3) VERIFICAR: releer id (A), total (O) y rubro de caja (AC) de las filas nuevas.
  //
  // LA VERIFICACIÓN MIRA QUE EL DATO ESTÉ, NO SÓLO QUE NO HAYA ERRORES (31/07). Antes contaba #ERROR y
  // nada más: con el portón descartando el contenido, la fila quedaba VACÍA —sin un solo error— y esto
  // felicitaba con "✔ Escritas 1 fila(s). Sin #ERROR.". Ahora se comprueba lo que importa: que el
  // proveedor esté escrito y que el Total de la fila sea el del comprobante, al centavo. Un cargador que
  // no puede demostrar que cargó no sirve para cargar plata.
  if (FORZAR) await bloquear(deps, ID, 'Compras', { motivo: 'el dueño edita — re-candada tras cargar comprobantes', por: 'OS' })
  const check = await google.readSheetGrid(ID, `Compras!A${desde}:AD${hasta}`)
  let errores = 0; let sinRubro = 0; const vacias = []; const totalMal = []
  for (const [i, f] of check.filas.entries()) {
    const val = (j) => f[j]?.valor ?? ''
    if (/#(ERROR|REF|N\/A|VALUE|¿NOMBRE|NAME)/i.test([val(0), val(14), val(28)].join(' '))) errores++
    if (!val(28)) sinRubro++
    const esperado = plan[i]?.valores?.M != null ? Number(plan[i].valores.M) + Number(plan[i].valores.N ?? 0) : null
    const leidoTotal = Number(String(val(14)).toString().replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'))
    if (!String(val(4)).trim()) vacias.push(desde + i)
    else if (esperado != null && Number.isFinite(leidoTotal) && Math.abs(leidoTotal - esperado) > 0.02) totalMal.push({ fila: desde + i, esperado, leido: leidoTotal })
  }
  if (vacias.length) {
    console.error(`\n⚠ NO SE ESCRIBIÓ: ${vacias.length} de ${plan.length} fila(s) quedaron VACÍAS (${vacias.join(', ')}).`)
    console.error('   Las fórmulas pueden estar estampadas, pero el comprobante NO está cargado.')
    console.error('   Causa habitual: "Compras" candada y el portón descarta el contenido → repetí con --forzar-candado.')
    process.exitCode = 1
    await closePool(); return
  }
  if (totalMal.length) {
    console.error(`\n⚠ El Total de ${totalMal.length} fila(s) no coincide con el comprobante:`)
    for (const t of totalMal) console.error(`   fila ${t.fila}: esperaba ${t.esperado} y el Sheet dice ${t.leido}`)
    process.exitCode = 1
  }
  console.log(`\n✔ Escritas ${plan.length} fila(s) — verificado: proveedor y Total leídos del Sheet. ${errores ? `⚠ ${errores} con #ERROR — revisar.` : 'Sin #ERROR.'}`)
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

main().catch((e) => { console.error(e); process.exitCode = 1 })
