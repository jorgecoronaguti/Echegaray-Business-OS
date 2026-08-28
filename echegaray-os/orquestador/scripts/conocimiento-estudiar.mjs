#!/usr/bin/env node
// ESTUDIAR UN DOCUMENTO — la cadena entera, etapa por etapa, sobre una URL o un archivo local.
//
//   node orquestador/scripts/conocimiento-estudiar.mjs https://www.inti.gob.ar/…/reglamento.pdf
//   node orquestador/scripts/conocimiento-estudiar.mjs --archivo /ruta/ficha.pdf --escribir
//   node orquestador/scripts/conocimiento-estudiar.mjs <url> --modelo      # extracción fina con IA
//
// ═══ POR QUÉ NO ESCRIBE POR DEFECTO ═══
//
// Sin `--escribir` no toca la biblioteca ni el padrón: imprime lo que HARÍA. En este repo un
// generador que corrió sin ensayo previo ya borró una pestaña entera, y la regla que quedó es que
// todo lo que persiste tiene primero un modo seco.
//
// ═══ Y POR QUÉ EL MODELO ESTÁ APAGADO POR DEFECTO ═══
//
// La cadena entera anda sin proveedor de razonamiento: clasifica, extrae lo que sale con reglas, y
// DECLARA qué campos quedaron sin resolver. Encender el modelo se pide a mano porque cuesta plata.
import * as B from '../lib/conocimiento/biblioteca.mjs'
import * as F from '../lib/conocimiento/fuentes.mjs'
import { PASO, RESULTADO, estudiar } from '../lib/conocimiento/estudiar.mjs'
import { contador } from '../lib/conocimiento/cache.mjs'
import { medidor } from '../lib/conocimiento/metricas.mjs'

const args = process.argv.slice(2)
const valor = (bandera) => (args.indexOf(bandera) === -1 ? null : args[args.indexOf(bandera) + 1])
const url = args.find((a) => /^https?:\/\//i.test(a)) ?? null
const archivo = valor('--archivo')
const escribir = args.includes('--escribir')
const conModelo = args.includes('--modelo')

if (!url && !archivo) {
  console.error('uso: conocimiento-estudiar.mjs <url> | --archivo <ruta> [--escribir] [--modelo] [--clase CLASE] [--refrescar]')
  process.exit(2)
}

const pedir = conModelo ? (await import('../lib/ia/cliente.mjs')).pedirTexto : null
if (conModelo && !process.env.ANTHROPIC_API_KEY) console.log('⚠ --modelo pedido y no hay ANTHROPIC_API_KEY: la extracción fina va a quedar declarada como no hecha, no inventada.\n')

const stats = contador()
const med = medidor()
const fuentes = F.cargar()
const bib = B.cargar()

const r = await estudiar({
  url, archivo, bib, fuentes, pedir, stats, medidor: med,
  cuando: new Date().toISOString().slice(0, 10),
  extraidoPor: `conocimiento-estudiar.mjs · ${process.env.USER ?? 'sin-usuario'}`,
  refrescar: args.includes('--refrescar'),
  clase: valor('--clase'),
})

const ICONO = { [RESULTADO.LOGRO]: '✔', [RESULTADO.DEGRADADO]: '◐', [RESULTADO.NO_LOGRO]: '✘', [RESULTADO.OMITIDO]: '·', [RESULTADO.PENDIENTE_HUMANO]: '✋', [RESULTADO.BLOQUEADO]: '⛔', [RESULTADO.YA_ESTUDIADO]: '≡' }

console.log(`\n═══ ESTUDIO DE ${url ?? archivo} ═══\n`)
for (const p of r.pasos) console.log(`  ${ICONO[p.resultado] ?? '?'} ${String(p.paso).padEnd(14)} ${String(p.resultado).padEnd(17)} ${p.porQue}`)

if (r.candidatos.length) {
  console.log(`\n  CANDIDATOS (${r.candidatos.length}) — ninguno se puede usar para cotizar hasta que lo firme alguien que no lo extrajo:`)
  for (const c of r.candidatos) {
    console.log(`\n    ${c.clave}`)
    console.log(`      valor       ${c.valor}`)
    console.log(`      procedencia ${c.procedencia} · estado ${c.estado} · confianza ${c.confianza}`)
    console.log(`      lo dice     «${String(c.evidencia.textoLiteral).slice(0, 120)}…»${c.evidencia.pagina ? ` (p. ${c.evidencia.pagina})` : ''}`)
    console.log(`      id          ${c.id}`)
  }
}
if (r.huecos?.length) {
  console.log(`\n  HUECOS DECLARADOS (${r.huecos.length}) — un hueco dicho vale más que un número inventado:`)
  for (const h of r.huecos) console.log(`    ${h.tipo.padEnd(11)} ${h.clave} — ${h.porQue}`)
}

const sinRazon = r.pasos.find((p) => p.paso === PASO.EXTRACCION)?.sinRazonamiento ?? []
if (sinRazon.length) console.log(`\n  SIN RAZONAMIENTO (${sinRazon.length}): ${sinRazon.join(', ')}\n    ${conModelo ? 'el modelo estaba encendido y aun así no los resolvió: el documento no los dice donde se los buscó' : 'corré con --modelo para intentarlos; hasta entonces NO están extraídos'}`)

if (escribir && r.bibProbada) {
  const vB = B.guardar(r.bibProbada)
  const vF = F.guardar(r.fuentes)
  console.log(`\n  ESCRITO · biblioteca v${vB} · padrón v${vF}`)
} else {
  console.log(`\n  EN SECO — no se escribió nada. Con --escribir se persisten ${r.candidatos.length} candidato(s) y el padrón.`)
}
console.log(`\n  caché ${JSON.stringify(stats.resumen())} · ${JSON.stringify(med.resumen({ cache: stats }).usd)} USD\n`)
process.exit(r.ok ? 0 : 1)
