// EL RESUMEN DE LA OBRA (03 · M04) Y SU CIERRE (Z01 · MZ1) — la lógica, sin JSX.
//
// Qué se muestra, en qué orden y con qué palabra cuando falta el dato. Módulo puro (sin `@/`): lo
// prueba `node --test` al lado. Lo visual lo dibuja `TabResumen`.
//
// NULL nunca es 0: cada función devuelve `null` donde no hay dato y la palabra que lo dice.

import { diaHabil, type DiasHabilesObra } from './avancePonderado.ts'
import type { ActividadHH } from './personalService.ts'
import { METODO_CORTO, TIPO_RESTRICCION_LABEL, type Actividad, type ParteEjecucion, type Restriccion } from '../types/index.ts'

export type Tono = 'ink' | 'warn' | 'neg' | 'pos' | 'faint'

const DIA = 86_400_000
const dias = (a: string, b: string) =>
  Math.round((Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00Z`)) / DIA)
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const numAR = (n: number, dec = 0) => n.toLocaleString('es-AR', { maximumFractionDigits: dec })

// ── LO QUE FRENA LA OBRA HOY ────────────────────────────────────────────────

export interface ImpedimentoQueFrena {
  id: string
  tipo: string
  queFalta: string
  responsable: string | null
  vencimiento: { texto: string; tono: Tono }
  /** El borde izquierdo de 2px: rojo si venció, ámbar si compromete o no tiene fecha. */
  borde: 'neg' | 'warn'
}

/** Los impedimentos abiertos, los vencidos primero. `abiertas` ya viene sin las liberadas. */
export function impedimentosQueFrenan(abiertas: readonly Restriccion[], hoy: string): ImpedimentoQueFrena[] {
  const orden = (r: Restriccion) => (r.fecha_compromiso == null ? '9999' : r.fecha_compromiso)
  return [...abiertas]
    .filter((r) => r.estado !== 'liberada')
    .sort((a, b) => orden(a).localeCompare(orden(b)))
    .map((r) => {
      const vencido = r.fecha_compromiso != null && r.fecha_compromiso < hoy
      return {
        id: r.id,
        tipo: TIPO_RESTRICCION_LABEL[r.tipo] ?? r.tipo,
        queFalta: r.descripcion,
        responsable: r.responsable,
        vencimiento: r.fecha_compromiso == null
          ? { texto: 'sin fecha de compromiso', tono: 'faint' }
          : vencido
            ? { texto: `venció ${ddmm(r.fecha_compromiso)}`, tono: 'neg' }
            : { texto: `compromete ${ddmm(r.fecha_compromiso)}`, tono: 'warn' },
        borde: vencido ? 'neg' : 'warn',
      }
    })
}

// ── LAS CIFRAS DE ARRIBA ────────────────────────────────────────────────────

export interface Cifra {
  rotulo: string
  valor: string | null
  falta: string
  bajada: string
  tono: Tono
}

/** «+16 d» contra el plan, con «día hábil A de B · fin proyectado 21/09 · plan 05/09». */
export function plazoDeObra(
  obra: { forecast_fin: string | null; fecha_fin_plan: string | null }, dh: DiasHabilesObra | null,
): Cifra {
  const habil = diaHabil(dh)
  if (!obra.fecha_fin_plan) {
    return { rotulo: 'Plazo', valor: null, falta: 'sin plan', bajada: `${habil} · sin fecha de fin plan`, tono: 'faint' }
  }
  if (!obra.forecast_fin) {
    return {
      rotulo: 'Plazo', valor: null, falta: 'sin proyección',
      bajada: `${habil} · plan ${ddmm(obra.fecha_fin_plan)}`, tono: 'faint',
    }
  }
  const d = dias(obra.forecast_fin, obra.fecha_fin_plan)
  return {
    rotulo: 'Plazo',
    valor: d === 0 ? 'en fecha' : `${d > 0 ? '+' : '−'}${Math.abs(d)} d`,
    falta: '',
    bajada: `${habil} · fin proyectado ${ddmm(obra.forecast_fin)} · plan ${ddmm(obra.fecha_fin_plan)}`,
    tono: d > 0 ? 'warn' : d < 0 ? 'pos' : 'ink',
  }
}

/** Z01 «Plazo final»: «+9 d» con «terminó 14/09 · plan 05/09». */
export function plazoFinal(obra: { fecha_fin_real: string | null; fecha_fin_plan: string | null }): Cifra {
  if (!obra.fecha_fin_real) return { rotulo: 'Plazo final', valor: null, falta: 'sin fin real', bajada: obra.fecha_fin_plan ? `plan ${ddmm(obra.fecha_fin_plan)}` : 'sin plan', tono: 'faint' }
  if (!obra.fecha_fin_plan) return { rotulo: 'Plazo final', valor: null, falta: 'sin plan', bajada: `terminó ${ddmm(obra.fecha_fin_real)}`, tono: 'faint' }
  const d = dias(obra.fecha_fin_real, obra.fecha_fin_plan)
  return {
    rotulo: 'Plazo final',
    valor: d === 0 ? 'en fecha' : `${d > 0 ? '+' : '−'}${Math.abs(d)} d`,
    falta: '',
    bajada: `terminó ${ddmm(obra.fecha_fin_real)} · plan ${ddmm(obra.fecha_fin_plan)}`,
    tono: d > 0 ? 'warn' : d < 0 ? 'pos' : 'ink',
  }
}

/** M04 «Personas hoy»: «12 de 14» con «2 sin fichar». */
export function personasHoy(p: { asignadas: number | null; presentes: number | null } | null): Cifra {
  if (!p || p.presentes == null) return { rotulo: 'Personas hoy', valor: null, falta: 'sin fichadas', bajada: p?.asignadas != null ? `${p.asignadas} asignadas` : 'sin asignadas', tono: 'faint' }
  if (p.asignadas == null) return { rotulo: 'Personas hoy', valor: String(p.presentes), falta: '', bajada: 'sin asignadas', tono: 'ink' }
  const sinFichar = Math.max(0, p.asignadas - p.presentes)
  return {
    rotulo: 'Personas hoy', valor: `${p.presentes} de ${p.asignadas}`, falta: '',
    bajada: sinFichar > 0 ? `${sinFichar} sin fichar` : 'todas fichadas', tono: 'ink',
  }
}

/** Z01 «HH»: «6.734» con «plan 6.420 · +4,9 %». */
export function hhDeCierre(p: { hh_real: number | null; hh_plan: number | null } | null): Cifra {
  if (!p || p.hh_real == null) return { rotulo: 'HH', valor: null, falta: 'sin imputar', bajada: p?.hh_plan != null ? `plan ${numAR(p.hh_plan)}` : 'sin plan', tono: 'faint' }
  if (p.hh_plan == null || p.hh_plan === 0) return { rotulo: 'HH', valor: numAR(p.hh_real), falta: '', bajada: 'sin HH plan', tono: 'ink' }
  const d = (p.hh_real - p.hh_plan) / p.hh_plan * 100
  return {
    rotulo: 'HH', valor: numAR(p.hh_real), falta: '',
    bajada: `plan ${numAR(p.hh_plan)} · ${d > 0 ? '+' : ''}${numAR(d, 1)} %`, tono: 'ink',
  }
}

// ── LOS FRENTES EN CURSO ────────────────────────────────────────────────────

export interface FrenteEnCurso {
  id: string
  nombre: string
  bloqueada: boolean
  medicion: { texto: string; tono: Tono }
  avance: { pct: string | null; detalle: string; tono: Tono }
  hhReal: string | null
  gente: number | null
}

const esViva = (a: Actividad) => a.tipo !== 'resumen' && !a.archivada && !a.actividad_padre_id

/** Las actividades en curso o bloqueadas: las que tienen un frente abierto hoy. */
export function frentesEnCurso(
  actividades: readonly Actividad[], genteHoy: Readonly<Record<string, number>>,
): FrenteEnCurso[] {
  return actividades
    .filter(esViva)
    .filter((a) => a.estado_operativo === 'en_curso' || a.estado_operativo === 'bloqueada'
      || (a.avance_pct != null && a.avance_pct > 0 && a.avance_pct < 100))
    .map((a) => {
      const bloqueada = a.estado_operativo === 'bloqueada'
      const metodo = a.metodo_avance
      const medicion = !metodo
        ? { texto: 'sin método', tono: 'warn' as Tono }
        : { texto: METODO_CORTO[metodo], tono: (metodo === 'manual' ? 'warn' : 'ink') as Tono }
      const pct = a.avance_pct == null ? null : `${numAR(a.avance_pct)}%`
      let detalle = ''
      if (metodo === 'cantidad' && a.cantidad_objetivo != null) {
        detalle = `${numAR(a.cantidad_ejecutada ?? 0, 2)}/${numAR(a.cantidad_objetivo, 2)}${a.unidad ? ` ${a.unidad}` : ''}`
      } else if (metodo === 'partes') {
        detalle = a.n_partes === 1 ? 'de 1 parte' : `de ${a.n_partes} partes`
      } else if (metodo === 'manual') {
        detalle = 'lo declaró una persona'
      } else if (!metodo) {
        detalle = 'no se puede medir'
      }
      return {
        id: a.id,
        nombre: a.nombre,
        bloqueada,
        medicion,
        avance: { pct, detalle, tono: metodo === 'manual' ? 'warn' : 'ink' },
        hhReal: a.hh_real == null ? null : numAR(a.hh_real),
        gente: genteHoy[a.id] ?? null,
      }
    })
}

// ── LO QUE FALTA CARGAR ─────────────────────────────────────────────────────

export interface FaltaCargar {
  clave: string
  rotulo: string
  valor: string
  tono: 'warn' | 'faint'
}

export function loQueFaltaCargar(i: {
  historiasSinCosto: number | null
  actividadesSinFecha: number
  sinMetodo: number
  dependencias: number | null
  actividades: number
  selladas: number | null
}): FaltaCargar[] {
  const salida: FaltaCargar[] = []
  if (i.historiasSinCosto != null) {
    salida.push({
      clave: 'historias-sin-costo', rotulo: 'Historias sin costo de MO',
      valor: i.historiasSinCosto > 0 ? `${i.historiasSinCosto} · no pesan` : '0',
      tono: i.historiasSinCosto > 0 ? 'warn' : 'faint',
    })
  }
  salida.push({
    clave: 'sin-fecha', rotulo: 'Actividades sin ninguna fecha',
    valor: String(i.actividadesSinFecha), tono: i.actividadesSinFecha > 0 ? 'warn' : 'faint',
  })
  salida.push({
    clave: 'sin-metodo', rotulo: 'Sin método de medición',
    valor: String(i.sinMetodo), tono: i.sinMetodo > 0 ? 'warn' : 'faint',
  })
  salida.push({
    clave: 'dependencias', rotulo: 'Dependencias cargadas',
    valor: i.dependencias == null ? 'sin leer' : `${i.dependencias} de ${i.actividades}`, tono: 'faint',
  })
  salida.push({
    clave: 'linea-base', rotulo: 'Línea base',
    valor: i.selladas != null && i.selladas > 0 ? `${i.selladas} selladas` : 'sin sellar · copia del plan',
    tono: 'faint',
  })
  return salida
}

/** Cuántas actividades vivas no tienen método de medición. */
export function sinMetodoDeMedicion(actividades: readonly Actividad[]): number {
  return actividades.filter(esViva).filter((a) => !a.metodo_avance).length
}

// ── ÚLTIMA ACTIVIDAD ────────────────────────────────────────────────────────

export interface EventoReciente { fecha: string; texto: string }

/** Los tres últimos movimientos: partes, con la actividad y la cantidad. */
export function ultimaActividad(
  partes: readonly ParteEjecucion[], actividadDe: ReadonlyMap<string, Pick<Actividad, 'nombre' | 'unidad'>>,
  n = 3,
): EventoReciente[] {
  return [...partes]
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado_en.localeCompare(a.creado_en))
    .slice(0, n)
    .map((p) => {
      const act = actividadDe.get(p.actividad_id)
      const nombre = act?.nombre ?? 'actividad sin nombre'
      const cantidad = p.cantidad != null
        ? ` — ${numAR(p.cantidad, 2)}${act?.unidad ? ` ${act.unidad}` : ''}`
        : p.avance_pct != null ? ` — ${numAR(p.avance_pct)} %` : ''
      return { fecha: ddmm(p.fecha), texto: `Parte de ${nombre}${cantidad}` }
    })
}

// ── Z01 · LO QUE DEJÓ LA OBRA ───────────────────────────────────────────────

export interface HHPorRubro {
  rubro: string
  plan: number | null
  real: number | null
  /** «+3,4 %» · null sin las dos puntas. */
  desvioPct: number | null
}

/** HH plan y real por rubro, desde `obra_actividad_hh` (el único cálculo de HH por actividad). */
export function hhPorRubro(actividades: readonly Actividad[], hh: readonly ActividadHH[]): HHPorRubro[] {
  const rubroDe = new Map(actividades.map((a) => [a.id, a.rubro ?? 'Sin rubro']))
  const acum = new Map<string, { plan: number | null; real: number | null }>()
  for (const h of hh) {
    if (h.tipo === 'resumen') continue
    const rubro = rubroDe.get(h.actividad_id) ?? 'Sin rubro'
    const r = acum.get(rubro) ?? { plan: null, real: null }
    if (h.hh_plan != null) r.plan = (r.plan ?? 0) + h.hh_plan
    if (h.hh_real != null) r.real = (r.real ?? 0) + h.hh_real
    acum.set(rubro, r)
  }
  return [...acum].map(([rubro, r]) => ({
    rubro, plan: r.plan, real: r.real,
    desvioPct: r.plan != null && r.plan > 0 && r.real != null ? (r.real - r.plan) / r.plan * 100 : null,
  }))
}

// ── Z01 · ANTES DE ARCHIVAR ─────────────────────────────────────────────────

export interface PasoDeCierre {
  clave: string
  rotulo: string
  texto: string
  ok: boolean
  accion?: { texto: string; href: string }
}

export function antesDeArchivar(i: {
  obraId: string
  impedimentosAbiertos: number
  ultimoParte: { fecha: string; actividad: string; pct: number | null } | null
  certificado: number | null
  cobrado: number | null
  papelesSinClasificar: number | null
  subcontratos: { total: number; cerrados: number } | null
}): PasoDeCierre[] {
  const plata = (n: number) => `$ ${numAR(n)}`
  const pasos: PasoDeCierre[] = [
    {
      clave: 'impedimentos', rotulo: 'Impedimentos', ok: i.impedimentosAbiertos === 0,
      texto: `${i.impedimentosAbiertos} abiertos`,
      ...(i.impedimentosAbiertos > 0 ? { accion: { texto: 'Resolver', href: `/obras/${i.obraId}?vista=operacion&sub=impedimentos` } } : {}),
    },
    {
      clave: 'partes', rotulo: 'Partes', ok: i.ultimoParte != null,
      texto: i.ultimoParte
        ? `último ${i.ultimoParte.fecha} · ${i.ultimoParte.actividad}${i.ultimoParte.pct != null ? ` ${numAR(i.ultimoParte.pct)} %` : ''}`
        : 'sin partes cargados',
    },
    {
      clave: 'certificados', rotulo: 'Certificados', ok: i.certificado != null && i.certificado > 0,
      texto: i.certificado == null ? 'sin certificar' : `${plata(i.certificado)} certificados · ${i.cobrado == null ? 'sin cobros' : `${plata(i.cobrado)} cobrados`}`,
    },
  ]
  if (i.papelesSinClasificar != null) {
    pasos.push({
      clave: 'papeles', rotulo: 'Papeles', ok: i.papelesSinClasificar === 0,
      texto: i.papelesSinClasificar === 0 ? 'todos clasificados' : `${i.papelesSinClasificar} sin clasificar en Documentos`,
      ...(i.papelesSinClasificar > 0 ? { accion: { texto: 'Clasificar', href: `/obras/${i.obraId}?vista=documentos` } } : {}),
    })
  }
  if (i.subcontratos != null) {
    pasos.push({
      clave: 'subcontratos', rotulo: 'Subcontratos', ok: i.subcontratos.cerrados === i.subcontratos.total,
      texto: i.subcontratos.total === 0 ? 'sin paquetes'
        : `${i.subcontratos.cerrados} de ${i.subcontratos.total} paquetes cerrados`,
    })
  }
  return pasos
}

/** Z01 «Margen»: sin costo objetivo no hay base, y se dice así. */
export function margenDeCierre(p: { monto_contratado: number | null; costo_presupuestado: number | null; costo_real: number | null } | null): { texto: string; tono: Tono } {
  if (!p || p.costo_presupuestado == null) return { texto: 'sin base · costo objetivo sin cargar', tono: 'faint' }
  if (p.monto_contratado == null) return { texto: 'sin contrato cargado', tono: 'faint' }
  if (p.costo_real == null) return { texto: 'sin costo real', tono: 'faint' }
  const m = (p.monto_contratado - p.costo_real) / p.monto_contratado * 100
  return { texto: `${numAR(m, 1)} % sobre contrato`, tono: m < 0 ? 'neg' : 'ink' }
}
