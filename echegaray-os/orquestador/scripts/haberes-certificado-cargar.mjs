#!/usr/bin/env node
// CARGA EL CERTIFICADO DE HABERES DEL SANTANDER EN `haberes_acreditados_banco`.
//
//   node orquestador/scripts/haberes-certificado-cargar.mjs            # ensayo: clasifica y muestra, no escribe
//   node orquestador/scripts/haberes-certificado-cargar.mjs --escribir # escribe (idempotente)
//
// La regla de clasificación vive en `orquestador/lib/haberes-certificado.mjs`; acá sólo se lee, se valida,
// se escribe y se RELEE.
//
// ═══ LAS TRES CERRADURAS ═══
//
//   1. Antes de tocar la base: la transcripción tiene que sumar EXACTAMENTE el «IMPORTE TOTAL» impreso al
//      pie del certificado ($43.587.035,27 en 127 acreditaciones). Si no, algo se perdió al copiar y no se
//      escribe nada.
//   2. Idempotencia: cada fila tiene una clave (fuente + CUIL + fecha + importe + ocurrencia) con UNIQUE en
//      la base; se hace upsert, y lo que la base tenga de ESTA fuente con otra clave se borra (el
//      certificado es la foto entera de su fuente). Correrlo dos veces deja lo mismo.
//   3. Después de escribir, DENTRO de la transacción, se vuelve a contar en la base con una consulta
//      propia: si la base no da el total del certificado, se deshace todo.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { query, withTx, closePool } from '../lib/db.mjs'
import {
  FUENTE_CERTIFICADO_2026, TOTAL_CERTIFICADO_2026_CENTAVOS, FILAS_CERTIFICADO_2026,
  leerCertificadoCsv, verificarTotal, conClaves, clasificar, resumenPorClase, pesosDeCentavos,
} from '../lib/haberes-certificado.mjs'

export const CSV_POR_DEFECTO = 'datos/haberes/santander-haberes-2026-certificado-2026-09-18.csv'

/** Lee y valida el CSV. Tira si la suma o la cantidad no cierran: nada llega a la base. */
export function prepararCertificado(texto, { fuente = FUENTE_CERTIFICADO_2026,
  totalCentavos = TOTAL_CERTIFICADO_2026_CENTAVOS, filas = FILAS_CERTIFICADO_2026 } = {}) {
  const leidas = leerCertificadoCsv(texto)
  const v = verificarTotal(leidas, { totalCentavos, filas })
  if (!v.ok) throw new Error(`NO SE ESCRIBE: ${v.errores.join('; ')}`)
  return {
    fuente,
    hash: createHash('sha256').update(texto).digest('hex').slice(0, 32),
    acreditaciones: conClaves(leidas, fuente),
    totalCentavos,
  }
}

const UPSERT = `
insert into public.haberes_acreditados_banco
  (cuil, nombre_banco, fecha, importe, persona_id, clase, periodo_desde, periodo_hasta, confianza,
   evidencia, fuente, clave, certificado_hash, cargado_en)
values ($1, $2, $3, $4::numeric / 100, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
on conflict (clave) do update set
  nombre_banco = excluded.nombre_banco, persona_id = excluded.persona_id, clase = excluded.clase,
  periodo_desde = excluded.periodo_desde, periodo_hasta = excluded.periodo_hasta,
  confianza = excluded.confianza, evidencia = excluded.evidencia,
  certificado_hash = excluded.certificado_hash, cargado_en = now()`

/**
 * Escribe las filas clasificadas con un cliente de transacción (`withTx`). Exportada para que el test la
 * corra contra un cliente falso y compruebe que una segunda pasada no agrega filas.
 */
export async function escribir(client, { fuente, hash, totalCentavos }, clasificadas) {
  for (const c of clasificadas) {
    await client.query(UPSERT, [c.cuil, c.nombre, c.fecha, String(c.centavos), c.persona_id, c.clase,
      c.periodo_desde, c.periodo_hasta, c.confianza, c.evidencia, fuente, c.clave, hash])
  }
  const borradas = await client.query(
    'delete from public.haberes_acreditados_banco where fuente = $1 and not (clave = any($2::text[]))',
    [fuente, clasificadas.map((c) => c.clave)])
  // LA RELECTURA: otra consulta, en centavos, sobre lo que quedó en la base.
  const { rows: [r] } = await client.query(
    `select count(*)::int as n, coalesce(sum(round(importe * 100)), 0)::bigint as centavos
       from public.haberes_acreditados_banco where fuente = $1`, [fuente])
  if (Number(r.centavos) !== totalCentavos || r.n !== clasificadas.length) {
    throw new Error(`la base quedó con ${r.n} filas y ${pesosDeCentavos(Number(r.centavos))}; `
      + `el certificado tiene ${clasificadas.length} y ${pesosDeCentavos(totalCentavos)} — se deshace`)
  }
  return { filas: r.n, centavos: Number(r.centavos), borradas: borradas.rowCount ?? 0 }
}

async function main() {
  const args = process.argv.slice(2)
  const escribe = args.includes('--escribir')
  const archivo = resolve(args.find((a) => !a.startsWith('--')) ?? CSV_POR_DEFECTO)
  const cert = prepararCertificado(readFileSync(archivo, 'utf8'))
  console.log(`certificado: ${archivo}`)
  console.log(`  ${cert.acreditaciones.length} acreditaciones · $${pesosDeCentavos(cert.totalCentavos)} · hash ${cert.hash}`)

  // En serie, a propósito: una sola conexión abierta a la base por vez.
  const personas = await query(`select id, cuil, fecha_ingreso::text, fecha_egreso::text from public.personas`)
  const planilla = await query(`select persona_id, pestana, quincena_desde::text, quincena_hasta::text, por_banco, ya_transferido
                                  from public.jornales_bloque_persona`)
  const clasificadas = clasificar({ acreditaciones: cert.acreditaciones, personas: personas.rows, planilla: planilla.rows })

  const sinPersona = clasificadas.filter((c) => !c.persona_id)
  const cuiles = new Set(clasificadas.map((c) => c.cuil))
  const conPersona = new Set(clasificadas.filter((c) => c.persona_id).map((c) => c.cuil))
  console.log(`  personas: ${cuiles.size} en el certificado · ${conPersona.size} en el padrón por CUIL · ${cuiles.size - conPersona.size} fuera`)
  for (const c of sinPersona) console.log(`    FUERA DEL PADRÓN  ${c.cuil}  ${c.nombre}  ${c.fecha}  ${pesosDeCentavos(c.centavos)}`)
  const resumen = resumenPorClase(clasificadas)
  let suma = 0
  for (const [clase, r] of Object.entries(resumen)) {
    suma += r.centavos
    console.log(`  ${clase.padEnd(18)} ${String(r.n).padStart(4)}  ${pesosDeCentavos(r.centavos).padStart(14)}`)
  }
  console.log(`  ${'TOTAL'.padEnd(18)} ${String(clasificadas.length).padStart(4)}  ${pesosDeCentavos(suma).padStart(14)}`)
  if (args.includes('--detalle')) {
    for (const c of clasificadas) {
      console.log(`${c.fecha} ${c.cuil} ${c.nombre.padEnd(31)} ${pesosDeCentavos(c.centavos).padStart(12)} ${c.clase.padEnd(18)} ${c.periodo_desde ?? ''}${c.periodo_hasta ? '..' + c.periodo_hasta : ''} · ${c.evidencia}`)
    }
  }
  if (suma !== cert.totalCentavos) throw new Error('las clases no suman el total del certificado')

  if (!escribe) {
    console.log('\nENSAYO: no se escribió nada. Con --escribir se carga.')
    return
  }
  const r = await withTx((client) => escribir(client, cert, clasificadas))
  console.log(`\nESCRITO: la base tiene ${r.filas} filas de «${cert.fuente}» por $${pesosDeCentavos(r.centavos)} (borradas de una carga vieja: ${r.borradas}).`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exitCode = 1 }).finally(() => closePool())
}
