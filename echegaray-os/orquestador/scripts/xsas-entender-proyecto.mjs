#!/usr/bin/env node
// ¿ENTIENDE EL OS UN PROYECTO QUE NADIE VIO ANTES? Los números, por proyecto y por formato.
//
//   node orquestador/scripts/xsas-entender-proyecto.mjs "arcor - san juan"
//   node orquestador/scripts/xsas-entender-proyecto.mjs quattropani --max=40
//   node orquestador/scripts/xsas-entender-proyecto.mjs arcor --solo-inventario
//
// ═══ CERO CLAUDE, A PROPÓSITO ═══
//
// No se mira ninguna lámina: `planosLegibles: []`. Lo que se prueba acá es la parte DETERMINÍSTICA
// —qué formatos se abren, qué texto sale, qué geometría trae el CAD, cómo se relacionan los
// documentos entre sí y qué contradicciones aparecen—, que es justamente la que tiene que seguir
// funcionando sin saldo y la que se puede repetir dos veces con el mismo resultado.
//
// Lo que el modelo lee MIRANDO un plano NO está en estos números, y por eso el informe lo dice en
// vez de dejar que se confunda con una capacidad que el circuito no ejercitó.
//
// ═══ EL LÍMITE SE DECLARA, NO SE ESCONDE ═══
//
// `--max` corta la cantidad de documentos que se bajan de Drive. Una carpeta de 500 archivos son 500
// descargas, y para medir la capacidad alcanza con una muestra. Pero el informe imprime cuántos
// entraron y cuántos quedaron afuera: una medición sobre una muestra que se presenta como total es
// exactamente la clase de número que este repo no acepta.

import { pathToFileURL } from 'node:url'
import { closePool, query } from '../lib/db.mjs'
import { makeGoogleClient } from '../lib/google.mjs'
import { carpetaRaiz, documentosDelProyecto, escritorTemporal } from '../lib/plano/pipeline.mjs'
import { partirDocumentos, planosDe } from '../lib/plano/documentos.mjs'
import { claseDocumental, ingerir } from '../lib/plano/documental.mjs'
import { armarProyecto } from '../lib/plano/proyecto.mjs'
import { relacionar } from '../lib/plano/relacion.mjs'
import { cuadroDeFormatos } from '../lib/ingesta/capacidades.mjs'
import { FORMATO, formatoDe } from '../lib/ingesta/registro.mjs'

const ext = (n) => String(n ?? '').toLowerCase().match(/\.[a-z0-9]{1,5}$/)?.[0] ?? '(sin extensión)'

/** El inventario por formato y por extensión, que se puede contestar SIN bajar un solo byte. PURA. */
export function inventarioDe(insumos = []) {
  const porFormato = {}
  const porExtension = {}
  for (const d of insumos) {
    const f = formatoDe({ nombre: d.name, mime: d.mime_type })
    porFormato[f] = (porFormato[f] ?? 0) + 1
    porExtension[ext(d.name)] = (porExtension[ext(d.name)] ?? 0) + 1
  }
  return {
    total: insumos.length,
    porFormato,
    porExtension,
    sinAdaptador: insumos.filter((d) => formatoDe({ nombre: d.name, mime: d.mime_type }) === FORMATO.OTRO).map((d) => d.name),
  }
}

/**
 * LA MUESTRA QUE SE BAJA. PURA.
 *
 * No es «los primeros N»: se toma de forma pareja POR ÁMBITO, porque en una cartera como ARCOR los
 * primeros N por orden alfabético son todos de la misma obra y el cruce entre documentos —que es lo
 * que se está midiendo— no se ejercita nunca.
 */
export function muestra(insumos, rel, max) {
  if (!max || insumos.length <= max) return { elegidos: insumos, afuera: [] }
  const porAmbito = new Map()
  for (const d of insumos) {
    const a = rel.porNombre.get(d.name)?.ambito ?? ' RAIZ'
    porAmbito.set(a, [...(porAmbito.get(a) ?? []), d])
  }
  const colas = [...porAmbito.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => [...v])
  const elegidos = []
  while (elegidos.length < max && colas.some((c) => c.length)) {
    for (const c of colas) {
      if (elegidos.length >= max) break
      if (c.length) elegidos.push(c.shift())
    }
  }
  const set = new Set(elegidos)
  return { elegidos, afuera: insumos.filter((d) => !set.has(d)) }
}

const linea = (t) => console.log(t)
const tabla = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, v]) => `${k}=${v}`).join('  ')

async function correr(termino, { max = 60, soloInventario = false, ambito = null } = {}) {
  const filas0 = await documentosDelProyecto({ query }, termino)
  // Una cartera como ARCOR son 40 obras: `--ambito` permite mirar UNA y ejercitar el cruce
  // planilla ↔ cómputo ↔ pliego ↔ cronograma de esa obra, que es lo que la muestra pareja diluye.
  const filas = ambito ? filas0.filter((f) => String(f.path ?? '').toLowerCase().includes(String(ambito).toLowerCase())) : filas0
  const archivos = filas.filter((f) => !f.is_folder)
  const raiz = carpetaRaiz(filas)
  const { insumos, reservados } = partirDocumentos(filas, { carpetaObra: raiz })
  const planos = planosDe(insumos)
  const conClase = insumos.map((d) => ({ ...d, clase: claseDocumental(d.name).id }))
  const rel = relacionar(conClase, { carpetaObra: raiz })
  const inv = inventarioDe(insumos)

  linea(`\n${'═'.repeat(78)}\n  ${termino.toUpperCase()}\n${'═'.repeat(78)}`)
  linea(`carpeta raíz: ${raiz || '(no se pudo deducir)'}`)
  linea(`archivos: ${archivos.length}  ·  insumos: ${insumos.length}  ·  reservados (validación ciega): ${reservados.length}`)
  linea(`formatos:   ${tabla(inv.porFormato)}`)
  linea(`extensiones:${tabla(inv.porExtension)}`)
  linea(`planos legibles: ${planos.legibles.length}  ·  planos NO legibles: ${planos.noLegibles.length}  ·  otros: ${planos.otros.length}`)
  linea(`\n── RELACIÓN DOCUMENTAL ──`)
  linea(rel.resumen)
  linea(`relaciones: ${tabla(rel.relaciones)}`)
  linea(`ámbitos (obras dentro del cliente): ${rel.ambitos.length ? rel.ambitos.map((a) => `${a.ambito}(${a.documentos.length})`).join(' · ') : '(ninguno: es una obra sola)'}`)
  for (const s of [...rel.superado.entries()].slice(0, 8)) linea(`  superado · «${s[0]}» → ${s[1].porQue}`)
  for (const a of rel.ambiguas.slice(0, 5)) linea(`  AMBIGUA · ${a.familia}: ${a.porQue}`)
  if (soloInventario) return { termino, inv, rel }

  const { elegidos, afuera } = muestra(insumos, rel, max)
  linea(`\n── LECTURA REAL (cero Claude: no se mira ninguna lámina) ──`)
  linea(`se bajan ${elegidos.length} de ${insumos.length} documento(s)${afuera.length ? ` · ${afuera.length} quedaron afuera por --max=${max}` : ''}`)
  const google = makeGoogleClient()
  const documental = await ingerir({ google, insumos: elegidos, planosLegibles: [], escribirTemporal: escritorTemporal(), limite: 0 })
  linea(documental.resumen)
  const conteoNoLeidos = {}
  for (const n of documental.noLeidos) conteoNoLeidos[ext(n.archivo)] = (conteoNoLeidos[ext(n.archivo)] ?? 0) + 1
  if (documental.noLeidos.length) {
    linea(`NO LEÍDOS por extensión: ${tabla(conteoNoLeidos)}`)
    for (const n of documental.noLeidos.slice(0, 6)) linea(`  ✗ ${n.archivo}: ${String(n.porQue).slice(0, 110)}`)
  }
  const porClaseLeida = {}
  for (const d of documental.documentales) porClaseLeida[d.clase] = (porClaseLeida[d.clase] ?? 0) + 1
  linea(`documentos con texto extraído por clase: ${tabla(porClaseLeida) || '(ninguno)'}`)
  linea(`caracteres de texto: ${documental.documentales.reduce((a, d) => a + d.caracteres, 0)}`)

  const proyecto = armarProyecto({ documentos: archivos, hechos: documental.hechos, cad: documental.cad, relaciones: rel })
  const sinRel = armarProyecto({ documentos: archivos, hechos: documental.hechos, cad: documental.cad })
  linea(`\n── PROYECTO CONSOLIDADO ──`)
  linea(proyecto.resumen)
  linea(`hechos por clase de documento: ${tabla(proyecto.porClase) || '(ninguno)'}`)
  linea(`CONFLICTOS con grafo documental: ${proyecto.conflictos.length}   ·   SIN grafo: ${sinRel.conflictos.length}   ·   resueltos por jerarquía: ${proyecto.resueltosPorJerarquia.length}`)
  const estados = {}
  for (const h of proyecto.hechos) estados[h.estado] = (estados[h.estado] ?? 0) + 1
  linea(`estado de los hechos: ${tabla(estados) || '(ninguno)'}`)
  for (const c of proyecto.conflictos.slice(0, 5)) linea(`  ⚠ ${c.que}: ${String(c.porQue).slice(0, 150)}`)
  for (const r of proyecto.resueltosPorJerarquia.slice(0, 5)) linea(`  → ${r.que} = ${r.valor} · ${String(r.porQue).slice(0, 130)}`)

  const cuadro = cuadroDeFormatos({ documentos: { insumos: elegidos, reservados }, documental, proyecto, computo: { items: [] }, laminas: [], porRegion: [] })
  linea(`\n── CUADRO DE FORMATOS (sobre la muestra bajada) ──`)
  for (const f of cuadro.filas.filter((x) => x.archivos)) {
    linea(`  ${String(f.formato).padEnd(24)} n=${String(f.archivos).padEnd(4)} PARSEADO=${f.PARSEADO} INTERPRETADO=${f.INTERPRETADO} INTEGRADO=${f.INTEGRADO_PROYECTO}  alcanza=${f.alcanza ?? 'ninguna etapa completa'}`)
    linea(`      ${String(f.porQue).slice(0, 150)}`)
  }
  return { termino, inv, rel, documental, proyecto, cuadro }
}

const ejecutadoDirecto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (ejecutadoDirecto) {
  const args = process.argv.slice(2)
  const terminos = args.filter((a) => !a.startsWith('--'))
  const max = Number(args.find((a) => a.startsWith('--max='))?.split('=')[1] ?? 60)
  const soloInventario = args.includes('--solo-inventario')
  const ambito = args.find((a) => a.startsWith('--ambito='))?.split('=').slice(1).join('=') ?? null
  if (!terminos.length) { console.error('uso: xsas-entender-proyecto.mjs <termino> [<termino>…] [--max=N] [--ambito=X] [--solo-inventario]'); process.exit(1) }
  try {
    for (const t of terminos) await correr(t, { max, soloInventario, ambito })
  } finally {
    await closePool().catch(() => {})
  }
}

export { correr }
