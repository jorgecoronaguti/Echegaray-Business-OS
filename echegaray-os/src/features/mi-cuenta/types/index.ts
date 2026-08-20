// MI CUENTA — los tipos de lo que cada persona ve DE SÍ MISMA.
//
// PERSONA ≠ USUARIO. El `Perfil` es la CUENTA (con qué email entra, con qué nivel, con qué foto); el
// `LegajoPropio` es la PERSONA del plantel (categoría, alta, convenio). Están separados en el modelo
// y se mantienen separados acá: el empleado edita su cuenta y NUNCA su legajo.
//
// Todo lo que llega de un formulario se valida con Zod antes de tocar la base. El `rol` y el
// `persona_id` no aparecen en ningún esquema de acá: no son campos de esta pantalla, y el grant por
// columna de Postgres los rechaza aunque alguien los mande a mano.

import { z } from 'zod'

/** El legajo propio, tal como lo publica la vista `mi_legajo`. Sin dni, cuil ni retribución. */
export interface LegajoPropio {
  id: string
  nombre_completo: string
  categoria: string | null
  especialidad: string | null
  puesto: string | null
  convenio_colectivo: string | null
  fecha_ingreso: string | null
  fecha_egreso: string | null
  en_la_empresa: boolean
  legajo: string | null
}

/** Una asignación a una obra, con la vigencia ya resuelta por la base. */
export interface AsignacionPropia {
  id: string
  obra_id: string | null
  obra: string | null
  rol: string
  cuadrilla: string | null
  desde: string | null
  hasta: string | null
  vigente: boolean
}

/** Una imputación de horas a mi nombre. Es LECTURA: se corrige en la obra, nunca acá. */
export interface HoraPropia {
  id: string
  fecha: string | null
  obra_id: string | null
  obra: string | null
  actividad_id: string | null
  actividad: string | null
  tipo_hora: string
  horas: number
  notas: string | null
}

export type EstadoDocumento = 'vigente' | 'por_vencer' | 'vencido' | 'falta'

/** Un papel del legajo propio. El archivo vive en Drive: acá va su id, nunca una copia. */
export interface DocumentoLegajo {
  id: string
  tipo_documento: string
  nombre: string | null
  presente: boolean
  drive_file_id: string | null
  fecha_documento: string | null
  fecha_vencimiento: string | null
}

/** La cuenta: lo que sí se edita en esta pantalla. */
export interface PerfilPropio {
  id: string
  nombre: string
  rol: string
  telefono: string | null
  avatar_url: string | null
  /** `null` = la cuenta no está vinculada a ninguna persona del plantel. NO es un error: la mayoría
   *  del plantel no tiene cuenta, y hay cuentas que no son una persona (el estudio contable). Lo
   *  que sí es, es la razón por la que Mi legajo, Mis horas y Mis documentos van a estar vacíos. */
  persona_id: string | null
  /**
   * ¿ESTA BASE SABE VINCULAR? `false` = la migración `20260820T3000` no está aplicada acá.
   *
   * Sin esta distinción, `persona_id: null` significaría dos cosas incompatibles —«Administración no
   * te vinculó todavía» y «esta base no tiene la capacidad»— y la pantalla mandaría a la persona a
   * pedirle a Administración algo que Administración no puede hacer hasta que se corra la migración.
   */
  vinculoDisponible: boolean
}

// ═══ LO QUE ENTRA POR FORMULARIO ═══

export const perfilInputSchema = z.object({
  nombre: z.string().trim().min(2, 'Escribí tu nombre').max(120, 'Máximo 120 caracteres'),
  // El teléfono se guarda COMO SE ESCRIBE. Normalizarlo a un formato canónico rompería los que
  // vienen con interno o con prefijo internacional, y nadie llama desde el OS: es para que un
  // humano lo lea y lo marque.
  telefono: z.string().trim().max(60, 'Máximo 60 caracteres').optional().transform((v) => v || null),
})
export type PerfilInput = z.infer<typeof perfilInputSchema>

/** El tope y los formatos de la foto. Se validan del lado del servidor además del `accept` del
 *  input: el `accept` es una comodidad del navegador, no una cerradura. */
export const AVATAR_TIPOS = ['image/jpeg', 'image/png', 'image/webp'] as const
export const AVATAR_MAX_BYTES = 4 * 1024 * 1024
export const AVATAR_LADO_MINIMO = 200
