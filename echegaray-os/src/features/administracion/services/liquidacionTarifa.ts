// LA TARIFA DE UNA PERSONA: O VALE POR HORA, O VALE POR MES. NUNCA LAS DOS.
//
// `persona_tarifa` ya tiene el CHECK que lo impone en la base. Esto es el mismo criterio del lado
// del formulario, y no es una duplicación decorativa: el CHECK devuelve un error de Postgres que
// nadie puede leer, y quien está cargando la tarifa necesita saber CUÁL de los dos campos sobra
// antes de guardar. La cerradura es el CHECK; esto es el cartel en la puerta.
//
// ═══ POR QUÉ NO HAY HISTORIAL DE RETRIBUCIÓN Y SÍ HAY `desde` ═══
//
// Decisión del dueño (handoff v2, §1): la retribución NO tiene historial editable. Pero la tarifa
// sí lleva `desde`, porque recalcular una quincena de marzo tiene que usar la tarifa de marzo —
// `tarifaVigenteAl` en `liquidacionQuincena.ts` elige por fecha. El historial real de lo pagado lo
// hacen las quincenas CERRADAS, que sellan el valor hora que usaron.

/** Lo que se escribe en el formulario de tarifa. Todo texto: viene de un `<input>`. */
export interface TarifaEnBruto {
  valorHora: string | number | null
  netoMensual: string | number | null
  desde: string
  origen: string
}

export interface TarifaValida {
  valorHora: number | null
  netoMensual: number | null
  desde: string
  origen: string
}

export type ResultadoDeTarifa =
  | { ok: true; tarifa: TarifaValida }
  | { ok: false; error: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Un importe escrito a mano. `null` cuando la celda quedó vacía — NUNCA cero: una tarifa de $ 0
 * liquidaría a alguien en cero con la misma cara con la que muestra un importe correcto.
 */
function importeEscrito(v: string | number | null): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = v.trim()
  if (!s) return null
  const n = Number(s.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * VALIDA UNA TARIFA ANTES DE ESCRIBIRLA. El XOR, la fecha y el origen.
 *
 * `origen` es obligatorio porque la regla del repo es que ningún importe se muestra sin decir de
 * dónde salió: la pantalla escribe «$3.650 · acuerdo con el dueño 09/09» o no escribe el importe.
 */
export function validarTarifa(bruto: TarifaEnBruto): ResultadoDeTarifa {
  const valorHora = importeEscrito(bruto.valorHora)
  const netoMensual = importeEscrito(bruto.netoMensual)
  if (valorHora != null && netoMensual != null) {
    return { ok: false, error: 'Una tarifa es por hora O un neto mensual, nunca las dos: borrá una.' }
  }
  if (valorHora == null && netoMensual == null) {
    return { ok: false, error: 'Cargá el valor hora o el neto mensual. Sin ninguno de los dos no hay tarifa.' }
  }
  if ((valorHora ?? netoMensual ?? 0) <= 0) {
    return { ok: false, error: 'Una tarifa de $ 0 o negativa no es una tarifa: dejala sin cargar.' }
  }
  if (!ISO.test(bruto.desde)) {
    return { ok: false, error: 'La fecha «desde» va en formato AAAA-MM-DD.' }
  }
  const origen = bruto.origen.trim()
  if (origen.length < 3) {
    return { ok: false, error: 'Escribí de dónde sale la tarifa: ningún importe sin origen.' }
  }
  return { ok: true, tarifa: { valorHora, netoMensual, desde: bruto.desde, origen } }
}

export type EstadoDeTarifa =
  | { tipo: 'hora'; valorHora: number; desde: string; origen: string }
  | { tipo: 'mensual'; netoMensual: number; desde: string; origen: string }
  | { tipo: 'sin_tarifa' }

/**
 * QUÉ TARIFA RIGE, DICHO EN UNA PALABRA QUE LA PANTALLA PUEDE PINTAR.
 *
 * El caso `sin_tarifa` es el que importa: hoy son Alaniz, Castillo y Zogbe. La fila dice «sin
 * tarifa» y no suma al total — nunca $ 0.
 */
export function estadoDeTarifa(t: TarifaValida | null): EstadoDeTarifa {
  if (!t) return { tipo: 'sin_tarifa' }
  if (t.valorHora != null) {
    return { tipo: 'hora', valorHora: t.valorHora, desde: t.desde, origen: t.origen }
  }
  if (t.netoMensual != null) {
    return { tipo: 'mensual', netoMensual: t.netoMensual, desde: t.desde, origen: t.origen }
  }
  return { tipo: 'sin_tarifa' }
}

/**
 * ¿CAMBIAR LA TARIFA MUEVE ESTA QUINCENA? SÓLO SI ESTÁ ABIERTA.
 *
 * R6 con todas las letras: lo cerrado no se reliquida solo. Una quincena cerrada usó un valor hora
 * SELLADO en su línea; que el legajo diga otra cosa hoy es información, no una corrección
 * retroactiva. Reliquidar en silencio cambiaría plata ya entregada en mano.
 */
export function reliquidaAlCambiarTarifa(estadoQuincena: 'abierta' | 'cerrada'): boolean {
  return estadoQuincena === 'abierta'
}
