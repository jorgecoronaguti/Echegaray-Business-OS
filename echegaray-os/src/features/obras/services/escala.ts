// LA ESCALA HORIZONTAL DEL GANTT: dónde cae cada fecha y qué divisiones se dibujan arriba.
//
// Vive acá y no dentro del componente por la misma razón que `cronograma.ts`: es aritmética pura,
// se puede probar sin navegador, y es donde está la decisión que se equivoca en silencio — la
// posición de una barra. Se mudó de `Gantt.tsx` cuando ese archivo pasó el tope de 500 líneas.
//
// LA ESCALA SE ACUMULA POR CELDA; NUNCA `left = (fecha − inicio) × pxPorDía` sobre meses, porque los
// meses tienen entre 28 y 31 días y las cabeceras se irían corriendo respecto de las barras.

const DIA = 86400000

export type Escala = 'semana' | 'mes'
// ═══ EL PISO DE LA ESCALA ES UN PISO, NO UN OBJETIVO (20/08/2026) ═══
//
// «semana» estaba en 13 px por día: una obra de dos meses medía 1.040 px de lienzo, y con el panel
// de actividad abierto el calendario tiene ~600. Resultado: se abría el Gantt y no se veía una sola
// barra hasta arrastrar. Con 9 el mismo plan entra casi entero y el estiramiento de `construirEscala`
// se encarga del resto cuando sobra lugar — que es el caso normal con el panel cerrado.
export const PX_POR_DIA: Record<Escala, number> = { semana: 9, mes: 4 }

const aDate = (iso: string) => new Date(iso + 'T00:00:00Z')
const isoDe = (d: Date) => d.toISOString().slice(0, 10)

/**
 * EL AIRE DEL FINAL. La última etiqueta de mes se dibuja EN su línea y el texto sale hacia la
 * derecha: sin este margen, un lienzo que termina justo en el 1° de septiembre corta la palabra a la
 * mitad —"Se"— y parece que la pantalla se rompió. Medido en producción el 19/08/2026.
 */
export const COLA_PX = 56

/**
 * ═══ EL LIENZO NO PUEDE SER MÁS ANGOSTO QUE EL LUGAR QUE TIENE (19/08/2026) ═══
 *
 * El dueño, con captura: *"hay un error en la vista gantt se corta y no corre a la derecha para ver
 * todo el cronograma"*. No se cortaba por falta de scroll —el contenedor ya desplaza— sino al revés:
 * en escala "mes" son 4 px por día, y con la cartera entera cayendo en unos dos meses el lienzo
 * medía ~260 px dentro de un área de ~715 px. Las siete barras apretadas contra el borde izquierdo y
 * medio panel en blanco a la derecha se leen como una pantalla rota, y la última etiqueta encima
 * quedaba cortada.
 *
 * `pxMinimoTotal` es el ancho disponible: si la ventana no llega a llenarlo, los píxeles por día se
 * ESTIRAN hasta que lo llene. La escala sigue siendo uniforme —todos los días miden lo mismo— así
 * que las cabeceras siguen cayendo sobre sus barras; lo único que cambia es el zoom. Y nunca se
 * achica por debajo de la escala elegida: si la cartera es larga, manda `PX_POR_DIA` y el lienzo
 * desborda, que es cuando el desplazamiento tiene sentido.
 */
export function construirEscala(desde: Date, hasta: Date, escala: Escala, pxMinimoTotal = 0) {
  const dias = Math.max(1, Math.ceil((hasta.getTime() - desde.getTime()) / DIA))
  const disponible = Math.max(0, pxMinimoTotal - COLA_PX)
  const px = Math.max(PX_POR_DIA[escala], disponible / dias)
  const ancho = dias * px + COLA_PX
  const x = (iso: string) => ((aDate(iso).getTime() - desde.getTime()) / DIA) * px

  const meses: { label: string; x0: number }[] = []
  const ticks: { label: string; x: number }[] = []
  const cur = new Date(desde)
  cur.setUTCDate(1)
  while (cur < hasta) {
    const x0 = ((cur.getTime() - desde.getTime()) / DIA) * px
    if (x0 > -px) {
      meses.push({ label: cur.toLocaleDateString('es-AR', { month: 'short', year: '2-digit', timeZone: 'UTC' }), x0: Math.max(0, x0) })
    }
    cur.setUTCMonth(cur.getUTCMonth() + 1)
  }
  if (escala === 'semana') {
    const d = new Date(desde)
    d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7)) // primer lunes
    while (d < hasta) {
      ticks.push({ label: String(d.getUTCDate()).padStart(2, '0'), x: x(isoDe(d)) })
      d.setUTCDate(d.getUTCDate() + 7)
    }
  }
  return { px, ancho, x, meses, ticks }
}
