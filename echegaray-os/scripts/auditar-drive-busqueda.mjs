#!/usr/bin/env node
// ¿POR QUÉ EL BUSCADOR DEVOLVIÓ ESE ARCHIVO? — la respuesta, con los números.
//
// Un buscador que elige por vos y no puede decir por qué te obliga a confiar a ciegas o a no
// usarlo. Esta herramienta abre cualquier búsqueda ya hecha y muestra el desglose completo:
// qué candidatos había, cuánto sacó cada uno y qué señal decidió.
//
// SÓLO LEE. Ninguna opción escribe en la base ni toca Drive: se puede correr sobre producción
// sin pensarlo dos veces. `--consulta` vuelve a buscar en vivo, pero no registra el evento —
// una auditoría que ensucia lo que audita no sirve.
//
// Uso:
//   node scripts/auditar-drive-busqueda.mjs                      métricas del buscador
//   node scripts/auditar-drive-busqueda.mjs --evento 42          por qué ganó, en esa búsqueda
//   node scripts/auditar-drive-busqueda.mjs --ultimo u-jorge     la última búsqueda de alguien
//   node scripts/auditar-drive-busqueda.mjs --consulta "flujo"   busca ahora y explica
//   node scripts/auditar-drive-busqueda.mjs --alias              los alias aprendidos
//   node scripts/auditar-drive-busqueda.mjs --sin-resultado      lo que nadie encontró

import pg from 'pg'
import { parseConnectionString } from '../orquestador/lib/db.mjs'
import { crearIndice, buscar } from '../orquestador/lib/drive-busqueda/buscar.mjs'
import { leerEvento, ultimoEvento } from '../orquestador/lib/drive-busqueda/registro.mjs'
import { explicarEvento, explicarCandidato, explicarComparacion } from '../orquestador/lib/drive-busqueda/explicar.mjs'
import { panel } from '../orquestador/lib/drive-busqueda/metricas.mjs'

if (!process.env.DATABASE_URL) {
  console.error('falta DATABASE_URL: la auditoría no sabe qué base mirar')
  process.exit(2)
}

const args = process.argv.slice(2)
const opcion = (nombre) => {
  const i = args.indexOf(nombre)
  return i >= 0 ? (args[i + 1] ?? true) : null
}

const p = parseConnectionString(process.env.DATABASE_URL)
const pool = new pg.Pool({
  host: p.host, port: p.port, user: p.user, password: p.password, database: p.database,
  ssl: { rejectUnauthorized: false }, max: 2,
})

const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const titulo = (t) => `\n${t}\n${'─'.repeat(t.length)}`

async function mostrarMetricas() {
  const { salud, documentos, alias, sinResultado, distribucion } = await panel(pool)
  if (!salud || !salud.busquedas) {
    console.log('Todavía no hay búsquedas registradas.')
    return
  }
  console.log(titulo('SALUD DEL BUSCADOR'))
  console.log(`  búsquedas            ${salud.busquedas}   (${salud.usuarios} personas)`)
  console.log(`  resueltas solas      ${salud.directas}  ${pct(salud.tasaDirecta)}`)
  console.log(`  propuestas           ${salud.propuestas}`)
  console.log(`  hubo que preguntar   ${salud.aclaraciones}`)
  console.log(`  sin resultado        ${salud.sinResultado}  ${pct(salud.tasaSinResultado)}`)
  console.log(`  confirmadas          ${salud.confirmadas}`)
  console.log(`  rechazadas           ${salud.rechazadas}`)
  // LA MÉTRICA QUE IMPORTA. Rápido y equivocado es peor que lento y correcto.
  console.log(`  CORREGIDAS           ${salud.corregidas}  ${pct(salud.tasaCorreccion)}  ← la que hay que mirar`)
  console.log(`  tiempo               ${salud.msPromedio} ms promedio · ${salud.msP95} ms p95`)

  if (distribucion.length) {
    console.log(titulo('PUNTAJE DEL GANADOR'))
    for (const d of distribucion) console.log(`  ${d.tramo.padEnd(12)} ${d.veces}`)
  }
  if (documentos.length) {
    console.log(titulo('MÁS BUSCADOS'))
    for (const d of documentos) {
      console.log(`  ${String(d.veces).padStart(4)}  ${d.nombre ?? d.drive_file_id}  (confirmados ${d.confirmadas})`)
    }
  }
  if (alias.length) {
    console.log(titulo('CÓMO LO PIDEN'))
    for (const a of alias) {
      const destino = a.documento ? `→ ${a.documento} (${a.origen}, confianza ${a.confianza})` : '· sin alias todavía'
      console.log(`  ${String(a.busquedas).padStart(4)}  "${a.alias}"  ${destino}`)
    }
  }
  if (sinResultado.length) {
    console.log(titulo('NO ENCONTRÓ NADA'))
    for (const s of sinResultado) console.log(`  ${String(s.veces).padStart(4)}  "${s.ejemplo}"`)
  }
}

async function explicarConsulta(texto) {
  const indice = crearIndice({ port: pool })
  const r = await buscar({ indice, texto })
  console.log(titulo(`"${texto}"`))
  console.log(`  etapa ${r.etapa ?? '—'} · confianza ${r.confianza} · ${r.ms} ms sobre ${r.evaluados} archivos`)
  if (r.alias) console.log(`  alias aprendido → ${r.alias.drive_file_id} (${r.alias.origen}, ${r.alias.confianza})`)
  if (!r.opciones.length) { console.log('  sin candidatos'); return }
  const [primero, segundo] = r.opciones.map((e) => ({ ...e, name: e.name, id: e.drive_file_id }))
  console.log(`\n${explicarCandidato(primero, { titulo: `${r.ganador ? 'Gana' : 'Primero (sin ganador claro)'}: ${primero.name}` })}`)
  console.log(`\n${explicarComparacion(primero, segundo)}`)
  if (r.opciones.length > 1) {
    console.log('\nLos demás:')
    for (const o of r.opciones.slice(1)) console.log(`  ${String(Math.round(o.score)).padStart(6)}  ${o.name}`)
  }
}

async function main() {
  const evento = opcion('--evento')
  const ultimo = opcion('--ultimo')
  const consulta = opcion('--consulta')

  if (evento) console.log(explicarEvento(await leerEvento(pool, Number(evento))))
  else if (ultimo) {
    const e = await ultimoEvento(pool, ultimo === true ? '' : ultimo)
    console.log(explicarEvento(e && await leerEvento(pool, e.id)))
  } else if (consulta) await explicarConsulta(String(consulta))
  else if (args.includes('--alias')) {
    const { rows } = await pool.query(
      `select alias_norm, drive_file_id, confianza, origen, usos, usuarios, actualizado_at
         from public.drive_alias_documento order by usos desc`,
    )
    if (!rows.length) console.log('Todavía no hay alias aprendidos.')
    for (const a of rows) {
      console.log(`  "${a.alias_norm}" → ${a.drive_file_id}  ${a.origen} · confianza ${a.confianza} · ${a.usos} usos de ${a.usuarios} personas`)
    }
  } else await mostrarMetricas()
  await pool.end()
}

main().catch(async (e) => {
  console.error(`auditoría: ${e?.message ?? e}`)
  await pool.end().catch(() => {})
  process.exit(1)
})
