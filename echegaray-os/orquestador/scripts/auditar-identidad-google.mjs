#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
//  INSPECTOR DE IDENTIDAD DE GOOGLE — SÓLO LECTURA. NO ESCRIBE NADA, NUNCA.
//
//  Este script no crea, no modifica y no borra: ni una celda de un Sheet, ni un
//  archivo de Drive, ni un evento de Calendar, ni una tarea. Sólo ARMA los
//  clientes de Google como los armaría cada flujo y pregunta con qué identidad
//  quedaron. Las únicas consultas que hace son SELECT sobre orq.google_tokens
//  (quién autorizó su cuenta) — nunca lee ni imprime un refresh_token.
//
//  Si alguna vez alguien necesita agregarle una acción que escriba: no. Se hace
//  otro script. Este tiene que poder correrse en producción sin pensarlo.
// ════════════════════════════════════════════════════════════════════════════
//
// Para qué sirve: la identidad con la que el OS toca Google es invisible y cuando
// cambia no falla nada — sigue andando con otra cuenta. Esto la vuelve mirable en
// un segundo, antes y después de tocar `lib/google-os.mjs`.
//
// Uso:
//   node orquestador/scripts/auditar-identidad-google.mjs
//   node orquestador/scripts/auditar-identidad-google.mjs --personas jorge@ecsas.com.ar,rodrigo@ecsas.com.ar

import * as googleOs from '../lib/google-os.mjs'
import { operadorEmail, tieneToken } from '../lib/google-oauth.mjs'
import { googleDe, cuentaDe, permiteEfectoExterno } from '../comunicacion/asistente/google-cliente.mjs'
import { ES_CUENTA_OS } from '../lib/historial-ediciones.mjs'

const PERSONAS_DEFECTO = ['jorge@ecsas.com.ar', 'rodrigo@ecsas.com.ar']
// Una cuenta que con seguridad no autorizó nada: sirve para ver el camino del que NO conectó
// su Google sin depender de que exista alguien en ese estado.
const SIN_OAUTH = 'sin-oauth@ejemplo.invalid'

function argPersonas(argv) {
  const i = argv.indexOf('--personas')
  if (i < 0 || !argv[i + 1]) return PERSONAS_DEFECTO
  return argv[i + 1].split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
}

/** Identidad del cliente institucional, tolerante a que el contrato todavía no exista. */
function identidadInstitucional() {
  if (typeof googleOs.identidadDe !== 'function') {
    return { tipo: '(sin contrato)', cuenta: '(sin contrato)', nota: 'google-os.mjs no exporta identidadDe' }
  }
  try {
    const g = googleOs.googleDelOs()
    const id = googleOs.identidadDe(g)
    return {
      tipo: id?.tipo ?? '(sin marca)',
      cuenta: id?.cuenta ?? '(sin marca)',
      efecto: permiteEfectoExterno(g),
      describe: typeof googleOs.describirIdentidad === 'function' ? googleOs.describirIdentidad(g) : '—',
    }
  } catch (e) { return { tipo: '(error)', cuenta: '(error)', nota: String(e?.message ?? e).slice(0, 120) } }
}

/** Con qué cuenta quedaría el cliente del asistente para ESTA persona. */
async function identidadPersonal(email) {
  try {
    const g = await googleDe({ identidad: { email } })
    if (!g) return { cuenta: '(ninguna)', propia: false, efecto: false, nota: 'no hay cuenta utilizable' }
    const c = cuentaDe(g)
    return { cuenta: c?.email ?? '(sin marca)', propia: c?.propia === true, efecto: permiteEfectoExterno(g) }
  } catch (e) { return { cuenta: '(error)', propia: false, efecto: false, nota: String(e?.message ?? e).slice(0, 120) } }
}

const si = (v) => (v === true ? 'sí' : v === false ? 'NO' : '—')

/** Tabla alineada. Nada de esto lleva secretos: son emails de trabajo y etiquetas. */
function tabla(cabeceras, filas) {
  const cols = cabeceras.map((h, i) => Math.max(h.length, ...filas.map((f) => String(f[i] ?? '').length)))
  const linea = (celdas) => celdas.map((c, i) => String(c ?? '').padEnd(cols[i])).join('  ')
  console.log(linea(cabeceras))
  console.log(cols.map((n) => '─'.repeat(n)).join('  '))
  for (const f of filas) console.log(linea(f))
}

async function main() {
  const personas = argPersonas(process.argv)
  console.log('\nIDENTIDAD DE GOOGLE DEL OS — inspección de sólo lectura\n')

  const inst = identidadInstitucional()
  const operadora = await operadorEmail().catch(() => null)
  const sinOauth = await identidadPersonal(SIN_OAUTH)

  const filas = [
    ['Lectura institucional de Drive', 'googleDelOs()', inst.tipo, inst.cuenta, si(inst.efecto)],
    ['Escritura de JORNALES', 'googleDelOs()', inst.tipo, inst.cuenta, si(inst.efecto)],
  ]
  for (const email of personas) {
    const p = await identidadPersonal(email)
    const que = email === personas[1] ? 'Tasks personal' : 'Calendar personal'
    filas.push([`${que} de ${email}`, 'googleDe({identidad})', p.propia ? 'user_oauth' : 'operator_oauth (fallback)', p.cuenta, si(p.efecto)])
  }
  filas.push([`Persona SIN OAuth (${SIN_OAUTH})`, 'googleDe({identidad})',
    sinOauth.cuenta === '(ninguna)' ? '(ninguna)' : 'operator_oauth (fallback)', sinOauth.cuenta, si(sinOauth.efecto)])
  filas.push(['Cuenta operadora resuelta', 'await operadorEmail()', operadora ? 'operator_oauth' : '(ninguna)', operadora ?? '(ninguna)', '—'])

  tabla(['Flujo', 'Cómo se arma', 'Identidad', 'Cuenta', '¿Efecto en la cuenta de una persona?'], filas)
  await notas({ inst, operadora, personas })
}

/** Lo que el número de arriba no dice solo. */
async function notas({ inst, operadora, personas }) {
  console.log('')
  console.log(`Contrato de identidad publicado: ${typeof googleOs.identidadDe === 'function' ? 'sí' : 'NO (falta identidadDe en lib/google-os.mjs)'}`)
  console.log(`Preferencia de operadora (ORQ_GOOGLE_IMPERSONATE): ${process.env.ORQ_GOOGLE_IMPERSONATE || '(sin definir)'}`)
  if (process.env.ORQ_GOOGLE_IMPERSONATE && operadora && process.env.ORQ_GOOGLE_IMPERSONATE.toLowerCase() !== operadora) {
    console.log('  ⚠ la cuenta preferida NO está autorizada: la operadora resuelta es la más reciente.')
  }
  for (const email of personas) {
    console.log(`OAuth propio de ${email}: ${(await tieneToken(email).catch(() => false)) ? 'sí' : 'NO (Calendar/Tasks no se le ofrecen)'}`)
  }
  const candado = inst.cuenta === 'service-account' || ES_CUENTA_OS.test(String(inst.cuenta))
  console.log(`Candado de ediciones: el historial de Drive reconoce al OS por ${ES_CUENTA_OS} — ` +
    `la escritura institucional ${candado ? 'ES' : 'NO ES'} la cuenta de servicio.`)
  if (!candado) console.log('  ⚠ si JORNALES se escribe con una cuenta de persona, el OS deja de reconocer su propia escritura.')
  console.log('\nNada de lo anterior escribió en Google. Este script es de sólo lectura.\n')
}

main().catch((e) => { console.error('no se pudo inspeccionar:', String(e?.message ?? e).slice(0, 200)); process.exit(1) })
