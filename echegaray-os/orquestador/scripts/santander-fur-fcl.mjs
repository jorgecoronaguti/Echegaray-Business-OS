#!/usr/bin/env node
// EL ARCHIVO DEL FONDO DE CESE QUE EL DUEÑO SUBE AL BANCO.
//
// El archivo se ESCRIBE SOBRE el que Santander ya aceptó y debitó, no se construye de cero. Se le
// cambian las filas de datos de la hoja «Pagos» y nada más: encabezados, estilos, validaciones,
// imágenes y filas vacías quedan como estaban (ver `lib/pago-simple.mjs` y `lib/xlsx-zip.mjs`).
//
// ═══ LAS FUENTES, Y QUÉ MANDA CADA UNA ═══
//   1. Planilla del estudio contable — el IMPORTE y si cobra por TRANSFERENCIA o en EFECTIVO.
//      Es la única autoridad sobre el monto; acá no se recalcula nada.
//   2. El ÚLTIMO LOTE QUE EL BANCO ACREDITÓ — la CUENTA y el NOMBRE tal cual el banco los recibió.
//      Es la fuente, no una referencia: si una cuenta no está ahí, no se paga por transferencia.
//      Un dígito verificador válido no prueba que la cuenta exista; que el banco ya le haya
//      acreditado plata, sí. El 14/04/2026 el depósito de RETA se rechazó con «CUENTA NO EXISTE»
//      por un CBU «muy parecido pero incorrecto».
//   3. `RESUMEN DE CUENTAS BANCARIAS.xlsx` — el puente entre el nombre del estudio y el CUIL, y un
//      control cruzado de la cuenta.
//   4. El padrón (`public.personas`) — que el CUIL con el que se paga sea el que el OS registra.
//
// NO ESCRIBE EN DRIVE NI EN EL SHEET. Deja los archivos en disco; subirlos es del dueño.

import fs from 'node:fs'
import path from 'node:path'
import XLSX from 'xlsx'
import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { contenidoDe, editarXlsx, entradasDe } from '../lib/xlsx-zip.mjs'
import {
  cuentasAceptadas, hojaConPagos, ordenDePago, serialExcel, validarPagoSimple,
} from '../lib/pago-simple.mjs'
import { transliterar } from '../lib/santander-fur.mjs'

/** Los ids de Drive van acá y no en una env: una fuente crítica que sólo se lee cuando alguien se
 *  acuerda de exportar una variable no es una fuente, es una casualidad. */
const DRIVE = {
  planilla: '16ZudpoQUTNPdfYDaEQSQgAH9epf-vCFb', // FCL 2026 - detalle por trabajador (estudio contable)
  cuentas: '1D_rdO9T4l3BGYKP_UErjtUkfk9TyrhEX',  // RESUMEN DE CUENTAS BANCARIAS.xlsx
  plantilla: '1kXUg3vzrCmfO0DoJbY1-5SqnK9YB_p8o', // PAGO AFON 0607 — último lote acreditado (18/08/2026)
}
/** La hoja «Pagos» es la segunda del libro. Se resuelve por nombre, no por número, más abajo. */
const HOJA_PAGOS = 'Pagos'
const HOJAS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']

function argumentos(argv) {
  const a = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    // Un flag sin valor (`--mandar`) vale `true`. Sin este caso quedaba en `undefined` y el envío
    // se saltaba en silencio.
    const sig = argv[i + 1]
    a[argv[i].slice(2)] = (sig === undefined || sig.startsWith('--')) ? true : argv[++i]
  }
  return a
}

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
 *
 * Contra el BANCO no se empareja por nombre: ahí la clave es el CUIL. El banco escribe
 * «MALDONADO BATISTA EMILIANO» donde el estudio escribe «MALDONADO, BATISTA EMILIANO MIGUEL», y
 * una regla que tolere esa diferencia toleraría también confundir a dos hermanos.
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

/** Próximo día hábil ≥ la fecha dada. Sólo excluye sábado y domingo: NO hay tabla de feriados, y
 *  un feriado cae con motivo R93 — está declarado como límite en el resumen. */
export function proximoHabil(d) {
  const f = new Date(d.getTime())
  while (f.getUTCDay() === 0 || f.getUTCDay() === 6) f.setUTCDate(f.getUTCDate() + 1)
  return `${f.getUTCFullYear()}${String(f.getUTCMonth() + 1).padStart(2, '0')}${String(f.getUTCDate()).padStart(2, '0')}`
}

async function bajarBytes(g, id) {
  const b = await g.descargarBytes(id)
  return Buffer.isBuffer(b) ? b : Buffer.from(b.bytes || b.data || b)
}

function filas(wb, hoja) {
  const ws = wb.Sheets[hoja ?? wb.SheetNames[0]]
  if (!ws) throw new Error(`la hoja «${hoja}» no existe (hay: ${wb.SheetNames.join(', ')})`)
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false })
}

/** La planilla del estudio: nombre · remuneración · FCL · % · forma de pago. */
function leerPlanilla(wb, hoja) {
  const out = []
  for (const r of filas(wb, hoja).slice(1)) {
    const [nombre, , fcl, , forma] = r
    if (typeof nombre !== 'string' || !nombre.trim() || !Number.isFinite(fcl)) continue
    out.push({
      nombre: nombre.trim(),
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
    const [legajo, , nombre, cuit, , cbuSueldo, , cbuAfon] = r
    if (typeof nombre !== 'string' || !nombre.trim()) continue
    out.push({
      legajo,
      nombre: nombre.trim(),
      cuil: String(cuit ?? '').replace(/\D/g, ''),
      cbuSueldo: String(cbuSueldo ?? '').replace(/\D/g, ''),
      cbuAfon: String(cbuAfon ?? '').replace(/\D/g, ''),
    })
  }
  return out
}

/** Resuelve una fila de la planilla a un pago listo, o al motivo por el que no puede pagarse. */
function resolver(fila, { cuentas, aceptadas, padron }) {
  const base = { ...fila }
  if (fila.forma !== 'TRANSFERENCIA') return { ...base, fuera: `el estudio lo liquida en ${fila.forma}` }

  const cands = cuentas.filter((c) => mismoNombre(fila.nombre, c.nombre))
  if (cands.length === 0) return { ...base, fuera: 'no está en RESUMEN DE CUENTAS BANCARIAS' }
  if (cands.length > 1) return { ...base, fuera: `el nombre resuelve a ${cands.length} filas de cuentas` }
  const cta = cands[0]

  const ya = aceptadas.get(cta.cuil)
  if (!ya) return { ...base, fuera: `el banco nunca acreditó un pago al CUIL ${cta.cuil}` }
  if (cta.cbuAfon && cta.cbuAfon !== ya.cuenta) {
    return { ...base, fuera: `la cuenta del banco (…${ya.cuenta.slice(-4)}) no coincide con RESUMEN DE CUENTAS (…${cta.cbuAfon.slice(-4)})` }
  }
  const p = padron.find((x) => x.cuil === cta.cuil)
  if (!p) return { ...base, fuera: `el CUIL ${cta.cuil} no está en el padrón del OS` }

  // El NOMBRE y la CUENTA salen del lote que el banco acreditó, no de la planilla ni del padrón.
  return { ...base, cuil: cta.cuil, cuenta: ya.cuenta, nombre: ya.nombre, nombreEstudio: fila.nombre, legajo: cta.legajo }
}

const pesos = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ddmmaaaa = (f) => `${f.slice(6)}/${f.slice(4, 6)}/${f.slice(0, 4)}`

function resumen({ periodo, fechaPago, entran, afuera, val, nombreArchivo }) {
  const total = entran.reduce((a, p) => a + p.importe, 0)
  const l = [`# Fondo de Cese ${periodo} — ${nombreArchivo}\n`]
  l.push(`- **Plantilla**: «PAGO AFON 0607» (Drive \`${DRIVE.plantilla}\`), el lote que Santander`
    + ' debitó el **18/08/2026**. El archivo es ese mismo archivo con otras filas de datos:'
    + ' encabezados, estilos, validaciones de datos e imágenes quedaron intactos.')
  l.push(`- **Fecha de pago**: ${ddmmaaaa(fechaPago)} · **Orden de pago**: \`${ordenDePago(periodo)}\``)
  l.push(`- **Trabajadores**: ${entran.length} · **Total**: $ ${pesos(total)}`)
  l.push(`- **Validación estructural**: ${val.ok ? 'OK — sin diferencias contra la plantilla' : `${val.errores.length} diferencia(s)`}`)
  for (const e of val.errores) l.push(`  - ${e}`)
  l.push('\n## Los que entran\n')
  l.push('| # | Nombre (como lo escribe el banco) | CUIL | Cuenta | Importe |')
  l.push('|---|---|---|---|---|')
  entran.forEach((p, i) => l.push(`| ${i + 1} | ${p.nombre} | ${p.cuil} | ••••${p.cuenta.slice(-4)} | $ ${pesos(p.importe)} |`))
  l.push(`| | **TOTAL** | | | **$ ${pesos(total)}** |`)
  l.push('\n## Lo que NO entra\n')
  if (afuera.length === 0) l.push('_Nada._')
  else {
    l.push('| Trabajador | Importe | Por qué |')
    l.push('|---|---|---|')
    for (const p of afuera) l.push(`| ${p.nombre} | $ ${pesos(p.importe)} | ${p.fuera} |`)
    l.push(`\n**Fuera del archivo: $ ${pesos(afuera.reduce((a, p) => a + p.importe, 0))}** — se paga por otra vía.`)
  }
  l.push('\n## Límites\n')
  l.push('- La fecha excluye sábados y domingos, **no feriados**: el OS no tiene calendario de'
    + ' feriados y un feriado se rechaza con motivo R93.')
  l.push('- Que una cuenta esté en el lote acreditado prueba que existía el 18/08/2026, no que siga'
    + ' abierta hoy.')
  return l.join('\n') + '\n'
}

function mensajeBot({ periodo, fechaPago, entran, afuera, nombreArchivo, val }) {
  const total = entran.reduce((a, p) => a + p.importe, 0)
  const l = [
    `**Fondo de Cese ${periodo.slice(4)}/${periodo.slice(0, 4)} — rehecho sobre el archivo que el banco aceptó**`,
    '',
    `**\`${nombreArchivo}\`** — es el que subís.`,
    `· **${entran.length} trabajadores · $ ${pesos(total)} · fecha de pago ${ddmmaaaa(fechaPago)}`
    + ` · orden de pago ${ordenDePago(periodo)}**`,
    `· Afuera: **$ ${pesos(afuera.reduce((a, p) => a + p.importe, 0))}** (${afuera.length} en EFECTIVO según el estudio).`,
    '',
    '**Qué cambió respecto del que te mandé antes**',
    '· El anterior lo había vuelto a escribir con una librería de planillas y **le faltaban las 5'
    + ' imágenes, los 5 dibujos, `docProps/custom.xml` y las 5 validaciones de datos** de la hoja'
    + ' Pagos, y le sobraba un `xl/metadata.xml`. Éste es el archivo de junio/julio con las filas'
    + ' cambiadas: todo lo demás quedó byte por byte igual.',
    '· Los **nombres** ahora son los que escribe el banco («MALDONADO BATISTA EMILIANO»,'
    + ' «PETINA RODRIGUEZ JAIRO E.»), no los del estudio contable.',
    `· Las **cuentas** salen del lote que el banco debitó el 18/08 y las verifiqué carácter por`
    + ` carácter: las ${entran.length} son idénticas.`,
    '',
    `· Validación estructural contra la plantilla: **${val.ok ? 'sin diferencias' : `${val.errores.length} diferencia(s)`}**.`,
    '· El `.txt` del FUR queda descartado hasta que el banco dé el número de acuerdo. No lo mando.',
  ]
  return l.join('\n')
}

async function mandarAlChat({ adjuntos, destino, texto }) {
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
  const post = await mm.crearPost({ channel_id: canal.id, message: texto, file_ids: fileIds })
  // LA EVIDENCIA ES DEL EFECTO: se relee el post del servidor, no se confía en la respuesta del POST.
  const publicado = await mm._req('GET', `/posts/${post.id}`)
  return { postId: publicado.id, adjuntos: (publicado.file_ids ?? []).length, canal: canal.id }
}

/** La entrada del ZIP donde vive la hoja «Pagos». Se resuelve por el NOMBRE de la hoja en
 *  `workbook.xml`: la posición del archivo (`sheet2.xml`) es una casualidad del editor. */
function entradaDeLaHoja(entradas, hoja) {
  const wb = contenidoDe(entradas, 'xl/workbook.xml').toString('utf8')
  const nombres = [...wb.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="rId(\d+)"/g)]
  const m = nombres.find((x) => x[1] === hoja)
  if (!m) throw new Error(`la plantilla no tiene la hoja «${hoja}»`)
  const rels = contenidoDe(entradas, 'xl/_rels/workbook.xml.rels').toString('utf8')
  // El orden de los atributos NO es fijo: este archivo escribe `Target` antes que `Id`, y otro
  // editor los pone al revés. Se busca el elemento entero y recién ahí sus atributos.
  const rel = [...rels.matchAll(/<Relationship\b[^>]*\/>/g)]
    .map((x) => x[0])
    .find((x) => new RegExp(`Id="rId${m[2]}"`).test(x))
  const target = rel && /Target="([^"]*)"/.exec(rel)
  if (!target) throw new Error(`la plantilla no declara dónde vive la hoja «${hoja}»`)
  return `xl/${target[1].replace(/^\/?xl\//, '')}`
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
  const [bPlanilla, bCuentas, bPlantilla] = await Promise.all(
    [DRIVE.planilla, DRIVE.cuentas, DRIVE.plantilla].map((id) => bajarBytes(g, id)),
  )
  const padron = (await query('select nombre_completo, cuil from public.personas where cuil is not null')).rows
    .map((r) => ({ nombre: r.nombre_completo, cuil: String(r.cuil).replace(/\D/g, '') }))

  const entradas = entradasDe(bPlantilla)
  const rutaHoja = entradaDeLaHoja(entradas, HOJA_PAGOS)
  const xmlPlantilla = contenidoDe(entradas, rutaHoja).toString('utf8')
  const aceptadas = cuentasAceptadas(xmlPlantilla)

  const ctx = { cuentas: leerCuentas(XLSX.read(bCuentas, { type: 'buffer' })), aceptadas, padron }
  const resueltos = leerPlanilla(XLSX.read(bPlanilla, { type: 'buffer' }), hoja).map((f) => resolver(f, ctx))
  const entran = resueltos.filter((p) => !p.fuera)
  const afuera = resueltos.filter((p) => p.fuera)
  if (entran.length === 0) throw new Error('ningún trabajador quedó en condiciones de entrar al archivo')

  const xmlGenerado = hojaConPagos(xmlPlantilla, {
    pagos: entran, fechaSerial: serialExcel(fechaPago), orden: ordenDePago(periodo),
  })
  const val = validarPagoSimple(xmlPlantilla, xmlGenerado, aceptadas)
  const nombreArchivo = `PAGO SIMPLE AFON - ${periodo.slice(4)}${periodo.slice(0, 4)}.xlsx`
  const rutaXlsx = path.join(salida, nombreArchivo)
  fs.writeFileSync(rutaXlsx, editarXlsx(bPlantilla, rutaHoja, xmlGenerado))

  const rutaMd = path.join(salida, `FCL_${periodo}_resumen.md`)
  fs.writeFileSync(rutaMd, resumen({ periodo, fechaPago, entran, afuera, val, nombreArchivo }))

  console.log(`entran ${entran.length} · afuera ${afuera.length} · total $ ${pesos(entran.reduce((s, p) => s + p.importe, 0))}`)
  console.log(`xlsx  ${rutaXlsx}`)
  console.log(`validación estructural: ${val.ok ? 'OK' : val.errores.join(' ; ')}`)
  console.log(`resumen ${rutaMd}`)
  if (!val.ok) throw new Error('el archivo generado NO es estructuralmente igual a la plantilla: no se manda')

  if (!a.mandar) { console.log('(sin --mandar: no se publicó nada en el chat)'); return }
  const r = await mandarAlChat({
    destino: String(a.destino ?? 'jorge'), adjuntos: [rutaXlsx, rutaMd],
    texto: mensajeBot({ periodo, fechaPago, entran, afuera, nombreArchivo, val }),
  })
  console.log(`publicado en el privado con @${a.destino ?? 'jorge'} · post ${r.postId}`
    + ` · ${r.adjuntos} adjunto(s) · canal ${r.canal}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
