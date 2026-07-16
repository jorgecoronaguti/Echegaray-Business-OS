#!/usr/bin/env node
// Test de detección de intención del chat (lib/chat-intents.mjs). Fija que un pedido de ACCIÓN
// (mandar mail, agendar) NO se confunda con una LECTURA. Cubre las frases REALES que le
// fallaron al dueño (voseo/subjuntivo). Hermético, 0 API. exit 0 = OK, 1 = falla.
import { isMailComposeIntent, isCalendarWriteIntent, isMailReadIntent } from './chat-intents.mjs'

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

console.log(`\nchat-intents.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
