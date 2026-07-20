#!/usr/bin/env node
// Test de persona experta + detección de consulta de criterio (lib/chat-persona.mjs).
// Blinda el bug real del \b final (ASCII boundary) que hacía que "conviene"/"cómo cotizo"
// NO dispararan. Hermético. exit 0 = OK.
import { personaParaConsulta, ASESORIA_RE, PERSONA_EXPERTA } from './chat-persona.mjs'

let ok = 0, fail = 0
function check(n, c) { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

// --- ASESORIA_RE: casos que ANTES fallaban por el \b final ---
check('convien matchea "conviene" (e después)', ASESORIA_RE.test('conviene comprar o alquilar'))
check('cómo cotiz matchea "cómo cotizo" (o después)', ASESORIA_RE.test('cómo cotizo una losa'))
check('me convien (financiar) matchea', ASESORIA_RE.test('me conviene financiar la compra'))
check('riesgo matchea', ASESORIA_RE.test('qué riesgo tiene esta obra'))
check('recomend matchea "recomendás"', ASESORIA_RE.test('qué me recomendás para el pago'))
check('debería matchea', ASESORIA_RE.test('debería aceptar el anticipo?'))

// --- NO dispara con un dato suelto / lookup ---
check('lookup "cuánto tengo en caja" NO es asesoría', !ASESORIA_RE.test('cuánto tengo en caja'))
check('lookup "mostrame mis obras" NO es asesoría', !ASESORIA_RE.test('mostrame mis obras'))

// --- personaParaConsulta: capacidad de dominio → persona; con marcador → sonnet ---
{
  const r = personaParaConsulta('advise.finance', 'qué riesgo tiene aceptar sin anticipo?')
  check('finance + criterio → persona CFO + asesoria', /CFO/.test(r.persona) && r.asesoria === true)
}
{
  const r = personaParaConsulta('advise.finance', 'cuánto tengo en caja')
  check('finance + lookup → persona pero SIN asesoria (haiku, gratis)', !!r.persona && r.asesoria === false)
}
{
  const r = personaParaConsulta('general', 'conviene esto?')
  check('capacidad general → sin persona ni asesoria', r.persona === null && r.asesoria === false)
}
check('todas las personas de dominio existen', Object.keys(PERSONA_EXPERTA).length >= 15)

// FOCO ADMIN Y FINANZAS (auditoría 2026-07-19).
{
  // advise.data cargaba la skill de Sheets pero SIN persona → opinaba del sistema financiero
  // de la empresa como asistente genérico.
  check('advise.data TIENE persona (Sheets)', !!PERSONA_EXPERTA['advise.data'])
  check('la persona de Sheets habla de sistema, no de planilla', /sistema/i.test(PERSONA_EXPERTA['advise.data']))
  // Consultas de CRITERIO que antes NO escalaban al modelo bueno.
  const crit = [
    'como mejoro el capital de trabajo',
    'esta bien armado mi cash flow?',
    'que me falta para tener el area world class',
    'mejores practicas de tesoreria',
    'como organizo la administracion',
    'auditá el flujo de fondos',
  ]
  for (const q of crit) check(`criterio escala a sonnet: "${q}"`, personaParaConsulta('advise.finance', q).asesoria === true)
  // Un pedido de dato suelto NO debe escalar (control de costo).
  check('dato suelto NO escala', personaParaConsulta('advise.finance', 'cuanta caja tengo hoy').asesoria === false)
}

console.log(`chat-persona.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
