// EL RECIBO ACEPTADO — cómo se sella lo que se imprimió, y qué NO puede quedar guardado.
//
// Dueño, 22/09/2026, textual: *«el recibo tiene q decir total de hs y total depositado y total efectivo. no
// puede quedar evidencia de blanco o negro y deben ir guardandose en los legajos correspondientes, si se
// pone aceptar e imprimr»*.
//
// ═══ SELLAR ES NO RECALCULAR ═══
//
// Lo que se guarda es EL PAPEL, no los datos con los que se armó. Un recibo reimpreso el mes que viene tiene
// que salir idéntico al que la persona firmó, y para eso las cifras no pueden volver a calcularse: las horas
// se corrigen, el $/h cambia, un adelanto se carga tarde, la persona se recategoriza. Por eso viajan los
// renglones enteros —rótulo, importe, orden— más el nombre y la categoría como TEXTO.
//
// ═══ NADA DE BLANCO NI NEGRO, TAMBIÉN EN LO GUARDADO ═══
//
// Lo guardado se imprime y se exporta: rige la misma regla que el papel. `palabrasProhibidas` mira los
// rótulos y los detalles y devuelve las que encontró, para poder decir CUÁL. Es la misma red que el CHECK
// `recibo_sin_blanco_ni_negro` de la base, del lado de acá, donde se puede explicar en castellano; la de la
// base es la que vale, porque también alcanza a lo que no pase por esta pantalla.
//
// NO MIRA EL NOMBRE, a propósito: Blanco es un apellido corriente en San Juan y rebotar el recibo de una
// persona por cómo se llama sería un defecto, no un control.
//
// Sin JSX, sin `'use client'`, sin base: esto se prueba con `node --test`.

import type { ReciboArmado, RenglonDelRecibo } from './reciboDeLaQuincena.ts'
import { ROTULO } from './reciboDeLaQuincena.ts'
import type { CicloDelRecibo } from '@/shared/recibo/ciclo.ts'

/** El papel entero, tal como salió. Es lo que se guarda en `recibo_liquidacion.renglones`. */
export interface RenglonesSellados {
  horas: RenglonDelRecibo[]
  medios: RenglonDelRecibo[]
}

export interface ReciboSellado {
  personaId: string
  nombre: string
  categoria: string | null
  quincenaDesde: string
  quincenaHasta: string
  /** El TOTAL de horas. `null` = el papel no las decía; nunca 0. */
  horas: number | null
  banco: number | null
  efectivo: number | null
  total: number | null
  renglones: RenglonesSellados
}

/** El renglón principal (no `sub`) de un medio, que es el que lleva la cifra del papel. */
function importeDelMedio(medios: readonly RenglonDelRecibo[], rotulo: string): number | null {
  const r = medios.find((x) => !x.sub && x.rotulo === rotulo)
  return r ? r.importe ?? null : null
}

/**
 * Lo que se va a guardar, a partir del papel que se está mirando. No recalcula NADA: copia.
 *
 * `horas`, `banco` y `efectivo` suben a columnas propias porque la ficha lista veinte recibos y no puede
 * abrir veinte jsonb para escribir una tabla. Si el papel no trae el renglón, la columna va `null` — que es
 * «el recibo no lo decía», distinto de «$ 0».
 */
export function sellarRecibo(
  datos: { personaId: string; nombre: string; categoria: string | null; desde: string; hasta: string },
  recibo: ReciboArmado,
): ReciboSellado {
  const horas = recibo.horas.find((r) => r.rotulo === ROTULO.horas)
  return {
    personaId: datos.personaId,
    nombre: datos.nombre.trim(),
    categoria: datos.categoria?.trim() || null,
    quincenaDesde: datos.desde,
    quincenaHasta: datos.hasta,
    horas: horas ? horas.horas ?? null : null,
    banco: importeDelMedio(recibo.medios, ROTULO.banco),
    efectivo: importeDelMedio(recibo.medios, ROTULO.efectivo),
    total: recibo.total,
    // Copia de los arrays: el estado de la pantalla sigue vivo y no puede mutar lo que se selló.
    renglones: { horas: [...recibo.horas], medios: [...recibo.medios] },
  }
}

const PROHIBIDAS = /blanc[oa]s?|negr[oa]s?/gi

/** Las palabras del reparto interno que aparezcan en los rótulos o detalles del papel. Vacío = está limpio. */
export function palabrasProhibidas(r: ReciboSellado): string[] {
  const texto = [...r.renglones.horas, ...r.renglones.medios]
    .flatMap((x) => [x.rotulo, x.detalle ?? ''])
    .join(' · ')
  return [...new Set((texto.match(PROHIBIDAS) ?? []).map((p) => p.toLowerCase()))]
}

/** Un papel que no dice ni horas ni medios no se emite: no hay nada que la persona firme. */
export const reciboVacio = (r: ReciboSellado): boolean =>
  r.renglones.horas.length === 0 && r.renglones.medios.length === 0

/** Por qué NO se puede aceptar este recibo, en castellano. `null` = se puede. */
export function motivoParaNoEmitir(r: ReciboSellado): string | null {
  if (!r.nombre) return 'El recibo no dice a nombre de quién es.'
  if (reciboVacio(r)) return 'Tildá al menos un concepto: un recibo vacío no se emite.'
  const malas = palabrasProhibidas(r)
  if (malas.length > 0) {
    return `El recibo no puede decir «${malas.join('», «')}»: lo que se guarda se imprime igual que el papel.`
  }
  return null
}

/** Una fila de `recibo_liquidacion_emitido`, tal como la devuelve la base. */
export interface ReciboEnElLegajo extends ReciboSellado, CicloDelRecibo {
  id: string
  /** «REC-2026-0004». Es como se nombra un recibo entre personas; un uuid no le dice nada a nadie. */
  codigo: string | null
  /** Dónde está la foto del papel firmado, en el bucket. */
  papelPath: string | null
  /** Enlace firmado y corto a esa foto, para mirarla y verificarla (D13). `null` = no hay papel. */
  papelUrl: string | null
  emitidoEn: string
  /** El NOMBRE de quien lo emitió, ya resuelto. `null` = el perfil no tiene nombre cargado. */
  emitidoPor: string | null
  /** El último de esa quincena. Los anteriores quedan: también se entregaron. */
  esUltimo: boolean
}
