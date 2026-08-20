// QUÉ HACER CUANDO LA BASE TODAVÍA NO CONOCE LAS COLUMNAS NUEVAS.
//
// ═══ EL PROBLEMA REAL ═══
//
// `20260819T0500_cliente_es_una_relacion` agrega dirección, teléfono, email y responsable a
// `clientes`. YA ESTÁ APLICADA —verificado el 19/08/2026 leyendo `information_schema.columns` y
// `pg_constraint`, no la pantalla—, así que hoy este módulo no interviene. Sigue acá por dos
// motivos concretos, no por prolijidad:
//
//   · PostgREST cachea el esquema. Después de un `alter table` hay una ventana de minutos en la que
//     contesta PGRST204 aunque la columna exista. Sin esta guarda, en esa ventana el alta y la
//     edición de CUALQUIER cliente quedan rotas, incluso para corregir una nota.
//   · Una base que todavía no corrió la migración —una restaurada, una de prueba— tiene que poder
//     seguir operando con lo que sí tiene.
//
// ═══ LA REGLA, QUE ES LA DEL OS ENTERO: NUNCA SE GUARDA DE MENOS EN SILENCIO ═══
//
//   · nadie escribió ninguno de los cuatro campos → se guarda el resto y se contesta que sí, porque
//     no se perdió nada;
//   · alguien SÍ escribió alguno → NO se escribe nada y se contesta con el nombre de la migración
//     que falta.
//
// Guardar la razón social, tirar el teléfono y decir «guardado» es la forma más rápida de que
// alguien crea que cargó un dato que no existe. El día que la migración se aplique, esto deja de
// intervenir solo, sin tocar una línea.
//
// Vive en su propio archivo —y no dentro de `actions.ts`— porque `'use server'` sólo deja exportar
// funciones async: acá adentro se puede probar sin levantar un servidor.

export const MIGRACION = '20260819T0500_cliente_es_una_relacion'

/** Las columnas que agrega la migración. Son las únicas que pueden faltar. */
export const CAMPOS_DE_LA_RELACION = ['direccion', 'telefono', 'email', 'responsable_id'] as const

/** PGRST204 = PostgREST no conoce la columna. 42703 = Postgres tampoco. Son la misma falta. */
export function faltaLaRelacion(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST204' || error?.code === '42703'
}

export function mensajeDeMigracion(error: { message?: string }): string {
  return 'Todavía no puedo guardar dirección, teléfono, email ni responsable: falta aplicar en la base '
    + `la migración ${MIGRACION}. No guardé nada para no dejar la ficha a medias.`
    + (error.message ? ` (${error.message})` : '')
}

/**
 * La fila SIN los campos de la relación, o `null` cuando alguno traía dato — y entonces no hay
 * reintento posible: se corta y se avisa.
 *
 * `null` y `undefined` cuentan como vacío; la cadena vacía no llega hasta acá porque el esquema de
 * Zod ya la convirtió en `null`. Un `0` o un `false` contarían como dato, que es lo correcto: son
 * valores, no ausencias.
 */
export function sinLaRelacion(fila: Record<string, unknown>): Record<string, unknown> | null {
  if (CAMPOS_DE_LA_RELACION.some((k) => fila[k] != null)) return null
  const resto = { ...fila }
  for (const k of CAMPOS_DE_LA_RELACION) delete resto[k]
  return resto
}
