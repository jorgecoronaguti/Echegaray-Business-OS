// LOS TRES CUADROS DE LA QUINCENA, ARMADOS SIN BASE.
//
// Quién entra en qué cuadro, de dónde sale cada peso y qué se hace con lo que falta. La aritmética
// es de `liquidacionQuincena.ts`; las lecturas, de `liquidacionQuincenaService.ts`. Acá sólo se
// decide, y por eso se prueba entero sin Supabase.
//
// ═══ CADA COLUMNA DECLARA SU TABLA, Y ESO ES UN REQUISITO, NO UNA CORTESÍA ═══
//
//   COBRA            registros_hh + asistencia_dia  ×  persona_tarifa
//   ADELANTO         nomina_adelanto (efectivo a cuenta)      ← HOY SIN FUENTE, ver abajo
//   YA TRANSFERIDO   nomina_adelanto, giros ANTERIORES al lote
//   POR BANCO        nomina_recibo_neto, confirmado contra el lote del extracto
//   EFECTIVO redond. lo escribe el dueño, no sale de ninguna tabla
//
// ═══ EL ADELANTO EN EFECTIVO TODAVÍA NO TIENE FUENTE EN POSTGRES, Y SE DICE ═══
//
// `nomina_adelanto` es, por definición de su propia migración, **una fila por movimiento bancario**:
// su llave es la referencia del extracto. El adelanto que el dueño entrega en MANO no deja
// movimiento y hoy vive sólo en la columna Z de su planilla. Mostrarlo en cero sin decirlo haría que
// EN EFECTIVO salga de más —se le pagaría dos veces a quien ya recibió plata— así que el cuadro
// publica `adelantoSinFuente` y la pantalla lo escribe.
//
// ═══ POR QUÉ EL LOTE SE RECONOCE POR EL IMPORTE Y NO POR LA FECHA ═══
//
// Medido sobre agosto/2026: los 16 giros del lote 260831507 coinciden PESO POR PESO con el neto del
// recibo de cada persona, y los del 28/08 —$200.000 redondos— no coinciden con ninguno. El importe
// es lo que distingue «el banco pagó este recibo» de «el banco le adelantó plata»; la fecha sola
// haría pasar por recibo pagado a cualquier transferencia del mismo día.

import {
  liquidarLinea, tarifaVigenteAl, type EntradaDeLinea, type GrupoLiquidacion, type LineaLiquidada,
  type TarifaVigente,
} from './liquidacionQuincena.ts'
import type { Quincena } from './quincena.ts'
import { ORDEN_DE_CUADROS, ordenarComoPersonal } from './ordenDePersonal.ts'

export interface PersonaDeLiquidacion {
  id: string
  nombre: string
  /** Sin CUIL no hay recibo ni giro que emparejar: la fila lo dice, no lo adivina. */
  cuil: string | null
  enLaEmpresa: boolean
  /** `esJefeDeObra(persona_directorio.puesto)`, leído UNA vez en el servicio y propagado. */
  esJefe?: boolean
}

export interface FilaTarifa {
  persona_id: string
  desde: string
  valor_hora: number | null
  neto_mensual: number | null
  origen: string
}

export interface FilaRecibo {
  cuil: string
  periodo: string
  neto: number
  fecha_pago: string | null
}

export interface FilaAdelanto {
  cuil: string | null
  fecha: string
  importe: number
  concepto: string
}

/** Las horas ya calculadas por persona (`horasDeQuincena`). */
export interface HorasPorPersona {
  horas: number
  presentesSinHoras: number
}

export interface DatosDeCuadros {
  quincena: Quincena
  personas: readonly PersonaDeLiquidacion[]
  tarifas: readonly FilaTarifa[]
  horas: ReadonlyMap<string, HorasPorPersona>
  recibos: readonly FilaRecibo[]
  adelantos: readonly FilaAdelanto[]
  /** `liquidacion_linea.efectivo_redondeado` ya guardado, por persona. */
  redondeos: ReadonlyMap<string, number | null>
}

export interface CuadroDeLiquidacion {
  grupo: GrupoLiquidacion
  titulo: string
  lineas: LineaLiquidada[]
  /** Días declarados presentes sin una sola hora cargada, en todo el cuadro. */
  presentesSinHoras: number
  /** El adelanto en efectivo no tiene tabla todavía: la pantalla lo declara al pie. */
  adelantoSinFuente: boolean
}

const TITULOS: Record<GrupoLiquidacion, string> = {
  obreros: 'Obreros · quincenal',
  oficina: 'Oficina · mensual',
  final: 'Liquidaciones finales',
}

/** `2026-09-01` → `Q1-09/2026`, la clave de período de `nomina_recibo_neto`. */
export function periodoDeRecibo(q: Quincena): string {
  const mes = q.desde.slice(5, 7)
  const anio = q.desde.slice(0, 4)
  return `Q${Number(q.desde.slice(8, 10)) === 1 ? 1 : 2}-${mes}/${anio}`
}

const dentro = (q: Quincena, fecha: string | null): boolean =>
  fecha != null && fecha >= q.desde && fecha <= q.hasta

const tarifasDe = (todas: readonly FilaTarifa[], personaId: string): TarifaVigente[] =>
  todas.filter((t) => t.persona_id === personaId).map((t) => ({
    valorHora: t.valor_hora == null ? null : Number(t.valor_hora),
    netoMensual: t.neto_mensual == null ? null : Number(t.neto_mensual),
    desde: t.desde,
    origen: t.origen,
  }))

/**
 * LA PLATA QUE YA SALIÓ POR EL BANCO, partida en las dos columnas que el dueño pidió separadas.
 *
 * «eso va en columna por banco, y lo ya transferido era un dato que tenías antes de haber hecho esas
 * transferencias». Son plata que salió por el banco en momentos distintos: mezcladas no se pueden
 * auditar contra el extracto de hoy.
 */
export function girosDe(
  q: Quincena, adelantos: readonly FilaAdelanto[], cuil: string | null, concepto: string,
  reciboNeto: number | null,
): { giroEnElLote: boolean; yaTransferido: number } {
  if (!cuil) return { giroEnElLote: false, yaTransferido: 0 }
  const suyos = adelantos.filter(
    (a) => a.cuil === cuil && a.concepto === concepto && dentro(q, a.fecha),
  )
  let giroEnElLote = false
  let yaTransferido = 0
  for (const a of suyos) {
    // EL GIRO DEL LOTE SE CONSUME UNA SOLA VEZ. Dos movimientos del mismo importe que el recibo
    // serían dos pagos del mismo recibo: el segundo es otra cosa y va a YA TRANSFERIDO.
    if (!giroEnElLote && reciboNeto != null && Number(a.importe) === Number(reciboNeto)) {
      giroEnElLote = true
      continue
    }
    yaTransferido += Number(a.importe)
  }
  return { giroEnElLote, yaTransferido: Math.round(yaTransferido * 100) / 100 }
}

interface Contexto extends DatosDeCuadros {
  periodo: string
}

/** La entrada de una persona en el cuadro de obreros o de oficina. */
function entradaDe(
  ctx: Contexto, p: PersonaDeLiquidacion, tarifa: TarifaVigente | null,
  grupo: GrupoLiquidacion,
): EntradaDeLinea {
  // OFICINA NO SE LIQUIDA POR HORAS. Maldonado y Nievas tienen asistencia cargada como todos, pero
  // su sueldo es un neto mensual acordado: publicar «54 h» al lado de $1.800.000 invita a
  // multiplicar y a discutir un número que no decide nada. La columna va vacía, que es lo cierto.
  const h = grupo === 'oficina' ? null : (ctx.horas.get(p.id) ?? null)
  const recibo = ctx.recibos.find((r) => r.cuil === p.cuil && r.periodo === ctx.periodo) ?? null
  const neto = recibo == null ? null : Number(recibo.neto)
  const { giroEnElLote, yaTransferido } = girosDe(ctx.quincena, ctx.adelantos, p.cuil, 'QUINCENA', neto)
  return {
    personaId: p.id,
    nombre: p.nombre,
    esJefe: p.esJefe === true,
    horas: h == null ? null : h.horas,
    tarifa,
    // CERO CON SU MOTIVO ESCRITO AL LADO (`adelantoSinFuente`), no un cero mudo.
    adelanto: 0,
    yaTransferido,
    reciboNeto: neto,
    giroEnElLote,
  }
}

/**
 * LOS TRES CUADROS.
 *
 * QUIÉN ENTRA EN CUÁL, en este orden y sin repetir a nadie: una persona que aparece en dos cuadros
 * con dos importes es cómo se paga dos veces (ya pasó con Jofre y Sosa el 31/08/2026).
 *
 *   final    tiene un recibo de LIQUIDACIÓN FINAL pagado dentro de la ventana.
 *   oficina  tiene tarifa de neto mensual vigente.
 *   obreros  el resto de quienes están en la empresa Y tienen tarifa por hora o movimiento en la
 *            ventana. Quien no tiene ni una cosa ni la otra no es una fila vacía: no es de esta
 *            quincena.
 */
export function armarCuadros(d: DatosDeCuadros): CuadroDeLiquidacion[] {
  const ctx: Contexto = { ...d, periodo: periodoDeRecibo(d.quincena) }
  const finales = new Set(
    d.recibos.filter((r) => r.periodo === 'FINAL' && dentro(d.quincena, r.fecha_pago))
      .map((r) => r.cuil),
  )
  const cuadros: Record<GrupoLiquidacion, LineaLiquidada[]> = { obreros: [], oficina: [], final: [] }
  let presentesSinHoras = 0

  for (const p of d.personas) {
    const vigente = tarifaVigenteAl(tarifasDe(d.tarifas, p.id), d.quincena.hasta)
    const h = d.horas.get(p.id)
    presentesSinHoras += h?.presentesSinHoras ?? 0
    const redondeo = d.redondeos.get(p.id) ?? null

    if (p.cuil && finales.has(p.cuil)) {
      cuadros.final.push(lineaFinal(ctx, p, redondeo))
      continue
    }
    if (vigente?.netoMensual != null) {
      cuadros.oficina.push(liquidarLinea(entradaDe(ctx, p, vigente, 'oficina'), 'oficina', redondeo))
      continue
    }
    // SIN TARIFA POR HORA Y SIN MOVIMIENTO EN LA VENTANA NO ES UNA FILA. Listar al plantel entero
    // llenaría el cuadro de gente que no cobra esta quincena, y «sin tarifa» dejaría de señalar el
    // caso que hay que resolver antes de pagar.
    if (vigente?.valorHora == null && (h == null || (h.horas === 0 && h.presentesSinHoras === 0))) continue
    if (!p.enLaEmpresa && (h == null || h.horas === 0)) continue
    cuadros.obreros.push(liquidarLinea(entradaDe(ctx, p, vigente, 'obreros'), 'obreros', redondeo))
  }

  // ═══ EL ORDEN DEL MÓDULO PERSONAL, TAMBIÉN ACÁ (dueño, 10/09/2026) ═══
  //
  // Los cuadros salen Oficina → Obreros → Finales, y dentro de cada uno jefes primero y alfabético
  // en español. Antes era `['obreros','oficina','final']` con un `localeCompare` suelto: Pagos
  // publicaba a los quince obreros y a los dos jefes de Oficina al final, al revés que Plantel,
  // Asistencia y Horas. Un `sort` escrito a mano por pantalla es cómo se separan los órdenes.
  return [...ORDEN_DE_CUADROS].map((grupo) => ({
    grupo,
    titulo: TITULOS[grupo],
    lineas: ordenarComoPersonal(cuadros[grupo], (l) => l.nombre, (l) => l.esJefe),
    presentesSinHoras: grupo === 'obreros' ? presentesSinHoras : 0,
    // LA COLUMNA ADELANTO ESTÁ EN CERO PORQUE NO TIENE TABLA, no porque nadie haya cobrado nada a
    // cuenta. Se declara en los tres cuadros: los tres la restan.
    adelantoSinFuente: true,
  }))
}

/**
 * UNA LIQUIDACIÓN FINAL. COBRA es la mitad blanca por dos (acuerdo 50/50 con el personal), y lo ya
 * transferido se resta igual que en la quincena — pero con su propio concepto, porque la plata que
 * se le giró a alguien que se fue no se resta del cuadro de los que siguen.
 */
function lineaFinal(
  ctx: Contexto, p: PersonaDeLiquidacion, redondeo: number | null,
): LineaLiquidada {
  const recibo = ctx.recibos.find((r) => r.cuil === p.cuil && r.periodo === 'FINAL') ?? null
  const mitadBlanca = recibo == null ? null : Number(recibo.neto)
  const { giroEnElLote, yaTransferido } = girosDe(
    ctx.quincena, ctx.adelantos, p.cuil, 'LIQUIDACION_FINAL', mitadBlanca,
  )
  return liquidarLinea({
    personaId: p.id,
    nombre: p.nombre,
    esJefe: p.esJefe === true,
    horas: null,
    tarifa: null,
    adelanto: 0,
    yaTransferido,
    reciboNeto: mitadBlanca,
    giroEnElLote,
    mitadBlanca,
  }, 'final', redondeo)
}
