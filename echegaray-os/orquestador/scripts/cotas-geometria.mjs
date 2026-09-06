#!/usr/bin/env node
// ¿LA GEOMETRÍA ASIGNA LA COTA AL ELEMENTO? El experimento que cerró el camino, reproducible.
//
//   node orquestador/scripts/cotas-geometria.mjs [carpeta-con-los-pdf]
//
// No llama a ningún modelo. Cruza los PDF de los planos con las lecturas YA PAGADAS del caché y
// mide la cadena entera, eslabón por eslabón, contra la única verdad de referencia disponible: los
// elementos `lineal` a los que el pipeline SÍ le leyó un largo.
//
// EL CONTROL NEGATIVO NO ES OPCIONAL Y VA ADENTRO: cada acierto se vuelve a medir buscando desde la
// marca de OTRO elemento del mismo plano. Si un método acierta igual apuntando a cualquier lado, no
// está midiendo el plano — está midiendo cuántos números hay dando vueltas. Así murió el
// emparejamiento por texto de la etapa anterior, y por eso el control corre antes que el resultado.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DIR_CACHE } from '../lib/plano/cache-lecturas.mjs'
import { validarLamina } from '../lib/plano/interpretar.mjs'
import { enlazarConPlanos } from './vision-rendimiento.mjs'
import { cotasDe, fusionarColineales, cotaMasCercana, escalaPorConsenso, normalizarMarca, mismoLargo, numeroDe, distanciaAlSegmento } from '../lib/plano/cotas.mjs'

const EXTRACTOR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'plano', 'cotas.py')
const CARPETA = process.argv[2] || '/tmp/xsas-fuentes'

/** Los elementos que cada plano aportó, agrupados por el hash del archivo del que salieron. */
function elementosPorPlano() {
  const { enlace } = enlazarConPlanos()
  const porPlano = new Map()
  for (const f of fs.readdirSync(DIR_CACHE)) {
    if (!f.startsWith('v3region')) continue
    const meta = enlace.get(f.replace(/\.json$/, ''))
    if (!meta) continue
    const j = JSON.parse(fs.readFileSync(path.join(DIR_CACHE, f), 'utf8'))
    const g = porPlano.get(meta.hashArchivo) ?? []
    for (const e of validarLamina(j.crudo, { archivo: meta.hashArchivo, archivoId: null }).elementos) {
      g.push({ id: e.id, forma: e.forma, largo: e.dimensiones?.largo?.valor ?? null })
    }
    porPlano.set(meta.hashArchivo, g)
  }
  return porPlano
}

/** El largo del dibujo que rotula una marca, en unidades del plano. La otra mitad del experimento:
 *  medir el dibujo en vez de buscar el número escrito. */
function medirDibujo(cadenas, apariciones, escala, { radio = 60 } = {}) {
  if (!escala) return null
  let mejor = null
  for (const a of apariciones) {
    for (const c of cadenas) {
      const { d } = distanciaAlSegmento(a.cx, a.cy, c.x0, c.y0, c.x1, c.y1)
      if (d <= radio && (!mejor || d < mejor.d)) mejor = { d, largo: c.largo }
    }
  }
  return mejor ? mejor.largo * escala : null
}

/** Un generador reproducible: el control por azar no puede cambiar de resultado entre dos corridas
 *  o deja de ser un control y pasa a ser una anécdota. */
function azar(semilla = 7) {
  let s = semilla
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 }
}

function main() {
  const porPlano = elementosPorPlano()
  const sortear = azar()
  const t = { gt: 0, enLamina: 0, enCota: 0, conMarca: 0, r120: 0, acierta: 0, aciertaAzar: 0, mide: 0, mideBien: 0, mideBienAzar: 0, sinLargo: 0, asignable: 0 }
  const filas = []
  for (const f of fs.readdirSync(CARPETA).filter((x) => x.endsWith('.pdf')).sort()) {
    const hash = f.slice(0, 16)
    const els = porPlano.get(hash)
    if (!els) continue
    const crudo = JSON.parse(execFileSync('python3', [EXTRACTOR, path.join(CARPETA, f)], { maxBuffer: 200e6 }))
    const palabras = crudo.palabras.map((p) => ({ ...p, cx: (p.x0 + p.x1) / 2, cy: (p.y0 + p.y1) / 2 }))
    const cadenas = fusionarColineales(crudo.segmentos)
    const cotas = cotasDe(palabras, cadenas)
    const { escala } = escalaPorConsenso(cotas)
    const numeros = palabras.map((p) => numeroDe(p.t)).filter((v) => v !== null)
    const porMarca = new Map()
    for (const p of palabras) {
      const n = normalizarMarca(p.t)
      if (n) porMarca.set(n, [...(porMarca.get(n) ?? []), p])
    }
    const marcas = [...porMarca.keys()].filter((m) => m.length >= 2)
    const fila = { plano: hash, gt: 0, conMarca: 0, acierta: 0, mideBien: 0, azar: 0, cotas: cotas.length }
    for (const e of els) {
      if (e.forma !== 'lineal') continue
      if (e.largo === null) {
        t.sinLargo += 1
        const ap = porMarca.get(normalizarMarca(e.id)) ?? []
        if (ap.length && cotaMasCercana(cotas, ap)) t.asignable += 1
        continue
      }
      if (!e.id) continue
      t.gt += 1; fila.gt += 1
      if (numeros.some((v) => mismoLargo(v, e.largo))) t.enLamina += 1
      if (cotas.some((c) => mismoLargo(c.valor, e.largo))) t.enCota += 1
      const ap = porMarca.get(normalizarMarca(e.id)) ?? []
      if (!ap.length) continue
      t.conMarca += 1; fila.conMarca += 1
      if (cotas.some((c) => mismoLargo(c.valor, e.largo) && cotaMasCercana([c], ap))) t.r120 += 1
      const elegida = cotaMasCercana(cotas, ap)
      if (elegida && mismoLargo(elegida.cota.valor, e.largo)) { t.acierta += 1; fila.acierta += 1 }
      const medido = medirDibujo(cadenas, ap, escala)
      if (medido !== null) { t.mide += 1; if (mismoLargo(medido, e.largo, { tol: 0.05 })) { t.mideBien += 1; fila.mideBien += 1 } }
      // ═══ EL MISMO MÉTODO, APUNTANDO A OTRO ELEMENTO ═══
      if (!marcas.length) continue
      const otra = porMarca.get(marcas[Math.floor(sortear() * marcas.length)])
      const eA = cotaMasCercana(cotas, otra)
      if (eA && mismoLargo(eA.cota.valor, e.largo)) { t.aciertaAzar += 1; fila.azar += 1 }
      const mA = medirDibujo(cadenas, otra, escala)
      if (mA !== null && mismoLargo(mA, e.largo, { tol: 0.05 })) t.mideBienAzar += 1
    }
    filas.push(fila)
  }
  const pc = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—')
  console.log(`\n═══ ¿LA GEOMETRÍA ASIGNA LA COTA AL ELEMENTO? · ${filas.length} planos ═══\n`)
  console.table(filas)
  console.log(`  verdad de referencia (lineales con largo leído)   ${t.gt}`)
  console.log(`  el largo figura como token en la lámina           ${t.enLamina}  (${pc(t.enLamina, t.gt)})`)
  console.log(`  …y figura sobre una línea, o sea es una COTA      ${t.enCota}  (${pc(t.enCota, t.gt)})`)
  console.log(`  la marca del elemento está en la capa de texto    ${t.conMarca}  (${pc(t.conMarca, t.gt)})`)
  console.log(`  la cota correcta existe a ≤120 pt de la marca     ${t.r120}  (${pc(t.r120, t.gt)})   ← TECHO con un ranker perfecto`)
  console.log(`\n  ACIERTA la cota más cercana a la marca           ${t.acierta}/${t.conMarca}  (${pc(t.acierta, t.conMarca)})   ·  control por azar ${t.aciertaAzar}/${t.conMarca} (${pc(t.aciertaAzar, t.conMarca)})`)
  console.log(`  ACIERTA midiendo el dibujo × escala               ${t.mideBien}/${t.mide}  (${pc(t.mideBien, t.mide)})   ·  control por azar ${t.mideBienAzar}/${t.mide} (${pc(t.mideBienAzar, t.mide)})`)
  console.log(`\n  lineales SIN largo con alguna cota al alcance     ${t.asignable}/${t.sinLargo}  (${pc(t.asignable, t.sinLargo)})  ← alcance, NO acierto: el acierto es el de arriba\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
