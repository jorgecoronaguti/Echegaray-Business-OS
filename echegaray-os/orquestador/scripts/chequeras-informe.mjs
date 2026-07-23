#!/usr/bin/env node
// INFORME DEL PADRÓN DE CHEQUERAS — ¿falta algún cheque físico entre dos que sí se usaron?
//
// QUÉ HACE. (1) Aplica la migración del padrón si hace falta (idempotente). (2) Lee la columna Nro de
// 'Cheques Emitidos' — la fuente única de qué números se usaron, NO se copia acá. (3) Cruza el padrón
// contra esos números con la capacidad determinística chequeras.mjs (0 API). (4) Imprime qué
// chequeras hay, cuántos cheques usados, qué huecos, qué está DESCONOCIDO, y señala los CPD sin
// beneficiario.
//
// NO ESCRIBE EN EL SHEET. 'Cheques Emitidos' es de carga del dueño (Regla 0): sólo se lee.
//
//   node orquestador/scripts/chequeras-informe.mjs
//
// Requiere DATABASE_URL y la credencial de Google (service account) en el entorno del worker.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { query } from '../lib/db.mjs'
import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { auditarPadron } from '../lib/chequeras.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIGRACION = join(RAIZ, 'supabase', 'migrations', '20260723130000_chequeras.sql')
const SHEET_ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'Cheques Emitidos'

// Parsea un importe es-AR ("$1.000.000,00" -> 1000000): el punto es separador de miles y la coma es
// decimal. Sacar todo lo no-dígito junto convertiría 1.000.000,00 en 100000000.
const parseMonto = (s) => {
  const entero = String(s ?? '').split(',')[0].replace(/[^0-9]/g, '')
  return entero ? Number(entero) : 0
}
const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR')

async function asegurarPadron() {
  const { rows: [{ hay }] } = await query(
    "select exists(select 1 from information_schema.tables where table_schema='public' and table_name='chequeras') as hay",
  )
  if (!hay) {
    process.stderr.write('· creando tabla chequeras + seed…\n')
    await query(readFileSync(MIGRACION, 'utf8'))
  }
  const { rows } = await query(
    'select identificador, banco, cuenta, tipo, numero_desde, numero_hasta, rango_confianza, numeros_conocidos, estado, observacion from public.chequeras order by tipo, identificador',
  )
  return rows
}

async function leerRegistro() {
  const google = makeGoogleClient({ config: loadConfig() }) // scopes por defecto = READONLY
  const filas = (await google.readSheetValues(SHEET_ID, `${PESTANA}!A1:F200`)) || []
  const hi = filas.findIndex((f) => String(f?.[0] ?? '').trim().toLowerCase() === 'tipo')
  if (hi < 0) throw new Error(`No encuentro el encabezado (col A = "Tipo") en ${PESTANA}`)
  // Col A = Tipo (FISICO/ECHEQ), Col B = Nro, Col E = Proveedor, Col F = Monto.
  return filas.slice(hi + 1)
    .filter((f) => /^(FISICO|ECHEQ)$/i.test(String(f?.[0] ?? '').trim()))
    .map((f) => ({ tipo: String(f[0]).trim().toUpperCase(), numero: f[1], proveedor: f[4], monto: f[5] }))
}

function imprimir(padron, registro, inf) {
  const L = (s = '') => process.stdout.write(s + '\n')
  L('══════════════════════════════════════════════════════════════════')
  L('  PADRÓN DE CHEQUERAS — Echegaray · cuenta 179-091383/6')
  L('══════════════════════════════════════════════════════════════════')
  L(`  Cheques físicos registrados: ${inf.total_fisicos} (${inf.fisicos_distintos} números distintos)`)
  L('  Los echeqs NO se auditan acá: no salen de una chequera de papel.')
  L('')

  L('  CHEQUERAS CONOCIDAS')
  L('  ───────────────────')
  for (const v of inf.por_chequera) {
    const c = padron.find((p) => p.identificador === v.identificador) || {}
    const marca = v.veredicto === 'hallazgo' ? '⚠ HALLAZGO' : v.veredicto === 'ok' ? '✓ ok' : '· no verificable'
    L(`  ${v.identificador}  [${v.tipo}]  ${marca}`)
    L(`     banco ${c.banco || '—'} · estado ${c.estado} · números vistos: ${(c.numeros_conocidos || []).join(', ') || '—'}`)
    if (v.numero_desde != null) {
      const etq = v.rango_confianza === 'INFERIDO' ? ' (INFERIDO de la serie, no leído de la chequera)' : ` (${v.rango_confianza})`
      L(`     rango auditado: ${v.numero_desde}–${v.numero_hasta}${etq} · usados ${v.usados_en_rango?.length ?? 0}/${(v.numero_hasta - v.numero_desde + 1)}`)
    }
    if (v.veredicto === 'hallazgo') {
      L(`     ⚠ HUECOS (número del rango que NADIE registró como usado — verificar si anulado o faltante):`)
      L(`         ${v.huecos.join(', ')}`)
    }
    if (v.motivo) L(`     motivo: ${v.motivo}`)
    if (c.observacion) L(`     nota: ${c.observacion}`)
    L('')
  }

  if (inf.duplicados.length) {
    L('  ⚠ NÚMEROS DUPLICADOS (un número no puede ser dos cheques — error de carga o typo)')
    L('  ────────────────────────────────────────────────────────────────')
    for (const d of inf.duplicados) L(`     Nº ${d.numero}: aparece ${d.veces} veces`)
    L('')
  }

  if (inf.sin_chequera_asignada.length) {
    L('  SERIE FÍSICA SIN CHEQUERA IDENTIFICADA (DESCONOCIDO qué chequera es)')
    L('  ───────────────────────────────────────────────────────────────────')
    L('  Son cheques físicos usados cuyo número no cae en ninguna chequera del padrón.')
    L('  Para detectar un faltante acá hace falta cargar la chequera (identificador + rango).')
    for (const b of inf.sin_chequera_asignada) {
      const h = b.huecos_internos.length ? ` · huecos internos: ${b.huecos_internos.join(', ')}` : ' · sin huecos internos'
      L(`     ${b.desde}–${b.hasta}  (${b.cantidad} cheques)${h}`)
    }
    L('')
  }

  // Señalar los CPD sin beneficiario (riesgo de tenencia): el proveedor quedó marcado "al portador /
  // sin beneficiario / DESCONOCIDO" al cargarlos. No se filtra por monto: hay otros cheques > $1M que
  // sí tienen beneficiario.
  const sinBenef = registro.filter((r) => r.tipo === 'FISICO'
    && /al portador|sin beneficiario|desconocido/i.test(String(r.proveedor ?? '')))
  L('  RIESGO DE TENENCIA — CPD FIRMADOS SIN BENEFICIARIO (al portador de hecho)')
  L('  ────────────────────────────────────────────────────────────────────────')
  if (sinBenef.length) {
    for (const r of sinBenef) L(`     Nº ${r.numero} · ${money(parseMonto(r.monto))} · lo cobra quien lo tenga`)
    L('     → chequera H17 C-VI/26. Verificar tenencia física de estos cheques.')
  } else {
    L('     (ninguno detectado por monto $1.000.000 en el registro actual)')
  }
  L('══════════════════════════════════════════════════════════════════')
}

async function main() {
  const padron = await asegurarPadron()
  const registro = await leerRegistro()
  const inf = auditarPadron(padron, registro, 5)
  imprimir(padron, registro, inf)
  process.exit(0)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
