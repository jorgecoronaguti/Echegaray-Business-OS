// UN CONTACTO ES UN CONTACTO — la misma forma para el cliente y para el proveedor.
//
// ═══ POR QUÉ ESTE MÓDULO EXISTE (21/09/2026) ═══
//
// Pedido del dueño: «no tengo forma de agregar personas a los proveedores en app.ecsas.com.ar, no
// puedo dejar asentado un nombre un contacto nada». El cliente ya tenía su agenda
// (`cliente_contacto`, 18/08) con la validación escrita adentro de `clientes/services/actions.ts`.
// Copiarla para el proveedor habría dejado dos definiciones de qué es un email válido o cuánto mide
// un nombre, y el día que una se corrija la otra queda mintiendo. Acá vive UNA vez y la usan las
// dos agendas: `cliente_contacto` y `proveedor_contacto` tienen las mismas columnas a propósito.
//
// Es puro (sólo `zod`) para que `node --test` lo pruebe sin levantar un servidor: un archivo
// `'use server'` sólo puede exportar funciones async.

import { z } from 'zod'

/** Vacío es legítimo —no todos tienen mail—; mal escrito, no: un mail que no llega es peor que ninguno. */
export const emailOpcional = z
  .union([z.string().trim().email('Revisá el email: no tiene formato de correo'), z.literal('')])
  .optional()

/** Los topes son los mismos `maxLength` del formulario: el servidor no acepta lo que la pantalla no deja escribir. */
export const contactoSchema = z.object({
  nombre: z.string().trim()
    .min(2, 'El nombre del contacto es obligatorio')
    .max(120, 'El nombre pasa de 120 caracteres'),
  rol: z.string().trim().max(120, 'El rol pasa de 120 caracteres').optional(),
  email: emailOpcional,
  telefono: z.string().trim().max(60, 'El teléfono pasa de 60 caracteres').optional(),
  notas: z.string().trim().max(400, 'La nota pasa de 400 caracteres').optional(),
})

export type ContactoValidado = z.infer<typeof contactoSchema>

/** Lo que se escribe en la fila. Un campo vacío va como `null`: «sin teléfono», no un teléfono vacío. */
export interface FilaContacto {
  nombre: string
  rol: string | null
  email: string | null
  telefono: string | null
  notas: string | null
}

/** Lo que dibuja la agenda. Estructural: sirve igual para una fila de cliente que para una de proveedor. */
export interface ContactoDeAgenda extends FilaContacto {
  id: string
}

export function aFilaContacto(d: ContactoValidado): FilaContacto {
  return {
    nombre: d.nombre,
    rol: d.rol || null,
    email: d.email || null,
    telefono: d.telefono || null,
    notas: d.notas || null,
  }
}

export type ContactoLeido = { ok: true; fila: FilaContacto } | { ok: false; error: string }

/**
 * Del formulario a la fila, o el PRIMER motivo por el que no. Un `File` en lugar de texto (alguien
 * armando el POST a mano) no es un contacto: Zod lo rechaza porque no es string.
 */
export function leerContacto(form: FormData | Record<string, unknown>): ContactoLeido {
  // Por FORMA y no por `instanceof`: el FormData de una server action puede venir de otra copia de la
  // clase (undici), y un `instanceof` falso mandaría el objeto entero a Zod —«falta el nombre»—.
  const esFormData = typeof (form as FormData).get === 'function' && typeof (form as FormData).entries === 'function'
  const crudo = esFormData ? Object.fromEntries((form as FormData).entries()) : form
  const parsed = contactoSchema.safeParse(crudo)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Contacto inválido' }
  return { ok: true, fila: aFilaContacto(parsed.data) }
}

/**
 * ¿El error dice que la TABLA no existe? `42P01` es Postgres; `PGRST205` es PostgREST, que contesta
 * eso también durante los minutos en que su caché de esquema todavía no vio un `create table` recién
 * aplicado. Mismo criterio que `clientes/services/notaPendiente.ts`.
 */
export function faltaLaTabla(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}
