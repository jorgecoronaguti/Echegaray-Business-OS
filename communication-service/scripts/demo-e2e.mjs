#!/usr/bin/env node
// PR-3 · Demostración funcional EXTREMO A EXTREMO del Communication Service.
//
// Prueba, sin tocar producción ni la red (FakeMattermost + repo en memoria), los
// 5 criterios de éxito del PR-3:
//   1. El Business OS genera un evento canónico.
//   2. El Communication Service lo recibe (lo audita + encola).
//   3. El Mattermost Adapter lo publica correctamente.
//   4. Un mensaje iniciado desde Mattermost vuelve convertido al evento canónico.
//   5. El Business OS lo recibe correctamente.
//
// Todo desacoplado: el "OS" acá es un handler de juguete (en PR-4 será el Work
// Fabric / Director IA). Correr:  node scripts/demo-e2e.mjs
import {
  CommunicationService, RepositorioMemoria, MattermostAdapter, FakeMattermost,
  crearLog, crearMetricas, TIPOS, deepLink,
} from '../src/index.mjs'

const log = (m) => console.log(m)
const linea = () => log('─'.repeat(72))

async function main() {
  // Wiring (esto lo hará el OS en el arranque real).
  const cliente = new FakeMattermost()
  const svc = new CommunicationService({
    repositorio: new RepositorioMemoria(),
    log: crearLog(() => {}), // silenciamos el log estructurado para la demo
    metricas: crearMetricas(),
  })
  svc.registrarAdapter(new MattermostAdapter({ cliente, botUserId: 'bot_os', tokenEntrante: 'secreto' }))

  linea(); log('PR-3 · DEMO EXTREMO A EXTREMO — Communication Service (0 red, 0 DB)'); linea()

  // ── SALIENTE: OS → canónico → servicio → adapter → Mattermost ──
  log('\n▶ SALIENTE — el OS quiere avisar algo al equipo\n')
  const salida = await svc.emitir({
    type: TIPOS.MENSAJE_PUBLICAR,
    actor: { tipo: 'os', id: 'cfo', display: 'CFO IA' },
    data: {
      channel_id: 'canal-direccion',
      texto: '💰 La Estrella: certificado #4 aprobado. Margen devengado actualizado.',
      deep_link: deepLink('obra', 'la-estrella'),
    },
  })
  log(`  ① OS generó evento canónico   → ${salida.type}  id=${salida.id.slice(0, 8)}…`)
  log(`  ② Servicio lo auditó + encoló → idempotency_key=${salida.idempotency_key.slice(0, 12)}…`)
  const resumen = await svc.procesarOutbox()
  log(`  ③ Adapter lo publicó en MM    → ${JSON.stringify(resumen)}`)
  const post = cliente.posts.at(-1)
  log(`     Mattermost recibió el post → "${post.message.split('\n')[0]}"`)
  log(`     (con deep link al OS y correlation_id ${post.props.os_correlation_id.slice(0, 8)}… en props)`)

  // ── ENTRANTE: Mattermost → adapter → canónico → OS ──
  log('\n▶ ENTRANTE — alguien escribe en el chat y el OS reacciona\n')
  let recibidoPorOs = null
  svc.registrarHandlerEntrante(TIPOS.COMANDO_INVOCADO, async (ev, { emitir }) => {
    recibidoPorOs = ev
    // El "OS" (juguete) responde. En PR-4 esto lo decide el Director IA.
    await emitir({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: ev.data.channel_id, texto: 'pong · el OS te escucha ✅' } })
  })
  const entrante = await svc.recibir({
    token: 'secreto', user_id: 'u-rodrigo', user_name: 'rodrigo',
    channel_id: 'canal-direccion', command: '/os', text: 'ping',
  })
  log(`  ④ MM → evento canónico       → ${entrante.type}  comando=/${entrante.data.comando}`)
  log(`  ⑤ El OS lo recibió           → actor=${recibidoPorOs.actor.display}  args="${recibidoPorOs.data.argumentos}"`)
  await svc.procesarOutbox()
  log(`     El OS respondió al chat    → "${cliente.posts.at(-1).message}"`)
  log(`     El hilo causal se mantuvo  → correlation ${cliente.posts.at(-1).props.os_correlation_id.slice(0, 8)}… == ${entrante.correlation_id.slice(0, 8)}…`)

  // ── Verificación dura de los 5 criterios ──
  linea()
  const checks = [
    ['① OS genera evento canónico', salida?.type === TIPOS.MENSAJE_PUBLICAR],
    ['② Communication Service lo recibe', Boolean(salida?.idempotency_key)],
    ['③ Mattermost Adapter publica', resumen.publicados === 1 && cliente.posts.length >= 1],
    ['④ MM vuelve como evento canónico', entrante?.type === TIPOS.COMANDO_INVOCADO],
    ['⑤ El OS lo recibe', recibidoPorOs?.data?.comando === 'os'],
    ['↩ hilo causal auditable end-to-end', cliente.posts.at(-1).props.os_correlation_id === entrante.correlation_id],
  ]
  let ok = true
  for (const [nombre, cond] of checks) {
    log(`  ${cond ? '✅' : '❌'}  ${nombre}`)
    ok = ok && cond
  }
  linea()
  if (!ok) {
    log('DEMO FALLÓ'); process.exit(1)
  }
  log('DEMO OK — circuito extremo a extremo desacoplado, sin tocar producción.')
}

main().catch((e) => { console.error(e); process.exit(1) })
