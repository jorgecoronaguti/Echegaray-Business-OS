#!/usr/bin/env node
// EL TRABAJO PESADO, FUERA DEL CAMINO CRÍTICO.
//
// ═══ LA REGLA QUE ESTE SCRIPT EXISTE PARA CUMPLIR ═══
//
//   «Más conocimiento NO puede implicar recorrer toda la biblioteca en cada cotización.»
//
// Cotizar lee la biblioteca como está —un `find` sobre lo ya estudiado, sin red y sin modelo—.
// Revisar si una fuente venció, si un reglamento cambió de versión y estudiar lo que falta cuesta
// minutos y megabytes, y eso NO puede pasar mientras alguien espera un presupuesto. Pasa acá,
// aparte, cuando no molesta: NINGUNA COTIZACIÓN ESPERA A ESTE SCRIPT.
//
//   node orquestador/scripts/conocimiento-mantener.mjs            # sólo dice qué haría
//   node orquestador/scripts/conocimiento-mantener.mjs --dry      # lo mismo, dicho explícito
//   node orquestador/scripts/conocimiento-mantener.mjs --aplicar  # sale a la red y persiste
//   node orquestador/scripts/conocimiento-mantener.mjs --aplicar --tope 3
//
// ═══ POR QUÉ EL MODO SECO ES EL DEFECTO ═══
//
// Porque este script baja documentos, escribe la biblioteca y mueve el padrón. En este repo lo que
// persiste sin ensayo previo ya borró trabajo. Para actuar hay que pedirlo con todas las letras.
import * as B from '../lib/conocimiento/biblioteca.mjs'
import * as F from '../lib/conocimiento/fuentes.mjs'
import { RESULTADO, estudiar } from '../lib/conocimiento/estudiar.mjs'
import { contador } from '../lib/conocimiento/cache.mjs'

const args = process.argv.slice(2)
const aplicar = args.includes('--aplicar')
const tope = Number(args[args.indexOf('--tope') + 1]) || 5
const hoy = new Date().toISOString().slice(0, 10)

console.log('\n═══ MANTENIMIENTO DE LA BIBLIOTECA TÉCNICA ═══')
console.log('  FUERA DEL CAMINO CRÍTICO: ninguna cotización espera a este script. Cotizar lee la')
console.log('  biblioteca tal como está; lo de acá la deja mejor para la PRÓXIMA vez.')
console.log(`  modo: ${aplicar ? 'APLICAR — sale a la red y escribe' : 'SECO — dice qué haría y no hace nada'} · tope ${tope} documento(s)\n`)

let fuentes = F.cargar()
let bib = B.cargar()
const inv = B.inventario(bib)
console.log(`  padrón      ${fuentes.length} fuente(s) · ${JSON.stringify(cuenta(fuentes, 'estado'))}`)
console.log(`  biblioteca  v${inv.version} · ${inv.documentos} documento(s) ${JSON.stringify(inv.porEtapa)} · ${inv.conocimientos} conocimiento(s) ${JSON.stringify(inv.porEstado)}\n`)

// ═══ 1 · LAS FUENTES CUYA REVISIÓN VENCIÓ ═══
const vencidas = F.vencidas(fuentes, hoy)
console.log(`── 1 · REVISIÓN VENCIDA (${vencidas.length}) ──`)
for (const f of vencidas.slice(0, 40)) {
  console.log(`   ${f.estado.padEnd(11)} ${f.id.padEnd(24)} cada ${String(f.frecuenciaDias).padStart(4)} d · revisada ${f.revisado ?? 'NUNCA'} · ${f.url}`)
}
if (!vencidas.length) console.log('   ninguna: todas revisadas dentro de su frecuencia\n')

// ═══ 2 · LOS DOCUMENTOS QUE QUEDARON A MEDIO ESTUDIAR ═══
const aMedias = (bib.documentos ?? []).filter((d) => d.etapa !== B.ETAPA.ESTUDIADO && d.url)
console.log(`\n── 2 · DOCUMENTOS SIN TERMINAR DE ESTUDIAR (${aMedias.length}) ──`)
for (const d of aMedias.slice(0, 40)) console.log(`   ${String(d.etapa).padEnd(11)} ${d.id} ${d.titulo ?? d.url}`)
if (!aMedias.length) console.log('   ninguno: todo documento incorporado llegó a ESTUDIADO')

// ═══ 3 · EL PLAN ═══
// Se estudia primero lo que quedó a medias —ya se pagó bajarlo— y después las fuentes vencidas.
const plan = [
  ...aMedias.map((d) => ({ url: d.url, porQue: `quedó en ${d.etapa}`, fuenteId: d.fuenteId })),
  ...vencidas.map((f) => ({ url: f.url, porQue: `revisión vencida (cada ${f.frecuenciaDias} d, última ${f.revisado ?? 'nunca'})`, fuenteId: f.id })),
].filter((x, i, a) => a.findIndex((y) => y.url === x.url) === i).slice(0, tope)

console.log(`\n── 3 · PLAN (${plan.length} de ${aMedias.length + vencidas.length} candidatos, tope ${tope}) ──`)
for (const p of plan) console.log(`   estudiar  ${p.url}\n             ${p.porQue}`)
if (!plan.length) console.log('   nada que hacer')

if (!aplicar) {
  console.log('\n  MODO SECO — no se bajó nada, no se escribió nada. Con --aplicar se corre el plan de arriba.\n')
  process.exit(0)
}

// ═══ 4 · CORRER EL PLAN ═══
const stats = contador()
console.log('\n── 4 · CORRIENDO ──')
let nuevos = 0
let cambios = 0
for (const p of plan) {
  const r = await estudiar({ url: p.url, bib, fuentes, stats, cuando: hoy, extraidoPor: 'conocimiento-mantener.mjs' })
  fuentes = r.fuentes
  const versionado = r.pasos.find((x) => x.paso === 'VERSIONADO')
  const adq = r.pasos.find((x) => x.paso === 'ADQUISICION')
  if (versionado?.cambioDeVersion) cambios += 1
  // Se marca revisada SÓLO si se la pudo mirar. Un fallo de red no es una revisión: escribir
  // `revisado` igual haría que la fuente quedara «al día» sin que nadie la haya visto nunca.
  if (p.fuenteId && adq?.resultado === RESULTADO.LOGRO) {
    fuentes = F.revisar(fuentes, p.fuenteId, { cuando: hoy, hash: versionado?.hash ?? null })
  }
  if (r.bibProbada) { bib = r.bibProbada; nuevos += r.candidatos.length }
  const estado = r.yaEstudiado ? '≡ ya estudiado' : (r.ok ? `✔ ${r.candidatos.length} candidato(s)` : `✘ ${r.pasos.find((x) => x.resultado === RESULTADO.NO_LOGRO)?.porQue ?? 'no llegó a candidato'}`)
  console.log(`   ${estado.padEnd(46)} ${p.url}`)
}

const vB = B.guardar(bib)
const vF = F.guardar(fuentes)
console.log(`\n  ESCRITO · biblioteca v${vB} (+${nuevos} candidato(s)) · padrón v${vF} · ${cambios} fuente(s) con contenido nuevo`)
console.log(`  caché ${JSON.stringify(stats.resumen())}`)
console.log('\n  Lo nuevo entra CANDIDATO: nada de esto se puede usar para cotizar hasta que lo firme una persona.\n')

function cuenta(lista, campo) { return lista.reduce((a, x) => { a[x[campo]] = (a[x[campo]] ?? 0) + 1; return a }, {}) }
