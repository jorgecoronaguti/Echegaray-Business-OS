#!/usr/bin/env node
// Test de normalización de destinatarios de mail (lib/google.mjs). Hermético, sin red.
// Cubre el bug real: "rodrigo@ecsas" → 400 "Invalid To header" al enviar. exit 0 = OK.
import { completarDestinatario, normalizarDestinatarios, esEmailValido } from './google.mjs'

let ok = 0, fail = 0
function check(n, c) { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

// --- completarDestinatario ---
check('rodrigo@ecsas → rodrigo@ecsas.com.ar (dominio interno sin TLD)', completarDestinatario('rodrigo@ecsas') === 'rodrigo@ecsas.com.ar')
check('token suelto "rodrigo" → rodrigo@ecsas.com.ar', completarDestinatario('rodrigo') === 'rodrigo@ecsas.com.ar')
check('mail interno completo intacto', completarDestinatario('jorge@ecsas.com.ar') === 'jorge@ecsas.com.ar')
check('mail externo válido intacto', completarDestinatario('juan@gmail.com') === 'juan@gmail.com')
check('externo incompleto NO se fuerza a interno', completarDestinatario('juan@gmail') === 'juan@gmail')
check('"Nombre <mail>" extrae el mail', completarDestinatario('Rodrigo <rodrigo@ecsas>') === 'rodrigo@ecsas.com.ar')
check('espacios se recortan', completarDestinatario('  rodrigo@ecsas  ') === 'rodrigo@ecsas.com.ar')
check('vacío queda vacío', completarDestinatario('') === '')

// --- esEmailValido ---
check('válido: rodrigo@ecsas.com.ar', esEmailValido('rodrigo@ecsas.com.ar') === true)
check('inválido: rodrigo@ecsas', esEmailValido('rodrigo@ecsas') === false)
check('inválido: rodrigo', esEmailValido('rodrigo') === false)

// --- normalizarDestinatarios ---
{
  const r = normalizarDestinatarios('rodrigo@ecsas')
  check('normaliza uno abreviado', r.lista === 'rodrigo@ecsas.com.ar' && r.invalidos.length === 0)
}
{
  const r = normalizarDestinatarios('rodrigo@ecsas, juan@gmail.com ; ana')
  check('normaliza varios (coma/;)', r.lista === 'rodrigo@ecsas.com.ar, juan@gmail.com, ana@ecsas.com.ar' && r.invalidos.length === 0)
}
{
  const r = normalizarDestinatarios('pepe@, juan@gmail')
  check('reporta inválidos que no puede completar', r.invalidos.length === 2 && r.lista === '')
}

console.log(`google-mail.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
