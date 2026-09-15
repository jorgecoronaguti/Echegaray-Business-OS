// ¿ESTE CUADRO DE LA QUINCENA ESTÁ CERRADO? — también cuando no tiene cabecera propia.
//
// `liquidacion_quincena` tiene una cabecera por grupo, y un grupo sin líneas al cerrar no la tiene.
// Hasta el 15/09/2026 eso no pasaba en Oficina: estaba vacía en agosto. Desde que los jefes de obra
// aparecen en todas las quincenas (f1051b3a), Oficina tiene filas en 16–31/08, que se cerró sin su
// cabecera, y `estados[grupo] ?? 'abierta'` la dibujaba abierta y editable dentro de una quincena
// pagada.
//
// LA REGLA: la cabecera propia manda; sin ella, el cuadro hereda la quincena. Si algún grupo del
// período está cerrado, la quincena se pagó y ninguna fila suya se reescribe por el cuadro que no
// llegó a tener cabecera. Es la misma lectura que la guarda de Horas (`quincenaCerrada.ts`: basta
// una fila cerrada) y que el encabezado de la solapa Cierre.
//
// No se escribe en `leerGuardadas`: las ventanas de reapertura salen de las cabeceras REALES, y una
// heredada no tiene fila que reabrir.

export interface EstadoDeCuadro {
  id: string | null
  estado: 'abierta' | 'cerrada'
  cerradaEn: string | null
}

export function estadoDelCuadro(
  estados: Readonly<Record<string, EstadoDeCuadro>>, grupo: string,
): EstadoDeCuadro {
  const propio = estados[grupo]
  if (propio) return propio
  const cerrado = Object.values(estados).find((e) => e.estado === 'cerrada')
  return cerrado
    ? { id: null, estado: 'cerrada', cerradaEn: cerrado.cerradaEn }
    : { id: null, estado: 'abierta', cerradaEn: null }
}
