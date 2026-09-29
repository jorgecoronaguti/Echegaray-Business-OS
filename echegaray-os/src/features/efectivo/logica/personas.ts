// EFECTIVO A RENDIR, POR PERSONA (dueño, 29/09/2026: «tiene que basarse en las personas con efectivo y que
// ahí dentro esté el listado de entregas y rendiciones»).
//
// La unidad de la pantalla es la PERSONA que tiene plata de la empresa, no la entrega. Esta lógica sólo
// AGRUPA lo que la base ya calculó (`efectivo_entrega_saldo`, rendiciones, devoluciones): no recalcula
// «en su poder» por otro camino. Lo único que suma es el saldo corrido de la cronología, y lo confronta
// con el saldo de la base (`cuadra`) en vez de darlo por bueno.
//
// Un saldo por persona = Σ «en su poder» de sus entregas ABIERTAS con saldo positivo: la misma cuenta que
// «En manos de la gente» de las tarjetas (`resumir`), así que la suma de las filas y la cifra de arriba son
// la misma plata.

import type { Comprobante, Devolucion, Entrega, FilaDeCompras, Rendicion } from '../types.ts'
import { compararPorApellido } from '../../../shared/personas/nombre.ts'
import { diaAR, diasDeEntrega, esperando, filasDeLaFicha, pesos, type FiltroLista, type FilaDeFicha } from './entregas.ts'

export interface PersonaConEfectivo {
  id: string
  /** El nombre para mostrar (lo que dice la pantalla). El orden sale del legajo, nunca de éste. */
  nombre: string
  /** Sus entregas que existieron (sin anuladas). */
  vivas: Entrega[]
  anuladas: Entrega[]
  abiertas: number
  /** Lo que tiene en la mano hoy: misma definición que la tarjeta «En manos de la gente». */
  enMano: number
  entregado: number
  rendido: number
  devuelto: number
  /** Días de la entrega abierta con saldo más vieja; `null` si no tiene saldo. */
  dias: number | null
  ultima: { dia: string; texto: string } | null
}

/** Rango de un movimiento dentro del mismo día: primero se entrega, después se rinde, después se devuelve. */
const RANGO = { entrega: 0, rendicion: 1, en_camino: 1, devolucion: 2 } as const

interface Hecho { dia: string; rango: number; ts: string; texto: string }

function ultimoHecho(
  vivas: readonly Entrega[], rendiciones: readonly Rendicion[], devoluciones: readonly Devolucion[],
): PersonaConEfectivo['ultima'] {
  const ids = new Set(vivas.map((e) => e.id))
  const hechos: Hecho[] = [
    ...vivas.map((e) => ({ dia: diaAR(e.fecha), rango: RANGO.entrega, ts: e.fecha, texto: `Entrega ${e.codigo} · ${pesos(e.entregado)}` })),
    ...rendiciones.filter((r) => ids.has(r.entrega_id))
      .map((r) => ({ dia: diaAR(r.imputada_en), rango: RANGO.rendicion, ts: r.imputada_en, texto: `Rindió ${pesos(Number(r.monto))}` })),
    ...devoluciones.filter((d) => ids.has(d.entrega_id))
      .map((d) => ({ dia: diaAR(d.fecha), rango: RANGO.devolucion, ts: d.registrada_en ?? d.fecha, texto: `Devolvió ${pesos(Number(d.monto))}` })),
  ].filter((h) => h.dia)
  if (!hechos.length) return null
  const h = hechos.sort((a, b) => b.dia.localeCompare(a.dia) || b.rango - a.rango || b.ts.localeCompare(a.ts))[0]
  return { dia: h.dia, texto: h.texto }
}

/**
 * UNA FILA POR PERSONA, ORDENADAS POR APELLIDO con el comparador único (`compararPorApellido`, del legajo).
 * `filtro`: «abiertas» = las que tienen alguna entrega abierta (también la de saldo cero que espera cierre);
 * «todas» = las que alguna vez recibieron; «anuladas» = las que tienen entregas anuladas. `obra` ya no
 * agrupa (una persona puede tener plata en dos obras): se comporta como «abiertas».
 */
export function agruparPorPersona(
  entregas: readonly Entrega[], rendiciones: readonly Rendicion[], devoluciones: readonly Devolucion[],
  hoy: string, filtro: FiltroLista = 'todas',
): PersonaConEfectivo[] {
  const porPersona = new Map<string, Entrega[]>()
  for (const e of entregas) porPersona.set(e.persona_id, [...(porPersona.get(e.persona_id) ?? []), e])
  const filas: { p: PersonaConEfectivo; legajo: string | null }[] = []
  for (const [id, suyas] of porPersona) {
    const vivas = suyas.filter((e) => e.estado !== 'anulada')
    const abiertas = vivas.filter((e) => e.estado === 'abierta')
    const conSaldo = abiertas.filter((e) => e.en_su_poder > 0)
    const vieja = [...conSaldo].sort((a, b) => a.fecha.localeCompare(b.fecha))[0]
    const suma = (f: (e: Entrega) => number) => vivas.reduce((s, e) => s + f(e), 0)
    filas.push({
      legajo: suyas[0].persona_legajo ?? null,
      p: {
        id, nombre: suyas[0].persona, vivas, anuladas: suyas.filter((e) => e.estado === 'anulada'), abiertas: abiertas.length,
        enMano: conSaldo.reduce((s, e) => s + e.en_su_poder, 0),
        entregado: suma((e) => e.entregado), rendido: suma((e) => e.rendido), devuelto: suma((e) => e.devuelto),
        dias: vieja ? diasDeEntrega(vieja, hoy) : null,
        ultima: ultimoHecho(vivas, rendiciones, devoluciones),
      },
    })
  }
  const visible = (p: PersonaConEfectivo) => (filtro === 'anuladas' ? p.anuladas.length > 0 : filtro === 'todas' ? p.vivas.length > 0 : p.abiertas > 0)
  return filas.filter((f) => visible(f.p))
    .sort((a, b) => compararPorApellido(
      { nombre_completo: a.legajo, nombre_para_mostrar: a.p.nombre }, { nombre_completo: b.legajo, nombre_para_mostrar: b.p.nombre },
    ) || a.p.id.localeCompare(b.p.id))
    .map((f) => f.p)
}

// ═══ LA CRONOLOGÍA DE UNA PERSONA ═══

interface Base { dia: string; entrega: Entrega; delta: number; saldo: number }
export type Movimiento =
  | (Base & { tipo: 'entrega' })
  /** Lo que se DESPRENDE de la persona: baja su saldo. `fila` trae proveedor, rubro y la fila de Compras. */
  | (Base & { tipo: 'rendicion'; fila: FilaDeFicha })
  | (Base & { tipo: 'devolucion'; devolucion: Devolucion })
  /** Un ticket que todavía no es rendición: no mueve el saldo, y se dice. */
  | (Base & { tipo: 'en_camino'; fila: FilaDeFicha })

/** `Omit` sobre una unión la aplasta a las claves comunes: éste distribuye sobre cada miembro. */
type SinSaldo<T> = T extends unknown ? Omit<T, 'saldo'> : never

export interface Cronologia {
  /** Lo más nuevo primero; el saldo de cada línea es el de DESPUÉS de ese movimiento. */
  movimientos: Movimiento[]
  saldo: number
  /** ¿El saldo corrido coincide con Σ(entregado − rendido − devuelto) que dice la base? Si no, la pantalla lo avisa. */
  cuadra: boolean
  diferencia: number
}

/**
 * ENTREGAS, RENDICIONES Y DEVOLUCIONES DE UNA PERSONA, EN UNA SOLA LÍNEA DE TIEMPO con saldo corrido.
 * Los tickets salen de `filasDeLaFicha` (la misma definición de «fila» que la ficha de cada entrega).
 * La rendición cae el día que se IMPUTÓ —cuando bajó el saldo—, no el de la fecha del ticket.
 */
export function cronologiaDePersona(args: {
  entregas: readonly Entrega[]
  comprobantes: readonly Comprobante[]
  rendiciones: readonly Rendicion[]
  devoluciones: readonly Devolucion[]
  compras: ReadonlyMap<string, FilaDeCompras>
}): Cronologia {
  const vivas = args.entregas.filter((e) => e.estado !== 'anulada')
  // Cada movimiento lleva aparte su clave de orden (rango dentro del día y hora): no es parte de lo que se muestra.
  type Sin = { m: SinSaldo<Movimiento>; rango: number; ts: string }
  const sueltos: Sin[] = []
  for (const e of vivas) {
    sueltos.push({ m: { tipo: 'entrega', dia: diaAR(e.fecha), entrega: e, delta: e.entregado }, rango: RANGO.entrega, ts: e.fecha })
    const filas = filasDeLaFicha(
      args.comprobantes.filter((c) => c.entrega_id === e.id), args.rendiciones.filter((r) => r.entrega_id === e.id), args.compras,
    )
    for (const f of filas) {
      if (f.rendicion || f.adelanto) {
        // El adelanto de sueldo no trae `rendicion` (la ficha lo cuenta aparte): su día es `fecha`, su monto `importe`.
        const en = f.rendicion?.imputada_en ?? f.fecha ?? e.fecha
        const delta = -Number(f.rendicion?.monto ?? f.importe ?? 0)
        sueltos.push({ m: { tipo: 'rendicion', dia: diaAR(en), entrega: e, fila: f, delta }, rango: RANGO.rendicion, ts: en })
      } else if (f.comprobante && esperando(f.comprobante)) {
        const en = f.comprobante.enviado_en
        sueltos.push({ m: { tipo: 'en_camino', dia: diaAR(en), entrega: e, fila: f, delta: 0 }, rango: RANGO.en_camino, ts: en })
      }
    }
    for (const d of args.devoluciones.filter((x) => x.entrega_id === e.id)) {
      sueltos.push({ m: { tipo: 'devolucion', dia: diaAR(d.fecha), entrega: e, devolucion: d, delta: -Number(d.monto) }, rango: RANGO.devolucion, ts: d.registrada_en ?? d.fecha })
    }
  }
  sueltos.sort((a, b) => a.m.dia.localeCompare(b.m.dia) || a.rango - b.rango || a.ts.localeCompare(b.ts) || a.m.entrega.codigo.localeCompare(b.m.entrega.codigo))
  let saldo = 0
  const movimientos = sueltos.map(({ m }): Movimiento => {
    saldo = Math.round((saldo + m.delta) * 100) / 100
    return { ...m, saldo } as Movimiento
  }).reverse()
  const base = vivas.reduce((s, e) => s + e.entregado - e.rendido - e.devuelto, 0)
  const diferencia = Math.round((saldo - base) * 100) / 100
  return { movimientos, saldo, cuadra: diferencia === 0, diferencia }
}
