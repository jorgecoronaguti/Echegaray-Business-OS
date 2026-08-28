#!/usr/bin/env node
// ESTUDIAR LOS DOCUMENTOS DE WORD DE LA CARPETA DE DRIVE — memorias, pliegos y contratos.
//
// El estudio de las 237 cotizaciones dejó dos huecos declarados. Éste cierra el primero: los ~57
// `.doc`/`.docx` que quedaron sin abrir con el motivo «no hay adaptador de Word en el repo».
//
//   node orquestador/scripts/estudiar-documentos-word.mjs --dry
//   node orquestador/scripts/estudiar-documentos-word.mjs
//   node orquestador/scripts/estudiar-documentos-word.mjs --filtro=QUATTROPANI --detalle
//
// ═══ LOS CUATRO ESTADOS SE REPORTAN POR SEPARADO, NO COMO ESCALERA ═══
//
//   DETECTADO           se reconoció que es un documento de Word (por su FIRMA, no por el nombre)
//   PARSEADO            se abrió y salió texto y/o tablas
//   INTERPRETADO        de ese texto salieron hallazgos con significado de obra
//   INTEGRADO_PROYECTO  esos hallazgos entraron a la biblioteca como candidatos
//
// Un documento puede estar PARSEADO y NO INTERPRETADO —una carátula de facturas se lee entera y no
// dice nada de una obra— y eso es un resultado correcto, no una falla. Aplanarlos en un porcentaje
// único es la mentira que este circuito existe para no decir.
//
// ═══ SÓLO LEE, Y NO GASTA UN PESO DE MODELO ═══
//
// No escribe en Drive. Lo único que escribe son dos archivos del repo, y con `--dry` ni eso. Todo el
// camino es determinístico: ZIP, XML, OLE2 y expresiones regulares. Sin saldo de Anthropic sale
// exactamente lo mismo.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { closePool, query } from '../lib/db.mjs'
import { makeGoogleClient } from '../lib/google.mjs'
import { RAIZ_ADMINISTRACION, subarbol } from '../lib/conocimiento/inventario-drive.mjs'
import { FORMATO, formatoDe } from '../lib/ingesta/registro.mjs'
import { leerWord } from '../lib/ingesta/word.mjs'
import { aConocimientos, huecosDeclarados, leerDocumentoDeProyecto } from '../lib/conocimiento/documento-proyecto.mjs'
import { claseDocumental } from '../lib/plano/documental.mjs'
import { ETAPA, cargar, conocimiento, documento, guardar, hueco, incorporar, inventario } from '../lib/conocimiento/biblioteca.mjs'
import { conCache } from '../lib/conocimiento/cache.mjs'
import { hashDe } from '../lib/conocimiento/leer-archivo.mjs'

export const RUTA_INFORME = path.join(
  path.dirname(new URL(import.meta.url).pathname), '..', 'datos', 'conocimiento', 'documentos-word.json',
)

/** La versión del productor entra en la clave del caché: cambiar el lector sin cambiarla sirve una
 *  lectura vieja con código nuevo, que es la peor forma de fallar. */
/** ═══ SE SUBE CADA VEZ QUE CAMBIA LO QUE ESTE SCRIPT GUARDA ═══
 *
 *  El caché guarda la RESPUESTA bajo el hash de la entrada y de esta versión. La v2 se escribió
 *  cuando `leerDocumentoDeProyecto()` todavía no devolvía `clase`, así que servía respuestas sin
 *  ese campo a un código que ya lo esperaba: las 187 frases salieron `MEMORIA` —incluidas las del
 *  borrador— sin un solo error. Es la falla que el propio `cache.mjs` advierte en su encabezado.
 *  v3: la lectura devuelve `clase`, y con ella una NOTA_INTERNA entra con confianza BAJA. */
export const VERSION_LECTOR = 3

const arg = (n, porDefecto = null) => {
  const m = process.argv.find((a) => a.startsWith(`--${n}=`))
  return m ? m.slice(n.length + 3) : porDefecto
}
const bandera = (n) => process.argv.includes(`--${n}`)

/** La ficha de estados de UN archivo. Las cuatro por separado, cada una con su porqué. PURA. */
export function estadosDe({ archivo, lectura = null, interpretacion = null, candidatos = null, porQue = null }) {
  const texto = lectura?.ok ? lectura : null
  return {
    archivo: archivo.ruta ?? archivo.nombre,
    nombre: archivo.nombre,
    driveId: archivo.driveId,
    variante: lectura?.variante ?? null,
    DETECTADO: { ok: true, porQue: `la extensión «${path.extname(archivo.nombre) || archivo.mime}» es un documento y la firma dice ${lectura?.variante ?? 'que no se llegó a mirar'}` },
    PARSEADO: { ok: Boolean(texto), cuanto: texto?.utiles ?? 0, porQue: texto ? `${texto.utiles} caracteres útiles${texto.tablas ? `, ${texto.tablas} tabla(s) con ${texto.filas} fila(s)` : ''}` : (porQue ?? lectura?.porQue ?? 'no se pudo abrir') },
    INTERPRETADO: { ok: Boolean(interpretacion?.hallazgos?.length), cuanto: interpretacion?.hallazgos?.length ?? 0, porQue: interpretacion ? interpretacion.resumen : 'no se llegó a interpretar porque no se pudo parsear' },
    INTEGRADO_PROYECTO: { ok: Boolean(candidatos?.length), cuanto: candidatos?.length ?? 0, porQue: candidatos?.length ? `${candidatos.length} candidato(s) entraron a la biblioteca con procedencia DOCUMENTO_PROYECTO` : 'ningún hallazgo se pudo convertir en candidato' },
  }
}

/** Los documentos de Word del subárbol. La lista se arma con `formatoDe`, la MISMA función que usa
 *  el circuito para elegir adaptador: dos tablas de extensiones se desincronizan. */
/**
 * ¿ESTE CONTENIDO YA ENTRÓ EN ESTA CORRIDA? PURA.
 *
 * ═══ 92 CONOCIMIENTOS DUPLICADOS QUE PRODUJO ESTE MISMO CIRCUITO ═══
 *
 * En Drive hay dos copias del contrato de Quattropani con distinto nombre. El circuito de
 * cotizaciones ya deduplicaba por hash de contenido; éste no, así que las dos se estudiaron y las
 * MISMAS 46 frases entraron dos veces con dos slugs distintos —`contrato-de-obra-y-memoria-
 * descriptiva` y `...-ecsas-quattropani`—. Nada se pisó, porque el slug sale del NOMBRE: se
 * duplicó. Y el conteo inflado se le informó al dueño como si fueran 187 hallazgos distintos.
 *
 * El hash es del CONTENIDO, así que dos copias con distinto nombre son una sola, y una copia
 * editada vuelve a ser dos: la que se quiere distinguir se distingue sola.
 *
 * `vistos` es `hash → nombre del primero`. Devuelve el nombre del original, o `null` si es nuevo.
 */
export const yaEntroEnEstaCorrida = (hash, vistos) => (hash && vistos.has(hash) ? vistos.get(hash) : null)

export const wordDe = (archivos = []) => archivos
  .filter((a) => !a.esCarpeta && formatoDe({ nombre: a.nombre, mime: a.mime }) === FORMATO.DOCUMENTO)

/** Baja los bytes de un archivo, exportando cuando es un nativo de Google. */
async function bytesDe(google, a) {
  if (String(a.mime ?? '').startsWith('application/vnd.google-apps')) {
    // Un Doc nativo no tiene bytes: `alt=media` devuelve 403. Se exporta a `.docx` y entra por el
    // mismo lector, en vez de tener un segundo camino que lea otra cosa.
    return google.exportarBytesComo(a.driveId, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  }
  return google.descargarBytes(a.driveId)
}

/** Estudia UN documento, con caché por (id, fecha de modificación, versión del lector). */
async function estudiarUno(google, a, { refrescar }) {
  const { valor } = await conCache({
    espacio: 'word-proyecto',
    version: VERSION_LECTOR,
    entrada: { id: a.driveId, mod: a.modificado },
    refrescar,
    producir: async () => {
      let bytes
      try { bytes = await bytesDe(google, a) } catch (e) { return { ok: false, valor: { fallo: `no se pudo bajar: ${String(e?.message ?? e).slice(0, 160)}` } } }
      const lectura = leerWord(bytes, { nombre: a.nombre })
      const hash = hashDe(bytes)
      if (!lectura.ok) return { ok: true, valor: { hash, lectura: { ok: false, variante: lectura.variante, porQue: lectura.porQue } } }
      const clase = claseDocumental(a.nombre)
      const tablas = (lectura.bloques ?? []).filter((b) => b.tipo === 'tabla')
      const interpretacion = leerDocumentoDeProyecto(lectura.texto, { documento: a.nombre, clase, tablas })
      return {
        ok: true,
        valor: {
          hash,
          lectura: { ok: true, variante: lectura.variante, utiles: lectura.utiles, tablas: lectura.tablas ?? 0, filas: lectura.filas ?? 0 },
          clase: clase.id,
          interpretacion: { ...interpretacion, tecnicos: interpretacion.tecnicos },
          huecos: huecosDeclarados(interpretacion),
        },
      }
    },
  })
  return valor ?? { fallo: 'el caché no devolvió nada' }
}

async function main() {
  const raiz = arg('raiz', RAIZ_ADMINISTRACION)
  const filtro = arg('filtro', null)
  const dry = bandera('dry')
  const refrescar = bandera('refrescar')
  const detalle = bandera('detalle')

  const archivos = await subarbol({ query }, raiz)
  let word = wordDe(archivos)
  if (filtro) word = word.filter((a) => `${a.ruta} ${a.nombre}`.toLowerCase().includes(filtro.toLowerCase()))
  console.log(`\n═══ DOCUMENTOS DE WORD en ${raiz}${filtro ? ` · filtro «${filtro}»` : ''} ═══`)
  console.log(`${word.length} documento(s): ${Object.entries(word.reduce((a, x) => { const k = path.extname(x.nombre).toLowerCase() || x.mime; a[k] = (a[k] ?? 0) + 1; return a }, {})).map(([k, v]) => `${k} ${v}`).join(' · ')}`)

  const google = makeGoogleClient({})
  const fichas = []
  const candidatosTodos = []
  const huecosTodos = []
  const documentos = []
  const vistos = new Map()
  const duplicados = []
  for (const a of word) {
    const r = await estudiarUno(google, a, { refrescar })
    if (r.fallo) { fichas.push({ ...estadosDe({ archivo: a, porQue: r.fallo }), fallo: r.fallo }); continue }
    const original = yaEntroEnEstaCorrida(r.hash, vistos)
    if (original) {
      const porQue = `contenido idéntico a «${original}»: es la misma copia con otro nombre y sus frases ya entraron`
      duplicados.push({ archivo: a.ruta ?? a.nombre, original, porQue })
      fichas.push({ ...estadosDe({ archivo: a, porQue }), duplicadoDe: original })
      continue
    }
    if (r.hash) vistos.set(r.hash, a.nombre)
    const { candidatos, rechazados } = r.lectura.ok ? aConocimientos(r.interpretacion, { conocimiento }) : { candidatos: [], rechazados: [] }
    fichas.push({ ...estadosDe({ archivo: a, lectura: r.lectura, interpretacion: r.lectura.ok ? r.interpretacion : null, candidatos }), rechazados, huecos: r.huecos?.length ?? 0 })
    candidatosTodos.push(...candidatos)
    for (const h of r.huecos ?? []) {
      huecosTodos.push(hueco({ clave: `documento-proyecto.${h.documento}.sin-definir.${huecosTodos.length + 1}`, tipo: h.tipo, porQue: `${h.porQue} — «${h.textoLiteral.slice(0, 180)}»`, quienLoTiene: h.quienLoTiene }))
    }
    if (r.hash) {
      documentos.push(documento({
        fuenteId: 'drive-administracion', url: `https://drive.google.com/file/d/${a.driveId}`,
        titulo: a.ruta ?? a.nombre, hash: r.hash, formato: r.lectura.variante ?? 'WORD',
        obtenidoEn: new Date().toISOString().slice(0, 10),
        etapa: candidatos.length ? ETAPA.ESTUDIADO : (r.lectura.ok ? ETAPA.PARSEADO : ETAPA.NO_LEIDO),
        porQue: r.lectura.ok ? null : r.lectura.porQue,
      }))
    }
  }

  const cuenta = (etapa) => fichas.filter((f) => f[etapa]?.ok).length
  console.log('\n── LOS CUATRO ESTADOS, POR SEPARADO ──')
  for (const e of ['DETECTADO', 'PARSEADO', 'INTERPRETADO', 'INTEGRADO_PROYECTO']) console.log(`  ${e.padEnd(20)} ${cuenta(e)} de ${fichas.length}`)
  console.log(`  ${'FALLO'.padEnd(20)} ${fichas.filter((f) => !f.PARSEADO.ok).length} de ${fichas.length}`)
  // Un duplicado NO se calla: se cuenta aparte. Callarlo devuelve el mismo total inflado de antes,
  // sólo que con el inflado escondido en vez de repetido.
  if (duplicados.length) {
    console.log(`  ${'COPIA DUPLICADA'.padEnd(20)} ${duplicados.length} de ${fichas.length} — no se estudian dos veces`)
    for (const d of duplicados) console.log(`     = ${d.archivo} — ${d.porQue}`)
  }
  for (const f of fichas.filter((x) => !x.PARSEADO.ok)) console.log(`     ✗ ${f.nombre} — ${f.PARSEADO.porQue.slice(0, 130)}`)
  console.log(`\n  hallazgos documentales   ${fichas.reduce((a, f) => a + f.INTERPRETADO.cuanto, 0)}`)
  console.log(`  huecos declarados por el propio documento   ${huecosTodos.length}`)
  if (detalle) for (const f of fichas) console.log(`  ${f.PARSEADO.ok ? '·' : '✗'} ${String(f.INTERPRETADO.cuanto).padStart(4)} hallazgos  ${f.archivo}`)

  fs.mkdirSync(path.dirname(RUTA_INFORME), { recursive: true })
  if (dry) { console.log('\n--dry: no se escribió nada'); return }
  fs.writeFileSync(RUTA_INFORME, `${JSON.stringify({ generado: new Date().toISOString(), raiz, filtro, fichas, duplicados, huecos: huecosTodos }, null, 1)}\n`)
  const bib = cargar()
  const nueva = incorporar(bib, { documentos, conocimientos: candidatosTodos, huecos: huecosTodos })
  const version = guardar(nueva)
  console.log(`\n✓ biblioteca v${version}: ${JSON.stringify(inventario(nueva))}`)
  console.log(`✓ informe en ${RUTA_INFORME}`)
}

// ═══ IMPORTAR ESTE ARCHIVO NO PUEDE SALIR A DRIVE ═══
// Sin esta guarda, `import('./estudiar-documentos-word.mjs')` —desde un test, desde una consola—
// ejecuta la corrida entera: baja 57 documentos y REESCRIBE `biblioteca.json`. Ya pasó en este repo
// (465b14f1) y volvió a pasar acá. `estudiar-cotizaciones-drive.mjs` tiene la misma guarda.
const ejecutadoDirecto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (ejecutadoDirecto) {
  main().then(() => closePool()).then(() => process.exit(0))
    .catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
