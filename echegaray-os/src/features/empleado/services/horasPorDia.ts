// M06 · LAS HORAS AGRUPADAS POR DÍA — la lista que dibuja `M06 · Mis horas.dc.html`.
//
// ═══ POR QUÉ AGRUPAR, Y POR QUÉ NO ANTES ═══
//
// `mi_hh_dia` publica UNA FILA POR IMPUTACIÓN: la misma jornada puede tener tres filas si se
// trabajó en tres actividades. El mockup dibuja una fila POR DÍA —«Lunes 18 · Escuela San Juan ·
// 9,0»— porque lo que la persona viene a verificar es el día, no la imputación.
//
// Listar las imputaciones sueltas parecía más fiel al dato y era peor de leer: tres renglones de
// «Lunes 18» con 3,0 · 4,0 · 2,0 obligan a sumar de cabeza para saber si el lunes está bien.
//
// ═══ LO QUE NO SE INVENTA ═══
//
// Un día SIN imputaciones no aparece: no es un día de cero horas, es un día del que la obra no
// cargó nada. La pantalla lo dice con el contador «sin fichar» que sale de la asistencia, que es
// otra fuente y otro hecho.
//
// Y las horas EXTRA viajan aparte del total del día: el mockup las escribe en su propio renglón
// («+1,0 extra») porque no se liquidan igual. Mezclarlas en el total borra la única diferencia que
// importa a fin de quincena.

/** Lo mínimo de una fila de `mi_hh_dia` que este módulo mira. */
export interface ImputacionDeHH {
  fecha: string | null
  obra: string | null
  tipo_hora: string | null
  horas: number
}

export interface DiaDeHH {
  fecha: string
  /** Las obras del día, sin repetir y en el orden en que aparecieron. */
  obras: string[]
  /** El total del día, extras incluidas: es lo que se compara contra la presencia. */
  horas: number
  /** Sólo las de tipo extra. `0` cuando no hubo — acá el cero SÍ es un hecho: se contó y no hay. */
  extra: number
}

const ES_EXTRA = (t: string | null) => (t ?? '').toLowerCase().includes('extra')

/** Los días con horas imputadas, del más reciente al más viejo. */
export function porDia(filas: ImputacionDeHH[]): DiaDeHH[] {
  const indice = new Map<string, DiaDeHH>()
  for (const f of filas) {
    const fecha = f.fecha?.slice(0, 10)
    if (!fecha) continue
    const d = indice.get(fecha) ?? { fecha, obras: [], horas: 0, extra: 0 }
    d.horas = redondear(d.horas + f.horas)
    if (ES_EXTRA(f.tipo_hora)) d.extra = redondear(d.extra + f.horas)
    const obra = f.obra?.trim()
    if (obra && !d.obras.includes(obra)) d.obras.push(obra)
    indice.set(fecha, d)
  }
  return [...indice.values()].sort((a, b) => b.fecha.localeCompare(a.fecha))
}

/** Sumar decimales de PostgREST arrastra `0.30000000000000004`. Se corta en dos decimales, que es
 *  la precisión con la que se liquidan las HH. */
const redondear = (n: number) => Math.round(n * 100) / 100

/** El total de horas extra del período. Va en su propio azulejo, nunca sumado a la jornada normal. */
export function totalExtra(dias: DiaDeHH[]): number {
  return redondear(dias.reduce((s, d) => s + d.extra, 0))
}
