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
import { leerNumeroEsAR } from '../../../shared/lib/numeroEsAR.ts'

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
 * liquidaría a alguien en cero con la misma cara con la que muestra un importe correcto. `'invalido'` cuando lo escrito
 * no es un número.
 *
 * ═══ SE LEE EN ES-AR, CON EL LECTOR ÚNICO (18/09/2026) ═══
 *
 * Antes se borraban TODOS los puntos: «8.5» salía 85 y «150000.50» salía 15.000.050. Ahora el texto pasa por
 * `leerNumeroEsAR` —el mismo de las celdas del cuadro—: «150.000» es miles, «8,5» y «8.5» son decimales, y lo que no es
 * un número (o es ambiguo, como «1.5.0») se RECHAZA con su motivo en vez de quedarse con los dígitos sueltos.
 */
function importeEscrito(v: string | number | null): number | null | 'invalido' {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : 'invalido'
  const leido = leerNumeroEsAR(v)
  return leido.ok ? leido.valor : 'invalido'
}

/**
 * VALIDA UNA TARIFA ANTES DE ESCRIBIRLA. El XOR, la fecha y el origen.
 *
 * `origen` es obligatorio porque la regla del repo es que ningún importe se muestra sin decir de
 * dónde salió: la pantalla escribe «$3.650 · acuerdo con el dueño 09/09» o no escribe el importe.
 */
export function validarTarifa(bruto: TarifaEnBruto): ResultadoDeTarifa {
  const vh = importeEscrito(bruto.valorHora)
  const nm = importeEscrito(bruto.netoMensual)
  if (vh === 'invalido' || nm === 'invalido') {
    return { ok: false, error: 'El importe no es un número: escribilo como 5.400 o 5.400,50.' }
  }
  const valorHora = vh
  const netoMensual = nm
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

/** Una fila de `persona_tarifa` ya leída. */
export interface TarifaExistente {
  desde: string
  valorHora: number | null
  netoMensual: number | null
}

export type PlanDeTarifa =
  | { accion: 'insertar' }
  | { accion: 'corregir'; antes: { valorHora: number | null; netoMensual: number | null } }
  | { accion: 'nada'; porque: string }
  | { accion: 'rechazar'; error: string }

/**
 * QUÉ HACER CON EL $/H (O EL NETO MENSUAL) QUE ALGUIEN ESCRIBIÓ PARA UNA QUINCENA. Una sola regla
 * para las tres pantallas que lo escriben: el cuadro de la quincena, el cuadro clásico y Pagos.
 *
 * ═══ POR QUÉ `desde` ES EL INICIO DE LA QUINCENA Y NO HOY ═══
 *
 * La liquidación elige la tarifa por fecha (`tarifaVigenteAl`). Un valor escrito el 20 con `desde`
 * = hoy no movía la quincena del 1 al 15 que se estaba mirando: se guardaba y la pantalla seguía
 * igual. Con el inicio de la quincena, lo que se escribe es lo que esa quincena cobra.
 *
 * ═══ FILA NUEVA O CORRECCIÓN (dueño, 14/09/2026: «Editar la misma quincena») ═══
 *
 *   sin fila en ese `desde`   → INSERTAR: es un aumento, y el valor anterior queda en su fila.
 *   con fila en ese `desde`   → CORREGIR esa fila, guardando lo que tenía en
 *                               `persona_tarifa_correccion`. Así un error de tipeo no queda como
 *                               un aumento, y el valor que había no se pierde.
 *   quincena cerrada          → nada: lo sellado no se reliquida (R6).
 *   el mismo valor que rige   → nada: ni una fila ni una corrección que no cambia nada.
 *
 * La forma no se cambia desde la celda: un $/h escrito sobre una fila de neto mensual le borraría el
 * neto a Oficina (CHECK «una sola forma»).
 */
export function planDeTarifa(e: {
  existentes: readonly TarifaExistente[]
  desde: string
  forma: 'hora' | 'mensual'
  valor: number
  estado: 'abierta' | 'cerrada'
}): PlanDeTarifa {
  if (!(e.valor > 0) || !Number.isFinite(e.valor)) {
    return { accion: 'rechazar', error: 'El importe tiene que ser mayor a cero.' }
  }
  if (!reliquidaAlCambiarTarifa(e.estado)) {
    return { accion: 'rechazar', error: 'La quincena está cerrada: el valor no se cambia.' }
  }
  const valorDe = (t: TarifaExistente) => (e.forma === 'hora' ? t.valorHora : t.netoMensual)
  const misma = e.existentes.find((t) => t.desde === e.desde)
  if (misma) {
    if (valorDe(misma) == null) {
      return { accion: 'rechazar', error: 'Esa quincena tiene la otra forma de tarifa: no la cambio desde la celda.' }
    }
    if (valorDe(misma) === e.valor) return { accion: 'nada', porque: 'Es el mismo valor.' }
    return { accion: 'corregir', antes: { valorHora: misma.valorHora, netoMensual: misma.netoMensual } }
  }
  const anterior = e.existentes
    .filter((t) => t.desde < e.desde)
    .reduce<TarifaExistente | null>((m, t) => (!m || t.desde > m.desde ? t : m), null)
  if (anterior && valorDe(anterior) === e.valor) return { accion: 'nada', porque: 'Es el mismo valor que ya rige.' }
  return { accion: 'insertar' }
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
