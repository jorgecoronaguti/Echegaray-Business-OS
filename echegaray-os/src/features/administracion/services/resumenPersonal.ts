// EL PIE DE MÉTRICAS DEL LISTADO DE PERSONAL — Design 23/08/2026, pantalla 19 §Status bar.
//
// El canónico cierra la tabla con una franja de números (`PLANTEL · EN OBRA HOY · SIN ASIGNAR ·
// HH DEL MES`) en lugar del párrafo que había abajo de la tabla. Los números se cuentan sobre las
// filas que la pantalla ESTÁ MOSTRANDO: no hay una segunda consulta, así que no puede haber una
// segunda verdad.
//
// ═══ EL RÓTULO ES EL CONTRATO ═══
//
// Y por eso mismo el rótulo no puede ser fijo. Contar 2 filas después de buscar «Juan» y rotularlas
// «PLANTEL 2» dice que la empresa tiene dos personas. Lo mismo con el filtro: en «Inactivos» la
// misma cuenta significa exactamente lo contrario. Es el defecto que ya costó caro en el Sheet —un
// encabezado que dejó de describir lo que había debajo escondió $292,8 M— y acá es el mismo error
// con otra ropa: el número es correcto y la palabra que lo nombra, no.
//
// Regla: cada métrica se llama por lo que de verdad contó, y una métrica que en el filtro activo
// sería siempre 0 no se dibuja — «SIN ASIGNAR 0» dentro del filtro «En obra» no es una buena
// noticia, es una tautología ocupando lugar.
//
// LO QUE NO ESTÁ: `HH DEL MES`. El listado sale de `persona_directorio`, que no publica horas;
// sumarlas exigiría leer `registros_hh` del plantel entero en cada carga de la pantalla. Se declara
// en vez de dibujarse en 0.

import type { Metrica } from '@/shared/components/ds'
import type { FiltroPersonal } from './personasService'

/** Lo mínimo que el pie necesita de cada fila. Se tipa por estructura y no con
 *  `PersonaEnDirectorio` para que la prueba no tenga que fabricar catorce campos. */
export interface FilaContable {
  obra_actual_id: string | null
  cuadrilla_id: string | null
  en_la_empresa: boolean
}

export function contar(personas: FilaContable[]) {
  return {
    total: personas.length,
    // LA OBRA SE CUENTA POR EL ID, NO POR EL NOMBRE: `obra_actual` puede venir vacío para una obra
    // que sí existe (el nombre lo resuelve un join), y contar por el nombre bajaría el número de
    // «en obra» sin que nadie lo note.
    enObra: personas.filter((p) => p.obra_actual_id != null).length,
    sinAsignar: personas.filter((p) => p.obra_actual_id == null).length,
    sinCuadrilla: personas.filter((p) => p.cuadrilla_id == null).length,
  }
}

/** Cómo se llama el conjunto que la pantalla está mostrando ahora mismo. */
function rotuloDelConjunto(filtro: FiltroPersonal, buscando: boolean): string {
  if (buscando) return 'Coinciden'
  if (filtro === 'inactivos') return 'Inactivos'
  if (filtro === 'en_obra') return 'En obra'
  if (filtro === 'sin_asignar') return 'Sin asignar'
  return 'Plantel'
}

export function metricasDelListado({
  filtro, buscando, personas,
}: {
  filtro: FiltroPersonal
  /** Hay texto en el buscador: lo que se ve es un resultado de búsqueda, no un conjunto del negocio. */
  buscando: boolean
  personas: FilaContable[]
}): Metrica[] {
  const n = contar(personas)
  const metricas: Metrica[] = [{ etiqueta: rotuloDelConjunto(filtro, buscando), valor: n.total }]

  // A QUIEN YA NO ESTÁ NO SE LE PREGUNTA DÓNDE TRABAJA. Su obra y su cuadrilla quedaron cerradas al
  // egresar: dibujar «sin asignar 45» diría que hay 45 personas esperando destino.
  if (filtro === 'inactivos') return metricas

  // EN LOS FILTROS «En obra» y «Sin asignar» el desglose YA ES el conjunto: repetirlo sería el
  // mismo número dos veces con dos nombres, que es como se aprende a desconfiar de una franja.
  if (filtro === 'plantel') {
    metricas.push({ etiqueta: 'En obra', valor: n.enObra, contexto: 'con asignación vigente' })
    metricas.push({
      etiqueta: 'Sin asignar',
      valor: n.sinAsignar,
      // El tono sólo cuando hay alguien: el ámbar existe para que se mire, y un ámbar sobre un 0
      // gasta la señal. Normal silencioso.
      tono: n.sinAsignar > 0 ? 'warn' : undefined,
    })
  }
  metricas.push({
    etiqueta: 'Sin cuadrilla',
    valor: n.sinCuadrilla,
    contexto: n.sinCuadrilla > 0 ? 'no cuentan para la capacidad' : undefined,
  })

  return metricas
}
