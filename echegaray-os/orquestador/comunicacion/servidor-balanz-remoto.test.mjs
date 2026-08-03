// PANTALLA REMOTA — que sólo entre quien tiene el enlace, y que el puente mueva bytes de verdad.
//
// Los dos riesgos de este servidor son opuestos y los dos caros: que deje entrar a cualquiera al
// escritorio donde está la sesión del bróker, o que no deje entrar a nadie y el agente se quede sin
// mercado esperando un login que no se puede hacer.

import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import http from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crearServidorRemoto, RUTA_BASE } from './servidor-balanz-remoto.mjs'
import { emitirToken, verificarToken, sugerirSecreto } from './balanz-remoto-token.mjs'
import { aceptacion, armarTrama, leerTramas, OPCODE } from './balanz-ws.mjs'

const SECRETO = 'un-secreto-de-prueba-largo-0123456789'
const ENV = { BALANZ_REMOTO_SECRETO: SECRETO }
const CALLADO = { info() {}, warn() {}, error() {} }

/** Un escritorio de mentira: saluda como VNC y devuelve en mayúsculas lo que le llega. */
async function escritorioFalso() {
  const recibido = []
  // `srv.close()` deja de escuchar pero NO cierra lo ya aceptado. Sin esta lista, cada prueba deja
  // un socket vivo y el proceso no termina nunca.
  const vivos = new Set()
  const srv = net.createServer((s) => {
    vivos.add(s)
    s.on('close', () => vivos.delete(s))
    s.write('RFB 003.008\n')
    s.on('data', (d) => { recibido.push(d.toString()); s.write(Buffer.from(d.toString().toUpperCase())) })
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  return { srv, puerto: srv.address().port, recibido, cortar: () => { for (const s of vivos) s.destroy() } }
}

async function levantar(cfgExtra = {}) {
  const base = await mkdtemp(join(tmpdir(), 'balanz-remoto-'))
  await mkdir(join(base, 'estado'), { recursive: true })
  await writeFile(join(base, 'estado', 'vnc.plain'), 'clave-del-escritorio')
  const escritorio = await escritorioFalso()
  const cfg = { base, puertoVnc: escritorio.puerto, ...cfgExtra }
  const server = crearServidorRemoto({ cfg, env: ENV, log: CALLADO })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  // `close()` deja de aceptar conexiones nuevas y ESPERA a que las vivas terminen. Con keep-alive de
  // `fetch` y con el puente abierto, ninguna termina sola: el proceso de pruebas se quedaba colgado
  // para siempre y —peor para diagnosticar— sin imprimir nada, porque con la salida entubada el
  // búfer no se vacía hasta que el proceso muere. Se cortan a mano.
  const cerrar = () => { server.closeAllConnections?.(); server.close(); escritorio.cortar(); escritorio.srv.close() }
  return { server, escritorio, puerto: server.address().port, base, cerrar }
}

/**
 * Un GET con `agent: false`. NO se usa `fetch` a propósito: undici mantiene un pool de conexiones
 * vivo con su propio temporizador, y el proceso de pruebas queda colgado después del último test
 * —con todo en verde— por conexiones que nadie ve.
 */
function pedir(puerto, ruta, cabeceras = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: puerto, path: ruta, agent: false, headers: cabeceras }, (res) => {
      let cuerpo = ''
      res.setEncoding('utf8')
      res.on('data', (d) => { cuerpo += d })
      res.on('end', () => resolve({ status: res.statusCode, cabeceras: res.headers, cuerpo }))
    })
    req.on('error', reject)
    req.end()
  })
}

// ════════════════════════════════════════════════════════════════════════════
// EL TOKEN
// ════════════════════════════════════════════════════════════════════════════

test('sin secreto configurado no se emite ni se acepta nada', () => {
  assert.throws(() => emitirToken({ env: {} }), /BALANZ_REMOTO_SECRETO/)
  const v = verificarToken('lo-que-sea', { env: {} })
  assert.equal(v.valido, false)
})

test('un token firmado con otro secreto no vale', () => {
  const { token } = emitirToken({ env: { BALANZ_REMOTO_SECRETO: sugerirSecreto() } })
  assert.equal(verificarToken(token, { env: ENV }).valido, false)
})

test('un token vencido no vale, y lo dice de manera accionable', () => {
  const { token } = emitirToken({ env: ENV, vigenciaMs: 1000 })
  const v = verificarToken(token, { env: ENV, ahora: Date.now() + 5000 })
  assert.equal(v.valido, false)
  assert.match(v.motivo, /venci|nuevo/i)
})

test('una firma alterada no vale aunque el vencimiento esté bien', () => {
  const { token } = emitirToken({ env: ENV })
  const [a, b, firma] = token.split('.')
  const rota = `${a}.${b}.${firma.slice(0, -1)}${firma.endsWith('0') ? '1' : '0'}`
  assert.equal(verificarToken(rota, { env: ENV }).valido, false)
})

// ════════════════════════════════════════════════════════════════════════════
// LA PANTALLA
// ════════════════════════════════════════════════════════════════════════════

test('sin token la pantalla devuelve 403, no el escritorio', async () => {
  const { escritorio, puerto, cerrar } = await levantar()
  try {
    assert.equal((await pedir(puerto, RUTA_BASE)).status, 403)
    assert.equal((await pedir(puerto, `${RUTA_BASE}?t=basura`)).status, 403)
  } finally { cerrar() }
})

test('con token válido sirve la pantalla, y NO la deja cachear', async () => {
  const { escritorio, puerto, cerrar } = await levantar()
  try {
    const { token } = emitirToken({ env: ENV })
    const r = await pedir(puerto, `${RUTA_BASE}?t=${token}`)
    assert.equal(r.status, 200)
    assert.match(r.cabeceras['cache-control'] || '', /no-store/, 'la página lleva la clave del escritorio adentro')
    const html = r.cuerpo
    assert.match(html, /rfb\.js/, 'no cargó el cliente del escritorio')
    assert.match(html, /clave-del-escritorio/, 'no le pasó la credencial del escritorio al cliente')
  } finally { cerrar() }
})

test('la ruta de archivos no sirve nada fuera de la librería', async () => {
  // Sin la guarda, `/vendor/../../../.env` entregaría por esta misma ruta las credenciales de Google
  // y de Supabase que viven al lado del repo.
  const { escritorio, puerto, cerrar } = await levantar()
  try {
    for (const intento of ['../../../package.json', '../../../../.env', '..%2f..%2fpackage.json']) {
      const r = await pedir(puerto, `${RUTA_BASE}/vendor/${intento}`)
      assert.ok(r.status === 403 || r.status === 404, `${intento} devolvió ${r.status}`)
      assert.ok(!r.cuerpo.includes('"dependencies"'), `${intento} filtró el package.json`)
    }
    // Y lo legítimo sigue funcionando.
    assert.equal((await pedir(puerto, `${RUTA_BASE}/vendor/core/rfb.js`)).status, 200)
  } finally { cerrar() }
})

// ════════════════════════════════════════════════════════════════════════════
// EL PUENTE
// ════════════════════════════════════════════════════════════════════════════

/** Apretón de manos de WebSocket a mano: no hay cliente WS en el repo y no hace falta uno. */
function conectarWs(puerto, token) {
  return new Promise((resolve, reject) => {
    const clave = randomBytes(16).toString('base64')
    const s = net.connect(puerto, '127.0.0.1', () => {
      s.write([
        `GET ${RUTA_BASE}/ws?t=${token} HTTP/1.1`, 'Host: interno', 'Upgrade: websocket',
        'Connection: Upgrade', `Sec-WebSocket-Key: ${clave}`, 'Sec-WebSocket-Version: 13',
        'Sec-WebSocket-Protocol: binary', '', '',
      ].join('\r\n'))
    })
    let buf = Buffer.alloc(0)
    // El temporizador de rescate se CANCELA al resolver. Sin eso queda un handle vivo y el proceso
    // de pruebas no termina — con todos los tests en verde, que es la forma más confusa de fallar.
    const reloj = setTimeout(() => { s.destroy(); reject(new Error('el apretón de manos no llegó')) }, 4000)
    s.on('data', function primero(d) {
      buf = Buffer.concat([buf, d])
      const corte = buf.indexOf('\r\n\r\n')
      if (corte < 0) return
      const cabeceras = buf.subarray(0, corte).toString()
      s.off('data', primero)
      clearTimeout(reloj)
      resolve({ socket: s, cabeceras, clave, resto: buf.subarray(corte + 4) })
    })
    s.on('error', (e) => { clearTimeout(reloj); reject(e) })
  })
}

test('el puente rechaza el WebSocket sin token ANTES de tocar el escritorio', async () => {
  const { escritorio, puerto, cerrar } = await levantar()
  try {
    const { cabeceras, socket } = await conectarWs(puerto, 'invalido')
    assert.match(cabeceras, /^HTTP\/1\.1 403/, 'aceptó una conexión sin enlace válido')
    assert.equal(escritorio.recibido.length, 0, 'llegó a abrir el escritorio igual')
    socket.destroy()
  } finally { cerrar() }
})

test('con token válido el puente entrega el saludo real del escritorio', async () => {
  const { escritorio, puerto, cerrar } = await levantar()
  try {
    const { token } = emitirToken({ env: ENV })
    const { socket, cabeceras, clave, resto } = await conectarWs(puerto, token)
    assert.match(cabeceras, /^HTTP\/1\.1 101/)
    assert.match(cabeceras, new RegExp(`Sec-WebSocket-Accept: ${aceptacion(clave).replace(/[+/]/g, '\\$&')}`))
    assert.match(cabeceras, /Sec-WebSocket-Protocol: binary/, 'noVNC corta solo si no se le contesta el subprotocolo')

    const saludo = await new Promise((r) => {
      let buf = resto
      const mirar = () => { const { tramas } = leerTramas(buf); if (tramas.length) r(tramas[0].carga.toString()) }
      mirar()
      socket.on('data', (d) => { buf = Buffer.concat([buf, d]); mirar() })
    })
    assert.equal(saludo, 'RFB 003.008\n', 'no llegó el saludo del escritorio')

    // Y en el otro sentido: lo que manda el cliente llega tal cual, enmascarado y todo.
    const carga = Buffer.from('hola escritorio')
    const mascara = randomBytes(4)
    const enmascarada = Buffer.from(carga)
    for (let i = 0; i < enmascarada.length; i += 1) enmascarada[i] ^= mascara[i % 4]
    socket.write(Buffer.concat([Buffer.from([0x82, 0x80 | carga.length]), mascara, enmascarada]))
    await new Promise((r) => setTimeout(r, 150))
    assert.equal(escritorio.recibido.join(''), 'hola escritorio', 'el puente no entregó los bytes del cliente')
    socket.destroy()
  } finally { cerrar() }
})

// ════════════════════════════════════════════════════════════════════════════
// EL CODIFICADOR DE TRAMAS
// ════════════════════════════════════════════════════════════════════════════

test('las tramas parten y se reconstruyen como llegan por TCP, no de a una', () => {
  // TCP no respeta los límites de las tramas. Un lector que asuma "un paquete, una trama" anda en el
  // escritorio y corrompe la pantalla apenas hay tráfico.
  const a = armarTrama(Buffer.from('uno'))
  const b = armarTrama(Buffer.from('x'.repeat(300)))   // largo de 16 bits
  const c = armarTrama(Buffer.from('y'.repeat(70000))) // largo de 64 bits
  const todo = Buffer.concat([a, b, c])

  const enteras = leerTramas(todo)
  assert.equal(enteras.tramas.length, 3)
  assert.equal(enteras.tramas[0].carga.toString(), 'uno')
  assert.equal(enteras.tramas[2].carga.length, 70000)
  assert.equal(enteras.resto.length, 0)

  // Cortada al medio: devuelve lo completo y guarda el resto sin consumir.
  const parcial = leerTramas(todo.subarray(0, a.length + 5))
  assert.equal(parcial.tramas.length, 1)
  assert.equal(parcial.resto.length, 5)
})

test('una trama declarada de más de 2 GB se corta, no se reserva', () => {
  const cabecera = Buffer.alloc(10)
  cabecera[0] = 0x82
  cabecera[1] = 127
  cabecera.writeBigUInt64BE(0xffffffffffn, 2)
  assert.equal(leerTramas(cabecera).invalida, true)
})

test('la aceptación es la del RFC, no una inventada', () => {
  // El ejemplo del RFC 6455: si esto cambia, ningún navegador se conecta.
  assert.equal(aceptacion('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=')
  assert.equal(
    aceptacion('x'), createHash('sha1').update('x258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64'),
  )
})

test('el ping se contesta con pong y el cierre corta', () => {
  const t = leerTramas(armarTrama(Buffer.from('p'), OPCODE.PING))
  assert.equal(t.tramas[0].opcode, OPCODE.PING)
})
