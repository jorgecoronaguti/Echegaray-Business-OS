#!/usr/bin/env node
// ALARMA DE «SIN CRÉDITO» EN LA API DE ANTHROPIC. Lo corre el timer echegaray-alarma-credito cada 5 min.
//
//   node orquestador/scripts/alarma-credito-api.mjs          → una ronda (avisa al dueño si corresponde)
//   node orquestador/scripts/alarma-credito-api.mjs --ver    → muestra el último episodio, no avisa
//
// CERO llamadas a api.anthropic.com: lee orq.chat_cost. Ver lib/ia/alarma-credito.mjs.

import { getPool } from '../lib/db.mjs'
import { CLAVE_ESTADO, decidir, ronda, SQL_EPISODIO } from '../lib/ia/alarma-credito.mjs'
import { avisar } from './avisar-al-dueno.mjs'

const pool = getPool()
const puertos = {
  async leerEpisodio() {
    const [ep] = (await pool.query(SQL_EPISODIO)).rows
    return ep?.inicio ? ep : null
  },
  async leerAvisado() {
    const { rows } = await pool.query('select value from public.os_runtime where key = $1', [CLAVE_ESTADO])
    return rows[0]?.value ?? null
  },
  async guardarAvisado(id) {
    await pool.query(
      `insert into public.os_runtime (key, value, updated_at) values ($1, $2, now())
         on conflict (key) do update set value = excluded.value, updated_at = now()`, [CLAVE_ESTADO, id])
  },
  async avisar(texto) {
    // Sin respetar el silencio de «avisos del sistema»: con la API cortada la empresa no lee
    // comprobantes, y es justo el aviso que el dueño pidió.
    const r = await avisar(texto, { respetarPreferencia: false })
    console.log(`avisado a @${r.para} · post ${r.postId}`)
  },
}

try {
  if (process.argv.includes('--ver')) {
    const ep = await puertos.leerEpisodio()
    const d = decidir({ episodio: ep, avisado: await puertos.leerAvisado() })
    console.log(JSON.stringify({ episodio: ep, avisaria: d.avisar, texto: d.texto ?? null }, null, 1))
  } else {
    const r = await ronda({ puertos })
    const ep = r.episodio
    console.log(`${new Date().toISOString()} · ${ep ? `episodio ${new Date(ep.inicio).toISOString()} (${ep.fallas} rechazos, ${ep.recuperadoAt ? 'recuperado' : 'ABIERTO'})` : 'sin rechazos por crédito en 72 h'} · ${r.avisar ? 'AVISADO' : r.lineaDeBase ? 'línea de base (ya recuperado, no se avisa)' : 'sin aviso'}`)
  }
} catch (e) {
  console.error(`alarma-credito: ${e.message}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
