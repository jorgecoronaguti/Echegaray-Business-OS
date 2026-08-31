#!/usr/bin/env node
// CONGELAR LA LECTURA DE UN ÁMBITO DE OBRA QUE LLEGA COMO PLANILLAS.
//
//   node orquestador/scripts/estudiar-ambito-planillas.mjs --cliente="ARCOR - SAN JUAN" \
//        --ambito="FILTRO SANITARIO" --salida=ambito-arcor-filtro-sanitario.json [--dry]
//
// ═══ SÓLO LEE ═══
//
// Baja de Drive los documentos que la biblioteca ya inventarió para ese ámbito, los abre con los
// lectores que ya existen (`conocimiento/leer-archivo.mjs`) y guarda LA LECTURA —ítems, rubros,
// notas, cierre— en un artefacto del repo. No escribe en Drive, no toca el Sheet, no corre ningún
// pipeline.
//
// ═══ POR QUÉ SE CONGELA, Y POR QUÉ EL HASH VIAJA ADENTRO ═══
//
// `cotizador-casos-reales.mjs` tiene que correr entero, siempre, sin red y sin credenciales: es la
// evidencia de cierre del motor. Un caso que dependa de bajar cuatro archivos de Drive se cae
// cuando se cae la red y deja verde el resto, que es la peor forma de fallar.
//
// Pero un espejo congelado que no grita cuando el original cambió es una fuente muerta que se lee
// como viva. Por eso cada documento guarda el `hash` de sus bytes y la fecha en que se bajó: quien
// quiera verificar que el artefacto sigue reflejando Drive vuelve a correr esto y compara.
//
// ═══ LO QUE NO SE GUARDA ═══
//
// Los BYTES no. Ni las filas crudas. Se guarda la lectura semántica —lo que `leerLibro()` entendió—
// porque es lo único que el motor consume, y guardar el archivo entero convertiría el repo en un
// espejo de Drive con toda su desactualización silenciosa.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { makeGoogleClient } from '../lib/google.mjs'
import { leerArchivo } from '../lib/conocimiento/leer-archivo.mjs'
import { leerLibro } from '../lib/conocimiento/planilla-semantica.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
export const DIR_DATOS = path.join(AQUI, '..', 'datos', 'conocimiento')

/** Cuánto texto de un Word entra al artefacto. El pliego completo no aporta más que sus condiciones
 *  y sí multiplica el peso; lo que se recorta se declara con `textoRecortado`. */
export const MAX_TEXTO = 20000

const arg = (n, porDefecto = null) => {
  const m = process.argv.find((a) => a.startsWith(`--${n}=`))
  return m ? m.slice(n.length + 3) : porDefecto
}

/** El id de Drive escondido en la URL de la biblioteca. PURA. */
export const driveIdDe = (url) => (String(url ?? '').match(/\/d\/([^/?#]+)/) ?? [])[1] ?? null

/** Los documentos de un ámbito: los que están bajo la carpeta del cliente Y mencionan el ámbito en
 *  su ruta. Los dos filtros son necesarios — «CISTERNA» aparece en más de un cliente. PURA. */
export function documentosDelAmbito(biblioteca, { cliente, ambito }) {
  const c = String(cliente).toLowerCase()
  const a = String(ambito).toLowerCase()
  return (biblioteca.documentos ?? []).filter((d) => {
    const t = String(d.titulo ?? '').toLowerCase()
    return t.includes(c) && t.includes(a)
  })
}

/** Lo que se guarda de un documento leído. PURA — no toca ni la red ni el disco. */
export function entradaDeDocumento(doc, leido, lectura) {
  return {
    hash: doc.hash,
    url: doc.url,
    titulo: doc.titulo,
    nombre: String(doc.titulo ?? '').split('/').pop(),
    formato: leido.formato,
    bytes: leido.bytes,
    abierto: leido.ok === true,
    porQueNoSeAbrio: leido.ok ? null : (leido.porQue ?? null),
    pestanas: leido.pestanas ?? null,
    texto: leido.texto ? String(leido.texto).slice(0, MAX_TEXTO) : null,
    textoRecortado: leido.texto ? String(leido.texto).length > MAX_TEXTO : false,
    lectura: lecturaGuardable(lectura),
  }
}

/** La lectura semántica, recortada a lo que el motor consume. PURA. */
const lecturaGuardable = (l) => {
  if (!l) return null
  if (!l.ok) return { ok: false, porQue: l.porQue }
  return {
    ok: true, hoja: l.hoja, clase: l.clase, porQue: l.porQue,
    encabezado: { fila: l.encabezado.fila, columnas: l.encabezado.columnas },
    items: l.items, rubros: l.rubros, cierre: l.cierre, notas: l.notas,
  }
}

export async function estudiar({ cliente, ambito, biblioteca, google }) {
  const entradas = []
  for (const d of documentosDelAmbito(biblioteca, { cliente, ambito })) {
    const nombre = String(d.titulo).split('/').pop()
    const id = driveIdDe(d.url)
    if (!id) { entradas.push({ hash: d.hash, url: d.url, titulo: d.titulo, nombre, abierto: false, porQueNoSeAbrio: 'el documento no trae un id de Drive en su url', lectura: null }); continue }
    let bytes
    try { bytes = await google.descargarBytes(id) } catch (e) {
      entradas.push({ hash: d.hash, url: d.url, titulo: d.titulo, nombre, abierto: false, porQueNoSeAbrio: `no se pudo bajar: ${String(e?.message ?? e).slice(0, 160)}`, lectura: null }); continue
    }
    const leido = await leerArchivo(bytes, { nombre })
    const lectura = leido.ok && leido.hojas ? leerLibro(leido.hojas, { nombre }) : null
    entradas.push(entradaDeDocumento(d, leido, lectura))
  }
  return {
    version: 1, cliente, ambito,
    obtenidoEn: new Date().toISOString().slice(0, 10),
    fuente: 'Google Drive · administracion/PRESUPUESTOS - CLIENTES',
    documentos: entradas,
  }
}

async function main() {
  const cliente = arg('cliente')
  const ambito = arg('ambito')
  const salida = arg('salida')
  if (!cliente || !ambito || !salida) { console.error('faltan --cliente=, --ambito= y --salida='); process.exit(2) }
  const biblioteca = JSON.parse(fs.readFileSync(path.join(DIR_DATOS, 'biblioteca.json'), 'utf8'))
  const r = await estudiar({ cliente, ambito, biblioteca, google: makeGoogleClient() })
  const abiertos = r.documentos.filter((d) => d.abierto).length
  const conGrilla = r.documentos.filter((d) => d.lectura?.ok).length
  console.log(`${r.documentos.length} documento(s) · ${abiertos} abierto(s) · ${conGrilla} con grilla de cotización`)
  for (const d of r.documentos) console.log(` ${d.abierto ? 'ok' : 'NO'} ${String(d.formato ?? '?').padEnd(9)} ${d.lectura?.ok ? `${d.lectura.items.length} ítem(s)` : String(d.lectura?.porQue ?? d.porQueNoSeAbrio ?? 'sin grilla de cotización').slice(0, 60)} :: ${d.nombre}`)
  if (process.argv.includes('--dry')) { console.log('--dry: no se escribió nada'); return }
  fs.writeFileSync(path.join(DIR_DATOS, salida), `${JSON.stringify(r, null, 1)}\n`)
  console.log(`escrito: orquestador/datos/conocimiento/${salida}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
