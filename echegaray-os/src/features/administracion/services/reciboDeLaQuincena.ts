// EL RECIBO QUE SE ARMA DESDE EL PANEL DE LA PERSONA — qué lleva, según lo que se tilda.
//
// Dueño, 22/09/2026: *«tiene q ser algo q aparezca al hacerle click al nombre de cada uno, q aparece en el
// desplegable de la derecha lo q se considera en blanco. tiene q haber un boton q sea "recibo" y se tiene q
// abrir la opcion de ir armando lo q se quiere imprimir o guardar en ese recibo, hs en blanco, en negro
// efectivo deposito en banco»*. Y: *«no hace falta quincena cerrada»*.
//
// Ni una cuenta nueva: cada renglón es una cifra que el panel ya muestra (la línea, `sueldo`, `pago`). Lo
// único que se suma es el total de lo que se eligió imprimir, y sólo si todo lo elegido tiene número: un
// «sin dato» no se imprime como $ 0.

import type { LineaConOverrides } from './liquidacionOverrides'

export type ConceptoDelRecibo = 'blanco' | 'negro' | 'banco' | 'efectivo' | 'pagado'

export interface EleccionDelRecibo {
  blanco: boolean
  negro: boolean
  banco: boolean
  efectivo: boolean
  /** Debajo de cada medio: lo ya pagado (adelantos) y lo que resta. */
  pagado: boolean
}

export interface RenglonDelRecibo {
  rotulo: string
  detalle?: string
  importe: number | null
  /** Horas, sin importe propio en el total. */
  horas?: number | null
  sub?: boolean
}

export interface ReciboArmado {
  horas: RenglonDelRecibo[]
  medios: RenglonDelRecibo[]
  /** Suma de los medios elegidos. `null` si ninguno, o si alguno no tiene número. */
  total: number | null
}

/** Lo que se puede tildar para esta línea, y por qué no, cuando no se puede. */
export function conceptosDisponibles(l: LineaConOverrides): Record<ConceptoDelRecibo, string | null> {
  const s = l.sueldo
  const sinHoras = s ? null : 'cobra por mes: no tiene horas en blanco y en negro'
  return {
    blanco: sinHoras ?? (s!.horasBlanco == null ? 'sin horas de recibo cargadas' : null),
    negro: sinHoras ?? (s!.horasNegro == null ? 'sin horas en negro calculadas' : null),
    banco: null,
    efectivo: null,
    pagado: null,
  }
}

/** Por defecto va todo lo que la línea puede decir. */
export function eleccionInicial(l: LineaConOverrides): EleccionDelRecibo {
  const d = conceptosDisponibles(l)
  return { blanco: d.blanco == null, negro: d.negro == null, banco: true, efectivo: true, pagado: false }
}

const hs = (n: number | null | undefined): string => (n == null ? 'sin dato' : `${String(Math.round(n * 100) / 100).replace('.', ',')} h`)

/** Los dos medios: con modelo blanco + negro salen de `pago`; sin él, de la línea (mensual, oficina, finales). */
function medios(l: LineaConOverrides) {
  if (l.sueldo) {
    const p = l.pago
    return {
      banco: { total: p.banco, pagado: p.pagadoBanco, resta: p.saldoBanco },
      efectivo: { total: p.negro, pagado: p.pagadoEfectivo, resta: p.saldoEfectivo },
    }
  }
  return {
    banco: { total: l.porBanco, pagado: l.pagadoBanco ?? 0, resta: l.pago?.saldoBanco ?? null },
    efectivo: { total: l.enEfectivo, pagado: l.pagadoEfectivo ?? 0, resta: l.pago?.saldoEfectivo ?? null },
  }
}

export function armarRecibo(l: LineaConOverrides, e: EleccionDelRecibo, fmt: (n: number) => string): ReciboArmado {
  const d = conceptosDisponibles(l)
  const s = l.sueldo
  const horas: RenglonDelRecibo[] = []
  if (e.blanco && d.blanco == null && s) {
    horas.push({
      rotulo: 'Horas en blanco', horas: s.horasBlanco,
      detalle: s.valorHoraCategoria == null ? hs(s.horasBlanco) : `${hs(s.horasBlanco)} × ${fmt(s.valorHoraCategoria)}/h`,
      importe: s.bruto,
    })
  }
  if (e.negro && d.negro == null && s) {
    horas.push({
      rotulo: 'Horas en negro', horas: s.horasNegro,
      detalle: s.valorHoraNegro == null ? hs(s.horasNegro) : `${hs(s.horasNegro)} × ${fmt(s.valorHoraNegro)}/h`,
      importe: s.negro,
    })
  }

  const m = medios(l)
  const renglones: RenglonDelRecibo[] = []
  const elegidos: (number | null)[] = []
  for (const [clave, rotulo] of [['banco', 'Depósito en banco'], ['efectivo', 'Efectivo']] as const) {
    if (!e[clave]) continue
    const x = m[clave]
    renglones.push({ rotulo, importe: x.total })
    elegidos.push(x.total)
    if (e.pagado) {
      renglones.push({ rotulo: 'ya pagado', importe: x.pagado, sub: true })
      renglones.push({ rotulo: 'resta', importe: x.resta, sub: true })
    }
  }
  const total = elegidos.length === 0 || elegidos.some((v) => v == null)
    ? null
    : Math.round(elegidos.reduce<number>((a, v) => a + (v as number), 0) * 100) / 100
  return { horas, medios: renglones, total }
}
