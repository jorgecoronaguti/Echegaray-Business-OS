// QUÉ HACER CON CADA PERSONA AL GUARDAR EL DÍA — decidido acá, fuera de la acción.
//
// Vive en su propio archivo por una razón mecánica: un archivo `'use server'` sólo puede exportar
// funciones async, y exportar una función pura desde ahí rompe el build. Y por una mejor: el plan se
// prueba sin base y sin sesión, que es lo que hace que el defecto quede atrapado para siempre.

import { z } from 'zod'
import { esTrabajada } from '../../obras/services/tipoHora.ts'

export const marcaSchema = z.discriminatedUnion('estado', [
  z.object({
    persona_id: z.string().uuid(),
    estado: z.literal('presente'),
    horas: z.number().positive('Las horas tienen que ser mayores que cero')
      .max(24, 'En un día no se pueden trabajar más de 24 horas'),
  }),
  z.object({
    persona_id: z.string().uuid(),
    estado: z.literal('ausente'),
    /** Las horas que se pierden. Es la jornada de la obra, no un cero: la base exige horas > 0. */
    horas: z.number().positive().max(24),
  }),
])

export const envioSchema = z.object({
  obra_id: z.string().trim().min(1, 'Elegí la obra'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí el día'),
  marcas: z.array(marcaSchema).min(1, 'No marcaste a nadie.'),
})

export type MarcaDeJornada = z.infer<typeof marcaSchema>

export interface FilaExistente {
  id: string
  persona_id: string
  horas: number
  tipo_hora: string
}

export interface PlanDeJornada {
  insertar: MarcaDeJornada[]
  actualizar: { id: string; marca: MarcaDeJornada }[]
  borrar: string[]
}

/**
 * El plan, decidido contra lo que ya está guardado.
 *
 * La fila del mismo tipo se corrige; cualquier otra fila de esa persona en ese día se BORRA. Sin el
 * borrado, marcar ausente a quien ya tenía 8,8 normales dejaría las dos filas y el día contaría
 * trabajo y ausencia a la vez. Las extras cargadas aparte también se van: esta pantalla declara UN
 * número por día, y dejar viva una fila que el jefe no ve haría que el total no coincidiera con la
 * casilla que él mismo cerró.
 *
 * Quien no viene en `marcas` NO se toca. Guardar el día no puede convertir un silencio en una
 * afirmación.
 */
export function planDeGuardado(marcas: MarcaDeJornada[], existentes: FilaExistente[]): PlanDeJornada {
  const plan: PlanDeJornada = { insertar: [], actualizar: [], borrar: [] }
  for (const m of marcas) {
    const suyas = existentes.filter((e) => e.persona_id === m.persona_id)
    const quiero = m.estado === 'ausente' ? 'ausencia' : 'normal'
    const misma = suyas.find((e) => (esTrabajada(e.tipo_hora) ? 'normal' : 'ausencia') === quiero)
    for (const otra of suyas) if (otra.id !== misma?.id) plan.borrar.push(otra.id)
    if (!misma) plan.insertar.push(m)
    else if (Number(misma.horas) !== m.horas) plan.actualizar.push({ id: misma.id, marca: m })
  }
  return plan
}

/** El acuse. Dice lo que PASÓ, no «guardado»: el efecto se mira, no se cree. */
export function acuseDe(p: PlanDeJornada): string {
  const partes = [
    p.insertar.length > 0 ? `${p.insertar.length} ${p.insertar.length === 1 ? 'marca nueva' : 'marcas nuevas'}` : null,
    p.actualizar.length > 0 ? `${p.actualizar.length} ${p.actualizar.length === 1 ? 'corregida' : 'corregidas'}` : null,
    p.borrar.length > 0 ? `${p.borrar.length} ${p.borrar.length === 1 ? 'reemplazada' : 'reemplazadas'}` : null,
  ].filter(Boolean)
  return partes.length === 0
    ? 'No había nada que cambiar: el día ya estaba así.'
    : `Día guardado: ${partes.join(' · ')}.`
}
