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
// lee y donde se prueban con `node --test`. Acá no se decide ninguno de los dos: sólo se traduce
// el estado de un PAGO, que no está en ese mapa porque no es un estado de certificado.
//
// ═══ EL ÍCONO SE FUE CON LA ENTREGA v4 (05/09/2026) ═══
//
// `ICONO_CERT` mapeaba los siete estados a siete íconos y ya no lo consume nadie: los dos mockups
// del handoff escriben el estado como texto en su color. Se borra en vez de dejarse «por si
// vuelve»: un mapa de íconos que nadie dibuja es la invitación a volver a dibujarlos.

import { C } from '../canon/tokens'
import { COLOR_ESTADO, ROTULO_ESTADO } from '../../services/propiedadesCertificado'
import type { EstadoCertificado, EstadoPago } from '../../types/cobranzas'

export interface PintaEstado {
  texto: string
  color: string
}

const mayus = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export function pintarEstado(estado: EstadoCertificado | EstadoPago): PintaEstado {
  if (estado in ROTULO_ESTADO) {
    const e = estado as EstadoCertificado
    return { texto: mayus(ROTULO_ESTADO[e]), color: COLOR_ESTADO[e] }
  }
  switch (estado) {
    case 'retenido':
      return { texto: 'Retenido', color: C.tenue }
    case 'previsto':
      return { texto: 'Previsto', color: C.tenue }
    default:
      return { texto: 'A vencer', color: C.curso }
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
