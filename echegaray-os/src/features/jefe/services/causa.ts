// POR QUÉ SE DESVIÓ — la pregunta que la pantalla hace sola, y sólo cuando corresponde. PURA.
//
// ═══ EL AGUJERO QUE CIERRA ═══
//
// `public.obra_causa_desvio` tenía UNA fila repartida entre dieciocho obras. La columna existe desde
// `20260821T4500`, el catálogo tiene diecinueve causas y los permisos están puestos: lo que faltaba
// no era el modelo, era la PUERTA. Nadie escribía `obra_ejecucion.causa_desvio` porque ninguna
// pantalla la pedía, y una obra que se desvía sin causa registrada no le enseña nada a la próxima
// cotización — que es la regla de oro 16.
//
// ═══ POR QUÉ SE PREGUNTA ACÁ Y NO EN UN FORMULARIO DE CIERRE ═══
//
// Un formulario aparte es un formulario que nadie llena: el jefe de obra ya está en J06 cargando el
// avance del día, con el teléfono en la mano y el frente delante. La causa se pide EN ESE MOMENTO,
// pegada al número que la pantalla ya está pintando en rojo, o no se pide nunca.
//
// ═══ Y SÓLO CUANDO HAY DESVÍO ═══
//
// Pedirla siempre haría que se cargue cualquier cosa para poder guardar, y un catálogo lleno de
// «otro» es peor que un catálogo vacío: parece dato. Se pide cuando la tarea YA está fuera de
// objetivo por alguno de los dos números que J06 dibuja con alerta —el rendimiento y el plazo—, que
// son los mismos que decide `tarea.ts`. Sin repetir el umbral: si mañana cambia lo que cuenta como
// alerta, cambia en un solo lugar y esta pregunta lo sigue.
//
// ═══ NI SE EXIGE ═══
//
// El botón guarda igual, y lo dice: «Guardar sin explicar el desvío». Bloquear el parte por una
// causa faltante pierde la producción del día —el dato caro, medido en obra— para no perder la
// clasificación, que es el dato barato. La fricción es que la omisión quede escrita en el botón, no
// que el jefe se quede sin poder cargar.

import { plazoDe, rendimientoDe } from './tarea.ts'

export interface Desvio {
  /** La pantalla tiene que preguntar por qué. */
  pedir: boolean
  /** Qué está fuera de objetivo, en castellano de obra. `null` cuando no hay desvío. */
  motivo: string | null
}

const SIN_DESVIO: Desvio = { pedir: false, motivo: null }

/**
 * ¿ESTA TAREA ESTÁ FUERA DE OBJETIVO HOY?
 *
 * Las dos puntas son las de J06: consumir más horas de las que el plan le da a lo ya hecho, y
 * proyectar un fin posterior al de plan. NO se inventa un tercer umbral acá — `rendimientoDe` y
 * `plazoDe` ya deciden qué es alerta, están probadas, y son las que pintan el azulejo. Una segunda
 * definición de «desvío» daría una pantalla que muestra un número en rojo y no pregunta nada, o al
 * revés, y las dos versiones son indefendibles delante del jefe.
 *
 * Sin las dos puntas de un cálculo no hay alerta: `rendimientoDe` devuelve `alerta:false` y acá no
 * se pregunta. Es a propósito — preguntar por un desvío que no se pudo medir es pedir que alguien
 * invente la causa de algo que nadie afirmó.
 */
export function desvioDe(t: {
  hh_real: number | null
  hh_plan: number | null
  avance_pct: number | null
  fin_plan: string | null
  forecast_fin: string | null
}): Desvio {
  const r = rendimientoDe(t)
  const p = plazoDe(t)
  const motivos: string[] = []
  if (r.alerta && r.valor != null) {
    motivos.push(`consume ${Math.round((r.valor - 1) * 100)} % más horas de las que el plan da a lo hecho`)
  }
  if (p.alerta && p.dias != null) {
    motivos.push(`termina ${p.dias} ${p.dias === 1 ? 'día' : 'días'} después de lo previsto`)
  }
  if (motivos.length === 0) return SIN_DESVIO
  return { pedir: true, motivo: motivos.join(', y ') }
}

export const AVISO_OTRO =
  'Elegiste «Otra causa»: escribí cuál. Una causa sin nombre no se puede contar ni corregir.'

/**
 * LA ÚNICA REGLA DE ESCRITURA DE LA CAUSA, y vive acá porque la aplican DOS: el formulario, para
 * avisar antes de enviar, y la Server Action, porque el formulario es del cliente y no es evidencia
 * de nada.
 *
 * `otro` es la válvula de escape del catálogo cerrado y sin nota no clasifica nada: es exactamente
 * el texto libre que el catálogo vino a evitar, pero disfrazado de clave. El resto de las causas NO
 * exigen nota: obligarla convertiría un toque en un teclado y el jefe deja de cargar.
 */
export function validarCausa(d: { causa?: string | null; nota?: string | null }): string | null {
  if ((d.causa ?? '') === 'otro' && !(d.nota ?? '').trim()) return AVISO_OTRO
  return null
}

/**
 * LA INCIDENCIA DEL DÍA SE DECLARA UNA VEZ, aunque el guardado escriba varias filas.
 *
 * Medir por pasos inserta un `obra_ejecucion` POR PASO marcado. Copiar la causa en los cinco haría
 * que `obra_causa_desvio.n_incidencias` —que cuenta filas con causa— publique cinco incidencias
 * donde hubo una, y el análisis de causas de la obra quedaría inflado por el método de medición en
 * vez de por lo que pasó en la obra. La causa viaja en la primera fila; las demás quedan en null.
 */
export function soloEnLaPrimera<T extends object>(
  filas: T[], incidencia: { causa_desvio: string | null; comentario: string | null },
): (T & { causa_desvio: string | null; comentario: string | null })[] {
  return filas.map((f, i) => ({
    ...f,
    causa_desvio: i === 0 ? incidencia.causa_desvio : null,
    comentario: i === 0 ? incidencia.comentario : null,
  }))
}

/**
 * ¿ESTE DESVÍO YA ESTÁ EXPLICADO? — la razón por la que la pregunta no es empapelado.
 *
 * Medido el 03/09/2026 en `san-francisco`: las CINCUENTA Y UNA tareas abiertas proyectan fin después
 * del plan. Una pregunta ámbar que aparece en las cincuenta y una, todos los días, deja de leerse a
 * la tercera y el jefe aprende a saltearla — que es exactamente cómo se llega a una fila en
 * dieciocho obras.
 *
 * Así que la pregunta se apaga cuando ya fue contestada: si el último parte con causa de esta tarea
 * declara una, la pantalla la MUESTRA en tono neutro en vez de reclamarla en ámbar, y el botón deja
 * de acusar la omisión. Cambió el motivo, se toca otra causa y listo.
 *
 * Se mira el parte más reciente CON causa, no el más reciente a secas: los partes posteriores sin
 * causa son días normales, no una retractación.
 */
export function yaExplicado(partes: { fecha: string; causa_desvio: string | null }[]): {
  causa: string; fecha: string
} | null {
  const conCausa = partes.filter((p) => p.causa_desvio)
  if (conCausa.length === 0) return null
  const ultimo = conCausa.reduce((a, b) => (b.fecha > a.fecha ? b : a))
  return { causa: ultimo.causa_desvio as string, fecha: ultimo.fecha }
}
