#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ¿YA LLEGARON LOS eCHEQS DE UNA ORDEN DE PAGO? — avisa cuando sí, se calla cuando no
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// ═══ POR QUÉ EXISTE (16/09/2026) ═══
//
// Messina emitió la OP 5241 y avisó que «en el transcurso de las próximas horas estarán los valores
// a disposición». Los 2 eCheqs no se pueden cargar a mano en «Cheques Recibidos»: esa pestaña la
// genera `cheques-recibidos-pestana.mjs` desde `_CHEQUES_RAW`, que es el ESPEJO de la pantalla eCHEQ
// del Santander. Tipearlos antes de que el banco los muestre los duplica cuando el espejo se
// actualice, e infla la cartera por el importe entero.
//
// La alternativa era «acordate de mirar». Eso no es un cierre: es un pendiente en la cabeza de
// alguien. Esto lo mira solo y avisa UNA vez, cuando el hecho ocurrió.
//
// ═══ SE CALLA CUANDO NO HAY NADA ═══
//
// Un vigía que avisa todos los días «todavía no» se vuelve ruido y se apaga. Sólo escribe al dueño
// cuando el cheque YA está en el espejo. Sin novedad, sale 0 y no dice nada.
//
//   node orquestador/scripts/vigilar-echeqs-op.mjs              # mira y avisa si llegaron
//   node orquestador/scripts/vigilar-echeqs-op.mjs --informar   # dice qué ve, aunque no haya novedad

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'

const ejecutar = promisify(execFile)
const INFORMAR = process.argv.includes('--informar')
const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

/**
 * LO QUE SE ESPERA. Cada entrada es un valor que una OP prometió y que todavía no llegó al banco.
 * El número de cheque NO identifica solo (dos bancos repiten numeración): se exige que coincidan
 * NÚMERO E IMPORTE. Cuando un valor se confirma, se borra de acá — la lista es el pendiente.
 */
export const ESPERADOS = [
  { op: '5241', cliente: 'MESSINA', numero: '6526', importe: 2896036.13, banco: 'Supervielle S.G.' },
  { op: '5241', cliente: 'MESSINA', numero: '8767', importe: 9426000.00, banco: 'Río de la Plata S.A.' },
]

/** «$ 2.896.036,13» → 2896036.13. Devuelve null si no es un importe. PURA. */
export function importeDeTexto(t) {
  const n = Number(String(t ?? '').replace(/[$\s.]/g, '').replace(',', '.'))
  return Number.isFinite(n) && n !== 0 ? n : null
}

/**
 * ¿ESTA FILA DEL ESPEJO ES EL CHEQUE QUE ESPERO? Número E importe, con 1 centavo de tolerancia.
 * Sólo el número sería frágil: [[cheque-numero-no-identifica]]. PURA, para poder probarla.
 */
export function esElCheque(fila, esperado) {
  const celdas = (fila ?? []).map((c) => String(c ?? '').trim())
  if (!celdas.some((c) => c === esperado.numero)) return false
  return celdas.some((c) => {
    const n = importeDeTexto(c)
    return n != null && Math.abs(n - esperado.importe) < 0.01
  })
}

/** Los que YA están en el espejo. PURA: el script sólo le pasa las filas leídas. */
export function yaLlegaron(filas, esperados = ESPERADOS) {
  return esperados.filter((e) => (filas ?? []).some((f) => esElCheque(f, e)))
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig() })
  const filas = await google.readSheetValues(ID, '_CHEQUES_RAW!A1:R400', { valueRenderOption: 'FORMULA' })
  const llegaron = yaLlegaron(filas)

  if (INFORMAR) {
    console.log(`espejo _CHEQUES_RAW: ${filas.length} filas · esperados ${ESPERADOS.length} · llegaron ${llegaron.length}`)
    for (const e of ESPERADOS) {
      console.log(`  ${llegaron.includes(e) ? '✓ LLEGÓ' : '· todavía no'}  OP ${e.op} · cheque ${e.numero} · $${e.importe.toLocaleString('es-AR')} · ${e.banco}`)
    }
  }
  if (!llegaron.length) return

  // AVISO AL DUEÑO. Sin backticks: el aviso pasa por bash y los ejecutaría.
  const lineas = llegaron.map((e) => `  · cheque ${e.numero} · $${e.importe.toLocaleString('es-AR')} · ${e.banco}`)
  const texto = [
    `CHEQUES DE LA OP ${llegaron[0].op} (${llegaron[0].cliente}) — YA ESTÁN EN EL ESPEJO DEL BANCO:`,
    ...lineas, '',
    'Ahora sí se pueden registrar sin duplicar. Dos pasos:',
    '1) regenerar la pestaña Cheques Recibidos (cheques-recibidos-pestana.mjs)',
    '2) pasar a Cobrado las filas 46, 47 y 65 de Cobranzas, con la fecha de acreditación real',
  ].join('\n')
  await ejecutar('node', [new URL('./avisar-al-dueno.mjs', import.meta.url).pathname, texto])
  console.log(`avisado: ${llegaron.length} cheque(s) de la OP ${llegaron[0].op}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exitCode = 1 })
}
