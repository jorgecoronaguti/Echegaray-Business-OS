// LO LEÍDO HASTA AHORA, CON LA FORMA DE UNA CORRIDA TERMINADA. PURO: sin red, sin base, sin modelo.
//
// ═══ POR QUÉ EXISTE ═══
//
// El paso a paso de «Presupuestos v5 · Lectura del plano» no es una animación: los siete pasos se
// van completando porque el motor va leyendo. Para eso hace falta poder contestar, EN MITAD de la
// corrida, la misma pregunta que se contesta al final — «¿qué dice el plano hasta acá?».
//
// `razonar()` y `vistaDePasos()` ya la contestan y son PURAS Y SÍNCRONAS: cero llamadas al modelo.
// Lo único que les falta es la entrada, porque `correr()` arma el cómputo recién al terminar. Este
// módulo la arma con lo que hay: las láminas y las vistas que el progreso ya trajo. Recalcularlo en
// cada avance no cuesta un peso ni agrega latencia — es multiplicar y agrupar, unas veinte veces
// por corrida.
//
// ═══ LO QUE ACÁ NO SE HACE, A PROPÓSITO ═══
//
// No se mapea contra la Base Maestra ni se arma la cotización: eso consulta Postgres y persiste
// filas, y no puede correr veinte veces mientras se lee. Por eso el parcial trae el RAZONAMIENTO
// (los pasos con su evidencia) y no el cómputo con precios: el precio aparece cuando la lectura
// cierra. Un paso parcial dice qué se midió; nunca cuánto sale.

import { fusionarElementos } from './pipeline.mjs'
import { computarElementos } from './computo.mjs'

/**
 * LA MISMA FUSIÓN Y EL MISMO CÓMPUTO QUE HACE `correr()`, sobre lo terminado hasta ahora.
 *
 * Se reusan `fusionarElementos` y `computarElementos` en vez de contar elementos a mano
 * justamente para que el paso a paso que se ve mientras lee no pueda diferir del que queda: una
 * columna vista en la planta y en el corte es UNA columna en los dos momentos.
 *
 * LO QUE FALTA CONTRA UNA CORRIDA COMPLETA: el CAD (`resolverConCad`) todavía no llenó las
 * cantidades que la vista no pudo contar, porque la ingesta documental corre después de las
 * láminas. Eso hace que un parcial pueda tener MENOS cantidades resueltas que el resultado final,
 * nunca más ni distintas — un paso puede pasar de pendiente a medido, jamás al revés.
 *
 * @param {{ laminas?: object[], porRegion?: object[], documentos?: object }} acumulado
 *   lo que viaja en `onProgreso(p).parcial`.
 * @returns {{ laminas: object[], computo: object, documentos: object, soloAdjuntos: boolean }}
 *   la misma forma que `razonar()` recibe de una corrida completa.
 */
export function lecturaHastaAhora({ laminas = [], porRegion = [], documentos = {} } = {}) {
  const crudos = [
    ...laminas.flatMap((l) => l?.elementos ?? []),
    ...porRegion.flatMap((r) => r?.elementos ?? []),
  ]
  const { elementos } = fusionarElementos(crudos)
  return {
    laminas,
    computo: computarElementos(elementos),
    documentos,
    soloAdjuntos: true,
  }
}
