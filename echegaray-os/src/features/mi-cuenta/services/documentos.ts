// MIS DOCUMENTOS — qué papel tengo, cuál vence y cuál falta.
//
// ═══ LAS CATEGORÍAS SE SOPORTAN, NO SE SUPONEN ═══
//
// El handoff enumera DNI, constancias, ART, apto médico, capacitaciones, entrega de EPP,
// certificados y documentación laboral. La base ya tiene su vocabulario cerrado en
// `documentacion_legajo.tipo_documento` (14 valores, migración T3100) y ÉSE es el que manda: acá
// sólo se traduce a la palabra que usa la gente. Inventar una segunda lista de categorías sería
// tener dos vocabularios para lo mismo, y el día que difieran nadie sabría cuál es el bueno.
//
// Y NO SE ASUME QUE EXISTAN. La pantalla no dibuja una fila «Apto médico · sin cargar» por cada
// tipo del vocabulario: eso le diría a un administrativo que le falta una libreta del IERIC que su
// puesto no necesita. Se muestran los documentos que existen; lo que falta lo declara Administración
// marcando `presente = false`, que es una afirmación de alguien, no una deducción de la pantalla.
//
// ═══ EL ESTADO SALE DE LA FECHA, Y LA FECHA PUEDE NO ESTAR ═══
//
// `fecha_vencimiento` nula NO es «vence hoy» ni «vencido»: es «no vence» (el DNI) o «no se declaró».
// Derivarla sumándole un año a la emisión fabricaría un vencimiento con cara de dato real.

import type { DocumentoLegajo, EstadoDocumento } from '../types'

/** Cuántos días antes del vencimiento el documento pasa a `warn`. Un apto médico se saca con turno:
 *  avisar el día que vence es avisar tarde. */
export const DIAS_DE_AVISO = 30

/** El vocabulario de la base, en el idioma de quien lee su legajo. Una clave que no esté acá se
 *  muestra tal cual vino: es feo y es la verdad, y avisa de que el vocabulario creció. */
export const CATEGORIA_LABEL: Record<string, string> = {
  dni: 'DNI',
  cuil: 'Constancia de CUIL',
  alta_temprana: 'Alta temprana',
  ieric: 'Libreta IERIC',
  contrato: 'Documentación laboral',
  art: 'ART',
  libreta_fondo_cese: 'Fondo de cese laboral',
  examen_medico: 'Apto médico',
  epp: 'Entrega de EPP',
  capacitacion: 'Capacitaciones',
  recibo_sueldo: 'Recibos de sueldo',
  licencia_conducir: 'Licencia de conducir',
  baja: 'Baja',
  otro: 'Otros',
}

export const categoriaDe = (tipo: string): string => CATEGORIA_LABEL[tipo] ?? tipo

/**
 * En qué estado está el papel. `hoy` entra por parámetro: sin eso, «probar que un documento que
 * vence mañana avisa» exigiría esperar a mañana.
 *
 *  · `falta`     — Administración declaró que el documento no está. `faint`: es un hueco.
 *  · `vencido`   — la fecha ya pasó. `neg`: es un problema real, y en ART o apto médico es uno serio.
 *  · `por_vencer`— vence dentro de los próximos 30 días. `warn`: hay que hacer algo y todavía se puede.
 *  · `vigente`   — está y no vence, o vence lejos.
 */
export function estadoDe(
  d: Pick<DocumentoLegajo, 'presente' | 'fecha_vencimiento'>,
  hoy: string,
): EstadoDocumento {
  if (!d.presente) return 'falta'
  if (!d.fecha_vencimiento) return 'vigente'
  if (d.fecha_vencimiento < hoy) return 'vencido'
  return d.fecha_vencimiento <= sumarDias(hoy, DIAS_DE_AVISO) ? 'por_vencer' : 'vigente'
}

/** `2026-08-20` + 30 → `2026-09-19`. En UTC para que no se corra un día por el huso. */
export function sumarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Cuántos vencidos y cuántos por vencer hay. Es lo que el teléfono muestra al pie —«1 vencido»— y
 *  lo único que justifica sacar al empleado de la pantalla en la que está. */
export function alerta(docs: DocumentoLegajo[], hoy: string): { vencidos: number; porVencer: number; faltan: number } {
  let vencidos = 0
  let porVencer = 0
  let faltan = 0
  for (const d of docs) {
    const e = estadoDe(d, hoy)
    if (e === 'vencido') vencidos += 1
    else if (e === 'por_vencer') porVencer += 1
    else if (e === 'falta') faltan += 1
  }
  return { vencidos, porVencer, faltan }
}

/** El resumen en una línea, o `null` cuando no hay nada que avisar. `null` y no «todo en orden»:
 *  un cartel verde permanente entrena a la gente a no leerlo. */
export function resumenDeAlerta(docs: DocumentoLegajo[], hoy: string): string | null {
  const { vencidos, porVencer, faltan } = alerta(docs, hoy)
  const partes: string[] = []
  if (vencidos) partes.push(`${vencidos} vencido${vencidos === 1 ? '' : 's'}`)
  if (porVencer) partes.push(`${porVencer} por vencer`)
  if (faltan) partes.push(`${faltan} sin cargar`)
  return partes.length ? partes.join(' · ') : null
}

/** Lo urgente arriba: vencido, por vencer, faltante, y recién después lo que está en orden. Dentro
 *  de cada grupo, lo que vence antes primero. */
export function ordenar(docs: DocumentoLegajo[], hoy: string): DocumentoLegajo[] {
  const peso: Record<EstadoDocumento, number> = { vencido: 0, por_vencer: 1, falta: 2, vigente: 3 }
  return [...docs].sort((a, b) => {
    const d = peso[estadoDe(a, hoy)] - peso[estadoDe(b, hoy)]
    if (d !== 0) return d
    return (a.fecha_vencimiento ?? '9999-12-31').localeCompare(b.fecha_vencimiento ?? '9999-12-31')
  })
}
