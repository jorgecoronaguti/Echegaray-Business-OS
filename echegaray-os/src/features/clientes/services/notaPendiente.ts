// LA NOTA CUANDO LA TABLA TODAVÍA NO EXISTE — CÓMO SE FALLA CERRADO.
//
// ═══ EL PROBLEMA REAL, MEDIDO ═══
//
// `20260819T2000_la_nota_manual_del_cliente` está en el repositorio y NO en la base: verificado el
// 19/08/2026 contra Supabase, `public.cliente_nota` devuelve PGRST205. Las migraciones no las
// aplica un agente, así que esa ventana existe y hay que atravesarla sin mentir.
//
// El único desenlace inaceptable es el cartelito verde: alguien escribe «llamé al arquitecto, la
// certificación de agosto entra en septiembre», la pantalla contesta «Nota guardada» y no hay
// ninguna fila en ninguna parte. Un dato que se cree guardado y no existe es peor que un dato que
// falta, porque nadie lo va a volver a cargar.
//
// Por eso: cuando la tabla no está, NO se escribe nada, NO se dice que sí, y el mensaje nombra la
// migración que falta — que es lo único que desbloquea la situación. El día que se aplique, este
// módulo deja de intervenir solo, sin tocar una línea.
//
// Vive en su propio archivo —y no dentro de `actions.ts`— porque un archivo `'use server'` sólo
// puede exportar funciones async: acá adentro se puede probar sin levantar un servidor.
// Probado en `orquestador/lib/cliente-nota-pendiente.test.mjs`.

export const MIGRACION_NOTAS = '20260819T2000_la_nota_manual_del_cliente'

/**
 * ¿El error dice que la tabla de notas no existe?
 *
 * Son DOS códigos y hacen falta los dos. `42P01` es Postgres diciendo «undefined_table»; `PGRST205`
 * es PostgREST, que mantiene su propio caché de esquema y contesta eso incluso durante los minutos
 * que siguen a un `create table` recién aplicado. Mirar sólo uno deja la mitad de la ventana sin
 * cubrir, y en esa mitad el fallo vuelve a verse como un error críptico de base de datos.
 */
export function faltaLaTablaDeNotas(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}

/** Lo que lee una persona. Dice qué NO pasó ("no guardé nada") antes que por qué. */
export function mensajeDeNotasPendiente(): string {
  return 'Todavía no puedo guardar notas: falta aplicar en la base la migración '
    + `${MIGRACION_NOTAS}. No guardé nada.`
}

/** Lo que lee una persona al ABRIR la ficha. Es un aviso, no un error: no hay nada roto todavía. */
export function avisoDeNotasPendiente(): string {
  return 'Las notas manuales todavía no están disponibles en esta base: falta aplicar la migración '
    + `${MIGRACION_NOTAS}. El resto de la actividad se lee normalmente.`
}
