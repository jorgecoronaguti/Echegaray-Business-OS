// QUIÉN ESTÁ EN OBRA AHORA — la lógica pura de la pantalla de presencia.
//
// ═══ TRES GRUPOS, Y EL TERCERO ES EL QUE HACE ÚTIL LA PANTALLA ═══
//
//   · EN OBRA        marcó entrada y no marcó salida, hoy. El reloj corre.
//   · YA SE FUERON   marcó las dos puntas. El total es un hecho cerrado.
//   · SIN REGISTRAR  tiene asignación vigente y no marcó nada.
//
// El tercero NO dice «ausente» y no se cuenta como falta: dice que no hay marca. Un operario sin
// teléfono, uno que no le dio permiso al GPS y uno que faltó se ven exactamente igual desde acá, y
// convertir esa ignorancia en una ausencia sería fabricar una novedad de liquidación. La falta la
// declara el jefe de obra, que es quien lo ve.
//
// EL DÍA SIN SALIDA DE AYER NO ES «ACTIVO». Alguien que entró ayer y nunca cerró no está trabajando
// hace veinte horas: le falta la salida. Son dos estados distintos y la base ya los distingue.

import { contieneEnAlguno } from '../../../shared/utils/busqueda.ts'

export type EstadoPresencia = 'activo' | 'cerrada' | 'falta_salida' | 'sin_registrar'

export interface FilaPresencia {
  persona_id: string
  nombre_completo: string
  categoria: string | null
  puesto: string | null
  fecha: string
  obra_id: string | null
  obra: string | null
  entrada: string | null
  salida: string | null
  incidencias: number
  motivo: string | null
  lat: number | null
  lon: number | null
  precision_m: number | null
  origen: string | null
  estado: EstadoPresencia
}

/** Alguien del plantel con asignación vigente que hoy no marcó. Sale de `persona_directorio`. */
export interface Esperado {
  id: string
  nombre_completo: string
  categoria: string | null
  obra_actual_id: string | null
  obra_actual: string | null
  cuadrilla: string | null
}

export interface Grupos {
  enObra: FilaPresencia[]
  cerradas: FilaPresencia[]
  faltaSalida: FilaPresencia[]
  sinRegistrar: Esperado[]
}

/**
 * Los tres grupos, ya ordenados. `esperados` son las personas con asignación vigente; las que ya
 * aparecen en `presencia` se sacan de ahí — nadie puede estar en dos grupos a la vez.
 */
export function agrupar(presencia: FilaPresencia[], esperados: Esperado[] = []): Grupos {
  const marcaron = new Set(presencia.map((p) => p.persona_id))
  const porEntrada = (a: FilaPresencia, b: FilaPresencia) =>
    (a.entrada ?? '').localeCompare(b.entrada ?? '')
  return {
    enObra: presencia.filter((p) => p.estado === 'activo').sort(porEntrada),
    cerradas: presencia.filter((p) => p.estado === 'cerrada').sort(porEntrada),
    faltaSalida: presencia.filter((p) => p.estado === 'falta_salida').sort(porEntrada),
    sinRegistrar: esperados
      .filter((e) => !marcaron.has(e.id))
      .sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo, 'es')),
  }
}

/**
 * FILTRAR LOS CUATRO GRUPOS POR TEXTO — después de agrupar, nunca antes.
 *
 * Filtrar la presencia CRUDA rompería el grupo «sin registrar»: `agrupar` lo arma restando de los
 * esperados a los que ya marcaron, y si la búsqueda sacara una marca antes de esa resta, la persona
 * aparecería a la vez filtrada de «en obra» y agregada a «sin registrar» — o sea, la pantalla diría
 * que alguien que está en obra no marcó. Por eso esto recibe `Grupos` ya armados.
 *
 * Se busca por persona, categoría/puesto y obra: son los tres datos que cada fila muestra.
 */
export function filtrarGrupos(g: Grupos, q: string): Grupos {
  return {
    enObra: g.enObra.filter((f) => contieneEnAlguno([f.nombre_completo, f.categoria, f.puesto, f.obra], q)),
    cerradas: g.cerradas.filter((f) => contieneEnAlguno([f.nombre_completo, f.categoria, f.puesto, f.obra], q)),
    faltaSalida: g.faltaSalida.filter((f) => contieneEnAlguno([f.nombre_completo, f.categoria, f.puesto, f.obra], q)),
    sinRegistrar: g.sinRegistrar.filter((e) => contieneEnAlguno([e.nombre_completo, e.categoria, e.obra_actual], q)),
  }
}

/** `2026-08-20T07:58:00Z` → minutos transcurridos hasta `ahora`. Negativo o inválido → null: una
 *  entrada en el futuro es un reloj mal puesto, no una jornada de −20 minutos. */
export function minutosDesde(iso: string | null, ahora: number): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  const m = Math.floor((ahora - t) / 60000)
  return m < 0 ? null : m
}

/** 460 → `7:40`. El reloj de la jornada, en formato de reloj y con los minutos siempre en dos
 *  dígitos: es una duración que se mira de reojo, no un número que se compara. */
export function reloj(minutos: number | null): string {
  if (minutos == null) return '—'
  return `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, '0')}`
}

/**
 * ¿La jornada ya es larga? Se marca a partir de las 9 horas, que es donde la de convenio deja de
 * ser normal. NO es una alarma de horas extra —eso lo liquida Administración— es una señal para que
 * el jefe mire: casi siempre significa que alguien se olvidó de marcar la salida.
 */
export const HORAS_LARGA = 9

export function jornadaLarga(minutos: number | null): boolean {
  return minutos != null && minutos >= HORAS_LARGA * 60
}

/** El enlace al punto. `null` cuando no hay coordenada: la pantalla escribe «sin ubicación». */
export function mapa(lat: number | null, lon: number | null): string | null {
  if (lat == null || lon == null) return null
  return `https://www.google.com/maps?q=${lat},${lon}`
}

/**
 * Cómo se lee la precisión. Un punto a 2 km de error se ve igual que uno a 5 m si no se dice, y esa
 * diferencia es la que decide si el dato sirve para algo.
 */
export function lecturaDePunto(f: Pick<FilaPresencia, 'lat' | 'lon' | 'precision_m'>): {
  hay: boolean
  texto: string
  fiable: boolean
} {
  if (f.lat == null || f.lon == null) {
    return { hay: false, texto: 'sin ubicación', fiable: false }
  }
  const p = f.precision_m
  if (p == null) return { hay: true, texto: 'ubicación registrada', fiable: true }
  if (p <= 50) return { hay: true, texto: `±${p} m`, fiable: true }
  if (p < 1000) return { hay: true, texto: `±${p} m · aproximada`, fiable: false }
  return { hay: true, texto: `±${(p / 1000).toFixed(1).replace('.', ',')} km · muy aproximada`, fiable: false }
}

/** El renglón de arriba: cuánta gente hay, sin adjetivos. `null` en un conteo que no se pudo leer. */
export function resumen(g: Grupos): string {
  const partes = [`${g.enObra.length} en obra`]
  if (g.faltaSalida.length) partes.push(`${g.faltaSalida.length} sin cerrar`)
  if (g.cerradas.length) partes.push(`${g.cerradas.length} ya cerraron`)
  if (g.sinRegistrar.length) partes.push(`${g.sinRegistrar.length} sin registrar`)
  return partes.join(' · ')
}
