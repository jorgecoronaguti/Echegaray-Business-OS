import type { ReactNode } from 'react'
import type { ObraPortal } from '../types'
import type { SeccionesPortal, SolapaPortal } from '../reglas/permisos'
import { P, SUBRAYADO_SOLAPA } from '../estilos'
import { fechaCortaPortal, millonesPortal, porcentajePortal } from '../formato'
import { BarraPortal, DatoFranja } from './piezas'
import { IcoCarpeta, IcoFechas, IcoObra, IcoPago, IcoUbicacion } from './iconos'

// LA CABECERA DE OBRA DEL PORTAL — `29`, líneas 41–85.
//
// Nombre a 22/600, la línea de ubicación y plazo a 12px, y a la derecha los dos números que el
// cliente vino a ver: AVANCE (barra de 118×5 + porcentaje mono a 20/600) y A PAGAR en #B42318.
//
// ═══ LOS DOS NÚMEROS SON DE DUEÑOS DISTINTOS ═══
//
// El avance lo publica la obra; el A PAGAR sale de los certificados vencidos y sin cobrar
// (`reglas/aPagar.ts`). Cada uno aparece SÓLO si su permiso está: un acceso sin `puede_ver_montos`
// no ve el A PAGAR, y no ve un «—» en su lugar. Sin `puede_ver_obra` no ve el avance ni la solapa
// «Mi obra».
//
// ═══ NULL NO ES 0 % ═══
//
// Una obra sin avance publicado dibuja la pista vacía y escribe «sin publicar». Un `0 %` de 20px en
// grande le dice al cliente que en su obra no se hizo nada.

const ROTULO: Record<SolapaPortal, string> = {
  obra: 'Mi obra',
  pagos: 'Certificados y pagos',
  docs: 'Documentos',
}

const ICONO: Record<SolapaPortal, ReactNode> = {
  obra: <IcoObra />,
  pagos: <IcoPago />,
  docs: <IcoCarpeta />,
}

function Solapa({ clave, activa, cuenta, onClick }: {
  clave: SolapaPortal
  activa: boolean
  /** El contador amarillo. `null` = no se dibuja (el mockup sólo lo pone cuando hay algo que hacer). */
  cuenta: number | null
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activa ? 'page' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, fontSize: '13px', padding: '9px 12px',
        color: activa ? P.tinta : P.apagado, fontWeight: activa ? 600 : 400,
        boxShadow: activa ? SUBRAYADO_SOLAPA : 'none', cursor: 'pointer',
        background: 'none', border: 'none', fontFamily: 'inherit',
      }}
    >
      {ICONO[clave]}
      {ROTULO[clave]}
      {cuenta !== null && cuenta > 0 && (
        <span style={{
          fontFamily: "'IBM Plex Mono',monospace", fontSize: '10px', fontWeight: 600, color: P.tinta,
          background: P.seleccion, border: `1px solid ${P.marcaBorde}`, borderRadius: 9, padding: '0 5px',
        }}>
          {cuenta}
        </span>
      )}
    </button>
  )
}

export function CabeceraObra({ obra, secciones, solapa, onSolapa, aPagar, paraAprobar }: {
  obra: ObraPortal
  secciones: SeccionesPortal
  solapa: SolapaPortal
  onSolapa: (s: SolapaPortal) => void
  /** El total vencido y sin cobrar. `null` = no se pudo calcular. */
  aPagar: number | null
  /** Cuántos certificados esperan la aprobación de este cliente. */
  paraAprobar: number
}) {
  const desde = fechaCortaPortal(obra.fecha_inicio)
  const hasta = fechaCortaPortal(obra.fecha_fin)

  return (
    <div
      className="portal-escritorio"
      style={{
        background: P.superficie, borderBottom: `1px solid ${P.linea}`,
        padding: '14px 24px 0', flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '22px', fontWeight: 600, color: P.tinta, letterSpacing: '-.015em' }}>
            {obra.nombre}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, fontSize: '12px', color: P.apagado,
            marginTop: 4, flexWrap: 'wrap',
          }}>
            {obra.ubicacion && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <IcoUbicacion />{obra.ubicacion}
              </span>
            )}
            {(desde || hasta) && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <IcoFechas />{[desde, hasta].filter(Boolean).join(' – ')}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 34, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {secciones.obra && (
            <DatoFranja rotulo="AVANCE">
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 4 }}>
                <BarraPortal pct={obra.avance_pct} ancho={118} />
                <span style={{
                  fontFamily: "'IBM Plex Mono',monospace", fontSize: '20px', fontWeight: 600,
                  color: obra.avance_pct === null ? P.tenue : P.tinta, letterSpacing: '-.01em',
                }}>
                  {porcentajePortal(obra.avance_pct) ?? 'sin publicar'}
                </span>
              </div>
            </DatoFranja>
          )}
          {secciones.montos && aPagar !== null && (
            <DatoFranja rotulo="A PAGAR">
              <div style={{
                fontFamily: "'IBM Plex Mono',monospace", fontSize: '20px', fontWeight: 600,
                color: aPagar > 0 ? P.neg : P.pos, marginTop: 2, letterSpacing: '-.01em',
              }}>
                {millonesPortal(aPagar)}
              </div>
            </DatoFranja>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch', marginTop: 13 }}>
        {secciones.solapas.map((s) => (
          <Solapa
            key={s}
            clave={s}
            activa={s === solapa}
            cuenta={s === 'pagos' && secciones.aprobacion ? paraAprobar : null}
            onClick={() => onSolapa(s)}
          />
        ))}
      </div>
    </div>
  )
}
