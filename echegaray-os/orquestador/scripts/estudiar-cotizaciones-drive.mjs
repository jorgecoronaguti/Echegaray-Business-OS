#!/usr/bin/env node
// ESTUDIAR CÓMO COTIZA ECSAS, LEYENDO LAS COTIZACIONES REALES DE DRIVE.
//
// El dueño: «tenés que aprender cómo se han estado haciendo las cotizaciones, lo que no significa
// que estén en lo correcto». Este comando produce las dos cosas por separado:
//
//   1. LA PRÁCTICA → datos/conocimiento/biblioteca.json — EXPERIENCIA_ECSAS + CANDIDATO, para que el
//      motor pueda contestar «¿cómo cotizamos esto normalmente?» sin abrir un archivo.
//   2. LOS HALLAZGOS → datos/conocimiento/hallazgos-cotizaciones.json — con archivo, hoja y celda.
//      Eso es para el dueño, no para el motor, y por eso vive aparte.
//
// ═══ SÓLO LEE ═══
//
// No escribe en Drive, no toca el Sheet, no corre el pipeline. Lo único que escribe son dos archivos
// del repo, y con `--dry` ni eso.
//
//   node orquestador/scripts/estudiar-cotizaciones-drive.mjs --dry
//   node orquestador/scripts/estudiar-cotizaciones-drive.mjs
//   node orquestador/scripts/estudiar-cotizaciones-drive.mjs --raiz=<idDeCarpeta> --limite=5
//
// ═══ ES IDEMPOTENTE POR HASH ═══
//
// Un archivo ya estudiado cuyo contenido no cambió no se vuelve a bajar ni a estudiar. Con
// `--refrescar` se ignora ese recuerdo y se rehace todo.
import fs from 'node:fs'
import path from 'node:path'
import { closePool, query } from '../lib/db.mjs'
import { makeGoogleClient } from '../lib/google.mjs'
import { CLASE, inventariar, subarbol } from '../lib/conocimiento/inventario-drive.mjs'
import { formatoDe } from '../lib/ingesta/registro.mjs'
import { cargar, guardar, incorporar, inventario, yaEstudiado } from '../lib/conocimiento/biblioteca.mjs'
import { estudiarTanda } from '../lib/conocimiento/estudio-cotizaciones.mjs'
import { conCache } from '../lib/conocimiento/cache.mjs'
import { resumen } from '../lib/conocimiento/hallazgos-cotizacion.mjs'

/** La carpeta `administracion` de Drive: la que señaló el dueño. */
export const RAIZ_ADMINISTRACION = '1a_3sIbioAQm0EcuJTbu3L6q_hy_LHUXs'

/** Las clases del inventario que este comando estudia. El resto queda inventariado y declarado. */
export const CLASES_QUE_ESTUDIA = Object.freeze([CLASE.COTIZACION_ECSAS, CLASE.RENDIMIENTO, CLASE.MEDICION])

export const RUTA_HALLAZGOS = path.join(
  path.dirname(new URL(import.meta.url).pathname), '..', 'datos', 'conocimiento', 'hallazgos-cotizaciones.json',
)

/** Los hallazgos de la corrida anterior, si los hay. */
export function leerHallazgos(ruta = RUTA_HALLAZGOS) {
  try { return JSON.parse(fs.readFileSync(ruta, 'utf8')).hallazgos ?? [] } catch { return [] }
}

/**
 * FUSIONA LOS HALLAZGOS EN VEZ DE PISARLOS.
 *
 * Una corrida idempotente saltea lo ya estudiado, así que la lista NUEVA sólo cubre lo que se
 * estudió esta vez. Escribirla tal cual borraría los hallazgos de las cotizaciones salteadas —el
 * generador que vacía un archivo porque no encontró lo que esperaba, que en este repo ya costó una
 * pestaña entera—. Se fusiona por `clave`: lo nuevo pisa lo viejo con la misma clave, lo demás queda.
 */
export function fusionarHallazgos(previos = [], nuevos = [], { salteados = 0 } = {}) {
  if (!salteados) return nuevos
  const porClave = new Map(previos.map((h) => [h.clave, h]))
  for (const h of nuevos) porClave.set(h.clave, h)
  return [...porClave.values()]
}

const arg = (n, porDefecto = null) => {
  const m = process.argv.find((a) => a.startsWith(`--${n}=`))
  return m ? m.slice(n.length + 3) : porDefecto
}
const bandera = (n) => process.argv.includes(`--${n}`)

/** El hash recordado de un archivo, por (id, fecha de modificación). Sin bytes y sin red. */
const recuerdoDeHash = (refrescar) => ({
  async hashConocido(a) {
    if (refrescar) return null
    const { valor } = await conCache({ espacio: 'drive-hash', version: 1, entrada: { id: a.driveId, mod: a.modificado }, producir: async () => ({ ok: false, valor: null }) })
    return valor ?? null
  },
  async recordarHash(a, hash) {
    if (!hash) return
    await conCache({ espacio: 'drive-hash', version: 1, entrada: { id: a.driveId, mod: a.modificado }, refrescar: true, producir: async () => ({ ok: true, valor: hash }) })
  },
})

async function main() {
  const raiz = arg('raiz', RAIZ_ADMINISTRACION)
  const dry = bandera('dry')
  const refrescar = bandera('refrescar')
  const limite = Number(arg('limite', 0)) || 0

  const archivos = await subarbol({ query }, raiz)
  const inv = inventariar(archivos.filter((a) => !a.esCarpeta), { formatoDe: (a) => formatoDe({ nombre: a.nombre, mime: a.mime }) })
  console.log(`\n═══ INVENTARIO de ${raiz} ═══`)
  console.log(`${inv.total} archivos · ${inv.utiles} con algo que extraer · ${inv.noUtiles} sin uso para XSAS`)
  for (const [k, v] of Object.entries(inv.porClase).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`)
  console.log(`  formatos: ${Object.entries(inv.porFormato).map(([k, v]) => `${k} ${v}`).join(' · ')}`)

  const todas = inv.fichas.filter((f) => CLASES_QUE_ESTUDIA.includes(f.clase) && f.formato === 'PLANILLA')
  const candidatos = limite ? todas.slice(0, limite) : todas
  console.log(`\n═══ ESTUDIO ═══\n${todas.length} planillas candidatas${limite ? `, se estudian ${candidatos.length}` : ''}`)

  const bib = cargar()
  const google = makeGoogleClient({})
  const r = await estudiarTanda(candidatos, {
    traer: (a) => {
      // Un Sheet NATIVO de Google no tiene bytes que bajar: `alt=media` devuelve 403 y el motivo
      // que llega —«google download 403»— no dice nada. Se declara lo que realmente pasa.
      if (a.mime === 'application/vnd.google-apps.spreadsheet') {
        throw new Error('es un Google Sheet nativo, no un archivo: habría que exportarlo a xlsx y este circuito todavía no lo hace')
      }
      return google.descargarBytes(a.driveId)
    },
    // `--refrescar` tiene que saltear las DOS memorias. Si sólo ignorara el hash recordado, volvería
    // a bajar los 114 archivos para que la biblioteca los descartara igual: todo el costo, ningún
    // resultado. Rehacer significa rehacer.
    yaEstudiado: (h) => !refrescar && yaEstudiado(bib, h),
    ...recuerdoDeHash(refrescar),
    obtenidoEn: new Date().toISOString().slice(0, 10),
  })

  console.log(`cotizaciones leídas: ${r.cotizaciones.length} · ya estudiadas: ${r.salteados.length} · no leídas: ${r.noLeidos.length}`)
  for (const n of r.noLeidos) console.log(`  ✗ ${n.nombre} — ${n.porQue}`)
  console.log(`\nprácticas observadas: ${r.practicas.length} (${resumirMadurez(r.practicas)})`)
  console.log(`hallazgos: ${JSON.stringify(r.resumen, null, 1)}`)
  for (const h of r.hallazgos.filter((x) => x.gravedad === 'ALTA')) console.log(`  [ALTA] ${h.tipo} · ${h.afirmacion}`)

  if (dry) { console.log('\n--dry: no se escribió nada'); return }
  const nueva = incorporar(bib, { documentos: r.documentos, conocimientos: r.conocimientos })
  const version = guardar(nueva)
  fs.mkdirSync(path.dirname(RUTA_HALLAZGOS), { recursive: true })
  const fusionados = fusionarHallazgos(leerHallazgos(), r.hallazgos, { salteados: r.salteados.length })
  fs.writeFileSync(RUTA_HALLAZGOS, `${JSON.stringify({ generado: new Date().toISOString(), raiz, resumen: resumen(fusionados), hallazgos: fusionados }, null, 1)}\n`)
  console.log(`\n✓ biblioteca v${version}: ${JSON.stringify(inventario(nueva))}`)
  console.log(`✓ hallazgos en ${RUTA_HALLAZGOS}`)
}

const resumirMadurez = (ps) => Object.entries(ps.reduce((a, p) => { a[p.madurez] = (a[p.madurez] ?? 0) + 1; return a }, {}))
  .sort().map(([k, v]) => `${k}:${v}`).join(' · ')

main().then(() => closePool()).then(() => process.exit(0))
  .catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
