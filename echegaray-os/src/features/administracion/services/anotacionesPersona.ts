// LAS REGLAS DE UNA ANOTACIÓN — puras, para poder probarlas sin base y sin navegador.
//
// El dueño, 08/09/2026: *«quiero que dejes dentro de la ficha de cada persona un lugar para hacer
// anotaciones»*. Lo que decide este archivo es lo único que no se ve: quién la ve, quién la
// escribe, y qué texto es una anotación de verdad.
//
// ═══ POR QUÉ NO ESTÁ ESCRITO ACÁ QUIÉN PUEDE ═══
//
// `verAnotaciones` y `puedeAnotar` DELEGAN en `esAdministracion()`, que es el mismo predicado que
// la policy `persona_nota_select` ejecuta en Postgres vía `es_administracion()`. Escribir un
// `rol === 'direccion' || …` sería una tercera definición del mismo criterio —la pantalla, la
// acción y la base— y la primera que se desincroniza. Si mañana el jefe de obra deja de administrar
// maestros, las tres cambian juntas o ninguna.
//
// ESTO NO ES LA CERRADURA. La cerradura es la RLS: una acción de servidor se invoca sin abrir jamás
// la pantalla. Esto decide qué se DIBUJA, y la acción vuelve a preguntar contra la cookie.

// RUTA RELATIVA CON EXTENSIÓN en el import de valor: `node --test` corre este archivo sin conocer
// el alias `@/`. Misma razón anotada en `accesoPersona.ts`.
import type { Rol } from '@/features/auth/types'
import { esAdministracion } from '../../auth/types/areas.ts'

/** El techo del texto. No es prudencia: es el mismo `maxLength` del textarea y del schema Zod, para
 *  que el borde, el servidor y la pantalla no discrepen sobre qué entra. */
export const LARGO_MAXIMO = 2000

/**
 * ¿VE LAS ANOTACIONES?
 *
 * Dirección, Administración y jefe de obra. El rol `campo` NO: es la ficha del EMPLEADOR sobre su
 * empleado, y `campo` es la propia persona cargando su asistencia. Que la lea el anotado sería peor
 * que no tener el bloque —nadie volvería a escribir nada honesto—, y por eso tampoco aparece en
 * «Mi cuenta».
 */
export const veAnotaciones = (rol: Rol | null | undefined) => esAdministracion(rol)

/**
 * ¿PUEDE ANOTAR?
 *
 * Los mismos tres. El jefe de obra es quien ve trabajar a la persona todos los días: dejarlo sólo
 * leer convertiría el bloque en un tablero que alguien más tiene que llenar de oídas.
 *
 * Es una función aparte de `veAnotaciones` aunque hoy devuelvan lo mismo: son dos preguntas
 * distintas y ya se separaron una vez en este repo (`es_administracion` / `ve_economia`). Cuando se
 * vuelvan a separar, los llamadores no cambian.
 */
export const puedeAnotar = (rol: Rol | null | undefined) => esAdministracion(rol)

export type TextoValidado =
  | { ok: true; texto: string }
  | { ok: false; error: string }

/**
 * EL TEXTO QUE ENTRA A LA BASE, O EL MOTIVO POR EL QUE NO.
 *
 * Recorta y rechaza el vacío ANTES de la base. No reemplaza al `check (length(btrim(texto)) > 0)`
 * de la migración —esa es la que vale cuando la escritura no viene de esta pantalla— pero es la que
 * puede decir POR QUÉ: un `check_violation` crudo de Postgres en la pantalla no le dice nada a
 * nadie.
 *
 * Devuelve el texto RECORTADO, y ese es el que se guarda: si se guardara el original, dos
 * anotaciones idénticas se verían distintas y el `btrim` de la base aceptaría un texto que empieza
 * con cuatro saltos de línea.
 */
export function validarTextoAnotacion(entrada: unknown): TextoValidado {
  if (typeof entrada !== 'string') return { ok: false, error: 'Escribí la anotación.' }
  const texto = entrada.trim()
  if (texto.length === 0) return { ok: false, error: 'Escribí la anotación: en blanco no se guarda.' }
  if (texto.length > LARGO_MAXIMO) {
    return {
      ok: false,
      error: `La anotación no puede pasar de ${LARGO_MAXIMO} caracteres (tiene ${texto.length}). `
        + 'Si es largo, cortalo en dos anotaciones.',
    }
  }
  return { ok: true, texto }
}

/**
 * QUIÉN LA ESCRIBIÓ, DICHO PARA UNA PERSONA.
 *
 * `null` no es «nadie»: es una cuenta que ya no está (el autor tiene `on delete set null`, porque
 * dar de baja a un jefe no puede borrar lo que observó). Se dice así y no «Sistema» ni «—»: la
 * anotación existió y la escribió alguien, lo que se perdió es el nombre.
 */
export function autorDeAnotacion(nombre: string | null | undefined): string {
  const limpio = (nombre ?? '').trim()
  return limpio.length > 0 ? limpio : 'cuenta dada de baja'
}
