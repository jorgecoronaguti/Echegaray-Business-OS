// EL CONTEXTO DE UNA PANTALLA DEL JEFE — qué obra está mirando, y qué hacer cuando no hay ninguna.
//
// Las seis pantallas empiezan igual: resolver la obra. Escrito una vez, porque seis copias de
// «¿tiene obras? ¿la pedida es suya? ¿cuál muestro?» divergen en la primera corrección.

import { createClient } from '@/lib/supabase/server'
import { getObrasDelJefe, type ObraDelJefe } from './jefeService.ts'
import { obraElegida } from './navegacion.ts'
import { ETAPAS, ETAPA_LABEL, type Etapa } from '@/features/obras/types'

export interface Contexto {
  supabase: Awaited<ReturnType<typeof createClient>>
  obras: ObraDelJefe[]
  obra: ObraDelJefe | null
  /** El primer error REAL de la lectura. Se muestra tal cual: un conteo que falló no es un cero. */
  error: string | null
}

/** La fecha de hoy en San Juan. El servidor puede estar en UTC y ahí «hoy» arranca a las 21:00. */
export function hoyEnObra(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export async function contextoDeObra(pedida: string | null | undefined): Promise<Contexto> {
  const supabase = await createClient()
  const obras = await getObrasDelJefe(supabase)
  const lista = obras.data ?? []
  const id = obraElegida(lista, pedida)
  return {
    supabase,
    obras: lista,
    obra: lista.find((o) => o.id === id) ?? null,
    error: obras.error,
  }
}

/** El texto del renglón bajo el nombre de la obra: etapa, avance y cobertura. Sin un solo importe. */
export function renglonDeObra(o: ObraDelJefe): string {
  const partes: string[] = []
  // La ETIQUETA, no la clave: la base guarda `terminacion` y en pantalla eso se lee como un error de
  // tipeo. El mapa ya existe en el módulo de Obras y no se copia.
  const etapa = o.etapa && (ETAPAS as readonly string[]).includes(o.etapa)
    ? ETAPA_LABEL[o.etapa as Etapa] : null
  partes.push(etapa ?? 'sin etapa declarada')
  partes.push(o.avance_pct == null
    ? 'avance sin medir'
    : `${o.avance_pct} % sobre ${o.n_actividades_medidas} de ${o.n_actividades} tareas`)
  return partes.join(' · ')
}
