#!/usr/bin/env node
// RENOMBRAR EL BOT DE MATTERMOST: `@os` → `@xsas`. UNO solo, el mismo `user_id`.
//
//   node orquestador/scripts/xsas-renombrar-bot.mjs            muestra qué haría (por defecto)
//   node orquestador/scripts/xsas-renombrar-bot.mjs --aplicar  lo hace y VERIFICA leyendo de vuelta
//
// ═══ POR QUÉ RENOMBRAR Y NO CREAR OTRO ═══
//
// El `user_id` del bot está escrito en `orq.events`, en las tablas de comunicación, en cada post
// del historial y en cada membresía de canal. Crear un bot nuevo perdería el historial, dejaría al
// viejo como miembro de los canales y pondría DOS identidades a las que escribirle. Mattermost
// permite cambiar `username` y `display_name` conservando el id — el token también sigue valiendo,
// porque el token está atado al usuario, no a su nombre.
//
// ═══ POR QUÉ `mmctl --local` Y NO LA API ═══
//
// Probado el 27/08/2026 contra el servidor real, con el token del propio bot:
//   · `PUT /api/v4/bots/{id}`        → 404 "Bot does not exist" (el rol `system_user` del bot no
//                                       tiene `manage_bots`; Mattermost devuelve 404 y no 403)
//   · `PUT /api/v4/users/{id}/patch` → 403 "You do not have the appropriate permissions"
// Un bot no puede renombrarse a sí mismo, y el OS no tiene —ni debería tener— un token de system
// admin guardado. El camino que SÍ existe es el socket local del servidor, que no pide credencial
// porque pide estar adentro de la máquina. Por eso este script ejecuta `mmctl --local` en el
// contenedor y NO inventa una credencial nueva.
//
// ═══ LA EVIDENCIA ES DEL EFECTO ═══
//
// Después de aplicar, el script LEE el bot de vuelta POR LA API y con el MISMO token de siempre.
// Que `mmctl` diga "Updated" no prueba nada de lo que importa: lo que se quiere probar es que el
// nombre cambió Y que el token viejo sigue valiendo.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { USERNAME_CANONICO, NOMBRE_VISIBLE } from '../comunicacion/identidad-bot.mjs'

const APLICAR = process.argv.includes('--aplicar')
const CONFIG = process.env.ORQ_COMM_ENV || '/home/jorge/.config/echegaray-orq/comunicacion.env'

/** Lee el .env del servicio sin pisar lo que ya esté en el entorno. Nunca imprime un valor. */
function cargarEnv(ruta) {
  try {
    for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim())
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
    }
  } catch { /* sin archivo se usa lo que haya en el entorno */ }
}

async function mm(ruta, { metodo = 'GET', cuerpo = null } = {}) {
  const base = (process.env.MM_BASE_URL || 'http://127.0.0.1:8065').replace(/\/$/, '')
  const res = await fetch(`${base}/api/v4${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${process.env.MM_BOT_TOKEN}`, 'content-type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  const texto = await res.text()
  if (!res.ok) throw new Error(`mattermost ${metodo} ${ruta} → ${res.status}: ${texto.slice(0, 200)}`)
  return texto ? JSON.parse(texto) : null
}

cargarEnv(CONFIG)
if (!process.env.MM_BOT_TOKEN) {
  console.error('falta MM_BOT_TOKEN (fail-closed). Config esperada:', CONFIG)
  process.exit(1)
}

// El bot se identifica a sí mismo con su token: no hace falta pasarle el id ni adivinarlo.
const yo = await mm('/users/me')
console.log(`bot actual · id ${yo.id} · @${yo.username} · "${yo.first_name || yo.nickname || ''}"`)

if (yo.username === USERNAME_CANONICO) {
  console.log(`ya se llama @${USERNAME_CANONICO}. No hay nada que hacer (el script es idempotente).`)
  process.exit(0)
}

const CONTENEDOR = process.env.MM_CONTENEDOR || 'echegaray-mm-app'
const MMCTL = ['exec', CONTENEDOR, '/mattermost/bin/mmctl', '--local', 'bot', 'update', yo.username,
  '--username', USERNAME_CANONICO, '--display-name', NOMBRE_VISIBLE]

if (!APLICAR) {
  console.log(`\nSIN --aplicar no se toca nada. Haría:`)
  console.log(`  docker ${MMCTL.join(' ')}`)
  console.log(`  y después leería /users/me POR LA API, con el mismo token, para comprobar el efecto.`)
  console.log(`\nEl user_id NO cambia (${yo.id}): el historial, los canales y el token siguen.`)
  process.exit(0)
}

console.log(execFileSync('docker', MMCTL, { encoding: 'utf8' }).trim())

// LA PRUEBA. Se relee del servidor, no se confía en el 200 de arriba.
const despues = await mm('/users/me')
const ok = despues.username === USERNAME_CANONICO && despues.id === yo.id
console.log(`\nleído del servidor · id ${despues.id} · @${despues.username} · "${despues.first_name}"`)
console.log(ok ? '✔ renombrado y verificado; el user_id y el token se conservaron' : '✖ el servidor NO devuelve el nombre nuevo')
if (!ok) process.exit(1)
console.log(`\nSIGUIENTE PASO: MM_BOT_USERNAME=${USERNAME_CANONICO} en ${CONFIG} y reiniciar el consumidor WS.`)
console.log(`Mientras tanto @os sigue entrando por el alias de transición (MM_BOT_ALIAS).`)
