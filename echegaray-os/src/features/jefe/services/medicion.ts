// EL MÉTODO DE LA ACTIVIDAD MANDA — y en el teléfono manda más, porque no hay lugar para explicar.
//
// La base ya hace cumplir tres reglas y ninguna se reimplementa acá: se ANTICIPAN, para que el jefe
// no toque una primaria que la base va a rechazar en el servidor y no entienda por qué.
//
//   1. `obra_ejecucion` rechaza un avance cargado contra `tipo='resumen'`.
//   2. CHECK `obra_ejecucion_manual_exige_criterio`: método manual sin criterio escrito no entra.
//   3. `metodo` es una foto del registro, no una referencia: lo que se guardó dice cómo se midió.
//
// ═══ EL PELIGRO NO ES EL RECHAZO: ES EL NO-OP SILENCIOSO ═══
//
// `obra_actividad_control` calcula el avance de una manera DISTINTA por método. Escribir un
// `avance_pct` en una actividad medida por `cantidad` inserta una fila válida —la base la acepta— y
// el porcentaje de la actividad NO SE MUEVE, porque para `cantidad` sale de producción / objetivo.
// Lo mismo con `pasos`: el avance sale del peso de los pasos marcados y una fila de parte se ignora.
//
// Un rechazo se ve. Un no-op silencioso deja al jefe convencido de que cargó el día. Por eso el
// avance masivo por porcentaje sólo se ofrece donde el porcentaje efectivamente mueve el número, y
// donde no, se dice con qué se mide esa actividad en vez de dejar el renglón tocable.

export type Metodo = 'cantidad' | 'pasos' | 'partes' | 'manual'

/** El texto literal del contrato de diseño. Va tal cual: es la regla, no una paráfrasis. */
export const AVISO_CRITERIO =
  'El método manual exige un criterio escrito. Sin eso el porcentaje no se puede interpretar después.'

export const ROTULO_METODO: Record<Metodo, string> = {
  cantidad: 'Cantidad',
  pasos: 'Pasos',
  partes: 'Avance del día',
  manual: 'Manual',
}

/** Con qué control se carga el avance de esta actividad en el teléfono. */
export function controlDe(metodo: Metodo): 'pasos' | 'cantidad' | 'porcentaje' {
  if (metodo === 'pasos') return 'pasos'
  if (metodo === 'cantidad') return 'cantidad'
  return 'porcentaje'
}

/** ¿Un porcentaje escrito a mano mueve el avance de esta actividad? Ver el bloque de arriba. */
export function elPorcentajeMueveElAvance(metodo: Metodo): boolean {
  return metodo === 'partes' || metodo === 'manual'
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL AVANCE MASIVO — J04.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface TareaDelDia {
  actividad_id: string
  nombre: string
  tipo: string
  metodo_avance: Metodo | null
  avance_pct: number | null
  unidad: string | null
  cantidad_objetivo: number | null
  impedimentos_abiertos: number
}

export interface Renglon {
  actividad_id: string
  nombre: string
  metodo: Metodo | null
  avance_pct: number | null
  /** Se puede tocar y aplicarle un porcentaje. */
  aplicable: boolean
  /** Por qué NO, con la unidad real de la actividad. `null` cuando sí se puede. */
  motivo: string | null
  /** Se guarda igual, pero con menos precisión de la que tendría medida de a una. */
  pierdePrecision: boolean
}

/**
 * Qué de la lista puede recibir un porcentaje masivo, y qué no — con el motivo escrito.
 *
 * El renglón que no se puede aplicar NO se esconde: se muestra apagado con su motivo. Esconderlo
 * dejaría al jefe buscando una tarea que él sabe que existe y que la pantalla decidió no mostrarle.
 */
export function renglones(tareas: TareaDelDia[]): Renglon[] {
  return tareas.filter((t) => t.tipo !== 'resumen').map((t) => {
    const metodo = t.metodo_avance
    if (metodo == null) {
      return base(t, false, 'sin método de medición declarado', false)
    }
    if (metodo === 'cantidad') {
      const u = t.unidad ?? 'unidades'
      const objetivo = t.cantidad_objetivo == null ? '' : ` sobre ${formatear(t.cantidad_objetivo)}`
      return base(t, false, `se mide en ${u}${objetivo}: cargala de a una`, false)
    }
    if (metodo === 'pasos') {
      return base(t, false, 'se mide por pasos: marcá los pasos ejecutados', false)
    }
    // LA TERMINADA NO SE PUEDE SUBIR MÁS. Ofrecerla tocable termina en un «no entró» del servidor
    // por cada una, y en esta obra son 60 de 89: el mensaje de resultado se volvía ilegible.
    if ((t.avance_pct ?? 0) >= 100) return base(t, false, 'ya está al 100 %', false)
    // `manual` entra, pero declarado no es lo mismo que medido y se avisa sin bloquear.
    return base(t, true, null, metodo === 'manual')
  })
}

function base(t: TareaDelDia, aplicable: boolean, motivo: string | null, pierdePrecision: boolean): Renglon {
  return {
    actividad_id: t.actividad_id,
    nombre: t.nombre,
    metodo: t.metodo_avance,
    avance_pct: t.avance_pct,
    aplicable,
    motivo,
    pierdePrecision,
  }
}

const formatear = (n: number) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n)

/**
 * El aviso del pie de J04. `null` cuando no hay nada que advertir — un cartel que siempre está
 * deja de decir algo.
 */
export function avisoDePrecision(elegidos: Renglon[]): string | null {
  const n = elegidos.filter((r) => r.pierdePrecision).length
  if (n === 0) return null
  return n === 1
    ? '1 tarea se mide a mano: el dato queda menos preciso, pero se guarda igual.'
    : `${n} tareas se miden a mano: el dato queda menos preciso, pero se guarda igual.`
}

/**
 * El avance que hay que CARGAR para que la actividad llegue al objetivo.
 *
 * `obra_ejecucion` guarda HECHOS de un día y `avance_partes` los SUMA: para que una actividad que
 * va en 40 % quede en 75 % hay que cargar 35, no 75. Cargar el objetivo dejaría la actividad en
 * 115 % — el avance del día no es el avance acumulado, y confundirlos fue lo que obligó a escribir
 * esto como una función con nombre.
 *
 * Devuelve `null` cuando no hay nada que cargar: la actividad ya está en el objetivo o más arriba.
 * Un cero cargado es una fila que dice «hoy no se hizo nada» y eso es otra afirmación.
 */
export function deltaHasta(objetivo: number, actual: number | null): number | null {
  const d = Math.round((objetivo - (actual ?? 0)) * 10) / 10
  return d > 0 ? d : null
}

/** Los cinco valores del pie de J04. Son los del contrato visual, no una escala inventada. */
export const VALORES_MASIVOS = [25, 50, 75, 90, 100] as const

/**
 * LOS CUATRO VALORES QUE OFRECE UNA FILA DE J04 — cambio de regla del 24/08/2026.
 *
 * ═══ QUÉ CAMBIÓ ═══
 *
 * Hasta hoy la pantalla tenía UN valor para toda la selección: se elegían diez tareas y las diez
 * iban al mismo porcentaje. El mockup `J04 · Jefe Avance masivo.dc.html` pone los pasos DENTRO de
 * cada tarjeta (`f.pasos`, cuatro botones por fila) y en el ejemplo guarda `a1` al 80 % y `a2` al
 * 65 % en el mismo envío. Eso no es un detalle visual: es lo que hace que la pantalla sirva para
 * cerrar un día real, donde cada frente llegó hasta donde llegó.
 *
 * ═══ POR QUÉ NO SE OFRECE UN VALOR MENOR AL ACTUAL ═══
 *
 * `obra_ejecucion` guarda INCREMENTOS y `avance_partes` los suma: no existe «bajar» una tarea desde
 * acá. Ofrecer 25 en una que va en 40 produciría un rechazo («ya estaba en 40 % o más») por cada
 * fila tocada. Se ofrecen sólo los que mueven algo, y si ninguno queda —la tarea va arriba de 90—
 * queda el 100, que siempre es un destino válido mientras no esté terminada.
 */
export function opcionesMasivas(avanceActual: number | null): number[] {
  const arriba = VALORES_MASIVOS.filter((v) => v > (avanceActual ?? 0))
  const cuatro = arriba.slice(-4)
  return cuatro.length > 0 ? [...cuatro] : [100]
}

/** Una fila elegida en J04: la tarea y el porcentaje al que la mandó el jefe. */
export interface Elegida { actividad_id: string; objetivo: number }

/**
 * EL CAMPO `tareas` DEL FORMULARIO — `id:80,id:65`.
 *
 * ═══ POR QUÉ UN SOLO CAMPO Y NO UN INPUT POR FILA ═══
 *
 * La selección vive en el estado de React (se toca y se destoca sin recargar) y viaja en UN campo
 * oculto. Con un input por fila habría que crearlos y destruirlos al ritmo del filtro, y una fila
 * filtrada fuera de pantalla que se quedara montada mandaría al servidor una tarea que el jefe no
 * está viendo — que es exactamente la escritura que nadie pidió.
 *
 * ACEPTA EL FORMATO VIEJO (`id,id`) devolviendo `objetivo` en `null`, para que un enlace o una
 * prueba anterior no se rompa en silencio: quien lo reciba decide si cae al valor global.
 */
export function leerSeleccion(texto: string): { actividad_id: string; objetivo: number | null }[] {
  const salida: { actividad_id: string; objetivo: number | null }[] = []
  const vistos = new Set<string>()
  for (const bruto of texto.split(',')) {
    const parte = bruto.trim()
    if (!parte) continue
    const [id, valor] = parte.split(':')
    const limpio = id.trim()
    if (!limpio || vistos.has(limpio)) continue
    vistos.add(limpio)
    const n = valor == null ? NaN : Number(valor)
    salida.push({ actividad_id: limpio, objetivo: Number.isFinite(n) ? n : null })
  }
  return salida
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LAS TRES VISTAS DE J04 — la lógica separada de su dibujo, porque `node --test` no entiende JSX.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type VistaMasiva = 'curso' | 'sin-arrancar' | 'todo'

export const VISTAS_MASIVAS: readonly [VistaMasiva, string][] = [
  ['curso', 'En curso'],
  ['sin-arrancar', 'Sin arrancar'],
  ['todo', 'Todo'],
]

/** En curso es lo que TODAVÍA SE PUEDE MOVER y ya arrancó. Al 100 % no se sube más. */
export const enCurso = (f: Renglon): boolean => f.aplicable && (f.avance_pct ?? 0) > 0

/**
 * ¿Esta fila entra en la vista elegida?
 *
 * «Sin arrancar» incluye el avance en `null`: sin medir y en cero se tocan igual desde acá, y la
 * fila ya dice cuál de las dos es. «Todo» incluye las que NO se pueden aplicar —terminadas, medidas
 * por cantidad o por pasos—: se muestran apagadas con su motivo, nunca escondidas.
 */
export function enVista(f: Renglon, v: VistaMasiva): boolean {
  if (v === 'todo') return true
  if (v === 'curso') return enCurso(f)
  return f.aplicable && (f.avance_pct ?? 0) === 0
}

/**
 * Con qué vista abre la pantalla. «En curso» es lo que se cierra al final del día; en esta obra 60
 * de 89 tareas ya están al 100 % y la lista completa entierra las cinco que el jefe vino a tocar.
 * Si no hay ninguna en curso abre en «Todo»: un filtro que abre la pantalla vacía se lee como «esta
 * obra no tiene tareas».
 */
export function vistaInicial(filas: Renglon[]): VistaMasiva {
  return filas.some(enCurso) ? 'curso' : 'todo'
}
