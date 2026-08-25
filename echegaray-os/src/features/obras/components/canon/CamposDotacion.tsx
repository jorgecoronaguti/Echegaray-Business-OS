'use client'

// 08 · LA TARJETA IZQUIERDA DEL CANÓNICO — el selector de frente, los tres modos y los tres campos.
//
// Sale de «08 · Obra Dotación y Proyección.dc.html» con sus medidas: modos de 44px con borde de
// 1,5px, campos de padding 12/0 separados por hairline #F1F0EC, rótulo de 12,5px con ícono de 15px,
// cifra mono de 19/600, pastilla «calculado» de 10px, y el control −/barra de 6px/+ con las cajas
// de 34px y el `+` en el amarillo de la marca.
//
// Vive aparte de `SimuladorDotacion.tsx` porque los dos juntos pasaban las 500 líneas del repo. Acá
// no hay estado: todo entra por props ya calculado, y las dos cuentas viven en `simulacionFrente.ts`.

import type { ReactNode } from 'react'
import { C, MONO } from './tokens'
import { Ico, P } from './Ico'
import { Hover } from './Piezas'
import {
  MODOS, notaDeOrigen, type EstadoSimulado, type ModoSimulacion,
} from '../../services/simulacionFrente'
import type { Frente } from '../../services/dotacion'

const n0 = (v: number | null) => (v == null ? null : Math.round(v).toLocaleString('es-AR'))

/** El canónico escribe el frente como un rótulo a la derecha de la cabecera («Columna de carga ·
 *  Eje 5–8»). Acá tiene que poder CAMBIARSE —el mockup dibuja una pantalla de un frente, la obra
 *  tiene varios— así que es un `select` con exactamente ese aspecto: mismo tamaño, mismo color,
 *  sin caja. Es la única desviación de forma de esta tarjeta. */
export function SelectorDeFrente({ frentes, clave, elegir }: {
  frentes: Frente[]; clave: string; elegir: (k: string) => void
}) {
  if (!frentes.length) return null
  return (
    <select
      value={clave} onChange={(e) => elegir(e.target.value)} data-testid="selector-frente"
      aria-label="Frente que se simula" title="Frente que se simula"
      style={{
        marginLeft: 'auto', fontSize: '11.5px', color: C.tintaSuave, fontFamily: 'inherit',
        background: 'transparent', border: 'none', cursor: 'pointer', maxWidth: '190px',
        textAlign: 'right', padding: 0,
      }}
    >
      {frentes.map((f) => (
        <option key={f.clave} value={f.clave}>
          {f.nombre} · {f.nActividades} {f.nActividades === 1 ? 'actividad' : 'actividades'}
        </option>
      ))}
    </select>
  )
}

/** Los tres botones de modo. `HH` no se puede elegir —`if (k !== 'hh')` en el canónico—: es el dato
 *  de base del que salen los otros dos, no una tercera manera de simular. */
export function Modos({ modo, elegir }: { modo: ModoSimulacion; elegir: (m: ModoSimulacion) => void }) {
  return (
    <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
      {MODOS.map((m) => {
        const activo = modo === m.id
        return (
          <button
            key={m.id} type="button" title={m.tip} data-modo={m.id} data-activo={activo || undefined}
            onClick={() => { if (m.id !== 'hh') elegir(m.id) }}
            disabled={m.id === 'hh'}
            style={{
              flex: 1, minHeight: '44px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '2px',
              border: `1.5px solid ${activo ? C.marca : C.borde}`,
              background: activo ? C.marcaSuave : (m.id === 'hh' ? C.tenueFondo : C.superficie),
              borderRadius: '10px', cursor: m.id === 'hh' ? 'default' : 'pointer', padding: '6px',
              fontFamily: 'inherit',
            }}
          >
            <span style={{
              fontSize: '12px', fontWeight: activo ? 600 : 400,
              color: m.id === 'hh' ? C.tintaSuave : C.tinta,
            }}
            >
              {m.rotulo}
            </span>
            <span style={{ fontSize: '10px', color: activo ? '#8A5A22' : C.tenue }}>{m.detalle}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Una fila de campo: rótulo con su ícono a la izquierda, cifra mono de 19/600 a la derecha, y
 *  debajo el control (cuando se edita) y la nota (cuando la hay). Es el bloque que el canónico
 *  repite tres veces con `sc-for`. */
function Campo({ icono, rotulo, valor, calculado, activo, valorNeg, control, nota }: {
  icono: ReactNode
  rotulo: string
  valor: string
  calculado: boolean
  activo: boolean
  valorNeg: boolean
  control?: ReactNode
  nota?: { texto: string; alerta: boolean; icono: ReactNode }
}) {
  const color = activo ? C.tinta : C.tintaSuave
  return (
    <div style={{ padding: '12px 0', borderBottom: `1px solid ${C.bordeFila}` }} data-campo={rotulo}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
          <span style={{ display: 'flex', color, flexShrink: 0 }}><Ico d={icono} s={15} /></span>
          <span style={{ fontSize: '12.5px', color }}>{rotulo}</span>
          {calculado && (
            <span style={{
              fontSize: '10px', color: C.tintaSuave, background: '#F2F1ED', borderRadius: '9px',
              padding: '1px 7px', flexShrink: 0,
            }}
            >
              calculado
            </span>
          )}
        </div>
        <span style={{
          fontFamily: MONO, fontSize: '19px', fontWeight: 600,
          color: valorNeg ? C.neg : C.tinta, whiteSpace: 'nowrap',
        }} data-valor={rotulo}
        >
          {valor}
        </span>
      </div>
      {control}
      {nota && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '7px', marginTop: '8px',
          fontSize: '11.5px', color: nota.alerta ? C.neg : C.tenue,
        }} data-nota={rotulo}
        >
          <span style={{ display: 'flex' }}><Ico d={nota.icono} s={13} /></span>
          {nota.texto}
        </div>
      )}
    </div>
  )
}

/** El control del canónico: `−` con borde, la barra de 6px con su marca de tope, y `+` en amarillo.
 *  La marca naranja del tope es lo único que dice dónde deja de servir empujar. */
function Control({ valor, escala, tope, menos, mas, rotulo }: {
  valor: number; escala: number; tope: number | null
  menos: () => void; mas: () => void; rotulo: string
}) {
  const caja = {
    width: '34px', height: '34px', borderRadius: '8px', display: 'flex', alignItems: 'center',
    justifyContent: 'center', cursor: 'pointer', flexShrink: 0, border: 'none',
    fontFamily: 'inherit', padding: 0,
  } as const
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '9px' }}>
      <Hover
        base={{ ...caja, border: `1px solid ${C.borde}`, color: C.tinta }}
        hover={{ background: C.tenueFondo }}
        role="button" tabIndex={0} aria-label={`Menos ${rotulo}`} title="Menos"
        onClick={menos} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') menos() }}
        data-accion={`menos-${rotulo}`}
      >
        <Ico d={P.menos} s={16} w={2.4} />
      </Hover>
      <div style={{ flex: 1, height: '6px', background: C.barraCanal, borderRadius: '3px', position: 'relative' }}>
        <div style={{
          height: '100%', width: `${Math.min(100, (valor / escala) * 100)}%`,
          background: C.grafito, borderRadius: '3px',
        }}
        />
        {tope != null && tope <= escala && (
          <div style={{
            position: 'absolute', top: '-4px', left: `${(tope / escala) * 100}%`,
            width: '1.5px', height: '14px', background: C.warn,
          }} data-testid="marca-tope"
          />
        )}
      </div>
      <Hover
        base={{ ...caja, background: C.marca, color: C.tinta }}
        hover={{ background: C.marcaHover }}
        role="button" tabIndex={0} aria-label={`Más ${rotulo}`} title="Más"
        onClick={mas} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') mas() }}
        data-accion={`mas-${rotulo}`}
      >
        <Ico d={P.mas} s={16} w={2.4} />
      </Hover>
    </div>
  )
}

export function Campos({ frente, estado, modo, escalaDot, escalaD, moverDotacion, moverDias }: {
  frente: Frente
  estado: EstadoSimulado
  modo: ModoSimulacion
  escalaDot: number
  escalaD: number
  moverDotacion: (v: number) => void
  moverDias: (v: number) => void
}) {
  const origen = notaDeOrigen(frente)
  const dotVisible = estado.dotacion
  return (
    <div style={{ marginTop: '16px' }}>
      <Campo
        icono={P.hh} rotulo="HH que faltan" activo={false} calculado={false}
        valorNeg={false}
        valor={frente.hhRestantes == null ? 'sin dato' : `${n0(frente.hhRestantes)} HH`}
        nota={{ ...origen, icono: origen.alerta ? P.alerta : P.material }}
      />
      <Campo
        icono={P.cuadrilla} rotulo="Dotación" activo={modo === 'dot'}
        calculado={estado.dotacionCalculada}
        valorNeg={estado.sobreTope}
        valor={dotVisible == null
          ? (estado.sinTrabajo ? 'no hace falta nadie' : 'no alcanza')
          : `${dotVisible} ${dotVisible === 1 ? 'persona' : 'personas'}`}
        control={modo !== 'dias'
          ? (
            <Control
              rotulo="dotación" valor={estado.dotacion ?? 0} escala={escalaDot} tope={frente.tope}
              menos={() => moverDotacion((estado.dotacion ?? 0) - 1)}
              mas={() => moverDotacion((estado.dotacion ?? 0) + 1)}
            />
            )
          : undefined}
        nota={estado.sobreTope
          ? {
            texto: `El frente tiene tope de ${frente.tope}: más gente no acelera`,
            alerta: true, icono: P.alerta,
          }
          : undefined}
      />
      <Campo
        icono={P.fecha} rotulo="Duración" activo={modo === 'dias'}
        calculado={estado.diasCalculada}
        valorNeg={false}
        valor={estado.sinTrabajo
          ? 'terminado'
          : (estado.dias == null ? 'sin plan' : `${estado.dias} ${estado.dias === 1 ? 'día' : 'días'}`)}
        control={modo === 'dias'
          ? (
            <Control
              rotulo="duración" valor={estado.dias ?? 0} escala={escalaD} tope={null}
              menos={() => moverDias((estado.dias ?? 1) - 1)}
              mas={() => moverDias((estado.dias ?? 1) + 1)}
            />
            )
          : undefined}
        nota={notaDuracion(frente, estado)}
      />
    </div>
  )
}

/** Las dos maneras en que una duración fijada no se puede cumplir: la gente no entra en el frente,
 *  o los días pedidos son todos técnicos y no hay gente que los comprima. */
function notaDuracion(frente: Frente, estado: EstadoSimulado) {
  if (estado.sinTrabajo) return undefined
  if (estado.imposiblePorTecnicos) {
    return {
      texto: `${frente.diasTecnicos} de esos días son técnicos: ninguna dotación baja de ahí`,
      alerta: true, icono: P.alerta,
    }
  }
  if (estado.dotacionCalculada && estado.sobreTope && estado.dotacion != null) {
    return {
      texto: `Para ese plazo hacen falta ${estado.dotacion}: no entran en el frente`,
      alerta: true, icono: P.alerta,
    }
  }
  if (frente.diasTecnicos > 0 && estado.dias != null) {
    return {
      texto: `${frente.diasTecnicos} días técnicos no se comprimen con más gente`,
      alerta: false, icono: P.material,
    }
  }
  return undefined
}
