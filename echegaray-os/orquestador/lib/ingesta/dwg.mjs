// EL DWG SE ABRE SOLO. Nadie exporta nada a mano.
//
// ═══ CÓMO SE DESTRABÓ, Y CONTRA QUÉ SE PROBÓ ═══
//
// El `.dwg` es binario, cerrado y de Autodesk: no se parsea, se convierte. En esta VM no hay sudo,
// así que `apt install libredwg-tools` estaba descartado — pero eso NO era una barrera, era un
// camino más largo. LibreDWG 0.14 se compiló desde el tarball oficial a `~/.local` con el gcc y el
// make que la máquina ya tenía (`./configure --prefix=$HOME/.local --disable-bindings`), y quedó
// `~/.local/bin/dwg2dxf`. Es infraestructura de la VM, no del worktree.
//
// PROBADO CONTRA LOS DOS DWG REALES DE QUATTROPANI, que son de versiones distintas a propósito:
//   · `01-ESTRUCTURA Galpon FRANCO_.dwg` — AC1032 (AutoCAD 2018), 16,75 MB → 75.854 entidades,
//     66 capas medidas, 966 cotas con medida, unidad `m` declarada;
//   · `Galpon_2.dwg` — AC1027 (AutoCAD 2013), 1,66 MB → 6.172 entidades, 23 capas, 130 cotas.
// Las primeras cotas que devuelve el CAD —6,08 · 6,00 · 1,92— son EXACTAMENTE las que el modelo
// había leído mirando el PDF del mismo galpón. El CAD confirma la lectura de visión, y esa
// coincidencia es la prueba de que la conversión no devolvió ruido con forma de plano.
//
// Los 121 errores que reporta el conversor sobre el AC1032 son todos el mismo —
// `Invalid ATTRIB.keep_duplicate_records`, un metadato de atributos de bloque— y no tocan geometría.
//
// ═══ POR QUÉ NO SE RESUELVE MANDÁNDOLO A UN SERVICIO WEB ═══
//
// Existen conversores en la nube. Subir el plano de un cliente a un servicio de terceros es una
// decisión con efecto contractual y de confidencialidad, no una decisión técnica, y no la toma este
// archivo. Queda anotada como alternativa y con dueño, y ya no hace falta.

import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ejecutar = promisify(execFile)

/** Dónde quedó el conversor compilado. Se busca acá ANTES que en el PATH porque el PATH de un
 *  servicio systemd no es el de una terminal interactiva, y el pipeline corre en los dos lados. */
export const BIN_LOCAL = path.join(process.env.HOME || '/home/jorge', '.local', 'bin')

/** Dónde quedan los DXF convertidos. Fuera del repo: es caché, no fuente. La llave es el hash del
 *  DWG, así que un plano revisado se reconvierte solo y uno que no cambió no se vuelve a pagar —
 *  y convertir el AC1032 de 16,75 MB cuesta ~25 s, que no se pagan dos veces. */
export const DIR_CACHE = process.env.ORQ_DWG_CACHE || path.join(process.env.HOME || '/tmp', '.cache', 'echegaray-dwg')

/** Los conversores que este módulo sabe manejar, en orden de preferencia. `dwg2dxf` primero porque
 *  es libre, local y no pide licencia; el de ODA es el más fiel pero es propietario. */
export const CONVERSORES = Object.freeze([
  { comando: 'dwg2dxf', paquete: 'libredwg (apt: libredwg-tools)', libre: true, argumentos: (entrada, salida) => ['-o', salida, entrada] },
  { comando: 'dwgread', paquete: 'libredwg (apt: libredwg-tools)', libre: true, argumentos: (entrada, salida) => ['-O', 'DXF', '-o', salida, entrada] },
  { comando: 'ODAFileConverter', paquete: 'ODA File Converter (descarga manual, propietario)', libre: false, argumentos: null },
])

/** ¿Está este comando disponible? Primero en `~/.local/bin`, después en el PATH. Devuelve la ruta
 *  o null. No lanza: la ausencia es un dato, no un error. */
export async function existeComando(comando) {
  const local = path.join(BIN_LOCAL, comando)
  try { if (fs.existsSync(local) && fs.statSync(local).mode & 0o111) return local } catch { /* seguimos por PATH */ }
  try {
    const { stdout } = await ejecutar('which', [comando])
    const ruta = String(stdout).trim()
    return ruta || null
  } catch { return null }
}

/** La versión del DWG, leída de sus seis primeros bytes. Sirve para decir POR QUÉ falló una
 *  conversión sin adivinar, y para no intentar con un formato que el conversor no soporta. PURA. */
export const VERSIONES_DWG = Object.freeze({
  AC1009: 'R11/R12', AC1012: 'R13', AC1014: 'R14', AC1015: 'AutoCAD 2000', AC1018: 'AutoCAD 2004',
  AC1021: 'AutoCAD 2007', AC1024: 'AutoCAD 2010', AC1027: 'AutoCAD 2013', AC1032: 'AutoCAD 2018',
})
export function versionDeDwg(bytes) {
  const firma = Buffer.isBuffer(bytes) ? bytes.subarray(0, 6).toString('ascii') : String(bytes ?? '').slice(0, 6)
  return { firma, version: VERSIONES_DWG[firma] ?? null, conocida: firma in VERSIONES_DWG }
}

/** Qué conversores hay disponibles en esta máquina, ahora. */
export async function conversoresDisponibles() {
  const salida = []
  for (const c of CONVERSORES) {
    const ruta = await existeComando(c.comando)
    if (ruta) salida.push({ ...c, ruta })
  }
  return salida
}

/**
 * CONVERTIR UN DWG A DXF. Automático cuando se puede; declarado cuando no.
 *
 * Devuelve `{ ok: true, dxf, conversor }` o `{ ok: false, porQue, comoSeResuelve, alternativas }`.
 * Nunca lanza y nunca devuelve un DXF vacío haciéndolo pasar por una conversión exitosa: un archivo
 * de cero bytes leído como plano da un cómputo de cero, y un cómputo de cero no se distingue de un
 * galpón que no existe.
 */
export async function convertirADxf(rutaDwg, { directorio = null } = {}) {
  const disponibles = await conversoresDisponibles()
  if (!disponibles.length) {
    return {
      ok: false,
      archivo: path.basename(String(rutaDwg ?? '')),
      porQue: 'el .dwg es binario y cerrado, y en esta máquina no hay ningún conversor instalado',
      comoSeResuelve: 'instalar `libredwg-tools` (libre, local, sin licencia) — a partir de ahí la conversión es automática y nadie exporta nada a mano',
      alternativas: [
        { que: 'pedirle al cliente el DXF además del DWG', costo: 'cero, y suele estar', quienDecide: 'quien habla con el cliente' },
        { que: 'usar un conversor en la nube', costo: 'sube el plano del cliente a un tercero', quienDecide: 'el dueño — es confidencialidad, no una decisión técnica' },
        { que: 'leer el PDF del mismo plano si existe', costo: 'se pierde la geometría exacta y hay que mirarlo con visión', quienDecide: 'automático: el circuito ya lo hace' },
      ],
      estado: 'REQUIERE_CONVERSION',
    }
  }
  const conversor = disponibles.find((c) => c.argumentos) ?? disponibles[0]
  if (!conversor.argumentos) {
    return { ok: false, archivo: path.basename(String(rutaDwg ?? '')), porQue: `${conversor.comando} está instalado pero este módulo no sabe invocarlo todavía`, comoSeResuelve: 'agregar sus argumentos en CONVERSORES', estado: 'REQUIERE_CONVERSION' }
  }
  const destino = path.join(directorio ?? fs.mkdtempSync(path.join(os.tmpdir(), 'xsas-dwg-')), `${path.basename(String(rutaDwg), path.extname(String(rutaDwg)))}.dxf`)
  const corrida = await correrConversor(conversor, rutaDwg, destino)
  if (!corrida.ok) {
    return { ok: false, archivo: path.basename(String(rutaDwg ?? '')), porQue: `${conversor.comando} falló: ${corrida.porQue}`, comoSeResuelve: 'revisar la versión del DWG — LibreDWG no soporta todas', estado: 'NO_LEGIBLE', erroresConversor: corrida.errores, ultimasLineas: corrida.cola }
  }
  const tamano = fs.existsSync(destino) ? fs.statSync(destino).size : 0
  if (tamano < 64) {
    return { ok: false, archivo: path.basename(String(rutaDwg ?? '')), porQue: `la conversión terminó sin error pero produjo un DXF de ${tamano} bytes: eso no es un plano`, comoSeResuelve: 'probar otro conversor o pedir el DXF al cliente', estado: 'NO_LEGIBLE' }
  }
  return { ok: true, dxf: destino, bytes: tamano, conversor: conversor.comando, erroresConversor: corrida.errores, estado: 'LEIDO' }
}

/**
 * CORRER EL CONVERSOR SIN QUE SU PROPIO RUIDO LO MATE.
 *
 * MEDIDO Y POR ESO ESTÁ ESCRITO ACÁ: con `execFile`, convertir el AC1032 de Quattropani devolvía
 * «stderr maxBuffer length exceeded» y el plano quedaba declarado ilegible. No fallaba la
 * conversión: fallaba el BUFFER, porque `dwg2dxf` emite 163.851 líneas de advertencias sobre
 * clases inestables para ese archivo. Un plano de 75.854 entidades se perdía por el log.
 *
 * Con `spawn` el stderr se consume a medida que llega, se cuentan los ERROR reales y se conserva
 * sólo la cola. El conversor puede hablar todo lo que quiera.
 */
export function correrConversor(conversor, entrada, salida, { timeoutMs = 600_000, maxCola = 4000 } = {}) {
  return new Promise((resolver) => {
    // LA RUTA ES LA QUE `existeComando` YA RESOLVIÓ, no una armada de nuevo. Armarla con
    // `path.join(BIN_LOCAL, …)` ignoraba el hallazgo: con el conversor instalado en el PATH y NO en
    // `~/.local/bin` —que es exactamente el resultado de seguir el `comoSeResuelve` que este mismo
    // archivo recomienda— TODOS los DWG salían ilegibles, y el mensaje mandaba a mirar el archivo
    // del cliente en vez de la instalación.
    const ejecutable = conversor.ruta ?? conversor.comando
    const hijo = spawn(ejecutable, conversor.argumentos(entrada, salida), { stdio: ['ignore', 'ignore', 'pipe'] })
    let errores = 0
    let cola = ''
    let resto = ''
    const reloj = setTimeout(() => { try { hijo.kill('SIGKILL') } catch { /* ya murió */ } }, timeoutMs)
    hijo.stderr.on('data', (b) => {
      const texto = resto + b.toString('utf8')
      const lineas = texto.split('\n')
      resto = lineas.pop() ?? ''
      for (const l of lineas) if (l.startsWith('ERROR')) errores++
      cola = (cola + lineas.slice(-8).join('\n') + '\n').slice(-maxCola)
    })
    hijo.on('error', (e) => { clearTimeout(reloj); resolver({ ok: false, porQue: String(e?.message ?? e).slice(0, 200), errores, cola }) })
    hijo.on('close', (codigo, senal) => {
      clearTimeout(reloj)
      if (senal) return resolver({ ok: false, porQue: `terminó por ${senal} (probable timeout de ${timeoutMs} ms)`, errores, cola })
      if (codigo !== 0) return resolver({ ok: false, porQue: `salió con código ${codigo}`, errores, cola })
      resolver({ ok: true, errores, cola })
    })
  })
}

/**
 * ABRIR UN DWG DESDE SUS BYTES Y DEVOLVER LA MEDICIÓN. Es la puerta que usa el pipeline.
 *
 * Cachea el DXF por hash del DWG: la conversión del AC1032 de 16,75 MB tarda ~25 s y produce 119 MB
 * de texto, y eso no se paga dos veces por el mismo contenido. El caché guarda el DXF y no la
 * medición porque la medición la puede cambiar una mejora del parser; el DXF, no.
 *
 * Devuelve `{ ok, medicion, dxf, version, deCache }` o `{ ok:false, ... }` con el motivo y el
 * archivo. NUNCA devuelve una medición vacía haciéndola pasar por un plano sin elementos.
 */
export async function abrirDwg(bytes, { nombre = 'plano.dwg', dirCache = DIR_CACHE, medir = null } = {}) {
  const v = versionDeDwg(bytes)
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32)
  const destino = path.join(dirCache, `${hash}.dxf`)
  let deCache = false
  if (fs.existsSync(destino) && fs.statSync(destino).size > 64) deCache = true
  else {
    fs.mkdirSync(dirCache, { recursive: true })
    const tmp = path.join(dirCache, `${hash}.dwg`)
    fs.writeFileSync(tmp, bytes)
    const r = await convertirADxf(tmp, { directorio: dirCache })
    try { fs.unlinkSync(tmp) } catch { /* el temporal no decide nada */ }
    if (!r.ok) return { ok: false, archivo: nombre, version: v, ...r }
    if (r.dxf !== destino) { try { fs.renameSync(r.dxf, destino) } catch { return { ok: false, archivo: nombre, version: v, porQue: 'la conversión salió pero no se pudo guardar en el caché', estado: 'NO_LEGIBLE' } } }
  }
  const { textoDeDxf, medirDxf } = await import('./dxf.mjs')
  const { texto, codificacion } = textoDeDxf(fs.readFileSync(destino))
  const medicion = (medir ?? medirDxf)(texto)
  return { ok: true, archivo: nombre, version: v, dxf: destino, bytesDxf: fs.statSync(destino).size, codificacion, deCache, medicion, estado: 'LEIDO' }
}
