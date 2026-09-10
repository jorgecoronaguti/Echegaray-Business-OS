#!/usr/bin/env node
// EL ARCHIVO DEL FONDO DE CESE QUE EL DUEÑO SUBE AL BANCO.
//
// Lee de Drive (sólo lectura, nunca escribe) las tres fuentes que hacen falta, las cruza contra el
// padrón de Postgres, y deja en disco el archivo de pago más un resumen que dice de dónde salió
// cada número y qué quedó afuera.
//
// LAS TRES FUENTES, Y POR QUÉ SON TRES
//   1. La planilla del estudio contable — dice CUÁNTO le toca a cada trabajador y si cobra por
//      TRANSFERENCIA o en EFECTIVO. Es la única autoridad sobre el importe; acá no se recalcula.
//   2. `RESUMEN DE CUENTAS BANCARIAS.xlsx` — dice cuál es el CBU de la cuenta AFON (Fondo de Cese)
//      de cada trabajador. NO es la cuenta sueldo: son dos cuentas distintas del mismo banco y la
//      planilla trae las dos.
//   3. El último lote que el banco YA ACREDITÓ — se usa como control independiente del CBU. Un
//      dígito verificador válido no prueba que la cuenta exista: el 14/04/2026 el depósito de RETA
//      se rechazó con «CUENTA NO EXISTE» por un CBU «muy parecido pero incorrecto». Lo único que
//      prueba que una cuenta existe es que el banco ya le acreditó plata.
//
// Y el padrón (`public.personas`) es el cuarto cruce: el CUIL con el que se paga tiene que ser el
// mismo que el OS tiene registrado para esa persona.
//
// NO ESCRIBE EN DRIVE NI EN EL SHEET. Deja los archivos en disco; subirlos es del dueño.

import fs from 'node:fs'
import path from 'node:path'
import XLSX from 'xlsx'
import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import {
  PRODUCTOS, LAYOUT_PROVEEDORES, armarArchivo, validarArchivo, cbuValido, cuitValido, transliterar,
} from '../lib/santander-fur.mjs'

const CUIT_ECSAS = '30716304643'

/** Los ids de Drive van acá y no en una env: una fuente crítica que sólo se lee cuando alguien se
 *  acuerda de exportar una variable no es una fuente, es una casualidad (ver drive-indice.mjs). */
const DRIVE = {
  planilla: '16ZudpoQUTNPdfYDaEQSQgAH9epf-vCFb', // FCL 2026 - detalle por trabajador (estudio contable)
  cuentas: '1D_rdO9T4l3BGYKP_UErjtUkfk9TyrhEX',  // RESUMEN DE CUENTAS BANCARIAS.xlsx
  loteAcreditado: '1kXUg3vzrCmfO0DoJbY1-5SqnK9YB_p8o', // PAGO AFON 0607 (junio+julio 2026)
}

const HOJAS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']

function argumentos(argv) {
  const a = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    // Un flag sin valor (`--mandar`) vale `true`. Sin este caso `--mandar` al final de la línea
    // quedaba en `undefined` y el envío se saltaba en silencio.
    const sig = argv[i + 1]
    a[argv[i].slice(2)] = (sig === undefined || sig.startsWith('--')) ? true : argv[++i]
  }
  return a
}

/** Nombre comparable: sin acentos, sin comas, sin dobles espacios, en mayúsculas. */
function tokens(nombre) {
  return transliterar(String(nombre ?? '')).toUpperCase().replace(/[^A-ZÑ ]/g, ' ')
    .split(/\s+/).filter(Boolean)
}

/**
 * ¿Son la misma persona dos rótulos de nombre?
 *
 * La planilla del estudio abrevia («GONZALEZ TOBARES, EMILIAN») donde el padrón escribe entero
 * («GONZALEZ TOBARES EMILIANO»). Se emparejan los tokens uno a uno permitiendo que el más corto
 * sea PREFIJO del más largo, y se exige que sobren cero de los dos lados. Así «EMILIAN» encuentra
 * a «EMILIANO» pero nunca a «JUAN GUILLERMO».
 */
export function mismoNombre(a, b) {
  const ta = tokens(a), tb = tokens(b)
  if (ta.length !== tb.length) return false
  const libres = [...tb]
  for (const t of ta) {
    const i = libres.findIndex((u) => u.startsWith(t) || t.startsWith(u))
    if (i < 0) return false
    libres.splice(i, 1)
  }
  return true
}

/**
 * La «Orden de pago» del Pago Simple es el PERÍODO, y sin ella el débito queda ciego.
 *
 * MEDIDO EN EL EXTRACTO (`banco_movimientos`, fuente independiente del Excel): los lotes de
 * abril y mayo llevaban 42026 y 52026 en esa columna y el banco los debitó como «Acreditacion
 * fondo desempleo 042026 / 052026». El lote de junio/julio la dejó vacía y sus 35 movimientos
 * del 18/08 salieron como «Acreditacion fondo desempleo 000000»: no se puede saber a qué mes
 * corresponden mirando la cuenta.
 *
 * El formato es MAAAA — el mes SIN cero a la izquierda.
 */
export function ordenDePago(periodo) {
  return Number(`${Number(periodo.slice(4))}${periodo.slice(0, 4)}`)
}

/** Próximo día hábil ≥ la fecha dada. Sólo excluye sábado y domingo: NO hay tabla de feriados, y
 *  un feriado cae con motivo R93 — está declarado como límite en el resumen. */
export function proximoHabil(d) {
  const f = new Date(d.getTime())
  while (f.getUTCDay() === 0 || f.getUTCDay() === 6) f.setUTCDate(f.getUTCDate() + 1)
  return `${f.getUTCFullYear()}${String(f.getUTCMonth() + 1).padStart(2, '0')}${String(f.getUTCDate()).padStart(2, '0')}`
}

async function bajarLibro(g, id) {
  const b = await g.descargarBytes(id)
  // `cellStyles` hace falta para que la plantilla del banco conserve sus formatos al reescribirla.
  return XLSX.read(Buffer.isBuffer(b) ? b : Buffer.from(b.bytes || b.data || b),
    { type: 'buffer', cellStyles: true })
}

/**
 * Filas de una hoja.
 *
 * `blankrows` NO es cosmético. Con `false` el índice del array deja de ser el número de fila de la
 * hoja, y la plantilla del banco tiene cuatro filas vacías arriba: el encabezado que en el array
 * compactado está en la posición 2 vive en la fila 6. Escribir usando el índice compactado pisa el
 * encabezado y el archivo sale sin columnas. Quien va a ESCRIBIR pide `reales: true`.
 */
function filas(wb, hoja, { reales = false } = {}) {
  const ws = wb.Sheets[hoja ?? wb.SheetNames[0]]
  if (!ws) throw new Error(`la hoja «${hoja}» no existe (hay: ${wb.SheetNames.join(', ')})`)
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: reales })
    .map((r) => r ?? [])
}

/** La planilla del estudio: nombre · remuneración · FCL · % · forma de pago. La fila final es el
 *  total (primera celda numérica) y se descarta. */
function leerPlanilla(wb, hoja) {
  const out = []
  for (const r of filas(wb, hoja).slice(1)) {
    const [nombre, remun, fcl, , forma] = r
    if (typeof nombre !== 'string' || !nombre.trim()) continue
    if (!Number.isFinite(fcl)) continue
    out.push({
      nombre: nombre.trim(),
      remuneracion: remun,
      importe: Number(fcl.toFixed(2)),
      forma: String(forma ?? '').trim().toUpperCase() || 'SIN DECLARAR',
    })
  }
  return out
}

/** El resumen de cuentas: legajo · estado · obrero · cuit · cuenta sueldo · CBU · cuenta AFON · CBU AFON */
function leerCuentas(wb) {
  const out = []
  for (const r of filas(wb).slice(1)) {
    const [legajo, estado, nombre, cuit, , cbuSueldo, , cbuAfon] = r
    if (typeof nombre !== 'string' || !nombre.trim()) continue
    out.push({
      legajo, estado, nombre: nombre.trim(),
      cuil: String(cuit ?? '').replace(/\D/g, ''),
      cbuSueldo: String(cbuSueldo ?? '').replace(/\D/g, ''),
      cbuAfon: String(cbuAfon ?? '').replace(/\D/g, ''),
    })
  }
  return out
}

/** El lote «Pago Simple» que el banco ya procesó. Se leen las columnas por RÓTULO y no por letra:
 *  la plantilla del banco cambió de versión entre marzo y junio (agregó «Tipo de documento») y una
 *  letra fija habría leído el CUIL donde ahora está la fecha. */
function leerLoteAcreditado(wb) {
  const f = filas(wb, 'Pagos', { reales: true })
  const iEnc = f.findIndex((r) => r.some((c) => typeof c === 'string' && /forma de pago/i.test(c)))
  if (iEnc < 0) throw new Error('el lote acreditado no tiene fila de encabezados')
  const enc = f[iEnc].map((c) => String(c ?? '').toLowerCase())
  const col = (re) => enc.findIndex((c) => re.test(c))
  const cDoc = col(/cuit *\/ *cuil/), cInstr = col(/instrumento/), cImp = col(/importe/)
  const out = new Map()
  for (const r of f.slice(iEnc + 1)) {
    const cuil = String(r[cDoc] ?? '').replace(/\D/g, '')
    const cbu = String(r[cInstr] ?? '').replace(/\D/g, '')
    if (cuil.length === 11 && cbu.length === 22) out.set(cuil, { cbu, importe: r[cImp] })
  }
  return out
}

/** Cruza una fila de la planilla contra cuentas, lote acreditado y padrón. Devuelve el pago listo
 *  o el motivo por el que NO puede entrar al archivo. Nunca completa un dato faltante. */
function resolver(fila, { cuentas, lote, padron }) {
  const base = { ...fila }
  if (fila.forma !== 'TRANSFERENCIA') return { ...base, fuera: `el estudio lo liquida en ${fila.forma}` }

  const cands = cuentas.filter((c) => mismoNombre(fila.nombre, c.nombre))
  if (cands.length === 0) return { ...base, fuera: 'no está en RESUMEN DE CUENTAS BANCARIAS' }
  if (cands.length > 1) return { ...base, fuera: `el nombre resuelve a ${cands.length} filas de cuentas` }
  const cta = cands[0]

  if (!cuitValido(cta.cuil)) return { ...base, fuera: `CUIL «${cta.cuil}» con dígito verificador inválido` }
  if (!cta.cbuAfon) return { ...base, fuera: 'no tiene cuenta AFON abierta' }
  if (!cbuValido(cta.cbuAfon)) return { ...base, fuera: `CBU AFON «${cta.cbuAfon}» con dígito verificador inválido` }
  if (cta.cbuAfon === cta.cbuSueldo) return { ...base, fuera: 'el CBU AFON es igual al de la cuenta sueldo' }

  const yaAcreditado = lote.get(cta.cuil)
  if (!yaAcreditado) return { ...base, fuera: 'el banco nunca acreditó en esta cuenta (sin lote previo)' }
  if (yaAcreditado.cbu !== cta.cbuAfon) {
    return { ...base, fuera: `el CBU no coincide con el del último lote acreditado (…${yaAcreditado.cbu.slice(-6)})` }
  }

  const p = padron.find((x) => x.cuil === cta.cuil)
  if (!p) return { ...base, fuera: `el CUIL ${cta.cuil} no está en el padrón del OS` }
  if (!mismoNombre(p.nombre, cta.nombre)) {
    return { ...base, fuera: `el padrón llama «${p.nombre}» a ese CUIL y las cuentas «${cta.nombre}»` }
  }

  return { ...base, cuil: cta.cuil, cbu: cta.cbuAfon, legajo: cta.legajo, nombrePadron: p.nombre }
}

function enmascarar(cbu) { return `${'•'.repeat(18)}${cbu.slice(-4)}` }
const pesos = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** El .xlsx «Pago Simple»: se construye SOBRE la plantilla del último lote acreditado, no de cero.
 *  Las columnas se ubican por rótulo, por el mismo motivo que en `leerLoteAcreditado`. */
function serialExcel(aaaammdd) {
  const d = Date.UTC(Number(aaaammdd.slice(0, 4)), Number(aaaammdd.slice(4, 6)) - 1, Number(aaaammdd.slice(6)))
  return Math.round((d - Date.UTC(1899, 11, 30)) / 86400000)
}

function armarPagoSimple(wbPlantilla, pagos, fechaPago, periodo) {
  const wb = wbPlantilla
  const ws = wb.Sheets.Pagos
  const f = filas(wb, 'Pagos', { reales: true })
  const iEnc = f.findIndex((r) => r.some((c) => typeof c === 'string' && /forma de pago/i.test(c)))
  if (iEnc < 0) throw new Error('la plantilla de Pago Simple no tiene fila de encabezados')
  const enc = f[iEnc].map((c) => String(c ?? '').toLowerCase())
  const idx = {
    forma: 0,
    orden: enc.findIndex((c) => /orden de pago/.test(c)),
    razon: enc.findIndex((c) => /raz[oó]n social/.test(c)),
    tipoDoc: enc.findIndex((c) => /tipo de documento/.test(c)),
    doc: enc.findIndex((c) => /cuit *\/ *cuil/.test(c)),
    fecha: enc.findIndex((c) => /fecha de pago/.test(c)),
    importe: enc.findIndex((c) => /^importe/.test(c)),
    instr: enc.findIndex((c) => /instrumento/.test(c)),
  }
  for (const [k, v] of Object.entries(idx)) {
    if (v < 0) throw new Error(`la plantilla de Pago Simple no tiene la columna «${k}»`)
  }
  const rango = XLSX.utils.decode_range(ws['!ref'])
  // La primera fila de datos de la plantilla es el MODELO de formato. Se guarda antes de borrarla:
  // el archivo que el banco aceptó traía la fecha como fecha de Excel y el CBU como texto, y
  // reescribir las celdas sin su formato cambia lo que el parser del banco lee.
  const modelo = {}
  for (let c = 0; c <= rango.e.c; c++) modelo[c] = ws[XLSX.utils.encode_cell({ r: iEnc + 1, c })]
  for (let r = iEnc + 1; r <= rango.e.r; r++) {
    for (let c = 0; c <= rango.e.c; c++) delete ws[XLSX.utils.encode_cell({ r, c })]
  }
  pagos.forEach((p, i) => {
    const r = iEnc + 1 + i
    const put = (c, v, t, z) => {
      if (c < 0) return
      const m = modelo[c]
      const fmt = z || m?.z
      ws[XLSX.utils.encode_cell({ r, c })] = { t, v, ...(fmt ? { z: fmt } : {}), ...(m?.s ? { s: m.s } : {}) }
    }
    put(idx.forma, 'T', 's')
    put(idx.orden, ordenDePago(periodo), 'n')
    put(idx.razon, transliterar(p.nombre).toUpperCase(), 's')
    put(idx.tipoDoc, 'CUIL', 's')
    put(idx.doc, Number(p.cuil), 'n')
    // Fecha e importe se escriben con el MISMO formato que traía el lote que el banco aceptó
    // (fecha real de Excel y dos decimales), no como número pelado ni como texto.
    put(idx.fecha, serialExcel(fechaPago), 'n', 'dd/mm/yyyy')
    put(idx.importe, Number(p.importe.toFixed(2)), 'n', '0.00')
    put(idx.instr, p.cbu, 's')                   // 22 dígitos como TEXTO: como número pierde los ceros
  })
  rango.e.r = iEnc + pagos.length
  ws['!ref'] = XLSX.utils.encode_range(rango)
  return wb
}

/** El mensaje del bot: corto, con lo que hay que decidir arriba y el detalle en el .md adjunto. */
function mensajeBot({ periodo, fechaPago, entran, afuera, faltaAcuerdo }) {
  const total = entran.reduce((a, p) => a + p.importe, 0)
  const fuera = afuera.reduce((a, p) => a + p.importe, 0)
  const dm = `${fechaPago.slice(6)}/${fechaPago.slice(4, 6)}/${fechaPago.slice(0, 4)}`
  const l = [
    `**Fondo de Cese ${periodo.slice(4)}/${periodo.slice(0, 4)} — archivo para subir al Online Banking**`,
    '',
    `**\`FCL_${periodo}_pago_simple_santander.xlsx\`** — es el que subís. Formato «Pago Simple»,`
    + ' el mismo de los envíos de AFON anteriores.',
    `· **${entran.length} trabajadores · $ ${pesos(total)} · fecha de pago ${dm}**`,
    `· Quedan afuera **$ ${pesos(fuera)}** (${afuera.length} personas que el estudio liquida en`
    + ' EFECTIVO) — eso el archivo no lo paga.',
    '',
    '**Supuestos y avisos**',
    `· Forma de pago **T (transferencia)** a la cuenta **AFON** de cada uno, no a la cuenta sueldo.`,
    `· La **fecha de pago va adentro del archivo**. Si lo subís otro día, decime y lo regenero.`,
    `· Le puse **${ordenDePago(periodo)}** en «Orden de pago» (el período). En junio/julio ese campo`
    + ' fue vacío y los 35 débitos del 18/08 salieron en el extracto como «fondo desempleo 000000»,'
    + ' sin mes. Con esto el débito se va a poder conciliar solo.',
    `· Verifiqué cada CBU contra el lote de junio/julio que el banco ya acreditó: los ${entran.length}`
    + ' coinciden dígito por dígito. El CUIL, contra el padrón del OS.',
  ]
  if (faltaAcuerdo) {
    l.push('', '**El .txt del FUR que me pediste NO se puede subir.** El diseño de registro exige'
      + ' un **Número de Acuerdo** que Santander tiene que asignarle a Echegaray, y no existe en'
      + ' ningún papel ni mail: el convenio que Bazán te cargó en abril es el de **depósitos AFON'
      + ' por Pago Simple**, no un servicio FUR. Va adjunto igual, con `??` en esas posiciones y'
      + ' marcado PENDIENTE-ACUERDO, para que lo veas. Si querés el FUR, hay que pedirle al banco'
      + ' el número de acuerdo del producto **012 Pagos Personalizados** — que es como el extracto'
      + ' identifica estos débitos, no como haberes.')
  }
  l.push('', '`FCL_' + periodo + '_resumen.md`: la tabla completa con CUIL, CBU y de qué archivo'
    + ' salió cada dato.')
  return l.join('\n')
}

async function mandarAlChat({ periodo, fechaPago, entran, afuera, faltaAcuerdo, adjuntos, destino }) {
  const { MattermostCliente } = await import('../../../communication-service/src/channels/mattermost/mattermost-cliente.mjs')
  const mm = new MattermostCliente({ baseUrl: process.env.MM_BASE_URL, token: process.env.MM_BOT_TOKEN })
  const yo = await mm._req('GET', '/users/me')
  const dest = await mm._req('GET', `/users/username/${encodeURIComponent(destino)}`)
  const canal = await mm._req('POST', '/channels/direct', [yo.id, dest.id])
  const fileIds = []
  for (const ruta of adjuntos) {
    const info = await mm.subirArchivo({
      channel_id: canal.id, nombre: path.basename(ruta), datos: fs.readFileSync(ruta),
      mime: ruta.endsWith('.xlsx')
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/plain',
    })
    fileIds.push(info.id)
  }
  const post = await mm.crearPost({
    channel_id: canal.id,
    message: mensajeBot({ periodo, fechaPago, entran, afuera, faltaAcuerdo }),
    file_ids: fileIds,
  })
  // LA EVIDENCIA ES DEL EFECTO: se relee el post del servidor, no se confía en la respuesta del POST.
  const publicado = await mm._req('GET', `/posts/${post.id}`)
  return { postId: publicado.id, adjuntos: (publicado.file_ids ?? []).length, canal: canal.id }
}

function resumen({ periodo, fechaPago, entran, afuera, val, rutaTxt, rutaXlsx, faltaAcuerdo }) {
  const total = entran.reduce((a, p) => a + p.importe, 0)
  const l = []
  if (faltaAcuerdo) {
    l.push('> **EL .txt NO SE PUEDE SUBIR.** Santander no le asignó a Echegaray un Número de Acuerdo'
      + ' de FUR para el Fondo de Cese, y esas 5 posiciones del header (producto + acuerdo) no se'
      + ' inventan. El archivo que SÍ se puede subir hoy es el `.xlsx` de Pago Simple.\n')
  }
  l.push(`# Fondo de Cese ${periodo} — archivo para Santander\n`)
  l.push(`- **Archivo a subir**: \`${path.basename(rutaXlsx)}\` (Pago Simple, Online Banking Empresas)`)
  l.push(`- **Archivo FUR (no subible)**: \`${path.basename(rutaTxt)}\``)
  l.push(`- **Fecha de pago**: ${fechaPago.slice(6)}/${fechaPago.slice(4, 6)}/${fechaPago.slice(0, 4)}`)
  l.push(`- **Orden de pago (= período)**: \`${ordenDePago(periodo)}\` — el débito va a aparecer en`
    + ' el extracto como «Acreditacion fondo desempleo ' + String(ordenDePago(periodo)).padStart(6, '0')
    + '». El lote de junio/julio salió sin este dato y quedó como «000000».')
  l.push(`- **Trabajadores**: ${entran.length} · **Total**: $ ${pesos(total)}`)
  l.push(`- **Validación del .txt**: ${val.ok ? 'OK' : `${val.errores.length} error(es)`}`)
  if (!val.ok) for (const e of val.errores) l.push(`  - ${e}`)
  l.push('\n## Los que entran al archivo\n')
  l.push('| # | Trabajador | Legajo | CUIL | CBU AFON | Importe | Forma |')
  l.push('|---|---|---|---|---|---|---|')
  entran.forEach((p, i) => l.push(`| ${i + 1} | ${p.nombre} | ${p.legajo ?? '—'} | ${p.cuil}`
    + ` | ${enmascarar(p.cbu)} | $ ${pesos(p.importe)} | transferencia |`))
  l.push(`| | **TOTAL** | | | | **$ ${pesos(total)}** | |`)
  l.push('\n## Lo que NO entra al archivo\n')
  if (afuera.length === 0) l.push('_Nada._')
  else {
    l.push('| Trabajador | Importe | Por qué |')
    l.push('|---|---|---|')
    for (const p of afuera) l.push(`| ${p.nombre} | $ ${pesos(p.importe)} | ${p.fuera} |`)
    l.push(`\n**Suma fuera del archivo: $ ${pesos(afuera.reduce((a, p) => a + p.importe, 0))}** —`
      + ' se paga por otra vía; el archivo no la cubre.')
  }
  l.push('\n## De dónde salió cada dato\n')
  l.push(`- Importes y forma de pago: planilla del estudio contable, Drive \`${DRIVE.planilla}\`, hoja del período.`)
  l.push(`- CUIL y CBU de la cuenta AFON: \`RESUMEN DE CUENTAS BANCARIAS.xlsx\`, Drive \`${DRIVE.cuentas}\`.`)
  l.push(`- Control independiente del CBU: último lote acreditado por el banco, Drive \`${DRIVE.loteAcreditado}\`.`)
  l.push('- CUIL contra el padrón del OS: `public.personas`.')
  l.push('\n## Supuestos y límites\n')
  l.push('- La fecha de pago excluye sábados y domingos, **no feriados** (el OS no tiene calendario'
    + ' de feriados). Un feriado se rechaza con motivo R93.')
  l.push('- El total y la cantidad los declara la empresa: el banco no los suma, los compara'
    + ' (una diferencia rechaza el lote entero, motivo R37).')
  return l.join('\n') + '\n'
}

async function main() {
  const a = argumentos(process.argv.slice(2))
  const periodo = String(a.periodo ?? '').replace('-', '')
  if (!/^\d{6}$/.test(periodo)) throw new Error('usá --periodo AAAA-MM (ej: 2026-08)')
  const hoja = HOJAS[Number(periodo.slice(4)) - 1]
  const fechaPago = a['fecha-pago'] ? String(a['fecha-pago']) : proximoHabil(new Date())
  if (!/^\d{8}$/.test(fechaPago)) throw new Error('--fecha-pago va como AAAAMMDD')
  const salida = String(a.salida ?? '/tmp/claude-1001/fcl')
  fs.mkdirSync(salida, { recursive: true })

  const g = makeGoogleClient({ config: loadConfig() })
  const [wbPlanilla, wbCuentas, wbLote] = await Promise.all([
    bajarLibro(g, DRIVE.planilla), bajarLibro(g, DRIVE.cuentas), bajarLibro(g, DRIVE.loteAcreditado),
  ])
  const padron = (await query('select nombre_completo, cuil from public.personas where cuil is not null')).rows
    .map((r) => ({ nombre: r.nombre_completo, cuil: String(r.cuil).replace(/\D/g, '') }))

  const ctx = { cuentas: leerCuentas(wbCuentas), lote: leerLoteAcreditado(wbLote), padron }
  const resueltos = leerPlanilla(wbPlanilla, hoja).map((f) => resolver(f, ctx))
  const entran = resueltos.filter((p) => !p.fuera)
  const afuera = resueltos.filter((p) => p.fuera)
  if (entran.length === 0) throw new Error('ningún trabajador quedó en condiciones de entrar al archivo')

  // El FUR sale con el acuerdo sin resolver a propósito: el archivo se puede leer y auditar, y
  // `validarArchivo` prueba solo que no se puede subir.
  const faltaAcuerdo = !a.acuerdo
  //
  // EL PRODUCTO NO ES «HABERES»: el extracto dice «Pagos personalizados acred cuenta». El FUR
  // equivalente es 012 (Pagos Personalizados) con el layout de proveedores, no 011 con el de
  // haberes. Lo decide la evidencia del banco, no el hecho de que el pago sea de personal.
  const txt = armarArchivo({
    cuit: CUIT_ECSAS, producto: PRODUCTOS.PERSONALIZADOS, acuerdo: a.acuerdo || '??',
    layout: LAYOUT_PROVEEDORES, concepto: 'FCL',
    pagos: entran.map((p) => ({
      beneficiario: String(p.legajo ?? p.cuil), nombre: p.nombre, cuit: p.cuil, cbu: p.cbu,
      importe: p.importe, comprobante: String(ordenDePago(periodo)), tipoComprobante: 'OP',
      liquidacion: ordenDePago(periodo), fechaPago,
    })),
  })
  const val = validarArchivo(txt)
  const rutaTxt = path.join(salida, faltaAcuerdo
    ? `FCL_${periodo}_santander.PENDIENTE-ACUERDO.txt` : `FCL_${periodo}_santander.txt`)
  fs.writeFileSync(rutaTxt, Buffer.from(txt, 'latin1'))

  const rutaXlsx = path.join(salida, `FCL_${periodo}_pago_simple_santander.xlsx`)
  XLSX.writeFile(armarPagoSimple(wbLote, entran, fechaPago, periodo), rutaXlsx)

  const rutaMd = path.join(salida, `FCL_${periodo}_resumen.md`)
  fs.writeFileSync(rutaMd, resumen({ periodo, fechaPago, entran, afuera, val, rutaTxt, rutaXlsx, faltaAcuerdo }))

  console.log(`entran ${entran.length} · afuera ${afuera.length} · total $ ${pesos(entran.reduce((s, p) => s + p.importe, 0))}`)
  console.log(`txt   ${rutaTxt}  (validación: ${val.ok ? 'OK' : val.errores.join(' ; ')})`)
  console.log(`xlsx  ${rutaXlsx}`)
  console.log(`resumen ${rutaMd}`)

  if (!a.mandar) { console.log('(sin --mandar: no se publicó nada en el chat)'); return }
  const r = await mandarAlChat({
    periodo, fechaPago, entran, afuera, faltaAcuerdo, destino: String(a.destino ?? 'jorge'),
    adjuntos: [rutaXlsx, rutaTxt, rutaMd],
  })
  console.log(`publicado en el privado con @${a.destino ?? 'jorge'} · post ${r.postId}`
    + ` · ${r.adjuntos} adjunto(s) · canal ${r.canal}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
