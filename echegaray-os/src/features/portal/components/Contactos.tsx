import { iniciales } from '@/shared/components/canon'
import type { ContactoPortal } from '../types'
import { P } from '../estilos'
import { Avatar, TituloBloque, VacioPortal } from './piezas'
import { IcoLlamar } from './iconos'

// «SU CONTACTO» — `29`, líneas 671–695.
//
// Dos personas con nombre y rol: quién ve el contrato y los certificados, y quién ve el día a día.
// El teléfono es un `tel:` de verdad — en el teléfono del cliente, tocarlo llama. Sin número
// cargado no se dibuja el icono: un teléfono que no marca es peor que ninguno.

export function Contactos({ contactos }: { contactos: ContactoPortal[] }) {
  return (
    <div>
      <TituloBloque titulo="Su contacto" />
      {contactos.length === 0 ? (
        <VacioPortal texto="Todavía no está asignado su contacto en la empresa." />
      ) : (
        contactos.map((c, i) => (
          <div key={`${c.nombre}-${c.rol}`} style={{
            display: 'flex', alignItems: 'center', gap: 11, padding: '12px 0',
            borderBottom: i === contactos.length - 1 ? undefined : `1px solid ${P.lineaBloque}`,
          }}>
            <Avatar iniciales={iniciales(c.nombre)} s={30} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '12.5px', color: P.tinta }}>{c.nombre}</div>
              <div style={{ fontSize: '11px', color: P.tenue, marginTop: 1 }}>{c.rol}</div>
            </div>
            {c.telefono && (
              <a
                href={`tel:${c.telefono.replace(/\s+/g, '')}`}
                title="Llamar"
                style={{ display: 'flex', color: P.tenue, flexShrink: 0 }}
              >
                <IcoLlamar />
              </a>
            )}
          </div>
        ))
      )}
    </div>
  )
}
