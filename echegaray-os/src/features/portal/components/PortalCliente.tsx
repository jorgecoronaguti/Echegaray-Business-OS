'use client'

import { useState } from 'react'
import type {
  CertificadoPortal, ConsultaPortal, DocumentoPortal, MiObra,
} from '../types'
import { seccionesVisibles, type SolapaPortal } from '../reglas/permisos'
import { aPagarAhora } from '../reglas/aPagar'
import { ANCHO_PANEL, MIN_COLUMNA, P } from '../estilos'
import { AvisoPortal } from './piezas'
import { HeaderPortal } from './HeaderPortal'
import { CabeceraObra } from './CabeceraObra'
import { CabeceraMovil } from './CabeceraMovil'
import { BarraInferiorMovil, type SolapaMovil } from './BarraInferiorMovil'
import { BarraContrato } from './BarraContrato'
import { CertificadoAprobar } from './CertificadoAprobar'
import { TablaCertificados } from './TablaCertificados'
import { SolapaObra } from './SolapaObra'
import { SolapaDocumentos } from './SolapaDocumentos'
import { PanelAPagar, type BloqueAbierto } from './PanelAPagar'
import { PagosMovil } from './PagosMovil'
import { ComprobantesMovil } from './ComprobantesMovil'
import { Consultas } from './Consultas'
import { Contactos } from './Contactos'

// EL PORTAL DEL CLIENTE — `29` a 1280 y `30` a 390, LA MISMA PANTALLA.
//
// ═══ POR QUÉ SE DIBUJAN LOS DOS ÁRBOLES Y LOS SEPARA EL CSS ═══
//
// El `29` y el `30` no son la misma composición encogida: el escritorio pone la tabla de
// certificados y una columna lateral de 336px; el teléfono pone un calendario de pagos y una barra
// de navegación abajo. Elegir cuál montar exige medir el ancho de la ventana, y eso sólo se sabe en
// el navegador: el HTML del servidor saldría con una composición y el primer render del cliente con
// otra —React descarta el árbol entero y la pantalla parpadea—.
//
// Entonces se emiten los dos y una media query apaga el que no corresponde (`portal.css`). El costo
// son unas decenas de nodos ocultos; la alternativa es un salto visible en cada carga.
//
// ═══ LA SOLAPA ES ESTADO LOCAL, NO UNA RUTA ═══
//
// Cambiar de «Mi obra» a «Certificados» no vuelve al servidor: los tres juegos de datos ya están
// acá. El dueño rechazó cuatro entregas diciendo «el sitio es lento»; un ida y vuelta al servidor
// para cambiar de solapa es exactamente eso.

export function PortalCliente({ miObra, certificados, documentos, consultas, hoy, avisos }: {
  miObra: MiObra | null
  certificados: CertificadoPortal[]
  documentos: DocumentoPortal[]
  consultas: ConsultaPortal[]
  /** El día en curso resuelto en el servidor, `YYYY-MM-DD`. */
  hoy: string
  /** Lo que NO se pudo leer, dicho con palabras. Nunca se reemplaza por una lista vacía. */
  avisos: string[]
}) {
  const secciones = seccionesVisibles(miObra?.acceso.permisos)
  const [solapa, setSolapa] = useState<SolapaMovil>(secciones.inicial)
  const [bloquePago, setBloquePago] = useState<BloqueAbierto>('no')

  const obra = miObra?.obra ?? null
  const corte = aPagarAhora(certificados, hoy)
  const paraAprobar = certificados.filter((c) => c.estado === 'emitido')
  const enEscritorio: SolapaPortal = solapa === 'consultas' ? 'pagos' : solapa

  const disponiblesMovil: SolapaMovil[] = [
    ...(secciones.obra ? (['obra'] as const) : []),
    ...(secciones.montos ? (['pagos'] as const) : []),
    'docs',
    'consultas',
  ]

  const panel = (
    <>
      <PanelAPagar
        corte={corte}
        cobro={miObra?.cobro ?? { cbu: null }}
        montos={secciones.montos}
        hoy={hoy}
        abierto={bloquePago}
        onAbrir={setBloquePago}
      />
      <Consultas consultas={consultas} obraId={obra?.obra_id ?? null} />
      <Contactos contactos={miObra?.contactos ?? []} />
    </>
  )

  return (
    <div
      className="portal-marco"
      data-testid="portal-cliente"
      style={{ minHeight: '100vh', background: P.fondo, display: 'flex', flexDirection: 'column' }}
    >
      <HeaderPortal
        acceso={miObra?.acceso ?? null}
        obras={miObra?.obras ?? []}
        obraActual={obra ? { obra_id: obra.obra_id, nombre: obra.nombre } : null}
      />
      <CabeceraMovil
        acceso={miObra?.acceso ?? null}
        obras={miObra?.obras ?? []}
        obra={obra ? { obra_id: obra.obra_id, nombre: obra.nombre } : null}
        solapa={solapa}
      />
      {obra && (
        <CabeceraObra
          obra={obra}
          secciones={secciones}
          solapa={enEscritorio}
          onSolapa={(s) => setSolapa(s)}
          aPagar={corte.total_vencido}
          paraAprobar={paraAprobar.length}
        />
      )}

      <div className="portal-cuerpo">
        <div
          className="portal-columna"
          style={{ flex: 1, minWidth: MIN_COLUMNA, display: 'flex', flexDirection: 'column', gap: 26 }}
        >
          {avisos.map((a) => <AvisoPortal key={a} texto={a} tono="atencion" />)}

          {/* ── EL `29` ─────────────────────────────────────────────────────────────────── */}
          <div className="portal-escritorio" style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
            {enEscritorio === 'pagos' && (
              <>
                {secciones.contrato && obra && <BarraContrato contrato={obra.contrato} />}
                {secciones.aprobacion && paraAprobar[0] && obra && (
                  <CertificadoAprobar
                    certificado={paraAprobar[0]}
                    contrato={obra.contrato}
                    avanceAcumulado={obra.avance_pct}
                    montos={secciones.montos}
                    hoy={hoy}
                  />
                )}
                <TablaCertificados
                  certificados={certificados}
                  hoy={hoy}
                  montos={secciones.montos}
                  onPagar={secciones.montos ? () => setBloquePago('pagar') : undefined}
                  nota={(miObra?.obras.length ?? 0) > 1 ? 'todas sus obras' : null}
                />
              </>
            )}
            {enEscritorio === 'obra' && obra && <SolapaObra obra={obra} />}
            {enEscritorio === 'docs' && <SolapaDocumentos documentos={documentos} />}
          </div>

          {/* ── EL `30` ─────────────────────────────────────────────────────────────────── */}
          <div className="portal-movil" style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            {solapa === 'obra' && obra && <SolapaObra obra={obra} />}
            {solapa === 'pagos' && obra && (
              <PagosMovil contrato={obra.contrato} certificados={certificados} hoy={hoy} />
            )}
            {solapa === 'docs' && (
              <ComprobantesMovil
                certificados={certificados}
                documentos={documentos}
                hoy={hoy}
                montos={secciones.montos}
              />
            )}
            {solapa === 'consultas' && (
              <Consultas consultas={consultas} obraId={obra?.obra_id ?? null} />
            )}
          </div>
        </div>

        <aside
          className="portal-panel portal-escritorio"
          style={{
            width: ANCHO_PANEL, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 26,
          }}
        >
          {panel}
        </aside>
      </div>

      <BarraInferiorMovil activa={solapa} disponibles={disponiblesMovil} onIr={setSolapa} />
    </div>
  )
}
