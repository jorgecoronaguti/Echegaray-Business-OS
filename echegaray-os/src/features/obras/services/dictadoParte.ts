// DICTAR PARTE — lo que la pantalla DECIDE, sin React, sin base y sin red (se prueba con node --test).
//
// La propuesta la arma la VM (`orquestador/lib/ml/voz-parte.mjs`); acá se decide cómo se revisa
// (qué falta confirmar, cómo se agrupa «4 más», qué se resalta en «Lo que dijo») y QUÉ VIAJA a cada
// puerta del parte cuando la persona toca «Guardar parte». La maqueta aprobada el 25/09/2026 manda:
//
//   · NUNCA guarda sin que la persona toque Guardar — `armarEnvio` sólo arma, no escribe.
//   · Lo dudoso se confirma — `armarEnvio` rechaza si queda algo naranja sin confirmar ni quitar.
//   · Lo que no entendió queda en Novedades como texto — la novedad arranca con eso, editable.

export type EstadoDictado = 'pendiente' | 'transcribiendo' | 'listo' | 'error' | 'guardado' | 'descartado'
export type Tramo = [number, number] | null
export interface Opcion { id: string; nombre: string }

export interface FilaPersona {
  persona_id: string | null
  nombre: string
  estado: 'presente' | 'ausente'
  horas: number | null
  horasDe?: 'dicho' | 'oracion' | 'general' | 'jornada' | null
  tarea_id: string | null
  tarea_nombre: string | null
  tarea_candidatos?: Opcion[]
  /** Dos personas que se llaman igual: hay que elegir. */
  candidatos?: Opcion[]
  confianza: 'alta' | 'media' | 'baja'
  dudoso: boolean
  motivo: string | null
  tramo: Tramo
  origen: 'dictado' | 'grupo' | 'modelo'
  grupo?: string
}

export interface FilaAvance {
  tarea_id: string
  tarea_nombre: string
  metodo: string
  unidad: string
  tipo: 'acumulado_pct' | 'incremento_pct' | 'cantidad' | 'terminado'
  valor: number
  /** Lo que va a «Producción hoy» del parte: el INCREMENTO del día, no el acumulado. */
  produccion: number | null
  actual: number
  candidatos: Opcion[]
  dudoso: boolean
  motivo: string | null
  tramo: Tramo
}

export interface FilaMaterial {
  material: string
  cantidad: number
  unidad: string
  urgencia: 'hoy' | 'semana' | 'cuando_se_pueda'
  dudoso: boolean
  motivo: string | null
  tramo: Tramo
}

export interface Marca { desde: number; hasta: number; tipo: 'dato' | 'duda' }

export interface Propuesta {
  version: number
  estado: 'propuesta'
  texto: string
  personas: FilaPersona[]
  avances: FilaAvance[]
  materiales: FilaMaterial[]
  novedades: { texto: string; tramo: Tramo }[]
  avisos: { texto: string; tramo: Tramo }[]
  resumen: { personas: number; ausentes: number; tareas: number; avances: number; pedidos: number; dudas: number; texto: string }
  marcas: Marca[]
}

export interface Dictado {
  id: string
  obra_id: string
  fecha: string
  estado: EstadoDictado
  motivo: string | null
  duracion_s: number
  transcripcion: string | null
  propuesta: Propuesta | null
  creado_en: string
  cerrado_en: string | null
  resultado: ResultadoGuardado | null
}

// ── LA REVISIÓN ─────────────────────────────────────────────────────────────────────────────────

type Revisable<T> = T & { clave: string; incluida: boolean; confirmada: boolean }
export interface Revision {
  personas: Revisable<FilaPersona>[]
  avances: Revisable<FilaAvance>[]
  materiales: Revisable<FilaMaterial>[]
  urgencia: FilaMaterial['urgencia']
  novedad: string
}

export function revisionInicial(p: Propuesta): Revision {
  const rev = <T,>(xs: T[], pre: string) => xs.map((x, i) => ({ ...x, clave: `${pre}${i}`, incluida: true, confirmada: false }))
  return {
    personas: rev(p.personas, 'p'),
    avances: rev(p.avances, 'a'),
    materiales: rev(p.materiales, 'm'),
    urgencia: p.materiales[0]?.urgencia ?? 'semana',
    novedad: p.novedades.map((n) => n.texto).join('\n'),
  }
}

/** Una fila naranja que sigue incluida y nadie confirmó. Una persona sin elegir entre homónimos cuenta. */
export function faltaConfirmar(f: { incluida: boolean; dudoso: boolean; confirmada: boolean; persona_id?: string | null }): boolean {
  if (!f.incluida) return false
  if ('persona_id' in f && f.persona_id == null) return true
  return f.dudoso && !f.confirmada
}

export function pendientesDeConfirmar(r: Revision): number {
  return [...r.personas, ...r.avances, ...r.materiales].filter(faltaConfirmar).length
}

/** El aviso de arriba de la revisión (PC): «1 dato para confirmar: ¿Quiroz faltó todo el día?». */
export function avisoDeConfirmar(r: Revision): string | null {
  const n = pendientesDeConfirmar(r)
  if (n === 0) return null
  const primera = r.personas.find(faltaConfirmar)
  const que = primera
    ? primera.persona_id == null ? `¿cuál ${primera.nombre}?` : primera.estado === 'ausente' ? `¿${primera.nombre} faltó todo el día?` : `${primera.nombre}: ${primera.motivo ?? 'confirmalo'}`
    : (r.avances.find(faltaConfirmar)?.motivo ?? r.materiales.find(faltaConfirmar)?.motivo ?? 'confirmalo')
  return `${n} ${n === 1 ? 'dato' : 'datos'} para confirmar: ${que}`
}

// ── CÓMO SE MUESTRA ─────────────────────────────────────────────────────────────────────────────

export type RenglonGente =
  | { tipo: 'persona'; fila: Revisable<FilaPersona> }
  | { tipo: 'grupo'; claves: string[]; n: number; tarea: string | null; horas: number | null; dudoso: boolean; incluida: boolean; filas: Revisable<FilaPersona>[] }

/** «4 más · hormigonado · 32 h»: las filas que vinieron de «el resto» se muestran juntas si comparten tarea y horas. */
export function renglonesDeGente(personas: Revisable<FilaPersona>[]): RenglonGente[] {
  const out: RenglonGente[] = []
  const grupos = new Map<string, Revisable<FilaPersona>[]>()
  for (const f of personas) {
    if (f.origen !== 'grupo') { out.push({ tipo: 'persona', fila: f }); continue }
    const k = `${f.tarea_id ?? ''}|${f.horas ?? ''}|${f.dudoso}`
    if (!grupos.has(k)) { grupos.set(k, []); out.push({ tipo: 'grupo', claves: [], n: 0, tarea: f.tarea_nombre, horas: null, dudoso: f.dudoso, incluida: true, filas: [] }) }
    grupos.get(k)!.push(f)
  }
  let g = 0
  const listas = [...grupos.values()]
  return out.map((r) => {
    if (r.tipo !== 'grupo') return r
    const filas = listas[g++]
    return {
      ...r, filas, claves: filas.map((f) => f.clave), n: filas.filter((f) => f.incluida).length,
      horas: filas.filter((f) => f.incluida).reduce((s, f) => s + (f.horas ?? 0), 0),
      incluida: filas.some((f) => f.incluida),
    }
  })
}

/** Lo que dijo, en tramos: texto suelto, dato (amarillo) o duda (naranja). */
export function tramosDelTexto(texto: string, marcas: Marca[]): { texto: string; tipo: Marca['tipo'] | null }[] {
  const out: { texto: string; tipo: Marca['tipo'] | null }[] = []
  let i = 0
  for (const m of [...marcas].sort((a, b) => a.desde - b.desde)) {
    if (m.desde < i || m.hasta > texto.length) continue
    if (m.desde > i) out.push({ texto: texto.slice(i, m.desde), tipo: null })
    out.push({ texto: texto.slice(m.desde, m.hasta), tipo: m.tipo })
    i = m.hasta
  }
  if (i < texto.length) out.push({ texto: texto.slice(i), tipo: null })
  return out
}

/** «Encofrado de losa 16 h · Hormigonado 32 h». Sólo presentes incluidos con tarea. */
export function horasPorTarea(personas: Pick<FilaPersona, 'estado' | 'horas' | 'tarea_id' | 'tarea_nombre' | 'persona_id'>[]): { tarea_id: string; tarea: string; horas: number; personas: number }[] {
  const m = new Map<string, { tarea_id: string; tarea: string; horas: number; personas: number }>()
  for (const f of personas) {
    if (f.estado !== 'presente' || !f.tarea_id || f.horas == null) continue
    const x = m.get(f.tarea_id) ?? { tarea_id: f.tarea_id, tarea: f.tarea_nombre ?? '', horas: 0, personas: 0 }
    x.horas += f.horas; x.personas++
    m.set(f.tarea_id, x)
  }
  return [...m.values()]
}

/** «0:52». */
export function reloj(segundos: number): string {
  const s = Math.max(0, Math.round(segundos))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Un número para el campo del parte, con coma: `leerNumeroEsAR` lee «20.5» como veinte mil quinientos. */
export const numeroParaElParte = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',')

// ── LO QUE VIAJA AL GUARDAR ─────────────────────────────────────────────────────────────────────

export interface Envio {
  fecha: string
  personas: { persona_id: string; estado: 'presente' | 'ausente'; horas: number | null; tarea_id: string | null }[]
  avances: { tarea_id: string; produccion: number }[]
  materiales: { material: string; cantidad: number; unidad: string }[]
  urgencia: FilaMaterial['urgencia']
  novedad: string
}

export function armarEnvio(r: Revision, fecha: string): { ok: true; envio: Envio } | { ok: false; error: string } {
  const pend = pendientesDeConfirmar(r)
  if (pend > 0) return { ok: false, error: `Falta confirmar ${pend} ${pend === 1 ? 'dato' : 'datos'} (en naranja): confirmalo, corregilo o sacalo.` }
  const personas: Envio['personas'] = []
  const vistos = new Set<string>()
  for (const f of r.personas) {
    if (!f.incluida || !f.persona_id) continue
    if (vistos.has(f.persona_id)) return { ok: false, error: `${f.nombre} está dos veces.` }
    vistos.add(f.persona_id)
    if (f.estado === 'presente' && !(f.horas != null && f.horas > 0 && f.horas <= 24)) {
      return { ok: false, error: `${f.nombre}: las horas van de 0 a 24.` }
    }
    personas.push({ persona_id: f.persona_id, estado: f.estado, horas: f.estado === 'presente' ? f.horas : null, tarea_id: f.estado === 'presente' ? f.tarea_id : null })
  }
  const avances: Envio['avances'] = []
  for (const a of r.avances) {
    if (!a.incluida) continue
    if (a.produccion == null || !(a.produccion > 0)) return { ok: false, error: `${a.tarea_nombre}: poné el avance de hoy o sacalo.` }
    avances.push({ tarea_id: a.tarea_id, produccion: a.produccion })
  }
  const materiales: Envio['materiales'] = []
  for (const m of r.materiales) {
    if (!m.incluida) continue
    if (!m.material.trim() || !(m.cantidad > 0)) return { ok: false, error: 'Cada material lleva qué es y una cantidad mayor que cero.' }
    materiales.push({ material: m.material.trim(), cantidad: m.cantidad, unidad: m.unidad })
  }
  const novedad = r.novedad.trim()
  if (!personas.length && !avances.length && !materiales.length && !novedad) {
    return { ok: false, error: 'No queda nada para guardar: dictá de nuevo o cargalo a mano.' }
  }
  return { ok: true, envio: { fecha, personas, avances, materiales, urgencia: r.urgencia, novedad } }
}

/**
 * EL COMENTARIO DEL RENGLÓN DE AVANCE: quiénes y cuántas horas en esa tarea. Las horas NO se imputan
 * a la tarea en `registros_hh`: la asistencia ya las registra como jornada (sin tarea, a propósito,
 * ver `jornadaPorObraActions.ts`), y una segunda fila con tarea las contaría dos veces en el costo de
 * mano de obra y en la liquidación. La tarea queda escrita acá y en `parte_dictado.resultado`.
 */
export function comentarioDeTarea(tareaId: string, personas: Envio['personas'], nombres: Map<string, string>): string | null {
  const suyas = personas.filter((p) => p.estado === 'presente' && p.tarea_id === tareaId)
  if (!suyas.length) return null
  const horas = suyas.reduce((s, p) => s + (p.horas ?? 0), 0)
  const quienes = suyas.map((p) => nombres.get(p.persona_id) ?? '').filter(Boolean)
  const lista = quienes.length > 3 ? `${quienes.slice(0, 3).join(', ')} y ${quienes.length - 3} más` : quienes.join(', ')
  return `Dictado: ${lista} · ${numeroParaElParte(horas)} h`.slice(0, 500)
}

export interface ResultadoGuardado {
  /** Cada puerta, con su acuse o su error. `null` = no había nada para esa puerta. */
  asistencia: { ok: boolean; mensaje: string } | null
  parte: { ok: boolean; mensaje: string } | null
  material: { ok: boolean; mensaje: string } | null
  horasPorTarea: { tarea: string; horas: number; personas: number }[]
  presentes: number
  ausentes: number
  pedido: string | null
}

/** «Parte guardado a las 18:12. El pedido de 20 bolsas de cemento pasó a Material.» */
export function textoGuardado(r: ResultadoGuardado, hora: string): string {
  const fallas = [r.asistencia, r.parte, r.material].filter((x) => x && !x.ok).length
  const base = fallas ? `Parte guardado a las ${hora}, con ${fallas} ${fallas === 1 ? 'parte que NO entró' : 'partes que NO entraron'}.` : `Parte guardado a las ${hora}.`
  return r.pedido && r.material?.ok ? `${base} El pedido de ${r.pedido} pasó a Material.` : base
}

/** El aviso de arriba, vivo: cambia a medida que se confirma o se quita. */
export function resumenDeRevision(r: Revision): string {
  const personas = r.personas.filter((f) => f.incluida && f.estado === 'presente').length
  const tareas = new Set(r.personas.filter((f) => f.incluida && f.estado === 'presente' && f.tarea_id).map((f) => f.tarea_id)).size
  const avances = r.avances.filter((a) => a.incluida).length
  const pedidos = r.materiales.filter((m) => m.incluida).length
  const dudas = pendientesDeConfirmar(r)
  const n = (k: number, s: string, p: string) => `${k} ${k === 1 ? s : p}`
  const cola = dudas === 0 ? 'Nada para confirmar.' : dudas === 1 ? 'Hay 1 dato para confirmar.' : `Hay ${dudas} datos para confirmar.`
  return `Entendí ${n(personas, 'persona', 'personas')}, ${n(tareas, 'tarea', 'tareas')}, ${n(avances, 'avance', 'avances')} y ${n(pedidos, 'pedido', 'pedidos')}. ${cola}`
}

/** «Losa · 40 %» / «Mampostería · 15 m2» / «Contrapiso · terminado»: lo que dijo, no el incremento. */
export function textoDeAvance(a: Pick<FilaAvance, 'tipo' | 'valor' | 'unidad' | 'produccion'>): { dicho: string; hoy: string | null } {
  const u = a.unidad || ''
  const dicho = a.tipo === 'terminado' ? 'terminado'
    : a.tipo === 'acumulado_pct' ? `${numeroParaElParte(a.valor)} %`
      : a.tipo === 'incremento_pct' ? `+${numeroParaElParte(a.valor)} %`
        : `${numeroParaElParte(a.valor)} ${u}`.trim()
  const hoy = a.produccion == null ? null : `+${numeroParaElParte(a.produccion)} ${u}`.trim() + ' hoy'
  return { dicho, hoy }
}
