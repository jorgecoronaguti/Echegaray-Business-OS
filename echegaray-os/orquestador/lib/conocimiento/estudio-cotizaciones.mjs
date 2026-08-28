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
import { CLASE_PLANILLA, leerLibro } from './planilla-semantica.mjs'
import { practicasCliente } from './practica-cotizacion-cliente.mjs'
import { aConocimientos as aConocimientosPractica } from './practica-cotizacion.mjs'

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
    // ═══ NO ES LA PLANTILLA DE ECSAS: NO ES LO MISMO QUE NO SER UNA COTIZACIÓN ═══
    // Acá terminaban las 48 de ARCOR, con «formato diferente». El lector semántico busca el
    // encabezado por lo que DICE y lee la planilla venga como venga; lo que no reconoce sale con el
    // detalle de qué encabezados encontró, que es un motivo con el que se puede hacer algo.
    const cliente = leerLibro(leido.hojas, { nombre })
    if (!cliente.ok) {
      return { ...base, ok: false, pestanas: leido.pestanas, porQue: `no tiene las pestañas ${HOJA.ANALISIS}/${HOJA.PRESUPUESTO}/${HOJA.GG} de la plantilla interna, y el lector semántico tampoco reconoce una planilla de cotización: ${cliente.porQue}` }
    }
    return {
      ...base, ok: true, formatoCotizacion: 'CLIENTE',
      obra: obraDe(ruta ?? nombre), modificado, pestanas: leido.pestanas, formulas: leido.formulas,
      hoja: cliente.hoja, clase: cliente.clase, discrepancia: cliente.discrepancia,
      items: cliente.items, rubros: cliente.rubros, cierre: cliente.cierre, notas: cliente.notas,
      porQue: cliente.porQue,
    }
  }
  return {
    ...base, ok: true, formatoCotizacion: 'ECSAS',
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
export async function estudiarTanda(archivos = [], {
  traer, yaEstudiado = () => false, hashConocido = () => null, recordarHash = () => {},
  obtenidoEn = null, opciones = {},
} = {}) {
  const cotizaciones = []
  const cliente = []
  const noLeidos = []
  const salteados = []
  for (const a of archivos) {
    // ═══ LA IDEMPOTENCIA BARATA VA ANTES DE BAJAR ═══
    // El hash es del CONTENIDO y sólo se puede calcular con los bytes en la mano, así que saltear
    // «después de bajar» ahorra el estudio pero no los 3,5 MB. `hashConocido` recuerda el hash de
    // (archivo, fecha de modificación): si Drive dice que no se tocó, es el mismo contenido y no
    // hace falta traerlo. Si la fecha cambió, se baja y se vuelve a mirar.
    const conocido = await hashConocido(a)
    if (conocido && yaEstudiado(conocido)) { salteados.push({ ...a, hash: conocido, porQue: 'ya estudiado y sin cambios desde la última corrida' }); continue }
    let bytes
    try { bytes = await traer(a) } catch (e) { noLeidos.push({ ...a, porQue: `no se pudo bajar: ${String(e?.message ?? e).slice(0, 160)}` }); continue }
    const r = await estudiarUno({ ...a, bytes })
    await recordarHash(a, r.hash)
    if (r.hash && yaEstudiado(r.hash)) { salteados.push({ ...a, hash: r.hash, porQue: 'ya estudiado: el contenido es idéntico al de otra corrida' }); continue }
    if (!r.ok) { noLeidos.push(r); continue }
    if (r.formatoCotizacion === 'CLIENTE') cliente.push(r)
    else cotizaciones.push(r)
  }
  // Las dos familias NO se mezclan: la plantilla interna enseña cómo se arma el precio por dentro y
  // la planilla entregada enseña con qué coeficientes se cerró. Meterlas en la misma lista obligaría
  // a `practicas()` a entender dos formas distintas del mismo objeto, que es como se rompen las dos.
  const p = practicas(cotizaciones, opciones)
  const h = hallazgos(cotizaciones, opciones)
  // Sólo las que el lector semántico clasificó COTIZACION: un CERTIFICADO tiene la misma forma y sus
  // cantidades son las EJECUTADAS, así que enseñaría una práctica que nadie decidió al cotizar.
  const soloCotizaciones = cliente.filter((c) => c.clase === CLASE_PLANILLA.COTIZACION)
  const pc = practicasCliente(soloCotizaciones)
  return {
    cotizaciones, cliente, noLeidos, salteados,
    practicas: p,
    practicasCliente: pc,
    conocimientos: [...aConocimientos(p, { fecha: obtenidoEn }), ...aConocimientosPractica(pc.practicas, { fecha: obtenidoEn })],
    documentos: [...cotizaciones, ...cliente].map((c) => documentoDe(c, { hubuoConocimiento: p.length > 0 || pc.practicas.length > 0, obtenidoEn }))
      .concat(noLeidos.filter((c) => c.hash).map((c) => documentoDe(c, { hubuoConocimiento: false, obtenidoEn }))),
    hallazgos: h,
    resumen: resumen(h),
  }
}
