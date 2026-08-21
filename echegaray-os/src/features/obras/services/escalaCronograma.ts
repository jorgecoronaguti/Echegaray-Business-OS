// LA ESCALA DEL CRONOGRAMA DE OBRA — doce columnas y una posición en porcentaje.
//
// ═══ POR QUÉ NO ES `services/escala.ts`, QUE YA EXISTE ═══
//
// Esa escala resuelve OTRA pregunta: devuelve un lienzo en PÍXELES (`px`, `ancho`, `x(iso)`) para
// un Gantt que se desplaza horizontalmente y tiene dos zooms, semana y mes. La 07 pide otra cosa —
// doce columnas iguales rotuladas, tres zooms (día, semana, mes) y barras posicionadas en
// PORCENTAJE del ancho disponible— y forzar una en la otra habría cambiado el contrato de
// `construirEscala`, que hoy posiciona las barras del Gantt de cartera y las del Gantt legacy.
// Cambiar la aritmética que dibuja tres pantallas para que entre una cuarta es cómo se corren las
// barras de las otras tres sin que ningún test lo note.
//
// Lo que sí se comparte es la disciplina: la aritmética vive en un archivo puro y probado, no
// dentro del componente. La posición de una barra es exactamente el tipo de cuenta que se equivoca
// en silencio.

const DIA = 86400000

export type UnidadEscala = 'dia' | 'semana' | 'mes'
export const UNIDADES: UnidadEscala[] = ['dia', 'semana', 'mes']
export const UNIDAD_LABEL: Record<UnidadEscala, string> = { dia: 'Día', semana: 'Semana', mes: 'Mes' }

/** Doce columnas, como el contrato visual. No es un número mágico caprichoso: es lo que entra
 *  rotulado en 9,5px sin pisarse en el ancho mínimo de 960px que la pantalla declara. */
export const N_COLUMNAS = 12

export interface Columna {
  etiqueta: string
  posPct: number
  /** Si esta columna EMPIEZA una unidad nueva. Doce columnas sobre una obra de cuatro días caen
   *  todas en la misma semana y el encabezado quedaba diciendo «S28» doce veces: doce rótulos
   *  iguales no informan nada y se leen como una pantalla rota. Sólo se dibuja la primera. */
  nueva: boolean
}

export interface EscalaCronograma {
  unidad: UnidadEscala
  desde: string
  hasta: string
  columnas: Columna[]
  /** Dónde cae hoy, en % del ancho. `null` cuando hoy queda fuera de la ventana del plan: dibujar
   *  la línea pegada al borde diría que la obra empieza o termina hoy, y no es cierto. */
  hoyPosPct: number | null
}

const aDate = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00Z')
const isoDe = (d: Date) => d.toISOString().slice(0, 10)
export const sumar = (iso: string, n: number) => isoDe(new Date(aDate(iso).getTime() + n * DIA))

/** Días corridos entre dos ISO. El ANCHO del gantt es calendario, no días hábiles: un sábado
 *  ocupa lugar en la pantalla aunque no se trabaje. Los días hábiles ya los resolvió el motor. */
export const diasEntre = (desde: string, hasta: string) =>
  Math.round((aDate(hasta).getTime() - aDate(desde).getTime()) / DIA)

/**
 * CUÁNTAS CELDAS DE UN DÍA TIENE LA VENTANA — contando las dos puntas.
 *
 * Es el denominador de TODO lo que se posiciona, y tiene que ser el mismo en las tres cuentas
 * (columna, barra, línea de hoy). Con `diasEntre` a secas, la actividad que termina el último día
 * de la ventana caía en `left: 100 %` y se dibujaba fuera del lienzo: la fila quedaba en blanco y
 * se leía «sin fechas», que es lo contrario de lo que pasaba. Medido el 21/08/2026 sobre Messina,
 * con «Desencofrado de losa» invisible en el borde derecho.
 */
export const celdasDe = (desde: string, hasta: string) => Math.max(1, diasEntre(desde, hasta) + 1)

/** La ventana que abarca todas las barras. Devuelve null si ninguna fila tiene fechas — y ahí no
 *  hay gantt que dibujar, hay una deuda de carga que nombrar. */
export function ventanaDe(
  filas: { inicio: string | null; fin: string | null }[],
): { desde: string; hasta: string } | null {
  const inicios = filas.map((f) => f.inicio).filter((x): x is string => Boolean(x))
  const fines = filas.map((f) => f.fin ?? null).filter((x): x is string => Boolean(x))
  if (!inicios.length) return null
  const desde = inicios.slice().sort()[0]
  const hasta = (fines.length ? fines.slice().sort().at(-1)! : desde)
  return { desde, hasta: hasta < desde ? desde : hasta }
}

const MES_CORTO = (iso: string) =>
  aDate(iso).toLocaleDateString('es-AR', { month: 'short', timeZone: 'UTC' }).replace('.', '').toUpperCase()

/** El rótulo de una columna según el zoom. `DD/M` para día, `S<semana ISO>` para semana, `MMM`
 *  para mes — los tres del contrato visual, en es-AR. */
export function etiquetaDe(iso: string, unidad: UnidadEscala): string {
  const d = aDate(iso)
  if (unidad === 'mes') return MES_CORTO(iso)
  if (unidad === 'semana') return `S${semanaIso(d)}`
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`
}

/** Número de semana ISO-8601. La semana 1 es la que contiene el primer jueves del año. */
export function semanaIso(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const inicio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - inicio.getTime()) / DIA + 1) / 7)
}

/**
 * La escala: doce columnas repartidas por igual sobre la ventana, con el rótulo del zoom elegido.
 *
 * El zoom NO recorta la ventana —el cronograma entero se ve siempre— sino que cambia con qué
 * unidad se leen las divisiones. Recortar sería esconder trabajo que existe detrás de un control
 * de vista, y en una obra eso se llama olvidarse de un frente.
 */
export function construirEscalaCronograma(
  ventana: { desde: string; hasta: string }, unidad: UnidadEscala, hoy: string,
): EscalaCronograma {
  const celdas = celdasDe(ventana.desde, ventana.hasta)
  const columnas: Columna[] = []
  let anterior: string | null = null
  for (let i = 0; i < N_COLUMNAS; i++) {
    const dia = Math.min(celdas - 1, Math.floor((celdas * i) / N_COLUMNAS))
    const etiqueta = etiquetaDe(sumar(ventana.desde, dia), unidad)
    columnas.push({ etiqueta, posPct: (i / N_COLUMNAS) * 100, nueva: etiqueta !== anterior })
    anterior = etiqueta
  }
  const dHoy = diasEntre(ventana.desde, hoy)
  const dentro = dHoy >= 0 && dHoy < celdas
  return {
    unidad,
    desde: ventana.desde,
    hasta: ventana.hasta,
    columnas,
    hoyPosPct: dentro ? (dHoy / celdas) * 100 : null,
  }
}

export interface Tramo { izqPct: number; anchoPct: number }

/**
 * Dónde arranca y cuánto mide una barra, en % del lienzo.
 *
 * El ancho mínimo es 0,6 %: una actividad de un día en una obra de un año mide 0,27 % y
 * desaparecería. Una barra invisible se lee como «no tiene fechas», que es una cosa distinta.
 */
export function tramoDe(
  escala: { desde: string; hasta: string }, inicio: string | null, fin: string | null,
): Tramo | null {
  if (!inicio) return null
  const celdas = celdasDe(escala.desde, escala.hasta)
  const i = diasEntre(escala.desde, inicio)
  const f = diasEntre(escala.desde, fin ?? inicio)
  const izqPct = Math.max(0, Math.min(100, (i / celdas) * 100))
  const anchoBruto = ((Math.max(f, i) + 1 - i) / celdas) * 100
  return { izqPct, anchoPct: Math.max(0.6, Math.min(100 - izqPct, anchoBruto)) }
}
