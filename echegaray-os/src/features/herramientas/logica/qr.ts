// EL QR DE LA ETIQUETA — un codificador chico, propio y probado contra un lector real (jsQR).
//
// ═══ POR QUÉ NO UNA LIBRERÍA ═══
//
// El repo ya trae `jsqr` (el LECTOR) pero no un generador, y los worktrees comparten el `node_modules`
// del checkout principal: agregar una dependencia obliga a instalarla ahí, fuera de esta rama. Una
// etiqueta codifica UNA cosa corta —`https://app.ecsas.com.ar/h/HER-0042`, ~40 bytes—, así que alcanza
// con modo byte, versiones 1 a 10 y corrección M (15 % de módulos recuperables: una etiqueta rayada en
// obra se sigue leyendo). El algoritmo es el estándar ISO/IEC 18004 en la forma de Nayuki.
//
// LA PRUEBA NO LEE LO QUE ESTE ARCHIVO ESCRIBE CON ESTE ARCHIVO: `qr.test.ts` rasteriza la matriz y la
// decodifica con `jsqr`, que es de otro autor. Un control que se valida contra sí mismo no controla.

export type Correccion = 'L' | 'M' | 'Q' | 'H'

const ECL_BITS: Record<Correccion, number> = { L: 1, M: 0, Q: 3, H: 2 }
const ECL_IDX: Record<Correccion, number> = { L: 0, M: 1, Q: 2, H: 3 }

// Índice [ecl][versión]; la versión 0 no existe.
const ECC_POR_BLOQUE = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
]
const BLOQUES = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
]
export const VERSION_MAXIMA = 10

function modulosCrudos(ver: number): number {
  let r = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2
    r -= (25 * n - 10) * n - 55
    if (ver >= 7) r -= 36
  }
  return r
}

function palabrasDeDatos(ver: number, ecl: Correccion): number {
  const e = ECL_IDX[ecl]
  return Math.floor(modulosCrudos(ver) / 8) - ECC_POR_BLOQUE[e][ver] * BLOQUES[e][ver]
}

function mulGF(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

function divisorRS(grado: number): number[] {
  const r = new Array<number>(grado).fill(0)
  r[grado - 1] = 1
  let raiz = 1
  for (let i = 0; i < grado; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = mulGF(r[j], raiz)
      if (j + 1 < r.length) r[j] ^= r[j + 1]
    }
    raiz = mulGF(raiz, 0x02)
  }
  return r
}

function restoRS(datos: number[], divisor: number[]): number[] {
  const r = new Array<number>(divisor.length).fill(0)
  for (const b of datos) {
    const f = b ^ (r.shift() as number)
    r.push(0)
    divisor.forEach((c, i) => { r[i] ^= mulGF(c, f) })
  }
  return r
}

function utf8(texto: string): number[] {
  return Array.from(new TextEncoder().encode(texto))
}

/** Datos + corrección, intercalados por bloque como pide la norma. */
function conCorreccion(datos: number[], ver: number, ecl: Correccion): number[] {
  const e = ECL_IDX[ecl]
  const nBloques = BLOQUES[e][ver]
  const eccLen = ECC_POR_BLOQUE[e][ver]
  const crudas = Math.floor(modulosCrudos(ver) / 8)
  const cortos = nBloques - (crudas % nBloques)
  const largoCorto = Math.floor(crudas / nBloques)
  const div = divisorRS(eccLen)
  const bloques: number[][] = []
  for (let i = 0, k = 0; i < nBloques; i++) {
    const dat = datos.slice(k, k + largoCorto - eccLen + (i < cortos ? 0 : 1))
    k += dat.length
    const ecc = restoRS(dat, div)
    if (i < cortos) dat.push(0)
    bloques.push(dat.concat(ecc))
  }
  const out: number[] = []
  for (let i = 0; i < bloques[0].length; i++) {
    bloques.forEach((b, j) => {
      if (i !== largoCorto - eccLen || j >= cortos) out.push(b[i])
    })
  }
  return out
}

class Lienzo {
  readonly ver: number
  readonly n: number
  readonly m: boolean[][]
  readonly fn: boolean[][]
  constructor(ver: number) {
    this.ver = ver
    this.n = ver * 4 + 17
    this.m = Array.from({ length: this.n }, () => new Array<boolean>(this.n).fill(false))
    this.fn = Array.from({ length: this.n }, () => new Array<boolean>(this.n).fill(false))
  }
  fijo(x: number, y: number, oscuro: boolean) {
    this.m[y][x] = oscuro
    this.fn[y][x] = true
  }
}

function bit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0
}

function dibujarFormato(l: Lienzo, ecl: Correccion, mascara: number) {
  const d = (ECL_BITS[ecl] << 3) | mascara
  let r = d
  for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537)
  const b = ((d << 10) | r) ^ 0x5412
  for (let i = 0; i <= 5; i++) l.fijo(8, i, bit(b, i))
  l.fijo(8, 7, bit(b, 6))
  l.fijo(8, 8, bit(b, 7))
  l.fijo(7, 8, bit(b, 8))
  for (let i = 9; i < 15; i++) l.fijo(14 - i, 8, bit(b, i))
  for (let i = 0; i < 8; i++) l.fijo(l.n - 1 - i, 8, bit(b, i))
  for (let i = 8; i < 15; i++) l.fijo(8, l.n - 15 + i, bit(b, i))
  l.fijo(8, l.n - 8, true)
}

function posicionesAlineacion(ver: number): number[] {
  if (ver === 1) return []
  const n = Math.floor(ver / 7) + 2
  const paso = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2
  const r = [6]
  for (let p = ver * 4 + 17 - 7; r.length < n; p -= paso) r.splice(1, 0, p)
  return r
}

function dibujarPatrones(l: Lienzo, ecl: Correccion) {
  for (let i = 0; i < l.n; i++) {
    l.fijo(6, i, i % 2 === 0)
    l.fijo(i, 6, i % 2 === 0)
  }
  for (const [cx, cy] of [[3, 3], [l.n - 4, 3], [3, l.n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx
        const y = cy + dy
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        if (x >= 0 && x < l.n && y >= 0 && y < l.n) l.fijo(x, y, dist !== 2 && dist !== 4)
      }
    }
  }
  const pos = posicionesAlineacion(l.ver)
  const k = pos.length
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === k - 1) || (i === k - 1 && j === 0)) continue
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) l.fijo(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
      }
    }
  }
  dibujarFormato(l, ecl, 0)
  if (l.ver >= 7) {
    let r = l.ver
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25)
    const b = (l.ver << 12) | r
    for (let i = 0; i < 18; i++) {
      const a = l.n - 11 + (i % 3)
      const c = Math.floor(i / 3)
      l.fijo(a, c, bit(b, i))
      l.fijo(c, a, bit(b, i))
    }
  }
}

function dibujarPalabras(l: Lienzo, datos: number[]) {
  let i = 0
  for (let der = l.n - 1; der >= 1; der -= 2) {
    if (der === 6) der = 5
    for (let v = 0; v < l.n; v++) {
      for (let j = 0; j < 2; j++) {
        const x = der - j
        const sube = ((der + 1) & 2) === 0
        const y = sube ? l.n - 1 - v : v
        if (!l.fn[y][x] && i < datos.length * 8) {
          l.m[y][x] = bit(datos[i >>> 3], 7 - (i & 7))
          i++
        }
      }
    }
  }
}

const MASCARAS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

function aplicarMascara(l: Lienzo, k: number) {
  for (let y = 0; y < l.n; y++) {
    for (let x = 0; x < l.n; x++) if (!l.fn[y][x] && MASCARAS[k](x, y)) l.m[y][x] = !l.m[y][x]
  }
}

/** Penalización simplificada (rachas, bloques 2×2, balance). Sólo elige la máscara: cualquiera es válida. */
function penalizacion(l: Lienzo): number {
  let p = 0
  let oscuros = 0
  for (let y = 0; y < l.n; y++) {
    for (const eje of [0, 1]) {
      let racha = 1
      for (let i = 1; i < l.n; i++) {
        const a = eje ? l.m[i - 1][y] : l.m[y][i - 1]
        const b = eje ? l.m[i][y] : l.m[y][i]
        if (a === b) {
          racha++
          if (racha === 5) p += 3
          else if (racha > 5) p++
        } else racha = 1
      }
    }
    for (let x = 0; x < l.n; x++) {
      if (l.m[y][x]) oscuros++
      if (x < l.n - 1 && y < l.n - 1) {
        const c = l.m[y][x]
        if (c === l.m[y][x + 1] && c === l.m[y + 1][x] && c === l.m[y + 1][x + 1]) p += 3
      }
    }
  }
  const total = l.n * l.n
  p += (Math.ceil(Math.abs(oscuros * 20 - total * 10) / total) - 1) * 10
  return p
}

/**
 * La matriz del QR: `true` = módulo oscuro. Sin zona de silencio (la agrega quien dibuja).
 * Tira si el texto no entra en la versión 10 — una etiqueta nunca debería llegar ahí.
 */
export function matrizQR(texto: string, ecl: Correccion = 'M'): boolean[][] {
  const bytes = utf8(texto)
  let ver = 1
  for (; ver <= VERSION_MAXIMA; ver++) {
    const cc = ver <= 9 ? 8 : 16
    if (4 + cc + bytes.length * 8 <= palabrasDeDatos(ver, ecl) * 8) break
  }
  if (ver > VERSION_MAXIMA) throw new Error(`el texto no entra en un QR versión ${VERSION_MAXIMA}: ${bytes.length} bytes`)
  const cc = ver <= 9 ? 8 : 16
  const capacidad = palabrasDeDatos(ver, ecl) * 8
  const bits: number[] = []
  const poner = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1) }
  poner(0b0100, 4)
  poner(bytes.length, cc)
  for (const b of bytes) poner(b, 8)
  poner(0, Math.min(4, capacidad - bits.length))
  poner(0, (8 - (bits.length % 8)) % 8)
  for (let relleno = 0xec; bits.length < capacidad; relleno ^= 0xec ^ 0x11) poner(relleno, 8)
  const datos: number[] = []
  for (let i = 0; i < bits.length; i += 8) datos.push(parseInt(bits.slice(i, i + 8).join(''), 2))

  const l = new Lienzo(ver)
  dibujarPatrones(l, ecl)
  dibujarPalabras(l, conCorreccion(datos, ver, ecl))
  let mejor = 0
  let menor = Infinity
  for (let k = 0; k < 8; k++) {
    aplicarMascara(l, k)
    dibujarFormato(l, ecl, k)
    const p = penalizacion(l)
    if (p < menor) { menor = p; mejor = k }
    aplicarMascara(l, k)
  }
  aplicarMascara(l, mejor)
  dibujarFormato(l, ecl, mejor)
  return l.m
}

/** El trazo SVG de los módulos oscuros, en unidades de módulo, corrido `margen` módulos. */
export function trazoQR(matriz: boolean[][], margen = 0): string {
  const partes: string[] = []
  matriz.forEach((fila, y) => fila.forEach((o, x) => { if (o) partes.push(`M${x + margen} ${y + margen}h1v1h-1z`) }))
  return partes.join('')
}
