// HH POR MES DE UNA PERSONA — el bloque de barras del costado del legajo. `20v2:212-221`.
//
// ═══ POR QUÉ NO SE PIDE A LA BASE ═══
//
// La ficha YA leyó todos los registros de la persona para publicar las HH del mes y del año. Un
// `group by` más contra `registros_hh` daría un segundo total del mismo mes calculado por otro
// camino, y el día que los dos no coincidan nadie sabría cuál mirar.
//
// ═══ SÓLO HORAS TRABAJADAS ═══
//
// Una ausencia tiene horas y no es trabajo. Es la misma regla que aplican la tarjeta de HH de la
// cuadrilla, la solapa Personal de la obra y el resumen del período: si acá se escribiera otra, el
// mismo mes daría dos números según qué pantalla se mire.
//
// ═══ UN MES SIN REGISTROS NO ES UN MES DE CERO HORAS ═══
//
// La serie se arma sobre los meses que SE PIDEN —los últimos N—, y un mes sin registros va con
// `horas: null`, no con 0. Un cero afirma que la persona no trabajó; un hueco dice que no hay
// registros, que es lo que pasa con quien entró en marzo.

import { esTrabajada } from '../../obras/services/tipoHora.ts'

export interface MesDeHH {
  /** `2026-08`. */
  clave: string
  /** `ago`, en minúscula y sin punto: el costado tiene 44px para esta columna. */
  rotulo: string
  /** `null` = no hubo ningún registro ese mes. Nunca 0 por ausencia de dato. */
  horas: number | null
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Los últimos `cuantos` meses terminados en el de `hoy`, del más viejo al más nuevo. */
export function ultimosMeses(hoy: string, cuantos: number): string[] {
  const [a, m] = hoy.split('-').map(Number)
  const claves: string[] = []
  for (let i = cuantos - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1))
    claves.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return claves
}

export function hhPorMes(
  filas: { fecha: string | null; horas: number; tipo_hora: string }[],
  hoy: string,
  cuantos = 5,
): MesDeHH[] {
  const suma = new Map<string, number>()
  for (const f of filas) {
    if (!f.fecha || !esTrabajada(f.tipo_hora)) continue
    const clave = f.fecha.slice(0, 7)
    const horas = Number(f.horas ?? 0)
    if (!Number.isFinite(horas)) continue
    suma.set(clave, (suma.get(clave) ?? 0) + horas)
  }
  return ultimosMeses(hoy, cuantos).map((clave) => ({
    clave,
    rotulo: MES_CORTO[Number(clave.slice(5, 7)) - 1],
    horas: suma.has(clave) ? Math.round(suma.get(clave) ?? 0) : null,
  }))
}
