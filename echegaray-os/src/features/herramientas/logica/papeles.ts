// LOS PAPELES DE UN RODADO — qué dice el papel, y cuánto le queda.
//
// Dueño, 22/09/2026: cargar en Herramientas todo lo de la carpeta VEHÍCULOS de Drive. La pantalla de Rodados
// decía «papeles y plan de service sin cargar»; esto es la mitad de papeles. El plan de service NO está y se
// sigue diciendo así: un vencimiento de service inventado manda a un camión a la ruta con la confianza puesta
// en un dato que nadie cargó.
//
// ═══ LO QUE ACÁ NO SE HACE ═══
//
// No se calcula ningún vencimiento: lo declara el papel (`vence_en`) y la base ya devolvió los días
// (`activo_papel_vigente.dias`). Acá se decide cómo se NOMBRA ese estado y con qué tono se pinta, que es
// decisión de pantalla. Un papel sin fecha de vencimiento no es un papel vencido: es un dato que falta.

import type { TonoEstado } from './parque'

export type TipoDePapel = 'titulo' | 'cedula_verde' | 'rto' | 'seguro' | 'patente' | 'factura_compra' | 'otro'

export interface Papel {
  id: string
  activo_id: string
  tipo: TipoDePapel
  numero: string | null
  emisor: string | null
  titular: string | null
  emitido_en: string | null
  vence_en: string | null
  /** Días hasta el vencimiento; negativo = vencido. `null` = el papel no vence o no lo dice. */
  dias: number | null
  drive_file_id: string | null
  drive_nombre: string | null
  observacion: string | null
}

/** Cómo se llama cada papel en la pantalla. */
export const NOMBRE_PAPEL: Record<TipoDePapel, string> = {
  titulo: 'Título',
  cedula_verde: 'Cédula verde',
  rto: 'RTO',
  seguro: 'Seguro',
  patente: 'Patente',
  factura_compra: 'Factura de compra',
  otro: 'Otro papel',
}

/** El orden en que se leen: primero lo que vence, después lo que sólo se guarda. */
export const ORDEN_PAPEL: TipoDePapel[] = ['rto', 'seguro', 'patente', 'cedula_verde', 'titulo', 'factura_compra', 'otro']

/** Los que caducan. Sólo de éstos se puede decir «vence en N días» o «vencido». */
export const CADUCAN: TipoDePapel[] = ['rto', 'seguro', 'patente']

/** A cuántos días de vencer se empieza a avisar. Un RTO se saca con turno: un mes es el aviso útil. */
export const AVISO_DIAS = 30

export interface EstadoDePapel { texto: string; tono: TonoEstado | 'tenue' | 'neg'; alerta: boolean }

/**
 * Qué decir de un papel. Tres estados y no dos: al día, por vencer, vencido — y el cuarto, que es el que
 * se pierde siempre: SIN CARGAR, que no es «al día».
 */
export function estadoDePapel(p: Pick<Papel, 'dias' | 'vence_en'> | null | undefined): EstadoDePapel {
  if (!p) return { texto: 'sin cargar', tono: 'tenue', alerta: false }
  if (p.vence_en == null || p.dias == null) return { texto: 'sin vencimiento', tono: 'tenue', alerta: false }
  if (p.dias < 0) return { texto: `vencido hace ${plural(-p.dias, 'día', 'días')}`, tono: 'neg', alerta: true }
  if (p.dias === 0) return { texto: 'vence hoy', tono: 'warn', alerta: true }
  if (p.dias <= AVISO_DIAS) return { texto: `vence en ${plural(p.dias, 'día', 'días')}`, tono: 'warn', alerta: true }
  return { texto: `al día · ${ddmmaa(p.vence_en)}`, tono: 'pos', alerta: false }
}

const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`
const ddmmaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

/** El papel vigente de un tipo, si está. */
export function papelDe(papeles: readonly Papel[], activoId: string, tipo: TipoDePapel): Papel | null {
  return papeles.find((p) => p.activo_id === activoId && p.tipo === tipo) ?? null
}

/** Todos los papeles de un activo, en el orden en que se leen. */
export function papelesDe(papeles: readonly Papel[], activoId: string): Papel[] {
  const suyos = papeles.filter((p) => p.activo_id === activoId)
  return suyos.sort((a, b) => ORDEN_PAPEL.indexOf(a.tipo) - ORDEN_PAPEL.indexOf(b.tipo))
}

/**
 * Lo que hay que mirar hoy: los papeles vencidos o por vencer, del más urgente al menos.
 * `null` cuando la migración todavía no está: la pantalla dice «sin cargar», no «todo al día».
 */
export function loQueVence(papeles: readonly Papel[] | null | undefined): Papel[] | null {
  if (!papeles) return null
  return papeles
    .filter((p) => CADUCAN.includes(p.tipo) && p.dias != null && p.dias <= AVISO_DIAS)
    .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0))
}

/** El resumen de una unidad para la fila de la lista: «RTO vencido · seguro al día». */
export function resumenDeUnidad(papeles: readonly Papel[] | null | undefined, activoId: string): string {
  if (!papeles) return 'sin cargar'
  const partes = CADUCAN.map((t) => {
    const p = papelDe(papeles, activoId, t)
    return p ? `${NOMBRE_PAPEL[t]} ${estadoDePapel(p).texto}` : null
  }).filter(Boolean)
  return partes.length ? partes.join(' · ') : 'sin cargar'
}
