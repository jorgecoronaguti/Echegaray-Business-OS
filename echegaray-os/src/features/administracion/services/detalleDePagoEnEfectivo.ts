// EL DETALLE DE UNA CELDA «PAGADO EN EFECTIVO», DICHO PARA QUIEN LIQUIDA (dueño, 02/10/2026).
//
// Pedido textual: «tiene que ser más preciso de qué se anotó, qué día y quién lo hizo y si hay alguna nota».
//
// ═══ QUÉ DECIDE ESTE ARCHIVO ═══
//
// La celda guarda UN importe acumulado por persona y quincena. Quien paga lo escribe a veces como suma
// («=51000+60000+51000+75000»: cuatro entregas) y la base anota cada cambio (`liquidacion_cambio`, desde el 30/09).
// Acá se traduce eso a una lista de PAGOS, uno por renglón, cada uno con su día, su autor y su nota, o con la
// frase que dice por qué no hay dato. Es puro: sin base ni navegador, para poder probar los tres casos que importan
// (suma, anterior al 30/09, corrección) sin armar una pantalla.
//
// ═══ DOS PASOS, PORQUE EL DATO VIVE EN DOS LADOS ═══
//
//   renglonesDePagoEnEfectivo   corre en el SERVIDOR, que es quien tiene los nombres y el cruce con la actividad de la
//                               app. Devuelve sólo texto ya dicho: al navegador no viaja un solo id ni un mail.
//   detalleDePagoEnEfectivo     corre en el cliente: le agrega el título y el total, que dependen de la fila que se
//                               está mirando (persona e importe de hoy) y no de la base.
//
// ═══ LO QUE NO SE AFIRMA ═══
//
//   · Lo anterior al 30/09/2026 no tiene autor ni día: se dice «no quedó registrado quién ni qué día».
//   · El DÍA DEL PAGO sale de `liquidacion_pago_efectivo`, que puede no existir todavía (migración sin aplicar):
//     sin ella el renglón no trae día de pago, y no lo reemplaza por el día en que se tipeó.
//   · La NOTA sólo se muestra si la tabla de pagos la trae. Hoy ninguna pantalla escribe una: «Sin nota» es cierto.
//   · Un renglón «de la siembra» (fecha dicha por el dueño al activar el registro de pagos) lleva su día con el
//     aviso de que se asignó en bloque; su nota técnica no es la nota de nadie.

import { leerNumeroEsAR } from '../../../shared/lib/numeroEsAR.ts'
import { pesos } from '../components/liquidacion/formato.ts'
import { atribucionDelPrevio, INICIO_DEL_REGISTRO, type CambioCrudo, type CruceConElRegistro } from './historialDeManuales.ts'

/** Una fila de `liquidacion_pago_efectivo` (0 o más por persona y quincena). */
export interface PagoEfectivoCrudo {
  liquidacion_id: string
  persona_id: string
  grupo: string
  /** Día en que salió el dinero, `YYYY-MM-DD`. */
  fecha: string
  importe: number | string
  origen: 'caja' | 'entrega'
  registrado_por: string | null
  registrado_en: string
  clave: string
  nota: string | null
}

export type TipoDeRenglon = 'pago' | 'correccion' | 'baja'

export interface RenglonDePago {
  id: string
  tipo: TipoDeRenglon
  /** `$51.000`. En una corrección, el importe nuevo; en una baja, «—». */
  importe: string
  /** «corrigió de $100.000 a $90.000» / «borró lo anotado…». `null` en un pago común. */
  correccion: string | null
  /** «01/10/2026, 14:32» o «Antes del 30/09/2026». */
  cuando: string
  /** Un nombre, o la frase que dice por qué no hay. */
  quien: string
  /** `16/09/2026`. `null` = no hay dato de cuándo salió la plata. */
  fechaDelPago: string | null
  /** El texto de la nota, o «Sin nota». */
  nota: string
  /** Cómo se anotó, sólo cuando aclara algo («al marcar la línea como pagada»). */
  como: string | null
  /** La plata salió de una entrega a rendir: no vuelve a bajar la caja. */
  deEntrega: boolean
}

export interface AnotacionesDePago {
  renglones: RenglonDePago[]
  /** La cuenta tal como se escribió, sin el «=», sólo si es una suma de verdad. */
  cuenta: string | null
}

export interface DetalleDePago {
  titulo: string
  total: string
  renglones: RenglonDePago[]
  /** «se escribió como 51000+60000». `null` si fue un número solo. */
  cuenta: string | null
  /** Qué significa el punto amarillo. */
  leyendaDelPunto: string
}

export const SIN_DATO_PREVIO = 'no quedó registrado quién ni qué día'
const SIN_NOTA = 'Sin nota'
const LEYENDA_DEL_PUNTO = 'Punto amarillo: importe escrito a mano. Manda sobre el cálculo del sistema.'
/** Misma ventana que la actividad del cambio: la tabla de pagos y la de cambios se escriben en la misma transacción. */
const TOLERANCIA_MS = 5000

const CENTAVO = 0.01

/**
 * LOS PAGOS QUE COMPONEN UN IMPORTE. Sólo se parte una suma de números sueltos que CIERRA con el importe: una
 * cuenta guardada que quedó vieja, un producto o un paréntesis no son «pagos» y se devuelven como un solo importe.
 */
export function sumandosDe(cuenta: string | null, valor: number | null): number[] {
  if (valor == null) return []
  if (!cuenta) return [valor]
  const cuerpo = cuenta.trim().replace(/^=/, '')
  if (!/^[\d.,\s$+]+$/.test(cuerpo)) return [valor]
  const trozos = cuerpo.split('+').map((t) => t.trim())
  if (trozos.some((t) => t === '')) return [valor]
  const numeros: number[] = []
  for (const t of trozos) {
    const n = leerNumeroEsAR(t)
    if (!n.ok || n.valor == null) return [valor]
    numeros.push(n.valor)
  }
  const suma = numeros.reduce((a, b) => a + b, 0)
  return Math.abs(suma - valor) <= CENTAVO ? numeros : [valor]
}

/** La cuenta como se escribió, sólo si es una suma con más de un pago. */
const cuentaVisible = (cuenta: string | null, valor: number | null): string | null =>
  cuenta && sumandosDe(cuenta, valor).length > 1 ? cuenta.trim().replace(/^=/, '').replace(/\s+/g, '') : null

const ZONA = 'America/Argentina/Buenos_Aires'
const partesDe = (d: Date): Record<string, string> =>
  new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((a, p) => ({ ...a, [p.type]: p.value }), {})

/** `01/10/2026, 14:32` en la hora de la empresa (no la del servidor: Vercel corre en UTC). */
function diaYHora(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'sin fecha'
  const p = partesDe(d)
  return `${p.day}/${p.month}/${p.year}, ${p.hour}:${p.minute}`
}

const diaDeIso = (iso: string): string => diaYHora(iso).split(',')[0]
const diaDeFecha = (f: string): string => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`

const COMO: Record<string, string> = {
  pago: 'al marcar la línea como pagada',
  sin_sello: 'desde el chat o una sincronización',
}

const num = (v: number | string | null): number | null => (v == null ? null : Number(v))

function quienDe(f: CambioCrudo, nombres: ReadonlyMap<string, string>, respaldo: string | null): string {
  const id = f.autor ?? respaldo
  if (id) return nombres.get(id) ?? 'usuario no identificado'
  return f.origen === 'sin_sello' ? 'el chat o una sincronización, sin una persona' : 'no quedó registrado quién'
}

interface Contexto {
  nombres: ReadonlyMap<string, string>
  cruce: CruceConElRegistro | null
  pagos: readonly PagoEfectivoCrudo[] | null
}

function renglonesDelPrevio(f: CambioCrudo, c: Contexto, siembra: PagoEfectivoCrudo | undefined): RenglonDePago[] {
  const valor = num(f.despues)
  const a = atribucionDelPrevio(f, c.nombres, c.cruce)
  const cuando = a.cuando ?? `Antes del ${diaDeIso(INICIO_DEL_REGISTRO).slice(0, 10)}`
  const quien = a.motivo === 'atribuido' ? `${a.quien} (según la actividad de la app a esa hora)`
    : a.cuando ? 'no se pudo saber quién' : SIN_DATO_PREVIO
  const fechaDelPago = siembra ? `${diaDeFecha(siembra.fecha)} (día asignado en bloque, no el de cada pago)` : null
  return sumandosDe(f.formula_despues, valor).map((n, i) => ({
    id: `${f.id}-${i}`, tipo: 'pago', importe: pesos(n), correccion: null, cuando, quien, fechaDelPago, nota: SIN_NOTA, como: null,
    deEntrega: false,
  }))
}

/** El pago que se escribió en la misma transacción que este cambio (no el de la siembra ni uno ya usado). */
function pagoDelCambio(f: CambioCrudo, pagos: readonly PagoEfectivoCrudo[], usados: Set<string>): PagoEfectivoCrudo | undefined {
  const t = Date.parse(f.en)
  let mejor: PagoEfectivoCrudo | undefined
  let dist = Infinity
  for (const p of pagos) {
    if (p.clave.startsWith('siembra:') || usados.has(p.clave)) continue
    const d = Math.abs(Date.parse(p.registrado_en) - t)
    if (d <= TOLERANCIA_MS && d < dist) { mejor = p; dist = d }
  }
  if (mejor) usados.add(mejor.clave)
  return mejor
}

function renglonesDelCambio(
  f: CambioCrudo, c: Contexto, anterior: number[], pago: PagoEfectivoCrudo | undefined,
): { renglones: RenglonDePago[]; sumandos: number[] } {
  const antes = num(f.antes)
  const despues = num(f.despues)
  const base = {
    cuando: diaYHora(f.en), quien: quienDe(f, c.nombres, pago?.registrado_por ?? null),
    fechaDelPago: pago ? diaDeFecha(pago.fecha) : null,
    nota: pago?.nota?.trim() || SIN_NOTA,
    como: f.origen ? COMO[f.origen] ?? null : null,
    deEntrega: pago?.origen === 'entrega',
  }
  if (despues == null) {
    return {
      sumandos: [],
      renglones: [{
        ...base, id: String(f.id), tipo: 'baja', importe: '—',
        correccion: `borró lo anotado (${pesos(antes)}): vuelve al cálculo del sistema`,
      }],
    }
  }
  const sumandos = sumandosDe(f.formula_despues, despues)
  const agregados = sumandos.length > anterior.length && anterior.every((n, i) => n === sumandos[i])
    ? sumandos.slice(anterior.length) : null
  if (antes == null || antes === 0 || agregados) {
    // «Anotó» (no había nada o sólo se agregaron sumandos): cada sumando nuevo es un pago.
    const nuevos = agregados ?? sumandos
    return {
      sumandos,
      renglones: nuevos.map((n, i) => ({ ...base, id: `${f.id}-${i}`, tipo: 'pago' as const, importe: pesos(n), correccion: null })),
    }
  }
  return {
    sumandos,
    renglones: [{ ...base, id: String(f.id), tipo: 'correccion', importe: pesos(despues), correccion: `corrigió de ${pesos(antes)} a ${pesos(despues)}` }],
  }
}

/**
 * LOS RENGLONES DE UNA CELDA, EN ORDEN CRONOLÓGICO (lo más viejo primero: se lee como se fue pagando).
 * `cambios` son las filas crudas de ESA celda en cualquier orden; `pagos` es `null` cuando la tabla de pagos no existe.
 */
export function renglonesDePagoEnEfectivo(
  { cambios, pagos, nombres, cruce }: { cambios: readonly CambioCrudo[]; pagos: readonly PagoEfectivoCrudo[] | null } & Omit<Contexto, 'pagos'>,
): AnotacionesDePago {
  const c: Contexto = { nombres, cruce, pagos }
  const cronologico = [...cambios].sort((a, b) => Date.parse(a.en) - Date.parse(b.en) || a.id - b.id)
  const previos = cronologico.filter((f) => f.tipo === 'base')
  const reales = cronologico.filter((f) => f.tipo !== 'base')
  const siembra = pagos?.find((p) => p.clave.startsWith('siembra:'))
  const usados = new Set<string>()
  const renglones: RenglonDePago[] = previos.flatMap((f) => renglonesDelPrevio(f, c, siembra))
  let sumandos: number[] = previos.length > 0 ? sumandosDe(previos[previos.length - 1].formula_despues, num(previos[previos.length - 1].despues)) : []
  for (const f of reales) {
    const r = renglonesDelCambio(f, c, sumandos, pagos ? pagoDelCambio(f, pagos, usados) : undefined)
    renglones.push(...r.renglones)
    sumandos = r.sumandos
  }
  const ultimo = reales.length > 0 ? reales[reales.length - 1] : previos[previos.length - 1]
  return { renglones, cuenta: ultimo ? cuentaVisible(ultimo.formula_despues, num(ultimo.despues)) : null }
}

/**
 * EL DETALLE COMPLETO. Sin constancia alguna (celda sin historial) se muestra el importe de hoy descompuesto con lo
 * que se sabe —la cuenta guardada— y la frase de que no quedó dicho quién ni cuándo: nunca un panel vacío.
 */
export function detalleDePagoEnEfectivo(
  { persona, quincena, valor, cuentaActual, anotaciones }: {
    persona: string | null; quincena: string | null; valor: number | null; cuentaActual: string | null
    anotaciones: AnotacionesDePago | undefined
  },
): DetalleDePago {
  const donde = [persona, quincena].filter(Boolean).join(', ')
  const sinConstancia: RenglonDePago[] = sumandosDe(cuentaActual, valor).map((n, i) => ({
    id: `sin-${i}`, tipo: 'pago', importe: pesos(n), correccion: null, cuando: 'Sin fecha', quien: SIN_DATO_PREVIO,
    fechaDelPago: null, nota: SIN_NOTA, como: null, deEntrega: false,
  }))
  const hay = (anotaciones?.renglones.length ?? 0) > 0
  const cuenta = hay ? anotaciones?.cuenta ?? null : cuentaVisible(cuentaActual, valor)
  return {
    titulo: donde ? `Pagado en efectivo — ${donde}` : 'Pagado en efectivo',
    total: pesos(valor),
    renglones: hay ? (anotaciones as AnotacionesDePago).renglones : sinConstancia,
    cuenta: cuenta ? `se escribió como ${cuenta}` : null,
    leyendaDelPunto: LEYENDA_DEL_PUNTO,
  }
}
