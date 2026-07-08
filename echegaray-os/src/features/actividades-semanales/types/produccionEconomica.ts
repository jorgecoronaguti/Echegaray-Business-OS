import type { ActividadSemanal } from './index'
import type { RegistroHH } from '@/features/hh-productividad/types'
import type { ObraResumenEconomico } from '@/features/control-economico/types'

// O1-C — Conexión físico-económica. Cruza lo que ya calculan otras capacidades
// (control-economico, hh-productividad) con el avance físico real (actividades
// semanales) sin fabricar precisión que la evidencia no sostiene. Cada dato
// devuelto declara su naturaleza: 'observado' (viene directo de una fuente real),
// 'calculado' (aritmética exacta sobre datos observados), 'estimado' (una
// simplificación explícita, ej. interpolación lineal) o 'inferido' (un juicio,
// no un cálculo determinista).
export type NaturalezaDato = 'observado' | 'calculado' | 'estimado' | 'inferido' | 'sin_dato'

export interface DatoTrazado<T> {
  valor: T | null
  naturaleza: NaturalezaDato
  explicacion: string
}

export interface ResumenProduccionEconomica {
  avanceFisicoPromedio: DatoTrazado<number>
  tendencia: DatoTrazado<'adelantado' | 'en_linea' | 'atrasado'>
  hhEstimada: DatoTrazado<number>
  hhConsumidaObra: DatoTrazado<number>
  rendimiento: DatoTrazado<string>
  costoPresupuestado: DatoTrazado<number>
  costoRealAcumulado: DatoTrazado<number>
  costoEsperadoAFecha: DatoTrazado<number>
  desvioCosto: DatoTrazado<number>
  clasificacionDesvio: DatoTrazado<string>
  margenActualizado: DatoTrazado<number>
  margenEnRiesgo: DatoTrazado<boolean>
}

interface DatosProduccionEconomica {
  actividades: ActividadSemanal[]
  registrosHH: RegistroHH[]
  resumenEconomico: ObraResumenEconomico | null
  hhEstimadaPresupuesto: number | null
}

export function calcularResumenProduccionEconomica(datos: DatosProduccionEconomica): ResumenProduccionEconomica {
  const cerradas = datos.actividades.filter((a) => a.avance_real != null)
  const conObjetivo = cerradas.filter((a) => a.avance_objetivo != null)

  const avanceFisicoPromedio: DatoTrazado<number> =
    cerradas.length > 0
      ? {
          valor: cerradas.reduce((acc, a) => acc + (a.avance_real ?? 0), 0) / cerradas.length,
          naturaleza: 'calculado',
          explicacion: `Promedio simple de avance_real de ${cerradas.length} actividad(es) cerrada(s). No pondera por tamaño/duración de la actividad -- simplificación explícita.`,
        }
      : { valor: null, naturaleza: 'sin_dato', explicacion: 'Ninguna actividad tiene avance_real informado todavía.' }

  const tendencia: DatoTrazado<'adelantado' | 'en_linea' | 'atrasado'> =
    conObjetivo.length > 0
      ? (() => {
          const promObjetivo = conObjetivo.reduce((acc, a) => acc + (a.avance_objetivo ?? 0), 0) / conObjetivo.length
          const promReal = conObjetivo.reduce((acc, a) => acc + (a.avance_real ?? 0), 0) / conObjetivo.length
          const diff = promReal - promObjetivo
          const valor = diff > 5 ? 'adelantado' : diff < -5 ? 'atrasado' : 'en_linea'
          return {
            valor,
            naturaleza: 'calculado' as const,
            explicacion: `Objetivo promedio ${promObjetivo.toFixed(0)}% vs. real promedio ${promReal.toFixed(0)}% en ${conObjetivo.length} actividad(es) con ambos datos.`,
          }
        })()
      : { valor: null, naturaleza: 'sin_dato', explicacion: 'Sin actividades con avance_objetivo y avance_real simultáneos.' }

  const hhEstimada: DatoTrazado<number> = datos.hhEstimadaPresupuesto != null
    ? { valor: datos.hhEstimadaPresupuesto, naturaleza: 'observado', explicacion: 'presupuestos.hh_estimada (versión aprobada).' }
    : { valor: null, naturaleza: 'sin_dato', explicacion: 'Sin HH estimada cargada en el presupuesto aprobado.' }

  const hhConsumidaObra: DatoTrazado<number> =
    datos.registrosHH.length > 0
      ? {
          valor: datos.registrosHH.reduce((acc, r) => acc + r.horas, 0),
          naturaleza: 'observado',
          explicacion: `Suma de ${datos.registrosHH.length} registro(s) de registros_hh -- a nivel OBRA, no por actividad (limitación real del grano de HH, ver PRP-008).`,
        }
      : { valor: null, naturaleza: 'sin_dato', explicacion: 'Sin registros_hh cargados para esta obra todavía.' }

  const rendimiento: DatoTrazado<string> = { valor: null, naturaleza: 'sin_dato', explicacion: 'No se puede calcular rendimiento (avance/HH) sin HH atribuidas a la misma actividad -- HH solo existe a nivel obra.' }

  const costoPresupuestado: DatoTrazado<number> = datos.resumenEconomico?.costo_presupuestado != null
    ? { valor: datos.resumenEconomico.costo_presupuestado, naturaleza: 'observado', explicacion: 'presupuestos.costo_directo_presupuestado (versión aprobada).' }
    : { valor: null, naturaleza: 'sin_dato', explicacion: 'Sin presupuesto aprobado con costo directo cargado.' }

  const costoRealAcumulado: DatoTrazado<number> = {
    valor: datos.resumenEconomico?.costo_real_acumulado ?? 0,
    naturaleza: 'observado',
    explicacion: 'obra_resumen_economico.costo_real_acumulado (suma de costos_reales de la obra).',
  }

  const costoEsperadoAFecha: DatoTrazado<number> =
    avanceFisicoPromedio.valor != null && costoPresupuestado.valor != null
      ? {
          valor: costoPresupuestado.valor * (avanceFisicoPromedio.valor / 100),
          naturaleza: 'estimado',
          explicacion: 'Interpolación lineal: costo_presupuestado × avance físico promedio. Simplificación explícita -- asume que el costo se devenga proporcional al avance, lo cual no siempre es cierto (curva real de costos rara vez es lineal).',
        }
      : { valor: null, naturaleza: 'sin_dato', explicacion: 'Falta avance físico promedio o costo presupuestado para estimar.' }

  const desvioCosto: DatoTrazado<number> =
    costoEsperadoAFecha.valor != null
      ? {
          valor: costoRealAcumulado.valor! - costoEsperadoAFecha.valor,
          naturaleza: 'estimado',
          explicacion: 'Costo real acumulado (observado) menos costo esperado a la fecha (estimado por interpolación) -- hereda la naturaleza estimada del segundo término.',
        }
      : { valor: null, naturaleza: 'sin_dato', explicacion: 'No calculable sin costo esperado a la fecha.' }

  const clasificacionDesvio: DatoTrazado<string> = {
    valor: null,
    naturaleza: 'sin_dato',
    explicacion: 'No se puede clasificar el desvío en cantidad/precio/rendimiento/alcance sin partidas vinculadas a las actividades (partida_id hoy no está en uso) -- no se fabrica una clasificación sin esa evidencia.',
  }

  const margenActualizado: DatoTrazado<number> = datos.resumenEconomico?.margen_actualizado != null
    ? { valor: datos.resumenEconomico.margen_actualizado, naturaleza: 'observado', explicacion: 'obra_resumen_economico.margen_actualizado (ya validado con datos reales en O1-A).' }
    : { valor: null, naturaleza: 'sin_dato', explicacion: 'Sin presupuesto aprobado para calcular margen.' }

  const margenEnRiesgo: DatoTrazado<boolean> =
    tendencia.valor === 'atrasado' && desvioCosto.valor != null && desvioCosto.valor > 0
      ? { valor: true, naturaleza: 'inferido', explicacion: 'Atraso físico + costo real por encima del esperado a la fecha -- juicio de riesgo, no un hecho confirmado.' }
      : tendencia.naturaleza === 'sin_dato' || desvioCosto.naturaleza === 'sin_dato'
        ? { valor: null, naturaleza: 'sin_dato', explicacion: 'Datos insuficientes para evaluar riesgo de margen.' }
        : { valor: false, naturaleza: 'inferido', explicacion: 'Sin señales combinadas de atraso físico y sobrecosto a la fecha.' }

  return {
    avanceFisicoPromedio,
    tendencia,
    hhEstimada,
    hhConsumidaObra,
    rendimiento,
    costoPresupuestado,
    costoRealAcumulado,
    costoEsperadoAFecha,
    desvioCosto,
    clasificacionDesvio,
    margenActualizado,
    margenEnRiesgo,
  }
}
