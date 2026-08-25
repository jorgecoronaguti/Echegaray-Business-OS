// LAS TRES LECTURAS DE LAS SEÑALES DE HOY DE LA CARTERA (Design canónico 01).
//
// ═══ TRES CONSULTAS PARA TODA LA CARTERA, NUNCA UNA POR OBRA ═══
//
// Son diecisiete obras (medido el 24/08/2026 sobre `obra_panel`). Una consulta por obra serían 51
// viajes a São Paulo delante del primer byte de la página — el mismo patrón que ya costó los doce
// segundos que se arreglaron esta semana en la navegación.
//
// ═══ POR QUÉ NO LLEVAN `.in(obraIds)` ═══
//
// Filtrar por las obras visibles obliga a saber CUÁLES son, y eso se sabe recién con la cartera ya
// leída y filtrada: las tres consultas quedarían detrás de la que trae las obras, en una segunda
// tanda encadenada. Contra Vercel esa cascada se paga en ~120 ms de puro cable, y es exactamente lo
// que la página evita desde el 19/08 sacando el perfil del camino crítico. Salen en la MISMA tanda
// que el portafolio y el cruce por obra se hace en memoria, sobre payloads que hoy son de una fila
// (partes de hoy), cero (impedimentos abiertos) y cero (marcas de hoy). El RLS filtra igual: quien
// no ve una obra tampoco ve sus partes ni sus impedimentos.
//
// ═══ CADA SEÑAL FALLA SOLA ═══
//
// Las tres son independientes y ninguna es la razón por la que alguien abre la cartera. Si la
// presencia se cae, la tabla se dibuja igual y el pie DICE que no pudo mirar — no publica un cero.
// Por eso no hay un `error` único: hay una lista de lo que quedó sin dato, con su motivo.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getPresencia } from '@/features/administracion/services/presenciaService'
import {
  ficharonPorObra, impedimentosPorObra, obrasConParteDeHoy,
  type FilaDeObra, type MarcaDeCartera,
} from './senalesCartera'

export interface SenalesCartera {
  /** Obras con al menos un parte de ejecución cargado hoy. `null` = no se pudo leer. */
  partesHoy: Set<string> | null
  /** Impedimentos abiertos por obra; sólo las que tienen alguno. `null` = no se pudo leer. */
  impedimentos: Map<string, number> | null
  /** Quiénes ficharon hoy, por obra. `null` = no se pudo leer. */
  ficharon: Map<string, Set<string>> | null
  /** Qué señal quedó sin poder mirar y por qué. Vacío = las tres contestaron. */
  sinDato: { senal: string; error: string }[]
}

/**
 * LAS TRES SEÑALES DE UN DÍA.
 *
 * `hoyIso` lo fija el SERVIDOR y llega desde la página: el estado de una obra no puede depender del
 * reloj del navegador que la mira, que es el mismo criterio del semáforo de plazo.
 */
export async function getSenalesCartera(
  supabase: SupabaseClient, hoyIso: string,
): Promise<SenalesCartera> {
  const [partes, impedimentos, presencia] = await Promise.all([
    // EL PARTE DIARIO ES `obra_ejecucion`: una fila por actividad medida en un día, que es un HECHO
    // fechado y no se reescribe. Es la misma tabla que cuenta el tablero de `/campo`.
    supabase.from('obra_ejecucion').select('obra_id').eq('fecha', hoyIso),
    // IMPEDIMENTO ABIERTO = sin fecha de liberación (ver `senalesCartera.ts`). La tabla se llama
    // `obra_restriccion` adentro; en la pantalla nunca se dice «restricción».
    supabase.from('obra_restriccion').select('obra_id').is('fecha_liberacion', null),
    // LA PRESENCIA SE LEE CON LA MISMA FUNCIÓN QUE LA FICHA DE OBRA Y QUE «EN OBRA AHORA». Parecerse
    // no es compartir fuente: si la cartera armara su propia consulta a `presencia_del_dia`, el día
    // que la vista cambie —o falte la migración— la cartera diría una cosa y la obra otra. De yapa,
    // trae el aviso con NOMBRE de la migración que falta en vez de un 404 mudo.
    getPresencia(supabase, hoyIso),
  ])

  const sinDato: { senal: string; error: string }[] = []
  if (partes.error) sinDato.push({ senal: 'los partes de hoy', error: partes.error.message })
  if (impedimentos.error) sinDato.push({ senal: 'los impedimentos abiertos', error: impedimentos.error.message })
  if (presencia.error) sinDato.push({ senal: 'las personas de hoy', error: presencia.error })

  return {
    partesHoy: partes.error ? null : obrasConParteDeHoy((partes.data ?? []) as FilaDeObra[]),
    impedimentos: impedimentos.error ? null : impedimentosPorObra((impedimentos.data ?? []) as FilaDeObra[]),
    ficharon: presencia.error || !presencia.data
      ? null
      : ficharonPorObra(presencia.data as MarcaDeCartera[]),
    sinDato,
  }
}
