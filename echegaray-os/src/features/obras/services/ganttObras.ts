// EL GANTT GLOBAL ES DE OBRAS — UN RENGLÓN POR OBRA, NO 344 ACTIVIDADES.
//
// El dueño, textual: *"NO quiero las 344 actividades de todas las obras desplegadas. Quiero UN
// RENGLÓN POR OBRA"* · *"El global agrega la información de las actividades canónicas por `obra_id`.
// No duplicar datos."*
//
// ═══ POR QUÉ ESTE ARCHIVO NO CALCULA UN SOLO MÍNIMO NI UN SOLO MÁXIMO ═══
//
// La agregación `min(inicio_plan)` / `max(fin_plan)` / `min(inicio_base)` / `max(fin_base)` por
// `obra_id` YA la hace la vista `obra_plan_vs_real` (CTE `plazo`), que es la misma que alimenta el
// portafolio y el bloque «Plan contra real» de cada obra. Traer las 344 actividades al navegador
// para reducirlas acá sería la SEGUNDA definición de "cuándo empieza y cuándo termina una obra": el
// día que una de las dos cambiara el recorte —las archivadas, los hitos, el tipo `resumen`— el
// renglón del Gantt global y el desvío de plazo de la ficha dirían plazos distintos de la misma
// obra, y no habría forma de saber cuál miente.
//
// ═══ LAS COLUMNAS SE PIDEN UNA POR UNA, Y ESO NO ES ESTILO ═══
//
// `obra_plan_vs_real` publica también contrato, presupuesto y los dos márgenes. Esta pantalla no
// habla de plata: un `select('*')` traería esos importes al cliente de todos los que abran el Gantt
// —enmascarados por la vista, sí, pero viajando igual— sin que ninguna línea de la pantalla los
// use. Lo que no se pide no se puede filtrar mal más tarde.
//
// LO PURO ESTÁ SEPARADO DE LA LECTURA A PROPÓSITO: el orden de los renglones y la decisión de "esta
// obra no tiene barra" se prueban con `node --test`, sin navegador y sin base.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '../types'

/**
 * LO QUE EL GANTT GLOBAL NECESITA DE CADA OBRA. Es un subconjunto declarado de `PlanVsReal`, no un
 * tipo nuevo del mismo concepto: los nombres son los de la vista, letra por letra.
 */
export interface PlazoObra {
  obra_id: string
  nombre: string
  estado: string
  inicio_plan: string | null
  fin_plan: string | null
  inicio_base: string | null
  fin_base: string | null
  avance_pct: number | null
  desvio_plazo_dias: number | null
  n_actividades: number
}

/** La lista literal que se le pide a PostgREST. Sin una sola columna de plata. */
export const COLUMNAS_PLAZO =
  'obra_id,nombre,estado,inicio_plan,fin_plan,inicio_base,fin_base,avance_pct,desvio_plazo_dias,n_actividades'

/**
 * EL PLAZO DE CADA OBRA VISIBLE. Qué obras vuelven NO lo decide esta función: lo decide el RLS de
 * `obra_plan_vs_real` (`security_invoker`). Un jefe de obra abre `/obras/gantt` y ve los renglones
 * de SUS obras sin que haya un `if` de permiso acá.
 */
export async function getPlazoPorObra(supabase: SupabaseClient): Promise<ServiceResult<PlazoObra[]>> {
  const { data, error } = await supabase.from('obra_plan_vs_real').select(COLUMNAS_PLAZO)
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as unknown as PlazoObra[], error: null }
}

/** La barra de una obra: sólo existe si la obra tiene cuándo empezar. */
export interface Barra {
  inicio: string
  fin: string
  /** Relleno proporcional. `null` = no hay avance publicado, y entonces no se rellena nada. */
  avancePct: number | null
  /** La línea base sellada. `null` = no está sellada, y entonces NO se dibuja ninguna marca. */
  base: { inicio: string, fin: string } | null
  /** Pasó su fin previsto sin llegar al 100%. Sale de dos datos reales, no de una proyección. */
  vencida: boolean
}

export interface FilaObra {
  obraId: string
  nombre: string
  avancePct: number | null
  desvioPlazoDias: number | null
  barra: Barra | null
  /** Por qué esta obra no tiene barra, en palabras. Sólo cuando `barra` es `null`. */
  motivo: string | null
}

/**
 * UNA OBRA SIN FECHAS NO TIENE BARRA, Y LO DICE.
 *
 * Una barra de largo cero —o de tres píxeles "para que se vea algo"— en el renglón de una obra sin
 * plan es una afirmación falsa dibujada: dice que la obra empieza y termina hoy. La ausencia se
 * escribe con palabras, que es lo único que no se puede leer mal de un vistazo.
 */
function motivoSinBarra(o: PlazoObra): string {
  return o.n_actividades === 0 ? 'sin cronograma cargado' : 'sin fechas de plan'
}

function barraDe(o: PlazoObra, hoyIso: string): Barra | null {
  if (!o.inicio_plan) return null
  // `fin_plan` es `max(fin_plan)` sobre las actividades: puede faltar aunque haya inicio, si ninguna
  // actividad tiene fecha de fin. La barra arranca igual y termina donde arranca — el dato de fin no
  // se inventa, se muestra el tramo que sí existe.
  const fin = o.fin_plan ?? o.inicio_plan
  return {
    inicio: o.inicio_plan,
    fin,
    avancePct: o.avance_pct,
    // LAS DOS PUNTAS O NINGUNA. Con media línea base no se puede comparar contra el plan, y media
    // marca debajo de la barra se lee como una línea base completa que casualmente coincide.
    base: o.inicio_base && o.fin_base ? { inicio: o.inicio_base, fin: o.fin_base } : null,
    vencida: fin < hoyIso && (o.avance_pct ?? 0) < 100,
  }
}

/**
 * LOS RENGLONES DEL GANTT GLOBAL, en el orden en que se leen: por fecha de arranque, que es lo que
 * arma la escalera del croquis del dueño. Las obras sin plan van al final —no compiten por la
 * atención con las que sí tienen cronograma— pero NO se ocultan: una obra que desaparece de la
 * cartera porque le falta un dato es exactamente la que hay que ir a cargar.
 *
 * `hoyIso` ENTRA POR PARÁMETRO Y NO SE LEE DEL RELOJ ACÁ: «vencida» compara una fecha de plan
 * contra hoy, y una función que consulta el reloj por su cuenta sólo se puede probar el día que el
 * dato caiga del lado correcto. Con el día adentro de la firma, el caso «pasó su fin sin llegar al
 * 100%» se prueba en cualquier fecha.
 *
 * @param incluirArchivadas Las obras `cerrada` quedan afuera por defecto, igual que en el portafolio
 * y en `getContextoGlobal`. Un Gantt de la cartera es de lo que está en curso.
 */
export function filasDeObras(obras: PlazoObra[], hoyIso: string, incluirArchivadas = false): FilaObra[] {
  return obras
    .filter((o) => incluirArchivadas || o.estado !== 'cerrada')
    .map((o) => {
      const barra = barraDe(o, hoyIso)
      return {
        obraId: o.obra_id,
        nombre: o.nombre,
        avancePct: o.avance_pct,
        desvioPlazoDias: o.desvio_plazo_dias,
        barra,
        motivo: barra ? null : motivoSinBarra(o),
      }
    })
    .sort((a, b) => {
      if (!a.barra && !b.barra) return a.nombre.localeCompare(b.nombre, 'es')
      if (!a.barra) return 1
      if (!b.barra) return -1
      return a.barra.inicio.localeCompare(b.barra.inicio) || a.nombre.localeCompare(b.nombre, 'es')
    })
}

const DIA = 86400000
const aDate = (iso: string) => new Date(iso + 'T00:00:00Z')

/**
 * LA VENTANA DE TIEMPO QUE ABARCA LA CARTERA. `null` cuando ninguna obra tiene fechas: ahí no hay
 * eje que dibujar, y la pantalla lo dice en vez de inventar un mes cualquiera.
 *
 * `hoyIso` entra en el rango a propósito: sin eso, una cartera cuyo plan terminó el mes pasado
 * dibuja un Gantt donde la línea de hoy queda fuera de la pantalla y el atraso no se ve. Y entra
 * como TEXTO, el mismo que fijó el servidor: si el navegador leyera su propio reloj, alrededor de la
 * medianoche el eje que dibuja el cliente no sería el que ordenó el servidor.
 */
export function ventana(filas: FilaObra[], hoyIso: string): { desde: Date, hasta: Date } | null {
  let min = Infinity
  let max = -Infinity
  for (const f of filas) {
    if (!f.barra) continue
    const b = f.barra
    for (const iso of [b.inicio, b.fin, b.base?.inicio, b.base?.fin]) {
      if (!iso) continue
      const t = aDate(iso).getTime()
      min = Math.min(min, t)
      max = Math.max(max, t)
    }
  }
  if (min === Infinity) return null
  const h = aDate(hoyIso).getTime()
  // Una semana de margen a cada lado: la primera barra no nace pegada al borde y la última no se
  // corta contra el marco.
  return { desde: new Date(Math.min(min, h) - 7 * DIA), hasta: new Date(Math.max(max, h) + 7 * DIA) }
}
