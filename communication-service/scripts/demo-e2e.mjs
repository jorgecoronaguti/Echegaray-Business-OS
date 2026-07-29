#!/usr/bin/env node
// PR-3 · Demostración funcional EXTREMO A EXTREMO del Communication Service.
//
// Prueba, sin tocar producción ni la red (FakeMattermost + repo en memoria + puente
// fake), los criterios de éxito del PR-3 y los ajustes bloqueantes de la auditoría:
//   1. El Business OS genera un evento canónico.        (M1: idempotencia por intención)
//   2. El Communication Service lo recibe (audita + encola con lease durable).  (M4)
//   3. El Mattermost Adapter lo publica correctamente.
//   4. Un mensaje de Mattermost vuelve como evento canónico (verificado por HMAC). (M7)
//   5. El OS lo recibe vía el puente hacia orq.events.  (M2 dedup atómico · M3 inbox/DLQ · M10 puente)
//
// El "OS" acá es un PuenteMemoria (fake) — en PR-4 será orq.events real, inyectado.
// Correr:  node scripts/demo-e2e.mjs
import {
  CommunicationService, RepositorioMemoria, MattermostAdapter, FakeMattermost,
  VerificadorEntrante, firmar, PuenteMemoria, crearLog, crearMetricas, TIPOS, deepLink,
} from '../src/index.mjs'

const log = (m) => console.log(m)
const linea = () => log('─'.repeat(72))
const SECRETO = 'demo-secreto-webhook'

async function main() {
  const cliente = new FakeMattermost()
  const puenteOS = new PuenteMemoria() // el "Business OS" fake (orq.events)
  const svc = new CommunicationService({
    repositorio: new RepositorioMemoria(),
    verificadorEntrante: new VerificadorEntrante({ secreto: SECRETO, ventanaSegundos: 300 }), // M7 enforced
    log: crearLog(() => {}),
    metricas: crearMetricas(),
  })
  svc.registrarAdapter(new MattermostAdapter({ cliente, botUserId: 'bot_os', tokenEntrante: 'secreto' }))
  // El único handler entrante en PR-3: publicar al OS por el puente (sin especialistas).
  svc.registrarHandlerEntrante(TIPOS.COMANDO_INVOCADO, (ev) => puenteOS.publicarHaciaOS(ev))
  svc.registrarHandlerEntrante(TIPOS.MENSAJE_RECIBIDO, (ev) => puenteOS.publicarHaciaOS(ev))

  linea(); log('PR-3 · DEMO EXTREMO A EXTREMO — Communication Service (0 red, 0 DB)'); linea()

  // ── SALIENTE ──
  log('\n▶ SALIENTE — el OS avisa al equipo\n')
  const salida = await svc.emitir({
    type: TIPOS.MENSAJE_PUBLICAR,
    intent_id: 'estrella-certif-4-aprobado', // M1: idempotencia por intención de negocio
    actor: { tipo: 'os', id: 'cfo', display: 'CFO IA' },
    data: { channel_id: 'canal-direccion', texto: '💰 La Estrella: certificado #4 aprobado.', deep_link: deepLink('obra', 'la-estrella') },
  })
  log(`  ① OS generó evento canónico   → ${salida.type}  key=${salida.idempotency_key}`)
  const resumen = await svc.procesarOutbox()
  log(`  ② Auditado + encolado (lease) → ${JSON.stringify(resumen)}`)
  log(`  ③ Adapter publicó en MM       → "${cliente.posts.at(-1).message.split('\n')[0]}"`)

  // ── ENTRANTE (verificado por HMAC) ──
  log('\n▶ ENTRANTE — alguien manda /os ping (con firma HMAC válida)\n')
  const rawBody = JSON.stringify({ command: '/os', text: 'ping' })
  const ts = Date.now()
  const entrante = await svc.recibir(
    { token: 'secreto', user_id: 'u-rodrigo', user_name: 'rodrigo', channel_id: 'canal-direccion', command: '/os', text: 'ping' },
    { seguridad: { rawBody, firma: firmar(SECRETO, rawBody, ts), timestamp: ts, ip: '10.0.0.5' } },
  )
  log(`  ④ MM → evento canónico        → ${entrante.type}  comando=/${entrante.data.comando}`)
  const ri = await svc.procesarInbox()
  log(`  ⑤ El OS lo recibió por el puente → ${JSON.stringify(ri)}  · orq.events fake: ${puenteOS.publicados.length}`)
  log(`     Tipo del evento del OS       → ${puenteOS.publicados.at(-1).type}  (correlation preservado)`)

  // ── Verificación dura ──
  linea()
  const rechazado = await svc.recibir({ command: '/os', text: 'ping' }, { seguridad: { rawBody, firma: 'FALSA', timestamp: ts } })
  const checks = [
    ['① OS genera evento canónico', salida?.type === TIPOS.MENSAJE_PUBLICAR],
    ['② Communication Service audita+encola', resumen.publicados === 1],
    ['③ Mattermost Adapter publica', cliente.posts.length === 1],
    ['④ MM vuelve como evento canónico', entrante?.type === TIPOS.COMANDO_INVOCADO],
    ['⑤ El OS lo recibe por el puente', puenteOS.publicados.length === 1],
    ['↩ hilo causal preservado end-to-end', puenteOS.publicados.at(-1).correlation_id === entrante.correlation_id],
    ['🔒 M7: firma inválida se RECHAZA y audita', rechazado?.rechazado === true],
  ]
  let ok = true
  for (const [n, c] of checks) { log(`  ${c ? '✅' : '❌'}  ${n}`); ok = ok && c }
  linea()
  if (!ok) { log('DEMO FALLÓ'); process.exit(1) }
  log('DEMO OK — circuito desacoplado + ajustes bloqueantes, sin tocar producción.')
}

main().catch((e) => { console.error(e); process.exit(1) })
