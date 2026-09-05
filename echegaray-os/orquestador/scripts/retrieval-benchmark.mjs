#!/usr/bin/env node
// ¿QUÉ MOTOR DE BÚSQUEDA ENCUENTRA MEJOR LOS DOCUMENTOS DE ESTA EMPRESA?
//
// ═══ EL CONJUNTO DE PRUEBA NO SE INVENTA: SE DEDUCE DE LOS DOCUMENTOS ═══
//
// Escribir cincuenta preguntas a mano y decidir yo cuál es la respuesta correcta sería medir mi
// propia intuición. Acá cada pregunta se construye de los CAMPOS QUE EL MOTOR DOCUMENTAL YA
// EXTRAJO —tipo, período, CUIT— y la respuesta correcta es el documento del que salieron. Es una
// pregunta que una persona hace de verdad («el VEP de octubre de 2023») y su respuesta es
// verificable sin que nadie opine.
//
// Deliberadamente la pregunta NO usa el nombre del archivo: si lo usara, el buscador por nombre
// ganaría por construcción y el benchmark no mediría recuperación, mediría copiar y pegar.
//
// ═══ QUÉ SE COMPARA ═══
//
//   lexical      el índice de palabras de Postgres, que ya está en producción y es el que hay que superar
//   e5-small     el modelo instalado: la línea de base
//   granite-97m  Apache-2.0, multilingüe, cuantizado para esta CPU
//   bge-m3       el más grande que la VM sostiene
//   híbrido      lexical + el mejor vectorial, fusionados por rango
//
//   node orquestador/scripts/retrieval-benchmark.mjs [--modelos e5-small,granite-97m] [--preguntas 40]

import { query } from '../lib/db.mjs'
import { CANDIDATOS, embeber, coseno, cargar, soltar } from '../lib/ml/motor-embeddings.mjs'
import { buscarEnContenido } from '../lib/drive-busqueda/contenido.mjs'
import { entenderConsulta, pasaFiltros } from '../lib/ml/entender-consulta.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const MODELOS = String(arg('--modelos', 'e5-small,granite-97m,bge-m3')).split(',').filter(Boolean)
const MAX_PREGUNTAS = Number(arg('--preguntas', 40))
const K = 5

const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Cómo se llama cada tipo cuando lo dice una persona, no el catálogo. */
const EN_CRIOLLO = {
  vep: 'el volante de pago', acuse_arca: 'el acuse de presentación de la declaración jurada',
  f931: 'la declaración jurada de aportes', libro_sueldos: 'el libro de sueldos',
  recibo_sueldo: 'el recibo de sueldo', factura: 'la factura', nota_credito: 'la nota de crédito',
  boleta_ieric: 'la boleta del IERIC', ieric: 'la documentación del IERIC',
  comprobante_pago: 'el comprobante de pago', certificado_fiscal: 'el certificado de cumplimiento fiscal',
  certificado_obra: 'el certificado de obra', presupuesto: 'el presupuesto', seguro: 'la póliza',
}

/** Arma preguntas reales con respuesta verificable. Nunca usa el nombre del archivo. */
async function conjuntoDePrueba() {
  const q = await query(`
    select drive_file_id, nombre, tipo, campos->>'periodo' periodo, campos->>'fecha' fecha,
           campos->>'cuit' cuit
      from public.documento_leido
     where tipo is not null and error is null
       and (campos->>'periodo' is not null or campos->>'fecha' is not null)
     order by drive_file_id`)

  const preguntas = []
  const vistos = new Set()
  for (const d of q.rows) {
    const nombreTipo = EN_CRIOLLO[d.tipo]
    if (!nombreTipo) continue
    let cuando = null
    const p = String(d.periodo ?? '')
    if (/^\d{4}-\d{2}$/.test(p)) cuando = `${MES[Number(p.slice(5, 7)) - 1]} de ${p.slice(0, 4)}`
    else if (d.fecha) cuando = `${MES[Number(String(d.fecha).slice(5, 7)) - 1]} de ${String(d.fecha).slice(0, 4)}`
    if (!cuando) continue
    const texto = `${nombreTipo} de ${cuando}`
    // Una pregunta cuya respuesta correcta es ambigua no mide nada: si dos documentos contestan lo
    // mismo, acertar cualquiera de los dos sería acertar, y el benchmark diría más de lo que sabe.
    if (vistos.has(texto)) { preguntas.filter((x) => x.texto === texto).forEach((x) => { x.ambigua = true }); continue }
    vistos.add(texto)
    preguntas.push({ texto, correcto: d.drive_file_id, tipo: d.tipo, nombre: d.nombre })
  }
  return preguntas.filter((p) => !p.ambigua).slice(0, MAX_PREGUNTAS)
}

/**
 * EL CONJUNTO DIFICIL: preguntas que el filtro estructurado NO puede contestar solo.
 *
 * ═══ POR QUE HIZO FALTA, Y ES UNA CORRECCION A ESTE MISMO BENCHMARK ═══
 *
 * El primer conjunto arma las preguntas desde (tipo, periodo) y el pipeline filtra por exactamente
 * esos dos campos: el filtro reconstruye la pregunta y da 100% por construccion. Eso prueba que el
 * filtro funciona mecanicamente y NO prueba nada sobre la recuperacion — el modelo no aporta nada
 * cuando queda un solo candidato. Un benchmark circular es peor que ninguno: da un numero perfecto
 * y esconde que no se midio lo que se dijo medir.
 *
 * Aca la pregunta es por una PERSONA o un IMPORTE que aparece adentro del documento, y el tipo
 * documental deja decenas de candidatos. El filtro acota; quien tiene que acertar es el modelo.
 */
async function conjuntoDificil() {
  const q = await query(`
    select l.drive_file_id, l.nombre, l.tipo, f.texto
      from public.documento_leido l
      join public.documento_fragmento f using (drive_file_id)
     where l.tipo in ('recibo_sueldo','comprobante_pago','libro_sueldos','factura')
       and l.error is null and f.orden = 0
     order by l.drive_file_id`)

  // Un nombre de persona en MAYUSCULAS con coma («RIOS, FERNANDO ANTONIO») o un beneficiario: es lo
  // que una persona usa para pedir un papel, y no esta en el nombre del archivo.
  const RE_PERSONA = /\b([A-ZÁÉÍÓÚÑ]{3,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,}){1,3}),\s*([A-ZÁÉÍÓÚÑ]{3,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,}){0,3})\b/
  const RE_BENEF = /Beneficiario:\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{8,50})/

  const porPersona = new Map()
  for (const d of q.rows) {
    const b = String(d.texto).match(RE_BENEF)
    const m = b ? [null, b[1].trim(), ''] : String(d.texto).match(RE_PERSONA)
    if (!m) continue
    const persona = `${m[1]} ${m[2]}`.replace(/\s+/g, ' ').trim()
    if (persona.length < 8) continue
    if (!porPersona.has(persona)) porPersona.set(persona, [])
    porPersona.get(persona).push(d)
  }

  const preguntas = []
  for (const [persona, docs] of porPersona) {
    // Solo sirve si UN documento contesta: con dos, acertar cualquiera seria acertar y la metrica
    // diria mas de lo que sabe.
    if (docs.length !== 1) continue
    const d = docs[0]
    preguntas.push({ texto: `el papel de ${persona}`, correcto: d.drive_file_id, tipo: d.tipo, nombre: d.nombre })
  }
  return preguntas.slice(0, MAX_PREGUNTAS)
}

/** Los fragmentos sobre los que se busca. Los mismos para todos los motores: comparar sobre
 *  universos distintos no es comparar. */
async function corpus(correctos = [], tope = 2500) {
  const q = await query(`
    select f.id, f.drive_file_id, f.pagina, f.texto, l.tipo, l.campos
      from public.documento_fragmento f
      join public.documento_leido l using (drive_file_id)
     where l.error is null and length(f.texto) >= 60
     order by f.id`)
  // NO es el corpus entero, y hay que decirlo: embeber 10.875 fragmentos con tres modelos en una VM
  // de 4 nucleos son horas por corrida, y un benchmark que no se puede repetir no es un benchmark.
  // El pozo lleva TODOS los fragmentos de los documentos correctos --asi que la respuesta siempre
  // esta-- mas una muestra de distractores hasta `tope`. El numero se declara en la salida: un
  // Recall@5 sobre 2.500 candidatos no significa lo mismo que sobre 10.000.
  const set = new Set(correctos)
  const dentro = q.rows.filter((f) => set.has(f.drive_file_id))
  const fuera = q.rows.filter((f) => !set.has(f.drive_file_id))
  // Muestreo por paso fijo, no aleatorio: dos corridas tienen que dar el MISMO pozo, o la
  // comparacion entre modelos mide tambien la suerte del muestreo.
  const faltan = Math.max(0, tope - dentro.length)
  const paso = Math.max(1, Math.floor(fuera.length / Math.max(1, faltan)))
  const muestra = fuera.filter((_, i) => i % paso === 0).slice(0, faltan)
  return { pozo: [...dentro, ...muestra], total: q.rows.length }
}

/** Recall@k, MRR y Top-1 de una lista de resultados por pregunta. */
function metricas(resultados) {
  let top1 = 0, enK = 0, mrr = 0
  for (const r of resultados) {
    const pos = r.ranking.indexOf(r.correcto)
    if (pos === 0) top1 += 1
    if (pos >= 0 && pos < K) enK += 1
    if (pos >= 0) mrr += 1 / (pos + 1)
  }
  const n = resultados.length || 1
  return { top1: top1 / n, recallK: enK / n, mrr: mrr / n }
}

/** Fusión por rango recíproco: junta dos listas sin que los puntajes —que están en escalas
 *  distintas y no son comparables— decidan nada. Sólo importa en qué puesto salió cada uno. */
function fusionar(listas, k = 60) {
  const p = new Map()
  for (const l of listas) l.forEach((id, i) => p.set(id, (p.get(id) ?? 0) + 1 / (k + i + 1)))
  return [...p.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
}

async function main() {
  const preguntas = process.argv.includes('--dificil') ? await conjuntoDificil() : await conjuntoDePrueba()
  if (process.argv.includes('--dificil')) {
    console.log('CONJUNTO DIFICIL: la respuesta NO se deduce del tipo ni del periodo — la decide el contenido.\n')
  }
  const { pozo: frags, total } = await corpus(preguntas.map((p) => p.correcto))
  console.log(`CONJUNTO   ${preguntas.length} preguntas con respuesta verificable`)
  console.log(`POZO       ${frags.length} fragmentos de ${new Set(frags.map((f) => f.drive_file_id)).size} documentos (de ${total} en total)\n`)
  if (!preguntas.length) { console.log('sin datos suficientes'); return }

  const tabla = []

  // ── LÉXICO: lo que ya está en producción ──
  const t0 = Date.now()
  const lex = []
  const lexFiltrado = []
  const porDoc = new Map(frags.map((f) => [f.drive_file_id, f]))
  for (const p of preguntas) {
    const r = await buscarEnContenido((sql, prm) => query(sql, prm), p.texto, { limite: 20 })
    const ids = r.documentos.map((d) => d.driveFileId)
    lex.push({ correcto: p.correcto, ranking: ids })
    const f = entenderConsulta(p.texto)
    const filtrados = f.filtros ? ids.filter((id) => porDoc.has(id) && pasaFiltros(porDoc.get(id), f)) : ids
    lexFiltrado.push({ correcto: p.correcto, ranking: filtrados.length ? filtrados : ids })
  }
  tabla.push({ motor: 'lexical (producción)', ...metricas(lex), ms: Math.round((Date.now() - t0) / preguntas.length), dim: '—', mb: 0 })
  tabla.push({ motor: 'filtros+lexical', ...metricas(lexFiltrado), ms: Math.round((Date.now() - t0) / preguntas.length), dim: '—', mb: 0 })
  const rankingLex = new Map(preguntas.map((p, i) => [p.texto, lex[i].ranking]))

  // ── LOS MODELOS ──
  let mejor = null
  for (const clave of MODELOS) {
    const c = CANDIDATOS[clave]
    if (!c) { console.log(`  ✖ «${clave}» no está declarado`); continue }
    try {
      const m = await cargar(clave)
      const rssAntes = Math.round(process.memoryUsage().rss / 1048576)
      const tv = Date.now()
      const vecs = await embeber(clave, frags.map((f) => f.texto), { rol: 'documento' })
      const msIndex = Date.now() - tv
      const rssDespues = Math.round(process.memoryUsage().rss / 1048576)

      const tq = Date.now()
      const res = []
      const resFiltrado = []
      for (const p of preguntas) {
        const vq = await embeber(clave, p.texto, { rol: 'consulta' })
        const puntuados = vecs.map((v, i) => ({ doc: frags[i].drive_file_id, s: coseno(vq, v), i }))
        puntuados.sort((a, b) => b.s - a.s)
        const rank = (lista) => {
          const r = []
          for (const x of lista) { if (!r.includes(x.doc)) r.push(x.doc); if (r.length >= 20) break }
          return r
        }
        res.push({ correcto: p.correcto, ranking: rank(puntuados), texto: p.texto })

        // ── EL PIPELINE COMPLETO: filtros estructurados PRIMERO, modelo despues ──
        // Es la arquitectura real, no una variante del benchmark. Un periodo tiene respuesta
        // exacta: se filtra. Lo que queda es la pregunta que un embedding contesta bien.
        const f = entenderConsulta(p.texto)
        const candidatos = f.filtros ? puntuados.filter((x) => pasaFiltros(frags[x.i], f)) : puntuados
        resFiltrado.push({ correcto: p.correcto, ranking: rank(candidatos.length ? candidatos : puntuados) })
      }
      const msPorConsulta = Math.round((Date.now() - tq) / preguntas.length)
      const met = metricas(res)
      tabla.push({ motor: clave, ...met, ms: msPorConsulta, dim: c.dimensiones, mb: rssDespues - rssAntes,
        msIndex, carga: m.msCarga })

      // El híbrido se arma con ESTE modelo: fusión por rango con el léxico.
      const hib = res.map((r) => ({ correcto: r.correcto, ranking: fusionar([rankingLex.get(r.texto) ?? [], r.ranking]) }))
      const metH = metricas(hib)
      tabla.push({ motor: `híbrido lexical+${clave}`, ...metH, ms: msPorConsulta, dim: c.dimensiones, mb: 0 })
      const metF = metricas(resFiltrado)
      tabla.push({ motor: `filtros+${clave}  ← el pipeline`, ...metF, ms: msPorConsulta, dim: c.dimensiones, mb: 0 })
      if (!mejor || metF.mrr > mejor.mrr) mejor = { clave, ...metF, con: 'filtros' }
      await soltar(clave)
    } catch (e) {
      console.log(`  ✖ ${clave}: ${e.message.slice(0, 110)}`)
      tabla.push({ motor: clave, top1: null, recallK: null, mrr: null, ms: null, dim: c.dimensiones, mb: null, error: e.message.slice(0, 60) })
    }
  }

  const pc = (x) => (x == null ? '  —  ' : `${(x * 100).toFixed(1)}%`.padStart(6))
  console.log('MOTOR                          Top-1  Recall@5    MRR   ms/consulta  dim   RAM')
  console.log('─'.repeat(84))
  for (const r of tabla) {
    console.log(`${r.motor.padEnd(30)}${pc(r.top1)}   ${pc(r.recallK)}  ${pc(r.mrr)}   ${String(r.ms ?? '—').padStart(8)}  ${String(r.dim).padStart(5)}  ${r.mb == null ? '—' : r.mb + ' MB'}${r.error ? '  ✖ ' + r.error : ''}`)
  }
  if (mejor) console.log(`\nMEJOR HÍBRIDO: ${mejor.clave} · MRR ${(mejor.mrr * 100).toFixed(1)}% · Top-1 ${(mejor.top1 * 100).toFixed(1)}%`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.stack || e.message); process.exit(1) })
}
