// «NOVEDADES PARA EL ESTUDIO» — el papel de la quincena que se le manda al contador.
//
// ═══ NOVEDADES, NO UN RECIBO ESTIMADO (dueño, 30/09/2026, segundo rechazo) ═══
//
// «Te dije que esos conceptos no tenías que incluirlos en el export a contadores, rehacer todo.» El estudio
// liquida el sueldo: los conceptos (0401, 0425, 4010…), los totales remunerativos y el bruto/neto los calcula
// ÉL. Mandarle nuestra estimación de esos números es mandarle un segundo recibo que compite con el suyo. Lo que
// necesita de nosotros son las novedades: quién, con qué legajo y categoría, a qué $/h y cuántas horas del blanco,
// si cobra presentismo y por qué no, y qué pasó en la quincena (licencias, ingresos, egresos). Por eso este
// módulo ya no toca un solo renglón del recibo: de `reciboFormatoContador` toma únicamente el $/h.
//
// ═══ SÓLO EL BLANCO, Y POR CONSTRUCCIÓN ═══
//
// No se lee el efectivo, los adelantos, los pagos ni el Banco del panel. Tampoco `netoMensual` de oficina: es el
// acordado TOTAL (blanco + negro), no el sueldo del recibo. Como el cuadro no trae el mensual del blanco de la
// oficina, esa columna no existe: un número inventado es peor que una columna ausente.
//
// ═══ DOS BLOQUES, COMO EN LIQ. DE HS ═══
//
// La separación es `FilaDelEspejo.grupo`, la MISMA que dibuja la pantalla: no se re-deriva por rol ni por tarifa.
// Obreros (por hora) y oficina (mensuales) llevan columnas distintas porque el estudio les liquida cosas
// distintas. Las liquidaciones finales (gente que ya se fue) no van: el dueño las excluyó de la quincena.
//
// ═══ CATEGORÍA Y $/H: LOS DEL RECIBO ═══
//
// El blanco usa la categoría y el $/h del último recibo real (`categoriaRecibo`). Sólo si la persona nunca tuvo
// recibo caen a los del legajo, y la fila lo dice en Observaciones para que el estudio no los tome por los suyos.

import { compararPorApellido } from '../../../shared/personas/nombre.ts'
import type { FilaDelEspejo } from './espejoDeJornales.ts'
import type { PresentismoDeLinea } from './presentismo.ts'
import { EMPLEADOR, esReciboContador, periodoDePago, reciboFormatoContador } from './reciboFormatoContador.ts'
import { categoriaVisible } from './vocabularioPersona.ts'

/** Lo que la pantalla sabe de la persona y `FilaDelEspejo` no trae: viene del legajo. */
export interface DatosDelLegajo {
  /** «Maldonado Batista Emiliano Miguel»: el legajo, apellido primero. */
  nombreCompleto: string | null
  legajo: string | null
  cuil: string | null
  convenio: string | null
  puesto: string | null
}

/** Los dos cuadros que viajan al estudio. `final` (liquidaciones finales) no es parte de la quincena. */
export type GrupoDeNovedades = 'obreros' | 'oficina'
/** Qué pidió el dueño bajar: un bloque o los dos. */
export type AlcanceDeNovedades = GrupoDeNovedades | 'todos'

export interface FilaDeNovedades {
  personaId: string
  grupo: GrupoDeNovedades
  legajo: string | null
  apellidoYNombre: string
  cuil: string | null
  /** Obreros: la del RECIBO; sin recibo previo, la del legajo (`categoriaDelLegajo`). Oficina: la del legajo. */
  categoria: string | null
  categoriaDelLegajo: boolean
  convenio: string | null
  puesto: string | null
  /** Sólo obreros: el $/h del blanco (el del recibo; sin recibo previo, el piso de la categoría del legajo). */
  valorHora: number | null
  /** Sólo obreros: `sueldo.horasBlanco`, las horas del blanco que el panel considera para la quincena. */
  horasBlanco: number | null
  /** «Cumple» · «Perdido: llegó tarde 24/09; …» · «No aplica (mensual)» · «No rige» · «Sin dato». */
  presentismo: string
  /** Licencias, ingreso y egreso de la quincena; vacío si no hubo novedad. */
  observaciones: string
}

export interface SeccionDeNovedades {
  grupo: GrupoDeNovedades
  titulo: 'OBREROS' | 'OFICINA'
  filas: FilaDeNovedades[]
}

export interface ReporteDeNovedades {
  empleador: { razonSocial: string; cuit: string }
  titulo: string
  periodo: { desde: string; hasta: string; texto: string }
  emision: string
  alcance: AlcanceDeNovedades
  leyenda: string
  /** Sólo los bloques pedidos, en orden: primero OBREROS, después OFICINA. */
  secciones: SeccionDeNovedades[]
  filas: FilaDeNovedades[]
  /** Uso interno de la pantalla: NO se escribe en el archivo. Liquidaciones finales, que no entran. */
  excluidos: number
  /** Obreros sin recibo previo: categoría y $/h del legajo. */
  sinRecibo: number
}

export const TITULO_DEL_REPORTE = 'Novedades de la quincena para el estudio'

export const LEYENDA_NOVEDADES =
  'Novedades de la quincena informadas por Echegaray Construcciones. Los conceptos e importes del recibo los liquida el estudio. '
  + 'Horas del blanco: las que el OS considera para el recibo de la quincena. Presentismo: rige desde la quincena 2 de 09/2026.'

const TITULO_DE: Record<GrupoDeNovedades, SeccionDeNovedades['titulo']> = { obreros: 'OBREROS', oficina: 'OFICINA' }
const GRUPOS: readonly GrupoDeNovedades[] = ['obreros', 'oficina']
const esGrupoDeNovedades = (g: string): g is GrupoDeNovedades => g === 'obreros' || g === 'oficina'
/**
 * El legajo guarda el CUIL a veces con guiones y a veces sin: al estudio le llega siempre igual (XX-XXXXXXXX-X).
 * Sólo se reordena lo que tiene exactamente 11 dígitos; cualquier otra cosa va tal cual, para no esconder un error.
 */
export function cuilConGuiones(cuil: string | null): string | null {
  const d = cuil?.replace(/\D/g, '') ?? ''
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : cuil
}
const ddmm = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * EL PRESENTISMO CON SU PORQUÉ. Lo dice `presentismo.ts`, el mismo estado que muestra la pantalla. Al estudio no
 * le alcanza un «No»: si lo perdió, tiene que ver qué día y por qué, porque es lo que se discute con el empleado.
 */
export function textoDePresentismo(p: PresentismoDeLinea | null): string {
  if (p?.estado === 'aplica') return p.restituido ? 'Cumple (restituido)' : 'Cumple'
  if (p?.estado === 'no_aplica') return p.motivoNoAplica ? `No aplica (${p.motivoNoAplica})` : 'No aplica'
  if (p?.estado === 'no_rige') return 'No rige'
  if (p?.estado !== 'perdido') return 'Sin dato'
  const porEtiqueta = new Map<string, string[]>()
  for (const c of p.causas) porEtiqueta.set(c.etiqueta, [...(porEtiqueta.get(c.etiqueta) ?? []), ddmm(c.fecha)])
  const detalle = [...porEtiqueta].map(([etiqueta, fechas]) => `${etiqueta.toLowerCase()} ${fechas.join(', ')}`)
  return detalle.length ? `Perdido: ${detalle.join('; ')}` : 'Perdido'
}

/** Lo que pasó en la quincena y el estudio tiene que saber: licencias, ingreso, egreso. Sólo de lo que ya está. */
export function observacionesDe(f: FilaDelEspejo, q: { desde: string; hasta: string }, sinReciboPrevio: boolean): string {
  const partes: string[] = []
  const licencias = f.celdas.filter((c) => c.marca === 'licencia').map((c) => ddmm(c.fecha))
  if (licencias.length) partes.push(`Licencia ${licencias.length} ${licencias.length === 1 ? 'día' : 'días'}: ${licencias.join(', ')}`)
  if (f.alta && f.alta >= q.desde && f.alta <= q.hasta) partes.push(`Ingresó el ${ddmm(f.alta)}`)
  if (f.baja) partes.push(`Egreso: ${f.baja.texto}`)
  if (sinReciboPrevio) partes.push('Sin recibo previo: categoría y $/h del legajo')
  return partes.join(' · ')
}

export interface EntradaDeNovedades {
  filas: readonly FilaDelEspejo[]
  legajos: ReadonlyMap<string, DatosDelLegajo>
  quincena: { desde: string; hasta: string }
  /** `YYYY-MM-DD` de hoy: se pasa, no se lee del reloj, para que el armado sea puro. */
  emision: string
  alcance?: AlcanceDeNovedades
}

function filaDe(f: FilaDelEspejo & { grupo: GrupoDeNovedades }, l: DatosDelLegajo | undefined, q: EntradaDeNovedades['quincena']): FilaDeNovedades {
  const base = {
    personaId: f.personaId, grupo: f.grupo, legajo: l?.legajo ?? null, cuil: cuilConGuiones(l?.cuil ?? null),
    apellidoYNombre: l?.nombreCompleto ?? f.nombre, convenio: l?.convenio ?? null, puesto: l?.puesto ?? null,
    presentismo: textoDePresentismo(f.linea.presentismo),
  }
  if (f.grupo === 'oficina') {
    return { ...base, categoria: categoriaVisible(f.categoria, l?.puesto ?? null), categoriaDelLegajo: true,
      valorHora: null, horasBlanco: null, observaciones: observacionesDe(f, q, false) }
  }
  const s = f.linea.sueldo
  const r = reciboFormatoContador(s)
  const categoriaRecibo = s?.categoriaRecibo ?? null
  return {
    ...base,
    categoria: categoriaRecibo ?? categoriaVisible(f.categoria, l?.puesto ?? null), categoriaDelLegajo: categoriaRecibo == null,
    valorHora: esReciboContador(r) ? r.valorHora : (s?.valorHoraCategoria ?? null),
    horasBlanco: s?.horasBlanco ?? null,
    observaciones: observacionesDe(f, q, categoriaRecibo == null),
  }
}

/** Arma el reporte. Orden: bloque (obreros, oficina) y dentro apellido (el comparador único de personas). */
export function novedadesParaElEstudio(e: EntradaDeNovedades): ReporteDeNovedades {
  const alcance = e.alcance ?? 'todos'
  const filas: FilaDeNovedades[] = []
  let excluidos = 0
  for (const f of e.filas) {
    const grupo = f.grupo
    if (!esGrupoDeNovedades(grupo)) { excluidos += 1; continue }
    if (alcance !== 'todos' && grupo !== alcance) continue
    filas.push(filaDe({ ...f, grupo }, e.legajos.get(f.personaId), e.quincena))
  }
  const secciones = GRUPOS.filter((g) => alcance === 'todos' || g === alcance).map((grupo): SeccionDeNovedades => ({
    grupo, titulo: TITULO_DE[grupo],
    filas: filas.filter((x) => x.grupo === grupo).sort((a, b) => compararPorApellido(a.apellidoYNombre, b.apellidoYNombre)),
  }))
  const ordenadas = secciones.flatMap((x) => x.filas)
  const p = periodoDePago(e.quincena.desde)
  return {
    empleador: { razonSocial: EMPLEADOR.razonSocial, cuit: EMPLEADOR.cuit },
    titulo: TITULO_DEL_REPORTE,
    periodo: { desde: e.quincena.desde, hasta: e.quincena.hasta, texto: p.texto },
    emision: e.emision, alcance, leyenda: LEYENDA_NOVEDADES,
    secciones, filas: ordenadas, excluidos,
    sinRecibo: ordenadas.filter((x) => x.grupo === 'obreros' && x.categoriaDelLegajo).length,
  }
}
