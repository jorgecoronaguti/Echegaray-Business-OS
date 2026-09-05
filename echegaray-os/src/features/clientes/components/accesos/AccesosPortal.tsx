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
import type { EntradaAcceso, EntradaAltaAcceso } from '../../services/entradasCobranza'
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
  habilitarAcceso: (entrada: EntradaAltaAcceso) => Promise<ResultadoAccion>
  revocarAcceso: (entrada: EntradaAcceso) => Promise<ResultadoAccion>
  reenviarInvitacion: (entrada: EntradaAcceso) => Promise<ResultadoAccion>
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
      // La tabla `cliente_actividad_portal` guarda TODO; la lectura de esta pantalla pide los
      // últimos 50 porque el libro sólo crece. Falta la pantalla que los pagine, no el dato.
      setAviso('Abajo están los últimos 50 movimientos. El registro completo todavía no tiene pantalla que lo pagine.')
    } else if (p === 'suspender') {
      // No hay interruptor de cliente: el corte es POR ACCESO (`cliente_acceso.revocado_at`) y la
      // RLS lee esa columna. Suspender el portal entero sería revocar los N accesos de una — se
      // puede, pero es una acción destructiva sobre varias filas y nadie decidió si se revierte.
      setAviso('No hay un interruptor del portal por cliente: el acceso se corta mail por mail, con «Revocar».')
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
      {/* 958px ES EL ANCHO QUE PIDE LA TABLA DEL HANDOFF, no un número redondo: es la suma de sus
          seis pistas (230+150+120+140+150+28) más los cinco huecos de 28. Con el mínimo anterior de
          600px, entre 1500 y 1860px de viewport el panel de alta se quedaba al lado y estrangulaba
          la tabla a ~620px: las columnas se pisaban y el mail —que es la llave— se cortaba. Con el
          mínimo real, `flex-wrap` baja el panel cuando no entran los dos, que es lo que el handoff
          v4 dibuja: la lista a ancho completo y el alta debajo. */}
      <div style={{
        flex: 1, minWidth: 'min(958px, 100%)', display: 'flex', flexDirection: 'column', gap: '26px',
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

        {/* VER EL PORTAL COMO LO VE ESTE CLIENTE. Va arriba de la lista de invitados y no abajo:
            la pregunta «¿qué le estoy mostrando?» se hace ANTES de decidir a quién invitar. Abre en
            otra pestaña para no perder la ficha, y no crea ningún acceso — la autorización es la
            sesión del OS. */}
        <a
          href={`/portal/vista-previa/${clienteId}`}
          target="_blank"
          rel="noreferrer"
          data-testid="ver-como-el-cliente"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-start',
            minHeight: '38px', padding: '0 14px', borderRadius: '8px', background: C.marca,
            color: C.tinta, fontSize: '12.5px', fontWeight: 600, textDecoration: 'none',
          }}
        >
          <Ico d={P.ojo ?? P.info} s={15} w={1.8} />
          Ver el portal como lo ve este cliente
        </a>

        <TablaAccesos
          accesos={accesos} totalObras={obras.length} hoy={hoy} elegido={editando}
          onEditar={setEditando}
          onReenviar={(id) => correr(() => reenviarInvitacion({ accesoId: id }), 'Invitación reenviada.')}
          onRevocar={(id) => correr(() => revocarAcceso({ accesoId: id }), 'Acceso revocado: ese mail ya no entra.')}
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
          habilitar={(entrada) => habilitarAcceso({ clienteId, ...entrada })}
        />
        <ReglasDelPortal />
      </div>
    </div>
  )
}
