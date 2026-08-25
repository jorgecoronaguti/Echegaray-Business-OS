import type { HitoPortal, ObraPortal } from '../types'
import { P } from '../estilos'
import { diaMes, entero } from '@/shared/components/canon'
import { fechaCortaPortal, porcentajePortal } from '../formato'
import { DatoFranja, TituloBloque, VacioPortal } from './piezas'
import { IcoAlerta, IcoFoto, IcoFotoVacia, IcoHitos, IcoOk, IcoPendiente, IcoReloj } from './iconos'

// «MI OBRA» — `29`, líneas 384–517. Los cuatro números, los hitos y las fotos de avance.
//
// ═══ ES LA SOLAPA DEL CLIENTE, NO EL PANEL DEL JEFE ═══
//
// Acá no hay HH, ni costo, ni productividad, ni el nombre de nadie de la cuadrilla: hay avance
// físico contra plan, plazo, cuánta gente hay hoy y si el contrato cambió. Son las cuatro preguntas
// que un cliente hace por teléfono, y el mockup las eligió por eso.
//
// ═══ UN NÚMERO QUE NO EXISTE NO SE DIBUJA ═══
//
// El mockup tiene los cuatro cargados. Una obra real puede no tener plan (y entonces no hay «plan
// 31 %» ni desvío de plazo) o no llevar todavía el registro de adicionales. Cada tarjeta aparece
// sólo si su dato existe: un «0» de 26px en ADICIONALES afirma que no hubo cambios de contrato, y
// eso es una afirmación contractual que este código no puede hacer sin el dato.

const ESTADO_HITO: Record<HitoPortal['estado'], { color: string; icono: React.ReactNode }> = {
  terminado: { color: P.pos, icono: <IcoOk s={16} w={1.9} /> },
  atrasado: { color: P.warn, icono: <IcoAlerta s={16} w={1.9} /> },
  en_curso: { color: P.info, icono: <IcoReloj s={16} w={1.9} /> },
  sin_iniciar: { color: P.apagadoIcono, icono: <IcoPendiente /> },
}

function Kpi({ rotulo, valor, nota, tono }: {
  rotulo: string
  valor: string
  nota?: string | null
  tono?: string
}) {
  return (
    <DatoFranja rotulo={rotulo}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 1 }}>
        <span style={{
          fontFamily: "'IBM Plex Mono',monospace", fontSize: '26px', fontWeight: 600,
          color: tono ?? P.tinta, letterSpacing: '-.02em',
        }}>
          {valor}
        </span>
        {nota && <span style={{ fontSize: '11.5px', color: tono === P.warn ? P.warn : P.tenue }}>{nota}</span>}
      </div>
    </DatoFranja>
  )
}

function Hito({ h, ultimo }: { h: HitoPortal; ultimo: boolean }) {
  const e = ESTADO_HITO[h.estado]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
      borderBottom: ultimo ? undefined : `1px solid ${P.lineaBloque}`,
    }}>
      <span style={{ display: 'flex', color: e.color, flexShrink: 0 }}>{e.icono}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: '12.5px', color: h.estado === 'sin_iniciar' ? P.apagado : P.tinta,
        }}>
          {h.nombre}
        </div>
        {h.detalle && (
          <div style={{ fontSize: '11px', color: P.tenue, marginTop: 1 }}>{h.detalle}</div>
        )}
      </div>
      {h.fecha && (
        <span style={{
          fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', flexShrink: 0,
          color: h.estado === 'terminado' ? P.pos : h.estado === 'atrasado' ? P.warn
            : h.estado === 'en_curso' ? P.tintaSuave : P.tenue,
        }}>
          {diaMes(h.fecha)}
        </span>
      )}
    </div>
  )
}

export function SolapaObra({ obra }: { obra: ObraPortal }) {
  const desvio = obra.desvio_dias
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 44, flexWrap: 'wrap' }}>
        {obra.avance_pct !== null && (
          <Kpi
            rotulo="AVANCE FÍSICO"
            valor={porcentajePortal(obra.avance_pct) ?? ''}
            nota={obra.avance_plan_pct === null ? null : `plan ${porcentajePortal(obra.avance_plan_pct)}`}
          />
        )}
        {desvio !== null && (
          <Kpi
            rotulo="PLAZO"
            valor={desvio === 0 ? 'en fecha' : `${desvio > 0 ? '+' : '−'}${Math.abs(desvio)} d`}
            nota={desvio === 0 ? 'según el plan' : 'sobre el plan'}
            tono={desvio > 0 ? P.warn : P.tinta}
          />
        )}
        {obra.gente_hoy !== null && (
          <Kpi
            rotulo="GENTE EN OBRA HOY"
            valor={entero(obra.gente_hoy) ?? ''}
            nota={obra.gente_prevista === null ? null : `de ${entero(obra.gente_prevista)} previstas`}
          />
        )}
        {obra.adicionales !== null && (
          <Kpi
            rotulo="ADICIONALES"
            valor={entero(obra.adicionales) ?? ''}
            nota={obra.adicionales === 0 ? 'sin cambios de contrato' : 'aprobados'}
          />
        )}
      </div>

      <div>
        <TituloBloque icono={<IcoHitos />} titulo="Hitos" />
        {obra.hitos.length === 0
          ? <VacioPortal texto="Todavía no hay hitos publicados para esta obra." />
          : obra.hitos.map((h, i) => (
            <Hito key={h.id} h={h} ultimo={i === obra.hitos.length - 1} />
          ))}
      </div>

      <div>
        <TituloBloque
          icono={<IcoFoto />}
          titulo="Fotos de avance"
          nota={fechaCortaPortal(obra.fotos_al)}
          separacion={12}
        />
        {obra.fotos.length === 0 ? (
          <VacioPortal texto="Todavía no hay fotos publicadas." />
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))',
            gap: 12, marginTop: 14,
          }}>
            {obra.fotos.map((f) => (
              <div key={f.id}>
                <div style={{
                  height: 112, background: P.avatar, borderRadius: 8, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', color: P.apagadoIcono,
                  overflow: 'hidden',
                }}>
                  {f.url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={f.url} alt={f.titulo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <IcoFotoVacia />}
                </div>
                <div style={{ fontSize: '11.5px', color: P.tinta, marginTop: 7 }}>{f.titulo}</div>
                {f.detalle && (
                  <div style={{ fontSize: '10.5px', color: P.tenue, marginTop: 1 }}>{f.detalle}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
