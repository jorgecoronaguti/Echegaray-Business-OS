// LAS SEÑALES DE LA PRIMERA LÍNEA DE DOCUMENTOS — criterio 1 y 2 del patrón v2 (`27v2:40-56`).
//
// Reemplaza a `BandaVencimientos`, que decía lo mismo con tres formas distintas: un `Aviso` rojo,
// un `Aviso` ámbar y dos párrafos de texto según el estado. Lo que se conserva entero es su
// argumento, que es el que importa:
//
//   NADIE CARGÓ NINGUNA FECHA ≠ NINGUNO VENCIDO. Con `conFecha = 0` —el estado de hoy: las 847
//   filas de `documentacion_legajo` tienen `fecha_vencimiento` en null— NO se dibuja «0 vencidos».
//   Eso se lee «está todo en orden» y sería falso: lo que pasa es que el control no está cargado. Se
//   dice con palabras, en el lugar del vacío del bloque.
//
//   NO SE PUDO CONTAR ≠ NO HAY NADA QUE AVISAR. Un error de lectura dibuja las dos señales sin
//   cifra: callarse pintaría una pantalla tranquila sobre un control que no corrió.
//
//   CADA CIFRA ATERRIZA EN SUS FILAS. `?vence=vencido` y `?vence=mes` son los mismos recortes que
//   produjeron el número: un contador que no lleva a las filas obliga a buscarlas entre 3.128.

import type { SenalDeTrabajo } from '../../../shared/components/v2/trabajo.ts'
import type { ResumenVencimientos } from '../types.ts'

export interface HrefsDeVencimiento {
  vencidos: string
  esteMes: string
}

/**
 * @param resumen `null` = la consulta falló. NO es «no hay vencimientos».
 */
export function senalesDeDocumentos(
  resumen: ResumenVencimientos | null,
  hrefs: HrefsDeVencimiento,
): SenalDeTrabajo[] {
  if (resumen === null) {
    return [
      {
        clave: 'vencidos', numero: null, tono: 'neg', texto: 'papeles vencidos',
        bloquea: 'No pude contarlos: esta pantalla no puede afirmar que no haya ninguno',
        accion: 'Ver', href: hrefs.vencidos,
      },
      {
        clave: 'por-vencer', numero: null, texto: 'vencen este mes',
        bloquea: 'No pude contarlos: esta pantalla no puede afirmar que no haya ninguno',
        accion: 'Ver', href: hrefs.esteMes,
      },
    ]
  }

  const s: SenalDeTrabajo[] = []
  if (resumen.vencidos > 0) {
    s.push({
      clave: 'vencidos', numero: resumen.vencidos, tono: 'neg',
      texto: resumen.vencidos === 1 ? 'papel vencido' : 'papeles vencidos',
      bloquea: 'La persona no puede estar en obra con la libreta vencida',
      accion: 'Ver', href: hrefs.vencidos,
    })
  }
  if (resumen.venceEsteMes > 0) {
    s.push({
      clave: 'por-vencer', numero: resumen.venceEsteMes,
      texto: resumen.venceEsteMes === 1 ? 'vence este mes' : 'vencen este mes',
      bloquea: 'ART y seguros hay que renovarlos antes, no después',
      accion: 'Ver', href: hrefs.esteMes,
    })
  }
  return s
}

/**
 * QUÉ SE ESCRIBE CUANDO NO HAY NINGUNA SEÑAL. Son DOS silencios distintos y no se pueden confundir.
 *
 * Sin ninguna fecha cargada, «no hay vencimientos» es una afirmación que esta pantalla no puede
 * hacer: nadie está midiendo. Con fechas cargadas y ninguna en riesgo, sí — y el número de papeles
 * controlados es lo que la vuelve creíble.
 */
export function silencioDeVencimientos(resumen: ResumenVencimientos | null): string {
  if (resumen === null) return 'No pude contar los vencimientos.'
  if (resumen.conFecha === 0) {
    return 'Ningún documento tiene fecha de vencimiento cargada, así que esta pantalla todavía no '
      + 'puede avisar de un papel vencido. La fecha se carga en el panel de un documento vinculado '
      + 'a un legajo; desde ahí, ART, seguros y libretas empiezan a vencer solas.'
  }
  const n = resumen.conFecha
  return `${n} ${n === 1 ? 'documento con vencimiento controlado' : 'documentos con vencimiento controlado'}. `
    + 'Ninguno vencido ni venciendo este mes.'
}
