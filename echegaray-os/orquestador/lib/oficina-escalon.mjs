// EL ESCALÓN DE OFICINA: DE DÓNDE SALE SU AUMENTO, HASTA DÓNDE ESTÁ FIRMADO, Y CUÁL ES SU PISO.
//
// ═══ LA ORDEN (14/08/2026, textual) ═══
//
// El dueño: *"jornales con el cuadro del grupo oficina como la proyeccion de obreros pero
// considerando q cobran por mes"*.
//
// ═══ QUÉ TENÍA OBREROS Y OFICINA NO ═══
//
// La proyección de obreros (cuadro 4.2) publica, mes por mes: el escalón del convenio, su factor
// sobre la base, DE DÓNDE SALE ese factor (`Ac.Mayo 2026` o `proyección`) y un estado que distingue
// el acuerdo firmado de la estimación. Oficina proyectaba con `base × factor` y nada más: el factor
// aparecía como un número de cuatro decimales en la columna «Ajuste escalón», sin decir si detrás
// había un acuerdo firmado o una repetición del último tramo conocido.
//
// La diferencia no es cosmética. `OFICINA_PROYECTADO` alimenta CAJA y los dos cash flows: un mes
// proyectado sobre un tramo INVENTADO y uno proyectado sobre un acuerdo FIRMADO valen distinto para
// decidir, y hasta hoy se veían idénticos.
//
// ═══ POR QUÉ NO SE LE HACE UN CUADRO PROPIO ═══
//
// Copiar el cuadro 4.2 debajo de Oficina daría DOS tablas del mismo escalón en la misma pestaña —dos
// versiones del mismo concepto, que es lo que la Realidad Única prohíbe—. Lo que se copia es el
// MÉTODO: cada fila declara la firmeza de su propio número. El escalón sigue viviendo una sola vez,
// en 4.2, y la columna «Ajuste escalón» de Oficina lo sigue citando por fórmula.
//
// ═══ EL PISO: LA RESPUESTA ES QUE NO TIENE, Y ESO SE DICE ═══
//
// Obreros tiene piso porque el CCT 76/75 publica una escala por categoría y la réplica `_UOCRA_RAW`
// la trae. Buscado el 14/08 en todo el repositorio: no hay ninguna escala, acuerdo ni salario mínimo
// cargado para el personal ADMINISTRATIVO. Las cinco categorías que la réplica publica son de obra
// (Oficial Especializado · Oficial · Medio Oficial · Ayudante · Sereno) y ninguna aplica a oficina.
//
// Así que Oficina NO tiene piso de convenio, y la pestaña lo dice en una línea en vez de dejar el
// hueco mudo. Inventarle uno —el salario mínimo, o la categoría de obra más baja— sería fabricar un
// dato: son fuentes que el OS no tiene cargadas y que nadie verificó.
//
// LO ÚNICO QUE SÍ ES UN PISO, Y NO ES LEGAL SINO ARITMÉTICO: un sueldo nominal no baja hacia
// adelante. El factor de la celda es `INDEX(4.2)/INDEX(4.2)` y tiene DOS formas de dar menos de 1, las
// dos silenciosas: que el dueño ponga un valor negativo en el parámetro `PARITARIA_UOCRA_PROYECTADA`
// —que es suyo y editable, y del que sale el tramo de todos los meses sin acuerdo—, o que la celda
// del factor no sea un número, en cuyo caso la multiplicación cruda da CERO. Un cero acá no se ve
// como un error: se ve como un mes sin sueldo, y viaja por `OFICINA_PROYECTADO` hasta la caja.
//
// EL PISO NO LLEVA AVISO PROPIO, A PROPÓSITO. La causa —un factor que baja— se ve donde vive el
// escalón: en la columna «Factor sobre la base» del cuadro 4.2, con su Σ bajando al lado. Un segundo
// aviso acá repetiría lo que el cuadro de arriba ya muestra, y esta pestaña ya fue rechazada una vez
// por tener dos números para la misma pregunta.
//
// HACIA ATRÁS NO HAY PISO, y no es un olvido. Un mes ANTERIOR al mes base que la planilla nunca
// cargó se proyecta deflactando la base, y ahí un factor menor que 1 es lo correcto: en marzo se
// cobraba menos que en junio. Aplicarle el piso lo sobreestimaría todos los meses.
//
// ═══ LA TRAMPA QUE ESTE ARCHIVO NO REPRODUCE ═══
//
// La Σ del convenio de obra se apaga ENTERA —devuelve `""`— si a una sola categoría le falta el
// básico. El 14/08 una fórmula residual en la celda del básico de `A` dejó la Σ en blanco, el término
// `convenio` del `MAX(convenio; demanda)` en cero, y la proyección de obreros publicó $79.753.312
// donde el piso pedía $109.714.182. Ni un error, ni una celda en rojo.
//
// Acá el equivalente sería devolver "no sé" cuando parte de la cadena de tramos no está firmada. No
// se hace: se devuelve HASTA DÓNDE está firmada. Un dato que falta degrada la fila, nunca la apaga.

import { ALERTA } from './glifos.mjs'
import { escalonDe, rotuloDeAcuerdo } from './uocra-acuerdos.mjs'
import { ORIGEN_ACUERDO, factorUocraEntre } from './uocra-paritaria.mjs'

/**
 * LA LÍNEA QUE DECLARA EL DRIVER Y LA AUSENCIA DE PISO, EN LA PESTAÑA Y NO EN UN COMENTARIO.
 *
 * Dice las dos cosas que un lector no puede deducir de ninguna celda: que el aumento de Oficina se
 * mueve por el escalón UOCRA, y que ese convenio no es el suyo —así que tampoco es su piso—. El
 * comentario del generador ya lo decía (*"por más que no estén en ese gremio"*, 07/08); estaba
 * escrito donde nadie lo abre.
 *
 * NO NOMBRA AL CONVENIO, Y NO ES UN EUFEMISMO. La primera versión decía "Aumenta por escalón UOCRA —
 * no es su convenio ni piso" y el test de la pestaña la rechazó: el dueño ordenó que TODO lo gremial
 * viviera junto y debajo de las tres nóminas (*"en el medio hay cuestiones gremiales q confunden"*), y
 * ésta cae en el medio. La regla es buena y el aviso también: lo que la sección 2 necesita declarar es
 * QUÉ mueve su número —el mismo porcentaje que obra— y que no tiene piso propio. Cuál es ese
 * porcentaje y de qué acuerdo sale se lee en la sección 4, entera y de una sola vez.
 *
 * MIDE 48 CARACTERES A PROPÓSITO: `sub()` le suma 5 y el tope de glosa de esta pestaña es 60. El test
 * lo mide — si alguien la alarga, la pestaña vuelve a la prosa que el dueño rechazó.
 */
export const LINEA_DRIVER_OFICINA = 'Aumenta por el mismo % que obra — sin piso propio'

/** El período 'YYYY-MM' de un mes 1-based. La misma forma que usa el parser de acuerdos. */
export const periodoDe = (anio, mes) => `${anio}-${String(mes).padStart(2, '0')}`

/** 'YYYY-MM' → '08/2026'. Sin tabla de meses nueva: una cuarta copia de los doce nombres envejece. */
const mesAño = (periodo) => {
  const [a, m] = String(periodo ?? '').split('-')
  return a && m ? `${m}/${a}` : String(periodo ?? '')
}

/**
 * NÚCLEO PURO: DE DÓNDE SALE EL AUMENTO DE UN MES DE OFICINA, RESPECTO DE SU MES BASE.
 *
 * El factor de un mes NO es un tramo: es el producto de todos los tramos entre el mes base y él. Que
 * el mes de destino tenga acuerdo publicado no alcanza para llamarlo firmado —basta con que UNO de
 * los tramos del camino sea proyección para que el factor entero lo sea en parte—. Por eso se mira la
 * cadena completa, que es lo que `factorUocraEntre` ya devuelve en `tramos`: no se cuenta dos veces.
 *
 * NO HAY UNA CLASE "EL ESCALÓN BAJA", Y SE PROBÓ QUE NO PUEDE HABERLA. `pctDeRotulo` lee el tramo con
 * `/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/` —sin signo— y el respaldo (`ULTIMO_TRAMO`) es positivo: desde los
 * acuerdos parseados el factor hacia adelante nunca puede dar menos de 1. Un estado que no puede
 * encenderse es peor que ninguno: se lee como que alguien está mirando.
 *
 * El único camino real hacia un factor menor que 1 es la celda, no este archivo (ver
 * `expresionFactorOficina`), y ahí se corta.
 *
 * @param {{escalones?:Array, periodoBase?:string|null, periodoMes?:string|null}} o
 * @returns {{clase:'sin_base'|'base'|'atras'|'firmado'|'mixto'|'proyectado', rotulo:string}}
 */
export function origenDelEscalon({ escalones = [], periodoBase = null, periodoMes = null } = {}) {
  if (!periodoBase || !periodoMes) return { clase: 'sin_base', rotulo: '' }
  if (periodoMes === periodoBase) return { clase: 'base', rotulo: '' }
  // ANTES DEL MES BASE la fila no lleva escalón hacia adelante: su importe es la base DEFLACTADA. Se
  // rotula, porque una celda que dice "proyección" a secas en un mes ya pasado se lee como un olvido
  // de carga y en realidad es otro criterio.
  if (periodoMes < periodoBase) return { clase: 'atras', rotulo: 'antes del mes base' }
  const f = factorUocraEntre(periodoBase, periodoMes, escalones)
  if (!f) return { clase: 'sin_base', rotulo: '' }
  if (f.mesesProyectados === 0) {
    const acuerdo = rotuloDeAcuerdo(escalonDe(escalones, periodoMes)?.acuerdo)
    return { clase: 'firmado', rotulo: acuerdo || 'acuerdo firmado' }
  }
  const firmados = f.tramos.filter((t) => t.origen === ORIGEN_ACUERDO)
  if (!firmados.length) return { clase: 'proyectado', rotulo: `${ALERTA} escalón proyectado` }
  return {
    clase: 'mixto',
    rotulo: `${ALERTA} firmado hasta ${mesAño(firmados[firmados.length - 1].periodo)}`,
  }
}

/**
 * NÚCLEO PURO: LA CELDA «Estado» DE UN MES DE OFICINA — DOS HECHOS, UNA COLUMNA.
 *
 * ═══ POR QUÉ NO HAY COLUMNA NUEVA (14/08) ═══
 *
 * El cuadro 4.2 gasta DOS columnas en esto («De dónde sale» y «Estado»). Oficina no las tiene: el
 * ancho de la pestaña es 8 y las ocho están ocupadas —agregar una dejaría el libro con dos anchos de
 * grilla, el defecto que el auditor de patrón ya rechazó dos veces y que el dueño llama
 * "descuadrado"—. Y no hace falta: las dos columnas de 4.2 contestan UNA sola pregunta —cuán firme es
 * este número— y esta columna ya la contesta para el lado del pago.
 *
 * Un mes pagado es un hecho y ahí se termina: no lleva sufijo porque no tiene proyección adentro. Un
 * mes parcial o proyectado vale exactamente lo que valga su escalón, y eso es lo que se agrega.
 *
 * @param {{pago:'pagado'|'parcial'|'proyección', origen?:{rotulo?:string}|null}} o
 */
export function estadoOficinaDelMes({ pago, origen = null } = {}) {
  if (pago === 'pagado') return 'pagado'
  const r = String(origen?.rotulo ?? '').trim()
  return r ? `${pago} · ${r}` : String(pago ?? '')
}

/**
 * NÚCLEO PURO: LA EXPRESIÓN DEL FACTOR DE UN MES, CON EL PISO PUESTO O NO.
 *
 * `MAX(1;factor)` y no `IF(factor<1;1;factor)`: la celda del factor puede quedar VACÍA si el mes no
 * está en el cuadro del escalón, y `MAX` ignora el texto y devuelve 1 —la base sin ajuste— mientras
 * que la multiplicación cruda devuelve CERO. Un cero acá no se ve como un error: se ve como un mes
 * sin sueldo, y viaja por `OFICINA_PROYECTADO` hasta la caja.
 *
 * @param {string} celdaFactor la celda «Ajuste escalón» del mes (ej. 'B44')
 * @param {boolean} conPiso true sólo para los meses POSTERIORES al mes base
 */
export const expresionFactorOficina = (celdaFactor, conPiso) => (
  conPiso ? `MAX(1;${celdaFactor})` : String(celdaFactor)
)

/**
 * NÚCLEO PURO: LA FÓRMULA «Proyectado» DE UN MES DE OFICINA.
 *
 * La aritmética no cambió con el piso: sigue siendo base × factor, y el mes PARCIAL sigue proyectando
 * sólo lo que le falta (`MAX(0; …)`, para que un mes cargado por encima de la base no genere un
 * negativo — eso sería un reintegro). Lo único que entra es el piso del factor.
 *
 * Se escribe acá y no en el generador porque `OFICINA_PROYECTADO` alimenta CAJA y los dos cash flows:
 * la aritmética del número que viaja por ese nombre tiene que poder probarse sin armar la pestaña.
 *
 * @param {{celdaBase:string, celdaFactor:string, celdaPagado:string, conBloque:boolean, conPiso:boolean}} o
 */
export function formulaProyectadoOficina({ celdaBase, celdaFactor, celdaPagado, conBloque, conPiso }) {
  const ajustada = `${celdaBase}*${expresionFactorOficina(celdaFactor, conPiso)}`
  return conBloque ? `=MAX(0;${ajustada}-N(${celdaPagado}))` : `=${ajustada}`
}
