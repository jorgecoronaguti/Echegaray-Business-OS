import type { ReactNode } from 'react'
import type { DocumentoPortal } from '../types'
import { P } from '../estilos'
import { TituloBloque, VacioPortal } from './piezas'
import { IcoArchivo, IcoArchivoOk, IcoCarpeta, IcoDescargar, IcoEscudo, IcoFirmar, IcoOk, IcoPlano } from './iconos'

// «DOCUMENTOS DE LA OBRA» — `29`, líneas 519–589. Una lista, sin caja, con el icono por tipo.
//
// ═══ EL ICONO DICE QUÉ ES, NO ES DECORACIÓN ═══
//
// El mockup usa cinco dibujos distintos —contrato firmado, planos, plan de trabajos, póliza, acta
// por firmar— y el último lleva el botón amarillo «Firmar». Un cliente que entra a buscar el
// contrato lo encuentra por la forma antes que por el nombre.
//
// ═══ «FIRMAR» TODAVÍA NO FIRMA ═══
//
// El botón del mockup abre un circuito de firma que este OS no tiene: no hay proveedor de firma
// digital conectado ni tabla que la registre. Dibujar el botón igual sería un botón falso —el mismo
// defecto que «la pantalla más ancha que la base»—, así que un documento que requiere firma se
// muestra CON su advertencia en ámbar y sin botón. La advertencia es el dato; el botón sería la
// promesa.

const ICONO: Record<DocumentoPortal['tipo'], ReactNode> = {
  contrato: <IcoArchivoOk />,
  plano: <IcoPlano />,
  plan: <IcoArchivo />,
  poliza: <IcoEscudo />,
  acta: <IcoFirmar />,
  otro: <IcoArchivo />,
}

function Fila({ d, ultimo }: { d: DocumentoPortal; ultimo: boolean }) {
  const pendiente = d.requiere_firma && d.firmado !== true
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0',
      borderBottom: ultimo ? undefined : `1px solid ${P.lineaBloque}`,
    }}>
      <span style={{ display: 'flex', color: pendiente ? P.warn : P.apagado, flexShrink: 0 }}>
        {ICONO[d.tipo]}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '12.5px', color: P.tinta }}>{d.nombre}</div>
        {(d.detalle || pendiente) && (
          <div style={{ fontSize: '11px', color: pendiente ? P.warn : P.tenue, marginTop: 1 }}>
            {pendiente ? 'requiere su firma' : d.detalle}
          </div>
        )}
      </div>
      {d.firmado === true && (
        <span title="Firmado" style={{ display: 'flex', color: P.pos, flexShrink: 0 }}>
          <IcoOk s={15} w={1.9} />
        </span>
      )}
      {d.url && (
        <a
          href={d.url}
          title="Descargar"
          target="_blank"
          rel="noreferrer"
          style={{ display: 'flex', color: P.tenue, flexShrink: 0 }}
        >
          <IcoDescargar s={16} />
        </a>
      )}
    </div>
  )
}

export function SolapaDocumentos({ documentos }: { documentos: DocumentoPortal[] }) {
  return (
    <div>
      <TituloBloque
        icono={<IcoCarpeta />}
        titulo="Documentos de la obra"
        nota={documentos.length === 0 ? null : `${documentos.length} archivo${documentos.length === 1 ? '' : 's'}`}
      />
      {documentos.length === 0
        ? <VacioPortal texto="Todavía no hay documentos publicados para esta obra." />
        : documentos.map((d, i) => (
          <Fila key={d.id} d={d} ultimo={i === documentos.length - 1} />
        ))}
    </div>
  )
}
