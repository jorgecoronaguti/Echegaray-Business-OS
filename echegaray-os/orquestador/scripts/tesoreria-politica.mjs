#!/usr/bin/env node
// POLÍTICAS DE TESORERÍA — proponer, ver y aprobar. La aprobación la hace una persona.
//
//   node orquestador/scripts/tesoreria-politica.mjs ver
//   node orquestador/scripts/tesoreria-politica.mjs proponer reserva_minima
//   node orquestador/scripts/tesoreria-politica.mjs aprobar reserva_minima --aprobador "Jorge Corona"
//   node orquestador/scripts/tesoreria-politica.mjs declarar caja_restringida --monto 0 --fuente "..." --aprobador "..."
//
// ═══ POR QUÉ ESTO ES UN COMANDO Y NO UN CAMPO EN UNA PANTALLA ═══
//
// El agente puede CALCULAR la reserva sobre datos reales. No puede aprobarla. Marcar al dueño como
// aprobador de algo que no miró sería falsificar la evidencia que el `CLAUDE.md` raíz exige — y sin
// aprobación real todo lo que el agente diga sigue siendo un techo técnico, no un monto ejecutable.
//
// `--aprobador` es obligatorio en `aprobar` y `declarar`: sin un nombre no hay quién responda por el
// número, y una política sin responsable no es una política.

import { query, closePool } from '../lib/db.mjs'
import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { leerFlujoDeFondos } from '../lib/tesoreria/lectura-flujo.mjs'
import { proponerReservaMinima, estadoReserva, modelarCajaRestringida, ESTADO_POLITICA } from '../lib/tesoreria/politicas.mjs'

const argv = process.argv.slice(2)
const cmd = argv[0]
const clave = argv[1]
const flag = (n, def = null) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const $ = (n) => (n == null ? 'sin dato' : '$' + Math.round(n).toLocaleString('es-AR'))

/** La fila vigente de una clave. `null` si no hay ninguna. */
async function filaVigente(k) {
  const { rows } = await query(
    `select * from tesoreria.politicas
      where clave = $1 and vigente_desde <= now() and (vigente_hasta is null or vigente_hasta > now())
      order by vigente_desde desc limit 1`, [k],
  )
  return rows[0] ?? null
}

async function ver() {
  const { rows } = await query(
    `select clave, valor, aprobada_por, aprobada_en, vigente_desde, vigente_hasta, motivo, creada_en
       from tesoreria.politicas order by clave, vigente_desde desc`,
  )
  if (!rows.length) { console.log('No hay ninguna política cargada. Todo el análisis sale como techo técnico preliminar.'); return }
  for (const r of rows) {
    const est = r.aprobada_por ? `APROBADA por ${r.aprobada_por}` : 'PROPUESTA (sin aprobar)'
    const vig = r.vigente_hasta ? `hasta ${r.vigente_hasta.toISOString?.().slice(0, 10) ?? r.vigente_hasta}` : 'vigente'
    console.log(`${r.clave.padEnd(20)} ${JSON.stringify(r.valor)}  ${est}  ${vig}`)
  }
}

async function proponer() {
  if (clave !== 'reserva_minima') throw new Error('sólo se puede proponer `reserva_minima` automáticamente')
  const google = makeGoogleClient({ config: loadConfig(), scopes: WORKSPACE_SCOPES })
  const flujo = await leerFlujoDeFondos({ google }, { dias: 30 })
  if (flujo.estado !== 'ok') throw new Error(`no se pudo leer el Flujo de Caja: ${flujo.motivo}`)
  const p = proponerReservaMinima(flujo.dias, { colchon: Number(flag('colchon', 0)) })
  if (p.monto == null) throw new Error(p.motivo)

  console.log('\nPROPUESTA DE RESERVA MÍNIMA')
  for (const [k, v] of Object.entries(p.componentes)) console.log(`  ${k.padEnd(36)} ${$(v)}`)
  console.log(`  ${'→ máximo (no la suma)'.padEnd(36)} ${$(p.monto)}`)
  console.log(`\n  método: ${p.metodo} · fuente: ${p.fuente}`)
  console.log(`  ${p.explicacion}`)

  // SE GUARDA COMO PROPUESTA, SIN APROBADOR. Persistir no es aprobar.
  await query(
    `insert into tesoreria.politicas (clave, valor, motivo) values ($1, $2, $3)`,
    ['reserva_minima', JSON.stringify({
      monto: p.monto, unidad: p.unidad, metodo: p.metodo, componentes: p.componentes,
      dias_ventana: p.dias_ventana, fuente: p.fuente, version: p.version, explicacion: p.explicacion,
    }), 'propuesta automática sobre el calendario real'],
  )
  console.log('\n  Guardada como PROPUESTA. Mientras no se apruebe, todo sale como techo técnico preliminar.')
  console.log(`  Para aprobarla:\n    node orquestador/scripts/tesoreria-politica.mjs aprobar reserva_minima --aprobador "<tu nombre>"`)
}

async function aprobar() {
  const aprobador = flag('aprobador')
  if (!aprobador) throw new Error('falta --aprobador "<nombre>": una política sin responsable no es una política')
  const fila = await filaVigente(clave)
  if (!fila) throw new Error(`no hay una propuesta vigente para "${clave}". Corré primero: proponer ${clave}`)
  if (fila.aprobada_por) { console.log(`"${clave}" ya está aprobada por ${fila.aprobada_por}.`); return }

  // Una política se aprueba con una fila NUEVA y se cierra la anterior: así queda el historial de qué
  // regla regía cuándo. Un update en caliente borraría esa respuesta para siempre.
  await query('update tesoreria.politicas set vigente_hasta = now() where id = $1', [fila.id])
  await query(
    `insert into tesoreria.politicas (clave, valor, aprobada_por, aprobada_en, motivo)
     values ($1, $2, $3, now(), $4)`,
    [clave, fila.valor, aprobador, flag('motivo', `aprobada a mano por ${aprobador}`)],
  )
  const nueva = estadoReserva(await filaVigente(clave))
  console.log(`✓ "${clave}" APROBADA por ${aprobador}: ${$(nueva.monto)}`)
  console.log('  A partir de la próxima corrida el monto sale como excedente aprobado, no como techo técnico.')
}

async function declarar() {
  const aprobador = flag('aprobador')
  const monto = flag('monto')
  if (!aprobador) throw new Error('falta --aprobador "<nombre>"')
  if (monto == null) throw new Error('falta --monto (usá 0 para declarar explícitamente que no hay fondos afectados)')
  const valor = { monto: Number(monto), fuente: flag('fuente', 'declaración manual'), declarada_en: new Date().toISOString() }
  const check = modelarCajaRestringida(valor)
  if (check.restricted_cash_amount == null) throw new Error(`el monto no es válido: ${check.motivo}`)
  const fila = await filaVigente(clave)
  if (fila) await query('update tesoreria.politicas set vigente_hasta = now() where id = $1', [fila.id])
  await query(
    `insert into tesoreria.politicas (clave, valor, aprobada_por, aprobada_en, motivo)
     values ($1, $2, $3, now(), $4)`,
    [clave, JSON.stringify(valor), aprobador, flag('motivo', 'declaración manual')],
  )
  console.log(`✓ "${clave}" declarada por ${aprobador}: ${$(valor.monto)} (${check.restricted_cash_status})`)
}

const COMANDOS = { ver, proponer, aprobar, declarar }

async function main() {
  const fn = COMANDOS[cmd]
  if (!fn) {
    console.log('Uso: tesoreria-politica.mjs <ver|proponer|aprobar|declarar> [clave] [--aprobador "..."] [--monto N] [--fuente "..."]')
    process.exitCode = 1
    return
  }
  if (cmd !== 'ver' && !clave) throw new Error('falta la clave de la política')
  await fn()
  if (cmd !== 'ver') {
    const est = estadoReserva(await filaVigente('reserva_minima'))
    if (est.estado !== ESTADO_POLITICA.APROBADA) {
      console.log(`\n⚠ reserva_minima sigue ${est.estado}: las recomendaciones seguirán NO_ACCIONABLE.`)
    }
  }
}

main()
  .catch((e) => { console.error('[politica] ' + e.message); process.exitCode = 1 })
  .finally(() => closePool())
