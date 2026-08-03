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
// FLUJO: lee la pestaña Compras VIVA (una sola vez) → matchea proveedor contra el desplegable
// estricto → concilia contra ARCA (corrige el número mal leído) → busca el DUPLICADO en Compras →
// asegura la grilla → escribe input → estampa fórmulas → verifica (sin #ERROR, totales) → reporta.
// Después conviene: node scripts/sync-compras.mjs (→ Supabase, regla #6).
//
// ═══ LAS TRES BARRERAS SON LAS MISMAS QUE LAS DEL BOT (03/08) ═══
//
// Este script y el bot de Mattermost comparten la escritura desde el principio (el bot lo INVOCA;
// ver `comunicacion/comprobantes/escritura.mjs`), pero decidían distinto sobre tres cosas, y en las
// tres el bot era el que sabía más:
//   · el DUPLICADO contra Compras viva (`compras-vivas.mjs`) sólo lo miraba el bot — por eso Claude
//     Code cargó dos veces un tique de Combustibles Barcelo que ya estaba en la fila 800;
//   · ARCA se conciliaba acá con un índice por NÚMERO PELADO, que da falsos positivos entre dos
//     proveedores con el mismo correlativo. Ahora se usa `arca.mjs`: CAE, CUIT+fecha+total,
//     CUIT+número, con coincidencia ÚNICA obligatoria, y corrige el número leído mal;
//   · "¿qué le falta a este comprobante?" tenía dos definiciones. Ahora es una (`faltantes.mjs`) y
//     lo que difiere es la POLÍTICA. La obra era la única diferencia de negocio —acá no se exigía y
//     en el chat sí— y el dueño la resolvió el 03/08/2026 alineando el chat con este cargador:
//     ninguno la exige. La obra se OFRECE en el chat con el historial adelante, pero no bloquea.
//
//   node orquestador/scripts/cargar-comprobantes-compras.mjs --file fajo.json [--dry] [--cargar-igual]

import { readFileSync } from 'node:fs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { matchProveedor, valoresInput, aFechaAR, discrepanciaNeto, verificarEscritura, colIndice, GRUPOS_FORMULA } from '../lib/carga-comprobantes.mjs'
import { faltantesDe, puedeCargarse, POLITICA } from '../lib/comprobantes/faltantes.mjs'
import { registrarSincronizacion } from '../lib/registrar-sincronizacion.mjs'
import { perfilesDeImputacionDesdeDB, perfilesDeImputacion, sugerirImputacion } from '../lib/imputacion-aprendida.mjs'
import { indiceDeCompras, buscarEnCompras, HALLAZGO } from '../lib/comprobantes/compras-vivas.mjs'
import { conciliarConArca, aplicarArca, candidatasArca, ESTADO_ARCA } from '../lib/comprobantes/arca.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const ADD_PROV = process.argv.includes('--add-proveedores')
// "Ya lo revisé, no es el mismo: cargalo." Es el equivalente por línea de comandos del botón "Es
// otro, cargalo" del bot, y sólo levanta los PROBABLES. Una coincidencia CIERTA —mismo número y
// mismo total— no la levanta ninguna bandera: para eso habría que borrar la fila que ya está.
const CARGAR_IGUAL = process.argv.includes('--cargar-igual')
// SALIDA LEGIBLE POR OTRO PROGRAMA (`--json`). Aditiva y apagada por defecto: sin la bandera este
// script imprime exactamente lo que imprimía. Existe porque el bot de Mattermost necesita contestarle
// al dueño EN QUÉ FILA quedó cada comprobante, y sacar un número de fila parseando prosa es la clase
// de acoplamiento que se rompe el día que alguien mejora un mensaje.
const JSON_OUT = process.argv.includes('--json')
const fileArg = (process.argv.find((a) => a.startsWith('--file=')) || '').split('=')[1]
  || process.argv[process.argv.indexOf('--file') + 1]

/** Marca que delimita la línea de resultado. Todo lo demás de stdout es para una persona. */
const MARCA_JSON = '##ORQ-JSON##'
const emitir = (o) => { if (JSON_OUT) console.log(MARCA_JSON + JSON.stringify(o)) }

// El índice de columna sale de `colIndice`, no de una copia local: la verificación de la escritura
// usa la misma función, y dos definiciones de "qué número de columna es la M" es exactamente cómo
// se cuela un desfasaje que nadie ve hasta que escribe en la columna de al lado.
const idx = colIndice // 'A'->0, 'AA'->26

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
  // El freno de mano y el candado se arreglan de formas distintas —uno lo levanta el dueño para toda
  // la sesión, el otro es por pestaña—, así que quien consuma esto tiene que poder distinguirlos sin
  // leer prosa. Sin este campo, el bot le decía "pestaña candada" a un Sheet congelado.
  return { ok: false, congelado: respuesta?.congelado === true, motivo: porQueNoEntro(respuesta, Boolean(leido)), ...v, respuesta }
}

/** Concilia contra el padrón. MUTA el comprobante: le corrige el número, el CUIT y el CAE. */
async function conciliar(cc, arcaDe) {
  if (typeof arcaDe !== 'function') return { estado: ESTADO_ARCA.NO_VERIFICADO }
  try {
    return aplicarArca(cc, conciliarConArca(cc, (await arcaDe(cc)) ?? []))
  } catch {
    // Que el padrón no conteste no puede frenar una carga: se declara y se sigue.
    return { estado: ESTADO_ARCA.NO_VERIFICADO }
  }
}

/**
 * UN comprobante del fajo → el ítem con todo lo que se sabe de él. Es el mismo orden que usa el bot
 * (`comunicacion/comprobantes/flujo.mjs`) y ese orden ES el arreglo: ARCA corrige el número ANTES de
 * buscar el duplicado, porque el duplicado se busca justamente por número.
 *
 * @returns {Promise<{item:object, arca:object, prov:object, hallazgo:object|null}>}
 */
export async function prepararUno(c = {}, { lista = [], indiceCompras = null, arcaDe = null, cargarIgual = false } = {}) {
  const prov = matchProveedor(c.proveedor, lista)
  // La fecha se canoniza ANTES que nada: ARCA la exige en DD/MM/AAAA y el índice de Compras compara
  // contra ese mismo formato. Un "5/1/2026" sin normalizar no matchea nada y el duplicado pasa.
  const cc = { ...c, proveedor: prov.valor, fecha: aFechaAR(c.fecha) ?? c.fecha ?? null }
  const arca = await conciliar(cc, arcaDe)
  const hallazgo = indiceCompras?.ok === false ? null : buscarEnCompras(cc, indiceCompras ?? {})
  const item = {
    comprobante: cc,
    proveedorNuevo: prov.esNuevo === true,
    // La resolución puede venir en el propio fajo (el botón "Es otro, cargalo" del bot) o de la
    // bandera. Las dos dicen lo mismo: una persona ya miró la fila candidata.
    duplicadoResuelto: c.duplicadoResuelto ?? (cargarIgual ? 'otro' : null),
  }
  if (hallazgo?.que === HALLAZGO.CARGADO) item.yaCargado = hallazgo
  else if (hallazgo?.que === HALLAZGO.PROBABLE) item.posibleDuplicado = hallazgo
  return { item, arca, prov, hallazgo }
}

/**
 * El fajo de entrada → el plan de filas a escribir, y todo lo que NO se escribe con su razón.
 *
 * NO TOCA LA RED por su cuenta: la pestaña ya viene leída y ARCA entra por `arcaDe`. Exportada para
 * poder probar las tres barreras —duplicado, ARCA y qué le falta— sin Google, sin Postgres y sin
 * escribir una celda.
 */
export async function prepararPlan(comprobantes = [], o = {}) {
  const { perfiles = null } = o
  const plan = []; const rechazos = []; const duplicados = []; const percep = []
  const nuevos = new Set(); const arca = { coinciden: 0, corregidos: 0 }
  for (const [i, c] of comprobantes.entries()) {
    const { item, arca: bloque, prov } = await prepararUno(c, o)
    const cc = item.comprobante
    if (bloque.estado === ESTADO_ARCA.COINCIDE) { arca.coinciden++; if (bloque.numeroLeido) arca.corregidos++ }
    // UN DUPLICADO NO ES UN PROBLEMA DE DATOS: se informa aparte para que no se lea como un
    // comprobante ilegible. Es la barrera más cara de las tres — la que evita contar un gasto dos
    // veces en el Flujo de Fondos, donde se propaga solo por fórmula a cuatro pestañas más.
    if (item.yaCargado || (item.posibleDuplicado && !item.duplicadoResuelto)) {
      const h = item.yaCargado ?? item.posibleDuplicado
      duplicados.push({ i, cierto: Boolean(item.yaCargado), fila: h.fila, via: h.via ?? null, proveedor: cc.proveedor, numero: cc.numero ?? null })
      continue
    }
    const problemas = faltantesDe(item, POLITICA.CARGADOR).map((f) => f.texto)
    if (problemas.length || !puedeCargarse(item, POLITICA.CARGADOR)) {
      rechazos.push({ i, proveedor: c.proveedor, problemas })
      continue
    }
    if (prov.esNuevo) nuevos.add(prov.valor)
    const dif = discrepanciaNeto(cc)
    if (dif) percep.push({ i, proveedor: prov.valor, dif })
    // SUGERENCIA de imputación (F8): aparece para que el dueño la vea; NO cambia lo que se escribe.
    // Sólo si el comprobante no trae la imputación explícita (no pisamos lo que el dueño ya anotó).
    const sug = perfiles && !cc.unidad && !cc.obra
      ? sugerirImputacion({ proveedor: prov.valor, concepto: cc.concepto, monto: cc.total ?? cc.neto }, perfiles)
      : null
    // `i` = índice del comprobante en el fajo de ENTRADA. Va en el plan porque los rechazados no
    // ocupan fila: sin él, quien llama no puede saber a qué comprobante suyo corresponde cada fila.
    plan.push({ i, valores: valoresInput(cc), nuevo: prov.esNuevo, proveedor: prov.valor, sug })
  }
  // `revisadoContraCompras` viaja porque no poder mirar la pestaña NO es "no está cargado", y las dos
  // cosas se ven iguales si nadie las distingue. Quien informe esto tiene que poder decir cuál fue.
  return { plan, rechazos, duplicados, percep, nuevos: [...nuevos], arca, revisadoContraCompras: o.indiceCompras?.ok === true }
}

/** Lo que se decidió, para una persona. No decide nada: sólo cuenta lo que ya se decidió. */
function informar({ plan, rechazos, duplicados, percep, nuevos, arca }, { ultima, desde, hasta, indiceCompras, perfiles }) {
  console.log(`Compras: última fila con datos = ${ultima}. Se cargan ${plan.length} comprobante(s) → filas ${desde}..${hasta}.`)
  // NO PODER MIRAR COMPRAS NO ES "NO ESTÁ CARGADO". Si se callara, una corrida ciega y una corrida
  // verificada se verían iguales — y la ciega es justo la que puede duplicar un gasto.
  if (!indiceCompras?.ok) console.log(`\n⚠ NO pude leer la pestaña Compras para buscar duplicados (${indiceCompras?.error ?? 'sin detalle'}). No afirmo que estos comprobantes no estén ya cargados.`)
  if (duplicados.length) {
    console.log(`\n⛔ ${duplicados.length} NO se cargan porque YA ESTÁN en Compras:`)
    duplicados.forEach((d) => console.log(`   #${d.i} ${d.proveedor || '(sin proveedor)'} ${d.numero ?? ''} → fila ${d.fila}${d.cierto ? '' : ' (PROBABLE)'} [${d.via ?? 'sin vía'}]`))
    if (duplicados.some((d) => !d.cierto)) console.log('   Los PROBABLES: si ya los miraste y no son el mismo, volvé a correr con --cargar-igual.')
  }
  if (rechazos.length) { console.log(`\n⚠ ${rechazos.length} NO se cargan (dato insuficiente, no se inventa):`); rechazos.forEach((r) => console.log(`   #${r.i} ${r.proveedor || '(sin proveedor)'}: ${r.problemas.join('; ')}`)) }
  if (nuevos.length) console.log(`\n⚠ Proveedores NUEVOS (no están en el desplegable estricto — confirmá antes de fijarlos): ${nuevos.join(' · ')}`)
  if (percep.length) console.log(`\nℹ Percepción/impuesto interno absorbido en Importe (M = Total − IVA, para que el Total cierre): ${percep.map((p) => `${p.proveedor} (+$${Math.round(p.dif).toLocaleString('es-AR')})`).join(' · ')}`)
  // QUE ESTÉ EN ARCA NO ES UN DUPLICADO: toda factura electrónica recibida está en el padrón.
  // Encontrarla ahí prueba que existe y da su número VERDADERO. El duplicado se busca en Compras.
  if (arca.coinciden) console.log(`\nℹ ARCA: ${arca.coinciden} conciliado(s) contra el padrón${arca.corregidos ? ` — ${arca.corregidos} con el número corregido por el del libro fiscal` : ''}.`)
  informarImputacion(plan, perfiles)
}

/**
 * SUGERENCIA DE IMPUTACIÓN (F8) — el OS SUGIERE, el dueño CONFIRMA. Nunca imputa solo: estas filas se
 * escriben con Unidad/Obra VACÍAS igual que siempre (las completa el dueño, y ahí el rubro
 * reclasifica). Acá sólo se muestra qué imputó históricamente a proveedores parecidos, para que
 * complete más rápido y corrija si hace falta — esa corrección re-alimenta el aprendizaje.
 */
function informarImputacion(plan, perfiles) {
  const conSug = plan.filter((p) => p.sug)
  if (!perfiles?.disponible) {
    console.log('\nℹ Imputación aprendida: sin historia espejada todavía (public.costos_obra). La máquina mide; la historia recién arranca.')
    return
  }
  if (!conSug.length) return
  console.log('\n💡 Sugerencia de imputación (aprendida de cómo imputaste comprobantes parecidos — SUGIERE, no impone; completá/corregí vos):')
  for (const p of conSug) {
    const s = p.sug
    const dim = (d) => d.sugerido ? `${d.sugerido}${d.pide_confirmacion ? ' (?)' : ' ✓'}` : '—'
    console.log(`   ${p.proveedor}: unidad ${dim(s.unidad)} · obra ${dim(s.obra)} · detalle ${dim(s.detalle ?? {})} · rubro ${dim(s.rubro)}  [${s.pide_confirmacion ? 'confirmá' : 'alta confianza'}]`)
    console.log(`      ↳ ${s.nota}`)
  }
  console.log('   (✓ = alta confianza · (?) = necesita tu confirmación)')
}

/**
 * Los perfiles de imputación de la fuente más completa que haya. PRIMERO la pestaña viva —trae el
 * detalle de la columna K separado del concepto y también las filas sin obra—, después el espejo
 * `public.costos_obra`. Los dos entran por la MISMA función pura: no hay dos formas de aprender.
 */
async function perfilesDe(indiceCompras) {
  if (indiceCompras?.ok && indiceCompras.historia?.length) {
    return { ...perfilesDeImputacion(indiceCompras.historia), disponible: true, nota: `${indiceCompras.filas} filas de Compras (pestaña viva)` }
  }
  return perfilesDeImputacionDesdeDB({ query }).catch(() => null)
}

async function main() {
  if (!fileArg) { console.error('Falta --file <fajo.json> (array de comprobantes parseados de las fotos)'); process.exit(1) }
  const comprobantes = JSON.parse(readFileSync(fileArg, 'utf8'))
  if (!Array.isArray(comprobantes) || !comprobantes.length) { console.error('El JSON tiene que ser un array de comprobantes no vacío'); process.exit(1) }

  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === 'Compras')
  // UNA SOLA LECTURA DE LA PESTAÑA VIVA alimenta las dos cosas que hacen falta: el índice contra el
  // que se busca el duplicado y la historia con la que `imputacion-aprendida.mjs` sugiere la
  // imputación. Ya se leía para lo segundo; lo primero es lo que faltaba y no cuesta una consulta más.
  const [lista, colE, indiceCompras] = await Promise.all([
    listaProveedores(google), google.readSheetValues(ID, 'Compras!E1:E'), indiceDeCompras(google, { fileId: ID }),
  ])
  const perfiles = await perfilesDe(indiceCompras)
  let ultima = 0
  colE.forEach((r, i) => { if (r[0] != null && r[0] !== '') ultima = i + 1 })

  const { plan, rechazos, duplicados, percep, nuevos, arca } = await prepararPlan(comprobantes, {
    lista, indiceCompras, perfiles, cargarIgual: CARGAR_IGUAL,
    arcaDe: (c) => candidatasArca({ query }, c),
  })

  const desde = ultima + 1
  const hasta = ultima + plan.length
  informar({ plan, rechazos, duplicados, percep, nuevos, arca }, { ultima, desde, hasta, indiceCompras, perfiles })
  if (!plan.length) {
    console.log('\nNada cargable.')
    // `duplicados` viaja: para quien llama no es lo mismo "no se pudo leer" que "ya estaba cargado".
    emitir({ ok: false, motivo: duplicados.length && !rechazos.length ? 'ya_cargados' : 'nada_cargable', escritas: 0, rechazos, duplicados, nuevos })
    await closePool(); return
  }

  if (DRY) {
    console.log('\n(--dry) Muestra de la primera fila a escribir:')
    console.log('  ', JSON.stringify(plan[0].valores))
    console.log(`  Fórmulas a estampar por copyPaste desde la fila ${ultima}: ${GRUPOS_FORMULA.map((g) => g[0] === g[1] ? g[0] : g.join(':')).join(' ')}`)
    emitir({ ok: true, dry: true, desde, hasta, escritas: 0, filas: plan.map((p, k) => ({ i: p.i, fila: desde + k, proveedor: p.proveedor })), rechazos, duplicados, nuevos })
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
  // NO ALCANZA CON MIRAR LO QUE DEVUELVE LA API. La escritura puede no ocurrir sin lanzar una
  // excepción: el freno de mano, el candado de pestaña y la firma devuelven `{protegido:true}` y el
  // script seguía derecho hasta imprimir "✔ Escritas N filas" sobre un Sheet que no se tocó. Por eso
  // `escribirYVerificar` RELEE el destino y compara celda por celda: la evidencia es el dato leído
  // donde tenía que quedar, nunca la pantalla que contestó que sí.
  const escritura = await escribirYVerificar(google, { desde, hasta, plan })
  if (!escritura.ok) {
    console.error(`\n✖ NO se escribió lo que pedí: ${escritura.motivo}`)
    for (const v of escritura.vacias.slice(0, 10)) console.error(`   fila ${v.fila} col ${v.columna}: quedó VACÍA (esperaba "${v.esperado}")`)
    for (const d of escritura.distintas.slice(0, 10)) console.error(`   fila ${d.fila} col ${d.columna}: dice "${d.encontrado}", esperaba "${d.esperado}"`)
    console.error('   No estampo fórmulas sobre filas que no tienen datos. Nada quedó a medias: revisá el candado/firma de "Compras" y volvé a correr.')
    // El bot de Mattermost consume esta línea: sin ella tendría que adivinar el resultado parseando
    // prosa, y un mensaje mejorado le rompería la lectura.
    emitir({
      ok: false,
      motivo: escritura.congelado ? 'congelado' : 'protegido',
      congelado: escritura.congelado === true,
      detalle: String(escritura.motivo ?? '').slice(0, 300),
      escritas: 0,
    })
    process.exitCode = escritura.congelado ? 2 : 1
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
  emitir({
    ok: true, desde, hasta, escritas: plan.length, errores, sinRubro,
    filas: plan.map((p, k) => ({ i: p.i, fila: desde + k, proveedor: p.proveedor })),
    rechazos, nuevos, duplicados, arca,
  })
  console.log('\nSIGUIENTE: node orquestador/scripts/sync-compras.mjs  (espeja a Supabase, regla #6).')
  await closePool()
}

// Sólo corre si se lo invoca como comando: importarlo desde un test NO dispara main() —que toca Google,
// la base y el Sheet real—, así el test puede ejercitar la escritura verificada con un cliente falso.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exitCode = 1 })
}
