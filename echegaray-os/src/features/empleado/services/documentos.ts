// MIS DOCUMENTOS — los seis estados del handoff, sobre la lógica que ya existía.
//
// `features/mi-cuenta/services/documentos.ts` ya resuelve el estado DEL PAPEL (vigente, por vencer,
// vencido, falta) y su vocabulario de categorías. NO se duplica: se importa. Lo que agrega este
// archivo es la otra mitad, que antes no existía — QUÉ PASÓ CON LO QUE EL EMPLEADO SUBIÓ.
//
// ═══ POR QUÉ LA PRESENTACIÓN GANA SOBRE EL PAPEL ═══
//
// Si alguien subió la foto ayer, su apto médico sigue vencido en `documentacion_legajo` —y lo va a
// seguir estando hasta que Administración apruebe—. Pero decirle «vencido» al que ya lo mandó es
// pedirle por segunda vez lo que ya hizo, y a la tercera deja de mandar nada. El papel dice la
// verdad del legajo; la presentación dice la verdad de lo que le toca hacer a ÉL. En su pantalla
// manda la segunda, y el papel se sigue viendo debajo.

import { estadoDe } from '../../mi-cuenta/services/documentos.ts'
import type { EstadoPresentacion } from '../types'

export type EstadoEnPantalla =
  | 'vigente' | 'por_vencer' | 'vencido' | 'solicitado' | 'en_revision' | 'requiere_correccion'

export interface DocumentoDelEmpleado {
  id: string
  tipo_documento: string
  nombre: string | null
  presente: boolean
  drive_file_id: string | null
  fecha_documento: string | null
  fecha_vencimiento: string | null
  presentacion_id: string | null
  presentacion_estado: EstadoPresentacion | null
  motivo_revision: string | null
  presentado_en: string | null
  revisado_en: string | null
  presentado_nombre: string | null
}

export const ESTADO_LABEL: Record<EstadoEnPantalla, string> = {
  vigente: 'Vigente',
  por_vencer: 'Por vencer',
  vencido: 'Vencido',
  solicitado: 'Solicitado',
  en_revision: 'Pendiente de revisión',
  requiere_correccion: 'Requiere corrección',
}

/** El tono lo fija el handoff: vencido y requiere corrección en `neg`; por vencer y solicitado en
 *  `warn`; en revisión en gris; vigente en `pos`. */
export const ESTADO_TONO: Record<EstadoEnPantalla, 'pos' | 'neg' | 'warn' | 'pendiente'> = {
  vigente: 'pos',
  por_vencer: 'warn',
  vencido: 'neg',
  solicitado: 'warn',
  en_revision: 'pendiente',
  requiere_correccion: 'neg',
}

export function estadoEnPantalla(d: DocumentoDelEmpleado, hoy: string): EstadoEnPantalla {
  if (d.presentacion_estado === 'requiere_correccion') return 'requiere_correccion'
  if (d.presentacion_estado === 'en_revision') return 'en_revision'
  const papel = estadoDe(d, hoy)
  return papel === 'falta' ? 'solicitado' : papel
}

/** ¿Se puede subir algo acá? Todo lo que no está aprobado y vigente. Un documento vigente también
 *  se puede reemplazar —una constancia nueva antes de que venza la vieja— y por eso la acción no
 *  desaparece: cambia de primaria a discreta. */
export function accionDe(e: EstadoEnPantalla): { texto: string; primaria: boolean } {
  switch (e) {
    case 'requiere_correccion': return { texto: 'Volver a subir', primaria: true }
    case 'solicitado': return { texto: 'Subir', primaria: true }
    case 'vencido': return { texto: 'Subir', primaria: true }
    case 'por_vencer': return { texto: 'Actualizar', primaria: true }
    case 'en_revision': return { texto: 'Ver lo enviado', primaria: false }
    default: return { texto: 'Reemplazar', primaria: false }
  }
}

/** Cuántos le PIDEN al empleado hacer algo. Lo que está en revisión NO cuenta: ya hizo su parte y
 *  contarlo lo mandaría a subir de nuevo lo mismo. */
export function pendientes(docs: DocumentoDelEmpleado[], hoy: string): number {
  return docs.filter((d) => {
    const e = estadoEnPantalla(d, hoy)
    return e === 'solicitado' || e === 'vencido' || e === 'requiere_correccion'
  }).length
}

/** El aviso en una línea, o `null` cuando no hay nada que pedir. `null` y no «todo en orden»: un
 *  cartel verde permanente entrena a la gente a no leerlo. */
export function avisoDeDocumentos(docs: DocumentoDelEmpleado[], hoy: string): string | null {
  const n = pendientes(docs, hoy)
  if (n === 0) return null
  return n === 1 ? 'Te falta 1 documento' : `Te faltan ${n} documentos`
}

/** Lo que hay que hacer arriba. Dentro de cada grupo, lo que vence antes. */
export function ordenar(docs: DocumentoDelEmpleado[], hoy: string): DocumentoDelEmpleado[] {
  const peso: Record<EstadoEnPantalla, number> = {
    requiere_correccion: 0, vencido: 1, solicitado: 2, por_vencer: 3, en_revision: 4, vigente: 5,
  }
  return [...docs].sort((a, b) => {
    const d = peso[estadoEnPantalla(a, hoy)] - peso[estadoEnPantalla(b, hoy)]
    if (d !== 0) return d
    return (a.fecha_vencimiento ?? '9999-12-31').localeCompare(b.fecha_vencimiento ?? '9999-12-31')
  })
}

/**
 * M08 — LOS PAPELES SE AGRUPAN POR PARA QUÉ SIRVEN, NO POR TIPO DE ARCHIVO.
 *
 * La nota del mockup: «Recibos, salud, personales: no por extensión de archivo». Ordenados por
 * `tipo_documento` alfabéticamente, el apto médico que vence en veinte días cae entre el DNI y el
 * carnet de conducir. Agrupados por para-qué-sirven, «Salud y seguridad» es un bloque que se mira
 * entero y donde un vencimiento salta.
 *
 * ═══ POR PALABRA Y NO POR DICCIONARIO CERRADO ═══
 *
 * El vocabulario de `tipo_documento` no está congelado: Administración da de alta tipos nuevos. Un
 * diccionario cerrado manda todo lo desconocido a «Personales» hasta que alguien se acuerde de
 * agregarlo, y ahí es donde se pierde un curso de altura vencido. La palabra hace el trabajo, y lo
 * que NO matchea cae en «Personales» —que es el grupo sin consecuencia de seguridad—, no al revés.
 */
export type GrupoDePapeles = 'salud' | 'personales'

const PALABRAS_DE_SALUD = /apto|medic|médic|salud|art\b|asegurad|curso|altura|segurid|induc|psicof|vacun|emergenc/i

export function grupoDe(tipoDocumento: string | null | undefined, nombre?: string | null): GrupoDePapeles {
  const texto = `${tipoDocumento ?? ''} ${nombre ?? ''}`
  return PALABRAS_DE_SALUD.test(texto) ? 'salud' : 'personales'
}

export const GRUPO_LABEL: Record<GrupoDePapeles, string> = {
  salud: 'Salud y seguridad',
  personales: 'Personales',
}

/** Los papeles de cada grupo, en el orden que ya decide `ordenar()`: lo que hay que hacer arriba. */
export function agrupar(
  docs: DocumentoDelEmpleado[], hoy: string,
): Record<GrupoDePapeles, DocumentoDelEmpleado[]> {
  const r: Record<GrupoDePapeles, DocumentoDelEmpleado[]> = { salud: [], personales: [] }
  for (const d of ordenar(docs, hoy)) r[grupoDe(d.tipo_documento, d.nombre)].push(d)
  return r
}

/**
 * EL RENGLÓN DE ESTADO DE M08 — «vence 12/09 · en 20 días», «vencido el 30/06», «vigente».
 *
 * El mockup escribe DOS cosas distintas para el mismo campo: «vence en 20 días» y «vencido el
 * 30/06». Son estados distintos y por eso se leen distinto —uno es una cuenta regresiva y el otro
 * un hecho consumado—, y esa diferencia es la que hace que alguien se mueva o no.
 */
export function notaDeVencimiento(
  d: DocumentoDelEmpleado, hoy: string,
): { texto: string; tono: 'faint' | 'warn' | 'neg' | 'pos' } {
  const e = estadoEnPantalla(d, hoy)
  if (e === 'en_revision') return { texto: 'enviado · esperando revisión', tono: 'faint' }
  if (e === 'requiere_correccion') return { texto: d.motivo_revision ?? 'requiere corrección', tono: 'neg' }
  if (e === 'solicitado') return { texto: 'te lo están pidiendo', tono: 'warn' }
  if (!d.fecha_vencimiento) return { texto: e === 'vigente' ? 'vigente' : ESTADO_LABEL[e].toLowerCase(), tono: e === 'vigente' ? 'faint' : 'warn' }
  const dias = diasEntre(hoy, d.fecha_vencimiento)
  const fecha = `${d.fecha_vencimiento.slice(8, 10)}/${d.fecha_vencimiento.slice(5, 7)}`
  if (dias < 0) return { texto: `vencido el ${fecha}`, tono: 'neg' }
  if (dias === 0) return { texto: `vence hoy, ${fecha}`, tono: 'neg' }
  if (e === 'por_vencer') return { texto: `vence ${fecha} · en ${dias} día${dias === 1 ? '' : 's'}`, tono: 'warn' }
  return { texto: `vigente hasta ${fecha}`, tono: 'faint' }
}

/** Días enteros entre dos fechas ISO, en UTC para que no se corra uno por el huso. */
function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86400000)
}
