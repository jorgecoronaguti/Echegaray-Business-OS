'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { registrarEjecucion } from '@/features/obras/services/actionsEjecucion'
import { crearImpedimento } from '@/features/obras/services/actions'

// LAS DOS ESCRITURAS DE `/campo`, Y NI UNA REGLA PROPIA.
//
// El parte lo escribe `registrarEjecucion` y el impedimento `crearImpedimento`: las MISMAS acciones
// que usa la obra en escritorio, con la misma validación, los mismos efectos (el parte imputa horas
// y puede abrir un impedimento) y el mismo control de que la actividad sea de esa obra. Una segunda
// implementación «para el teléfono» sería una segunda definición de qué es un parte, y la del
// teléfono es justo la que nadie audita.
//
// Lo único que se agrega acá es la forma: `useActionState` necesita `(estado, form)`, y las acciones
// de la obra reciben `(obraId, form)`. Y la revalidación de `/campo`, que ellas no conocen.

export type EstadoForm = { error: string | null; ok?: boolean; mensaje?: string | null }

const obraSchema = z.string().trim().min(1, 'Elegí la obra')

export async function cargarParteAction(_prev: EstadoForm, form: FormData): Promise<EstadoForm> {
  const obra = obraSchema.safeParse(form.get('obra_id'))
  if (!obra.success) return { error: obra.error.issues[0].message }
  const r = await registrarEjecucion(obra.data, form)
  if (!r.ok) return { error: r.error }
  revalidatePath('/campo')
  return { error: null, ok: true, mensaje: r.mensaje ?? 'Parte cargado.' }
}

export async function anotarImpedimentoAction(_prev: EstadoForm, form: FormData): Promise<EstadoForm> {
  const obra = obraSchema.safeParse(form.get('obra_id'))
  if (!obra.success) return { error: obra.error.issues[0].message }
  const r = await crearImpedimento(obra.data, form)
  if (!r.ok) return { error: r.error }
  revalidatePath('/campo')
  return { error: null, ok: true, mensaje: 'Impedimento anotado. Queda abierto hasta que alguien lo libere.' }
}
