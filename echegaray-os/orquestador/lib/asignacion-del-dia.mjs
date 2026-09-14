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
//   1. la de MENOR DURACIÓN (hasta − desde + 1 días; abierta = infinita);
//   2. empatadas, la de `desde` MÁS RECIENTE (la última decisión tomada);
//   3. empatadas en las dos, NO SE DECIDE: devuelve null y cada cara conserva su salida.

const DIA_MS = 86_400_000
const iso = (x) => (x ? String(x).slice(0, 10) : null)

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
    .map((t) => ({ obra: t.obra, desde: iso(t.desde), hasta: iso(t.hasta) }))
    .filter((t) => t.obra != null && (!t.desde || t.desde <= fecha) && (!t.hasta || fecha <= t.hasta))
  if (cubren.length === 0) return null
  const conClave = cubren.map((t) => ({ ...t, dias: duracion(t.desde, t.hasta), inicio: t.desde ?? '' }))
  const minDias = Math.min(...conClave.map((t) => t.dias))
  const cortas = conClave.filter((t) => t.dias === minDias)
  const ultimoInicio = cortas.reduce((max, t) => (t.inicio > max ? t.inicio : max), '')
  const obras = new Set(cortas.filter((t) => t.inicio === ultimoInicio).map((t) => t.obra))
  return obras.size === 1 ? [...obras][0] : null
}
