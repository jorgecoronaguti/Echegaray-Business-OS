// UN ADELANTO ES PLATA QUE YA SALIÓ, Y POR ESO SE RESTA. LA PREGUNTA ES DE QUÉ COLUMNA.
//
// R5 del handoff v2, en la frase del dueño: «un giro hecho ANTES de armar el lote no es un adelanto:
// va en ya transferido». Las dos se restan del mismo COBRA, así que confundirlas no cambia el total
// a pagar — cambia la conciliación del lote de haberes, que es la única forma de saber si el banco
// movió lo que el papel dice. Un giro previo contado como adelanto deja el lote descuadrado y nadie
// puede decir cuál de los dos números está mal.
//
// ═══ POR QUÉ ES UNA FUNCIÓN Y NO UNA COLUMNA QUE ALGUIEN ELIGE A MANO ═══
//
// Porque quien carga el movimiento sabe la fecha y el canal, que son datos; la clase es una
// CONCLUSIÓN de esos dos. Dejarla a elección convierte la conciliación en criterio personal.

/** Los dos canales por los que puede salir la plata. Efectivo nunca es un giro. */
export type CanalDeAdelanto = 'efectivo' | 'banco'

/** Las dos columnas de la cadena de pago que este movimiento puede alimentar. */
export type ClaseDeAdelanto = 'adelanto' | 'ya_transferido'

export interface MovimientoDeAdelanto {
  personaId: string
  quincena: string
  fecha: string
  importe: number
  canal: CanalDeAdelanto
  clase: ClaseDeAdelanto
}

/**
 * LA CLASE DE UN MOVIMIENTO. Efectivo siempre es adelanto; un giro depende de CUÁNDO se hizo.
 *
 * `loteArmadoEl` es la fecha en que se armó el lote de haberes de la quincena. `null` = todavía no
 * se armó, y entonces cualquier giro es previo por definición.
 */
export function claseDelMovimiento(
  { canal, fecha }: { canal: CanalDeAdelanto; fecha: string },
  loteArmadoEl: string | null,
): ClaseDeAdelanto {
  if (canal === 'efectivo') return 'adelanto'
  if (loteArmadoEl == null) return 'ya_transferido'
  return fecha < loteArmadoEl ? 'ya_transferido' : 'adelanto'
}

/** Lo que llega del formulario de «Registrar un adelanto». Todo texto: viene de `<input>`. */
export interface AdelantoEnBruto {
  personaId: string
  quincena: { desde: string; hasta: string }
  fecha: string
  importe: string | number
  canal: string
  nota: string
}

export interface AdelantoValido {
  personaId: string
  quincena: string
  fecha: string
  importe: number
  canal: CanalDeAdelanto
  nota: string | null
}

export type ResultadoDeAdelanto =
  | { ok: true; adelanto: AdelantoValido }
  | { ok: false; error: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function importeEscrito(v: string | number): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = v.trim()
  if (!s) return null
  const n = Number(s.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * VALIDA UN ADELANTO ANTES DE ESCRIBIRLO.
 *
 * La fecha tiene que caer DENTRO de la quincena que se está liquidando. Un adelanto fechado afuera
 * se resta de un COBRA que no le corresponde: le paga de menos a la persona en una quincena y de
 * más en la otra, y las dos quedan mal sin que ninguna lo diga.
 */
export function validarAdelanto(bruto: AdelantoEnBruto): ResultadoDeAdelanto {
  if (!UUID.test(bruto.personaId)) return { ok: false, error: 'Falta la persona.' }
  if (!ISO.test(bruto.fecha)) return { ok: false, error: 'La fecha va en formato AAAA-MM-DD.' }
  const { desde, hasta } = bruto.quincena
  if (bruto.fecha < desde || bruto.fecha > hasta) {
    return { ok: false, error: `El ${bruto.fecha} cae fuera de la quincena ${desde} a ${hasta}: se restaría del cobro equivocado.` }
  }
  const importe = importeEscrito(bruto.importe)
  if (importe == null) return { ok: false, error: 'Escribí el importe.' }
  if (importe <= 0) return { ok: false, error: 'Un adelanto de $ 0 o negativo no es un adelanto.' }
  if (bruto.canal !== 'efectivo' && bruto.canal !== 'banco') {
    return { ok: false, error: 'El canal es efectivo o banco.' }
  }
  const nota = bruto.nota.trim()
  return {
    ok: true,
    adelanto: {
      personaId: bruto.personaId,
      quincena: desde,
      fecha: bruto.fecha,
      importe: Math.round(importe * 100) / 100,
      canal: bruto.canal,
      nota: nota || null,
    },
  }
}

export interface RestasDeLaPersona {
  adelanto: number
  yaTransferido: number
}

/**
 * LO QUE SE LE RESTA A UNA PERSONA EN UNA QUINCENA, PARTIDO EN LAS DOS COLUMNAS.
 *
 * Es la función que la columna ADELANTO de la grilla consume. Devuelve ceros de verdad cuando no
 * hay movimientos: acá cero SÍ es un número —«no se le adelantó nada»— y es lo que la cadena resta.
 */
export function restasDeLaPersona(
  movimientos: readonly MovimientoDeAdelanto[], personaId: string, quincenaDesde: string,
): RestasDeLaPersona {
  let adelanto = 0
  let yaTransferido = 0
  for (const m of movimientos) {
    if (m.personaId !== personaId || m.quincena !== quincenaDesde) continue
    if (m.clase === 'ya_transferido') yaTransferido += m.importe
    else adelanto += m.importe
  }
  return {
    adelanto: Math.round(adelanto * 100) / 100,
    yaTransferido: Math.round(yaTransferido * 100) / 100,
  }
}
