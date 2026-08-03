// WEBSOCKET MÍNIMO — el puente entre el navegador del dueño y el escritorio de la VM.
//
// ═══ POR QUÉ ESCRITO A MANO Y NO CON UNA LIBRERÍA ═══
//
// Hace falta exactamente una cosa: pasar bytes entre un WebSocket y un socket TCP, en las dos
// direcciones, sin mirarlos. Una dependencia nueva para eso agrega superficie a un camino que
// transporta —justamente— lo que alguien tipea en la pantalla de un bróker.
//
// Y ese es el punto que importa: **este módulo no interpreta el contenido**. No sabe qué es una
// tecla, no arma eventos de teclado, no distingue una contraseña de un movimiento del mouse. Mueve
// tramas opacas. Es la diferencia con la alternativa que se descartó —manejar la pantalla por CDP,
// despachando `Input.dispatchKeyEvent` tecla por tecla—, donde el código del OS tendría que
// construir cada pulsación de la contraseña y del OTP.
//
// Nada de lo que pasa por acá se registra: ni las tramas, ni su tamaño, ni su contenido.

import { createHash } from 'node:crypto'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/** La respuesta del apretón de manos, tal como la exige el RFC 6455. */
export function aceptacion(clave) {
  return createHash('sha1').update(String(clave) + GUID).digest('base64')
}

/**
 * Arma una trama de servidor. Sin máscara (el RFC la prohíbe en ese sentido) y con el largo en el
 * ancho que corresponda: 7 bits, 16 o 64. Escribir siempre en 64 bits funciona en la mayoría de los
 * clientes y es inválido para los estrictos.
 */
export function armarTrama(datos, opcode = 0x2) {
  const carga = Buffer.isBuffer(datos) ? datos : Buffer.from(datos)
  const n = carga.length
  let cabecera
  if (n < 126) {
    cabecera = Buffer.alloc(2)
    cabecera[1] = n
  } else if (n < 65536) {
    cabecera = Buffer.alloc(4)
    cabecera[1] = 126
    cabecera.writeUInt16BE(n, 2)
  } else {
    cabecera = Buffer.alloc(10)
    cabecera[1] = 127
    cabecera.writeBigUInt64BE(BigInt(n), 2)
  }
  cabecera[0] = 0x80 | opcode // FIN + opcode
  return Buffer.concat([cabecera, carga])
}

export const OPCODE = { CONTINUACION: 0x0, TEXTO: 0x1, BINARIO: 0x2, CIERRE: 0x8, PING: 0x9, PONG: 0xa }

/**
 * Lee todas las tramas COMPLETAS que haya en el búfer y devuelve el resto sin consumir.
 *
 * Que devuelva el resto no es un detalle: TCP no respeta los límites de las tramas. Una trama puede
 * llegar partida en dos paquetes y dos tramas pueden llegar en uno. Un lector que asuma "un paquete,
 * una trama" funciona en las pruebas de escritorio y corrompe la pantalla apenas hay tráfico real.
 */
export function leerTramas(buffer) {
  const tramas = []
  let resto = buffer
  for (;;) {
    if (resto.length < 2) break
    const fin = (resto[0] & 0x80) !== 0
    const opcode = resto[0] & 0x0f
    const enmascarada = (resto[1] & 0x80) !== 0
    let largo = resto[1] & 0x7f
    let i = 2
    if (largo === 126) {
      if (resto.length < 4) break
      largo = resto.readUInt16BE(2); i = 4
    } else if (largo === 127) {
      if (resto.length < 10) break
      const g = resto.readBigUInt64BE(2)
      // Una trama de más de 2 GB no es tráfico de VNC: es una trama corrupta o alguien probando.
      if (g > 0x7fffffffn) return { tramas, resto, invalida: true }
      largo = Number(g); i = 10
    }
    const mascara = enmascarada ? resto.subarray(i, i + 4) : null
    if (enmascarada) i += 4
    if (resto.length < i + largo) break
    const carga = Buffer.from(resto.subarray(i, i + largo))
    // El cliente SIEMPRE enmascara; el servidor nunca. Se desenmascara acá y no se toca nada más.
    if (mascara) for (let k = 0; k < carga.length; k += 1) carga[k] ^= mascara[k % 4]
    tramas.push({ fin, opcode, carga })
    resto = resto.subarray(i + largo)
  }
  return { tramas, resto, invalida: false }
}

/**
 * Completa el apretón de manos sobre un socket ya "upgradeado".
 * @returns {boolean} si se aceptó
 */
export function responderApreton(socket, cabeceras) {
  const clave = cabeceras['sec-websocket-key']
  if (!clave) { socket.destroy(); return false }
  const pedidos = String(cabeceras['sec-websocket-protocol'] || '').split(',').map((s) => s.trim()).filter(Boolean)
  const lineas = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${aceptacion(clave)}`,
  ]
  // noVNC pide el subprotocolo `binary`. Si se lo pide y no se le contesta, el navegador corta la
  // conexión él solo, con un error que no dice por qué.
  if (pedidos.includes('binary')) lineas.push('Sec-WebSocket-Protocol: binary')
  socket.write(`${lineas.join('\r\n')}\r\n\r\n`)
  return true
}
