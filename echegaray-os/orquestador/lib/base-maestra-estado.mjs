// EL ESTADO DE UNA ENTRADA DE LA BASE MAESTRA, Y QUÉ SE PUEDE HACER CON ELLA. Puro.
//
// ═══ POR QUÉ UN ESTADO QUE NO CAMBIA NADA NO ES UN ESTADO ═══
//
// Una etiqueta que se guarda, se muestra y no bloquea nada es decoración: da la sensación de
// gobierno sin ejercerlo. El único motivo por el que estos cuatro valores existen es que cada uno
// PROHÍBE algo distinto, y esa prohibición es lo que se prueba —no la etiqueta—.
//
//   VALIDADO   → cierra precio · ES norma · entra en la cobertura confirmada
//   HISTORICO  → cierra precio · NO es norma  ← «lo usamos antes» no es «así se hace»
//   CANDIDATO  → NO cierra precio · NO es norma  ← el sistema lo aprendió, nadie lo aprobó
//   INCOMPLETO → NO cierra precio · su costo es DESCONOCIDO, nunca cero
//
// ═══ LAS DOS CONFUSIONES QUE ESTO IMPIDE, Y LO QUE CUESTAN ═══
//
// **HISTORICO ≠ VALIDADO.** Que una composición se haya usado en tres cotizaciones no la valida:
// puede haberse arrastrado con el mismo error las tres veces. Un histórico sirve para cotizar —es
// lo que la empresa viene haciendo— pero no puede volverse la regla contra la que se corrige a
// nadie. Si un histórico pudiera actuar de norma, el primer error de carga quedaría consagrado.
//
// **CANDIDATO ≠ NORMA.** Un candidato es una hipótesis que el sistema formó solo, mirando una obra
// o un documento. Dejarlo cotizar es dejar que el OS se invente un precio y después lo defienda
// como propio. Un candidato se muestra, se discute y lo asciende una persona: nunca se asciende
// solo por acumulación.
//
// El ascenso es siempre EXPLÍCITO y hacia arriba de a un escalón: la función `ascender` no existe
// acá a propósito. Cambiar de estado es una decisión con nombre y fecha, y vive en la migración
// (`base_maestra_estado`), no en una regla que corra sola.

import { ESTADO as ESTADO_DATO } from './cotizador/contrato.mjs'

/** Los cuatro estados de una entrada de la Base Maestra (partida, composición o rendimiento). */
export const ESTADO_BM = Object.freeze({
  VALIDADO: 'VALIDADO',
  HISTORICO: 'HISTORICO',
  CANDIDATO: 'CANDIDATO',
  INCOMPLETO: 'INCOMPLETO',
})

/**
 * EL MISMO CONCEPTO EN EL VOCABULARIO DEL CONTRATO DE LA COTIZACIÓN (§realidad única).
 *
 * No se inventa una segunda taxonomía: `contrato.ESTADO` ya nombra estos hechos para los datos de
 * una cotización, y una composición INCOMPLETA es exactamente un `FALTA_DATO` a escala de partida.
 * Sin esta tabla convivirían dos palabras para lo mismo y el día que alguien las cruce va a tener
 * que adivinar cuál manda.
 */
export const COMO_ESTADO_DE_DATO = Object.freeze({
  [ESTADO_BM.VALIDADO]: ESTADO_DATO.VALIDADO,
  [ESTADO_BM.HISTORICO]: ESTADO_DATO.HISTORICO,
  [ESTADO_BM.CANDIDATO]: ESTADO_DATO.PROPUESTO,
  [ESTADO_BM.INCOMPLETO]: ESTADO_DATO.FALTA_DATO,
})

/** La tabla de consecuencias. Es el módulo entero: lo demás son lecturas de acá. */
const CONSECUENCIA = Object.freeze({
  [ESTADO_BM.VALIDADO]: Object.freeze({
    cierraPrecio: true, esNorma: true, cobertura: true,
    porQue: 'contrastada contra una fuente que no la produjo: cierra precio y sirve de norma',
  }),
  [ESTADO_BM.HISTORICO]: Object.freeze({
    cierraPrecio: true, esNorma: false, cobertura: true,
    porQue: 'ECSAS la usó antes — sirve para cotizar, pero «lo hicimos así» no es «así se hace»: no corrige a nadie',
  }),
  [ESTADO_BM.CANDIDATO]: Object.freeze({
    cierraPrecio: false, esNorma: false, cobertura: false,
    porQue: 'la aprendió el sistema y no la aprobó nadie: se muestra al lado del precio, no lo forma',
  }),
  [ESTADO_BM.INCOMPLETO]: Object.freeze({
    cierraPrecio: false, esNorma: false, cobertura: false,
    porQue: 'le falta un cajón o una línea sin precio: su costo no es cero, es DESCONOCIDO',
  }),
})

/** ¿Este estado puede cerrar un precio? PURA. Un estado desconocido NO puede: la respuesta por
 *  defecto de un control tiene que ser la que no cuesta plata cuando se equivoca. */
export const cierraPrecio = (estado) => CONSECUENCIA[estado]?.cierraPrecio === true

/** ¿Este estado es norma —sirve para corregir a otro dato? PURA. */
export const esNorma = (estado) => CONSECUENCIA[estado]?.esNorma === true

/** ¿Entra en la parte confirmada de la cobertura del presupuesto? PURA. */
export const entraEnCobertura = (estado) => CONSECUENCIA[estado]?.cobertura === true

/** Por qué este estado permite o prohíbe lo que permite o prohíbe. PURA. */
export const porQueEstado = (estado) => CONSECUENCIA[estado]?.porQue
  ?? `«${estado}» no es un estado de la Base Maestra: no cierra precio ni es norma hasta que alguien lo defina`

/**
 * EL COSTO QUE PUBLICA UNA ENTRADA SEGÚN SU ESTADO. PURA.
 *
 * ═══ ESTA ES LA FUNCIÓN QUE IMPIDE EL ERROR DE $ 28,9 M/m² ═══
 *
 * Medido en la base real: «PISO DE HORMIGON ALISADO MECÁNICO» está partido en T1107.1 (mano de
 * obra, $ 17.550/m²) y T1107.2 (materiales, $ 28.939/m²). Cualquiera de las dos sola es un número
 * creíble —tiene dos decimales y una unidad— y es la MITAD de la partida. Un costo incompleto no
 * se delata solo: se delata acá o no se delata.
 *
 * Devuelve `null` y NO `0` cuando el estado no puede cerrar precio. `null` obliga a quien lo
 * consume a decidir qué hace con el hueco; `0` se suma en silencio y desaparece.
 */
export function costoQuePublica(estado, costo) {
  if (!cierraPrecio(estado)) {
    return Object.freeze({
      costo: null,
      estadoDelDato: COMO_ESTADO_DE_DATO[estado] ?? ESTADO_DATO.FALTA_DATO,
      porQue: porQueEstado(estado),
    })
  }
  return Object.freeze({
    costo: costo === undefined ? null : costo,
    estadoDelDato: COMO_ESTADO_DE_DATO[estado],
    porQue: porQueEstado(estado),
  })
}

/**
 * ¿ESTA ENTRADA PUEDE CORREGIR A AQUÉLLA? PURA.
 *
 * Sólo una norma corrige. Un histórico y un candidato pueden DISCREPAR —y esa discrepancia es
 * información valiosa que hay que mostrar—, pero no pueden declarar que el otro está mal.
 */
export function puedeCorregirA(estadoDeLaFuente, estadoDelDato) {
  if (!esNorma(estadoDeLaFuente)) {
    return { puede: false, porQue: `una entrada ${estadoDeLaFuente} no es norma: puede discrepar de ${estadoDelDato} y mostrarlo, no corregirlo` }
  }
  return { puede: true, porQue: `${estadoDeLaFuente} es norma: la diferencia contra ${estadoDelDato} es un desvío, no una opinión` }
}
