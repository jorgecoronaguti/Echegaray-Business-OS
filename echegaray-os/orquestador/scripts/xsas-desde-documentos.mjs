#!/usr/bin/env node
// DEL DOCUMENTO A LA PARTIDA, SIN QUE NADIE LE SOPLE LA RESPUESTA.
//
//   node orquestador/scripts/xsas-desde-documentos.mjs quattropani --sin-modelo
//   node orquestador/scripts/xsas-desde-documentos.mjs quattropani --salida /tmp/x.json --run2
//
// ═══ QUÉ DEFECTO EXISTE PARA CERRAR ═══
//
// `cotizador-casos-reales.mjs` arma el caso Quattropani con `leerEstado({ query }, cotQ.id)`: las 26
// partidas con su cantidad salen de Postgres ya cargadas. Eso no demuestra el circuito
// DOCUMENTO → ELEMENTO → CÓMPUTO → PARTIDA — demuestra que la base tiene 26 filas. La DoD lo dejó
// escrito: criterio #1 NO_CUMPLE `{"distintos":4,"formatos":2}` y criterio #3 NO_VERIFICABLE
// («traen cantidad pero ninguna trae evidencia, fuente ni nota»).
//
// Acá la única entrada es la CARPETA DE DRIVE. Nada sale de `cotizacion_partida`, y lo que sí se lee
// de la base se lee DESPUÉS y sólo para contrastar, en su propia sección y con su propio rótulo.
//
// ═══ LA LÍNEA QUE SEPARA EL INSUMO DE LA RESPUESTA ═══
//
// `partirDocumentos` ya parte la carpeta en dos y el pipeline sólo recibe la primera mitad. En
// Quattropani eso deja AFUERA todas las planillas —COMPUTO.xlsx, las tres .xlsm de cotización, el
// listado de tareas—, y está bien que las deje afuera: son el resultado. Por eso el camino primario
// cotiza con planos, CAD y contrato, y el COMPUTO.xlsx aparece en la sección CONTRASTE, que corre
// después y no realimenta nada.
//
// ═══ POR QUÉ NO ESCRIBE EL SHEET ═══
//
// Este script corre desde un worktree y desde un worktree no se escribe el Sheet real: ya borró una
// pestaña entera. Publica un JSON que la integración puede subir desde el árbol principal.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { makeGoogleClient } from '../lib/google.mjs'
import { correr } from '../lib/plano/pipeline.mjs'
import { cuadroDeFormatos } from '../lib/ingesta/capacidades.mjs'
import { leerPlanilla } from '../lib/ingesta/planilla.mjs'
import { takeoffDeHoja, medirTakeoff, contrastar, libroDe, ESTADO } from '../lib/cotizador/takeoff.mjs'
import { formatoDe, FORMATO } from '../lib/ingesta/registro.mjs'

const args = process.argv.slice(2)
const termino = args.find((a) => !a.startsWith('--'))
if (!termino) {
  console.error('uso: xsas-desde-documentos.mjs <termino> [--sin-modelo] [--sin-regiones] [--run2] [--salida <ruta>]')
  process.exit(1)
}
const opciones = {
  sinModelo: args.includes('--sin-modelo'),
  sinRegiones: args.includes('--sin-regiones'),
  run2: args.includes('--run2'),
  salida: args[args.indexOf('--salida') + 1] && args.includes('--salida') ? args[args.indexOf('--salida') + 1] : null,
}

/** Comparar nombres de partida SIN inventar parecidos: se normaliza acentos, espacios y mayúsculas
 *  y nada más. SIMILAR≠MISMA_PARTIDA — un emparejamiento difuso convierte «no coincide» en
 *  «coincide» y ése es exactamente el número que este informe existe para no inflar. */
const clave = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

const linea = (t) => console.log(t)
const titulo = (t) => console.log(`\n── ${t} ──`)

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 1 · EL CAMINO PRIMARIO: la carpeta de Drive y nada más.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const google = makeGoogleClient({ config: loadConfig() })
const r = await correr({
  query, google, termino,
  porRegiones: !opciones.sinRegiones,
  permitirModelo: !opciones.sinModelo,
})

console.log(`\n═══ ${termino.toUpperCase()} · DOCUMENTO → ELEMENTO → CÓMPUTO → PARTIDA ═══`)
console.log(`  entrada: la carpeta «${r.carpeta || '(sin raíz común)'}» de Drive · 0 filas de cotizacion_partida\n`)

titulo('LOS DOCUMENTOS QUE ENTRARON (y los que quedaron reservados a propósito)')
const cuadro = cuadroDeFormatos(r)
linea(`  ${cuadro.resumen}`)
const porFormato = new Map()
for (const d of r.documentos.insumos) {
  const f = formatoDe({ nombre: d.name, mime: d.mime_type })
  porFormato.set(f, (porFormato.get(f) ?? 0) + 1)
}
linea(`  insumos por formato: ${[...porFormato.entries()].map(([f, n]) => `${f}×${n}`).join(' · ') || '(ninguno)'}`)
// El criterio #1 de la DoD se midió `{"distintos":4,"formatos":2}`: la corrida de cotización sólo
// veía planillas y Word. Acá se imprime QUÉ FORMATO llegó hasta el proyecto, con la clase real del
// PDF —VECTORIAL / RASTER / MIXTO la mide la corrida, no la adivina el nombre—.
for (const f of cuadro.filas.filter((x) => x.archivos)) {
  linea(`     ${f.formato.padEnd(14)} ${String(f.archivos).padStart(2)} archivo(s) → ${f.alcanza ?? 'NO LLEGA'}`)
}
linea(`     clases de PDF medidas: ${[...new Set(cuadro.archivos.map((a) => a.clasePdf).filter(Boolean))].join(' · ') || 'ninguna (no hay PDF con geometría leída)'}`)
linea(`  reservados (revelan el resultado, no entran): ${r.documentos.reservados.length}`)
for (const d of r.documentos.reservados) linea(`     · ${d.name} — ${d.porQue}`)
if (r.documental.noLeidos.length) {
  linea(`  NO LEÍDOS (${r.documental.noLeidos.length}) — no es un silencio, es la respuesta a «¿leíste todo?»:`)
  for (const x of r.documental.noLeidos) linea(`     · ${x.archivo}: ${x.porQue}`)
}

titulo('LOS DOCUMENTOS, RELACIONADOS ENTRE SÍ')
const rel = r.relaciones ?? {}
linea(`  ${rel.resumen ?? '(sin grafo)'}`)
linea(`  relaciones por tipo: ${Object.entries(rel.relaciones ?? {}).map(([k, n]) => `${k}=${n}`).join(' · ') || '(ninguna)'}`)
for (const a of (rel.ambitos ?? []).slice(0, 6)) linea(`     · ámbito «${a.ambito}»: ${a.documentos.length} documento(s) — ${a.documentos.slice(0, 3).join(', ')}`)
for (const [nombre, s] of (rel.superado ?? new Map())) linea(`     · SUPERADO «${nombre}» — ${s.porQue}`)
for (const a of rel.ambiguas ?? []) linea(`     · AMBIGUA familia «${a.familia}» — ${a.porQue}`)

titulo('LOS ELEMENTOS Y SU CANTIDAD')
const items = r.computo?.items ?? []
const conCantidad = items.filter((i) => i.cantidad !== null)
const sinOrigen = r.computo?.sinOrigen ?? []
linea(`  elementos detectados        ${items.length}`)
linea(`  con cantidad                ${conCantidad.length}`)
linea(`  sin cantidad (FALTA_DATO)   ${items.length - conCantidad.length}   ← no son ceros`)
linea(`  con cantidad y SIN origen   ${sinOrigen.length}   ← cantidad que no se puede citar`)
for (const i of conCantidad.slice(0, 8)) {
  // `cantidad` NO es un número: es el sobre de `fuente.mjs` con valor, unidad, fórmula y entradas.
  // Imprimirlo con `String()` daba «[object Object]» — y ese `[object` es la señal de que la
  // procedencia estaba ahí y el informe la estaba tirando.
  const c = i.cantidad ?? {}
  linea(`     · ${String(i.nombre ?? i.id).slice(0, 38).padEnd(40)} ${String(c.valor).slice(0, 9).padStart(10)} ${String(c.unidad ?? i.unidad ?? '?').padEnd(4)} ${c.fuente ?? '?'} · ${String(i.archivo ?? '').slice(0, 34)}`)
  if (c.formula) linea(`         ${c.formula}${c.entradas ? ' · ' + Object.entries(c.entradas).map(([k, v]) => `${k}=${v}`).join(' ') : ''}`)
}

titulo('LAS PARTIDAS QUE SALIERON DE ESOS ELEMENTOS')
const mapeos = r.mapeo?.mapeos ?? []
linea(`  MAPEADA (partida de la Base Maestra)   ${r.mapeo?.mapeadas ?? 0}`)
linea(`  PARTIDA_CANDIDATA (no validada)        ${r.mapeo?.candidatas ?? 0}   ← CANDIDATO≠VALIDADO`)
linea(`  sin partida                            ${mapeos.length - (r.mapeo?.mapeadas ?? 0) - (r.mapeo?.candidatas ?? 0)}`)

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 2 · LAS PLANILLAS QUE SÍ SON INSUMO. En Quattropani son cero, y eso también es un resultado.
// ═══════════════════════════════════════════════════════════════════════════════════════════

titulo('CANTIDADES LEÍDAS DE PLANILLAS QUE SON INSUMO (con hoja, celda y fórmula)')
const takeoffsInsumo = r.documental?.takeoffs ?? []
if (!takeoffsInsumo.length) {
  const planillas = r.documentos.insumos.filter((d) => formatoDe({ nombre: d.name, mime: d.mime_type }) === FORMATO.PLANILLA)
  linea(`  0 cantidad(es): el proyecto tiene ${planillas.length} planilla(s) entre sus insumos.`)
  linea('  NO es una limitación del lector — las planillas de este proyecto quedaron del lado RESERVADO')
  linea('  de la validación ciega porque son el resultado. El lector se ejercita abajo, en CONTRASTE.')
} else {
  for (const t of takeoffsInsumo) {
    const m = medirTakeoff(t.cantidades)
    linea(`  ${t.archivo} · hoja «${t.hoja}» ${t.porQue ? '— ' + t.porQue : `· ${m.defendibles} defendible(s) de ${m.filas}`}`)
    for (const c of t.cantidades.filter((x) => x.estado === ESTADO.DEFENDIBLE).slice(0, 5)) {
      linea(`     · ${String(c.elemento).slice(0, 30).padEnd(32)} ${String(c.valor).slice(0, 10).padStart(10)} ${String(c.unidad).padEnd(5)} @${c.evidencia.ubicacion} ${c.formula ? '= ' + c.formula : '(literal)'}`)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 3 · CONTRASTE. Corre DESPUÉS y no realimenta nada de lo de arriba.
// ═══════════════════════════════════════════════════════════════════════════════════════════

console.log('\n═══ CONTRASTE — se lee la respuesta A PROPÓSITO, y después ═══')
console.log('  Nada de esta sección entró al camino primario. Sirve para medir la distancia, no para acortarla.\n')

titulo('EL CÓMPUTO ORIGINAL DEL PROYECTO, LEÍDO COMO DOCUMENTO')
const contrastes = []
for (const d of r.documentos.reservados) {
  if (formatoDe({ nombre: d.name, mime: d.mime_type }) !== FORMATO.PLANILLA) continue
  let bytes
  try { bytes = await google.descargarBytes(d.drive_file_id) } catch (e) { linea(`  ${d.name}: no se pudo descargar — ${String(e?.message ?? e).slice(0, 100)}`); continue }
  const p = leerPlanilla(bytes, { nombre: d.name })
  if (!p.ok) { linea(`  ${d.name}: ${p.porQue}`); continue }
  const hojas = []
  const libro = libroDe(p)
  for (const h of p.hojas) hojas.push(takeoffDeHoja(h, { documento: d.name, driveId: d.drive_file_id, libro }))
  // Se imprimen las hojas QUE DIERON CANTIDADES; las que no, se cuentan y se dice por qué en una
  // línea. Sesenta líneas de «no hay tabla que leer acá» tapan las tres que importan.
  const conCant = hojas.filter((h) => h.cantidades.length)
  for (const t of conCant) {
    const m = medirTakeoff(t.cantidades)
    linea(`  ${d.name} · «${t.hoja}» · ${m.defendibles} defendible(s), ${m.faltaDato} FALTA_DATO, ${m.error} ERROR, ${m.conFormula} con fórmula`)
  }
  const sin = hojas.filter((h) => !h.cantidades.length)
  if (sin.length) linea(`  ${d.name} · ${sin.length} hoja(s) sin tabla de cantidades: ${[...new Set(sin.map((h) => h.porQue?.slice(0, 70)))].join(' | ')}`)
  contrastes.push({ archivo: d.name, hojas })
}

const principal = contrastes.find((c) => c.hojas.some((h) => h.cantidades.length))
if (principal) {
  const conCant = principal.hojas.filter((h) => h.cantidades.length)
  for (const c of (conCant[0]?.cantidades ?? []).filter((x) => x.estado === ESTADO.DEFENDIBLE).slice(0, 6)) {
    linea(`     · ${String(c.elemento).slice(0, 26).padEnd(28)} ${String(c.valor).slice(0, 8).padStart(9)} ${String(c.unidad).padEnd(6)} @${c.evidencia.ubicacion} ${c.formula ? '← ' + c.formula : ''}`)
    if (c.literales?.length) linea(`         de: ${c.literales.map((l) => `${l.celda}=${l.valor}`).join(' · ')}`)
  }
  if (conCant.length > 1) {
    titulo('DOS HOJAS DEL MISMO ARCHIVO QUE NO DICEN LO MISMO')
    const k = contrastar(conCant[0].cantidades, conCant[1].cantidades, { etiquetaA: conCant[0].hoja, etiquetaB: conCant[1].hoja })
    linea(`  coinciden ${k.coinciden.length} · CONFLICTO ${k.conflictos.length} · sólo en «${conCant[0].hoja}» ${k.soloA.length} · sólo en «${conCant[1].hoja}» ${k.soloB.length}`)
    linea('  Ninguno se resuelve acá: elegir una hoja en silencio inventa el resultado de una discusión que no ocurrió.')
    for (const c of k.conflictos.slice(0, 5)) {
      linea(`     · ${c.clase} «${c.elemento}» — ${c.porQue}`)
      for (const cita of c.citas) linea(`         ${cita.fuente}: ${cita.valor} ${cita.unidad ?? ''} @${cita.ubicacion}${cita.formula ? ' = ' + cita.formula : ''}`)
    }
  }
}

titulo('CONTRA LAS PARTIDAS PRECARGADAS DE POSTGRES')
// ═══ A QUÉ COTIZACIÓN SE CONTRASTA, Y CÓMO SE DECIDIÓ ═══
// `cotizador-casos-reales.mjs` toma «la cotización de Quattropani» con
// `where obra_nombre = 'Salón Comercial' and estado = 'borrador'`. Medido: esas cuatro filas tienen
// `cliente = NULL`. O sea que la atribución de esas 26 partidas a Quattropani NO está en los datos:
// está en un literal de ese script. Acá no se repite esa suposición — se contrasta contra las
// cotizaciones cuyo CLIENTE dice el término, y las que no se pueden atribuir se declaran.
let precargadas = []
let cotElegida = null
const sinDueno = []
try {
  const todas = (await query(
    `select c.id, c.cliente, c.obra_nombre, c.estado, count(p.id)::int partidas
       from public.cotizaciones c left join public.cotizacion_partida p on p.cotizacion_id = c.id
      group by 1, 2, 3, 4 order by c.fecha_cotizacion`)).rows
  const forzada = args.includes('--cotizacion') ? args[args.indexOf('--cotizacion') + 1] : null
  const atribuibles = todas.filter((c) => clave(c.cliente).includes(clave(termino)))
  for (const c of todas) if (!c.cliente && c.partidas > 0) sinDueno.push(c)
  cotElegida = forzada ? todas.find((c) => c.id === forzada) : atribuibles.sort((a, b) => b.partidas - a.partidas)[0]
  if (cotElegida) {
    precargadas = (await query(
      `select descripcion, cantidad, unidad, codigo, nota from public.cotizacion_partida
        where cotizacion_id = $1 order by orden, codigo`, [cotElegida.id])).rows
    linea(`  se contrasta contra «${cotElegida.obra_nombre}» de «${cotElegida.cliente ?? '(sin cliente)'}» (${cotElegida.estado}) · ${precargadas.length} partida(s)`)
    linea(`  identificada por: ${forzada ? '--cotizacion en la línea de comandos' : 'el campo `cliente` de la cotización contiene «' + termino + '»'}`)
  } else linea(`  NO_APLICA: ninguna cotización tiene un cliente que contenga «${termino}»`)
  if (sinDueno.length) {
    linea(`  ${sinDueno.length} cotización(es) con partidas y SIN cliente en la base — no se puede afirmar de quién son:`)
    for (const c of sinDueno) linea(`     · «${c.obra_nombre}» (${c.estado}) · ${c.partidas} partida(s) · cliente NULL`)
    linea('     Las 26 partidas que `cotizador-casos-reales.mjs` llama «Quattropani» son de este grupo:')
    linea('     su vínculo con el proyecto es un literal del script, no un dato. Para contrastar contra')
    linea('     una de ellas hay que pasarla a mano con --cotizacion <uuid>, y eso es una decisión, no un default.')
  }
} catch (e) { linea(`  NO_MEDIDO: la consulta a Postgres falló — ${String(e?.message ?? e).slice(0, 120)}`) }

const sinEvidencia = precargadas.filter((p) => !p.nota).length
if (precargadas.length) {
  linea(`  de esas ${precargadas.length}, ${sinEvidencia} no traen nota/evidencia de dónde salió la cantidad`)
  // ═══ EL ÚLTIMO ARCHIVO NO GANA ═══
  // La primera versión de este índice hacía `delDoc.set(k, c)` y el último archivo recorrido pisaba
  // a los anteriores: las 26 partidas salían todas atribuidas a «Viejo/PRESUPUESTO.xlsm» —la versión
  // SUPERADA— y las cantidades no coincidían. Elegir una fuente en silencio es justo lo que este
  // informe no puede hacer, así que se guardan TODAS y la discrepancia se muestra.
  const delDoc = new Map()
  for (const c of contrastes.flatMap((x) => x.hojas).flatMap((h) => h.cantidades)) {
    if (!c.elemento || c.valor === null) continue
    const k = clave(c.elemento)
    delDoc.set(k, [...(delDoc.get(k) ?? []), c])
  }
  const delPipeline = new Map()
  for (const i of conCantidad) if (i.nombre) delPipeline.set(clave(i.nombre), i)
  const conCelda = []; const cPipeL = []; const huerfanas = []
  for (const p of precargadas) {
    const k = clave(p.descripcion)
    if (delDoc.has(k)) conCelda.push({ partida: p, origenes: delDoc.get(k) })
    else if (delPipeline.has(k)) cPipeL.push(p)
    else huerfanas.push(p.descripcion)
  }
  const cDoc = conCelda.length; const cPipe = cPipeL.length
  linea(`  ${cDoc} coinciden por NOMBRE con una cantidad de una planilla leída con celda`)
  // ═══ ESTO ES LO QUE LA DoD DECLARÓ NO_VERIFICABLE ═══
  // «las 26 partidas de la corrida traen cantidad pero ninguna trae evidencia, fuente ni nota».
  // Acá cada una que se pudo emparejar sale con el archivo, la hoja, la celda y la fórmula de la
  // que salió su cantidad — y con la diferencia contra el número que la base tiene guardado, que
  // NO se corrige: una diferencia tapada es peor que una diferencia informada.
  const igual = (a, b) => a !== null && b !== null && Math.abs(Number(a) - b) / Math.max(Math.abs(b), 1e-9) <= 0.005
  let cuadran = 0
  for (const { partida, origenes } of conCelda) {
    const coincidentes = origenes.filter((o) => igual(partida.cantidad, o.valor))
    if (coincidentes.length) cuadran++
  }
  linea(`  de esas ${cDoc}, ${cuadran} tienen al menos UNA fuente documental cuya cantidad cuadra con la base`)
  linea(`  y ${cDoc - cuadran} no cuadran con ninguna: la partida está en los documentos pero su número no sale de ahí`)
  for (const { partida, origenes } of conCelda.slice(0, 10)) {
    const c = origenes.filter((o) => igual(partida.cantidad, o.valor))
    const elegido = c[0] ?? null
    linea(`     · ${String(partida.descripcion).slice(0, 38).padEnd(40)} base=${partida.cantidad}`)
    if (elegido) linea(`         CUADRA @${elegido.documento}::${elegido.evidencia.ubicacion}${elegido.formula ? ' = ' + elegido.formula : ''}`)
    else linea(`         NO CUADRA con ninguna de sus ${origenes.length} fuente(s): ${origenes.slice(0, 3).map((o) => `${o.valor} @${o.documento}::${o.evidencia.ubicacion}`).join(' · ')}`)
  }
  linea(`  ${cPipe} coinciden por NOMBRE con un elemento del camino primario (planos/CAD)`)
  linea(`  ${huerfanas.length} no aparecen en ninguno de los dos — el emparejamiento es por nombre EXACTO normalizado,`)
  linea('     no difuso: SIMILAR≠MISMA_PARTIDA, y un match difuso convierte «no coincide» en «coincide».')
  for (const h of huerfanas.slice(0, 10)) linea(`     · ${h}`)
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 4 · REPRODUCIBILIDAD Y MEDICIÓN
// ═══════════════════════════════════════════════════════════════════════════════════════════

const medicion = {
  documentos_en_la_carpeta: { valor: r.documentos.total, estado: 'MEDIDO' },
  insumos_procesados: { valor: r.documentos.insumos.length, estado: 'MEDIDO' },
  reservados_por_validacion_ciega: { valor: r.documentos.reservados.length, estado: 'MEDIDO' },
  no_leidos: { valor: r.documental.noLeidos.length, estado: 'MEDIDO' },
  elementos_detectados: { valor: items.length, estado: 'MEDIDO' },
  elementos_con_cantidad: { valor: conCantidad.length, estado: 'MEDIDO' },
  cantidades_sin_origen_citable: { valor: sinOrigen.length, estado: 'MEDIDO' },
  partidas_mapeadas: { valor: r.mapeo?.mapeadas ?? 0, estado: 'MEDIDO' },
  partidas_candidatas: { valor: r.mapeo?.candidatas ?? 0, estado: 'MEDIDO' },
  cantidades_de_planilla_insumo: { valor: takeoffsInsumo.reduce((a, t) => a + t.cantidades.length, 0), estado: 'MEDIDO' },
  // NO se llama «cantidades de cómputo»: son FILAS CON FORMA de cantidad (una columna rotulada
  // cantidad y otra unidad) en 19 pestañas por libro, y ahí adentro entran las hojas «Análisis»,
  // que son análisis de precio unitario y no cómputo de obra. Llamarlas cantidades publicaría 6.800
  // cómputos donde hay 60. El número es real; el rótulo es lo que lo hacía mentir.
  filas_con_forma_de_cantidad_en_reservados: { valor: contrastes.flatMap((c) => c.hojas).reduce((a, h) => a + h.cantidades.length, 0), estado: 'MEDIDO' },
  cantidades_del_computo_del_proyecto: {
    valor: contrastes.filter((c) => /computo/i.test(c.archivo)).flatMap((c) => c.hojas).reduce((a, h) => a + h.cantidades.filter((x) => x.estado === ESTADO.DEFENDIBLE).length, 0),
    estado: contrastes.some((c) => /computo/i.test(c.archivo)) ? 'MEDIDO' : 'NO_APLICA',
  },
  llamadas_al_modelo: { valor: r.ia.llamadas, estado: 'MEDIDO' },
  reproducibilidad_run1_run2: { valor: null, estado: opciones.run2 ? 'MEDIDO' : 'NO_MEDIDO', porQue: opciones.run2 ? null : 'no se pidió --run2: una corrida sola no puede afirmar nada sobre reproducibilidad' },
}

if (opciones.run2) {
  const r2 = await correr({ query, google, termino, porRegiones: !opciones.sinRegiones, permitirModelo: !opciones.sinModelo })
  const igual = r.huella === r2.huella
  medicion.reproducibilidad_run1_run2 = { valor: igual, estado: 'MEDIDO', huella1: r.huella, huella2: r2.huella }
  medicion.cotizacion_contrastada = { valor: cotElegida?.id ?? null, estado: cotElegida ? 'MEDIDO' : 'NO_APLICA' }
  titulo('REPRODUCIBILIDAD')
  // La huella es un bloque de una línea por partida: se imprime su SHA-256 y su tamaño. Volcar el
  // bloque entero dos veces son 60 líneas que nadie compara a ojo — y compararlas a ojo es
  // exactamente lo que este control existe para no tener que hacer.
  const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex').slice(0, 16)
  linea(`  RUN1 huella sha256:${sha(r.huella)} · ${String(r.huella).split('\n').length} línea(s)`)
  linea(`  RUN2 huella sha256:${sha(r2.huella)} · ${String(r2.huella).split('\n').length} línea(s)`)
  linea(`  ${igual ? 'IDÉNTICAS ✔' : 'DISTINTAS ✖ — la corrida no es reproducible con los mismos insumos'}`)
}

titulo('LO MEDIDO')
for (const [k, v] of Object.entries(medicion)) {
  linea(`  ${k.padEnd(36)} ${String(v.valor ?? '—').padStart(8)}  ${v.estado}${v.porQue ? ' · ' + v.porQue : ''}`)
}
linea(`  ${'degradacion'.padEnd(36)} ${r.degradacion.hubo ? 'SÍ' : 'no'.padStart(8)}  ${r.degradacion.hubo ? JSON.stringify(r.degradacion.porQue ?? r.degradacion).slice(0, 90) : 'corrida sin degradación'}`)

const salida = opciones.salida ?? path.join(process.env.HOME || '/tmp', `.cache/xsas-desde-documentos-${clave(termino).replace(/ /g, '-')}.json`)
fs.mkdirSync(path.dirname(salida), { recursive: true })
fs.writeFileSync(salida, JSON.stringify({
  termino, carpeta: r.carpeta, generadoEn: new Date().toISOString(), medicion,
  documentos: { insumos: r.documentos.insumos.map((d) => d.name), reservados: r.documentos.reservados.map((d) => ({ archivo: d.name, porQue: d.porQue })), noLeidos: r.documental.noLeidos },
  computo: conCantidad.map((i) => ({ elemento: i.nombre, cantidad: i.cantidad, unidad: i.unidad, archivo: i.archivo ?? null, origen: i.origen })),
  takeoffsInsumo,
  contraste: contrastes,
  precargadas: precargadas.map((p) => ({ descripcion: p.descripcion, cantidad: p.cantidad, unidad: p.unidad, tieneNota: Boolean(p.nota) })),
}, null, 2))
linea(`\n  resultado publicado en ${salida}`)
linea('  NO se escribió ningún Google Sheet: este script corre desde un worktree y desde un worktree eso ya borró una pestaña.')

await closePool()
