// M12 · QR DESCONOCIDO — «este código no está en el sistema». Nunca un error sin salida.
//
// Desvío: el diseño ofrece «Pegarlo a una herramienta que ya existe». El código de un activo no se
// cambia (`editar_activo` no lo toca: «el código no cambia nunca», D14), así que esa salida no existe
// en esta etapa. Quedan dar de alta con este código y seguir escaneando, más buscar a mano.

import Link from 'next/link'
import { conLugar } from '../../logica/lugar'
import { MONO, V } from '../estilo'
import { QR } from '../QR'
import { FilaTelefono, MarcoTelefono, primarioTelefono } from './MarcoTelefono'

export function CodigoDesconocido({ codigo, en }: { codigo: string; en: string | null }) {
  return (
    <MarcoTelefono
      titulo="Código leído"
      volver={conLugar('/campo/herramientas/escanear', en)}
      pie={<Link href={conLugar('/campo/herramientas/escanear', en)} prefetch={false} style={primarioTelefono}>Escanear otro</Link>}
    >
      <div data-testid="codigo-desconocido" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ width: 96, height: 96, border: `1px solid ${V.linea}`, borderRadius: 6, padding: 6 }}>
          <QR codigo={codigo} lado="100%" margen={0} titulo={`QR leído: ${codigo}`} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ fontSize: '19px', fontWeight: 600 }}>Este código no está en el sistema</h1>
          <div style={{ fontFamily: MONO, fontSize: '14px', color: V.tintaSuave }}>{codigo}</div>
        </div>
        <div style={{ borderTop: `1px solid ${V.linea}` }}>
          <FilaTelefono href={conLugar(`/campo/herramientas/alta?codigo=${encodeURIComponent(codigo)}`, en)} titulo="Dar de alta con este código" bajada={en ? 'queda en este lugar, operativa' : 'elegís dónde queda'} testid="alta-con-codigo" />
          <FilaTelefono href={conLugar('/campo/herramientas/buscar', en)} titulo="Buscar a mano" bajada="por nombre, si la etiqueta es de otra herramienta" />
          <FilaTelefono href={conLugar('/campo/herramientas/escanear', en)} titulo="Seguir escaneando" bajada="lo dejo para después" ultima />
        </div>
        <div style={{ fontSize: '12.5px', color: V.apagado }}>Nunca un error sin salida.</div>
      </div>
    </MarcoTelefono>
  )
}
