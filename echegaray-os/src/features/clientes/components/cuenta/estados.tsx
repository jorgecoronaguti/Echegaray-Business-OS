// CÓMO SE PINTA EL ESTADO DE UN DOCUMENTO Y DE UN PAGO — un solo mapa para las dos pantallas.
//
// Tenerlo dos veces es garantizar que un día «Retenido» sea gris en una pantalla y verde en la otra.
//
// ═══ LOS SIETE ESTADOS DEL CERTIFICADO YA NO SE APILAN EN TRES (04/09/2026) ═══
//
// `emitido`, `en_revision` y `aprobado` se dibujaban los tres en el azul de «en curso», y
// `en_disputa` compartía el ámbar con `observado`. Eso borraba de la pantalla lo ÚNICO que
// `certificado_cliente` sabe y la pestaña Cobranzas no: si el cliente ya aprobó el certificado.
// Un certificado aprobado y uno que el cliente todavía no miró no se reclaman igual.
//
// EL COLOR Y EL RÓTULO SALEN DE `services/propiedadesCertificado.ts`, que es donde el panel los
// lee y donde se prueban con `node --test`. Acá sólo se elige el ícono, que es lo único que no se
// puede probar sin React.
//
// El TEXTO también cambia de tono y no es un descuido del zip: lo que sigue en juego se escribe en
// `#3A3A38` y lo que ya se cerró —cobrado, retenido— en `#6B6B67`, medio tono más apagado.

import type { ReactNode } from 'react'
import { C } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { COLOR_ESTADO, ROTULO_ESTADO } from '../../services/propiedadesCertificado'
import type { EstadoCertificado, EstadoPago } from '../../types/cobranzas'

export interface PintaEstado {
  texto: string
  color: string
  textoColor: string
  icono: ReactNode
}

/** El ícono de cada estado. Es lo único que decide este archivo: el color y el rótulo son del
 *  servicio, para que la tabla, el panel y el calendario no puedan discrepar. */
const ICONO_CERT: Record<EstadoCertificado, ReactNode> = {
  emitido: <Ico d={P.reloj} s={14} w={2} />,
  en_revision: <Ico d={P.reloj} s={14} w={2} />,
  aprobado: <Ico d={P.okCirculo} s={14} w={2} />,
  observado: <Ico d={P.chat} s={14} w={2} />,
  vencido: <Ico d={P.alerta} s={14} w={2} />,
  cobrado: <Ico d={P.okCirculo} s={14} w={2} />,
  en_disputa: <Ico d={P.chat} s={14} w={2} />,
}

/** Un estado ya cerrado se escribe medio tono más apagado que uno que sigue en juego. */
const CERRADOS = new Set<EstadoCertificado | EstadoPago>(['cobrado', 'retenido'])

const mayus = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export function pintarEstado(estado: EstadoCertificado | EstadoPago): PintaEstado {
  if (estado in ROTULO_ESTADO) {
    const e = estado as EstadoCertificado
    return {
      texto: mayus(ROTULO_ESTADO[e]),
      color: COLOR_ESTADO[e],
      textoColor: CERRADOS.has(e) ? C.tintaSuave : C.tintaMedia,
      icono: ICONO_CERT[e],
    }
  }
  switch (estado) {
    case 'retenido':
      return { texto: 'Retenido', color: C.tenue, textoColor: C.tintaSuave, icono: <Ico d={P.escudo} s={14} w={2} /> }
    case 'previsto':
      return { texto: 'Previsto', color: C.tenue, textoColor: C.tintaSuave, icono: <Ico d={P.circulo} s={14} w={2} /> }
    default:
      return { texto: 'A vencer', color: C.curso, textoColor: C.tintaMedia, icono: <Ico d={P.reloj} s={14} w={2} /> }
  }
}

/**
 * LA CELDA ESTADO DE LAS DOS TABLAS DEL HANDOFF v4: texto en el color del estado, sin ícono.
 *
 * ═══ POR QUÉ SE FUE EL ÍCONO (05/09/2026) ═══
 *
 * El zip anterior dibujaba ícono coloreado + texto en gris. Los dos mockups de la entrega v4
 * escriben el estado como TEXTO en el color del estado y nada más —`:513` de «Lo que faltaba» y
 * `:804` de «una pantalla»—, y el motivo se ve en la captura: con siete estados, siete íconos
 * distintos en una columna de 132px se leen como un semáforo y tapan la única palabra que
 * distingue «aprobado por el cliente» de «en revisión del cliente».
 *
 * El rótulo va en minúscula, como en el mockup: es una celda de tabla, no un título.
 */
export function CeldaEstado({ estado }: { estado: EstadoCertificado | EstadoPago }) {
  const e = pintarEstado(estado)
  return (
    <span style={{
      fontSize: '12.5px', color: e.color, minWidth: 0, overflow: 'hidden',
      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>{e.texto.toLocaleLowerCase('es-AR')}</span>
  )
}
