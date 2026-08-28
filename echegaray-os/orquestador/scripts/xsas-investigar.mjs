#!/usr/bin/env node
// INVESTIGAR UN DATO TÉCNICO QUE XSAS NO TIENE — por la cascada, no por internet directo.
//
// Recorre documentación → Base Maestra → experiencia → conocimiento del OS → referencias locales →
// web, se detiene en el primer paso que resuelve, e imprime el RECORRIDO COMPLETO: qué se probó
// antes, por qué no alcanzó, y con qué autoridad se resolvió al final.
//
// Existe como script y no sólo como librería porque una capacidad que sólo se puede ejercer desde
// el chat no se puede medir ni depurar.
//
//   node orquestador/scripts/xsas-investigar.mjs "relación jornal oficial / ayudante UOCRA vigente"
//   node orquestador/scripts/xsas-investigar.mjs "..." --marcas acindar,ternium

// `loadConfig` primero y por su efecto: es quien trae DATABASE_URL y la credencial del modelo a un
// proceso que no nació de systemd — como éste, que corre desde un worktree.
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { webSearch } from '../lib/web-search.mjs'
import { leerUrl } from '../lib/web/web-lectura.mjs'
import { aplicarPoliticaContenidoExterno } from '../lib/web/contenido-externo.mjs'
import { investigar, resolvedorWeb } from '../lib/plano/investigacion.mjs'
import { cargarReferenciaCircot } from '../lib/plano/pipeline.mjs'
import { buscar as buscarCircot } from '../lib/circot/referencia.mjs'

loadConfig()

const args = process.argv.slice(2)
const pregunta = args.find((a) => !a.startsWith('--'))
if (!pregunta) {
  console.error('uso: xsas-investigar.mjs "<pregunta técnica>" [--marcas a,b]')
  process.exit(1)
}
const marcas = (args.includes('--marcas') ? String(args[args.indexOf('--marcas') + 1] ?? '') : '').split(',').map((s) => s.trim()).filter(Boolean)

/** La Base Maestra sólo resuelve si tiene una tarea cuyo nombre contenga lo preguntado. No se
 *  fuerza: que la Base no tenga el dato es una respuesta legítima y hace avanzar la cascada. */
async function baseMaestra({ pregunta: p }) {
  const r = await query(
    `select tt.codigo, tt.nombre, tt.unidad from public.tarea_tipo tt
      where tt.activo is not false and exists (select 1 from public.analisis a where a.tarea_tipo_id = tt.id and a.vigente)
        and tt.nombre ilike $1 order by tt.codigo limit 5`, [`%${String(p).split(' ').filter((w) => w.length > 4)[0] ?? p}%`])
  if (!r.rows.length) return { resuelto: false, porQue: 'ninguna tarea vigente de la Base Maestra menciona eso' }
  return {
    resuelto: true, valor: r.rows.map((x) => `${x.codigo} ${x.nombre} [${x.unidad}]`).join(' · '),
    porQue: `${r.rows.length} tarea(s) de la Base Maestra lo mencionan`,
  }
}

/** Los documentos técnicos ya incorporados: hoy, la tabla del CIRCOT. */
function referenciaLocal({ pregunta: p }) {
  const ref = cargarReferenciaCircot()
  if (!ref) return { resuelto: false, porQue: 'no hay ninguna publicación del CIRCOT importada' }
  const c = buscarCircot({ nombre: p }, ref)
  if (!c.length) return { resuelto: false, porQue: `el CIRCOT ${ref.periodo} no tiene un ítem comparable` }
  return {
    resuelto: true, valor: `${c[0].descripcion} [${c[0].unidad}] MO ${c[0].mo_min}–${c[0].mo_max}`,
    porQue: `CIRCOT ${ref.periodo}, referencia externa local`,
  }
}

const t0 = Date.now()
const r = await investigar({
  pregunta,
  resolvedores: {
    BASE_MAESTRA: baseMaestra,
    REFERENCIA_LOCAL: referenciaLocal,
    WEB: resolvedorWeb({
      buscar: (q) => webSearch(q),
      leer: (u, o) => leerUrl(u, o),
      politica: aplicarPoliticaContenidoExterno,
      pistasFabricante: marcas,
    }),
  },
})

console.log(`\n═══ ${pregunta} ═══\n`)
for (const paso of r.recorrido) console.log(`  ${paso.estado.padEnd(15)} ${paso.paso.padEnd(24)} ${paso.porQue ?? ''}`)
console.log(`\nRESUELTO EN: ${r.resueltoEn ?? 'NINGÚN PASO — queda como FALTA_DATO'}`)
console.log(`FUENTE:      ${r.dato.fuente}`)
if (r.extra) {
  console.log(`AUTORIDAD:   ${r.extra.autoridad}`)
  console.log(`URL:         ${r.extra.url ?? '—'}`)
  console.log(`PUBLICADO:   ${r.extra.publicadoEn ?? 'sin fecha declarada'} · frescura: ${r.extra.frescura?.etiqueta ?? '—'}`)
  console.log(`CONSULTADO:  ${r.extra.consultadoEn}`)
  console.log(`ES HECHO ECSAS: ${r.extra.esHechoEcsas} — no asciende a ${r.extra.noAsciende.join(' / ')}`)
  if (r.extra.inyeccion?.sospechoso) console.log(`⚠️ contenido sospechoso de inyección: ${JSON.stringify(r.extra.inyeccion.marcas)}`)
  console.log('\nCANDIDATAS POR AUTORIDAD:')
  for (const c of r.extra.candidatas ?? []) console.log(`  ${String(c.autoridad).padEnd(20)} ${c.url}`)
}
console.log(`\nEVIDENCIA CITABLE:\n${String(r.dato.evidencia?.textoLiteral ?? '(sin evidencia citable)').slice(0, 700)}`)
console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s`)
process.exit(0)
