#!/usr/bin/env node
// Test del saneo de `confidence` del especialista (bug real observado en el objetivo
// 431d5576: "baja-media" hacía fallar el enum y disparaba reintentos/dead-letter).
// Hermético: sin red, sin DB. exit 0 = OK, exit 1 = falla.
import { normalizeConfidence, parseSpecialist } from './specialist.mjs'

let ok = 0
let fail = 0
function eq(nombre, got, want) {
  if (got === want) ok++
  else { fail++; console.error(`FALLA: ${nombre} — got=${JSON.stringify(got)} want=${JSON.stringify(want)}`) }
}

// --- casos exactos del contrato ---
eq('alta', normalizeConfidence('alta'), 'alta')
eq('media', normalizeConfidence('media'), 'media')
eq('baja', normalizeConfidence('baja'), 'baja')

// --- mayúsculas / espacios ---
eq('ALTA', normalizeConfidence('ALTA'), 'alta')
eq('  media  ', normalizeConfidence('  media  '), 'media')

// --- compuestos: gana el primer término ---
eq('media-alta -> media', normalizeConfidence('media-alta'), 'media')
eq('alta-media -> alta', normalizeConfidence('alta-media'), 'alta')
eq('baja-media -> baja', normalizeConfidence('baja-media'), 'baja')

// --- frases naturales ---
eq('alta con reservas -> alta', normalizeConfidence('alta con reservas'), 'alta')
eq('media con incertidumbre -> media', normalizeConfidence('media con incertidumbre'), 'media')
// el valor real que mató al especialista legal:
eq('baja-media — el análisis... -> baja',
  normalizeConfidence('baja-media — el análisis estructural es sólido; el dictamen es preliminar'), 'baja')

// --- ausente: undefined para que Zod aplique el default ---
eq('null -> undefined', normalizeConfidence(null), undefined)
eq('undefined -> undefined', normalizeConfidence(undefined), undefined)

// --- desconocido: warning + media ---
let warned = false
const logger = { warn: () => { warned = true } }
eq('desconocido -> media', normalizeConfidence('altísima seguridad total', logger), 'media')
eq('desconocido logueó warning', warned, true)
eq('no-string -> media', normalizeConfidence(42), 'media')

// --- integración con el schema: parseSpecialist no lanza con "baja-media" ---
const parsed = parseSpecialist({ analysis: 'x', confidence: 'baja-media' })
eq('parseSpecialist normaliza y valida', parsed.confidence, 'baja')
const parsedAbsent = parseSpecialist({ analysis: 'x' })
eq('parseSpecialist aplica default cuando falta', parsedAbsent.confidence, 'media')

// --- no rompe lo que ya era válido ---
const parsedOk = parseSpecialist({ analysis: 'x', confidence: 'alta' })
eq('parseSpecialist respeta valor válido', parsedOk.confidence, 'alta')

console.log(`specialist.test: ${ok} ok, ${fail} fallas`)
process.exit(fail ? 1 : 0)
