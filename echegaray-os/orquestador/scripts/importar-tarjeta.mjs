#!/usr/bin/env node
// LA PUERTA DE ENTRADA DEL RESUMEN DE LA TARJETA. Le pasás el PDF y entra al OS.
//
// ═══ POR QUÉ EXISTE (28/08/2026) ═══
//
// Textual del dueño: «cuando empiece a enviar los resúmenes se debe actualizar».
//
// Para los movimientos del banco la puerta existe desde el 23/07 (`importar-banco.mjs`). Para la
// tarjeta no existía: los datos del resumen estaban ESCRITOS A MANO en `lib/banco-santander.mjs`, y
// cargar el resumen del mes significaba que alguien editara JavaScript. Un dato operativo que sólo
// se actualiza tocando el código no se actualiza: envejece. La pestaña llegó a publicar «foto de
// hace 30 días» sobre el número con el que se decide una compra.
//
// ═══ QUÉ HACE, EN ORDEN, Y POR QUÉ ESE ORDEN ═══
//
//   1. EXTRAE EL TEXTO del PDF con PyMuPDF. En esta VM no hay `pdftotext` ni `pdftoppm`; sí hay
//      `fitz` (PyMuPDF) en Python 3, y `page.get_text()` devuelve el resumen con las columnas
//      alineadas, que es exactamente lo que el parser necesita. Un agente anterior se frenó acá.
//   2. PARSEA con `lib/tarjeta-resumen.mjs`, que es PURO: recibe texto, no archivos. Todo lo que
//      puede fallar en silencio se prueba sin PDF, sin base y sin red.
//   3. VERIFICA LA ARITMÉTICA con `lib/tarjeta-controles.mjs` — once identidades que cruzan
//      renglones distintos del documento. Un resumen mal leído no da error: da un número plausible.
//   4. RECIÉN AHÍ ESCRIBE, y sólo si las identidades cierran. Un resumen mal transcripto adentro de
//      la base es peor que uno sin cargar: la pestaña lo publica como si fuera cierto.
//
// ═══ CARGARLO DOS VECES NO PUEDE DUPLICAR NADA ═══
//
// La garantía la da la BASE, no este script: (tarjeta, número) y (tarjeta, cierre) son índices
// únicos, y las líneas se identifican por (resumen, orden). Re-importar el mismo PDF CORRIGE la
// fila que ya está en vez de agregar otra. Un chequeo en código se saltea la primera vez que alguien
// corre el importador dos veces en paralelo.
//
//   node orquestador/scripts/importar-tarjeta.mjs resumen.pdf
//   node orquestador/scripts/importar-tarjeta.mjs resumen.pdf --dry        (no escribe nada)
//   node orquestador/scripts/importar-tarjeta.mjs resumen.txt              (texto ya extraído)
//   node orquestador/scripts/importar-tarjeta.mjs resumen.pdf --igual-cargalo   (aunque no cierre)

import { readFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { query, withTx } from '../lib/db.mjs'
import { insertarResumen } from '../lib/tarjeta-escribir.mjs'
import { parsearResumen } from '../lib/tarjeta-resumen.mjs'
import { verificarResumen } from '../lib/tarjeta-controles.mjs'
import { registrarIngesta, FUENTES_INGESTA } from '../lib/registrar-sincronizacion.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIGRACION = join(RAIZ, 'supabase', 'migrations', '20260828T1200_el_resumen_de_la_tarjeta_tiene_donde_entrar.sql')
const DRY = process.argv.includes('--dry')
const IGUAL = process.argv.includes('--igual-cargalo')
const ARCHIVO = process.argv.slice(2).find((a) => !a.startsWith('--'))

const $ = (n) => `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * El texto del PDF, hoja por hoja. PyMuPDF y no otra cosa porque es lo que hay en esta VM.
 *
 * Las hojas se separan con un marcador visible: el talón de la última —donde vive el PAGO MÍNIMO—
 * se identifica por posición dentro de SU hoja, y sin la marca de corte no hay forma de saber dónde
 * empieza.
 */
export function textoDelPdf(ruta) {
  const py = [
    'import fitz, sys',
    'd = fitz.open(sys.argv[1])',
    'for i, p in enumerate(d):',
    '    print("=== PAG %d ===" % (i + 1))',
    '    print(p.get_text())',
  ].join('\n')
  return execFileSync('python3', ['-c', py, ruta], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
}

async function main() {
  if (!ARCHIVO) {
    console.log('Uso:  node orquestador/scripts/importar-tarjeta.mjs <resumen.pdf> [--dry] [--igual-cargalo]')
    process.exitCode = 1
    return
  }

  const texto = /\.pdf$/i.test(ARCHIVO) ? textoDelPdf(ARCHIVO) : readFileSync(ARCHIVO, 'utf8')
  const p = parsearResumen(texto)
  const r = p.resumen
  if (!r.cierre || !r.vencimiento || r.aDebitarPesos == null) {
    console.error('NO reconozco este documento como un resumen de tarjeta del Santander:')
    console.error(`  cierre=${r.cierre} vencimiento=${r.vencimiento} a debitar=${r.aDebitarPesos}`)
    console.error('  (si el PDF es una copia escaneada no hay texto que extraer: no se puede cargar).')
    process.exitCode = 1
    return
  }

  console.log(`\n${r.tarjeta ?? 'tarjeta sin identificar'} · resumen ${r.numero ?? 's/n'} · cierre ${r.cierre} · vence ${r.vencimiento}`)
  console.log(`  a debitar ${$(r.aDebitarPesos)}${r.aDebitarDolares ? ` + U$S ${r.aDebitarDolares.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : ''} de la cuenta ${r.cuentaDebito ?? '?'}`)
  console.log(`  ${p.movimientos.filter((m) => m.tipo === 'consumo').length} consumo(s) · ${p.movimientos.filter((m) => m.tipo === 'cargo').length} cargo(s) · ${p.cuotas.porMes.length} mes(es) de cuotas a vencer`)
  for (const x of p.rechazos) console.log(`   ⚠ línea ${x.linea}: ${x.motivo} — "${x.texto}"`)

  const v = verificarResumen(p)
  console.log('\ncontroles:')
  for (const x of v.controles) {
    const marca = x.estado === 'ok' ? '✓' : x.estado === 'falla' ? '✗' : '·'
    const cifras = x.declarado != null ? ` ${$(x.suma ?? x.declarado)} vs ${$(x.declarado)}${x.diferencia ? ` (${$(x.diferencia)})` : ''}` : ''
    console.log(`  ${marca} ${x.nombre}${cifras}${x.estado !== 'ok' && x.detalle ? ` — ${x.detalle}` : ''}`)
  }
  if (!v.cierra) {
    console.error(`\n⚠ ${v.fallas.length} identidad(es) NO cierran. Un resumen mal leído no da error: da un número plausible.`)
    if (!IGUAL) {
      console.error('NO cargo nada. Si sabés que la diferencia es legítima, repetilo con --igual-cargalo')
      process.exitCode = 1
      return
    }
    console.log('  --igual-cargalo: cargo igual, con las fallas declaradas.')
  }

  if (DRY) {
    console.log('\n— dry: no escribí nada')
    return
  }

  await query(readFileSync(MIGRACION, 'utf8'))
  const origen = `${basename(ARCHIVO)} · importado ${new Date().toISOString().slice(0, 16).replace('T', ' ')}${v.cierra ? '' : ' · CON CONTROLES EN ROJO'}`
  const fila = await withTx((cx) => insertarResumen({ query: (t, v) => cx.query(t, v) }, p, origen))
  console.log(`\n✓ resumen ${fila.nueva ? 'cargado' : 'actualizado (ya estaba: no se duplicó)'} — id ${fila.id}`)

  // La frescura: un resumen mensual que deja de llegar se congela sin gritar. Catalogarlo hace que
  // la alerta lo mire sola. No rompe la carga si falla.
  try {
    const fr = await registrarIngesta({ query }, { declaracion: FUENTES_INGESTA.tarjeta, coberturaHasta: r.cierre })
    console.log(fr.ok ? `✓ frescura: "${fr.nombre}" hasta ${r.cierre} → ${fr.estado}` : `· frescura no registrada: ${fr.motivo}`)
  } catch (e) {
    console.log(`· frescura no registrada: ${String(e?.message ?? e).slice(0, 120)}`)
  }

  console.log('\nAhora corré  node orquestador/scripts/tarjeta-pestana.mjs --dry  para ver cómo queda la pestaña,')
  console.log('y sin --dry (desde el árbol principal) para escribirla.')
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
