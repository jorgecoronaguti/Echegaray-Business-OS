import { iniciales } from '@/shared/components/canon'
import type { AccesoPortal, ObraDelSelector } from '../types'
import type { SolapaPortal } from '../reglas/permisos'
import { P } from '../estilos'
import { Avatar } from './piezas'
import { IcoChevron } from './iconos'
import { SelectorObra } from './SelectorObra'

// LA CABECERA EN EL TELÉFONO — `30`, líneas 66–80 y 246–254.
//
// Un renglón de 44px con la marca y el avatar, y debajo el nombre de la obra a 17/600 con lo que se
// está mirando en 12px. NO se repite la barra del `29`: en 390px de ancho, «ECHEGARAY
// CONSTRUCCIONES · Portal de clientes · selector · avatar» no entra en una línea, y el mockup del
// teléfono efectivamente la reemplaza por esto.
//
// ═══ EL RENGLÓN DE 44px LLEVA LA MARCA, NO LA HORA ═══
//
// El mockup dibuja «9:41» ahí: es la barra de estado del sistema operativo, que en una web no es
// nuestra. Ese lugar queda para la marca, que en el `29` vive en la barra que acá desaparece — sin
// ella, la pantalla no dice de quién es.

const BAJADA: Record<SolapaPortal | 'consultas', string> = {
  obra: 'avance, hitos y fotos',
  pagos: 'esquema de pago propuesto',
  docs: 'facturas, recibos y certificados',
  consultas: 'sus consultas y nuestras respuestas',
}

export function CabeceraMovil({ acceso, obras, obra, solapa }: {
  acceso: AccesoPortal | null
  obras: ObraDelSelector[]
  obra: { obra_id: string; nombre: string } | null
  solapa: SolapaPortal | 'consultas'
}) {
  const quien = iniciales(acceso?.persona_contacto ?? acceso?.cliente_nombre ?? null)

  return (
    <div
      className="portal-movil"
      style={{ background: P.superficie, borderBottom: `1px solid ${P.linea}`, flexShrink: 0 }}
    >
      <div style={{
        height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/isotipo.png" alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
          <span style={{ fontSize: '9.5px', fontWeight: 600, color: P.tinta, letterSpacing: '.07em' }}>
            ECHEGARAY CONSTRUCCIONES
          </span>
        </span>
        <Avatar iniciales={quien} s={30} />
      </div>

      <div style={{ padding: '2px 20px 14px' }}>
        <SelectorObra
          obras={obras}
          actual={obra?.obra_id ?? null}
          estilo={{ gap: 8, minHeight: 40 }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: '17px', fontWeight: 600, color: P.tinta, letterSpacing: '-.01em',
            }}>
              {obra?.nombre ?? 'Su obra'}
            </div>
            <div style={{ fontSize: '12px', color: P.apagado, marginTop: 1 }}>{BAJADA[solapa]}</div>
          </div>
          {obras.length > 1 && (
            <span style={{ display: 'flex', color: P.tenue }}><IcoChevron s={18} /></span>
          )}
        </SelectorObra>
      </div>
    </div>
  )
}
