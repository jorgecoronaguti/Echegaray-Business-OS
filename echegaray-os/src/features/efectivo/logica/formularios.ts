// EFECTIVO A RENDIR — lo que se valida antes de llamar a la base y cómo se lee lo que la base contesta.
//
// La base es la que hace cumplir las reglas (`entregar_efectivo`, `registrar_devolucion_efectivo`…);
// esto sólo evita el viaje cuando el formulario está incompleto y traduce el error a una frase. Puro.

import { leerNumeroEsAR } from '../../../shared/lib/numeroEsAR.ts'
import { numero, pesos } from './entregas.ts'

export const MIGRACION = '20260922T1500'

/** Lo que el panel D02 tiene escrito. Todo texto: así llega del formulario. */
export interface BorradorEntrega {
  persona: string
  destino: 'obra' | 'estructura' | null
  obra: string
  monto: string
  paraQue: string
}

export interface EntregaValida {
  persona: string
  obra: string | null
  estructura: boolean
  monto: number
  paraQue: string | null
}

export type Validacion<T> = { ok: true; dato: T } | { ok: false; error: string; campo: string }

/**
 * LOS CUATRO DATOS DE D02. Obra XOR estructura es el principio del diseño («toda entrega nace con obra o
 * con estructura declarada; no hay tercera opción») y el CHECK de la tabla: se valida acá para no mandar
 * a la base un formulario que ya se sabe que va a rebotar.
 */
export function validarEntrega(b: BorradorEntrega): Validacion<EntregaValida> {
  if (!b.persona.trim()) return { ok: false, campo: 'persona', error: 'Elegí a quién se le entrega.' }
  if (b.destino !== 'obra' && b.destino !== 'estructura') {
    return { ok: false, campo: 'destino', error: 'Elegí el destino: una obra o Estructura.' }
  }
  if (b.destino === 'obra' && !b.obra.trim()) return { ok: false, campo: 'obra', error: 'Elegí la obra.' }
  const m = validarMonto(b.monto)
  if (!m.ok) return m
  return {
    ok: true,
    dato: {
      persona: b.persona.trim(),
      obra: b.destino === 'obra' ? b.obra.trim() : null,
      estructura: b.destino === 'estructura',
      monto: m.dato,
      paraQue: b.paraQue.trim() || null,
    },
  }
}

/** Un monto en pesos escrito como se escribe acá («800.000», «$ 800.000», «1.500,50»): mayor que cero. */
export function validarMonto(texto: string): Validacion<number> {
  const l = leerNumeroEsAR(texto)
  if (!l.ok || l.valor == null) return { ok: false, campo: 'monto', error: 'Escribí el monto, por ejemplo 800.000.' }
  if (l.valor <= 0) return { ok: false, campo: 'monto', error: 'El monto tiene que ser mayor que cero.' }
  return { ok: true, dato: Math.round(l.valor * 100) / 100 }
}

/**
 * LA DEVOLUCIÓN DE D06. No puede superar lo que la persona tiene: la base también lo rechaza, pero decirlo
 * antes evita el viaje y el mensaje con números crudos.
 */
export function validarDevolucion(texto: string, enSuPoder: number): Validacion<number> {
  const m = validarMonto(texto)
  if (!m.ok) return m
  if (m.dato > enSuPoder) return { ok: false, campo: 'monto', error: `Tiene ${pesos(enSuPoder)} en su poder: no puede devolver más.` }
  return m
}

/**
 * QUÉ PASA AL REGISTRAR LA DEVOLUCIÓN: si deja la entrega en cero se cierra; si no, sigue abierta con el
 * resto. Y NO CIERRA CON UN TICKET EN CAMINO.
 *
 * `enCamino` entró el 22/09/2026 con un agujero medido en la base: ER-0005 tenía $ 120.000 en la mano y
 * un ticket observado de $ 30.000, y la devolución del total la cerró igual. Si ese ticket se cargaba
 * después, la entrega cerrada quedaba con «en su poder» negativo. Lo cierra la base
 * (`20260922T3000`); esto es lo que la pantalla promete ANTES de apretar, y las dos cuentas tienen que
 * decir lo mismo — prometer un cierre que la base va a negar es peor que no prometer nada.
 */
export function efectoDevolucion(
  monto: number | null, enSuPoder: number, enCamino = 0,
): { cierra: boolean; resto: number; frena: boolean } {
  if (monto == null || monto <= 0) return { cierra: false, resto: enSuPoder, frena: false }
  const resto = Math.round((enSuPoder - monto) * 100) / 100
  const enCero = resto === 0
  return { cierra: enCero && enCamino === 0, resto, frena: enCero && enCamino > 0 }
}

// ═══ LO QUE CONTESTA LA BASE ═══

export interface ErrorBase { code?: string | null; message?: string | null }

/** La base todavía no tiene el módulo: tabla, vista o función inexistente. No es «no hay datos». */
export function faltaMigracion(e: ErrorBase | null | undefined): boolean {
  if (!e) return false
  if (['PGRST205', '42P01', 'PGRST202', '42883'].includes(String(e.code ?? ''))) return true
  const m = String(e.message ?? '')
  return /could not find the (table|function)/i.test(m) || /relation "?[\w.]*"? does not exist/i.test(m)
}

const mayuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/**
 * UN IMPORTE CRUDO DE LA BASE, EN PESOS. `raise exception '% tiene % en su poder'` imprime «540000.00»:
 * se reescribe como «$ 540.000». Sólo números de cuatro cifras o más que no sean parte de un código
 * (ER-0141 queda como está).
 */
function conPesos(s: string): string {
  return s.replace(/(?<![\w-])(\d{4,}(?:\.\d{1,2})?)(?![\w.])/g, (_, n: string) => pesos(Number(n)))
}

/**
 * EL ERROR DE UNA FUNCIÓN DE LA BASE, EN UNA FRASE PARA QUIEN APRETÓ EL BOTÓN.
 *
 * Las funciones de la migración levantan P0001 con el motivo ya escrito en castellano («el monto tiene
 * que ser mayor que cero», «ER-0141 ya está cerrada»): se respeta, con mayúscula y los importes en pesos.
 * 42501 es permiso: el mensaje propio de la función si lo trae, uno genérico si es el de Postgres.
 */
export function mensajeDeError(e: ErrorBase): string {
  if (faltaMigracion(e)) {
    return `Efectivo a rendir todavía no está publicado en la base (migración ${MIGRACION}): no se registró nada.`
  }
  const msg = String(e.message ?? '').trim()
  if (e.code === '42501') {
    return msg && !/permission denied|row-level security/i.test(msg)
      ? `${mayuscula(msg)}.`
      : 'Esto es de Dirección, Administración o Jefe de obra.'
  }
  if (e.code === '23514') return 'La entrega va a una obra o a Estructura, y el monto es mayor que cero.'
  if (e.code === '23503') return 'La persona o la obra elegida ya no existe.'
  if (e.code === 'P0001' && msg) return `${mayuscula(conPesos(msg))}.`.replace(/\.\.$/, '.')
  return msg ? mayuscula(conPesos(msg)) : 'No se pudo registrar. Probá de nuevo.'
}

// ═══ LAS FRASES DE «AL CONFIRMAR» (D02) ═══

/**
 * Lo que va a pasar, dicho antes de confirmar. Sólo lo que de verdad pasa: la plata sale de Efectivo y
 * queda a nombre de la persona; a la obra no le suma consumido (el gasto nace con la fila de Compras).
 */
export function frasesAlEntregar(args: { monto: number | null; persona: string | null; obra: string | null; estructura: boolean }): string[] {
  const monto = args.monto != null && args.monto > 0 ? pesos(args.monto) : '$ —'
  const quien = args.persona ?? 'la persona elegida'
  const out = [`Salen ${monto} de Efectivo y quedan a nombre de ${quien}.`]
  if (args.estructura) out.push('Va a Estructura: no suma a lo consumido de ninguna obra hasta que se rinda.')
  else if (args.obra) out.push(`${args.obra} no suma nada a consumido hasta que se rinda: el gasto nace con la fila de Compras.`)
  out.push('Le llega el aviso con el enlace para dar conformidad y firmar.')
  return out
}

/** «Entregar $ 800.000», o sólo «Entregar» mientras no hay monto válido. */
export function verboEntregar(monto: number | null): string {
  return monto != null && monto > 0 ? `Entregar $ ${numero(monto)}` : 'Entregar'
}
