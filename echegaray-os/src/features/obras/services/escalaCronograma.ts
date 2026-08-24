// LA ESCALA DEL CRONOGRAMA DE OBRA — un día mide una cantidad fija de píxeles, y el lienzo mide lo
// que la obra dura.
//
// ═══ POR QUÉ ESTO DEJÓ DE SER DOCE COLUMNAS PORCENTUALES ═══
//
// Hasta acá la escala repartía SIEMPRE doce columnas iguales sobre la ventana, cualquiera fuera su
// largo. Eso hace que el ancho de un día dependa de cuánto dura la obra: en una de tres semanas un
// día medía 45px y en una de dos años medía 1,3px, y las dos pantallas se veían igual de llenas.
// Un Gantt en el que el ancho no significa tiempo no es un Gantt: es un gráfico decorativo. Dos
// actividades de cinco días en dos obras distintas tienen que medir lo mismo en pantalla, y el
// mockup `07 · Obra Cronograma.dc.html` lo dibuja así — `DAYW = 26`, lienzo largo, scroll propio.
//
// La consecuencia buscada: el lienzo se sale de la pantalla y se desplaza. Eso es correcto. Meter
// un año de obra en 900px es lo que hacía que una barra de una semana midiera 17px.
//
// ═══ POR QUÉ SIGUE HABIENDO PORCENTAJES ═══
//
// El lienzo tiene ANCHO FIJO conocido (`anchoPx`). Sobre un ancho fijo, `left: 41,6 %` y
// `left: 260px` son EL MISMO punto: el porcentaje dejó de ser una aproximación al contenedor y pasó
// a ser una forma de escribir el píxel. Por eso `tramoDe`, las bandas de período y los conectores
// —que ya están probados en porcentaje— no se tocaron: cambiarlos a píxeles habría reescrito tres
// archivos y sus tests para dibujar exactamente lo mismo.
//
// ═══ POR QUÉ NO ES `services/escala.ts`, QUE YA EXISTE ═══
//
// Esa escala posiciona las barras del Gantt de cartera y las del Gantt legacy (`TabCronograma` la
// consume por `services/escala`). Son otras tres pantallas. Cambiar la aritmética que las dibuja
// para que entre una cuarta es cómo se corren las barras de las otras tres sin que ningún test lo
// note.

const DIA = 86400000

export type UnidadEscala = 'dia' | 'semana' | 'mes'
export const UNIDADES: UnidadEscala[] = ['dia', 'semana', 'mes']
export const UNIDAD_LABEL: Record<UnidadEscala, string> = { dia: 'Día', semana: 'Semana', mes: 'Mes' }

/**
 * EL ANCHO DE UN DÍA EN LA ESCALA DE DÍA — 26px, leído de los estilos inline del mockup.
 *
 * Es el único de los tres que está MEDIDO. Los otros dos salen de aplicarle una regla: la celda
 * ROTULADA mide siempre 26px, así que en escala de semana la celda es la semana (26/7 por día) y en
 * escala de mes es el mes (26/30 por día, aproximado porque los meses no miden lo mismo). Sin esa
 * regla el zoom no serviría de nada: si los tres zooms dibujaran 26px por día, cambiar de zoom sólo
 * cambiaría los rótulos de la cabecera y el lienzo seguiría midiendo lo mismo.
 *
 * `semana` y `mes` NO están medidos contra un mockup — el zip trae la escala de día. Quedan
 * declarados acá y no escondidos adentro de un componente.
 */
export const DAYW = 26
export const ANCHO_DIA: Record<UnidadEscala, number> = { dia: DAYW, semana: DAYW / 7, mes: DAYW / 30 }

export interface Columna {
  /** El día que rotula esta columna. Es el dato; la posición es su consecuencia. */
  iso: string
  etiqueta: string
  /** Píxeles desde el borde izquierdo del lienzo. */
  x: number
  /** El MISMO punto en % del lienzo. Sobre un lienzo de ancho fijo son el mismo lugar; lo consumen
   *  los conectores y las bandas, que ya trabajan en porcentaje. */
  posPct: number
  /** Si esta columna EMPIEZA una unidad de la escala elegida. Sólo esas llevan rótulo y guía: en
   *  escala de semana hay siete columnas por rótulo, y siete veces «S28» no informan nada. */
  nueva: boolean
}

export interface EscalaCronograma {
  unidad: UnidadEscala
  desde: string
  hasta: string
  /** Días de la ventana contando las dos puntas. El denominador de TODO. */
  celdas: number
  /** Cuántos píxeles mide un día en esta escala. Convierte un gesto del puntero en días SIN medir
   *  el DOM: el lienzo se desplaza, así que su `clientWidth` es el de la ventanita visible y no el
   *  del calendario — con esa medida un arrastre de un día se leía como cuatro. */
  pxPorDia: number
  /** El ancho del lienzo, en píxeles. Es lo que la obra dura, no lo que la pantalla mide. */
  anchoPx: number
  columnas: Columna[]
  /** Dónde cae hoy, en píxeles y en % del ancho. `null` cuando hoy queda fuera de la ventana del
   *  plan: dibujar la línea pegada al borde diría que la obra empieza o termina hoy, y no es
   *  cierto. */
  hoyX: number | null
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

/**
 * El rótulo de una columna según el zoom.
 *
 * En escala de DÍA es el número del día pelado —`18`, no `18/8`— porque el mes ya está escrito en la
 * banda de arriba y `18/8` no entra en 26px sin pisar al vecino. Repetir el mes en cada una de las
 * treinta columnas de agosto es gastar la mitad de la cabecera en decir treinta veces «agosto».
 */
export function etiquetaDe(iso: string, unidad: UnidadEscala): string {
  const d = aDate(iso)
  if (unidad === 'mes') return MES_CORTO(iso)
  if (unidad === 'semana') return `S${semanaIso(d)}`
  return String(d.getUTCDate())
}

/** Número de semana ISO-8601. La semana 1 es la que contiene el primer jueves del año. */
export function semanaIso(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const inicio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - inicio.getTime()) / DIA + 1) / 7)
}

/**
 * Si este día ABRE una unidad de la escala: el lunes en semana, el día 1 en mes, siempre en día.
 *
 * Se decide por el CALENDARIO y no comparando el rótulo con el anterior. Comparar rótulos parecía
 * equivalente y no lo es: dos meses distintos pueden rotular igual —`ENE` de 2026 y `ENE` de 2027 en
 * una obra de dos años— y la segunda columna se quedaba sin guía y sin rótulo, con enero de 2027
 * dibujado como si fuera la continuación de enero de 2026.
 */
export function abreUnidad(iso: string, unidad: UnidadEscala): boolean {
  if (unidad === 'dia') return true
  const d = aDate(iso)
  if (unidad === 'mes') return d.getUTCDate() === 1
  return (d.getUTCDay() || 7) === 1
}

/** Dónde cae un día en el lienzo, en píxeles desde el borde izquierdo. Fuera de la ventana devuelve
 *  `null`: no existe un píxel para un día que el lienzo no dibuja, y devolver 0 o `anchoPx` lo
 *  pegaría al borde como si empezara o terminara ahí. */
export function xDe(
  escala: { desde: string; hasta: string; pxPorDia: number }, iso: string,
): number | null {
  const d = diasEntre(escala.desde, iso)
  if (d < 0 || d >= celdasDe(escala.desde, escala.hasta)) return null
  return d * escala.pxPorDia
}

/**
 * La escala: una columna POR DÍA, con el rótulo y la guía sólo en las que abren unidad.
 *
 * El zoom NO recorta la ventana —el cronograma entero se ve siempre, desplazándose— sino que cambia
 * cuántos píxeles mide un día y con qué unidad se leen las divisiones. Recortar sería esconder
 * trabajo que existe detrás de un control de vista, y en una obra eso se llama olvidarse de un
 * frente.
 */
export function construirEscalaCronograma(
  ventana: { desde: string; hasta: string }, unidad: UnidadEscala, hoy: string,
): EscalaCronograma {
  const celdas = celdasDe(ventana.desde, ventana.hasta)
  const pxPorDia = ANCHO_DIA[unidad]
  const anchoPx = celdas * pxPorDia
  const columnas: Columna[] = []
  for (let i = 0; i < celdas; i++) {
    const iso = sumar(ventana.desde, i)
    columnas.push({
      iso,
      etiqueta: etiquetaDe(iso, unidad),
      x: i * pxPorDia,
      posPct: (i / celdas) * 100,
      // La primera columna SIEMPRE abre: una obra que arranca un miércoles en escala de semana no
      // tendría ninguna guía hasta el lunes siguiente, y el lienzo abriría sin cabecera.
      nueva: i === 0 || abreUnidad(iso, unidad),
    })
  }
  const dHoy = diasEntre(ventana.desde, hoy)
  const dentro = dHoy >= 0 && dHoy < celdas
  return {
    unidad,
    desde: ventana.desde,
    hasta: ventana.hasta,
    celdas,
    pxPorDia,
    anchoPx,
    columnas,
    hoyX: dentro ? dHoy * pxPorDia : null,
    hoyPosPct: dentro ? (dHoy / celdas) * 100 : null,
  }
}

export interface Tramo { izqPct: number; anchoPct: number }

/**
 * Dónde arranca y cuánto mide una barra, en % del lienzo — que es decir, en píxeles del lienzo.
 *
 * El ancho mínimo es 0,6 %: en escala de mes una actividad de un día mide 0,27 % y desaparecería.
 * Una barra invisible se lee como «no tiene fechas», que es una cosa distinta.
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
