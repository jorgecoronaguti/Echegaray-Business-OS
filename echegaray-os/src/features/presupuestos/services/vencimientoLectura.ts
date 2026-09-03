// CUÁNDO UNA LECTURA DEJÓ DE ESTAR VIVA.
//
// Si el worker muere entre LEYENDO y el LISTO final, la fila queda en LEYENDO para siempre y la
// pantalla sondea infinito; destrabarla exigía SSH y un UPDATE a mano — el caso «no funciona sin
// Claude Code» en estado puro.
//
// La regla vive acá, en una función PURA con su test, y no adentro del route handler: un control
// enterrado en una ruta de Next sólo se puede probar levantando Next, y entonces no se prueba.
//
// EL VEREDICTO FINAL LO DA SQL. `public.cotizacion_lectura_vencer()` revalida el umbral antes de
// escribir. Esto decide únicamente si vale la pena preguntar — el GET se llama cada 1,5 s y no
// puede disparar un RPC en cada vuelta.

/** Espejo de `interval '10 minutes'` en la migración
 *  `20260903T1600_la_lectura_del_plano_se_mide_se_cancela_y_no_queda_colgada`.
 *
 *  POR QUÉ 10: el handler late (`actualizado = now()`) cada 60 s mientras corre, además de escribir
 *  por cada lámina/vista terminada. Diez minutos son DIEZ latidos perdidos seguidos — ninguna
 *  corrida viva los pierde, y una muerta se destraba sola antes de que el dueño tenga que pedir
 *  ayuda. Bajarlo mucho más empieza a matar corridas vivas cada vez que la VM tose; subirlo deja al
 *  dueño mirando una barra que no avanza. */
export const MINUTOS_SIN_LATIDO = 10

export type FilaParaVencer = { estado?: string | null; actualizado?: string | null }

/**
 * `true` sólo cuando la fila está en LEYENDO y hace más de `MINUTOS_SIN_LATIDO` que no se toca.
 *
 * ENCOLADO NO VENCE A PROPÓSITO: una tarea puede esperar en cola legítimamente mientras el worker
 * termina OTRA lectura (que dura minutos), y desde afuera no hay forma de distinguir «el worker está
 * muerto» de «el worker está ocupado». Vencer una tarea que después se va a procesar deja la fila
 * peor que antes — y una tarea encolada, además, todavía no gastó un centavo.
 */
export function pareceColgada(fila: FilaParaVencer, ahora: number = Date.now()): boolean {
  if (fila?.estado !== 'LEYENDO') return false
  if (!fila.actualizado) return false
  const ultimoLatido = Date.parse(fila.actualizado)
  // Una fecha ilegible NO es una prueba de muerte: ante la duda no se mata un trabajo que puede
  // estar corriendo y pagando llamadas de visión.
  if (!Number.isFinite(ultimoLatido)) return false
  return ahora - ultimoLatido > MINUTOS_SIN_LATIDO * 60_000
}
