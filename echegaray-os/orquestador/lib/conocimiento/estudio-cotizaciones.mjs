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
import { practicas } from './practica-cotizacion.mjs'
import { aConocimientoHistorico, aConocimientoInsuficienciaMetalica, registrosHistoricos } from './practica-historica.mjs'
import { pasarControles, paso } from './controles-cotizacion.mjs'
import { celdasRotasDe } from './hallazgos-celdas.mjs'
import { resumen } from './hallazgo.mjs'
import { aprendizajes } from './aprendizaje-cotizacion.mjs'
import { CLASE_PLANILLA, leerLibro } from './planilla-semantica.mjs'
import { ADVERTENCIA_CLIENTE, practicasCliente } from './practica-cotizacion-cliente.mjs'

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
  const partes = carpetasUtiles(ruta)
  if (!partes.utiles.length) return partes.todas[partes.todas.length - 1] ?? String(ruta)
  const cliente = partes.utiles[0]
  const carpeta = partes.utiles[partes.utiles.length - 1]
  return carpeta === cliente ? cliente : `${cliente} · ${carpeta}`
}

const carpetasUtiles = (ruta) => {
  const todas = String(ruta).split('/').filter(Boolean).slice(0, -1)
  return { todas, utiles: todas.filter((x) => !CARPETAS_GENERICAS.includes(x)) }
}

/**
 * EL CLIENTE QUE NOMBRA ESTA RUTA, o `null` si la ruta no lo dice. PURA.
 *
 * Es la PRIMERA carpeta con nombre propio: en `administracion/PRESUPUESTOS - CLIENTES/ARCOR - SAN
 * JUAN/NUEVA CALLE/x.xlsm` el cliente es ARCOR y la obra es NUEVA CALLE. Devuelve `null` en vez de
 * quedarse con el cajón del archivo: un dataset que dice que el cliente se llama «PRESUPUESTOS -
 * CLIENTES» es peor que uno que declara el hueco.
 */
export const clienteDe = (ruta = '') => carpetasUtiles(ruta).utiles[0] ?? null

/**
 * EL ÍNDICE QUE PONE NOMBRE AL id DE DRIVE. PURA.
 *
 * Sin él, `1SCGIKahe….oferta` no dice de quién es. Se arma con las cotizaciones que devolvió el
 * estudio, o con los documentos de la biblioteca —cuya `url` termina en el mismo id—. El cliente
 * sale de la RUTA con la misma función que usa el estudio, no de leer la afirmación.
 */
export function indiceDeCotizaciones(cotizaciones = []) {
  const m = new Map()
  for (const c of cotizaciones) {
    const id = c.driveId ?? c.id
    if (!id) continue
    const ruta = c.ruta ?? c.titulo ?? null
    m.set(id, {
      archivo: c.nombre ?? (ruta ? ruta.split('/').pop() : null),
      ruta,
      cliente: ruta ? clienteDe(ruta) : null,
      obra: c.obra ?? (ruta ? obraDe(ruta) : null),
      // La fecha de modificación de Drive es la única que existe: la planilla no dice cuándo se
      // cotizó. `practica-historica.mjs` arma el período con esto y lo declara con ese nombre.
      modificado: c.modificado ?? null,
    })
  }
  return m
}

/** La obra en la que se midió el caso de insuficiencia del análisis metálico. */
const OBRA_DEL_CASO_METALICO = /JAVIER\s+SANCHEZ/i

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
    // El inventario de celdas rotas se calcula ACÁ y no río abajo porque es el único punto donde
    // están las hojas enteras en memoria. Guardar las hojas para calcularlo después serían 3,5 MB
    // por cotización viviendo hasta el final de la corrida; el inventario son unas decenas de filas.
    celdasRotas: celdasRotasDe(leido.hojas),
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
  // ═══ LOS HALLAZGOS SALEN DE LOS CONTROLES, NO DE UNA SEGUNDA LLAMADA ═══
  //
  // `pasarControles()` corre las MISMAS 14 reglas que `hallazgos()` y además contesta, por control,
  // si pudo mirar. Llamar a las dos dejaría dos caminos que calculan lo mismo y que se separan en
  // silencio la primera vez que alguien agregue una regla a uno solo. Se llama a uno, y el otro
  // —`hallazgos()`— queda para quien sólo quiera la lista.
  //
  // Diferencia declarada respecto de la corrida anterior: con `iva-escrito-a-mano` sin cobertura,
  // este camino NO publica el hallazgo. Son los 12 de 13 falsos positivos que producía un lector
  // sin `cellFormula`, y ahora salen contados como NO_SE_PUDO_MIRAR en vez de como defecto.
  const controles = pasarControles(cotizaciones, opciones)
  const h = controles.hallazgos
  // Las prácticas salen con su procedencia propia —PRACTICA_HISTORICA_ECSAS— y con frecuencia,
  // período, archivos, clientes y variabilidad. Antes salían como EXPERIENCIA_ECSAS, que significa
  // «lo medimos ejecutando»: un coeficiente tipeado en una planilla no se midió ejecutando.
  const historicos = registrosHistoricos(p, {
    porCotizacion: indiceDeCotizaciones(cotizaciones),
    totalCotizaciones: cotizaciones.length,
  })
  // Sólo las que el lector semántico clasificó COTIZACION: un CERTIFICADO tiene la misma forma y sus
  // cantidades son las EJECUTADAS, así que enseñaría una práctica que nadie decidió al cotizar.
  const soloCotizaciones = cliente.filter((c) => c.clase === CLASE_PLANILLA.COTIZACION)
  const pc = practicasCliente(soloCotizaciones)
  // La planilla entregada pasa por EL MISMO registro histórico que la plantilla interna. No es una
  // comodidad: si tuviera su propio camino a la biblioteca, sería el segundo, y el segundo camino es
  // exactamente lo que dejó 190 prácticas marcadas «lo medimos ejecutando» sin que nadie lo notara.
  const historicosCliente = registrosHistoricos(pc.practicas, {
    porCotizacion: indiceDeCotizaciones(cliente),
    totalCotizaciones: soloCotizaciones.length,
    advertencia: ADVERTENCIA_CLIENTE,
  })
  return {
    cotizaciones, cliente, noLeidos, salteados,
    practicas: p,
    practicasCliente: pc,
    historicosCliente,
    historicos,
    controles,
    paso: paso(controles),
    conocimientos: [
      ...historicos.map((r) => aConocimientoHistorico(r, { fecha: obtenidoEn })),
      // El caso metálico es una observación sobre UNA cotización medida, no una regla que valga
      // para cualquier tanda: entra a la biblioteca sólo si esa cotización está en esta corrida.
      // Emitirlo siempre estamparía la biblioteca con algo que la corrida no miró.
      ...(cotizaciones.some((c) => OBRA_DEL_CASO_METALICO.test(String(c.obra ?? '')))
        ? [aConocimientoInsuficienciaMetalica({ fecha: obtenidoEn })] : []),
      // Y lo que se aprende de los defectos, que NUNCA es su número: la forma del defecto, con el
      // control que lo detecta. Va a la MISMA biblioteca; no hay una segunda base de aprendizajes.
      ...aprendizajes(h, { fecha: obtenidoEn }),
      ...historicosCliente.map((r) => aConocimientoHistorico(r, { fecha: obtenidoEn })),
    ],
    documentos: [...cotizaciones, ...cliente].map((c) => documentoDe(c, { hubuoConocimiento: p.length > 0 || pc.practicas.length > 0, obtenidoEn }))
      .concat(noLeidos.filter((c) => c.hash).map((c) => documentoDe(c, { hubuoConocimiento: false, obtenidoEn }))),
    hallazgos: h,
    resumen: resumen(h),
  }
}
