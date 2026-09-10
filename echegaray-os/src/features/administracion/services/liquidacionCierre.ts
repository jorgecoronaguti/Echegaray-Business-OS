// CERRAR SELLA. REABRIR AVISA CUÁNTO CAMBIA ANTES DE CAMBIARLO.
//
// R6 del handoff v2. Al cerrar quedan congelados por línea: las horas, el valor hora usado, la
// categoría y el convenio con los que se liquidó, las cuatro celdas escritas y el costo cargado a
// cada obra. Sin eso, la pantalla 11 («$/h hoy: cambió / igual») no tiene contra qué comparar y la
// comparación se convierte en «igual» siempre — la peor de las dos respuestas, porque afirma que no
// pasó nada.
//
// ═══ POR QUÉ EL CIERRE SE BLOQUEA EN VEZ DE AVISAR ═══
//
// Un cierre es irreversible sin dejar firma: reabrir pide motivo escrito y queda con autor y fecha.
// Cerrar con pendientes sellaría en la base una liquidación que a alguien le falta plata, y el
// sello la vuelve indistinguible de una correcta. El botón se deshabilita Y DICE POR QUÉ: un botón
// gris sin explicación manda a la persona a adivinar cuál de las 17 filas lo está trabando.

import type { ModalidadDeLiquidacion } from './liquidacionQuincena.ts'

/** Lo mínimo que el cierre necesita saber de una línea. Es un subconjunto de `LineaLiquidada`. */
export interface LineaParaCerrar {
  personaId: string
  nombre: string
  /** Jefe de obra según `esJefeDeObra(puesto)`. Opcional: viaja para AGRUPAR, no decide plata. */
  esJefe?: boolean
  horas: number | null
  valorHora: number | null
  /** El neto mensual acordado (Oficina). XOR con `valorHora`, como en `persona_tarifa`. */
  netoMensual: number | null
  /** Qué tarifa exige esta línea: es lo que decide cuál de las dos se reclama como faltante. */
  modalidad: ModalidadDeLiquidacion
  cobra: number | null
  porBanco: number
  enEfectivo: number | null
  total: number | null
  sinTarifa: boolean
  reciboSinGiro: boolean
  /** Horas de la quincena que ningún registro imputó a una obra. Van a Estructura. */
  horasSinObra?: number
}

/**
 * LA TARIFA QUE FALTA ES LA DE SU MODALIDAD, NO SIEMPRE EL VALOR HORA.
 *
 * ═══ EL DEFECTO QUE ESTA FUNCIÓN EXISTE PARA IMPEDIR ═══
 *
 * El cierre contaba como pendiente a toda línea con `valorHora == null`, y la gente de Oficina
 * cobra un neto mensual POR DEFINICIÓN: su valor hora es NULL siempre. Con el plantel real —que
 * tiene Oficina— el botón «Cerrar y sellar» no se habilitaba nunca, y el módulo entero no podía
 * cerrar una sola quincena. R1 (NULL nunca es cero) sigue en pie: lo que cambia es CUÁL null
 * bloquea. Un neto mensual cargado no es «sin tarifa».
 */
function faltaLaTarifa(l: LineaParaCerrar): boolean {
  if (l.sinTarifa) return true
  if (l.modalidad === 'hora') return l.valorHora == null
  if (l.modalidad === 'mensual') return l.netoMensual == null
  return false
}

export interface Pendiente {
  clave: string
  texto: string
  cuantas: number
}

export interface EstadoDeCierre {
  puedeCerrar: boolean
  pendientes: Pendiente[]
  /** Cuántas quedan liquidadas de cuántas: «16 de 17» de la pantalla 10. */
  liquidadas: number
  personas: number
  /** Lo que se va a sellar como total a pagar. NO incluye las líneas que no se pudieron liquidar. */
  totalSellado: number
}

const redondear2 = (n: number): number => Math.round(n * 100) / 100

/**
 * QUÉ FALTA PARA PODER CERRAR, EN LA LISTA QUE LA PANTALLA MUESTRA AL LADO DEL BOTÓN.
 *
 * El recibo sin giro NO bloquea (R7: es un estado legítimo, la plata sale en efectivo), pero se
 * informa igual: es lo que alguien tiene que ir a mirar al extracto.
 */
export function estadoDeCierre(lineas: readonly LineaParaCerrar[]): EstadoDeCierre {
  const pendientes: Pendiente[] = []
  const sinTarifa = lineas.filter(faltaLaTarifa)
  const sinCobra = lineas.filter((l) => !l.sinTarifa && l.cobra == null)
  const noCierra = lineas.filter((l) => (
    l.cobra != null && l.enEfectivo != null && l.total != null
    && Math.abs(l.total - (l.porBanco + l.enEfectivo)) > 0.5
  ))
  if (sinTarifa.length) {
    pendientes.push({
      clave: 'sin-tarifa',
      cuantas: sinTarifa.length,
      texto: `${sinTarifa.length} sin tarifa cargada (${sinTarifa.map((l) => l.nombre).join(', ')}): sellar su línea escribiría un valor hora que nadie acordó.`,
    })
  }
  if (sinCobra.length) {
    pendientes.push({
      clave: 'sin-cobra',
      cuantas: sinCobra.length,
      texto: `${sinCobra.length} sin importe calculable: falta el dato, no es $ 0.`,
    })
  }
  if (noCierra.length) {
    pendientes.push({
      clave: 'no-cierra',
      cuantas: noCierra.length,
      texto: `${noCierra.length} donde por banco + efectivo no da el total.`,
    })
  }
  const liquidables = lineas.filter((l) => l.cobra != null && !l.sinTarifa)
  return {
    puedeCerrar: pendientes.length === 0 && lineas.length > 0,
    pendientes,
    liquidadas: liquidables.length,
    personas: lineas.length,
    totalSellado: redondear2(liquidables.reduce((a, l) => a + (l.total ?? 0), 0)),
  }
}

/** Lo que la persona tiene HOY en el legajo, y que la quincena copia al sellar. */
export interface LegajoAlCerrar {
  personaId: string
  categoria: string | null
  convenio: string | null
}

export interface LineaSellada {
  persona_id: string
  horas: number | null
  /** `null` SÓLO cuando la línea no se liquida por hora (Oficina, liquidación final). Ver abajo. */
  valor_hora: number | null
  categoria_sellada: string | null
  convenio_sellado: string | null
  sellado_en: string
}

/**
 * EL SELLO, LÍNEA POR LÍNEA.
 *
 * Una línea que se liquida POR HORA y no tiene valor hora NO se sella: se devuelve en `sinSellar`.
 * El CHECK de la base (`liquidacion_linea_sellado_coherente`) rechazaría un sello sin fecha, pero
 * nada impediría sellar un `valor_hora` NULL — y en una línea por hora ese NULL diría «se liquidó
 * sin tarifa», que es una afirmación falsa sobre plata que se entregó en mano.
 *
 * ═══ OFICINA SE SELLA CON `valor_hora` EN NULL, Y ES LO CORRECTO ═══
 *
 * `liquidacion_linea` no tiene columna de neto mensual: el neto acordado de Oficina ya queda
 * escrito en `cobra` de la línea (lo escribe `escribirFoto`), que es exactamente lo que se pagó.
 * Inventar un valor hora dividiendo el neto por las horas del mes sería fabricar un dato que nadie
 * acordó y que la pantalla 11 después compararía contra la tarifa vigente. Lo que se congela de
 * Oficina es categoría, convenio y `sellado_en`; el importe, en `cobra`.
 */
export function sellarLineas(
  lineas: readonly LineaParaCerrar[], legajos: readonly LegajoAlCerrar[], selladoEn: string,
): { selladas: LineaSellada[]; sinSellar: string[] } {
  const porPersona = new Map(legajos.map((l) => [l.personaId, l]))
  const selladas: LineaSellada[] = []
  const sinSellar: string[] = []
  for (const l of lineas) {
    if (l.modalidad === 'hora' && l.valorHora == null) { sinSellar.push(l.nombre); continue }
    const legajo = porPersona.get(l.personaId)
    selladas.push({
      persona_id: l.personaId,
      horas: l.horas,
      valor_hora: l.modalidad === 'hora' ? l.valorHora : null,
      categoria_sellada: legajo?.categoria ?? null,
      convenio_sellado: legajo?.convenio ?? null,
      sellado_en: selladoEn,
    })
  }
  return { selladas, sinSellar }
}

export type ComparacionDeValorHora = 'cambió' | 'igual' | 'sin dato'

/**
 * LA COLUMNA «$/h HOY» DE LA QUINCENA CERRADA. Informativa: no cambia nada.
 *
 * `sin dato` no es `igual`. Si hoy la persona no tiene tarifa vigente, decir «igual» afirmaría que
 * la retribución se mantuvo — cuando lo que pasó es que desapareció.
 */
export function compararValorHora(
  sellado: number | null, hoy: number | null,
): ComparacionDeValorHora {
  if (sellado == null || hoy == null) return 'sin dato'
  return Math.abs(sellado - hoy) < 0.005 ? 'igual' : 'cambió'
}

/** Lo que quedó sellado en `liquidacion_linea` para una persona. `null` = la columna vino vacía. */
export interface SelloDeLinea {
  horas: number | null
  valorHora: number | null
  cobra: number | null
  porBanco: number | null
  enEfectivo: number | null
  total: number | null
}

/** Una fila de la pantalla 11: lo sellado, el $/h de hoy y el veredicto de la comparación. */
export interface FilaDeQuincenaCerrada extends SelloDeLinea {
  personaId: string
  nombre: string
  valorHoraSellado: number | null
  valorHoraHoy: number | null
  comparacion: ComparacionDeValorHora
}

/**
 * LAS FILAS DE LA QUINCENA CERRADA — SELLADO CONTRA VIGENTE, DOS FUENTES DISTINTAS.
 *
 * ═══ EL DEFECTO QUE ESTA FUNCIÓN EXISTE PARA IMPEDIR ═══
 *
 * La pantalla comparaba `compararValorHora(l.valorHora, l.valorHora)`: el mismo número contra sí
 * mismo, así que decía «igual» siempre. Un control que no puede dar rojo no es un control, y éste
 * además AFIRMA algo —«la retribución no se movió»— que nadie verificó. El sellado sale de
 * `liquidacion_linea` y el vigente de `persona_tarifa`: si las dos entradas fueran la misma, la
 * columna volvería a mentir.
 *
 * Una persona sin línea sellada queda con todo en `null` y comparación «sin dato». No se completa
 * con el cálculo de hoy: eso publicaría como pagado algo que el cierre nunca selló.
 */
export function filasDeQuincenaCerrada(
  lineas: readonly { personaId: string; nombre: string; horas: number | null }[],
  sellado: ReadonlyMap<string, SelloDeLinea>,
  vigenteHoy: ReadonlyMap<string, number>,
): FilaDeQuincenaCerrada[] {
  return lineas.map((l) => {
    const s = sellado.get(l.personaId)
    const valorHoraSellado = s?.valorHora ?? null
    const valorHoraHoy = vigenteHoy.get(l.personaId) ?? null
    return {
      personaId: l.personaId,
      nombre: l.nombre,
      horas: s?.horas ?? l.horas,
      valorHora: valorHoraSellado,
      cobra: s?.cobra ?? null,
      porBanco: s?.porBanco ?? null,
      enEfectivo: s?.enEfectivo ?? null,
      total: s?.total ?? null,
      valorHoraSellado,
      valorHoraHoy,
      comparacion: compararValorHora(valorHoraSellado, valorHoraHoy),
    }
  })
}

export interface DiferenciaDeReapertura {
  personaId: string
  nombre: string
  valorHoraSellado: number | null
  valorHoraHoy: number | null
  cobraSellado: number | null
  cobraRecalculado: number | null
  diferencia: number | null
}

export interface AvisoDeReapertura {
  filas: DiferenciaDeReapertura[]
  /** Sólo las que cambian. Es lo que el aviso muestra ANTES de guardar. */
  cambian: DiferenciaDeReapertura[]
  total: number
  /** `true` = recalcular con la retribución vigente no mueve un peso. */
  sinCambios: boolean
}

/**
 * QUÉ PASARÍA SI SE REABRE — CALCULADO ANTES DE TOCAR NADA.
 *
 * El dueño lo pidió con esas palabras: «recalcula con la retribución vigente y avisa la diferencia
 * ANTES de guardar». Reabrir y mostrar el resultado después es pedirle a alguien que compare contra
 * un número que ya no existe.
 */
export function avisoDeReapertura(
  lineas: readonly { personaId: string; nombre: string; horas: number | null; valorHoraSellado: number | null; cobraSellado: number | null }[],
  valorHoraHoyDe: (personaId: string) => number | null,
): AvisoDeReapertura {
  const filas = lineas.map((l) => {
    const hoy = valorHoraHoyDe(l.personaId)
    const recalculado = hoy == null || l.horas == null ? null : redondear2(l.horas * hoy)
    return {
      personaId: l.personaId,
      nombre: l.nombre,
      valorHoraSellado: l.valorHoraSellado,
      valorHoraHoy: hoy,
      cobraSellado: l.cobraSellado,
      cobraRecalculado: recalculado,
      diferencia: recalculado == null || l.cobraSellado == null
        ? null
        : redondear2(recalculado - l.cobraSellado),
    }
  })
  const cambian = filas.filter((f) => f.diferencia == null || Math.abs(f.diferencia) > 0.005)
  return {
    filas,
    cambian,
    total: redondear2(cambian.reduce((a, f) => a + (f.diferencia ?? 0), 0)),
    sinCambios: cambian.length === 0,
  }
}

export type ResultadoDeMotivo = { ok: true; motivo: string } | { ok: false; error: string }

/**
 * EL MOTIVO DE LA REAPERTURA. Escrito, no un desplegable.
 *
 * Un desplegable de motivos frecuentes convierte la firma en un clic: «otro» explica lo mismo que
 * el silencio. Diez caracteres es el piso donde «ok» y «error» dejan de pasar.
 */
export function validarMotivoDeReapertura(texto: string): ResultadoDeMotivo {
  const motivo = texto.trim().replace(/\s+/g, ' ')
  if (motivo.length < 10) {
    return { ok: false, error: 'Escribí por qué se reabre: una quincena cerrada ya se pagó, y el motivo es lo único que explica el cambio.' }
  }
  return { ok: true, motivo }
}
