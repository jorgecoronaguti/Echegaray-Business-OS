#!/usr/bin/env node
// DEJAR UNA FIRMA ESCANEADA LISTA PARA SELLAR.
//
//   node orquestador/scripts/firma-preparar.mjs <escaneo.png> [destino.png]
//
// Fondo blanco → transparente y margen de papel recortado. El destino por defecto es la credencial
// que usa el sellador: `~/.config/echegaray-orq/firma-empleador.png`. Si ya existe, se guarda una
// copia con la fecha antes de reemplazarla — una firma es una credencial y se reemplaza con vuelta
// atrás, no a ciegas.
//
// Sólo PNG de 8 bits RGB/RGBA sin entrelazar, que es lo que sale de cualquier escáner o captura. Un
// formato que no reconoce se rechaza con el motivo: convertir a ciegas una imagen que no se entendió
// es la forma de estampar un rectángulo negro en 671 recibos.
import fs from 'node:fs'
import zlib from 'node:zlib'
import { fondoATransparente, cajaDeLaTinta, recortar } from '../lib/firma-imagen.mjs'

const FIRMA = 'ECSAS'

/** PNG → { ancho, alto, rgba }. Soporta color 2 (RGB) y 6 (RGBA), 8 bits, no entrelazado. */
export function leerPNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('no es un PNG')
  const ancho = buf.readUInt32BE(16); const alto = buf.readUInt32BE(20)
  const bits = buf[24]; const color = buf[25]; const entrelazado = buf[28]
  if (bits !== 8) throw new Error(`PNG de ${bits} bits: sólo se leen los de 8`)
  if (color !== 2 && color !== 6) throw new Error(`PNG de tipo ${color}: sólo RGB (2) y RGBA (6)`)
  if (entrelazado) throw new Error('PNG entrelazado (Adam7): no soportado')
  const bpp = color === 6 ? 4 : 3
  const trozos = []
  for (let p = 8; p < buf.length;) {
    const len = buf.readUInt32BE(p); const tipo = buf.toString('ascii', p + 4, p + 8)
    if (tipo === 'IDAT') trozos.push(buf.subarray(p + 8, p + 8 + len))
    p += 12 + len
    if (tipo === 'IEND') break
  }
  const crudo = zlib.inflateSync(Buffer.concat(trozos))
  const paso = ancho * bpp
  const lineas = Buffer.alloc(alto * paso)
  let q = 0
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[q++]
    for (let x = 0; x < paso; x++) {
      const a = x >= bpp ? lineas[(y * paso) + x - bpp] : 0
      const b = y > 0 ? lineas[((y - 1) * paso) + x] : 0
      const c = (x >= bpp && y > 0) ? lineas[((y - 1) * paso) + x - bpp] : 0
      let v = crudo[q + x]
      if (filtro === 1) v += a
      else if (filtro === 2) v += b
      else if (filtro === 3) v += (a + b) >> 1
      else if (filtro === 4) {
        const pa = Math.abs(b - c); const pb = Math.abs(a - c); const pc = Math.abs(a + b - (2 * c))
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      lineas[(y * paso) + x] = v & 255
    }
    q += paso
  }
  if (bpp === 4) return { ancho, alto, rgba: new Uint8Array(lineas) }
  const rgba = new Uint8Array(ancho * alto * 4)
  for (let i = 0, j = 0; i < ancho * alto; i++, j += 3) {
    rgba[i * 4] = lineas[j]; rgba[(i * 4) + 1] = lineas[j + 1]; rgba[(i * 4) + 2] = lineas[j + 2]; rgba[(i * 4) + 3] = 255
  }
  return { ancho, alto, rgba }
}

/** RGBA → PNG (filtro 0 en todas las líneas: la firma es chica y no vale la pena optimizar). */
export function escribirPNG(rgba, ancho, alto) {
  const paso = ancho * 4
  const crudo = Buffer.alloc((paso + 1) * alto)
  for (let y = 0; y < alto; y++) {
    crudo[y * (paso + 1)] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + (y * paso), paso).copy(crudo, (y * (paso + 1)) + 1)
  }
  const trozo = (tipo, datos) => {
    const b = Buffer.alloc(datos.length + 12)
    b.writeUInt32BE(datos.length, 0); b.write(tipo, 4, 'ascii'); datos.copy(b, 8)
    b.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(tipo, 'ascii'), datos])) >>> 0, datos.length + 8)
    return b
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr), trozo('IDAT', zlib.deflateSync(crudo)), trozo('IEND', Buffer.alloc(0)),
  ])
}

if (process.argv[1]?.endsWith('firma-preparar.mjs')) {
  const origen = process.argv[2]
  if (!origen) { console.error('uso: firma-preparar.mjs <escaneo.png> [destino.png]'); process.exit(2) }
  const destino = process.argv[3] || `${process.env.HOME}/.config/echegaray-orq/firma-empleador.png`

  const { ancho, alto, rgba } = leerPNG(fs.readFileSync(origen))
  const opacos = rgba.filter((_, i) => i % 4 === 3 && rgba[i] > 200).length
  const limpia = fondoATransparente(rgba)
  const caja = cajaDeLaTinta(limpia, ancho, alto)
  if (!caja) { console.error('✖ la imagen no tiene tinta: no es una firma'); process.exit(1) }
  const recortada = recortar(limpia, ancho, caja)
  const png = escribirPNG(recortada, caja.ancho, caja.alto)

  console.log(`origen    ${ancho}×${alto} · ${opacos} píxeles opacos`)
  console.log(`tinta en  x ${caja.x}..${caja.x + caja.ancho} · y ${caja.y}..${caja.y + caja.alto}`)
  console.log(`resultado ${caja.ancho}×${caja.alto} · proporción ${(caja.ancho / caja.alto).toFixed(3)} · fondo transparente`)

  if (fs.existsSync(destino)) {
    const copia = destino.replace(/\.png$/, `-${new Date().toISOString().slice(0, 10)}.png`)
    fs.copyFileSync(destino, copia)
    console.log(`copia de la anterior → ${copia}`)
  }
  fs.mkdirSync(destino.replace(/\/[^/]+$/, ''), { recursive: true })
  fs.writeFileSync(destino, png)
  console.log(`escrita → ${destino}  (${FIRMA})`)
}
