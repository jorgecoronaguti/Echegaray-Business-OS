// EL CONTRATO DE LAS ACCIONES — fuera de los archivos `'use server'`, y no por prolijidad.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA IMPEDIR ═══
//
// Un módulo marcado `'use server'` SÓLO puede exportar funciones async. Exportar además una
// constante —el estado inicial de `useActionState`, que es un objeto— hace que Next tire
// «A "use server" file can only export async functions, found object» EN TIEMPO DE EJECUCIÓN.
//
// Y ese error no lo ve nadie antes: `tsc --noEmit` pasa, `eslint` pasa, `next build` pasa. Lo que
// pasa es que la pantalla que importa la acción devuelve 500 y se dibuja EN BLANCO. Es la misma
// familia que la flecha en un Server Component (memoria del 20/08): compila, no rompe ninguna
// verificación barata, y el único control que lo encuentra es abrir el navegador.
//
// Los TIPOS sí pueden vivir en el archivo de acciones —se borran al compilar— pero viajan acá con
// la constante para que el contrato completo se lea de una sola vez.

/** Lo que devuelve una acción manejada con `useActionState`. */
export type EstadoAccion = { error: string | null; ok?: boolean; mensaje?: string }

/** Lo que devuelve una acción de un solo disparo (`FormAccion`, `BotonAccion`). */
export type Resultado = { ok: true; id?: string; mensaje?: string } | { ok: false; error: string }

/** El estado antes del primer envío. NO es un error ni es un éxito: todavía no pasó nada. */
export const INICIAL: EstadoAccion = { error: null }
