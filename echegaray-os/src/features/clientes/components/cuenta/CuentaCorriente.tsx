'use client'

// 28 · CLIENTE › CUENTA CORRIENTE — PORTE LITERAL DE «28 · Cliente Cobranzas.dc.html».
//
//   cuerpo    `display:flex; alignItems:flex-start; gap:36px; padding:20px 24px 32px; flexWrap:wrap`
//   izquierda `flex:1; minWidth:600px`, bloques separados 24px
//   derecha   `width:376px; flexShrink:0`, bloques separados 26px
//
// A SANGRE, sin el aside de la ficha: el mockup 28 no dibuja Datos/Contactos/Actividad al costado
// —los dibuja el 26— y el panel del certificado ocupa esa columna. Meter los dos asides dejaría el
// contenido en 500px sobre una pantalla de 1280.
//
// EL FILTRO DE ANTIGÜEDAD ES DE LA PANTALLA, no de la URL: es una lectura de treinta segundos
// («¿qué hay en 31–60?») y no algo que alguien quiera compartir por link. Lo que sí viaja en la
// URL es la solapa, que es la dirección de esta cara.

import { useState } from 'react'
import type { ResultadoAccion } from '@/shared/components/ui/FormAccion'
import { C } from '../canon/tokens'
import { Vacio } from '../canon/Piezas'
import { useAlPedir } from '../canon/pedidos'
import { Antiguedad } from './Antiguedad'
import { Comportamiento } from './Comportamiento'
import { Metricas } from './Metricas'
import { PanelCertificado } from './PanelCertificado'
import { PlanDeCobranza } from './PlanDeCobranza'
import { Prevision } from './Prevision'
import { TablaCertificados } from './TablaCertificados'
import { bandaDe, planDeCobranza, type ClaveBanda } from '../../services/reglasCobranza'
import type { CertificadoCliente, CuentaCorriente as Cuenta } from '../../types/cobranzas'

export function CuentaCorriente({ cuenta, documentos, hoy, registrarCobro }: {
  cuenta: Cuenta | null
  documentos: CertificadoCliente[]
  /** El día de hoy en ISO, calculado en el servidor: el reloj del navegador del jefe de obra no
   *  puede decidir si un certificado está vencido. */
  hoy: string
  registrarCobro: (certificadoId: string, form: FormData) => Promise<ResultadoAccion>
}) {
  const [banda, setBanda] = useState<ClaveBanda | null>(null)
  // Arranca sobre lo primero del plan —lo trabado o lo más vencido—, que es el documento por el
  // que se abre esta pantalla. Sin plan, sobre el primero de la lista.
  const [elegido, setElegido] = useState<string | null>(
    () => planDeCobranza(documentos, hoy)[0]?.documento.id ?? documentos[0]?.id ?? null,
  )

  const [cobrando, setCobrando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const visibles = banda ? documentos.filter((d) => bandaDe(d.vence, hoy) === banda) : documentos
  const documento = documentos.find((d) => d.id === elegido) ?? null

  // LO QUE PIDE LA CABECERA. «Registrar cobro» vive arriba, al lado del nombre del cliente, y tiene
  // que abrir el formulario del panel SIN recargar la pantalla ni navegar a otra.
  useAlPedir((p) => {
    if (p === 'cobro') {
      const destino = documento ?? documentos.find((d) => d.estado !== 'cobrado') ?? null
      if (!destino) {
        setAviso('No hay ningún documento por cobrar de este cliente.')
        return
      }
      setAviso(null)
      setElegido(destino.id)
      setCobrando(true)
    } else if (p === 'exportar') {
      setAviso('«Exportar estado de cuenta» todavía no está conectado: lo aterriza back-28-32.')
    } else if (p === 'recordatorio') {
      setAviso('«Enviar recordatorio» manda un mail al cliente y su cola la trae back-28-32.')
    } else if (p === 'ver-como-cliente') {
      setAviso('El portal del cliente lo trae el frente portal-29-30.')
    }
  })

  return (
    <div
      data-testid="vista-cuenta-corriente"
      className="-mx-4 lg:-mx-10"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '36px', padding: '20px 24px 32px',
        flexWrap: 'wrap', background: C.lienzo,
      }}
    >
      <div style={{
        flex: 1, minWidth: 'min(600px, 100%)', display: 'flex', flexDirection: 'column', gap: '24px',
      }}>
        <Metricas cuenta={cuenta} />
        <Antiguedad documentos={documentos} hoy={hoy} filtro={banda} onFiltrar={setBanda} />
        <TablaCertificados
          documentos={visibles} hoy={hoy} elegido={elegido} onElegir={setElegido}
          filtrado={banda !== null}
        />
        <Prevision documentos={documentos} hoy={hoy} />
      </div>

      <div style={{
        width: '376px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '26px',
        maxWidth: '100%',
      }}>
        {aviso && (
          <div
            data-testid="cuenta-aviso"
            style={{ display: 'flex', gap: '8px', fontSize: '11.5px', color: C.warn, lineHeight: 1.45 }}
          >{aviso}</div>
        )}
        <PlanDeCobranza documentos={documentos} hoy={hoy} onElegir={(id) => { setElegido(id); setCobrando(false) }} />
        {documento
          ? (
            <PanelCertificado
              documento={documento} hoy={hoy} onCerrar={() => { setElegido(null); setCobrando(false) }}
              registrarCobro={registrarCobro.bind(null, documento.id)}
              cobrando={cobrando} onCobrando={setCobrando}
            />
          )
          : (
            <Vacio testid="panel-sin-documento">
              {documentos.length === 0
                ? 'Cuando haya certificados, acá se abre el que se esté gestionando.'
                : 'Elegí un documento de la lista para verlo y registrar su cobro.'}
            </Vacio>
          )}
        <Comportamiento documentos={documentos} />
      </div>
    </div>
  )
}
