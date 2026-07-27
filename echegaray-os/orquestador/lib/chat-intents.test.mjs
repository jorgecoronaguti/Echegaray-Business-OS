#!/usr/bin/env node
// Test de detección de intención del chat (lib/chat-intents.mjs). Fija que un pedido de ACCIÓN
// (mandar mail, agendar) NO se confunda con una LECTURA. Cubre las frases REALES que le
// fallaron al dueño (voseo/subjuntivo). Hermético, 0 API. exit 0 = OK, 1 = falla.
import { isMailComposeIntent, isCalendarWriteIntent, isMailReadIntent, routeConsulta } from './chat-intents.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

// ── MAIL: componer/enviar (frases reales que fallaron) ──
check('“necesito q mandes un mail” → compose', isMailComposeIntent('necesito q mandes un mail'))
check('“mandar un mail a rodrigo con adjunto” → compose', isMailComposeIntent('mandar un mail a rodrigo@ecsas.com.ar con adjunto'))
check('“enviá un correo a X” → compose', isMailComposeIntent('enviá un correo a juan'))
check('“reenviá ese mail a rodrigo” → compose', isMailComposeIntent('reenviá ese mail a rodrigo'))
check('“respondé el mail de messina” → compose', isMailComposeIntent('respondé el mail de messina'))
check('follow-up “el cuerpo del mail dice X” con historial → compose',
  isMailComposeIntent('el cuerpo del mail tiene que decir: contrato quattropani', 'Dueño: mandá un mail a rodrigo@ecsas.com.ar\nOS: ¿qué asunto?'))
check('follow-up “con adjunto” con historial de mail → compose',
  isMailComposeIntent('con adjunto el contrato', 'Dueño: mandá un correo a rodrigo\nOS: dale'))

// ── MAIL: componer NO se dispara sin verbo/campo ni sin la palabra mail ──
check('“mostrame mis mails” → NO compose', !isMailComposeIntent('mostrame mis mails'))
check('“qué mails tengo” → NO compose', !isMailComposeIntent('qué mails tengo hoy'))
check('“comprá cemento” → NO compose (no menciona mail)', !isMailComposeIntent('comprá 10 bolsas de cemento'))

// ── MAIL: leer (guarda) ──
check('“mostrame mis mails” → read', isMailReadIntent('mostrame mis mails'))
check('“mails sin leer” → read', isMailReadIntent('mails sin leer'))
check('“necesito q mandes un mail” → NO read (es acción)', !isMailReadIntent('necesito q mandes un mail'))
check('“mandar un mail con adjunto” → NO read', !isMailReadIntent('mandar un mail a rodrigo con adjunto'))

// ── CALENDAR/TAREAS: crear (no ver agenda) ──
check('“agendá una reunión mañana” → calendar write', isCalendarWriteIntent('agendá una reunión con pérez mañana 15hs'))
check('“creá un evento” → calendar write', isCalendarWriteIntent('creá un evento el martes'))
check('“anotá una tarea” → calendar write', isCalendarWriteIntent('anotá una tarea para llamar al proveedor'))
check('“marcá la tarea como completa” → calendar write', isCalendarWriteIntent('marcá la tarea 3 como completa'))
check('“qué tengo en la agenda” → NO write', !isCalendarWriteIntent('qué tengo en la agenda hoy'))
check('“mostrame el calendario” → NO write', !isCalendarWriteIntent('mostrame el calendario de esta semana'))

// ── F7 · Ruteo de CONSULTAS del chat interno a capacidades determinísticas (voseo/es-AR) ──
check('“cuánto tengo en caja” → caja', routeConsulta('cuánto tengo en caja hoy') === 'caja')
check('“cómo está la liquidez” → caja', routeConsulta('cómo está la liquidez') === 'caja')
check('“cuánta plata hay” → caja', routeConsulta('cuánta plata hay') === 'caja')
check('“cuál es la posición financiera” → caja', routeConsulta('cuál es la posición financiera') === 'caja')
check('“cuánto me deben” → cobranzas', routeConsulta('cuánto me deben') === 'cobranzas')
check('“cobranzas vencidas” → cobranzas', routeConsulta('mostrame las cobranzas vencidas') === 'cobranzas')
check('“qué tengo por cobrar” → cobranzas', routeConsulta('qué tengo por cobrar este mes') === 'cobranzas')
check('“cuánto tengo que pagar” → obligaciones', routeConsulta('cuánto tengo que pagar') === 'obligaciones')
check('“obligaciones vencidas” → obligaciones', routeConsulta('hay obligaciones vencidas?') === 'obligaciones')
check('“cuánta deuda tengo” → obligaciones', routeConsulta('cuánta deuda tengo') === 'obligaciones')
check('“cómo va la obra Estrella” → obra', routeConsulta('cómo va la obra Estrella') === 'obra')
check('“avance de las obras” → obra', routeConsulta('mostrame el avance de las obras') === 'obra')
check('“dame el scorecard” → scorecard', routeConsulta('dame el scorecard de finanzas') === 'scorecard')
check('“cómo vamos” → scorecard', routeConsulta('cómo vamos') === 'scorecard')
check('“precisión del forecast” → scorecard', routeConsulta('cuál es la precisión del forecast') === 'scorecard')
check('“resumen de la situación financiera” → scorecard', routeConsulta('dame un resumen de la situación financiera') === 'scorecard')
// Regla dura: lo NO cubierto devuelve null (el backend responde honesto, no inventa un número)
check('“cuántos adicionales detecté” → null (no cubierto)', routeConsulta('cuántos adicionales detecté') === null)
check('“qué jornales pagué la quincena” → null (no cubierto)', routeConsulta('qué jornales pagué la última quincena') === null)
check('“hola” → null', routeConsulta('hola, cómo andás?') === null)
check('texto vacío → null', routeConsulta('') === null)

console.log(`\nchat-intents.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
