// D11 · RODADOS Y MÁQUINAS CON OPERADOR — una fila por unidad con lo que hay: patente, dónde está,
// estado, qué lleva encima, quién lo movió por última vez (el «a cargo de» del diseño sale del último
// movimiento), km de la última lectura y la última verificación de uso (migración 20260922T1200).
//
// Papeles y plan de service NO existen todavía en la base: se dicen «sin cargar», nunca un número.
//
// Las máquinas con operador se fueron a su propia solapa, «Maquinarias», por pedido del dueño (22/09/2026):
// *«en el medio de esas dos categoria crear la cateogria "maquinarias" y ponerlas ahi, sacandolas de
// "rodados"»*. Acá quedan sólo las unidades que se manejan. Todos los rodados piden verificación: la base no
// sabe cuál es un acoplado que no se maneja, y no se inventa ese dato.

import Link from 'next/link'
import {
  ETIQUETA_ESTADO_CORTA, TONO_ESTADO, activosEn, quienLaMovio, rotuloUbicacion, ubicacionDelRodado, vivo, type Parque,
} from '../logica/parque'
import { numeroAr, sinVerificarHoy, textoLectura, textoVerificacion, ultimaLectura, verificacionDe } from '../logica/verificacion'
import type { Activo } from '../types'
import { COLOR_TONO, MONO, V, bajadaPagina, eyebrow, pagina, tituloPagina, vacio } from './estilo'

const COLS = 'minmax(0,1.3fr) minmax(0,1.2fr) 150px 110px 130px 100px 90px 90px 110px'

const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`

export function VistaRodados({ parque, hoy = new Date() }: { parque: Parque; hoy?: Date }) {
  const orden = (a: Activo, b: Activo) => a.nombre.localeCompare(b.nombre, 'es')
  const rodados = parque.activos.filter((a) => a.clase === 'rodado' && vivo(a)).sort(orden)
  const sinUbic = rodados.filter((r) => !r.ubicacion_id).length
  const sv = sinVerificarHoy(parque, hoy)
  const svRod = sv ? rodados.filter((r) => verificacionDe(parque, r.id, hoy).tipo !== 'hoy').length : null
  return (
    <div style={pagina} data-testid="rodados">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <h1 style={tituloPagina}>Rodados</h1>
        <div style={bajadaPagina}>
          {plural(rodados.length, 'unidad', 'unidades')}
          {svRod != null ? ` · ${svRod} sin verificar hoy` : ' · verificación sin la migración'}
          {sinUbic ? ` · ${sinUbic} sin ubicación cargada` : ''} · papeles y service sin cargar
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', overflowX: 'auto' }}>
        <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: COLS, gap: 16, height: 34, alignItems: 'center', borderBottom: `1px solid ${V.linea}`, minWidth: 1100 }}>
          <div>Unidad</div><div>Dónde está</div><div>Estado</div><div>Lleva encima</div><div>Lo movió</div>
          <div style={{ textAlign: 'right' }}>Km</div><div>Service</div><div>Papeles</div><div style={{ textAlign: 'right' }}>Verificación</div>
        </div>
        {rodados.length === 0 && <div style={{ fontSize: '13.5px', color: V.apagado, padding: '16px 0' }}>Todavía no hay rodados cargados.</div>}
        {rodados.map((r, i) => {
          const u = ubicacionDelRodado(parque, r.id)
          const lleva = u ? activosEn(parque, u.id).length : 0
          const quien = quienLaMovio(parque, r.id)
          return (
            <Link key={r.id} href={`/herramientas/inventario?clase=rodado&activo=${encodeURIComponent(r.codigo)}`} prefetch={false} className="hover:bg-surface-quiet" data-testid="fila-rodado"
              style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, minHeight: 52, alignItems: 'center', borderBottom: i < rodados.length - 1 ? `1px solid ${V.linea}` : undefined, fontSize: '13.5px', minWidth: 1100 }}>
              <Unidad a={r} />
              <div style={r.ubicacion_id ? { color: V.tintaSuave } : vacio}>{rotuloUbicacion(parque, r.ubicacion_id)}</div>
              <Estado a={r} />
              <div style={lleva ? { color: V.tintaSuave } : { color: V.tenue }}>{lleva ? `${lleva} ${lleva === 1 ? 'activo' : 'activos'}` : 'nada'}</div>
              <div style={quien ? { color: V.tintaSuave } : vacio}>{quien ?? 'sin registro'}</div>
              <Lectura parque={parque} a={r} unidad="km" />
              <div style={vacio}>sin cargar</div>
              <div style={vacio}>sin cargar</div>
              <Verificacion parque={parque} a={r} hoy={hoy} />
            </Link>
          )
        })}
      </div>

      <div style={{ fontSize: '12.5px', color: V.apagado }}>
        La verificación la carga desde el teléfono quien maneja, antes de salir. Sin verificar no traba el uso: se ve acá. Papeles y plan de service se cargan en la próxima etapa: hasta entonces no se muestra ningún número.
      </div>
    </div>
  )
}

function Unidad({ a }: { a: Activo }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
      <span style={{ fontWeight: 500 }}>{a.nombre}</span>
      <span style={{ fontFamily: MONO, fontSize: '11px', color: V.tenue }}>{a.patente ?? a.codigo}</span>
    </div>
  )
}

function Estado({ a }: { a: Activo }) {
  const tono = COLOR_TONO[TONO_ESTADO[a.estado]]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: tono }}>
      {a.estado !== 'fuera_servicio' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: tono, flexShrink: 0 }} />}
      {ETIQUETA_ESTADO_CORTA[a.estado]}{a.estado_asumido ? <span style={{ color: V.tenue, fontSize: '11.5px' }}> · asumido</span> : null}
    </div>
  )
}

function Lectura({ parque, a, unidad }: { parque: Parque; a: Activo; unidad: 'km' | 'h' }) {
  if (!parque.lecturas) return <div style={{ ...vacio, textAlign: 'right' }}>sin la migración</div>
  const l = ultimaLectura(parque, a.id)
  // D11 escribe el km sin unidad («148.220») y las horas con ella («412 h»).
  const t = !l ? textoLectura(l, unidad) : unidad === 'km' ? numeroAr(l.valor) : textoLectura(l, unidad)
  return <div style={l ? { textAlign: 'right', color: V.tinta } : { ...vacio, textAlign: 'right' }} data-testid="lectura">{t}</div>
}

function Verificacion({ parque, a, hoy }: { parque: Parque; a: Activo; hoy: Date }) {
  const v = verificacionDe(parque, a.id, hoy)
  const estilo = v.tipo === 'nunca' || v.tipo === 'sin_base'
    ? { ...vacio, textAlign: 'right' as const }
    : { textAlign: 'right' as const, color: v.tipo === 'hoy' ? V.tinta : v.tipo === 'dias' && v.n > 3 ? V.warn : V.tintaSuave }
  return <div style={estilo} data-testid="verificacion">{textoVerificacion(v)}</div>
}
