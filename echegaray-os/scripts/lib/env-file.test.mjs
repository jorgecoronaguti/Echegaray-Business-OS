#!/usr/bin/env node
// Validación local del parser de .env (scripts/lib/env-file.mjs). No usa valores
// reales ni imprime secretos: solo datos sintéticos y un resumen PASS/FAIL.
//
// Uso: node scripts/lib/env-file.test.mjs   (exit 0 = OK, exit 1 = falla)

import { parseEnvValue, parseEnvFile, loadEnvLocalInto } from './env-file.mjs'

let ok = 0
let fail = 0
function check(nombre, actual, esperado) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(esperado)
  if (a === e) {
    ok++
  } else {
    fail++
    console.error(`FALLA: ${nombre}\n  esperado: ${e}\n  obtenido: ${a}`)
  }
}

// --- parseEnvValue: comillas, escapes, espacios, '=' interno ---
check('doble comilla -> sin comillas', parseEnvValue('"https://demo.supabase.co"'), 'https://demo.supabase.co')
check('simple comilla -> sin comillas', parseEnvValue("'https://demo.supabase.co'"), 'https://demo.supabase.co')
check('sin comillas', parseEnvValue('https://demo.supabase.co'), 'https://demo.supabase.co')
check('espacios externos', parseEnvValue('   https://demo.supabase.co   '), 'https://demo.supabase.co')
check('espacios dentro de comillas se conservan', parseEnvValue('"  con espacios  "'), '  con espacios  ')
check('valor con = interno (doble comilla)', parseEnvValue('"a=b=c"'), 'a=b=c')
check('doble comilla desescapa \\n', parseEnvValue('"linea1\\nlinea2"'), 'linea1\nlinea2')
check('doble comilla desescapa \\" y \\\\', parseEnvValue('"x=\\"y\\"\\\\z"'), 'x="y"\\z')
check('simple comilla NO desescapa', parseEnvValue("'linea1\\nlinea2'"), 'linea1\\nlinea2')
check('comilla desbalanceada queda literal', parseEnvValue('"sin-cierre'), '"sin-cierre')
check('vacío entre comillas', parseEnvValue('""'), '')

// --- parseEnvFile: líneas vacías, comentarios, primer '=', clave trimmeada ---
const texto = [
  '# comentario',
  '',
  '   ',
  'NEXT_PUBLIC_SUPABASE_URL="https://demo.supabase.co"',
  "SUPABASE_SERVICE_ROLE_KEY='sb_secret_ejemplo=no-real'",
  'CON_ESPACIOS =  valor-plano  ',
  'CLAVE_CON_IGUAL=a=b=c',
  'SIN_IGUAL_SE_IGNORA',
  '#OTRO=comentario',
].join('\n')
const parsed = parseEnvFile(texto)
check('URL parseada sin comillas', parsed.NEXT_PUBLIC_SUPABASE_URL, 'https://demo.supabase.co')
check('service key con = interno', parsed.SUPABASE_SERVICE_ROLE_KEY, 'sb_secret_ejemplo=no-real')
check('clave y valor trimmeados', parsed.CON_ESPACIOS, 'valor-plano')
check('valor con = interno intacto', parsed.CLAVE_CON_IGUAL, 'a=b=c')
check('línea sin = ignorada', 'SIN_IGUAL_SE_IGNORA' in parsed, false)
check('comentario ignorado', 'OTRO' in parsed, false)
check('cantidad de claves', Object.keys(parsed).length, 4)

// --- loadEnvLocalInto: el entorno real tiene prioridad ---
const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://REAL.supabase.co' }
// Simula sin tocar el filesystem: aplica parseEnvFile manualmente con la misma regla.
for (const [k, v] of Object.entries(parseEnvFile(texto))) {
  if (!(k in env)) env[k] = v
}
check('no pisa variable real existente', env.NEXT_PUBLIC_SUPABASE_URL, 'https://REAL.supabase.co')
check('completa la que faltaba', env.CLAVE_CON_IGUAL, 'a=b=c')
// loadEnvLocalInto con archivo inexistente no rompe ni agrega nada
const env2 = {}
loadEnvLocalInto(env2, '/ruta/que/no/existe/.env.local')
check('archivo inexistente = no-op', Object.keys(env2).length, 0)

console.log(`\nparser .env: ${ok} OK, ${fail} FALLA(S)`)
process.exit(fail === 0 ? 0 : 1)
