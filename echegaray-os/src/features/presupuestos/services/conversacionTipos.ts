// EL CONTRATO DE LA CONVERSACIÓN, fuera del archivo `'use server'`.
//
// Un módulo `'use server'` sólo puede exportar funciones async: una constante exportada tira
// «A "use server" file can only export async functions» EN TIEMPO DE EJECUCIÓN, con typecheck,
// lint y build todos en verde y la pantalla en blanco. Es la misma trampa que explica `./accion`.

/**
 * LO QUE SE MUESTRA DE UN TURNO — y que sale ENTERO de lo que devolvió el motor.
 *
 * No hay ninguna frase sobre el presupuesto escrita en el componente: los motivos, las preguntas y
 * los números vienen de `redactar()` en `orquestador/lib/cotizador/conversacion.mjs`, que a su vez
 * sólo copia lo que `ejecutar()` produjo. Una frase preescrita en la UI es una afirmación que nadie
 * verificó contra el motor.
 */
export interface RespuestaConversacion {
  tono: 'ok' | 'aviso' | 'no' | 'pregunta' | 'dato' | 'sin-permiso'
  titulo: string | null
  lineas: string[]
  cambios: { que: string; campo: string | null; antes: unknown; despues: unknown }[]
  pregunta: string | null
  opciones: string[] | null
  /** Lo que devolvió una consulta (`blockers_query`, `evidence_query`, `cost_query`). */
  datos?: unknown
  /** Cuánto movió el precio. `null` = no se pudo medir; nunca cero. */
  impacto?: { antes: number; despues: number; delta: number } | null
}

export interface TurnoConversacion {
  estado: 'inicial' | 'ok' | 'rechazado' | 'no-entendido' | 'error'
  /** Lo que se escribió, para que el hilo lo muestre al lado de la respuesta. */
  texto: string
  respuesta: RespuestaConversacion | null
  /** El razonador no estaba disponible: sólo anduvo lo determinístico (§34). */
  degradado?: boolean
}

export const TURNO_INICIAL: TurnoConversacion = { estado: 'inicial', texto: '', respuesta: null }
