#!/usr/bin/env node
// SINCRONIZA EL CATÁLOGO DE CAPACIDADES: disco → public.knowledge_frameworks.
//
// El disco manda. Cada corrida lee el frontmatter de las 44 `.claude/skills/*/SKILL.md` y deja la
// tabla EXACTAMENTE igual al archivo. Idempotente: correrlo dos veces seguidas no cambia nada
// (la segunda corrida reporta 0 cambios), y correrlo después de editar una skill actualiza sólo
// esa fila.
//
// Lo que NO hace, a propósito:
//   · No borra filas que ya no estén en disco — las marca `estado='archivado'`. Una skill retirada
//     tiene historia (veces_usado) y borrarla escondería que existió. La guarda del OS: un
//     generador no borra, marca.
//   · No inventa campos. Inputs, outputs y fuentes no están declarados en ninguna SKILL.md; quedan
//     NULL hasta que alguien los declare en el frontmatter.
//
// Uso:
//   node orquestador/scripts/xsas-skills-sync.mjs            # sincroniza y reporta
//   node orquestador/scripts/xsas-skills-sync.mjs --dry      # muestra qué haría, no escribe
//   node orquestador/scripts/xsas-skills-sync.mjs --json     # salida para otro programa
//   node orquestador/scripts/xsas-skills-sync.mjs --uso      # el uso real: qué capacidad se usa,
//                                                            # cuánto se resolvió sin modelo y qué cuesta
import { query, closePool } from '../lib/db.mjs'
import { leerCatalogoDeDisco, skillsSinDeclarar, resumenPorEstado } from '../lib/skill-catalogo.mjs'
import { usoPorCapacidad, resumenResolucion } from '../lib/skill-metricas.mjs'

/** ¿La fila de la base ya dice lo mismo que el archivo? Compara sólo lo que el sync gobierna. */
function filaIgual(fila, f) {
  if (!fila) return false
  const mismoArray = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || [])
  return fila.hash === f.hash
    && fila.area === f.area
    && fila.estado_operativo === f.estadoOperativo
    && fila.nivel_ia === f.nivelIa
    && fila.tipo === f.tipo
    && mismoArray(fila.capacidades, f.capacidades)
    && mismoArray(fila.modulos_os, f.modulos)
    && mismoArray(fila.tools, f.tools)
}

/**
 * Deja `public.knowledge_frameworks` igual al disco.
 * @param {{dry?:boolean, dir?:string, ejecutar?:Function}} [opts]  `ejecutar` es el puerto a la
 *        base (por defecto el real). Se inyecta en los tests para poder probar la idempotencia sin
 *        tocar datos productivos — la propiedad que importa acá no es que escriba, es que la
 *        SEGUNDA corrida no cambie nada.
 * @returns {Promise<{total:number, nuevas:string[], actualizadas:string[], sinCambio:number,
 *                    archivadas:string[], sinDeclarar:string[], porEstado:object}>}
 */
export async function sincronizarCatalogo({ dry = false, dir, ejecutar = query } = {}) {
  const fichas = await leerCatalogoDeDisco({ dir, refrescar: true })
  const { rows } = await ejecutar(
    `select clave, area, tipo, hash, nivel_ia, estado_operativo, capacidades, modulos_os, tools, estado
       from public.knowledge_frameworks`)
  const enBase = new Map(rows.map((r) => [r.clave, r]))

  const nuevas = []
  const actualizadas = []
  let sinCambio = 0

  for (const f of fichas) {
    const fila = enBase.get(f.clave)
    if (filaIgual(fila, f)) { sinCambio++; continue }
    ;(fila ? actualizadas : nuevas).push(f.clave)
    if (dry) continue
    // `objetivo` se conserva si ya existía (lo escribió el seed desde el cuerpo de la skill) y si
    // no, se toma la descripción: es lo que dice para qué sirve. `veces_usado` NO se toca: es
    // historia de uso, no metadata del archivo.
    await ejecutar(
      `insert into public.knowledge_frameworks
         (clave, nombre, objetivo, area, ruta, descripcion, tipo, tools, capacidades, modulos_os,
          nivel_ia, estado_operativo, motivo_estado, hash, bytes, sincronizado_en, estado)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now(), 'vigente')
       on conflict (clave) do update set
         nombre=excluded.nombre,
         objetivo=coalesce(public.knowledge_frameworks.objetivo, excluded.objetivo),
         area=excluded.area, ruta=excluded.ruta, descripcion=excluded.descripcion, tipo=excluded.tipo,
         tools=excluded.tools, capacidades=excluded.capacidades, modulos_os=excluded.modulos_os,
         nivel_ia=excluded.nivel_ia, estado_operativo=excluded.estado_operativo,
         motivo_estado=excluded.motivo_estado, hash=excluded.hash, bytes=excluded.bytes,
         estado='vigente', sincronizado_en=now(), updated_at=now()`,
      [f.clave, f.nombre, f.descripcion, f.area, f.ruta, f.descripcion, f.tipo, f.tools,
        f.capacidades, f.modulos, f.nivelIa, f.estadoOperativo, f.motivoLegacy, f.hash, f.bytes],
    )
  }

  // Skills que estaban en la base y ya no están en disco: se archivan, no se borran.
  const enDisco = new Set(fichas.map((f) => f.clave))
  const archivadas = rows.filter((r) => !enDisco.has(r.clave) && r.estado !== 'archivado').map((r) => r.clave)
  if (!dry) {
    for (const clave of archivadas) {
      await ejecutar(
        `update public.knowledge_frameworks
            set estado='archivado', estado_operativo='retirada',
                motivo_estado='ya no existe en .claude/skills', sincronizado_en=now(), updated_at=now()
          where clave=$1`, [clave])
    }
  }

  return {
    total: fichas.length, nuevas, actualizadas, sinCambio, archivadas,
    sinDeclarar: skillsSinDeclarar(fichas), porEstado: resumenPorEstado(fichas),
  }
}

/** El uso real de cada capacidad. Es la consulta que contesta si el catálogo sirve o decora. */
async function reportarUso() {
  const g = await resumenResolucion({ dias: 30 })
  console.log('USO DE LAS CAPACIDADES — últimos 30 días')
  console.log(`  pedidos instrumentados : ${g.total}`)
  console.log(`  resueltos SIN modelo   : ${g.sin_llm} (${g.pctSinLlm ?? '—'}%)`)
  console.log(`  con modelo             : ${g.con_llm} — US$${g.usd ?? 0}`)
  if (!g.total) {
    console.log('\n  Sin datos todavía: `skills`/`resolucion` se empiezan a escribir con la migración')
    console.log('  20260827T1400 aplicada. Un cero acá NO significa que nadie usó el OS.')
    return
  }
  const filas = await usoPorCapacidad({ soloUsadas: true })
  console.log(`\n  ${'capacidad'.padEnd(40)} ${'ejec'.padStart(5)} ${'s/LLM'.padStart(6)} ${'err'.padStart(4)} ${'ms'.padStart(6)} ${'US$'.padStart(8)}`)
  for (const f of filas) {
    console.log(`  ${String(f.clave).padEnd(40)} ${String(f.ejecuciones).padStart(5)} ${String(f.pct_sin_llm ?? '—').padStart(6)} ${String(f.errores ?? 0).padStart(4)} ${String(f.ms_promedio ?? '—').padStart(6)} ${String(f.usd ?? 0).padStart(8)}`)
  }
}

async function main() {
  if (process.argv.includes('--uso')) return reportarUso()
  const dry = process.argv.includes('--dry')
  const json = process.argv.includes('--json')
  const r = await sincronizarCatalogo({ dry })
  if (json) { console.log(JSON.stringify(r, null, 2)); return }

  console.log(`CATÁLOGO DE CAPACIDADES XSAS${dry ? ' (--dry: no se escribió nada)' : ''}`)
  console.log(`  skills en disco : ${r.total}`)
  console.log(`  nuevas          : ${r.nuevas.length}${r.nuevas.length ? ` — ${r.nuevas.join(', ')}` : ''}`)
  console.log(`  actualizadas    : ${r.actualizadas.length}${r.actualizadas.length ? ` — ${r.actualizadas.join(', ')}` : ''}`)
  console.log(`  sin cambio      : ${r.sinCambio}`)
  if (r.archivadas.length) console.log(`  archivadas      : ${r.archivadas.join(', ')} (ya no están en disco)`)
  console.log('\n  Estado operativo:')
  for (const [estado, n] of Object.entries(r.porEstado).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${estado.padEnd(16)} ${n}`)
  }
  if (r.sinDeclarar.length) {
    console.log(`\n  SIN DECLARAR (${r.sinDeclarar.length}): ${r.sinDeclarar.join(', ')}`)
    console.log('  Una skill sin área, sin capacidad que la rutee y sin tipo declarado no la puede activar nadie.')
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('FALLÓ:', e.message); process.exitCode = 1 }).finally(() => closePool().catch(() => {}))
}
