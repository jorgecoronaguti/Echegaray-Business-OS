// LA CADENA COMPLETA DE UNA COTIZACIÓN: bytes → hash → parseo → lectura → práctica y hallazgos.
//
// ═══ POR QUÉ EL HASH VA PRIMERO ═══
//
// Es la llave de idempotencia. Un archivo ya estudiado no se vuelve a estudiar aunque lo hayan
// movido de carpeta o renombrado, y el mismo archivo subido dos veces con dos nombres es UNO. Sin
// eso, cada corrida vuelve a bajar 50 MB y a rehacer el mismo trabajo.
//
// ═══ LO QUE NO SE PUDO ABRIR NO DESAPARECE ═══
//
// Vuelve en `noLeidos` con su motivo. Esa lista es la respuesta a «¿leíste todo?»; sin ella, un
// informe que diga «14 cotizaciones estudiadas» no permite saber si eran 14 o 40.
import { HOJA, leerAnalisis, leerGastosGenerales, leerOferta, leerPresupuesto } from './cotizacion-ecsas.mjs'
import { leerArchivo } from './leer-archivo.mjs'
import { ETAPA, documento } from './biblioteca.mjs'
import { aConocimientos, practicas } from './practica-cotizacion.mjs'
import { hallazgos, resumen } from './hallazgos-cotizacion.mjs'

/** ¿Este archivo tiene forma de cotización interna de ECSAS? Se decide por sus PESTAÑAS, no por su
 *  nombre: hay `COTIZACION INTERNA.xlsx` que no lo son y planillas con otro nombre que sí. PURA. */
export const esCotizacionInterna = (pestanas = []) => {
  const p = new Set(pestanas)
  return p.has(HOJA.ANALISIS) && p.has(HOJA.PRESUPUESTO) && p.has(HOJA.GG)
}

/** Las carpetas que NO nombran una obra: son cajones del archivo, no el trabajo cotizado. */
export const CARPETAS_GENERICAS = Object.freeze([
  'administracion', 'PRESUPUESTOS - CLIENTES', 'COTIZACION INTERNA', 'COTIZACION INTERNA ',
  'Cotizacion Interna', 'Cotizacion interna', 'Cotizaciones Internas', 'DOCUMENTOS INTERNOS',
  'Viejo', 'Archivos Viejos', 'Archivos viejos', 'ARCHIVOS VIEJOS', 'OPCION 2 - FINAL',
])

/**
 * LA OBRA QUE COTIZA ESTE ARCHIVO. PURA.
 *
 * Importa más de lo que parece: `madurezDe` cuenta OBRAS DISTINTAS, no archivos. La primera versión
 * tomaba el segundo segmento de la ruta y devolvía «PRESUPUESTOS - CLIENTES» para las quince
 * cotizaciones — o sea, UNA obra, y toda práctica habría quedado en madurez A para siempre.
 */
export function obraDe(ruta = '') {
  const partes = String(ruta).split('/').filter(Boolean).slice(0, -1)
  const utiles = partes.filter((x) => !CARPETAS_GENERICAS.includes(x))
  if (!utiles.length) return partes[partes.length - 1] ?? String(ruta)
  const cliente = utiles[0]
  const carpeta = utiles[utiles.length - 1]
  return carpeta === cliente ? cliente : `${cliente} · ${carpeta}`
}

/** Estudia UN archivo. Devuelve la cotización leída, o el motivo por el que no se pudo. */
export async function estudiarUno({ bytes, nombre, ruta = null, driveId = null, mime = null, modificado = null }) {
  const leido = await leerArchivo(bytes, { nombre, mime })
  const base = { id: driveId ?? nombre, nombre, ruta, driveId, hash: leido.hash, formato: leido.formato, bytes: leido.bytes }
  if (!leido.ok) return { ...base, ok: false, porQue: leido.porQue, necesitaOcr: Boolean(leido.necesitaOcr) }
  if (!leido.hojas) return { ...base, ok: false, porQue: 'no es una planilla: la cotización interna de ECSAS vive en un libro de Excel' }
  if (!esCotizacionInterna(leido.pestanas)) {
    return { ...base, ok: false, pestanas: leido.pestanas, porQue: `la planilla no tiene las pestañas ${HOJA.ANALISIS}/${HOJA.PRESUPUESTO}/${HOJA.GG}: no es la plantilla de cotización interna` }
  }
  return {
    ...base, ok: true,
    obra: obraDe(ruta ?? nombre),
    modificado,
    pestanas: leido.pestanas,
    formulas: leido.formulas,
    oferta: leerOferta(leido.hojas[HOJA.OFERTA] ?? []),
    presupuesto: leerPresupuesto(leido.hojas[HOJA.PRESUPUESTO] ?? []),
    analisis: leerAnalisis(leido.hojas[HOJA.ANALISIS] ?? []),
    gg: leerGastosGenerales(leido.hojas[HOJA.GG] ?? []),
  }
}

/** La ficha de documento que va a la biblioteca. `ESTUDIADO` sólo si salió conocimiento de él. PURA. */
export function documentoDe(cot, { hubuoConocimiento = true, obtenidoEn = null } = {}) {
  return documento({
    fuenteId: 'drive-administracion',
    url: cot.driveId ? `https://drive.google.com/file/d/${cot.driveId}` : null,
    titulo: cot.ruta ?? cot.nombre,
    hash: cot.hash,
    formato: cot.formato,
    obtenidoEn,
    etapa: cot.ok && hubuoConocimiento ? ETAPA.ESTUDIADO : ETAPA.NO_LEIDO,
    porQue: cot.ok ? null : cot.porQue,
  })
}

/**
 * ESTUDIA UNA TANDA. Devuelve la práctica, los hallazgos y lo que no se pudo leer.
 *
 * `traer` es una función `(archivo) => Promise<Buffer>`: quién baja los bytes no es asunto de este
 * módulo, y así el circuito entero se puede probar sin tocar Drive.
 */
export async function estudiarTanda(archivos = [], { traer, yaEstudiado = () => false, obtenidoEn = null, opciones = {} } = {}) {
  const cotizaciones = []
  const noLeidos = []
  const salteados = []
  for (const a of archivos) {
    if (a.hash && yaEstudiado(a.hash)) { salteados.push({ ...a, porQue: 'ya estudiado: el contenido no cambió' }); continue }
    let bytes
    try { bytes = await traer(a) } catch (e) { noLeidos.push({ ...a, porQue: `no se pudo bajar: ${String(e?.message ?? e).slice(0, 160)}` }); continue }
    const r = await estudiarUno({ ...a, bytes })
    if (r.ok) cotizaciones.push(r)
    else noLeidos.push(r)
  }
  const p = practicas(cotizaciones, opciones)
  const h = hallazgos(cotizaciones, opciones)
  return {
    cotizaciones, noLeidos, salteados,
    practicas: p,
    conocimientos: aConocimientos(p, { fecha: obtenidoEn }),
    documentos: cotizaciones.map((c) => documentoDe(c, { hubuoConocimiento: p.length > 0, obtenidoEn }))
      .concat(noLeidos.filter((c) => c.hash).map((c) => documentoDe(c, { hubuoConocimiento: false, obtenidoEn }))),
    hallazgos: h,
    resumen: resumen(h),
  }
}
