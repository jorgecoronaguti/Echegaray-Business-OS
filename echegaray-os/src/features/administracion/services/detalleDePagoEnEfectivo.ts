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
import { horas, pesos } from '../components/liquidacion/formato.ts'
import type { CampoEditable } from './liquidacionOverrides.ts'
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
  /** La palabra de la columna («Importe negro»). */
  rotulo: string
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
const cuentaVisible = (cuenta: string | null): string | null => {
  const cuerpo = (cuenta ?? '').trim().replace(/^=/, '').replace(/\s+/g, '')
  // Un número solo («=237000») no es una cuenta: no hay nada que explicar.
  return /[+*/×÷()]|.-/.test(cuerpo) ? cuerpo : null
}

/**
 * QUÉ CELDA ES, EN LA PALABRA DE LA COLUMNA, Y CÓMO SE ESCRIBE SU NÚMERO. Sólo los pagados son una suma de pagos y se
 * parten en renglones; el importe de otra celda es UN valor aunque se haya escrito como cuenta.
 */
const ROTULOS: Record<CampoEditable, string> = {
  horas: 'Horas', cobra: 'Cobra total', adelanto: 'Adelanto en efectivo', yaTransferido: 'Adelanto banco / embargos',
  porBanco: 'Banco', enEfectivo: 'Total efectivo', total: 'Total', horasRecibo: 'Horas recibo', valorHoraRecibo: '$/h de categoría',
  negro: 'Importe negro', horasNegro: 'Horas negro', pagadoBanco: 'Pagado por banco', pagadoEfectivo: 'Pagado en efectivo',
}
const EN_HORAS: ReadonlySet<CampoEditable> = new Set(['horas', 'horasRecibo', 'horasNegro'])
const SON_PAGOS: ReadonlySet<CampoEditable> = new Set(['pagadoBanco', 'pagadoEfectivo'])

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

type Medida = { dicho: (n: number | null) => string; partir: boolean }
const medidaDe = (campo: CampoEditable): Medida => ({ dicho: EN_HORAS.has(campo) ? horas : pesos, partir: SON_PAGOS.has(campo) })

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

function renglonesDelPrevio(f: CambioCrudo, c: Contexto, siembra: PagoEfectivoCrudo | undefined, m: Medida): RenglonDePago[] {
  const valor = num(f.despues)
  const a = atribucionDelPrevio(f, c.nombres, c.cruce)
  const cuando = a.en ? diaYHora(a.en) : `Antes del ${diaDeIso(INICIO_DEL_REGISTRO).slice(0, 10)}`
  // INFERENCIA, NO HECHO: se cruzó la hora con quién usó la app; no es un autor anotado por la base.
  const quien = a.motivo === 'atribuido' ? `probablemente ${a.quien}: fue quien usó la app a esa hora`
    : a.cuando ? 'no se pudo saber quién' : SIN_DATO_PREVIO
  const fechaDelPago = siembra ? `${diaDeFecha(siembra.fecha)} (día asignado en bloque, no el de cada pago)` : null
  return (m.partir ? sumandosDe(f.formula_despues, valor) : valor == null ? [] : [valor]).map((n, i) => ({
    id: `${f.id}-${i}`, tipo: 'pago', importe: m.dicho(n), correccion: null, cuando, quien, fechaDelPago, nota: SIN_NOTA, como: null,
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
  f: CambioCrudo, c: Contexto, anterior: number[], pago: PagoEfectivoCrudo | undefined, m: Medida,
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
        correccion: `borró lo anotado (${m.dicho(antes)}): vuelve al cálculo del sistema`,
      }],
    }
  }
  const sumandos = m.partir ? sumandosDe(f.formula_despues, despues) : [despues]
  // «Agregó un pago» sólo existe en una suma de pagos con algo ya anotado; en cualquier otra celda un cambio es una corrección.
  const agregados = m.partir && anterior.length > 0 && sumandos.length > anterior.length && anterior.every((n, i) => n === sumandos[i])
    ? sumandos.slice(anterior.length) : null
  if (antes == null || antes === 0 || agregados) {
    // «Anotó» (no había nada o sólo se agregaron sumandos): cada sumando nuevo es un pago.
    const nuevos = agregados ?? sumandos
    return {
      sumandos,
      renglones: nuevos.map((n, i) => ({ ...base, id: `${f.id}-${i}`, tipo: 'pago' as const, importe: m.dicho(n), correccion: null })),
    }
  }
  return {
    sumandos,
    renglones: [{ ...base, id: String(f.id), tipo: 'correccion', importe: m.dicho(despues), correccion: `corrigió de ${m.dicho(antes)} a ${m.dicho(despues)}` }],
  }
}

/**
 * LOS RENGLONES DE UNA CELDA, EN ORDEN CRONOLÓGICO (lo más viejo primero: se lee como se fue pagando).
 * `cambios` son las filas crudas de ESA celda en cualquier orden; `pagos` es `null` cuando la tabla de pagos no existe.
 */
export function renglonesDePagoEnEfectivo(
  { cambios, pagos, nombres, cruce, campo = 'pagadoEfectivo' }: {
    cambios: readonly CambioCrudo[]; pagos: readonly PagoEfectivoCrudo[] | null; campo?: CampoEditable
  } & Omit<Contexto, 'pagos'>,
): AnotacionesDePago {
  // Las fechas y notas de `liquidacion_pago_efectivo` son sólo del efectivo: en otra celda no hay con qué cruzarlas.
  const c: Contexto = { nombres, cruce, pagos: campo === 'pagadoEfectivo' ? pagos : null }
  const m = medidaDe(campo)
  const cronologico = [...cambios].sort((a, b) => Date.parse(a.en) - Date.parse(b.en) || a.id - b.id)
  const previos = cronologico.filter((f) => f.tipo === 'base')
  const reales = cronologico.filter((f) => f.tipo !== 'base')
  const siembra = c.pagos?.find((p) => p.clave.startsWith('siembra:'))
  const usados = new Set<string>()
  const renglones: RenglonDePago[] = previos.flatMap((f) => renglonesDelPrevio(f, c, siembra, m))
  const ultimoPrevio = previos[previos.length - 1]
  let sumandos: number[] = ultimoPrevio && num(ultimoPrevio.despues) != null
    ? (m.partir ? sumandosDe(ultimoPrevio.formula_despues, num(ultimoPrevio.despues)) : [num(ultimoPrevio.despues) as number]) : []
  for (const f of reales) {
    const r = renglonesDelCambio(f, c, sumandos, c.pagos ? pagoDelCambio(f, c.pagos, usados) : undefined, m)
    renglones.push(...r.renglones)
    sumandos = r.sumandos
  }
  const ultimo = reales.length > 0 ? reales[reales.length - 1] : previos[previos.length - 1]
  return { renglones, cuenta: ultimo ? cuentaVisible(ultimo.formula_despues) : null }
}

/**
 * EL DETALLE COMPLETO. Sin constancia alguna (celda sin historial) se muestra el importe de hoy descompuesto con lo
 * que se sabe —la cuenta guardada— y la frase de que no quedó dicho quién ni cuándo: nunca un panel vacío.
 */
export function detalleDePagoEnEfectivo(
  { persona, quincena, valor, cuentaActual, anotaciones, campo = 'pagadoEfectivo' }: {
    campo?: CampoEditable
    persona: string | null; quincena: string | null; valor: number | null; cuentaActual: string | null
    anotaciones: AnotacionesDePago | undefined
  },
): DetalleDePago {
  const m = medidaDe(campo)
  const donde = [persona, quincena].filter(Boolean).join(', ')
  const sinConstancia: RenglonDePago[] = (m.partir ? sumandosDe(cuentaActual, valor) : valor == null ? [] : [valor]).map((n, i) => ({
    id: `sin-${i}`, tipo: 'pago', importe: m.dicho(n), correccion: null, cuando: 'Sin fecha', quien: SIN_DATO_PREVIO,
    fechaDelPago: null, nota: SIN_NOTA, como: null, deEntrega: false,
  }))
  const hay = (anotaciones?.renglones.length ?? 0) > 0
  const cuenta = hay ? anotaciones?.cuenta ?? null : cuentaVisible(cuentaActual)
  return {
    rotulo: ROTULOS[campo],
    titulo: donde ? `${ROTULOS[campo]} — ${donde}` : ROTULOS[campo],
    total: m.dicho(valor),
    renglones: hay ? (anotaciones as AnotacionesDePago).renglones : sinConstancia,
    cuenta: cuenta ? `se escribió como ${cuenta}` : null,
    leyendaDelPunto: LEYENDA_DEL_PUNTO,
  }
}
