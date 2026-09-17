// LA PANTALLA DE IMPUESTOS EN LENGUAJE DEL DUEÑO — sin React ni Supabase.
//
// `impuestos.ts` y `impuestosCargas.ts` deciden QUÉ fila contesta cada pregunta y no se tocan: los
// consume también la pestaña del Sheet. Este archivo sólo decide CÓMO se dice y CÓMO se agrupa para
// leerlo, por eso vive aparte: un rótulo nuevo no puede mover un número de la pestaña.
//
// ═══ POR QUÉ EXISTE (rehecho 17/09/2026) ═══
//
// Dueño: «es espantosa, inentendible y así no tiene uso alguno». Medido en la captura de producción:
// «A pagar en 30 días $11,5 M» y «Cargas sociales en 30 días $10,7 M» con el mismo peso se leían como
// $22 M —la segunda es PARTE de la primera—; «determinado», «sin imputar», «supuesto», «ddjj» y
// «cálculo · 16/09» son palabras del sincronizador, no del que paga.
import { z } from 'zod'
import { aPagarProximos, rotuloPeriodo, saldosAFavor, type Impuesto, type PosicionImpuesto, type Vencimiento } from './impuestos.ts'
import { cuotaDePlan } from './impuestosCargas.ts'

// ═══ LAS VISTAS ═══
//
// Una solapa por impuesto que el dueño nombra («IVA, Ganancias, Ingresos Brutos y demás»). El resto
// —Bienes Personales, cheque, sellos— junto en «Otros»: son pocas filas y ninguna decisión propia.

export const VISTAS = ['resumen', 'iva', 'iibb', 'cargas', 'ganancias', 'otros', 'historial'] as const
export type Vista = (typeof VISTAS)[number]

/** `?ver=` viene del usuario: lo que no es una vista conocida abre el resumen, no rompe la página. */
export const vistaDe = (v: unknown): Vista => z.enum(VISTAS).catch('resumen').parse(v)

export const TITULO_VISTA: Record<Vista, string> = {
  resumen: 'Qué hay que pagar', iva: 'IVA', iibb: 'Ingresos Brutos', cargas: 'Cargas sociales',
  ganancias: 'Ganancias', otros: 'Otros', historial: 'Todo el historial',
}

export const IMPUESTOS_DE_VISTA: Record<Exclude<Vista, 'resumen' | 'historial'>, Impuesto[]> = {
  iva: ['iva'], iibb: ['iibb'], cargas: ['cargas_sociales'], ganancias: ['ganancias'],
  otros: ['bienes_personales', 'impuesto_cheque', 'sellos', 'otro'],
}

export type VistaImpuesto = keyof typeof IMPUESTOS_DE_VISTA

export const vistaDeImpuesto = (i: Impuesto): VistaImpuesto =>
  (Object.keys(IMPUESTOS_DE_VISTA) as VistaImpuesto[]).find((v) => IMPUESTOS_DE_VISTA[v].includes(i)) ?? 'otros'

// ═══ LAS PALABRAS ═══

export const NOMBRE_LLANO: Record<Impuesto, string> = {
  iva: 'IVA', iibb: 'Ingresos Brutos San Juan', cargas_sociales: 'Cargas sociales (F931)', ganancias: 'Ganancias',
  bienes_personales: 'Bienes Personales', impuesto_cheque: 'Impuesto al cheque', sellos: 'Sellos', otro: 'Otro impuesto',
}

/** De dónde sale el número, dicho como lo diría administración. */
export const FUENTE_LLANA: Record<PosicionImpuesto['fuente'], string> = {
  ddjj_contador: 'declaración jurada', arca: 'ARCA', calculo: 'calculado por el OS', manual: 'cargado en Compras',
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** '2026-09' → 'septiembre 2026'. Para el nombre de una obligación; las tablas usan el corto. */
export const mesLargo = (p: string) => `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`

/**
 * «Cargas sociales (F931) · septiembre 2026». La cuota de un plan se nombra por su plan —«Plan F931
 * W303094 · cuota 3 de 3»—: el período de una cuota es el de la deuda financiada, no el del pago, y
 * ponerlo delante hacía creer que se debía ese mes.
 */
export function nombreLlano(f: Pick<PosicionImpuesto, 'impuesto' | 'periodo' | 'concepto'>) {
  const c = cuotaDePlan(f.concepto)
  if (c) return `${c.plan} · cuota ${c.n} de ${c.de}`
  const extra = f.concepto === 'ddjj' ? '' : ` · ${f.concepto}`
  return `${NOMBRE_LLANO[f.impuesto]} · ${mesLargo(f.periodo)}${extra}`
}

/** El período corto de las tablas, con el concepto si no es la declaración mensual. */
export const periodoCorto = (f: Pick<PosicionImpuesto, 'periodo' | 'concepto'>) =>
  `${rotuloPeriodo(f.periodo)}${f.concepto === 'ddjj' ? '' : ` · ${f.concepto}`}`

/** «vence hoy», «en 23 días», «venció hace 3 días». Los días ya vienen calculados en hora de San Juan. */
export function enDias(dias: number) {
  if (dias === 0) return 'vence hoy'
  if (dias === 1) return 'vence mañana'
  if (dias > 1) return `en ${dias} días`
  return dias === -1 ? 'venció ayer' : `venció hace ${-dias} días`
}

export type Tono = 'neg' | 'warn' | 'pos' | 'neutro'

/**
 * EL ESTADO EN PALABRAS DE QUIEN PAGA. Sólo lo que pide acción lleva color: vencido (rojo) y declarado
 * con saldo (naranja). «Estimado» no es un problema, es el grado de certeza —el mes todavía no se
 * declaró—, y por eso va neutro. `estado` es el de la base, sin reinterpretar: si la base dice pagado
 * con saldo, la pantalla dice pagado (la regla es del sincronizador, no de acá).
 */
export function estadoLlano(f: Pick<PosicionImpuesto, 'estado' | 'pendiente' | 'detalle'>, dias?: number): { tono: Tono; texto: string } {
  if (dias !== undefined && dias < 0) return { tono: 'neg', texto: 'Vencido sin pago' }
  if (f.estado === 'pagado') return { tono: 'pos', texto: 'Pagado' }
  if (f.estado === 'estimado') return { tono: 'neutro', texto: f.detalle?.parcial ? 'Estimado · mes en curso' : 'Estimado, sin declarar' }
  if ((f.pendiente ?? 0) > 0) return { tono: 'warn', texto: 'Declarado, falta pagar' }
  return { tono: 'neutro', texto: 'Declarado' }
}

// ═══ LA AGENDA ═══

export type Urgencia = 'vencido' | 'semana' | 'mes'

export const TITULO_URGENCIA: Record<Urgencia, string> = {
  vencido: 'Vencido', semana: 'Esta semana', mes: 'Dentro de 30 días',
}

export const urgenciaDe = (dias: number): Urgencia => (dias < 0 ? 'vencido' : dias <= 7 ? 'semana' : 'mes')

/**
 * Los vencimientos de `aPagarProximos` partidos por urgencia, en ese orden y sin grupos vacíos. El
 * total de cada grupo suma sólo importes conocidos; `sinImporte` cuenta lo que no suma.
 */
export function agenda(lista: Vencimiento[]) {
  return (['vencido', 'semana', 'mes'] as const)
    .map((u) => {
      const filas = lista.filter((f) => urgenciaDe(f.dias) === u)
      return {
        urgencia: u,
        filas,
        total: filas.reduce((s, f) => s + (f.pendiente ?? 0), 0),
        sinImporte: filas.filter((f) => f.pendiente === null).length,
      }
    })
    .filter((g) => g.filas.length > 0)
}

// ═══ LO QUE SE DECIDE ARRIBA ═══

/**
 * Las cifras del encabezado. `cargas` y `vencido` son PARTE de `total`, y se devuelven así para que la
 * pantalla las escriba como «de eso…» y no al lado con el mismo peso (el defecto de la versión vieja).
 * `proximo` es el primer vencimiento que todavía no pasó.
 */
export function decision(filas: PosicionImpuesto[], hoy: string) {
  const p = aPagarProximos(filas, hoy)
  const vencidas = p.lista.filter((f) => f.dias < 0)
  const cargas = p.lista.filter((f) => f.impuesto === 'cargas_sociales')
  return {
    lista: p.lista,
    total: p.total,
    cantidad: p.lista.length,
    sinImporte: p.sinImporte,
    vencido: { total: vencidas.reduce((s, f) => s + (f.pendiente ?? 0), 0), cantidad: vencidas.length },
    cargas: { total: cargas.reduce((s, f) => s + (f.pendiente ?? 0), 0), cantidad: cargas.length },
    proximo: p.lista.find((f) => f.dias >= 0) ?? null,
  }
}

/** Falta pagar, sin ventana: toda obligación no pagada con saldo (o saldo desconocido). */
const faltaPagar = (f: PosicionImpuesto) => f.estado !== 'pagado' && (f.pendiente === null || f.pendiente > 0)

/**
 * UNA FILA POR IMPUESTO para el resumen: cuánto falta pagar (sin ventana), el próximo vencimiento, la
 * plata a favor del último período cerrado y hasta qué mes hay datos. Sólo las vistas con filas: una
 * solapa vacía no aporta nada. `aFavor` sale de `saldosAFavor`, la misma regla que usaba la franja.
 */
export function porImpuesto(filas: PosicionImpuesto[], hoy: string) {
  const saldos = saldosAFavor(filas)
  const proximos = aPagarProximos(filas, hoy).lista
  return (Object.keys(IMPUESTOS_DE_VISTA) as VistaImpuesto[])
    .map((vista) => {
      const propias = filas.filter((f) => IMPUESTOS_DE_VISTA[vista].includes(f.impuesto))
      const pendientes = propias.filter(faltaPagar)
      return {
        vista,
        titulo: TITULO_VISTA[vista],
        filas: propias.length,
        faltaPagar: pendientes.reduce((s, f) => s + (f.pendiente ?? 0), 0),
        sinImporte: pendientes.filter((f) => f.pendiente === null).length,
        /** Cuánto de `faltaPagar` es estimado (mes sin declarar): se avisa al lado, no se mezcla callado. */
        estimados: pendientes.filter((f) => f.estado === 'estimado').length,
        vencidas: proximos.filter((f) => f.dias < 0 && IMPUESTOS_DE_VISTA[vista].includes(f.impuesto)).length,
        proximo: proximos.find((f) => f.dias >= 0 && IMPUESTOS_DE_VISTA[vista].includes(f.impuesto)) ?? null,
        aFavor: saldos.filter((s) => IMPUESTOS_DE_VISTA[vista].includes(s.impuesto)),
        ultimoPeriodo: propias.reduce<string | null>((u, f) => (u === null || f.periodo > u ? f.periodo : u), null),
      }
    })
    .filter((r) => r.filas > 0)
}
