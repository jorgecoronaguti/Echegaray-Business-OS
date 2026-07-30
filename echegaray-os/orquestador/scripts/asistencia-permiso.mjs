#!/usr/bin/env node
// AUTORIZAR / REVOCAR / LISTAR los jefes de obra que pueden registrar asistencia.
//
// Los user_ids NO viven en el código ni en una migración: se otorgan con este script y se
// pueden revocar en un segundo sin desplegar nada. Es la única forma de habilitar el skill.
//
// Uso:
//   node orquestador/scripts/asistencia-permiso.mjs listar
//   node orquestador/scripts/asistencia-permiso.mjs otorgar <mattermost_user_id> "Nombre visible"
//   node orquestador/scripts/asistencia-permiso.mjs revocar <mattermost_user_id>
//   node orquestador/scripts/asistencia-permiso.mjs quien <username>     # resuelve el user_id en MM
//
// Para obtener el user_id de un jefe: `quien <username>` (usa MM_BOT_TOKEN), o en
// Mattermost: System Console → Users → el id de la ficha.

import { query, closePool } from '../lib/db.mjs'
import { otorgarPermiso, revocarPermiso, listarAutorizados, PERMISO_ASISTENCIA_WRITE } from '../lib/asistencia-permisos.mjs'

const [accion, valor, display] = process.argv.slice(2)
const port = { query }
const quienSoy = process.env.USER || process.env.LOGNAME || 'cli'

async function main() {
  switch (accion) {
    case 'listar': {
      const filas = await listarAutorizados(port)
      if (!filas.length) {
        console.log(`\nNADIE autorizado para ${PERMISO_ASISTENCIA_WRITE}.`)
        console.log('El skill está efectivamente apagado (fail-closed).\n')
        return
      }
      console.log(`\nAutorizados para ${PERMISO_ASISTENCIA_WRITE}:\n`)
      for (const f of filas) {
        console.log(`  ${f.activo ? '✓' : '✗'} ${f.plataforma_user_id}  ${f.display ?? '(sin nombre)'}`
          + `  · otorgó ${f.otorgado_por} · ${new Date(f.creado_at).toISOString().slice(0, 10)}${f.nota ? ` · ${f.nota}` : ''}`)
      }
      const activos = filas.filter((f) => f.activo).length
      console.log(`\n${activos} activo(s).${activos > 2 ? '  ⚠️ Se esperaban 2 jefes de obra: revisá si sobra alguien.' : ''}\n`)
      return
    }
    case 'otorgar': {
      if (!valor) throw new Error('falta el mattermost_user_id')
      const r = await otorgarPermiso(port, {
        plataformaUserId: valor, display: display ?? null, otorgadoPor: quienSoy,
        nota: 'jefe de obra — carga de asistencia desde Mattermost',
      })
      console.log(`✓ otorgado: ${r.plataforma_user_id} (${r.display ?? 'sin nombre'}) → ${r.permiso}`)
      return
    }
    case 'revocar': {
      if (!valor) throw new Error('falta el mattermost_user_id')
      const r = await revocarPermiso(port, { plataformaUserId: valor })
      console.log(r ? `✓ revocado: ${r.plataforma_user_id}` : '(no había permiso para ese usuario)')
      return
    }
    case 'quien': {
      if (!valor) throw new Error('falta el username de Mattermost')
      const base = process.env.MM_BASE_URL ?? 'http://127.0.0.1:8065'
      const token = process.env.MM_BOT_TOKEN
      if (!token) throw new Error('falta MM_BOT_TOKEN para consultar Mattermost')
      const res = await fetch(`${base}/api/v4/users/username/${encodeURIComponent(valor)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`mattermost ${res.status}`)
      const u = await res.json()
      console.log(`${u.username} → user_id: ${u.id}   (${[u.first_name, u.last_name].filter(Boolean).join(' ') || 'sin nombre'})`)
      return
    }
    default:
      console.log('Uso: listar | otorgar <user_id> "Nombre" | revocar <user_id> | quien <username>')
      process.exitCode = 1
  }
}

main()
  .catch((e) => { console.error(`✗ ${e.message}`); process.exitCode = 1 })
  .finally(() => closePool())
