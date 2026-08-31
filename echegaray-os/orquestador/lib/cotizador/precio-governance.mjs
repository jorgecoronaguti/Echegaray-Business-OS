// QUÉ PUEDE HACER UN PRECIO DE INTERNET — la regla que la auditoría marcó como crítica.
//
// ═══ LA FRASE QUE ESTE MÓDULO HACE CUMPLIR ═══
//
// «Un precio de internet JAMÁS puede convertir por sí solo una cotización desconocida en oferta
// defendible.»
//
// Prohibir la web entera sería tirar la única fuente que el sistema puede consultar solo a las tres
// de la mañana. Aceptarla sin condiciones sería firmar ofertas con el precio de una publicación que
// nadie controla. La salida no es un booleano: es una GRADACIÓN, y cada escalón tiene que decir QUÉ
// REGLA o QUIÉN lo autorizó.
//
//   INFORMAR — el número se muestra al lado del hueco. NO entra al costo. Es lo mínimo que una
//              observación web siempre puede hacer: existir y ser citable.
//   PROPONER — el número entra al costo como PROPUESTO y la oferta NO se puede congelar sobre él.
//              El total se ve, se puede discutir, y la firma sigue pendiente.
//   RESOLVER — el número entra al costo y NO frena el congelado. Sólo con evidencia suficiente Y
//              una autorización registrada.
//
// ═══ LO QUE NUNCA PASA, ESCRIBA LO QUE ESCRIBA LA PÁGINA ═══
//
//   · Una observación web nunca se vuelve EXPERIENCIA_ECSAS. Eso lo impide `precio-observacion.mjs`
//     en el constructor; acá no hay ningún camino que lo intente.
//   · Una autorización HUMANA nunca se fabrica. `firmadaPor` no tiene default, no se rellena con
//     «sistema», y una autorización humana sin firmante **tira** en `aplicar()`. Si el sistema
//     quiere avanzar solo, tiene que hacerlo con una REGLA que se pueda leer y discutir — no
//     poniéndose el nombre de una persona.
//   · Una sola página nunca RESUELVE algo material. Hacen falta dos observaciones independientes
//     que coincidan, o una fuente de FABRICANTE. Una lista suelta de un comercio cualquiera
//     informa; no cierra una oferta de millones.
//
// ═══ POR QUÉ LA POLÍTICA ESTÁ VERSIONADA ═══
//
// El día que el dueño diga «para materiales de menos de $50.000 aceptá una sola fuente web», eso es
// un cambio de POLÍTICA, no de código. Tiene que quedar escrito con versión y fecha al lado de cada
// precio que se aplicó bajo esa versión — si no, dentro de un año nadie puede decir con qué reglas
// se armó una oferta vieja.

import { TIPO_FUENTE, esExperienciaEcsas } from './precio-observacion.mjs'
import { NOMBRE_AUTORIDAD } from '../plano/investigacion.mjs'

/** Qué puede hacer una observación con el costo. El orden es creciente en consecuencia. */
export const PODER = Object.freeze({
  INFORMAR: 'INFORMAR',
  PROPONER: 'PROPONER',
  RESOLVER: 'RESOLVER',
})

/**
 * LA POLÍTICA VIGENTE. Versionada, con fecha y con quién la aprobó.
 *
 * `aprobadaPor: null` NO es un descuido: al 31/08/2026 el dueño no firmó esta política todavía, y
 * escribir su nombre acá sería exactamente la firma fabricada que el módulo existe para impedir.
 * Mientras siga en null, `RESOLVER` sobre material NO se concede — ver `LIMITE_SIN_APROBACION`.
 */
export const POLITICA_WEB = Object.freeze({
  id: 'PRECIO_WEB',
  version: 1,
  desde: '2026-08-31',
  aprobadaPor: null,
  /** Cuántas observaciones web independientes tienen que coincidir para que una fuente no-fabricante
   *  pueda resolver. Dos comercios distintos que publican el mismo número son dos hechos; uno solo
   *  es una publicación. */
  fuentesIndependientesParaResolver: 2,
  /** Cuánto se pueden separar dos observaciones y seguir contando como coincidentes. 15% es el orden
   *  del descuento comercial habitual: por encima de eso no están describiendo el mismo precio. */
  dispersionMaximaParaCoincidir: 0.15,
  /** Cuántos días de antigüedad tolera una lectura web antes de dejar de proponer. Una página leída
   *  hace tres meses no dice lo que dice hoy y nadie nos avisa cuando cambia. */
  antiguedadMaximaDias: 30,
})

/** Lo que la política NO puede conceder mientras nadie la haya aprobado. Sin firma del dueño, la web
 *  puede PROPONER —el número se ve, el total se calcula, la oferta no se congela— y nada más. */
export const LIMITE_SIN_APROBACION = PODER.PROPONER

/**
 * QUÉ PUEDE HACER ESTA OBSERVACIÓN. PURA. Devuelve `{poder, porQue, requisitos}`.
 *
 * `material` viene de `precio-materialidad.mjs`: la misma señal que decide si un issue frena la
 * oferta decide si una fuente web alcanza. Un precio web de un recurso que mueve el 0,01% del costo
 * no necesita el mismo respaldo que uno que mueve el 9%.
 */
export function poderDeObservacion({
  observacion = null, coincidencias = [], material = true, autoridad = null,
  politica = POLITICA_WEB, hoy = new Date(),
} = {}) {
  if (!observacion) return { poder: PODER.INFORMAR, porQue: 'no hay observación', requisitos: [] }

  // Las fuentes internas no pasan por esta puerta: no son «precio de internet». Se dice explícito
  // para que quede claro que la puerta es SÓLO para lo externo, y no un filtro universal disfrazado.
  if (esExperienciaEcsas(observacion.tipoFuente) || observacion.tipoFuente === TIPO_FUENTE.CATALOGO_INTERNO) {
    return { poder: PODER.RESOLVER, porQue: `${observacion.tipoFuente} no es un precio de internet: esta política no lo gobierna`, requisitos: [] }
  }

  const requisitos = []
  const exigir = (ok, nombre, porQue) => { requisitos.push({ requisito: nombre, cumple: Boolean(ok), porQue }); return Boolean(ok) }

  const edad = Math.floor((Date.parse(`${String(hoy instanceof Date ? hoy.toISOString().slice(0, 10) : hoy)}T00:00:00Z`)
    - Date.parse(`${observacion.observadoEn}T00:00:00Z`)) / 86_400_000)
  const fresca = exigir(edad >= 0 && edad <= politica.antiguedadMaximaDias, 'FRESCURA',
    `leída hace ${edad} día(s); la política admite ${politica.antiguedadMaximaDias}`)
  const conIva = exigir(observacion.iva !== 'NO_DECLARADO', 'IVA_DECLARADO',
    observacion.iva === 'NO_DECLARADO' ? 'la fuente no dice si el precio lleva IVA: son 21% que nadie decidió' : `la fuente declara ${observacion.iva}`)
  const conJurisdiccion = exigir(Boolean(observacion.jurisdiccion), 'JURISDICCION',
    observacion.jurisdiccion ? `rige en ${observacion.jurisdiccion}` : 'no se sabe dónde rige este precio')

  const esFabricante = observacion.tipoFuente === TIPO_FUENTE.FABRICANTE
    || String(autoridad ?? '').toUpperCase() === 'FABRICANTE'
  const independientes = contarIndependientes({ observacion, coincidencias, politica })
  const respaldo = exigir(esFabricante || independientes >= politica.fuentesIndependientesParaResolver, 'RESPALDO',
    esFabricante
      ? 'la fuente es el fabricante o distribuidor oficial: no necesita segunda opinión'
      : `${independientes} fuente(s) web independientes coinciden dentro del ${politica.dispersionMaximaParaCoincidir * 100}%; hacen falta ${politica.fuentesIndependientesParaResolver}`)

  if (!fresca || !conIva) {
    return { poder: PODER.INFORMAR, politica: resumen(politica), requisitos, autoridad,
      porQue: `sólo INFORMA: ${requisitos.filter((r) => !r.cumple).map((r) => r.porQue).join(' · ')}. Un número que no se puede netear ni fechar no entra a un costo` }
  }
  if (!respaldo || !conJurisdiccion) {
    return { poder: PODER.PROPONER, politica: resumen(politica), requisitos, autoridad,
      porQue: `PROPONE y no resuelve: ${requisitos.filter((r) => !r.cumple).map((r) => r.porQue).join(' · ')}. Entra al costo como propuesto y NO deja congelar` }
  }
  // ═══ EL TECHO QUE NADIE PUEDE SALTAR SIN FIRMA ═══
  //
  // Todo se cumple, y aun así: mientras la política no esté aprobada por el dueño, un precio web de
  // algo MATERIAL no resuelve. La condición no es sobre la página: es sobre quién se hace cargo de
  // la regla que la acepta.
  if (material && !politica.aprobadaPor) {
    return { poder: LIMITE_SIN_APROBACION, politica: resumen(politica), requisitos, autoridad,
      porQue: `cumple todos los requisitos técnicos PERO mueve plata material y la política ${politica.id} v${politica.version} todavía no la aprobó nadie: el techo sin aprobación es ${LIMITE_SIN_APROBACION}` }
  }
  return { poder: PODER.RESOLVER, politica: resumen(politica), requisitos, autoridad,
    porQue: material
      ? `resuelve por la política ${politica.id} v${politica.version} aprobada por ${politica.aprobadaPor}: ${requisitos.map((r) => r.porQue).join(' · ')}`
      : `resuelve: el recurso NO es material (${requisitos.filter((r) => r.cumple).length}/${requisitos.length} requisitos) y frenar una oferta por él costaría más de lo que protege` }
}

const resumen = (p) => Object.freeze({ id: p.id, version: p.version, desde: p.desde, aprobadaPor: p.aprobadaPor })

/** Cuántas fuentes web DISTINTAS dicen lo mismo. Dos páginas del mismo dominio no son dos fuentes:
 *  es la misma lista publicada dos veces, y contarlas como dos convierte un eco en confirmación. */
export function contarIndependientes({ observacion, coincidencias = [], politica = POLITICA_WEB } = {}) {
  const dominio = (u) => { try { return new URL(String(u)).hostname.replace(/^www\./, '') } catch { return null } }
  const propio = dominio(observacion.url)
  const vistos = new Set(propio ? [propio] : [])
  for (const c of coincidencias) {
    if (c.moneda !== observacion.moneda) continue
    const d = dominio(c.url)
    if (!d || vistos.has(d)) continue
    const dif = Math.abs(c.valor - observacion.valor) / Math.max(c.valor, observacion.valor)
    if (dif <= politica.dispersionMaximaParaCoincidir) vistos.add(d)
  }
  return vistos.size
}

/**
 * LA AUTORIZACIÓN — el papel que `aplicar()` exige. PURA.
 *
 * Dos tipos y ninguno más:
 *
 *   REGLA  — la autoriza `poderDeObservacion` con la política que la concedió. Se puede leer, se
 *            puede discutir y se puede revocar cambiando la política.
 *   HUMANO — la firma una persona. `firmadaPor` es OBLIGATORIO y viene de afuera: este módulo no
 *            tiene manera de conocerlo, que es precisamente la garantía de que no lo inventa.
 */
export function autorizacion({ observacion = null, veredicto = null, firmadaPor = null } = {}) {
  if (!observacion) throw new Error('no se puede autorizar la aplicación de nada')
  if (firmadaPor) {
    return Object.freeze({
      permite: true, autorizadoPorTipo: 'HUMANO', autorizadoPor: String(firmadaPor), firmadaPor: String(firmadaPor),
      observacionHash: observacion.hash, politica: veredicto?.politica ?? null,
      porQue: `${firmadaPor} se hace cargo de este precio${veredicto ? ` (la regla sólo daba ${veredicto.poder})` : ''}`,
    })
  }
  const permite = veredicto?.poder === PODER.RESOLVER
  return Object.freeze({
    permite,
    autorizadoPorTipo: 'REGLA',
    autorizadoPor: veredicto?.politica ? `${veredicto.politica.id} v${veredicto.politica.version}` : 'SIN_POLITICA',
    // Explícitamente null y no una cadena: quien lea esto tiene que ver que NADIE firmó.
    firmadaPor: null,
    observacionHash: observacion.hash,
    politica: veredicto?.politica ?? null,
    porQue: permite ? veredicto.porQue : `NO autorizada: la regla sólo concede ${veredicto?.poder ?? 'INFORMAR'} — ${veredicto?.porQue ?? 'sin veredicto'}`,
  })
}

/**
 * ¿SE PUEDE CONGELAR UNA OFERTA QUE SE APOYA EN ESTE PRECIO? PURA.
 *
 * Es la pregunta que hace la diferencia entre «el sistema calculó un total» y «el sistema afirma un
 * precio». Un `PROPONER` deja ver el total y NO deja congelarlo, y ésa es exactamente la mitad que
 * el pedido reclama: informar sí, cerrar no.
 */
export const puedeCongelarSobre = (veredicto) => veredicto?.poder === PODER.RESOLVER

/** ¿Entra al costo? INFORMAR no; PROPONER y RESOLVER sí, con estados distintos. PURA. */
export const entraAlCosto = (veredicto) => veredicto?.poder === PODER.PROPONER || veredicto?.poder === PODER.RESOLVER

export { NOMBRE_AUTORIDAD }
