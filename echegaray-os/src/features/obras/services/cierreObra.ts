// Z01 · «EXPORTAR EL CIERRE» — lo que dice el PDF de cierre de una obra. Módulo puro.
//
// Decisión del coordinador (25/09/2026): un PDF con lo que ya muestra Z01 —contratado, adicionales,
// cobrado, costo de materiales + mano de obra, margen, HH plan contra real, fechas y lecciones— que se
// genera en el servidor y se descarga. NADA INVENTADO: lo que falta dice «sin dato».
//
// Reglas de la casa que se respetan acá:
//   · el costo real de `obra_economia` NO trae la mano de obra (se imputa como Estructura): el costo
//     total es materiales + la mano de obra propia de `costo_de_obras_a_la_fecha`, y sólo si están las dos;
//   · el margen sólo con venta Y costo total; si falta una punta, «sin dato» (nunca venta − materiales);
//   · quien no ve economía recibe la sección económica como «reservado», no en blanco ni en cero;
//   · no hay fuente de lecciones por obra: se dice «sin dato».

import type { EconomiaObra } from '../types/economia.ts'
import type { HHPorRubro } from './resumenObra.ts'

export const SIN_DATO = 'sin dato'

export interface DatosCierre {
  obra: {
    codigo: string | null; nombre: string; cliente: string | null; estado: string | null; etapa: string | null
    inicioPlan: string | null; finPlan: string | null; inicioReal: string | null; finReal: string | null; lineaBase: string | null
  }
  veEconomia: boolean
  economia: EconomiaObra | null
  /** La mano de obra propia a la fecha (recibos + negro de las horas valorizadas). null = sin dato. */
  manoObra: number | null
  hh: { plan: number | null; real: number | null }
  rubros: readonly HHPorRubro[]
  /** No hay fuente todavía: null. */
  lecciones: readonly string[] | null
}

export interface SeccionCierre { titulo: string; filas: [string, string][]; nota?: string }

const plata = (n: number | null | undefined) => (n == null ? SIN_DATO : `$ ${Math.round(n).toLocaleString('es-AR')}`)
const num = (n: number | null | undefined, dec = 0) => (n == null ? SIN_DATO : n.toLocaleString('es-AR', { maximumFractionDigits: dec }))
const fecha = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : SIN_DATO)
const pctConSigno = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`

const ESTADO: Record<string, string> = { activa: 'En ejecución', en_ejecucion: 'En ejecución', cerrada: 'Cerrada', archivada: 'Archivada', terminada: 'Terminada', previo: 'Previo' }
const ETAPA: Record<string, string> = { previo: 'Previo', inicio: 'Inicio', desarrollo: 'Desarrollo', terminacion: 'Terminación', cierre: 'Cierre' }

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00Z`)) / 86_400_000)
}

export function seccionesDeCierre(d: DatosCierre): SeccionCierre[] {
  const o = d.obra
  const plazo = o.finReal && o.finPlan
    ? (() => { const x = diasEntre(o.finReal, o.finPlan); return x === 0 ? 'en fecha' : `${x > 0 ? '+' : '−'}${Math.abs(x)} días contra el plan` })()
    : SIN_DATO
  const secciones: SeccionCierre[] = [{
    titulo: 'La obra',
    filas: [
      ['Obra', [o.codigo, o.nombre].filter(Boolean).join(' · ')],
      ['Cliente', o.cliente ?? SIN_DATO],
      ['Estado', [o.estado ? ESTADO[o.estado] ?? o.estado : null, o.etapa ? `etapa ${ETAPA[o.etapa] ?? o.etapa}` : null].filter(Boolean).join(' · ') || SIN_DATO],
      ['Inicio previsto', fecha(o.inicioPlan)],
      ['Fin previsto', fecha(o.finPlan)],
      ['Inicio real', fecha(o.inicioReal)],
      ['Fin real', fecha(o.finReal)],
      ['Plazo', plazo],
      ['Línea base', o.lineaBase ? `sellada ${fecha(o.lineaBase)}` : 'sin sellar'],
    ],
  }]

  if (!d.veEconomia) {
    secciones.push({ titulo: 'Economía', filas: [], nota: 'Reservado a Dirección y Administración.' })
  } else {
    const e = d.economia
    const materiales = e?.costo_real ?? null
    const costoTotal = materiales != null && d.manoObra != null ? materiales + d.manoObra : null
    const venta = e?.venta_total ?? e?.venta_contratada ?? null
    const margen = venta != null && costoTotal != null ? venta - costoTotal : null
    secciones.push({
      titulo: 'Economía',
      filas: [
        ['Contratado', plata(e?.venta_contratada)],
        ['Adicionales aprobados', e?.adicionales_aprobados == null ? SIN_DATO : `${plata(e.adicionales_aprobados)} · ${e.n_adicionales_aprobados} ${e.n_adicionales_aprobados === 1 ? 'adicional' : 'adicionales'}`],
        ['Venta total', plata(venta)],
        ['Certificado', plata(e?.certificado)],
        ['Cobrado', plata(e?.cobrado)],
        ['Costo de materiales', materiales == null ? SIN_DATO : `${plata(materiales)}${e?.costo_real_n_comprobantes != null ? ` · ${e.costo_real_n_comprobantes} comprobantes` : ''}`],
        ['Costo de mano de obra', plata(d.manoObra)],
        ['Costo total', plata(costoTotal)],
        ['Margen', margen == null ? SIN_DATO : `${plata(margen)} · ${pctConSigno((margen / (venta as number)) * 100)} sobre la venta`],
      ],
      nota: margen == null ? 'El margen necesita la venta y el costo total (materiales + mano de obra); si falta una punta, no se calcula.' : undefined,
    })
  }

  const desvioHH = d.hh.plan != null && d.hh.real != null && d.hh.plan > 0 ? pctConSigno(((d.hh.real - d.hh.plan) / d.hh.plan) * 100) : SIN_DATO
  secciones.push({
    titulo: 'Horas hombre',
    filas: [
      ['HH plan', num(d.hh.plan)],
      ['HH real', num(d.hh.real)],
      ['Desvío', desvioHH],
      ...d.rubros.map((r): [string, string] => [r.rubro, `plan ${num(r.plan)} · real ${num(r.real)}${r.desvioPct != null ? ` · ${pctConSigno(r.desvioPct)}` : ''}`]),
    ],
  })

  secciones.push({
    titulo: 'Lecciones',
    filas: d.lecciones && d.lecciones.length ? d.lecciones.map((l, i): [string, string] => [String(i + 1), l]) : [['Lecciones', SIN_DATO]],
  })
  return secciones
}

/** Lo que la fuente estándar del PDF (WinAnsi) no dibuja se escribe con su equivalente. */
export function aWinAnsi(t: string): string {
  return t.replace(/→/g, '->').replace(/−/g, '-').replace(/[^\x20-\x7E\xA0-\xFF·—–«»›‹"'…€]/g, '?')
}
