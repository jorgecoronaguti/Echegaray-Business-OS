// LO QUE VUELVE DE UN DIÁLOGO DE MATTERMOST, traducido a una novedad válida.
//
// Un `dialog_submission` trae strings sueltos: la única defensa contra un dato inventado es
// normalizar y VALIDAR contra el catálogo real antes de guardar nada. Acá no se inventa una
// regla nueva: se normaliza el formulario y se le pregunta a `asistencia-motivos.mjs`.
//
// Los errores vuelven ATADOS AL CAMPO cuando se puede (`errors: {horas: '…'}`): Mattermost
// los pinta debajo del campo y el jefe corrige sin releer todo el diálogo. Un banner general
// arriba es el último recurso, no el primero.
//
// Puro: sin red, sin base.

import { normalizarHoras } from '../../lib/horas-extra.mjs'
import { interpretarFechaEscrita, validarFecha } from '../../lib/asistencia-servicio/fechas.mjs'
import { jornadaNumero } from './operaciones.mjs'
import { TIPO } from './mensaje.mjs'

/** Lo que se dice cuando el formulario tiene algo mal y ningún campo lo explica solo. */
export const REVISAR_FORMULARIO = 'Revisá los campos marcados y volvé a guardar.'

const texto = (v) => (v == null ? '' : String(v).trim())

/** Horas inválidas → frase, no código. */
function mensajeHoras(h) {
  if (h.motivo === 'negativo') return 'Las horas no pueden ser negativas.'
  if (h.motivo === 'mayor_al_maximo') return `Las horas no pueden superar ${h.max} en un día.`
  return 'Las horas tienen que ser un número (por ejemplo 9 u 8,5).'
}

/**
 * A qué campo del diálogo corresponde el reclamo del validador. El catálogo devuelve una
 * frase escrita para una persona, no un código; mapearla al campo es una heurística por
 * palabra, y cuando no se reconoce se muestra arriba en vez de colgarla del campo errado.
 */
function campoDelError(error) {
  const e = String(error ?? '').toLowerCase()
  if (e.includes('aclaraci')) return 'aclaracion'
  if (e.includes('hora')) return 'horas'
  if (e.includes('motivo') || e.includes('«')) return 'motivo'
  if (e.includes('obra')) return 'obra_realizada'
  return null
}

/** El error del validador, ya colgado del campo que corresponde. */
export function errorDeDialogo(error) {
  const campo = campoDelError(error)
  return campo ? { errors: { [campo]: error } } : { error }
}

/** Horas que declaró el diálogo. Vacío + jornada conocida ⇒ la jornada; sin jornada ⇒ se pide. */
function leerHoras({ presente, crudo, jornada }) {
  if (!presente) return { ok: true, horas: 0 }
  if (!texto(crudo)) {
    const jn = jornadaNumero(jornada)
    if (jn == null) {
      return { ok: false, errors: { horas: 'Ese día la planilla no define la jornada: poné las horas.' } }
    }
    return { ok: true, horas: jn }
  }
  const h = normalizarHoras(crudo)
  if (!h.ok) return { ok: false, errors: { horas: mensajeHoras(h) } }
  return { ok: true, horas: h.horas }
}

/**
 * `submission` → novedad guardable, o los errores por campo.
 *
 * @param {{motivos:{validarNovedad:Function}}} deps
 * @param {{submission:object, jornada:object, obrasValidas:Set<string>}} o
 * @returns {{ok:true, novedad:object}|{ok:false, errors?:object, error?:string}}
 */
export function novedadDeDialogo(deps, { submission = {}, jornada, obrasValidas, tipo = null } = {}) {
  // El TIPO viene del desplegable que abrió el formulario ("No vino" / "Hizo menos horas" /
  // "Hizo horas extra"), no de un campo que el jefe pueda contradecir. Por eso el formulario
  // de ausencia ni siquiera pregunta las horas: son 0 y punto.
  // Sin tipo (camino viejo, y los tests que lo ejercen) se sigue leyendo `presente`.
  const presente = tipo ? tipo !== 'ausencia' : texto(submission.presente).toLowerCase() !== 'no'
  const h = tipo === 'ausencia'
    ? { ok: true, horas: 0 }
    : leerHoras({ presente, crudo: submission.horas, jornada })
  if (!h.ok) return h
  const obra = texto(submission.obra_realizada) || null
  if (obra && obrasValidas && !obrasValidas.has(obra)) {
    return { ok: false, errors: { obra_realizada: 'Esa obra no figura en la planilla para esa fecha.' } }
  }
  const entrada = {
    presente, horas: h.horas, jornada: jornadaNumero(jornada),
    motivo: texto(submission.motivo) || null,
    aclaracion: texto(submission.aclaracion) || null,
    obra_realizada: obra,
  }
  const v = deps.motivos.validarNovedad(entrada)
  if (!v.ok) return { ok: false, ...errorDeDialogo(v.error) }
  return {
    ok: true,
    novedad: {
      presente, horas: h.horas,
      motivo: v.novedad?.motivo ?? null,
      aclaracion: v.novedad?.aclaracion ?? null,
      obra_realizada: v.novedad?.obra_realizada ?? null,
      sin_cambio: false,
    },
  }
}

/**
 * `submission` del diálogo "Otra fecha…" → fecha ISO válida y no futura.
 * @returns {{ok:true, fecha:string}|{ok:false, errors:object}}
 */
export function fechaDeDialogo({ submission = {}, hoy } = {}) {
  const iso = interpretarFechaEscrita(submission.fecha, { hoy })
  if (!iso) return { ok: false, errors: { fecha: 'No entendí esa fecha. Escribila como 30/07/2026.' } }
  const v = validarFecha(iso, { hoy })
  if (!v.ok) return { ok: false, errors: { fecha: v.error } }
  return { ok: true, fecha: v.fecha }
}

/** El estado que viaja en el diálogo. Es del cliente: se lee, no se cree. */
export function leerEstado(crudo) {
  if (!crudo) return {}
  try {
    const v = JSON.parse(String(crudo))
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

/**
 * La respuesta de error de un diálogo, SIEMPRE con una frase en castellano arriba.
 *
 * POR QUÉ (31/07). El cliente de Mattermost, cuando la respuesta trae sólo `errors` por campo,
 * pone de su cosecha un encabezado en inglés: "Submission failed with validation errors". Si en
 * cambio viene un `error` de primer nivel, muestra ESE texto. Así que se manda siempre uno: el
 * jefe de obra no tiene por qué leer inglés para entender qué corregir.
 */
export function errorDeFormulario(n) {
  const campos = n?.errors && Object.keys(n.errors).length ? n.errors : null
  const arriba = n?.error
    ?? (campos ? Object.values(n.errors).find((v) => typeof v === 'string') : null)
    ?? REVISAR_FORMULARIO
  return { ...(campos ? { errors: campos } : {}), error: arriba }
}

/**
 * Los motivos que corresponden a ESTE tipo, pedidos al catálogo — nunca una lista escrita acá.
 *
 * · ausencia → los de "no vino"
 * · parcial  → los de jornada incompleta (se pregunta por media hora menos que la jornada, que
 *              es la forma de decirle al catálogo "esto es una jornada parcial")
 * · extra    → NINGUNO: el núcleo calcula el extra y no hay novedad que explicar
 */
export function motivosDelTipo(d, tipo, jornada) {
  if (tipo === TIPO.EXTRA) return []
  if (tipo === TIPO.AUSENCIA) return d.motivos.motivosPara({ presente: false, horas: 0 })
  const j = Number.isFinite(jornada?.horas) && !jornada?.requiere_manual ? Number(jornada.horas) : null
  return d.motivos.motivosPara({ presente: true, horas: j == null ? null : j - 0.5, jornada: j })
}
