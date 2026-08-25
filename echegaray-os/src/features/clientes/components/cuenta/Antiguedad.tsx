'use client'

// LA BARRA DE ANTIGÜEDAD Y SU LEYENDA (`28:112`–`28:171`).
//
//   barra    `height:30px; borderRadius:4px; overflow:hidden; gap:2px`
//   leyenda  cinco columnas `flex:1; minWidth:74px`, cuadradito de 7px con borde del color fuerte
//   tramo    con plata: fondo claro + número mono 11,5px/600 adentro; sin plata: sólo el fondo gris
//
// EL COLOR ES LA EDAD, no el importe: `#EFF5FF/#175CD3` lo que todavía no venció, `#FDE2DE/#B42318`
// el primer mes de mora, `#F7BFB8/#912018` el segundo. Los dos últimos tramos del ejemplo están
// vacíos y se dibujan igual, en `#F2F1ED` — que un tramo no aparezca no puede significar dos cosas.
//
// FILTRAR ES LA ACCIÓN DE ESTE BLOQUE: tocar un tramo deja abajo sólo los documentos de esa edad.
// El mockup lo insinúa con `cursor:pointer` en cada tramo y en cada ítem de la leyenda.

import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { TituloBloque } from '../canon/Piezas'
import { enMillones, montoM, diaMes } from '../../services/cobranzaFormato'
import { bandasAntiguedad, type ClaveBanda } from '../../services/reglasCobranza'
import type { CertificadoCliente } from '../../types/cobranzas'

/** Los tres colores de cada tramo, medidos en `28:121`–`28:129` y `28:133`–`28:168`. */
const COLOR: Record<ClaveBanda, { fondo: string; fuerte: string }> = {
  por_vencer: { fondo: C.cursoFondo, fuerte: C.curso },
  d1_30: { fondo: C.negSuave, fuerte: C.neg },
  d31_60: { fondo: C.negMedio, fuerte: C.negFuerte },
  d61_90: { fondo: '#F2F1ED', fuerte: C.bordeFuerte },
  d90: { fondo: '#F2F1ED', fuerte: C.bordeFuerte },
}

/** Un tramo vacío se dibuja gris SIEMPRE, aunque su color propio sea rojo. */
const colorDe = (clave: ClaveBanda, monto: number) =>
  monto > 0 ? COLOR[clave] : { fondo: '#F2F1ED', fuerte: C.bordeFuerte }

export function Antiguedad({ documentos, hoy, filtro, onFiltrar }: {
  documentos: CertificadoCliente[]
  hoy: string
  filtro: ClaveBanda | null
  onFiltrar: (b: ClaveBanda | null) => void
}) {
  const { bandas, sinVencimiento } = bandasAntiguedad(documentos, hoy)
  return (
    <div data-testid="antiguedad">
      <TituloBloque
        icono={<Ico d={P.barras} s={15} />}
        titulo="Antigüedad"
        derecha={<span style={{ fontSize: '11.5px', color: C.tenue }}>al {diaMes(hoy)}</span>}
      />

      <div style={{
        display: 'flex', gap: '2px', marginTop: '11px', height: '30px', borderRadius: '4px',
        overflow: 'hidden',
      }}>
        {bandas.map((b) => {
          const c = colorDe(b.clave, b.monto)
          const activo = filtro === b.clave
          return (
            <button
              key={b.clave} type="button"
              title={`${b.rotulo} · ${b.monto > 0 ? montoM(b.monto) : 'sin deuda'}`}
              onClick={() => onFiltrar(activo ? null : b.clave)}
              data-testid={`banda-${b.clave}`}
              style={{
                width: `${b.ancho}%`, background: c.fondo, display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', border: 'none', padding: 0,
                // La banda elegida se marca con su propio color fuerte adentro, sin cambiar el
                // ancho: mover la barra al filtrar haría perder la referencia de qué se filtró.
                boxShadow: activo ? `inset 0 -3px 0 ${c.fuerte}` : undefined,
              }}
            >
              {b.monto > 0 && (
                <span style={{ fontFamily: MONO, fontSize: '11.5px', fontWeight: 600, color: c.fuerte }}>
                  {enMillones(b.monto)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: '14px', marginTop: '9px' }}>
        {bandas.map((b) => {
          const c = colorDe(b.clave, b.monto)
          const hay = b.monto > 0
          return (
            <button
              key={b.clave} type="button" onClick={() => onFiltrar(filtro === b.clave ? null : b.clave)}
              data-testid={`leyenda-${b.clave}`}
              style={{
                flex: 1, minWidth: '74px', display: 'flex', alignItems: 'baseline', gap: '6px',
                cursor: 'pointer', background: 'none', border: 'none', padding: 0, textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              <span style={{
                width: '7px', height: '7px', borderRadius: '2px', background: c.fondo,
                border: `1px solid ${c.fuerte}`, flexShrink: 0,
              }} />
              <span>
                <span style={{
                  display: 'block', fontSize: '10.5px', whiteSpace: 'nowrap',
                  color: hay ? C.tintaMedia : C.tintaSuave,
                  fontWeight: filtro === b.clave ? 600 : 400,
                }}>{b.rotulo}</span>
                <span style={{
                  display: 'block', fontSize: '11px', whiteSpace: 'nowrap',
                  ...(hay ? { fontFamily: MONO, color: C.tenue } : { color: C.fantasmaFuerte }),
                }}>{hay ? montoM(b.monto) : 'sin deuda'}</span>
              </span>
            </button>
          )
        })}
      </div>

      {sinVencimiento > 0 && (
        // UN CONTROL QUE NO PUDO MIRAR NO DICE «NO HAY». Esta plata no entró en ninguna banda
        // porque su documento no tiene fecha de vencimiento; callarla la haría desaparecer de la
        // barra y del total sin que nadie se entere.
        <div
          data-testid="antiguedad-sin-vencimiento"
          style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '9px', fontSize: '11.5px', color: C.warn }}
        >
          <Ico d={P.alerta} s={13} w={2} />
          {montoM(sinVencimiento)} sin fecha de vencimiento: no entra en ninguna banda.
        </div>
      )}
    </div>
  )
}
