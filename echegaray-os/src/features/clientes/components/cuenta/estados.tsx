// CÓMO SE PINTA EL ESTADO DE UN DOCUMENTO Y DE UN PAGO — un solo mapa para las dos pantallas.
//
// Los cinco estados los dibuja el mockup 28 en la columna ESTADO (`28:203`, `28:249`, `28:281`,
// `28:302`, `28:314`) y el 32 los repite idénticos en su columna ESTADO. Tenerlo dos veces es
// garantizar que un día «Retenido» sea gris en una pantalla y verde en la otra.
//
// El TEXTO también cambia de color y no es un descuido del zip: lo que sigue en juego se escribe
// en `#3A3A38` y lo que ya se cerró —cobrado, retenido— en `#6B6B67`, medio tono más apagado.

import type { ReactNode } from 'react'
import { C } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import type { EstadoCertificado, EstadoPago } from '../../types/cobranzas'

export interface PintaEstado {
  texto: string
  color: string
  textoColor: string
  icono: ReactNode
}

export function pintarEstado(estado: EstadoCertificado | EstadoPago): PintaEstado {
  switch (estado) {
    case 'cobrado':
      return { texto: 'Cobrado', color: C.pos, textoColor: C.tintaSuave, icono: <Ico d={P.okCirculo} s={14} w={2} /> }
    case 'vencido':
      return { texto: 'Vencido', color: C.neg, textoColor: C.tintaMedia, icono: <Ico d={P.alerta} s={14} w={2} /> }
    case 'en_disputa':
      return { texto: 'En disputa', color: C.warn, textoColor: C.tintaMedia, icono: <Ico d={P.chat} s={14} w={2} /> }
    case 'observado':
      return { texto: 'Observado', color: C.warn, textoColor: C.tintaMedia, icono: <Ico d={P.chat} s={14} w={2} /> }
    case 'retenido':
      return { texto: 'Retenido', color: C.tenue, textoColor: C.tintaSuave, icono: <Ico d={P.escudo} s={14} w={2} /> }
    case 'previsto':
      return { texto: 'Previsto', color: C.tenue, textoColor: C.tintaSuave, icono: <Ico d={P.circulo} s={14} w={2} /> }
    case 'emitido':
      return { texto: 'Emitido', color: C.curso, textoColor: C.tintaMedia, icono: <Ico d={P.reloj} s={14} w={2} /> }
    case 'en_revision':
      return { texto: 'En revisión', color: C.curso, textoColor: C.tintaMedia, icono: <Ico d={P.reloj} s={14} w={2} /> }
    case 'aprobado':
      return { texto: 'Aprobado', color: C.curso, textoColor: C.tintaMedia, icono: <Ico d={P.reloj} s={14} w={2} /> }
    default:
      return { texto: 'A vencer', color: C.curso, textoColor: C.tintaMedia, icono: <Ico d={P.reloj} s={14} w={2} /> }
  }
}

/** La celda ESTADO tal cual la dibuja el zip: ícono coloreado + texto en su gris. */
export function CeldaEstado({ estado }: { estado: EstadoCertificado | EstadoPago }) {
  const e = pintarEstado(estado)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: e.color, minWidth: 0 }}>
      {e.icono}
      <span style={{ fontSize: '11.5px', color: e.textoColor, whiteSpace: 'nowrap' }}>{e.texto}</span>
    </div>
  )
}
