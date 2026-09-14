// QUÉ OBRA DA LA ASIGNACIÓN CUANDO MÁS DE UNA CUBRE EL DÍA.
//
// ═══ POR QUÉ UNA SOLA DEFINICIÓN, EN UN LIB SIN DEPENDENCIAS ═══
//
// La leen dos caras: el importador JORNALES → registros_hh (`jornales-a-registros-hh.mjs`) y la grilla
// de horas de la app (`src/features/administracion/services/obraDelDia.ts`). Si cada una desempatara a
// su manera, la misma hora caería en una obra en la base y en otra en la pantalla. Por eso vive acá, sin
// importar nada, y las dos la importan.
//
// ═══ LA CRONOLOGÍA DEL EMPLEADO (dueño, 14/09/2026) ═══
//
// «sigue contando mal las hh de quattro porque no esta siguiendo la cronologia de cada empleado». Casos
// medidos: Reta tiene Quattropani ABIERTA desde el 08/09 y un día suelto, el 09/09, en Messina; Zogbe
// tiene días sueltos dentro del rango de Galpón 9. Antes, dos obras el mismo día no decidían y el día
// volvía a la obra del bloque de JORNALES — que no es donde estuvo. Una asignación corta dentro de una
// larga es la excepción que alguien cargó a propósito sobre la regla general: gana la corta.
//
//   0. GANA LA CARGA POSTERIOR (dueño, 14/09/2026): un día suelto que empieza el MISMO día que un tramo
//      más largo de otra obra cargado DESPUÉS (`creado_en`) quedó corregido y no compite. Casos: Reta
//      09/09 → Quattropani, Quiroga A. 09/09 → Messina, Maldonado 08/09 → Quattropani. El día suelto
//      cargado después del tramo largo sigue siendo la excepción a propósito y gana por el criterio 1;
//   1. la de MENOR DURACIÓN (hasta − desde + 1 días; abierta = infinita);
//   2. empatadas, la de `desde` MÁS RECIENTE (la última decisión tomada);
//   3. empatadas en las dos, la de `creado_en` MÁS RECIENTE, sólo si todas lo traen (el mismo criterio
//      del 0: Agüero 08/09 tiene tres días sueltos del mismo día y vale el último que se cargó);
//   4. si no, NO SE DECIDE: devuelve null y cada cara conserva su salida.
//
// Un tramo sin `creado_en` conserva la regla de antes: 0 y 3 no pueden inventar un orden de carga.

// La marca de anulada vive con la regla de escritura, que tampoco importa nada: sigue siendo una
// sola definición y las dos caras la pueden importar.
import { estaAnulada } from './cronologia-asignaciones.mjs'

const DIA_MS = 86_400_000
// UN `Date` NO SE CORTA CON `String()`: da «Wed Sep 09 2026…» y el tramo deja de cubrir cualquier día.
// `pg` devuelve las columnas date como `Date` a las 03:00Z (−03), así que `toISOString` da el día correcto.
const iso = (x) => (x instanceof Date ? x.toISOString().slice(0, 10) : x ? String(x).slice(0, 10) : null)
// `creado_en` se compara como instante ISO completo, y por la misma razón: `String(Date)` ordena por el
// nombre del día de la semana.
function instante(x) {
  if (x instanceof Date) return x.toISOString()
  const ms = x ? Date.parse(String(x)) : NaN
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

/** Criterio 0: día suelto corregido por un tramo más largo de otra obra, mismo inicio, cargado después. */
const corregidoPorCargaPosterior = (t, todos) => t.dias === 1 && Boolean(t.creado)
  && todos.some((u) => u.obra !== t.obra && u.inicio === t.inicio && u.dias > 1 && u.creado && u.creado > t.creado)

/** Criterio 3: entre finalistas empatados, la última carga — sólo si todos la traen. */
function ultimaCargada(finalistas) {
  if (finalistas.some((t) => !t.creado)) return null
  const max = finalistas.reduce((m, t) => (t.creado > m ? t.creado : m), '')
  const obras = new Set(finalistas.filter((t) => t.creado === max).map((t) => t.obra))
  return obras.size === 1 ? [...obras][0] : null
}

/** Días que dura el tramo, inclusive. Sin `desde` o sin `hasta` no tiene fin conocido: infinito. */
function duracion(desde, hasta) {
  if (!desde || !hasta) return Infinity
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS) + 1
}

/**
 * La obra de ese día según los tramos que lo cubren, o null si ninguno lo cubre o el empate es total.
 * Cada tramo: `{ obra, desde, hasta }` con fechas ISO (o Date/timestamp: se toma YYYY-MM-DD).
 * `desde` nulo vale como abierto hacia atrás; `hasta` nulo, abierto hacia adelante.
 */
export function obraDeLaAsignacionDelDia(tramos = [], fecha) {
  const cubren = tramos
    // UNA ANULADA (marca en `notas`) NO CUBRE NINGÚN DÍA: la corrigió una carga posterior.
    .filter((t) => !estaAnulada(t))
    .map((t) => ({ obra: t.obra, desde: iso(t.desde), hasta: iso(t.hasta), creado: instante(t.creado_en) }))
    .filter((t) => t.obra != null && (!t.desde || t.desde <= fecha) && (!t.hasta || fecha <= t.hasta))
  if (cubren.length === 0) return null
  const conClave = cubren.map((t) => ({ ...t, dias: duracion(t.desde, t.hasta), inicio: t.desde ?? '' }))
  const vivos = conClave.filter((t) => !corregidoPorCargaPosterior(t, conClave))
  const minDias = Math.min(...vivos.map((t) => t.dias))
  const cortas = vivos.filter((t) => t.dias === minDias)
  const ultimoInicio = cortas.reduce((max, t) => (t.inicio > max ? t.inicio : max), '')
  const finalistas = cortas.filter((t) => t.inicio === ultimoInicio)
  const obras = new Set(finalistas.map((t) => t.obra))
  return obras.size === 1 ? [...obras][0] : ultimaCargada(finalistas)
}
