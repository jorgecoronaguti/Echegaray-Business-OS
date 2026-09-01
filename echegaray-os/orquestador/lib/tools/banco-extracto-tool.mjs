// EL EXTRACTO BANCARIO ENTRA POR XSAS — el circuito entero, sin un solo token de modelo.
//
// ═══ QUÉ ES ═══
//
// La capacidad que hace autónomo lo que el 01/09/2026 se hizo a mano por pedido del dueño: recibir
// el CSV del Santander (o el texto pegado), parsearlo, verificar la CADENA DE SALDOS, deduplicar
// contra la base, insertar lo nuevo, replicar `_BANCO_RAW` en el Sheet —de donde CAJA, Impuestos y
// Cheques se recalculan solos por fórmula— y marcar DEBITADO en los cheques que el extracto prueba
// pagados. No inventa una línea de lógica: COMPONE las piezas que ya existían (`banco-importar`,
// `banco-escribir`, `banco-raw-pestana.mjs`, `cheques-emitidos-sync-banco.mjs`).
//
// ═══ LAS TRES REGLAS QUE NO SE NEGOCIAN ═══
//
// 1. SI LA CADENA NO CIERRA, NO SE ESCRIBE NADA. saldo(n) = saldo(n−1) + importe(n) es una identidad
//    del extracto; si no da, hay un typo o falta un movimiento, y meter eso a la base es peor que no
//    cargarlo. Se informa el corte exacto y decide una persona.
// 2. EL SHEET SE TOCA CON MOTIVO. El freno de Sheets se levanta POR OPERACIÓN, con un motivo que
//    queda registrado y nombra a esta tool — la marca del freno NUNCA se borra. Si el freno está
//    puesto y el levantamiento por operación falla, la base queda cargada igual y la réplica se
//    declara pendiente: degradar es perder un paso, no mentir que se dio.
// 3. CERO MODELO. Parsear, verificar, deduplicar, insertar y replicar son operaciones
//    determinísticas. `claude-zero.test.mjs`-style: este módulo no importa ningún cliente de IA.
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { parsearExtracto, novedades, verificarCadena } from '../banco-importar.mjs'
import { insertarMovimientos, movimientosCargados, estadoCuenta } from '../banco-escribir.mjs'
import { registrarIngesta, FUENTES_INGESTA } from '../registrar-sincronizacion.mjs'
import { query as queryReal } from '../db.mjs'

const ejecutarReal = promisify(execFile)
const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts')
const $ = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

/**
 * EL NÚCLEO, con todo inyectable para probarlo sin banco, sin base y sin Sheet.
 *
 * @param {{contenido?:string, nombre?:string, ensayo?:boolean}} args
 * @param {object} [deps]
 * @param {Function} [deps.query]     Postgres. Sin él no hay importación.
 * @param {Function} [deps.ejecutar]  corre un script hijo (la réplica del Sheet y los cheques).
 */
export async function importarExtracto(args = {}, deps = {}) {
  const { query = null, ejecutar = ejecutarConNode } = deps
  const contenido = String(args.contenido ?? '')
  const nombre = String(args.nombre ?? 'extracto pegado')
  const ensayo = Boolean(args.ensayo)
  if (!contenido.trim()) return { ok: false, error: 'no llegó el contenido del extracto' }
  if (typeof query !== 'function') return { ok: false, error: 'sin conexión a la base no puedo importar' }

  // 1. PARSEAR. Cada línea que no se entiende se DEVUELVE: un importador que come 80 de 100 filas
  //    y no lo dice es peor que uno que falla.
  const { movimientos, rechazos } = parsearExtracto(contenido)
  if (!movimientos.length) {
    return { ok: false, error: 'no reconocí ningún movimiento con fecha e importe en lo que llegó', rechazos: rechazos.slice(0, 5) }
  }

  // 2. LA CADENA DE SALDOS — el control que ya encontró dos errores de transcripción. Regla 1.
  const cadena = verificarCadena(movimientos, null)
  if (!cadena.ok) {
    return {
      ok: false,
      error: 'la cadena de saldos NO cierra: no escribo nada. Hay un typo o falta un movimiento.',
      cortes: cadena.cortes.slice(0, 5).map((c) => `${c.fecha} "${String(c.concepto).slice(0, 40)}": esperado ${$(c.esperado)}, declarado ${$(c.declarado)}`),
    }
  }

  // 3. DEDUPLICAR CONTRA LA BASE — por (referencia, importe), nunca por el saldo corrido.
  const existentes = await movimientosCargados({ query })
  const nuevos = novedades(movimientos, existentes)

  const base = {
    leidos: movimientos.length,
    lineas_no_entendidas: rechazos.length,
    nuevos: nuevos.length,
    ya_estaban: movimientos.length - nuevos.length,
    cadena: 'cierra',
  }
  if (ensayo) return { ok: true, ...base, ensayo: true, resumen_texto: resumen({ ...base, ensayo: true }) }

  // 4. INSERTAR. El índice único de la base impone la deduplicación una segunda vez.
  if (nuevos.length) await insertarMovimientos({ query }, nuevos, `xsas:${nombre}`.slice(0, 80))

  // 5. FRESCURA — best effort: que falle el catálogo no puede anular una carga buena.
  try {
    const { hasta } = await estadoCuenta({ query })
    await registrarIngesta({ query }, { declaracion: FUENTES_INGESTA.banco, coberturaHasta: hasta ?? undefined })
  } catch { /* declarado: la frescura es un aviso, no un paso del circuito */ }

  // 6. EL SHEET — réplica _BANCO_RAW y DEBITADO de cheques, con el freno levantado POR OPERACIÓN.
  //    Regla 2: si esto falla, la base ya quedó bien y se DICE qué quedó pendiente.
  const motivo = `extracto "${nombre}" verificado (cadena de saldos) e importado vía XSAS gateway`
  const sheet = { replicado: false, cheques: null, pendiente: null }
  try {
    const r = await ejecutar('banco-raw-pestana.mjs', [], motivo)
    sheet.replicado = true
    sheet.detalle = ultimaLinea(r.stdout)
  } catch (e) {
    sheet.pendiente = `la réplica _BANCO_RAW no corrió: ${recorte(e)}. La base quedó cargada; correr banco-raw-pestana.mjs.`
  }
  if (sheet.replicado) {
    try {
      // Sólo marca DEBITADO lo que el extracto PRUEBA (emparejado sin ambigüedad); lo ambiguo se
      // informa y lo decide una persona. Autorizado por el dueño el 28/08 y de nuevo el 01/09.
      const r = await ejecutar('cheques-emitidos-sync-banco.mjs', ['--forzar-candado'], motivo)
      sheet.cheques = ultimaLinea(r.stdout)
    } catch (e) {
      sheet.pendiente = `${sheet.pendiente ? sheet.pendiente + ' · ' : ''}el DEBITADO de cheques no corrió: ${recorte(e)}`
    }
  }

  const estado = await estadoCuenta({ query }).catch(() => null)
  const out = { ok: true, ...base, sheet, base_total: estado?.total ?? null, base_hasta: estado?.hasta ?? null }
  out.resumen_texto = resumen(out)
  return out
}

/** Corre un script del orquestador como proceso hijo, con el motivo del freno en el entorno. */
async function ejecutarConNode(script, argv, motivo) {
  return ejecutarReal(process.execPath, [join(SCRIPTS, script), ...argv], {
    env: { ...process.env, ORQ_SHEETS_DESCONGELAR: motivo },
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  })
}

const recorte = (e) => String(e?.stderr || e?.message || e).slice(0, 200)
const ultimaLinea = (s) => String(s ?? '').trim().split('\n').filter(Boolean).slice(-1)[0] ?? ''

function resumen(r) {
  const l = [`🏦 Extracto: ${r.leidos} movimiento(s) leídos · cadena de saldos ✓ · ${r.nuevos} nuevo(s), ${r.ya_estaban} ya estaban`]
  if (r.lineas_no_entendidas) l.push(`⚠ ${r.lineas_no_entendidas} línea(s) no entendidas (se devuelven, no se tragan)`)
  if (r.ensayo) { l.push('(ensayo: no escribí nada)'); return l.join('\n') }
  if (r.sheet?.replicado) l.push(`📊 Sheet: _BANCO_RAW actualizada (${r.sheet.detalle ?? ''}) — CAJA, Impuestos y Cheques se recalculan solos`)
  if (r.sheet?.cheques) l.push(`🧾 Cheques: ${r.sheet.cheques}`)
  if (r.sheet?.pendiente) l.push(`⚠ PENDIENTE: ${r.sheet.pendiente}`)
  if (r.base_total != null) l.push(`Base: ${r.base_total} movimientos hasta ${r.base_hasta ?? '—'}`)
  return l.join('\n')
}

/** La fábrica que registra el gateway. `google` no se usa acá (los scripts hijos arman el suyo),
 *  pero la firma es la de todas las fábricas con Google: sin Workspace esta capacidad no existe. */
export function bancoExtractoTools(google) {
  if (!google) return {}
  return {
    'banco.importar_extracto': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'importar_extracto_bancario',
        description: 'Importa un extracto del Santander (CSV o texto pegado): verifica la cadena de saldos, deduplica, carga la base, replica _BANCO_RAW y marca DEBITADO probado. Determinístico, sin modelo.',
        input_schema: {
          type: 'object',
          properties: {
            contenido: { type: 'string', description: 'el CSV o texto del extracto, tal como baja del banco' },
            nombre: { type: 'string' },
            ensayo: { type: 'boolean', description: 'true = sólo informar qué haría' },
          },
          required: ['contenido'],
        },
      },
      run: (args) => importarExtracto(args, { query: queryReal }),
    },
  }
}
