import type { ReactNode } from 'react'
import { diaMes } from '@/shared/components/canon'
import type { CertificadoPortal } from '../types'
import { COLS_CERTIFICADOS, P } from '../estilos'
import { estadoEnPantalla, type ClaveEstado } from '../reglas/estado'
import { millonesPortal } from '../formato'
import { TituloBloque, VacioPortal } from './piezas'
import { IcoAlerta, IcoConsulta, IcoDescargar, IcoDocumento, IcoOk, IcoParaAprobar, IcoReloj } from './iconos'

// «CERTIFICADOS Y FACTURAS» — `29`, líneas 239–380. La tabla SIN caja: hairline arriba y divisores
// de fila, que es como el mockup la dibuja cuando no está adentro de una tarjeta.
//
// Cinco columnas: DOCUMENTO · VENCE · MONTO · ESTADO · acciones. El estado y la nota de la fecha los
// decide `reglas/estado.ts`, con test; acá se elige el icono y el color.
//
// ═══ «PAGAR» SÓLO DONDE HAY ALGO QUE PAGAR ═══
//
// El mockup pone el botón amarillo en las tres filas con deuda y NO lo pone en la que espera
// aprobación, en la que está en revisión ni en la pagada. Un botón que no corresponde no es
// inofensivo: invita a pagar un certificado que el cliente todavía no aprobó.

const TONO: Record<ClaveEstado, string> = {
  pagado: P.pos,
  para_aprobar: P.warn,
  en_revision: P.warn,
  vencido: P.neg,
  a_vencer: P.info,
  sin_fecha: P.tenue,
}

const ICONO: Record<ClaveEstado, ReactNode> = {
  pagado: <IcoOk />,
  para_aprobar: <IcoParaAprobar s={14} w={2} />,
  en_revision: <IcoConsulta s={14} w={2} />,
  vencido: <IcoAlerta />,
  a_vencer: <IcoReloj />,
  sin_fecha: <IcoReloj />,
}

const grilla = (extra?: React.CSSProperties): React.CSSProperties => ({
  display: 'grid', gridTemplateColumns: COLS_CERTIFICADOS, gap: 12, alignItems: 'center',
  minHeight: 50, borderBottom: `1px solid ${P.lineaBloque}`, ...extra,
})

const rotulo = (derecha = false): React.CSSProperties => ({
  fontSize: '9.5px', color: P.tenue, letterSpacing: '.05em', paddingBottom: 7,
  textAlign: derecha ? 'right' : undefined,
})

function BotonDescargar({ url, titulo }: { url: string; titulo: string }) {
  return (
    <a
      href={url}
      title={titulo}
      target="_blank"
      rel="noreferrer"
      style={{
        width: 30, height: 30, borderRadius: 6, border: `1px solid ${P.linea}`, display: 'flex',
        alignItems: 'center', justifyContent: 'center', color: P.apagado, flexShrink: 0,
      }}
    >
      <IcoDescargar />
    </a>
  )
}

function Fila({ c, hoy, montos, onPagar }: {
  c: CertificadoPortal
  hoy: string
  montos: boolean
  onPagar?: (c: CertificadoPortal) => void
}) {
  const e = estadoEnPantalla(c, hoy)
  const apagada = e.clave === 'pagado'
  const fecha = e.muestra_fecha ? diaMes(c.vence) : null
  const sePaga = montos && onPagar && (e.clave === 'vencido' || e.clave === 'a_vencer')
  const periodo = [diaMes(c.periodo_desde), diaMes(c.periodo_hasta)].filter(Boolean).join(' – ')

  return (
    <div style={grilla()}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '12.5px', color: apagada ? P.apagado : P.tinta }}>
          {c.numero}{c.factura && ` · ${c.factura}`}
        </div>
        <div style={{ fontSize: '11px', color: P.tenue, marginTop: 1 }}>
          {[c.obra_nombre, periodo, c.estado === 'observado' ? 'observado por usted' : null]
            .filter(Boolean).join(' · ')}
        </div>
      </div>

      <div>
        {fecha && (
          <div style={{
            fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px',
            color: apagada ? P.apagado : P.tinta,
          }}>
            {fecha}
          </div>
        )}
        {e.nota && (
          <div style={{
            fontFamily: fecha ? "'IBM Plex Mono',monospace" : 'inherit',
            fontSize: fecha ? '11px' : '11.5px',
            color: e.clave === 'vencido' ? P.neg : e.clave === 'pagado' ? P.pos
              : e.clave === 'para_aprobar' ? P.warn : P.tenue,
            marginTop: fecha ? 1 : 0,
          }}>
            {e.nota}
          </div>
        )}
      </div>

      {montos ? (
        <span style={{
          fontFamily: "'IBM Plex Mono',monospace", fontSize: '12.5px',
          color: apagada ? P.apagado : P.tinta, textAlign: 'right',
        }}>
          {millonesPortal(c.monto)}
        </span>
      ) : <span />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: TONO[e.clave] }}>
        {ICONO[e.clave]}
        <span style={{ fontSize: '11.5px', color: apagada ? P.apagado : P.tintaSuave }}>{e.rotulo}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end' }}>
        {sePaga && (
          <button
            type="button"
            onClick={() => onPagar(c)}
            style={{
              fontSize: '11.5px', fontWeight: 600, color: P.tinta, background: P.marca,
              borderRadius: 6, padding: '6px 12px', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Pagar
          </button>
        )}
        {/* Sin archivo no hay botón: un botón de descarga que no descarga es un botón falso. */}
        {c.pdf_url && <BotonDescargar url={c.pdf_url} titulo={`Descargar ${c.numero}`} />}
      </div>
    </div>
  )
}

export function TablaCertificados({ certificados, hoy, montos, onPagar, nota }: {
  certificados: CertificadoPortal[]
  hoy: string
  montos: boolean
  /** Qué hace «Pagar». Sin él, la columna no dibuja el botón. */
  onPagar?: (c: CertificadoPortal) => void
  nota?: string | null
}) {
  return (
    <div>
      <TituloBloque icono={<IcoDocumento />} titulo="Certificados y facturas" nota={nota ?? null} separacion={2} linea={false} />

      {certificados.length === 0 ? (
        <VacioPortal texto="Todavía no hay certificados emitidos para su obra." />
      ) : (
        <>
          <div style={{
            display: 'grid', gridTemplateColumns: COLS_CERTIFICADOS, gap: 12, alignItems: 'end',
            height: 30, borderBottom: `1px solid ${P.linea}`,
          }}>
            <span style={rotulo()}>DOCUMENTO</span>
            <span style={rotulo()}>VENCE</span>
            <span style={rotulo(true)}>{montos ? 'MONTO' : ''}</span>
            <span style={rotulo()}>ESTADO</span>
            <span style={{ paddingBottom: 7 }} />
          </div>
          {certificados.map((c) => (
            <Fila key={c.id} c={c} hoy={hoy} montos={montos} onPagar={onPagar} />
          ))}
        </>
      )}
    </div>
  )
}
