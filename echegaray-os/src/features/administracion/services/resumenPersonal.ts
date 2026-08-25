// EL PIE DE MÉTRICAS DEL LISTADO DE PERSONAL — Design 23/08/2026, pantalla 19 §Status bar.
//
// El canónico cierra la tabla con una franja de números (`PLANTEL · EN OBRA HOY · SIN ASIGNAR ·
// HH DEL MES`) en lugar del párrafo que había abajo de la tabla. Los números se cuentan sobre las
// filas que la pantalla ESTÁ MOSTRANDO: no hay una segunda consulta, así que no puede haber una
// segunda verdad.
//
// ═══ EL RÓTULO ES EL CONTRATO ═══
//
// Y por eso mismo el rótulo no puede ser fijo. Contar 2 filas después de buscar «Juan» y rotularlas
// «PLANTEL 2» dice que la empresa tiene dos personas. Lo mismo con el filtro: en «Inactivos» la
// misma cuenta significa exactamente lo contrario. Es el defecto que ya costó caro en el Sheet —un
// encabezado que dejó de describir lo que había debajo escondió $292,8 M— y acá es el mismo error
// con otra ropa: el número es correcto y la palabra que lo nombra, no.
//
// Regla: cada métrica se llama por lo que de verdad contó, y una métrica que en el filtro activo
// sería siempre 0 no se dibuja — «SIN ASIGNAR 0» dentro del filtro «En obra» no es una buena
// noticia, es una tautología ocupando lugar.
//
// ═══ Y «EN OBRA HOY» ES PRESENCIA, NO ASIGNACIÓN ═══
//
// Acá vivían DOS pies: `metricasDelListado`, que contaba «En obra» por `obra_actual_id` —dónde está
// ASIGNADA la persona—, y éste, que cuenta por la fichada. Son dos preguntas distintas y sus
// respuestas difieren en diez personas un lunes de lluvia; el rótulo del canónico dice HOY, así que
// gana la fichada y el otro se retira. Dos definiciones de «en obra» conviviendo es exactamente cómo
// se llega a que dos pantallas del mismo sistema digan números distintos de la misma empresa.
//
// `HH DEL MES` también estaba declarado como imposible —«el listado sale de `persona_directorio`,
// que no publica horas»— y dejó de serlo: el pulso del plantel ya lee `registros_hh` del mes para la
// columna HH MES, así que la suma no cuesta una consulta más.
//
// CADA CIFRA SE CALLA SI SU FUENTE NO SE PUDO LEER. Un «EN OBRA HOY 0» producido por una vista de
// presencia caída dice que no vino nadie a trabajar.

import type { MetricaCanon } from '@/shared/components/canon/ListaCanon'
import type { FiltroPersonal } from './personasService'
import { estadoHoy, horasVisibles, type MarcaDeHoy } from './pulsoDelPlantel.ts'

/** Lo mínimo que el pie necesita de cada fila. Se tipa por estructura y no con
 *  `PersonaEnDirectorio` para que la prueba no tenga que fabricar catorce campos. */
export interface FilaContable {
  obra_actual_id: string | null
  cuadrilla_id: string | null
  en_la_empresa: boolean
}

export function contar(personas: FilaContable[]) {
  return {
    total: personas.length,
    // LA OBRA SE CUENTA POR EL ID, NO POR EL NOMBRE: `obra_actual` puede venir vacío para una obra
    // que sí existe (el nombre lo resuelve un join), y contar por el nombre bajaría el número de
    // «en obra» sin que nadie lo note.
    enObra: personas.filter((p) => p.obra_actual_id != null).length,
    sinAsignar: personas.filter((p) => p.obra_actual_id == null).length,
    sinCuadrilla: personas.filter((p) => p.cuadrilla_id == null).length,
  }
}

/** Cómo se llama el conjunto que la pantalla está mostrando ahora mismo. */
export function rotuloDelConjunto(filtro: FiltroPersonal, buscando: boolean): string {
  if (buscando) return 'Coinciden'
  if (filtro === 'inactivos') return 'Inactivos'
  if (filtro === 'en_obra') return 'En obra'
  if (filtro === 'sin_asignar') return 'Sin asignar'
  return 'Plantel'
}


/** Lo mínimo que el pie canónico necesita de cada fila. */
export interface FilaDelPie extends FilaContable {
  id: string
}

export function metricasCanonicas({
  filtro, buscando, personas, marcas, hh, hoyDisponible, hhDisponible,
}: {
  filtro: FiltroPersonal
  buscando: boolean
  personas: FilaDelPie[]
  /** Las fichadas de hoy por persona. `null` = no se leyó, y entonces EN OBRA HOY no se dibuja. */
  marcas: Map<string, MarcaDeHoy> | null
  /** Las horas del mes por persona. `null` = no se leyó. */
  hh: Map<string, number> | null
  hoyDisponible: boolean
  hhDisponible: boolean
}): MetricaCanon[] {
  const m: MetricaCanon[] = [
    { rotulo: rotuloDelConjunto(filtro, buscando).toUpperCase(), valor: String(personas.length) },
  ]

  // A QUIEN YA NO ESTÁ NO SE LE PREGUNTA SI FICHÓ HOY NI CUÁNTAS HORAS HIZO ESTE MES.
  if (filtro === 'inactivos') return m

  if (marcas && hoyDisponible) {
    const enObra = personas.filter((p) => estadoHoy(marcas.get(p.id)) === 'en_obra').length
    m.push({ rotulo: 'EN OBRA HOY', valor: String(enObra) })
  }

  if (filtro === 'plantel') {
    const sinAsignar = personas.filter((p) => p.obra_actual_id == null).length
    // El ámbar SÓLO cuando hay alguien: un ámbar sobre un 0 gasta la señal.
    m.push({ rotulo: 'SIN ASIGNAR', valor: String(sinAsignar), tono: sinAsignar > 0 ? 'warn' : 'ink' })
  }

  if (hh && hhDisponible) {
    // ES LA SUMA DE LO IMPUTADO, no una estimación del mes: quien no tiene registros no suma, que es
    // distinto de «trabajó 0». La columna HH MES de su fila ya dice «sin HH».
    const total = personas.reduce((t, p) => t + (hh.get(p.id) ?? 0), 0)
    m.push({ rotulo: 'HH DEL MES', valor: `${horasVisibles(total)} h` })
  }

  return m
}
