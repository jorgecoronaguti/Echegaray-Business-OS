#!/usr/bin/env node
// LAS DOS VISTAS DE CASH FLOW, COMO MATRIZ — el que escribe.
//
// ═══ QUÉ CAMBIÓ (06/08/2026) ═══
//
// Las dos pestañas dejan de ser bloques verticales y vuelven a ser lo que un cash flow es en cualquier
// empresa: **una fila por concepto, el tiempo a la derecha**. El diseño vive en lib/cash-flow-semanas.mjs
// (13 semanas) y lib/cash-flow-meses.mjs (12 meses); acá está sólo lo que toca la red.
//
// UNA PESTAÑA, UN ESCRITOR. `cash-flow-rehacer.mjs` —la matriz de 51 columnas de julio— queda como
// módulo (sus funciones puras las siguen usando otros tests) pero NO corre en el pipeline: dos
// escritores sobre una misma pestaña producen el candado falso (el que escribe último sella la firma
// y el otro se auto-canda en la corrida siguiente).
//
// LA HOJA SE ACHICA. Venían de 220×65 y 220×62 para mostrar 15 columnas: el resto era zona auxiliar
// oculta y el ancla de los gráficos. Ahora el footprint es el de la matriz y lo que sobra se BORRA —
// después de escribir, que es cuando ya se sabe que la firma dio permiso.
//
//   node orquestador/scripts/cash-flow-vistas.mjs [--dry]

import { pathToFileURL } from 'node:url'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { ref as refPestana } from '../lib/partir-pestana.mjs'
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { publicar } from '../lib/rangos-nombrados.mjs'
import { CAJA as N_CAJA } from '../lib/rangos-nombrados.mjs'
import { DESDE_CAJA } from '../lib/caja-anexo-nombres.mjs'
import { rectangulo, letra } from '../lib/cash-flow-matriz.mjs'
import { requestsDePliegue, rangoEnLetras } from '../lib/cash-flow-hoy.mjs'
import { cuadre, guardaDeCobertura, linea, totalesDeVista } from '../lib/cash-flow-cuadre.mjs'
import { auditarCuadreCobranzas, informe } from '../lib/cobranzas-cuadre-vivo.mjs'
// El nombre de cada pestaña ya viene en su `meta`: importarlo suelto era una segunda forma de decir lo
// mismo, y la que se olvida de cambiar el día que una pestaña se renombra.
import { grillaSemanal } from '../lib/cash-flow-semanas.mjs'
import { grillaMeses, destinosNombrados } from '../lib/cash-flow-meses.mjs'
import {
  grillaPresupuesto, rescatarPresupuesto, formatoPresupuesto,
  PESTANA_PRESUPUESTO, ANCHO_PRESUPUESTO,
} from '../lib/cash-flow-presupuesto.mjs'
import {
  pielMatriz, reglasCondicionales, borrarCondicionales, achicarHoja, tandasDeGrupos,
} from '../lib/cash-flow-piel-matriz.mjs'
import { requestsDeGraficosMatriz } from '../lib/cash-flow-graficos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const AÑO = Number(process.env.ORQ_CF_ANIO || 2026)

/**
 * Los rangos con nombre de CAJA que las vistas necesitan. Si no existen todavía, se devuelve null y la
 * vista lo DICE en vez de referenciar una celda inventada — un ancla mal apuntada es un cuadro entero
 * mintiendo con cara de correcto.
 */
async function refsDeCaja(google) {
  const nombres = await google.getNamedRanges(ID).catch(() => [])
  const hay = (n) => (nombres.some((x) => x.name === n) ? n : null)
  const refs = { saldo: hay(N_CAJA.total), fecha: hay(N_CAJA.fecha), minima: hay(DESDE_CAJA.minima) }
  for (const [k, v] of Object.entries(refs)) if (!v) console.warn(`  ⚠ falta el rango con nombre de ${k}: la vista lo va a declarar vacío`)
  return refs
}

/**
 * NÚCLEO PURO: qué propiedades de tamaño le faltan a una hoja para alojar el footprint. `{}` = ninguna.
 *
 * Sólo AGRANDA: el achique va después de escribir, cuando ya se sabe que la firma dio permiso.
 */
export function tamanoQueFalta(hoja, { filas, cols }) {
  const props = {}
  if ((hoja?.rows ?? 0) < filas) props.rowCount = filas
  if ((hoja?.cols ?? 0) < cols) props.columnCount = cols
  return props
}

/**
 * Asegura que la pestaña exista y tenga sitio para lo que se va a escribir.
 *
 * ═══ `--dry` NO ESCRIBE NADA, Y ESTO ERA UNA GOTERA (06/08/2026) ═══
 *
 * El `--dry` cortaba antes de la grilla pero NO antes de esta función: si la pestaña existía y era más
 * chica que el footprint, agrandarla era un `spreadsheetBatchUpdate` contra el archivo real. Medido en
 * vivo: una corrida `--dry` desde un worktree llevó las dos pestañas de 34×15 y 50×14 a 71×55 y 73×14.
 * Es aditivo —filas y columnas vacías, sin contenido ni formato— pero es una escritura, y un `--dry`
 * que escribe es un `--dry` que no sirve para decidir si escribir.
 */
async function asegurarHoja(google, titulo, { filas, cols }) {
  // `hallarPestana` TIRA cuando la pestaña no existe — no devuelve null. En el arranque en frío eso
  // rompía el --dry y habría roto la corrida real.
  const buscar = (hojas) => { try { return hallarPestana(hojas, titulo) } catch { return null } }
  let hoja = buscar(await google.getSheetMeta(ID))
  if (!hoja && DRY) { console.log(`  ✚ (--dry) la pestaña ${titulo} no existe: se crearía en la corrida real`); return null }
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{
      addSheet: { properties: { title: titulo, gridProperties: { rowCount: filas, columnCount: cols, frozenRowCount: 2 } } },
    }])
    hoja = buscar(await google.getSheetMeta(ID))
    console.log(`  ✚ creé la pestaña ${titulo}`)
    return hoja
  }
  const props = tamanoQueFalta(hoja, { filas, cols })
  if (Object.keys(props).length && DRY) {
    console.log(`  ✚ (--dry) ${titulo} pasaría de ${hoja.rows}×${hoja.cols} a ${filas}×${cols}`)
    return hoja
  }
  if (Object.keys(props).length) {
    await google.spreadsheetBatchUpdate(ID, [{
      updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: props }, fields: Object.keys(props).map((k) => `gridProperties.${k}`).join(',') },
    }])
    hoja = buscar(await google.getSheetMeta(ID))
  }
  return hoja
}

/**
 * VACÍA LOS GRUPOS DE FILAS Y COLUMNAS HEREDADOS — uno por vez, cortando en el primer error.
 *
 * ═══ EL DEFECTO QUE ESTO CIERRA (06/08/2026) ═══
 *
 * El layout anterior dejó un grupo de filas colapsado y el Mensual amaneció con las filas 8 a 13
 * invisibles: la matriz entera tapada, sin un solo error, con el generador escribiéndola y
 * formateándola cada dos horas sobre celdas que nadie veía. Se limpió a mano una vez; esto lo
 * garantiza en cada corrida.
 *
 * VA REQUEST POR REQUEST, NO EN LOTE: borrar un grupo que no existe devuelve 400, y un 400 dentro de
 * un `batchUpdate` tumba el lote entero. El primer error de una dimensión significa "ya no quedan".
 */
async function borrarGruposHeredados(google, sheetId, footprint, pestana) {
  let borrados = 0
  for (const tanda of tandasDeGrupos(sheetId, footprint)) {
    for (const request of tanda) {
      try { await google.spreadsheetBatchUpdate(ID, [request]); borrados++ } catch { break }
    }
  }
  if (borrados) console.log(`  ⌄ ${pestana}: ${borrados} grupo(s) de filas/columnas heredado(s) borrado(s)`)
  return borrados
}

/**
 * LA PESTAÑA DE CARGA DEL PRESUPUESTO. Se rescata lo tipeado ANTES de escribir y se vuelve a poner:
 * doble seguro sobre la fusión, porque acá lo que se puede perder es trabajo de una persona.
 */
async function rehacerPresupuesto(google) {
  const hoja = await asegurarHoja(google, PESTANA_PRESUPUESTO, { filas: 40, cols: ANCHO_PRESUPUESTO })
  if (!hoja && DRY) { console.log(`${PESTANA_PRESUPUESTO}: se crearía vacía · 0/12 meses con presupuesto cargado`); return { cargados: 0, hoja: null } }
  // Sin `UNFORMATTED_VALUE` un importe cargado vuelve como "$ 1.234" (texto) y se re-escribiría como
  // texto. `mesDeCelda` acepta las dos formas de la columna A justamente porque de esto depende no
  // perder lo cargado.
  const actual = await google.readSheetValues(ID, `${PESTANA_PRESUPUESTO}!A1:${letra(ANCHO_PRESUPUESTO - 1)}40`, { render: 'UNFORMATTED_VALUE' })
    .catch((e) => { throw new Error(`no pude leer "${PESTANA_PRESUPUESTO}" (${e.message}). NO escribo: sin esa lectura se pierde lo cargado.`) })
  const cargado = rescatarPresupuesto(actual)
  const { filas, destinos, cargados } = grillaPresupuesto({ anio: AÑO, cargado })
  console.log(`${PESTANA_PRESUPUESTO}: ${filas.length} filas · ${cargados}/12 meses con presupuesto cargado`)
  if (DRY) return { cargados, hoja }
  const escritura = await escribirPreservando(google, ID, refPestana(PESTANA_PRESUPUESTO), filas, { anchoHoja: ANCHO_PRESUPUESTO })
  if (escritura?.bloqueada || escritura?.editadaPorHumano || escritura?.noVerificable) {
    console.log(`  🔒 "${PESTANA_PRESUPUESTO}" bajo tu control: no escribí, no le toco el formato ni sus rangos con nombre.`)
    return { cargados, hoja }
  }
  await google.spreadsheetBatchUpdate(ID, formatoPresupuesto(hoja.sheetId, { filas: filas.length }))
  const { malApuntados } = await publicar(google, ID, hoja.sheetId, destinos, { titulo: PESTANA_PRESUPUESTO })
  for (const m of malApuntados) console.warn(`  ⚠ ${m.name} promete ${m.espera} y encontró ${m.encontro}`)
  console.log(`  🔖 ${destinos.length} rangos con nombre publicados`)
  return { cargados, hoja }
}

/**
 * Escribe una vista: valores con la Regla 0, gráficos viejos, tamaño, formato, gráficos nuevos.
 *
 * EL ORDEN NO ES INDISTINTO. Los gráficos viejos se borran ANTES de achicar la hoja porque están
 * anclados en la columna 59 del diseño anterior; el formato va DESPUÉS de achicar para no pintar
 * columnas que ya no existen; y los gráficos nuevos van en su PROPIO lote, porque un addChart que
 * falle no puede tirarse abajo el formato de la pestaña entera.
 *
 * Devuelve la hoja y si de verdad se escribió: una pestaña que NO se escribió no cambió de forma, así
 * que tampoco se le tocan el formato, el tamaño ni sus rangos con nombre.
 */
async function escribirVista(google, construir, footprint, refs, nombresDe = null) {
  const previa = construir(null)
  const hoja = await asegurarHoja(google, previa.meta.pestana, footprint)
  // El vínculo "📅 hoy" necesita el gid de la propia pestaña: se construye de nuevo con él ya sabido.
  const { filas, meta } = construir(hoja?.sheetId ?? null)
  const grid = rectangulo(filas, VACIO, { alto: footprint.filas, ancho: footprint.cols })
  console.log(`${meta.pestana}: ${meta.filaFin} filas de contenido en un footprint de ${grid.length}×${grid[0].length}`)
  if (DRY) {
    for (const f of filas.slice(0, 16)) console.log('  ', (f || []).slice(0, 3).map((x) => String(x ?? '').slice(0, 52)).join(' | '))
    return { hoja, escrito: false }
  }
  const actual = await google.readSheetValues(ID, `${meta.pestana}!A1:${letra(footprint.cols - 1)}${footprint.filas}`)
    .catch((e) => { throw new Error(`no pude leer "${meta.pestana}" (${e.message}). NO escribo: sin esa lectura la Regla 0 decide a ciegas.`) })
  const { grid: fusionada, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, meta.pestana, grid, actual)
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${String(r.suyo).slice(0, 44)}")`)
  const escritura = await escribirPreservando(google, ID, refPestana(meta.pestana), fusionada, {
    anchoHoja: footprint.cols, respetar: false, // la Regla 0 ya se aplicó arriba, sobre la grilla entera
  })
  if (escritura?.bloqueada || escritura?.editadaPorHumano || escritura?.noVerificable) {
    console.log(`  🔒 "${meta.pestana}" bajo tu control: no escribí, y NO le toco el formato ni los gráficos.`)
    return { hoja, escrito: false }
  }
  await guardarRegistro(ID, meta.pestana, fusionada, ediciones, actual, candidatos)
    .catch((e) => console.warn(`  ⚠ ${meta.pestana}: no pude guardar el registro de rótulos: ${e.message}`))

  // ── LOS NOMBRES SE PUBLICAN ANTES DE ACHICAR (06/08, pagado en vivo) ──
  //
  // El achique borró las columnas donde vivían CF_SALDO_INICIO/CF_SALDO_CIERRE y Google los dejó
  // QUEMADOS: el GET no los proyecta pero el nombre sigue reservado — el add da 400 para siempre.
  // Publicando primero, el nombre ya apunta a la matriz nueva cuando las columnas viejas mueren.
  const destinos = nombresDe ? nombresDe(meta) : []
  if (destinos.length) {
    await publicar(google, ID, hoja.sheetId, destinos, { titulo: meta.pestana })
    console.log(`  🔖 ${destinos.length} rango(s) con nombre publicados en ${meta.pestana}`)
  }

  const graficos = await requestsDeGraficosMatriz(google, ID, hoja.sheetId, meta, meta.pestana)
  if (graficos.borrar.length) {
    await google.spreadsheetBatchUpdate(ID, graficos.borrar)
      .catch((e) => console.warn(`  ⚠ ${meta.pestana}: no pude borrar los gráficos viejos (${e.message})`))
  }

  // ── La hoja al tamaño del cuadro ────────────────────────────────────────────────────────────────
  const sobra = achicarHoja(hoja.sheetId, { filas: hoja.rows ?? 0, cols: hoja.cols ?? 0 }, footprint)
  if (sobra.length) {
    await google.spreadsheetBatchUpdate(ID, sobra)
      .catch((e) => console.warn(`  ⚠ ${meta.pestana}: no pude achicar la hoja (${e.message})`))
    console.log(`  ✂ ${meta.pestana}: la hoja pasa de ${hoja.rows}×${hoja.cols} a ${footprint.filas}×${footprint.cols}`)
  }

  // ── Los grupos heredados, vaciados ANTES de formatear ──
  await borrarGruposHeredados(google, hoja.sheetId, footprint, meta.pestana)

  // ── El formato, con las reglas condicionales borradas ANTES de re-crearse ──
  const cf = await google.getConditionalFormats(ID).catch(() => [])
  const cuantas = cf.find((c) => c.sheetId === hoja.sheetId)?.reglas ?? 0
  await google.spreadsheetBatchUpdate(ID, [
    ...borrarCondicionales(hoja.sheetId, cuantas),
    ...pielMatriz({ sheetId: hoja.sheetId, meta }),
    ...reglasCondicionales({ sheetId: hoja.sheetId, meta, refMinima: refs.minima }),
  ])
  console.log(`  🎨 formato aplicado · ${cuantas} regla(s) condicional(es) vieja(s) borrada(s)`)

  if (graficos.dibujar.length) {
    await google.spreadsheetBatchUpdate(ID, graficos.dibujar)
      .catch((e) => console.warn(`  ⚠ ${meta.pestana}: los gráficos fallaron (${e.message}); la tabla quedó bien`))
  }

  await plegarElPasado(google, hoja.sheetId, meta)
  return { hoja, escrito: true, meta }
}

/**
 * EL PASADO, PLEGADO — Y VA ÚLTIMO, QUE NO ES INDISTINTO.
 *
 * `pielMatriz` desoculta el footprint entero (`hiddenByUser:false`) y colapsar un grupo es justamente
 * poner `hiddenByUser:true`: plegar antes del formato dejaría el margen mostrando un grupo colapsado
 * con las columnas a la vista. Y va después de los gráficos porque un `addChart` que falla no puede
 * llevarse puesto el pliegue, que es lo que hace que la pestaña abra en la semana actual.
 *
 * SI FALLA, LA PESTAÑA QUEDA ENTERA. Incómoda —hay que scrollear— pero nunca tapada. Ver el porqué del
 * borrar-y-rehacer en cada corrida en `requestsDePliegue` (cash-flow-hoy.mjs).
 */
async function plegarElPasado(google, sheetId, meta) {
  const req = requestsDePliegue(sheetId, meta.plegar)
  if (!req.length) {
    console.log(`  ⌄ ${meta.pestana}: no hay pasado que plegar (hoy no cae adentro del ejercicio ${meta.anio}, o es el primer período)`)
    return false
  }
  try {
    await google.spreadsheetBatchUpdate(ID, req)
    console.log(`  ⌄ ${meta.pestana}: ${meta.plegar.fin - meta.plegar.inicio} columna(s) del pasado plegadas (${rangoEnLetras(meta.plegar)}) — la pestaña abre en el período en curso`)
    return true
  } catch (e) {
    console.warn(`  ⚠ ${meta.pestana}: no pude plegar el pasado (${e.message}); el cuadro quedó entero y hay que scrollear`)
    return false
  }
}

/**
 * VERIFICAR CONTRA EL SHEET — LO ÚNICO QUE PRUEBA UNA ESCRITURA, Y AHORA TAMBIÉN QUE LAS DOS VISTAS
 * DIGAN LO MISMO.
 *
 * ═══ POR QUÉ EL CUADRE VA ACÁ Y NO EN UN REPORTE APARTE (13/08/2026) ═══
 *
 * El Semanal decía ($57.164.937) de resultado del año y el Mensual ($44.091.619). Estuvo así hasta que
 * el dueño abrió las dos pestañas y restó a mano: no existía nada que lo mirara. Son DOS CÁLCULOS
 * INDEPENDIENTES DEL MISMO HECHO —53 ventanas semanales y 12 mensuales sobre el mismo libro—, así que
 * compararlos fila por fila es evidencia real y no un control validándose contra sí mismo.
 *
 * SE LEE UNA VEZ Y SE USA DOS. El mismo rectángulo sirve para buscar celdas en error y para leer la
 * columna TOTAL. Con `UNFORMATTED_VALUE`, que devuelve números: leer "$ 364.126.253" y adivinar cuál
 * es el separador decimal es la forma más cara de equivocarse (los errores siguen llegando como texto
 * "#REF!", así que el barrido de errores no pierde nada).
 *
 * SI NO CUADRA, EL PASO FALLA (salida ≠ 0). El pipeline lo lista en FALLARON y, por su propia regla,
 * no registra la corrida como una ingesta exitosa del Cash Flow. Las pestañas ya están escritas —esto
 * corre después, porque antes los números no existen— pero nadie va a decidir sobre ellas creyendo que
 * la corrida salió bien.
 */
async function cuadrarLasVistas(google, metas) {
  const lecturas = []
  for (const meta of metas) {
    const fp = meta.footprint
    const v = await google.readSheetValues(ID, `${refPestana(meta.pestana)}!A1:${letra(fp.cols - 1)}${fp.filas}`,
      { render: 'UNFORMATTED_VALUE' }).catch((e) => { console.warn(`  ⚠ no pude releer ${meta.pestana}: ${e.message}`); return [] })
    const err = []
    v.forEach((f, i) => (f || []).forEach((c, j) => {
      if (/^#(REF|ERROR|N\/A|VALUE|¡|¿|DIV|NAME|NUM|NULL)/.test(String(c ?? ''))) err.push(`${letra(j)}${i + 1}=${c}`)
    }))
    console.log(`\n${meta.pestana}: ${err.length ? `⚠ ${err.length} celda(s) en error: ${err.slice(0, 6).join(' ')}` : '✓ sin errores'}`)
    lecturas.push(totalesDeVista(v, meta))
  }
  const r = cuadre(lecturas[0], lecturas[1])
  if (r.ok) {
    console.log(`✓ cuadre: las ${r.comparadas} filas totalizables coinciden entre ${metas[0].pestana} y ${metas[1].pestana} (± $1)`)
    return true
  }
  console.error(`\n⛔ LAS DOS VISTAS NO CUADRAN — ${r.fuera.length} de ${r.comparadas} fila(s) difieren en más de $1.`)
  console.error('   Son dos cálculos del MISMO hecho sobre el MISMO libro: si no dan igual, uno de los dos miente.')
  for (const l of r.fuera.slice(0, 12)) console.error(`   · ${linea(l, metas[0].pestana, metas[1].pestana)}`)
  // Los problemas van acotados: si la relectura falló, TODAS las filas quedan sin comparar y volcar 76
  // renglones iguales al log del pipeline esconde el desvío real entre el ruido.
  for (const p of r.problemas.slice(0, 6)) console.error(`   ⚠ ${p}`)
  if (r.problemas.length > 6) console.error(`   ⚠ …y ${r.problemas.length - 6} fila(s) más que no se pudieron leer`)
  return false
}

/**
 * LA FUENTE CONTRA EL CUADRO, EN CADA PUBLICACIÓN.
 *
 * ═══ POR QUÉ NO ALCANZABA CON EL CUADRE ENTRE LAS DOS VISTAS (14/08/2026) ═══
 *
 * `cuadrarLasVistas` compara Semanal contra Mensual: dos ventanas sobre EL MISMO libro. Si el libro
 * cuenta un cobro distinto de como lo cuenta Cobranzas, las dos vistas se equivocan igual y el cuadre
 * da ✓. Eso pasó: julio mostraba $22.957.196 de más y agosto $19.903.200 de menos, los dos totales
 * casi se compensaban ($3.054.320 de neto sobre $809M) y las dos vistas cuadraban perfecto entre sí.
 * La única forma de verlo era comparar contra la FUENTE, y eso lo hacía un auditor a mano.
 *
 * LA DIFERENCIA ESPERADA NO ES CERO Y EL CONTROL LO EXIGE ASÍ. Un valor endosado y una devolución son
 * diferencias legítimas entre la pestaña y el cuadro; lo que se exige es que la diferencia de cada mes
 * sea EXACTAMENTE ésas (la aritmética, en `auditar`). Un umbral "±$20M porque hay endosos" habría
 * dejado pasar los dos desvíos que originaron esto.
 *
 * VA DESPUÉS DE ESCRIBIR, como el otro cuadre: antes de escribir el cuadro no existe. Si no cierra, el
 * paso falla (salida ≠ 0) y el pipeline no registra la corrida como ingesta exitosa del Cash Flow.
 */
async function cuadrarContraCobranzas(google, pestana) {
  const r = await auditarCuadreCobranzas(google, ID, { pestana })
    .catch((e) => ({ noPudoUbicar: `no pude leer las fuentes del cuadre (${e.message})` }))
  if (r.ok) {
    console.log(`✓ cuadre Cobranzas ↔ ${pestana}: los ${r.porMes.length} meses cierran contra la pestaña`
      + ' REAL contra REAL y PROYECTADO contra PROYECTADO (endosos y devoluciones descontados uno por uno)')
    // EL AVISO SALE AUNQUE CIERRE. Un "Cobrado" sin respaldo del banco no descuadra nada —los dos
    // lados lo cuentan igual— así que si sólo se imprimiera en la rama de falla, el único momento en
    // que se vería sería cuando ya hay otro problema. Es la plata que el cuadre no puede ver.
    for (const l of informe(r, { soloFallas: true })) console.warn(`   ${l}`)
    return true
  }
  console.error(`\n⛔ COBRANZAS Y ${pestana.toUpperCase()} NO CUADRAN.`)
  console.error('   La pestaña es la FUENTE del cuadro: si no dan igual, el cuadro afirma un cobro que Cobranzas no dice.')
  for (const l of informe(r, { soloFallas: true })) console.error(`   ${l}`)
  return false
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const refs = await refsDeCaja(google)
  console.log(`Ancla de saldo: ${refs.saldo ?? '⚠ sin rango con nombre'} · piso: ${refs.minima ?? '(sin caja mínima)'}`)

  const hoy = new Date()
  // LAS DOS GRILLAS SE ARMAN ANTES DE ESCRIBIR NADA —son puras— PORQUE LA GUARDA MIRA SU GEOMETRÍA.
  // Si las columnas de una vista no cubren exactamente el mismo intervalo que las de la otra, sus
  // totales no son comparables y la conciliación entre pestañas deja de significar algo. Eso se sabe
  // sin tocar la red y cuesta un milisegundo: abortar acá es gratis, abortar después ya escribió.
  const mensual = grillaMeses({ anio: AÑO, refs, hoy })
  const semanal = grillaSemanal({ hoy, anio: AÑO, refs })
  const guarda = guardaDeCobertura([semanal.meta, mensual.meta])
  if (!guarda.ok) {
    for (const m of guarda.motivos) console.error(`  ⛔ ${m}`)
    throw new Error('las dos vistas no cubren el mismo período: no escribo ninguna de las dos')
  }

  // El presupuesto VA PRIMERO: el Mensual cita sus rangos con nombre, y un nombre que todavía no
  // existe deja #NAME? en la pestaña que el dueño abre todos los días.
  await rehacerPresupuesto(google)

  // EL MENSUAL VA PRIMERO, y no es indistinto: publica CF_MESES —los doce meses del ejercicio— y la
  // proyección de comisiones del SEMANAL cuenta sobre ese rango.
  // Los nombres los publica escribirVista ANTES de achicar la hoja: publicarlos después dejó
  // CF_SALDO_INICIO/CIERRE quemados el 06/08 (ver el comentario adentro).
  await escribirVista(google, (gid) => grillaMeses({ anio: AÑO, refs, gid, hoy }), mensual.meta.footprint, refs, destinosNombrados)
  // Y EL SEMANAL VA CON EL MISMO AÑO QUE EL MENSUAL, no con el rodante de hoy: las dos vistas cubren
  // el mismo ejercicio o la conciliación entre ellas deja de significar algo.
  await escribirVista(google, (gid) => grillaSemanal({ hoy, anio: AÑO, refs, gid }), semanal.meta.footprint, refs)
  if (DRY) return console.log('\n--dry: no escribí nada.')

  // LOS DOS CUADRES CORREN SIEMPRE, aunque el primero falle: son independientes y saber los DOS
  // resultados es lo que distingue "el libro está mal" de "una de las dos vistas está mal".
  const vistas = await cuadrarLasVistas(google, [semanal.meta, mensual.meta])
  const fuente = await cuadrarContraCobranzas(google, mensual.meta.pestana)
  if (!vistas || !fuente) process.exitCode = 1
}

// Importarlo para testear las grillas —que son puras— NO dispara main(): así el test no escribe nada.
const ejecutadoDirecto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (ejecutadoDirecto) main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
