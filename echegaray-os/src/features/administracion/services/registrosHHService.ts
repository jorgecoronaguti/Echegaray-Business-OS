// LA VENTANA DE `registros_hh`, LEÍDA UNA SOLA VEZ Y COMPLETA.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA IMPEDIR (10/09/2026) ═══
//
// PostgREST corta toda respuesta en `db-max-rows` (1.000 filas en esta base) y NO avisa: devuelve
// 200 con las primeras mil y `error: null`. La solapa «Horas» de Liquidación pedía cinco meses de
// `registros_hh` en un solo viaje para el gráfico del panel y recortaba la quincena en memoria: de
// las 123 filas de la 1ª de septiembre le llegaban 26, porque las mil que entraron eran las más
// viejas. La grilla dibujaba «·» sobre gente que había trabajado nueve horas, y el pie publicaba
// 206 h donde la asistencia mostraba 1.019. Asistencia no lo sufría por casualidad: pide sólo la
// quincena, que entra en una página.
//
// Un tope silencioso no se arregla achicando la ventana —el día que el plantel crezca vuelve—: se
// arregla paginando y declarando el caso en que la paginación tampoco alcanza.
//
// ═══ UNA SOLA FUENTE PARA LAS DOS PANTALLAS ═══
//
// Asistencia (`getQuincenaPorObra`) y Liquidación (`getDatosDeLaSolapaHoras`) leen las horas de la
// misma tabla, la misma ventana y el mismo filtro POR ESTA FUNCIÓN. Las columnas que pide cada una
// difieren —el panel necesita el autor y la obra, la grilla de asistencia no—, pero el conjunto de
// filas es el mismo por construcción: dos consultas escritas a mano se separan en el primer cambio
// de criterio, y eso es exactamente lo que produjo dos verdades sobre la misma quincena.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Lo que PostgREST puede devolver de una vez en esta base. Pedir más no trae más. */
const PAGINA = 1000

/**
 * TOPE DURO. Con 62 personas y 15 meses de historia no se llega ni a la mitad; si alguna vez se
 * llega, la lectura FALLA en vez de devolver una ventana incompleta que nadie puede distinguir de
 * una quincena tranquila. Es el mismo criterio que el resto del módulo: un control que no puede
 * decir «no sé» siempre dice «sí».
 */
const TOPE = 50_000

export interface VentanaDeHH {
  desde: string
  hasta: string
  /** La lista de columnas de PostgREST. Cada pantalla pide las suyas; las FILAS son las mismas. */
  columnas: string
}

/**
 * Todas las filas de `registros_hh` de la ventana, con persona cargada.
 *
 * El orden es por `id` y no por fecha: la paginación necesita un orden TOTAL. Dos filas de la misma
 * fecha sin desempate pueden salir en distinto orden en dos páginas y la segunda repetiría —o se
 * saltearía— una fila sin que nada lo diga.
 */
export async function leerRegistrosHH(
  supabase: SupabaseClient, v: VentanaDeHH,
): Promise<{ data: unknown[] | null; error: string | null }> {
  const filas: unknown[] = []
  for (;;) {
    const { data, error } = await supabase
      .from('registros_hh')
      .select(v.columnas)
      .gte('fecha', v.desde).lte('fecha', v.hasta)
      .not('persona_id', 'is', null)
      .order('id')
      .range(filas.length, filas.length + PAGINA - 1)
    if (error) return { data: null, error: error.message }
    const pagina = (data ?? []) as unknown[]
    if (pagina.length === 0) return { data: filas, error: null }
    filas.push(...pagina)
    // ═══ EL VIAJE DE CIERRE SE PAGA, Y SE PAGA A PROPÓSITO (11/09/2026) ═══
    //
    // Se probó cortar en cuanto un lote viene más chico que `PAGINA` —un viaje serial menos por
    // ventana— y se revirtió por dos razones, en este orden:
    //
    //  1 · ES FRÁGIL. `db-max-rows` vive en la configuración de Supabase y desde el código no se
    //      puede leer (`current_setting('pgrst.db_max_rows', true)` da null). Si fuese MENOR que
    //      `PAGINA`, todas las páginas vendrían «cortas» y la lectura devolvería la primera con
    //      `error: null`. Medido con un tope simulado de 500: 500 filas de 2.400, sin un error. Es
    //      exactamente el truncamiento silencioso que este archivo existe para impedir, reintroducido
    //      por la optimización. El test de abajo lo deja clavado.
    //  2 · NO RENDÍA NADA. Medido sobre la pantalla real el 11/09: las tres ventanas de
    //      `registros_hh` de la solapa «Horas» entran holgadas en una página, así que nunca se veía
    //      una página llena y el atajo no llegaba a activarse. Ahorro real: cero consultas.
    //
    // Una optimización que no se puede probar barata y que debilita el control no se queda «por las
    // dudas». Si algún día una ventana pasa de las mil filas, el lugar de la mejora es pedir menos
    // ventana, no adivinar dónde termina.
    if (filas.length > TOPE) {
      return {
        data: null,
        error: `La ventana ${v.desde}–${v.hasta} devolvió más de ${TOPE} registros de horas: `
          + 'la pantalla no puede afirmar que los tiene todos.',
      }
    }
  }
}
