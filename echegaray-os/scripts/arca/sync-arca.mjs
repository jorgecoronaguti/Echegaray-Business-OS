#!/usr/bin/env node
// SYNC de comprobantes ARCA → Supabase. Baja el año en curso hasta hoy (compras R + ventas E) vía
// AfipSDK (clave fiscal) y los ingiere en public.comprobantes_arca. Idempotente: el ingest hace
// on conflict, así que correrlo de nuevo sólo agrega lo nuevo. Lo dispara echegaray-arca-sync.timer.
// No usa la API de Anthropic; usa la cuota de AfipSDK, que es escasa y por eso se pregunta antes.
//
// ═══ ESTE SCRIPT FALLA FUERTE, Y ES NUEVO (07/08) ═══
//
// Hasta hoy tragaba el error de la descarga (`console.error` y seguir), corría el ingest sobre TODOS
// los `out/*.json` —incluidos los de corridas viejas— y registraba la frescura desde
// `max(fecha_emision)` de la tabla. El 03/08 las dos descargas fallaron y el journal terminó con
// "frescura → actualizado" y "Finished". El detalle de esa cadena, en lib/arca-sync-resultado.mjs.
//
// Ahora: se pregunta por la cuota ANTES de gastarla, se prueba la credencial con una sonda que no
// consume, se ingiere SÓLO lo que esta corrida descargó, la frescura sale del resultado de la
// descarga y el proceso termina distinto de 0 si algo se rompió.
//
// ═══ Y FALLÓ FUERTE CONTRA NADA, DEL 03/08 AL 13/08 ═══
//
// Diez días sin bajar un comprobante. No era el token: era la sonda. Probaba `GET /api/v1/automations`
// con el ACCESS_TOKEN, y ese endpoint contesta 401 a un GET siempre —token sano o podrido—, así que el
// preflight declaraba muerta una credencial que funcionaba y el mensaje mandaba al dueño a renovarla.
// Tres veces. Un control no se valida contra información distinta de la que produce el efecto: ahora
// la sonda usa el MISMO verbo y el MISMO endpoint que la descarga. Detalle en afipsdk-presupuesto.mjs.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presupuesto, registrarConsumo, credencialAceptada, leerCredenciales } from '../../orquestador/lib/afipsdk-presupuesto.mjs'
import {
  motivoDeFalla, archivoDescargado, decidirFrescura, codigoDeSalida, resumenDeCorrida, consumioCuota,
} from '../../orquestador/lib/arca-sync-resultado.mjs'

const run = promisify(execFile)
const DIR = dirname(fileURLToPath(import.meta.url))
const NODE = process.execPath
const dd = (n) => String(n).padStart(2, '0')
const hoy = new Date()
const anio = hoy.getFullYear()
const desde = `01/01/${anio}`
const hasta = `${dd(hoy.getDate())}/${dd(hoy.getMonth() + 1)}/${anio}`
const LIBROS = ['R', 'E']

/**
 * Una descarga. Devuelve SIEMPRE un resultado —nunca lanza— con el motivo entero cuando falla: el
 * status HTTP vive en ese texto y es lo único que permite distinguir un token vencido de una cuota
 * agotada. Truncar por el principio fue lo que borró el status del 03/08.
 */
async function descargar(tipo) {
  try {
    const { stdout } = await run(NODE, [join(DIR, 'afipsdk-comprobantes.mjs'), tipo, desde, hasta], { timeout: 360000 })
    return { tipo, ok: true, desde, hasta, archivo: archivoDescargado(stdout), ingerido: false }
  } catch (e) {
    return { tipo, ok: false, desde, hasta, motivo: motivoDeFalla(e), archivo: null, ingerido: false }
  }
}

async function main() {
  // Dos tokens, dos puertas: ACCESS_TOKEN abre las automatizaciones, ACCOUNT_TOKEN abre el panel
  // (donde vive la cuota real). Confundirlos fue el defecto del 03–13/08. Ninguno se imprime.
  const credenciales = await leerCredenciales()

  // ── 1. ¿ALCANZA LA CUOTA? Se le pregunta AL PROVEEDOR antes de gastar, no al contador propio ──
  const cuota = await presupuesto({
    pedido: LIBROS.length,
    hoy: hoy.toISOString().slice(0, 10),
    accountToken: credenciales.accountToken,
    projectId: credenciales.projectId,
  })
  console.log(`[arca-sync] cuota ${cuota.ventana} [fuente: ${cuota.fuente}]: ${cuota.motivo}`)
  if (!cuota.ok) { console.error('[arca-sync] NO descargo: no hay cuota suficiente.'); process.exit(1) }

  // ── 2. ¿SIRVE LA CREDENCIAL? Mismo verbo y mismo endpoint que la descarga; cuerpo vacío ───────
  // No consume cuota: sin `automation` el servidor rechaza en validación y no crea nada.
  const cred = await credencialAceptada({ token: credenciales.accessToken })
  console.log(`[arca-sync] credencial: ${cred.motivo}`)
  if (!cred.ok) { console.error('[arca-sync] NO descargo: la credencial no sirve.'); process.exit(1) }
  if (!cred.verificada) console.warn('[arca-sync] AVISO: la credencial no quedó verificada; sigo igual (no poder mirar ≠ está mal).')

  // ── 3. LAS DESCARGAS ──────────────────────────────────────────────────────────────────────────
  const resultados = []
  for (const tipo of LIBROS) {
    const r = await descargar(tipo)
    resultados.push(r)
    // Una creación rechazada por AfipSDK no gastó nada: contarla le sacaría corridas al mes por un
    // error ajeno. Ver `consumioCuota`.
    if (consumioCuota(r)) await registrarConsumo({ cantidad: 1, detalle: `mis-comprobantes ${tipo} ${desde}–${hasta}` })
  }
  for (const linea of resumenDeCorrida(resultados)) console.log(`[arca-sync] ${linea}`)

  // ── 4. EL INGEST, SÓLO SOBRE LO QUE ESTA CORRIDA BAJÓ ─────────────────────────────────────────
  // Sin argumentos, el ingest relee todos los JSON de la carpeta y su "TOTAL ingerido" cuenta datos
  // viejos: es un festejo que no prueba nada. Con los archivos de esta corrida, el total es real.
  const bajados = resultados.filter((r) => r.ok && r.archivo)
  let ingestOk = true
  if (!bajados.length) {
    ingestOk = false
    console.error('[arca-sync] ninguna descarga produjo archivo: NO corro el ingest (releer los viejos diría "ok" sin datos nuevos)')
  } else {
    try {
      const { stdout } = await run(NODE, [join(DIR, 'ingest-comprobantes.mjs'), ...bajados.map((r) => basename(r.archivo))], { timeout: 120000 })
      console.log('[arca-sync] ingest:', stdout.split('\n').filter((l) => /TOTAL|comprobantes/.test(l)).join(' | ') || 'ok')
      for (const r of bajados) r.ingerido = true
    } catch (e) {
      ingestOk = false
      console.error('[arca-sync] ingest falló:', motivoDeFalla(e))
    }
  }

  // ── 5. LA FRESCURA SALE DEL RESULTADO DE LA DESCARGA, NO DE LA TABLA ──────────────────────────
  // Antes salía de max(fecha_emision) de comprobantes_arca: un valor que existe aunque no se haya
  // bajado nada, y que por eso declaró "actualizado" el día que no se bajó nada.
  const frescura = decidirFrescura(resultados)
  try {
    const { query, closePool } = await import('../../orquestador/lib/db.mjs')
    const { registrarSincronizacion, registrarIngesta, FUENTES_INGESTA } = await import('../../orquestador/lib/registrar-sincronizacion.mjs')
    if (frescura.ventas.registrar) {
      const fr = await registrarSincronizacion({ query }, { nombre: 'IVA 2026 (Libro IVA Ventas mensual)', coberturaHasta: frescura.ventas.cobertura })
      console.log(fr.ok ? `[arca-sync] frescura ventas: ${frescura.ventas.motivo} → ${fr.estado}` : `[arca-sync] frescura ventas no registrada: ${fr.motivo}`)
    } else {
      console.log(`[arca-sync] frescura ventas NO se toca: ${frescura.ventas.motivo}`)
    }
    if (frescura.compras.registrar) {
      const frc = await registrarIngesta({ query }, { declaracion: FUENTES_INGESTA.arcaCompras, coberturaHasta: frescura.compras.cobertura })
      console.log(frc.ok ? `[arca-sync] frescura compras: ${frescura.compras.motivo} → ${frc.estado}` : `[arca-sync] frescura compras no registrada: ${frc.motivo}`)
    } else {
      console.log(`[arca-sync] frescura compras NO se toca: ${frescura.compras.motivo}`)
    }
    await closePool()
  } catch (e) {
    console.error('[arca-sync] frescura no registrada:', String(e?.message ?? e).slice(0, 200))
  }

  const codigo = codigoDeSalida(resultados, { ingestOk })
  console.log(codigo === 0 ? '[arca-sync] listo' : '[arca-sync] TERMINA EN ERROR: algo de esta corrida no se completó (ver arriba)')
  process.exit(codigo)
}

main().catch((e) => { console.error('[arca-sync] ERROR:', motivoDeFalla(e)); process.exit(1) })
