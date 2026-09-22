// EL RESUMEN — «qué necesita una decisión hoy» y «dónde está el parque», con los datos que HAY.
//
// Decisión del dueño (21/09): la pantalla de migración del diseño (D09) no existe; lo que ahí se
// listaba «a resolver» vive acá, con datos reales: activos sin ubicación cargada, estado asumido
// (entraron Operativos sin que nadie los mirara), altas desde obra sin revisar y nombres repetidos que
// pueden ser la misma herramienta. Se suman dos que el diseño ya pedía y que la base sí sabe:
// herramientas con problema que siguen en obra y reparaciones externas sin novedad hace 30 días.

import type { Activo, TipoUbicacion } from '../types.ts'
import { ORDEN_TIPO, activosEn, cantidadEn, conProblema, diasDesde, lugaresDe, rotuloUbicacion, tipoDe, vivo, type Parque } from './parque.ts'

export interface FilaParque {
  tipo: TipoUbicacion | 'sin_ubicacion'
  activos: number
  /** Cuántos lugares distintos de ese tipo tienen algo (9 obras, 6 rodados). */
  lugares: number
}

/**
 * Los activos vivos por tipo de lugar. «Sin ubicación cargada» va aparte y al final, nunca como 0.
 * Un lote repartido cuenta en cada tipo de lugar donde tiene unidades.
 */
export function dondeEstaElParque(p: Parque): FilaParque[] {
  const vivos = p.activos.filter(vivo)
  const filas: FilaParque[] = ORDEN_TIPO.map((tipo) => {
    const lugares = new Set<string>()
    let activos = 0
    for (const a of vivos) {
      const aca = lugaresDe(p, a.id).filter((e) => tipoDe(p, e.ubicacion_id) === tipo)
      if (!aca.length) continue
      activos++
      for (const e of aca) lugares.add(e.ubicacion_id)
    }
    return { tipo, activos, lugares: lugares.size }
  })
  const sin = vivos.filter((a) => lugaresDe(p, a.id).length === 0).length
  return [...filas.filter((f) => f.activos > 0), ...(sin > 0 ? [{ tipo: 'sin_ubicacion' as const, activos: sin, lugares: 0 }] : [])]
}

/** «Amoladora  Bosch GWS-22» y «amoladora bosch gws 22» son el mismo nombre para esto. */
export function nombreComparable(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export interface GrupoRepetido {
  nombre: string
  activos: Activo[]
}

/**
 * Nombres repetidos entre activos vivos. Pueden ser tres amoladoras iguales de verdad, o la misma
 * cargada tres veces: por eso es una DECISIÓN y no una corrección automática. Ordena por tamaño.
 */
export function nombresRepetidos(activos: Activo[]): GrupoRepetido[] {
  const grupos = new Map<string, Activo[]>()
  for (const a of activos.filter(vivo)) {
    const k = nombreComparable(a.nombre)
    if (!k) continue
    const l = grupos.get(k)
    if (l) l.push(a)
    else grupos.set(k, [a])
  }
  return [...grupos.values()]
    .filter((l) => l.length > 1)
    .map((l) => ({ nombre: l[0].nombre, activos: [...l].sort((x, y) => x.codigo.localeCompare(y.codigo)) }))
    .sort((x, y) => y.activos.length - x.activos.length || x.nombre.localeCompare(y.nombre))
}

export type ClaveDecision =
  | 'sin_ubicacion' | 'estado_asumido' | 'alta_desde_obra' | 'repetidos' | 'problema_en_obra' | 'externa_sin_novedad'

export interface Decision {
  clave: ClaveDecision
  titulo: string
  detalle: string
  donde: string
  /** Fecha ISO desde la que pasa, o null si no aplica. */
  desde: string | null
  tono: 'neg' | 'warn' | 'info'
  href: string
  cuenta: number
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
const masVieja = (fechas: string[]) => (fechas.length ? fechas.reduce((a, b) => (a < b ? a : b)) : null)

export function decisiones(p: Parque, hoy: Date = new Date()): Decision[] {
  const vivos = p.activos.filter(vivo)
  const out: Decision[] = []

  const enObraConProblema = vivos.filter(
    (a) => (a.estado === 'requiere_mantenimiento' || a.estado === 'fuera_servicio') && tipoDe(p, a.ubicacion_id) === 'obra',
  )
  if (enObraConProblema.length) {
    const obras = new Set(enObraConProblema.map((a) => a.ubicacion_id)).size
    out.push({
      clave: 'problema_en_obra',
      titulo: `${plural(enObraConProblema.length, 'herramienta con problema sigue', 'herramientas con problema siguen')} en obra`,
      detalle: 'Reportadas y todavía no retiradas al taller',
      donde: plural(obras, 'obra', 'obras'),
      desde: masVieja(enObraConProblema.map((a) => a.estado_desde)),
      tono: 'warn',
      href: '/herramientas/mantenimiento',
      cuenta: enObraConProblema.length,
    })
  }

  const externas = vivos.filter((a) => a.estado === 'reparacion_externa' && diasDesde(a.estado_desde, hoy) > 30)
  if (externas.length) {
    out.push({
      clave: 'externa_sin_novedad',
      titulo: `${plural(externas.length, 'activo', 'activos')} en reparación externa hace más de 30 días`,
      detalle: 'Sin cambio de estado desde que salió',
      donde: 'servicio técnico',
      desde: masVieja(externas.map((a) => a.estado_desde)),
      tono: 'neg',
      href: '/herramientas/mantenimiento',
      cuenta: externas.length,
    })
  }

  const altas = vivos.filter((a) => a.alta_desde_obra)
  if (altas.length) {
    out.push({
      clave: 'alta_desde_obra',
      titulo: `${plural(altas.length, 'alta desde obra', 'altas desde obra')} sin revisar`,
      detalle: 'Las cargó alguien en obra con tres datos: faltan categoría, compra y etiqueta',
      donde: plural(new Set(altas.map((a) => a.ubicacion_id ?? '')).size, 'lugar', 'lugares'),
      desde: masVieja(altas.map((a) => a.creado_en)),
      tono: 'info',
      href: '/herramientas/inventario?filtro=alta_desde_obra',
      cuenta: altas.length,
    })
  }

  const sinUbic = vivos.filter((a) => !a.ubicacion_id)
  if (sinUbic.length) {
    out.push({
      clave: 'sin_ubicacion',
      titulo: `${plural(sinUbic.length, 'activo', 'activos')} sin ubicación cargada`,
      detalle: 'Vinieron así del listado: no se sabe dónde están',
      donde: '—',
      desde: null,
      tono: 'warn',
      href: '/herramientas/inventario?ubicacion=sin',
      cuenta: sinUbic.length,
    })
  }

  const asumidos = vivos.filter((a) => a.estado_asumido)
  if (asumidos.length) {
    out.push({
      clave: 'estado_asumido',
      titulo: `${plural(asumidos.length, 'activo figura', 'activos figuran')} «Operativo» sin que nadie lo haya revisado`,
      detalle: 'Estado asumido al importar el listado',
      donde: 'todo el parque',
      desde: masVieja(asumidos.map((a) => a.estado_desde)),
      tono: 'info',
      href: '/herramientas/inventario?filtro=asumido',
      cuenta: asumidos.length,
    })
  }

  const rep = nombresRepetidos(vivos)
  if (rep.length) {
    const n = rep.reduce((s, g) => s + g.activos.length, 0)
    const ej = rep.slice(0, 2).map((g) => `${g.nombre} ×${g.activos.length}`).join(' · ')
    out.push({
      clave: 'repetidos',
      titulo: `${plural(rep.length, 'nombre repetido', 'nombres repetidos')} · ${plural(n, 'activo', 'activos')}`,
      detalle: `Pueden ser la misma herramienta cargada dos veces: ${ej}`,
      donde: '—',
      desde: null,
      tono: 'info',
      href: '/herramientas/inventario?filtro=repetidos',
      cuenta: rep.length,
    })
  }
  return out
}

export interface Cifras {
  herramientas: number
  equipos: number
  rodados: number
  requierenMant: number
  requierenMantEnObra: number
  reparacionExterna: number
  externaMas30: number
  /** Vivos sin movimiento ni reporte en 90 días. Los «nunca» van aparte: vacío no es cero. */
  sinVer90: number
  nuncaVistos: number
}

export function cifras(p: Parque, hoy: Date = new Date()): Cifras {
  const vivos = p.activos.filter(vivo)
  let sinVer90 = 0
  let nunca = 0
  for (const a of vivos) {
    const m = p.movsDe.get(a.id)?.[0]?.fecha_hora
    const i = p.incDe.get(a.id)?.[0]?.creado_en
    const v = m && i ? (m > i ? m : i) : (m ?? i ?? null)
    if (!v) nunca++
    else if (diasDesde(v, hoy) > 90) sinVer90++
  }
  const req = vivos.filter((a) => a.estado === 'requiere_mantenimiento')
  const ext = vivos.filter((a) => a.estado === 'reparacion_externa')
  return {
    herramientas: vivos.filter((a) => a.clase === 'herramienta').length,
    equipos: vivos.filter((a) => a.clase === 'equipo').length,
    rodados: vivos.filter((a) => a.clase === 'rodado').length,
    requierenMant: req.length,
    requierenMantEnObra: req.filter((a) => tipoDe(p, a.ubicacion_id) === 'obra').length,
    reparacionExterna: ext.length,
    externaMas30: ext.filter((a) => diasDesde(a.estado_desde, hoy) > 30).length,
    sinVer90,
    nuncaVistos: nunca,
  }
}

export interface ObraConHerramientas {
  ubicacionId: string
  rotulo: string
  cliente: string | null
  activos: number
  /** Los lotes suman las unidades que hay en ESA obra. */
  unidades: number
  conProblema: number
}

/**
 * Cada obra que tiene algo hoy, con lo que tiene (dueño, 22/09: «en seccion resumen … tiene q poder
 * accederse directamente a cada obra y ver lo q hay»). De la que más tiene a la que menos.
 */
export function obrasConHerramientas(p: Parque): ObraConHerramientas[] {
  return p.ubicaciones
    .filter((u) => u.tipo === 'obra')
    .map((u) => {
      const aca = activosEn(p, u.id)
      const obra = u.obra_id ? p.obraPorId.get(u.obra_id) : undefined
      return {
        ubicacionId: u.id,
        rotulo: rotuloUbicacion(p, u.id),
        cliente: obra?.cliente ?? null,
        activos: aca.length,
        unidades: aca.reduce((s, a) => s + cantidadEn(p, a.id, u.id), 0),
        conProblema: aca.filter(conProblema).length,
      }
    })
    .filter((o) => o.activos > 0)
    .sort((a, b) => b.activos - a.activos || a.rotulo.localeCompare(b.rotulo, 'es'))
}
