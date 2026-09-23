// LO QUE LA CABECERA DE LA OBRA DIBUJA EN CADA PANTALLA DE ARMADO — módulo neutral, lo monta la página
// (Server Component). Todas las cifras viajan por `CifraViva` (cliente): las publica la pantalla de
// abajo, que es la que tiene el árbol en la mano (`publicarCifrasDelArbol`) o lo que la persona va
// eligiendo. La página no lee el árbol dos veces.
//
//   C01   Actividades: ninguna · Días hábiles: 21 · Mano de obra: $ 19,29 M · Costo teórico: sin cargar
//   C02   Presupuesto: PR-0042 · R03 · Partidas: 19 · Elegidas: 14 · HH del análisis: 1.860
//   C03   Filas pegadas: 41 · Ítems reconocidos: 38 · Avisos: 3
//   C04   Ítems: 17 · Ponderación: Fundaciones 65 % · Sin método: 2 · Sin fechas: 1
//   C05   Ponderación: Fundaciones 65 % · Costo teórico: $ 6,58 M · HH plan: 1.860
//   C07/C08   Ítems: 17          C09   Ítems: 19 · Seleccionadas: 6

import type { CifraEnLinea } from '../../CabeceraDeObra'
import { CifraViva } from './CabeceraViva'
import type { ModoEstructura } from './Estructura'

const viva = (rotulo: string, clave: string, falta: string, italica = false): CifraEnLinea => ({
  rotulo, valor: <CifraViva clave={clave} falta={falta} />, italica,
})

export function cifrasDeCrear(modo: ModoEstructura, vacia: boolean): CifraEnLinea[] {
  if (modo.crear === 'presupuesto') {
    return [viva('Presupuesto', 'presupuesto', 'sin presupuesto'), viva('Partidas', 'partidas', 'sin partidas'), viva('Elegidas', 'elegidas', 'ninguna'), viva('HH del análisis', 'hh', 'sin análisis')]
  }
  if (modo.crear === 'planilla') {
    return [viva('Filas pegadas', 'filas', 'ninguna'), viva('Ítems reconocidos', 'reconocidos', 'ninguno'), viva('Avisos', 'avisos', 'ninguno')]
  }
  if (modo.panel === 'ponderacion') {
    return [viva('Ponderación', 'ponderacion', 'cierra en 100 %'), viva('Costo teórico', 'costo_teorico', 'sin cargar'), viva('HH plan', 'hh_plan', 'sin cargar')]
  }
  if (modo.sel) return [viva('Ítems', 'items', 'ninguno'), viva('Seleccionadas', 'seleccionadas', 'ninguna')]
  if (modo.crear === 'mano') {
    return [viva('Ítems', 'items', 'ninguno'), viva('Ponderación', 'ponderacion', 'cierra en 100 %'), viva('Sin método', 'sin_metodo', '0'), viva('Sin fechas', 'sin_fechas', '0')]
  }
  if (modo.panel) return [viva('Ítems', 'items', 'ninguno')]
  if (vacia) {
    return [viva('Actividades', 'items', 'ninguna', true), viva('Días hábiles', 'dias_habiles', 'sin plazo'), viva('Mano de obra', 'mano_de_obra', 'sin cargar'), viva('Costo teórico', 'costo_teorico', 'sin cargar', true)]
  }
  return []
}
