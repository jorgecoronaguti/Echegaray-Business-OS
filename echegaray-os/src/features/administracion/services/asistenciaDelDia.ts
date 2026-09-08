// ASISTIR Y CARGAR HORAS SON DOS HECHOS DISTINTOS — y esta pantalla los mezclaba.
//
// ═══ EL ERROR QUE ESTE ARCHIVO EXISTE PARA IMPEDIR ═══
//
// El dueño, 08/09/2026: *«una cosa es asistir y otra la carga de horas […] se ve "no fichado"
// cuando sí están todos, pero que no tengan horas cargadas aún no implica que no hayan fichado»*.
//
// «En obra ahora» leía SÓLO `asistencia_marca` (vía `presencia_del_dia`) y publicaba «0 de 17
// fichados · 17 sin fichar todavía» con diecisiete tarjetas debajo. Medido en la base el
// 08/09/2026: `asistencia_marca` tiene CUATRO filas en toda su historia —dos entradas y dos
// salidas, del 20 y del 25 de agosto, origen `empleado_web`—, mientras `registros_hh` tiene 339
// del último mes. O sea: el fichaje desde el celular todavía no se usa, y la pantalla convertía
// esa capacidad sin estrenar en una afirmación diaria sobre diecisiete personas.
//
// La ausencia de una capacidad no es un dato sobre la gente. Por eso el fichaje y la asistencia
// viajan por caminos separados y NUNCA se suman: son dos preguntas con dos fuentes.
//
//   FICHAJE      → `asistencia_marca` / `presencia_del_dia`. Lo marca la persona (entrada/salida).
//   ASISTENCIA   → `registros_hh` del día. La carga el jefe o Administración: horas por obra.
//
// ═══ QUÉ SIGNIFICA CADA SILENCIO ═══
//
// Sin registro NO es ausente: es «sin cargar todavía». La ausencia es una decisión de alguien y
// deja su propia fila con `tipo_hora='ausencia'` (o `'licencia'`). Es la misma regla que ya
// gobierna `jornadaPorObra.ts`, y qué hora es trabajo lo sigue decidiendo `tipoHora.ts` —acá no se
// redefine nada de eso, se reusa—.

import { contieneEnAlguno } from '../../../shared/utils/busqueda.ts'
import { esTrabajada } from '../../obras/services/tipoHora.ts'
import { redondear } from './jornadaPorObra.ts'
import type { Esperado } from './presencia.ts'

/** Lo que la pantalla puede afirmar de una persona en el día. Ninguno se llama «no fichó». */
export type EstadoDelDia = 'con_horas' | 'ausente' | 'licencia' | 'sin_cargar'

/** Una fila de `registros_hh` del día, con el rótulo de su obra y de su persona ya resueltos. */
export interface RegistroDelDia {
  persona_id: string
  nombre: string | null
  categoria: string | null
  obra_id: string | null
  obra: string | null
  horas: number
  tipo_hora: string
  notas: string | null
}

export interface PersonaDelDia {
  personaId: string
  nombre: string
  /** La categoría de convenio, igual que la columna CATEGORÍA de Plantel. Nunca se inventa. */
  categoria: string | null
  estado: EstadoDelDia
  /** Horas TRABAJADAS cargadas. `null` cuando no hay nada cargado — no es cero. */
  horas: number | null
  /** El porqué de la ausencia o la licencia, tal como se cargó. `null` = no se declaró. */
  motivo: string | null
}

export interface ObraDelDia {
  obraId: string | null
  nombre: string
  gente: PersonaDelDia[]
  conHoras: number
  /** Ausencias + licencias declaradas. Se cuentan juntas: las dos son una decisión tomada. */
  declarados: number
  sinCargar: number
  /** Horas trabajadas del día en esa obra. Las de una ausencia no entran. */
  horas: number
}

export interface AsistenciaDelDia {
  obras: ObraDelDia[]
  conHoras: number
  declarados: number
  sinCargar: number
  /** Cuánta gente entra en la cuenta: asignados vigentes más quien cargó sin asignación. */
  plantel: number
  horas: number
}

const rotulo = (id: string | null, nombre: string | null): string =>
  nombre?.trim() || id || 'Sin obra imputada'

/**
 * La clasificación de una persona a partir de sus registros del día.
 *
 * LO DECLARADO GANA SOBRE LO IMPUTADO: si alguien declaró que no vino, la pantalla no puede decir
 * que trabajó porque además exista una imputación vieja del mismo día. Es la regla de
 * `armarJornada`, con una diferencia deliberada: acá la licencia NO se colapsa dentro de
 * «ausente». Una licencia por enfermedad y una falta son dos novedades distintas para quien
 * liquida, y esta pantalla las tiene que poder distinguir de un vistazo.
 */
export function clasificar(registros: RegistroDelDia[]): {
  estado: EstadoDelDia; horas: number | null; motivo: string | null
} {
  const declarado = registros.find((r) => !esTrabajada(r.tipo_hora))
  if (declarado) {
    return {
      estado: declarado.tipo_hora === 'licencia' ? 'licencia' : 'ausente',
      horas: null,
      motivo: declarado.notas?.trim() || null,
    }
  }
  if (registros.length === 0) return { estado: 'sin_cargar', horas: null, motivo: null }
  return {
    estado: 'con_horas',
    horas: redondear(registros.reduce((s, r) => s + r.horas, 0)),
    motivo: null,
  }
}

/**
 * La asistencia del día agrupada por obra.
 *
 * `esperados` son los que tienen asignación vigente (`persona_directorio`); `registros`, lo que hay
 * cargado hoy. La obra de cada uno es la del REGISTRO cuando cargó —ahí es donde pesan sus horas—,
 * y la de su asignación cuando no. Alguien que cargó en una obra a la que ya no está asignado
 * aparece igual: sus horas existen y alguien las tiene que poder ver.
 */
export function asistenciaDelDia(
  { esperados, registros }: { esperados: Esperado[]; registros: RegistroDelDia[] },
): AsistenciaDelDia {
  const porPersona = new Map<string, RegistroDelDia[]>()
  for (const r of registros) {
    const previos = porPersona.get(r.persona_id)
    if (previos) previos.push(r)
    else porPersona.set(r.persona_id, [r])
  }

  const filas: (PersonaDelDia & { obraId: string | null; obra: string | null })[] = []
  const vistas = new Set<string>()

  for (const e of esperados) {
    const suyos = porPersona.get(e.id) ?? []
    const donde = suyos[0]
    vistas.add(e.id)
    filas.push({
      personaId: e.id,
      nombre: e.nombre_completo,
      categoria: e.categoria,
      obraId: donde?.obra_id ?? e.obra_actual_id,
      obra: donde?.obra ?? e.obra_actual,
      ...clasificar(suyos),
    })
  }

  // Cargó horas y no está entre los esperados: la asignación venció, o nunca hubo. Su obra es la
  // del registro; esconderlo dejaría horas imputadas que ninguna pantalla muestra.
  for (const [personaId, suyos] of porPersona) {
    if (vistas.has(personaId)) continue
    filas.push({
      personaId,
      nombre: suyos[0].nombre ?? personaId,
      categoria: suyos[0].categoria,
      obraId: suyos[0].obra_id,
      obra: suyos[0].obra,
      ...clasificar(suyos),
    })
  }

  const porObra = new Map<string, ObraDelDia>()
  for (const f of filas) {
    const clave = f.obraId ?? '·sin-obra'
    const obra = porObra.get(clave) ?? {
      obraId: f.obraId, nombre: rotulo(f.obraId, f.obra), gente: [],
      conHoras: 0, declarados: 0, sinCargar: 0, horas: 0,
    }
    obra.gente.push({
      personaId: f.personaId, nombre: f.nombre, categoria: f.categoria,
      estado: f.estado, horas: f.horas, motivo: f.motivo,
    })
    if (f.estado === 'con_horas') { obra.conHoras += 1; obra.horas = redondear(obra.horas + (f.horas ?? 0)) }
    else if (f.estado === 'sin_cargar') obra.sinCargar += 1
    else obra.declarados += 1
    porObra.set(clave, obra)
  }

  const obras = [...porObra.values()]
    .map((o) => ({ ...o, gente: [...o.gente].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) }))
    .sort((a, b) => b.gente.length - a.gente.length || a.nombre.localeCompare(b.nombre, 'es'))

  return {
    obras,
    conHoras: filas.filter((f) => f.estado === 'con_horas').length,
    declarados: filas.filter((f) => f.estado === 'ausente' || f.estado === 'licencia').length,
    sinCargar: filas.filter((f) => f.estado === 'sin_cargar').length,
    plantel: filas.length,
    horas: redondear(filas.reduce((s, f) => s + (f.estado === 'con_horas' ? (f.horas ?? 0) : 0), 0)),
  }
}

/**
 * LA BÚSQUEDA SE APLICA DESPUÉS DE CLASIFICAR, nunca antes.
 *
 * Filtrar los registros crudos sacaría la fila de horas de alguien y lo dejaría «sin cargar»: la
 * pantalla afirmaría que a una persona no se le cargó el día porque el apellido tipeado no coincide
 * con el nombre de su obra. Los conteos se rehacen sobre lo que queda visible, para que el titular
 * no diga una cosa y la lista otra.
 */
export function filtrarAsistencia(a: AsistenciaDelDia, q: string): AsistenciaDelDia {
  const t = q.trim()
  if (t === '') return a
  const obras = a.obras
    .map((o) => ({
      ...o,
      gente: o.gente.filter((g) => contieneEnAlguno([g.nombre, g.categoria, o.nombre], t)),
    }))
    .filter((o) => o.gente.length > 0)
    .map((o) => ({
      ...o,
      conHoras: o.gente.filter((g) => g.estado === 'con_horas').length,
      declarados: o.gente.filter((g) => g.estado === 'ausente' || g.estado === 'licencia').length,
      sinCargar: o.gente.filter((g) => g.estado === 'sin_cargar').length,
      horas: redondear(o.gente.reduce((s, g) => s + (g.estado === 'con_horas' ? (g.horas ?? 0) : 0), 0)),
    }))
  const gente = obras.flatMap((o) => o.gente)
  return {
    obras,
    conHoras: gente.filter((g) => g.estado === 'con_horas').length,
    declarados: gente.filter((g) => g.estado === 'ausente' || g.estado === 'licencia').length,
    sinCargar: gente.filter((g) => g.estado === 'sin_cargar').length,
    plantel: gente.length,
    horas: redondear(gente.reduce((s, g) => s + (g.estado === 'con_horas' ? (g.horas ?? 0) : 0), 0)),
  }
}

/** El resumen del titular. Los tres números salen siempre, incluso en cero: un cero explícito es
 *  una respuesta, y una cifra ausente obliga a quien lee a preguntarse si hubo o no. */
export function resumenAsistencia(a: AsistenciaDelDia): string {
  if (a.plantel === 0) return 'Nadie con asignación vigente ni horas cargadas hoy'
  return `${a.conHoras} con horas · ${a.declarados} ausentes/licencia · ${a.sinCargar} sin cargar`
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL FICHAJE, POR SU PROPIO CAMINO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface ResumenFichaje {
  entradas: number
  salidas: number
  /** Sin una sola marca la pantalla NO dibuja diecisiete «no fichó»: lo dice una vez y en neutro. */
  hayMarcas: boolean
}

/** Cuántas marcas reales de entrada y de salida hay hoy. Nunca se compara contra el plantel: el
 *  denominador convertiría «esta capacidad no se usa» en «faltó gente». */
export function resumenFichaje(
  marcas: { entrada: string | null; salida: string | null }[],
): ResumenFichaje {
  const entradas = marcas.filter((m) => m.entrada != null).length
  const salidas = marcas.filter((m) => m.salida != null).length
  return { entradas, salidas, hayMarcas: entradas + salidas > 0 }
}

/** La línea del bloque de fichaje. Cuando no hay marcas explica POR QUÉ no las hay, sin culpar a
 *  nadie: la capacidad todavía no está en uso. */
export function textoFichaje(f: ResumenFichaje): string {
  if (!f.hayMarcas) {
    return 'Sin marcas de entrada/salida (el fichaje desde el celular todavía no está en uso)'
  }
  const partes = [`${f.entradas} ${f.entradas === 1 ? 'entrada' : 'entradas'}`]
  partes.push(`${f.salidas} ${f.salidas === 1 ? 'salida' : 'salidas'}`)
  return partes.join(' · ')
}
