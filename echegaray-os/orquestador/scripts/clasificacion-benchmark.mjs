#!/usr/bin/env node
// ¿QUÉ CLASIFICA MEJOR LA FAMILIA DE UN MATERIAL: LAS REGLAS, UN MODELO, O LOS DOS?
//
// ═══ LA ETIQUETA NO ES HUMANA, Y ESO CAMBIA TODO LO QUE ESTE BENCHMARK PUEDE AFIRMAR ═══
//
// `compra_sheet.familia_material` NO lo escribió una persona: lo escribe `formulaFamilia()` como
// fórmula en el Sheet, o sea las mismas reglas que este benchmark quiere evaluar. Medido: las
// reglas dan 100,0%, y ese número no significa «son perfectas», significa que se estan comparando
// consigo mismas. Es la segunda vez en este proyecto que aparece un benchmark circular; conviene
// escribirlo donde se vea.
//
// LO QUE SÍ SE PUEDE AFIRMAR:
//   · los embeddings reproducen la decision de las reglas en el 69,1% de los casos — o sea que NO
//     son equivalentes, y donde difieren hay que mirar cual tiene razon;
//   · para las 63 filas que las reglas dejaron en «SIN CLASIFICAR» los vecinos proponen algo, y
//     revisadas a ojo aciertan la mayoria («Serv hys» → Seguridad e higiene, «CAÑERIA BASE» →
//     Plomería) y fallan donde el texto no habla de un material («PLATA ENTREGADA A CUENTA» →
//     Alquiler de equipos, que es falso).
//
// POR ESO ESTA CAPACIDAD PROPONE Y NO APLICA. Cada confirmacion humana es la primera etiqueta real
// que va a tener este dataset, y con suficientes se podra medir de verdad.
//
// ═══ EL BASELINE NO ES «NADA»: SON LAS REGLAS QUE YA CORREN ═══
//
// `lib/familia-material.mjs` ya clasifica por vocabulario y por proveedor monoproducto. Un modelo
// que no le gane no entra: sería 500 MB de RAM y 12 ms por fila para hacer peor lo que una regex
// hace instantáneamente. La pregunta honesta no es «¿el modelo anda?», es «¿le gana a lo que ya
// tenemos, y en qué casos?».
//
// ═══ QUÉ SE COMPARA ═══
//
//   reglas          lo que hay hoy en producción
//   vecinos         embeddings + k vecinos más cercanos entre las filas YA etiquetadas
//   reglas→vecinos  la escalera: la regla decide si puede, el modelo sólo lo que ella dejó sin resolver
//
// El tercero es la arquitectura que el OS pide en todos lados —determinístico primero, modelo
// después— y es la única de las tres que puede ser mejor que las dos.
//
//   node orquestador/scripts/clasificacion-benchmark.mjs [--k 5] [--pliegues 5]

import { query } from '../lib/db.mjs'
import { familiaDeMaterial, SIN_FAMILIA } from '../lib/familia-material.mjs'
import { embeber, coseno, cargar, CANDIDATOS } from '../lib/ml/motor-embeddings.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d }
const K = arg('--k', 5)
const PLIEGUES = arg('--pliegues', 5)
const MODELO = 'e5-small'

/** El texto que describe una compra. Concepto y proveedor juntos: «Art varios» no dice nada, pero
 *  «Art varios · Corralon Progreso» sí. */
const textoDe = (f) => [f.concepto, f.detalle_obra, f.proveedor].filter(Boolean).join(' · ')

async function main() {
  const q = await query(`
    select concepto, detalle_obra, proveedor, familia_material
      from public.compra_sheet
     where familia_material is not null and familia_material <> ''
     order by fila`)
  const etiquetadas = q.rows.filter((f) => f.familia_material !== SIN_FAMILIA)
  const pendientes = q.rows.filter((f) => f.familia_material === SIN_FAMILIA)
  const clases = [...new Set(etiquetadas.map((f) => f.familia_material))]

  console.log(`DATASET    ${etiquetadas.length} filas etiquetadas · ${clases.length} familias · ${pendientes.length} sin clasificar esperando`)

  const m = await cargar(MODELO)
  console.log(`MODELO     ${CANDIDATOS[MODELO].id} @ ${CANDIDATOS[MODELO].revision.slice(0, 12)} · cargado en ${m.msCarga} ms\n`)

  const t0 = Date.now()
  const vecs = await embeber(MODELO, etiquetadas.map(textoDe), { rol: 'documento' })
  console.log(`           ${etiquetadas.length} filas embebidas en ${Date.now() - t0} ms (${Math.round((Date.now() - t0) / etiquetadas.length)} ms cada una)\n`)

  // ── VALIDACIÓN CRUZADA ──
  // Medir sobre las mismas filas con las que se aprende da 100% y no significa nada: cada fila sería
  // su propio vecino más cercano. Se parte en pliegues y cada uno se predice con los OTROS.
  const r = { reglas: 0, vecinos: 0, escalera: 0, total: 0, reglasResolvio: 0, mlNecesario: 0 }
  const fallosEscalera = new Map()
  let msVecinos = 0

  for (let p = 0; p < PLIEGUES; p += 1) {
    const test = etiquetadas.map((f, i) => ({ f, i })).filter(({ i }) => i % PLIEGUES === p)
    const train = etiquetadas.map((f, i) => ({ f, i })).filter(({ i }) => i % PLIEGUES !== p)

    for (const { f, i } of test) {
      r.total += 1
      const real = f.familia_material

      const porRegla = familiaDeMaterial({ concepto: f.concepto, detalle: f.detalle_obra, proveedor: f.proveedor })
      const reglaResolvio = porRegla && porRegla !== SIN_FAMILIA
      if (reglaResolvio) r.reglasResolvio += 1
      if (porRegla === real) r.reglas += 1

      const tv = Date.now()
      const vecinos = train
        .map(({ f: g, i: j }) => ({ familia: g.familia_material, s: coseno(vecs[i], vecs[j]) }))
        .sort((a, b) => b.s - a.s).slice(0, K)
      msVecinos += Date.now() - tv
      // Voto ponderado por similitud: un vecino a 0,97 pesa más que uno a 0,88. Contar votos a secas
      // deja que cuatro vecinos flojos le ganen a uno que es casi el mismo material.
      const voto = new Map()
      for (const v of vecinos) voto.set(v.familia, (voto.get(v.familia) ?? 0) + v.s)
      const porVecinos = [...voto.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? SIN_FAMILIA
      if (porVecinos === real) r.vecinos += 1

      const porEscalera = reglaResolvio ? porRegla : porVecinos
      if (!reglaResolvio) r.mlNecesario += 1
      if (porEscalera === real) r.escalera += 1
      else {
        const k = `${real} → ${porEscalera}`
        fallosEscalera.set(k, (fallosEscalera.get(k) ?? 0) + 1)
      }
    }
  }

  const pc = (x) => `${((x / r.total) * 100).toFixed(1)}%`.padStart(7)
  console.log(`VALIDACIÓN CRUZADA en ${PLIEGUES} pliegues · ${r.total} predicciones · k=${K}`)
  console.log('─'.repeat(64))
  console.log(`  reglas (producción)      ${pc(r.reglas)}    resolvió ${pc(r.reglasResolvio)} de las filas`)
  console.log(`  vecinos (embeddings)     ${pc(r.vecinos)}    ${Math.round(msVecinos / r.total)} ms por fila`)
  console.log(`  reglas → vecinos         ${pc(r.escalera)}    el modelo hizo falta en ${pc(r.mlNecesario)}`)

  const mejora = ((r.escalera - r.reglas) / r.total) * 100
  console.log(`\n  DIFERENCIA de la escalera contra las reglas solas: ${mejora >= 0 ? '+' : ''}${mejora.toFixed(1)} puntos`)

  console.log('\n  LOS ERRORES QUE QUEDAN (real → predicho):')
  for (const [k, n] of [...fallosEscalera].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`    ${String(n).padStart(3)} × ${k}`)

  // ── LO QUE DE VERDAD IMPORTA: LAS 63 QUE NADIE CLASIFICÓ ──
  if (pendientes.length) {
    const vp = await embeber(MODELO, pendientes.map(textoDe), { rol: 'documento' })
    console.log(`\n  PROPUESTA PARA LAS ${pendientes.length} SIN CLASIFICAR (las 10 más seguras):`)
    const props = pendientes.map((f, i) => {
      const regla = familiaDeMaterial({ concepto: f.concepto, detalle: f.detalle_obra, proveedor: f.proveedor })
      const vec = etiquetadas.map((g, j) => ({ familia: g.familia_material, s: coseno(vp[i], vecs[j]) }))
        .sort((a, b) => b.s - a.s).slice(0, K)
      const voto = new Map()
      for (const v of vec) voto.set(v.familia, (voto.get(v.familia) ?? 0) + v.s)
      const [familia, peso] = [...voto.entries()].sort((a, b) => b[1] - a[1])[0] ?? [SIN_FAMILIA, 0]
      return { texto: textoDe(f), familia: regla && regla !== SIN_FAMILIA ? regla : familia,
        via: regla && regla !== SIN_FAMILIA ? 'regla' : 'vecinos', confianza: peso / K }
    }).sort((a, b) => b.confianza - a.confianza)
    for (const p of props.slice(0, 10)) {
      console.log(`    ${p.via.padEnd(8)} ${p.confianza.toFixed(3)}  ${p.texto.slice(0, 44).padEnd(45)} → ${p.familia}`)
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.stack || e.message); process.exit(1) })
}
