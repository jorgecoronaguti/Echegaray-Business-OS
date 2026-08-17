#!/usr/bin/env node
// LA PUERTA DE ENTRADA DEL EXTRACTO. Pegás lo que baja el banco y entra al OS.
//
// POR QUÉ EXISTE (23/07). El dueño: "a diario y quizás dos veces por día te tengo que cargar los
// movimientos bancarios vía archivo csv o capturas de pantalla, como se ha venido haciendo, y esto
// debe impactar en TODO el sheet conforme corresponde, no sólo en la pestaña CAJA".
//
// El IMPACTO ya estaba resuelto: la réplica `_BANCO_RAW` vive adentro del archivo y de ahí cuelgan
// por fórmula la disponibilidad de CAJA, el impuesto al cheque y los costos bancarios de Impuestos,
// y el cruce de Cheques. Lo que no existía era la PUERTA: los 127 movimientos estaban ESCRITOS A
// MANO en `lib/banco-santander.mjs`. Cargar el extracto del día significaba que yo editara
// JavaScript. Un dato operativo que sólo se actualiza tocando el código no se actualiza: envejece.
//
// ═══ QUÉ HACE, EN ORDEN, Y POR QUÉ ESE ORDEN ═══
//
//   1. Aplica la migración (idempotente) y SIEMBRA los 127 movimientos que hoy viven en el código,
//      declarados con su origen. No se tiran: son el extracto 22/06→22/07 verificado.
//   2. Parsea lo nuevo. Cada línea que no entiende la DEVUELVE — un importador que come 80 filas de
//      100 y no lo dice es peor que uno que falla.
//   3. DEDUPLICA POR LA REFERENCIA DEL BANCO —(referencia, importe)—, no por el saldo. Las descargas
//      se piden con ventanas que se superponen, así que la mayor parte de un extracto nuevo ya está
//      cargada. El saldo corrido cambia entre descargas y usarlo como clave hacía entrar todo de nuevo:
//      el 03/08, 239 movimientos contra 170 ya cargados dieron "0 ya estaban". Duplicar un débito no da
//      error: da un saldo equivocado. Las filas sin referencia (capturas de pantalla, la semilla) se
//      cotejan por fecha + concepto + importe.
//   4. VERIFICA LA CADENA DE SALDOS sobre el conjunto ya mezclado, no sobre lo nuevo suelto:
//      saldo(n) = saldo(n−1) + importe(n) es una identidad del extracto, y si no cierra hay un typo
//      o falta un movimiento. Es el control que ya encontró dos errores de transcripción.
//   5. Recién ahí escribe. Y si la cadena no cierra, NO escribe salvo que se lo pidan: meter un
//      extracto mal transcripto en la base es peor que no cargarlo.
//
//   node orquestador/scripts/importar-banco.mjs extracto.csv
//   cat extracto.txt | node orquestador/scripts/importar-banco.mjs
//   node orquestador/scripts/importar-banco.mjs --sembrar          (sólo la carga inicial)
//   node orquestador/scripts/importar-banco.mjs x.csv --dry        (no escribe nada)
//   node orquestador/scripts/importar-banco.mjs x.csv --igual-cargalo   (aunque la cadena no cierre)

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { query } from '../lib/db.mjs'
import { parsearExtracto, novedades, verificarCadena, clave } from '../lib/banco-importar.mjs'
import { insertarMovimientos } from '../lib/banco-escribir.mjs'
import { MOVIMIENTOS, MOVIMIENTOS_DIA, CUENTA, ORIGEN } from '../lib/banco-santander.mjs'
import { registrarIngesta, FUENTES_INGESTA } from '../lib/registrar-sincronizacion.mjs'

const run = promisify(execFile)
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const AQUI = dirname(fileURLToPath(import.meta.url))
// LAS TRES MIGRACIONES DE LA TABLA, EN ORDEN. Se aplican todas y no sólo la primera: son idempotentes,
// y una migración que está en el repo pero nadie aplicó es una columna que no existe. La segunda agrega
// `referencia` —sin ella este importador falla al insertar— y la tercera corrige la clave única a
// (cuenta, referencia, importe), que es la misma que usa `clave()` en el núcleo.
const MIGRACIONES = [
  '20260723120000_banco_movimientos.sql',
  '20260730160000_banco_movimientos_referencia.sql',
  '20260731130000_banco_referencia_mas_importe.sql',
].map((f) => join(RAIZ, 'supabase', 'migrations', f))
const DRY = process.argv.includes('--dry')
const IGUAL = process.argv.includes('--igual-cargalo')
const SOLO_SEMBRAR = process.argv.includes('--sembrar')
// --sheet: además de escribir en la base, corre banco-raw-pestana.mjs para que la réplica _BANCO_RAW
// del Sheet tome lo cargado (y detrás CAJA/Impuestos/Cheques se recalculan solos por fórmula). Es
// OPT-IN a propósito: escribe el Sheet real, así que sólo corre cuando lo pedís explícito.
const CON_SHEET = process.argv.includes('--sheet')
const ARCHIVO = process.argv.slice(2).find((a) => !a.startsWith('--'))

// FRESCURA DEL BANCO (26/07). El extracto es un feed diario crítico que NO estaba catalogado en
// fuentes_datos (banco_movimientos nació el 23/07, después del discovery del 08/07): sin fila, se
// podía congelar días sin que la alerta dijera nada. Se registra la ingesta y se declara la cobertura
// REAL (hasta qué fecha llega el extracto en la base), nunca una inventada. No rompe la carga si falla.
async function registrarFrescuraBanco() {
  try {
    const { rows: [{ mx }] } = await query(
      'select max(fecha) mx from public.banco_movimientos where cuenta = $1', [CUENTA.numero])
    const coberturaHasta = mx ? new Date(mx).toISOString().slice(0, 10) : undefined
    const fr = await registrarIngesta({ query }, { declaracion: FUENTES_INGESTA.banco, coberturaHasta })
    if (fr.ok) console.log(`✓ frescura banco: "${fr.nombre}"${coberturaHasta ? ` hasta ${coberturaHasta}` : ''} → ${fr.estado}${fr.creada ? ' (fuente catalogada por primera vez)' : ''}`)
    else console.log(`· frescura banco no registrada: ${fr.motivo}`)
  } catch (e) {
    console.log(`· frescura banco no registrada: ${String(e?.message ?? e).slice(0, 120)}`)
  }
}

const $ = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

/** Lee de un archivo o de la entrada estándar (para pegar directo desde la terminal). */
function leerEntrada() {
  if (ARCHIVO) return readFileSync(ARCHIVO, 'utf8')
  try { return readFileSync(0, 'utf8') } catch { return '' }
}

/**
 * Inserta ignorando los que ya están: la deduplicación la impone el índice único de la BASE.
 *
 * EL INSERT NO VIVE ACÁ DESDE EL 04/08: vive en `lib/banco-escribir.mjs`, compartido con el botón de
 * importación del chat. Dos INSERT distintos sobre la misma tabla se separan a la primera corrección
 * —ya pasó con la columna `referencia`, que faltaba en una de las listas y dejó el índice único
 * viviendo sobre NULLs— y desde ahí el conteo miente sin dar un solo error.
 */
async function insertar(movs, origen) {
  if (!movs.length) return 0
  const { insertados } = await insertarMovimientos({ query }, movs, origen)
  return insertados
}

async function main() {
  // ── 1. La tabla, y la semilla ──
  if (!DRY) {
    for (const m of MIGRACIONES) await query(readFileSync(m, 'utf8'))
    console.log('✓ public.banco_movimientos lista (con `referencia` y su índice único)')
  }

  const { rows: [{ n: yaHabia }] } = await query('select count(*)::int as n from public.banco_movimientos')
  if (!yaHabia && !DRY) {
    // Los del código son el extracto verificado 22/06→22/07: se siembran una vez, declarados.
    const semilla = [...MOVIMIENTOS, ...MOVIMIENTOS_DIA].map((m) => ({ ...m, saldo: m.saldo ?? null }))
    const n = await insertar(semilla, ORIGEN)
    console.log(`✓ semilla: ${n} movimiento(s) del extracto ya verificado (${ORIGEN.slice(0, 60)}…)`)
  } else {
    console.log(`— ya hay ${yaHabia} movimiento(s) cargados`)
  }
  if (SOLO_SEMBRAR) return

  // ── 2. Lo nuevo ──
  const texto = leerEntrada()
  if (!texto.trim()) {
    console.log('\nNo me pasaste ningún extracto. Uso:')
    console.log('  node orquestador/scripts/importar-banco.mjs extracto.csv')
    console.log('  cat extracto.txt | node orquestador/scripts/importar-banco.mjs')
    return
  }
  const { movimientos, rechazos } = parsearExtracto(texto)
  console.log(`\nextracto: ${movimientos.length} movimiento(s) leído(s)${rechazos.length ? ` · ${rechazos.length} línea(s) que no entendí` : ''}`)
  // LAS LÍNEAS QUE NO ENTENDÍ SE MUESTRAN. Callarlas es cómo se pierde un movimiento sin que nadie
  // se entere, y después la caja no cierra por un motivo que nadie puede rastrear.
  for (const r of rechazos.slice(0, 8)) console.log(`   ⚠ línea ${r.linea}: ${r.motivo} — "${r.texto}"`)
  if (!movimientos.length) { console.error('no reconocí ningún movimiento: revisá el formato'); process.exitCode = 1; return }

  // ── 3. Deduplicar contra lo que ya está ──
  const { rows: existentes } = await query(
    // ORDER BY IMPORTA: la cadena de saldos se verifica en el orden del extracto, y dos movimientos
    // del MISMO día sólo se distinguen por el orden en que el banco los listó — que es el orden en
    // que se insertaron. Sin esto llegan en el orden que quiera Postgres y la cadena "no cierra" por
    // un motivo inventado: un auditor que grita sin razón se deja de mirar.
    // LA REFERENCIA SE TRAE. Sin esta columna en el SELECT, el lado "existente" no tiene con qué
    // compararse por identidad y la clave del banco queda inservible aunque `clave()` esté bien: el
    // 03/08 el extracto 04/06→03/08 dio "239 nuevos · 0 ya estaban" contra 170 filas ya cargadas.
    'select fecha, concepto, importe, saldo_despues as saldo, referencia from public.banco_movimientos where cuenta = $1 order by fecha, id',
    [CUENTA.numero],
  )
  const norm = existentes.map((r) => ({
    fecha: r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha).slice(0, 10),
    concepto: r.concepto, importe: Number(r.importe), saldo: r.saldo == null ? null : Number(r.saldo),
    // La base guarda las referencias sin ceros a la izquierda ("8689") y el extracto las trae con
    // ("000008689"): `novedades` normaliza los dos lados, acá sólo se pasa el dato tal cual está.
    referencia: r.referencia ?? null,
  }))
  const nuevos = novedades(movimientos, norm)
  console.log(`${nuevos.length} nuevo(s) · ${movimientos.length - nuevos.length} ya estaban (las ventanas del extracto se superponen)`)

  // CON QUÉ CLAVE SE DEDUPLICÓ, A LA VISTA. La deduplicación fuerte necesita la referencia en LOS DOS
  // lados; si falta de uno, todo cae al respaldo (fecha + concepto + importe) y eso hay que saberlo
  // ANTES de escribir, no después. El 03/08 el importador informó "0 ya estaban" sobre 170 filas
  // superpuestas sin decir una palabra de por qué: un contador que no muestra su base no es evidencia.
  const conRef = (a) => a.filter((m) => m.referencia != null).length
  console.log(`   clave: ${conRef(movimientos)}/${movimientos.length} del extracto y ${conRef(norm)}/${norm.length} de la base traen referencia; el resto se coteja por fecha + concepto + importe`)
  if (!nuevos.length) {
    console.log('\n✓ nada que cargar: el extracto ya estaba entero en la base')
    // Igual es una lectura exitosa del extracto: el dato está al día. Marcar la frescura (no --dry).
    if (!DRY) await registrarFrescuraBanco()
    return
  }

  // ── 4. La cadena de saldos, sobre el PROPIO extracto ──
  //
  // El extracto trae su propio saldo corrido y ya viene en orden cronológico (el parser lo endereza),
  // así que se verifica solo, de punta a punta, sin depender de mezclarlo con la base. Mezclar fallaba
  // en la re-descarga AMPLIA que se superpone con lo ya cargado: al intercalar los de la base con los
  // nuevos del mismo día, el orden real se perdía y la cadena "no cerraba" por un motivo inventado.
  // Para un pegado chico igual sirve: cada movimiento se compara con el anterior del propio pegado; el
  // primero sólo fija el ancla (no hay con qué compararlo, y verificarCadena lo tolera).
  // ═══ EL VEREDICTO DECLARA SU VENTANA, O SE LEE COMO UNA CONTRADICCIÓN (17/08/2026) ═══
  //
  // Acá decía "✓ la cadena de saldos cierra de punta a punta", a secas. Y `auditar-saldo-banco.mjs`,
  // que mide desde el arranque de la BASE, decía al mismo tiempo que faltaban $45.080. Dos
  // herramientas del mismo repo firmando lo contrario sobre la misma cuenta, y ninguna de las dos
  // diciendo hasta dónde había mirado. El dueño: *"pésimo, entonces no puede quedar así"*.
  //
  // Las dos tenían razón: ésta verifica el TRAMO QUE TRAJO EL ARCHIVO y la otra la base entera. Pero
  // un "✓" que no dice de qué a qué no se puede distinguir de un "✓" sobre todo — es el mismo defecto
  // que el techo mudo del reparador de textos, que firmaba "todo entra" mirando 400 de 1.155 filas.
  //
  // Ahora el veredicto imprime su ventana y, cuando el tramo NO empieza donde empieza la base, manda
  // a la herramienta que sí puede contestar por el resto. Declarar el alcance es parte del veredicto.
  const { ok, cortes } = verificarCadena(movimientos, null)
  const v0 = movimientos[0]?.fecha ?? '?'
  const v1 = movimientos[movimientos.length - 1]?.fecha ?? '?'
  if (ok) {
    console.log(`✓ la cadena de saldos cierra de punta a punta EN ESTE ARCHIVO (${v0} → ${v1})`)
    console.log('  esto NO dice nada del tramo anterior: la base entera la audita '
      + 'orquestador/scripts/auditar-saldo-banco.mjs')
  }
  else {
    console.log(`\n⚠ la cadena de saldos NO cierra en ${cortes.length} punto(s):`)
    for (const c of cortes.slice(0, 5)) {
      console.log(`   ${c.fecha} · ${String(c.concepto).slice(0, 46)} · esperaba ${$(c.esperado)} y dice ${$(c.declarado)} (${$(c.diferencia)})`)
    }
    console.log('   Un corte es un typo, un movimiento que falta, o un extracto que empieza en otra ventana.')
    if (!IGUAL) {
      console.error('\nNO cargo nada: un extracto mal transcripto adentro de la base es peor que uno sin cargar.')
      console.error('Si sabés que el corte es legítimo (un tramo que el banco no explica), repetilo con --igual-cargalo')
      process.exitCode = 1
      return
    }
    console.log('   --igual-cargalo: cargo igual, con el corte declarado.')
  }

  // ── 5. Escribir ──
  const nuevaClave = new Set(nuevos.map(clave))
  console.log(`\nse van a cargar ${nuevos.length}:`)
  for (const m of nuevos.slice(0, 6)) console.log(`   ${m.fecha} ${String(m.concepto).slice(0, 52).padEnd(54)} ${$(m.importe).padStart(14)}`)
  if (nuevos.length > 6) console.log(`   … y ${nuevos.length - 6} más`)
  if (DRY) { console.log('\n— dry: no escribí nada'); return }

  const origen = `${ARCHIVO ? `archivo ${ARCHIVO}` : 'pegado en la terminal'} · importado ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const n = await insertar(nuevos, origen)
  console.log(`\n✓ ${n} movimiento(s) cargados${n !== nuevaClave.size ? ` (${nuevaClave.size - n} los rechazó el índice único: ya estaban)` : ''}`)

  // La ingesta cerró bien: se registra la frescura con la cobertura real del extracto en la base.
  await registrarFrescuraBanco()

  if (CON_SHEET) {
    // Cierra el paso manual: lleva lo cargado a la réplica _BANCO_RAW del Sheet. Escribe el Sheet real,
    // por eso es opt-in. Si falla, no rompe la carga a la base (que ya está hecha): sólo avisa.
    console.log('\n--sheet: llevo lo cargado a _BANCO_RAW (banco-raw-pestana.mjs)…')
    try {
      const { stdout } = await run(process.execPath, [join(AQUI, 'banco-raw-pestana.mjs')], { timeout: 180000 })
      console.log(stdout.trim().split('\n').slice(-3).join('\n'))
      console.log('✓ _BANCO_RAW actualizada. CAJA, Impuestos y Cheques se recalculan solos (leen esa réplica).')
    } catch (e) {
      console.error(`⚠ no pude actualizar _BANCO_RAW: ${String(e?.stderr || e?.message).slice(0, 200)}`)
      console.error('  Lo cargado en la base está OK. Corré  node orquestador/scripts/banco-raw-pestana.mjs  a mano.')
    }
  } else {
    console.log('\nAhora corré  node orquestador/scripts/banco-raw-pestana.mjs  para que el Sheet lo tome,')
    console.log('y detrás de eso CAJA, Impuestos y Cheques se recalculan solos porque leen esa réplica.')
    console.log('(o volvé a correr este importador con --sheet para que lo haga solo).')
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
