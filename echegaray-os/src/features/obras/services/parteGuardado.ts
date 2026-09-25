// EL PARTE YA GUARDADO — editarlo, corregirlo por voz y borrarlo, sin una tabla nueva.
//
// Dueño, 25/09/2026: «vas a tener que dar la posibilidad de editar o borrar el parte diario por voz,
// para usuarios y para admin; si no, es un desastre» y «usá Supabase con las mismas tablas, que no se
// crucen datos ni se cargue dos veces nada».
//
// El parte de una obra en un día NO es una fila: es lo que las puertas del parte dejaron en sus tablas
// (la jornada en `registros_hh` + la marca en `asistencia_dia`, el avance en `obra_ejecucion`, la
// novedad en `obra_actividad_nota`, el pedido en `pedidos_materiales`). Acá se decide, puro:
//
//   · cómo se arma la revisión a partir de lo guardado (`revisionDeGuardado`);
//   · cómo se aplica una corrección dictada ENCIMA de lo guardado (`aplicarCorreccion`): se
//     actualiza lo que se nombró y el resto queda como estaba;
//   · qué cambia contra lo guardado (`diferencias`), que es lo que después ejecuta cada puerta.

import type { FilaAvance, FilaMaterial, Propuesta, Revision } from './dictadoParte'

export interface PersonaGuardada {
  persona_id: string
  nombre: string
  estado: 'presente' | 'ausente'
  horas: number | null
  tarea_id: string | null
  tarea_nombre: string | null
}
export interface AvanceGuardado {
  ejecucion_id: string
  tarea_id: string
  tarea_nombre: string
  /** Lo que el parte de ese día dice en «Producción hoy»: el incremento, no el acumulado. */
  produccion: number
  metodo: string
  unidad: string
  /** El avance de la tarea CON este parte adentro (lo que dice la 04 hoy). */
  actual: number
}
export interface MaterialGuardado {
  id_pedido: string
  material: string
  cantidad: number
  unidad: string
  estado: string
  /** Ya lo vio, compró o entregó alguien: no se cancela ni se cambia desde el parte. */
  procesado: boolean
}
export interface ParteGuardado {
  obra_id: string
  fecha: string
  personas: PersonaGuardada[]
  avances: AvanceGuardado[]
  materiales: MaterialGuardado[]
  novedad: { nota_id: string; texto: string } | null
  /** Los dictados guardados ese día (lo que se anula al borrar). */
  dictados: string[]
  vacio: boolean
}

const avanceComoFila = (a: AvanceGuardado): FilaAvance => ({
  tarea_id: a.tarea_id, tarea_nombre: a.tarea_nombre, metodo: a.metodo, unidad: a.metodo === 'cantidad' ? a.unidad : '%',
  tipo: a.metodo === 'cantidad' ? 'cantidad' : 'incremento_pct', valor: a.produccion, produccion: a.produccion,
  actual: a.actual, candidatos: [], dudoso: false, motivo: null, tramo: null,
})

/** LA REVISIÓN DE LO QUE YA ESTÁ: todo confirmado, nada en amarillo (no salió de un audio). */
export function revisionDeGuardado(g: ParteGuardado): Revision {
  return {
    personas: g.personas.map((p, i) => ({
      ...p, horasDe: null, tarea_candidatos: [], confianza: 'alta', dudoso: false, motivo: null, tramo: null,
      origen: 'guardado', clave: `g${i}`, incluida: true, confirmada: true,
    })),
    avances: g.avances.map((a, i) => ({ ...avanceComoFila(a), ejecucion_id: a.ejecucion_id, origen: 'guardado', clave: `ga${i}`, incluida: true, confirmada: true })),
    materiales: g.materiales.map((m, i) => ({
      material: m.material, cantidad: m.cantidad, unidad: m.unidad, urgencia: 'semana', dudoso: false, motivo: null, tramo: null,
      id_pedido: m.id_pedido, procesado: m.procesado, origen: 'guardado', clave: `gm${i}`, incluida: true, confirmada: true,
    })),
    urgencia: 'semana',
    novedad: g.novedad?.texto ?? '',
  }
}

/**
 * «QUIROGA SÍ VINO, 8 HORAS EN ENCOFRADO» SOBRE EL PARTE QUE YA ESTÁ.
 *
 * Lo que la corrección nombra reemplaza a lo guardado de esa persona o esa tarea y queda en amarillo
 * (o naranja si es dudoso); lo que no nombra queda igual. Si la corrección no dijo horas o tarea de
 * alguien que ya las tenía, se conservan las guardadas: «Quiroga sí vino» no le borra la tarea.
 *
 * EL AVANCE SE RECALCULA SIN EL PARTE DE HOY. El parser calcula «quedó al 45 %» contra el avance
 * actual, que YA incluye lo guardado hoy; corregir es reemplazar el número del día, así que el
 * incremento es 45 − (actual − lo de hoy).
 */
export function aplicarCorreccion(base: Revision, p: Propuesta): Revision {
  const personas = [...base.personas]
  let n = 0
  for (const f of p.personas) {
    const i = f.persona_id ? personas.findIndex((x) => x.persona_id === f.persona_id) : -1
    const nueva = { ...f, clave: `c${n++}`, incluida: true, confirmada: false }
    if (i < 0) { personas.push(nueva); continue }
    const previa = personas[i]
    const horas = f.estado === 'presente' && f.horasDe === 'jornada' && previa.horas != null ? previa.horas : f.horas
    const tarea = f.tarea_id ?? (f.estado === 'presente' ? previa.tarea_id : null)
    personas[i] = {
      ...nueva, clave: previa.clave, horas,
      tarea_id: tarea, tarea_nombre: f.tarea_id ? f.tarea_nombre : f.estado === 'presente' ? previa.tarea_nombre : null,
    }
  }
  const avances = [...base.avances]
  for (const a of p.avances) {
    const i = avances.findIndex((x) => x.tarea_id === a.tarea_id)
    const hoy = i >= 0 ? (avances[i].produccion ?? 0) : 0
    let produccion = a.produccion
    let dudoso = a.dudoso
    let motivo = a.motivo
    if (a.metodo !== 'cantidad' && (a.tipo === 'acumulado_pct' || a.tipo === 'terminado')) {
      const sinHoy = a.actual - hoy
      const valor = a.tipo === 'terminado' ? 100 : a.valor
      produccion = Math.round((valor - sinHoy) * 100) / 100
      const soloPorLoDeHoy = /^ya estaba/.test(a.motivo ?? '')
      if (produccion > 0 && soloPorLoDeHoy) { dudoso = a.candidatos.length > 1; motivo = dudoso ? 'no queda claro de qué tarea' : null }
      if (produccion <= 0) { produccion = null; dudoso = true; motivo = `sin el parte de hoy estaba en ${sinHoy} %` }
    }
    const fila = { ...a, produccion, dudoso, motivo, clave: `ca${n++}`, incluida: true, confirmada: false }
    if (i >= 0) avances[i] = { ...fila, clave: avances[i].clave, ejecucion_id: avances[i].ejecucion_id }
    else avances.push(fila)
  }
  const materiales = [...base.materiales, ...p.materiales.map((m) => ({ ...m, clave: `cm${n++}`, incluida: true, confirmada: false }))]
  const nuevas = p.novedades.map((x) => x.texto).join('\n')
  return {
    personas, avances, materiales,
    urgencia: p.materiales[0]?.urgencia ?? base.urgencia,
    novedad: [base.novedad, nuevas].filter((x) => x.trim()).join('\n'),
  }
}

export interface Diferencias {
  /** Presentes/ausentes que se escriben (nuevos o cambiados). Lo que no cambió no viaja. */
  marcas: { persona_id: string; estado: 'presente' | 'ausente'; horas: number | null; tarea_id: string | null }[]
  /** Personas que estaban en el parte y se sacaron: su jornada y su marca de ESA obra se borran. */
  quitarPersonas: string[]
  /** Avances que se escriben (nuevos o cambiados) y los renglones que se borran. */
  avances: { tarea_id: string; produccion: number }[]
  borrarEjecuciones: string[]
  /** Material: lo nuevo se pide; lo sacado o cambiado se cancela (si nadie lo procesó todavía). */
  pedir: { material: string; cantidad: number; unidad: string }[]
  cancelar: string[]
  /** Lo que se quería cambiar de un pedido ya procesado: no se toca, se dice. */
  noSeCancela: string[]
  novedad: { cambia: boolean; borrar: string | null; nueva: string }
  hayCambios: boolean
}

type ConId = { ejecucion_id?: string; id_pedido?: string; procesado?: boolean }

/** QUÉ CAMBIA CONTRA LO GUARDADO. Se decide acá para que cada puerta reciba sólo lo suyo. */
export function diferencias(g: ParteGuardado, r: Revision): Diferencias {
  const antes = new Map(g.personas.map((p) => [p.persona_id, p]))
  const marcas: Diferencias['marcas'] = []
  const quedan = new Set<string>()
  for (const f of r.personas) {
    if (!f.incluida || !f.persona_id) continue
    quedan.add(f.persona_id)
    const a = antes.get(f.persona_id)
    const horas = f.estado === 'presente' ? f.horas : null
    const tarea = f.estado === 'presente' ? f.tarea_id : null
    if (a && a.estado === f.estado && (a.horas ?? null) === horas && (a.tarea_id ?? null) === tarea) continue
    marcas.push({ persona_id: f.persona_id, estado: f.estado, horas, tarea_id: tarea })
  }
  const quitarPersonas = g.personas.filter((p) => !quedan.has(p.persona_id)).map((p) => p.persona_id)

  const avAntes = new Map(g.avances.map((a) => [a.tarea_id, a]))
  const avances: Diferencias['avances'] = []
  const tareasQuedan = new Set<string>()
  for (const a of r.avances) {
    if (!a.incluida || a.produccion == null) continue
    tareasQuedan.add(a.tarea_id)
    const previo = avAntes.get(a.tarea_id)
    if (previo && previo.produccion === a.produccion) continue
    avances.push({ tarea_id: a.tarea_id, produccion: a.produccion })
  }
  const borrarEjecuciones = g.avances.filter((a) => !tareasQuedan.has(a.tarea_id)).map((a) => a.ejecucion_id)

  const matAntes = new Map(g.materiales.map((m) => [m.id_pedido, m]))
  const pedir: Diferencias['pedir'] = []
  const cancelar: string[] = []
  const noSeCancela: string[] = []
  const siguen = new Set<string>()
  for (const m of r.materiales as (FilaMaterial & ConId & { incluida: boolean })[]) {
    const previo = m.id_pedido ? matAntes.get(m.id_pedido) : undefined
    if (previo) {
      siguen.add(previo.id_pedido)
      const igual = m.incluida && previo.cantidad === m.cantidad && previo.unidad === m.unidad && previo.material === m.material.trim()
      if (igual) continue
      if (previo.procesado) { noSeCancela.push(previo.material); continue }
      cancelar.push(previo.id_pedido)
      if (m.incluida) pedir.push({ material: m.material.trim(), cantidad: m.cantidad, unidad: m.unidad })
      continue
    }
    if (m.incluida) pedir.push({ material: m.material.trim(), cantidad: m.cantidad, unidad: m.unidad })
  }
  for (const m of g.materiales) {
    if (siguen.has(m.id_pedido)) continue
    if (m.procesado) noSeCancela.push(m.material)
    else cancelar.push(m.id_pedido)
  }

  const textoAntes = (g.novedad?.texto ?? '').trim()
  const textoDespues = r.novedad.trim()
  const cambia = textoAntes !== textoDespues
  const novedad = { cambia, borrar: cambia && g.novedad ? g.novedad.nota_id : null, nueva: cambia ? textoDespues : '' }

  const hayCambios = marcas.length + quitarPersonas.length + avances.length + borrarEjecuciones.length
    + pedir.length + cancelar.length > 0 || cambia
  return { marcas, quitarPersonas, avances, borrarEjecuciones, pedir, cancelar, noSeCancela, novedad, hayCambios }
}

/** «asistencia de 4 personas (32 h), 1 avance, 1 novedad y 1 pedido sin procesar» — la confirmación de Borrar. */
export function queSeBorra(g: ParteGuardado): string {
  const horas = g.personas.reduce((s, p) => s + (p.horas ?? 0), 0)
  const partes: string[] = []
  if (g.personas.length) partes.push(`asistencia de ${g.personas.length} ${g.personas.length === 1 ? 'persona' : 'personas'}${horas ? ` (${String(horas).replace('.', ',')} h)` : ''}`)
  if (g.avances.length) partes.push(`${g.avances.length} ${g.avances.length === 1 ? 'avance' : 'avances'}`)
  if (g.novedad) partes.push('1 novedad')
  const sinProcesar = g.materiales.filter((m) => !m.procesado).length
  if (sinProcesar) partes.push(`${sinProcesar} ${sinProcesar === 1 ? 'pedido sin procesar' : 'pedidos sin procesar'}`)
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}` : (partes[0] ?? 'nada')
  const procesados = g.materiales.length - sinProcesar
  return procesados ? `${lista}. ${procesados} ${procesados === 1 ? 'pedido ya procesado queda' : 'pedidos ya procesados quedan'}.` : `${lista}.`
}

/** Para la bitácora: lo que el parte decía, corto y legible. */
export function resumenParaBitacora(g: Pick<ParteGuardado, 'personas' | 'avances' | 'materiales' | 'novedad'>): string {
  return JSON.stringify({
    personas: g.personas.map((p) => [p.nombre, p.estado, p.horas, p.tarea_nombre]),
    avances: g.avances.map((a) => [a.tarea_nombre, a.produccion]),
    materiales: g.materiales.map((m) => [m.material, m.cantidad, m.unidad]),
    novedad: g.novedad?.texto ?? null,
  })
}


/** Antes de guardar lo editado: nada naranja sin confirmar y horas posibles. */
export function validarEdicion(r: Revision): string | null {
  const pend = [...r.personas, ...r.avances, ...r.materiales].filter((f) => f.incluida && (('persona_id' in f && f.persona_id == null) || (f.dudoso && !f.confirmada))).length
  if (pend) return `Falta confirmar ${pend} ${pend === 1 ? 'dato' : 'datos'} (en naranja): confirmalo, corregilo o sacalo.`
  const mal = r.personas.find((f) => f.incluida && f.estado === 'presente' && !(f.horas != null && f.horas > 0 && f.horas <= 24))
  if (mal) return `${mal.nombre}: las horas van de 0 a 24.`
  const sinAvance = r.avances.find((a) => a.incluida && !(a.produccion != null && a.produccion > 0))
  if (sinAvance) return `${sinAvance.tarea_nombre}: poné el avance de hoy o sacalo.`
  return null
}
