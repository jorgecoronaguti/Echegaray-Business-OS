'use client'

// 31 · CLIENTE › ACCESO AL PORTAL — PORTE LITERAL DE «31 · Cliente Accesos al Portal.dc.html».
//
//   cuerpo    `display:flex; alignItems:flex-start; gap:36px; padding:20px 24px 32px`
//   izquierda `flex:1; minWidth:600px`, bloques separados 26px
//   derecha   `width:392px; flexShrink:0`, bloques separados 26px
//
// ESTA ES LA PANTALLA QUE ABRE LA EMPRESA HACIA AFUERA. Todo lo demás del OS decide qué ve un
// empleado; acá se decide qué ve el CLIENTE: montos, facturas, avance y —si se marca— la
// aprobación que habilita una factura. Por eso los permisos pasan por `permisosCoherentes` en la
// pantalla Y otra vez en el servidor: entre las dos hay una red.

import { useState } from 'react'
import type { ResultadoAccion } from '@/shared/components/ui/FormAccion'
import { C } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { useAlPedir } from '../canon/pedidos'
import { ActividadDelPortal } from './ActividadDelPortal'
import { PanelAgregarMail, type ObraElegible } from './PanelAgregarMail'
import { ReglasDelPortal } from './ReglasDelPortal'
import { TablaAccesos } from './TablaAccesos'
import type { ContactoConocido } from '../../services/reglasPortal'
import type { AccesoPortal, ActividadPortal } from '../../types/cobranzas'

export function AccesosPortal({
  accesos, actividad, contactos, obras, hoy, clienteId,
  habilitarAcceso, revocarAcceso, reenviarInvitacion,
}: {
  accesos: AccesoPortal[]
  actividad: ActividadPortal[]
  contactos: ContactoConocido[]
  obras: ObraElegible[]
  hoy: string
  clienteId: string
  habilitarAcceso: (clienteId: string, entrada: unknown) => Promise<ResultadoAccion>
  revocarAcceso: (accesoId: string) => Promise<ResultadoAccion>
  reenviarInvitacion: (accesoId: string) => Promise<ResultadoAccion>
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useAlPedir((p) => {
    if (p === 'agregar-mail') {
      // El alta ya está dibujada a la derecha: el botón de la cabecera cierra la edición para que
      // el panel vuelva a ser el formulario en blanco, y lleva el foco ahí.
      setEditando(null)
      setError(null)
      setAviso(null)
      document.querySelector<HTMLInputElement>('[data-testid="acceso-mail"]')?.focus()
    } else if (p === 'ingresos') {
      setAviso('El registro de ingresos completo lo trae back-28-32; abajo están los últimos.')
    } else if (p === 'suspender') {
      setAviso('Suspender el portal entero del cliente todavía no está conectado (back-28-32).')
    }
  })

  async function correr(accion: () => Promise<ResultadoAccion>, exito: string) {
    setAviso(null)
    setError(null)
    const r = await accion()
    if (r.ok) setAviso(r.mensaje ?? exito)
    else setError(r.error)
  }

  const enEdicion = accesos.find((a) => a.id === editando) ?? null

  return (
    <div
      data-testid="vista-accesos-portal"
      className="-mx-4 lg:-mx-10"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '36px', padding: '20px 24px 32px',
        flexWrap: 'wrap', background: C.lienzo,
      }}
    >
      <div style={{
        flex: 1, minWidth: 'min(600px, 100%)', display: 'flex', flexDirection: 'column', gap: '26px',
      }}>
        {(aviso || error) && (
          <div
            data-testid="accesos-aviso"
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '11.5px',
              lineHeight: 1.45, color: error ? C.neg : C.warn,
            }}
          >
            <Ico d={error ? P.alerta : P.info} s={14} w={2} />
            {error ?? aviso}
          </div>
        )}

        <TablaAccesos
          accesos={accesos} totalObras={obras.length} hoy={hoy} elegido={editando}
          onEditar={setEditando}
          onReenviar={(id) => correr(() => reenviarInvitacion(id), 'Invitación reenviada.')}
          onRevocar={(id) => correr(() => revocarAcceso(id), 'Acceso revocado: ese mail ya no entra.')}
        />

        <ActividadDelPortal actividad={actividad} hoy={hoy} />
      </div>

      <div style={{
        width: '392px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '26px',
        maxWidth: '100%',
      }}>
        <PanelAgregarMail
          // La `key` remonta el formulario al cambiar de acceso: sin ella, editar a Marta después
          // de Julián dejaría los permisos de Julián dibujados sobre el mail de Marta.
          key={editando ?? 'alta'}
          accesos={accesos} contactos={contactos} obras={obras} edicion={enEdicion}
          onCerrarEdicion={() => setEditando(null)}
          habilitar={(entrada) => habilitarAcceso(clienteId, entrada)}
        />
        <ReglasDelPortal />
      </div>
    </div>
  )
}
