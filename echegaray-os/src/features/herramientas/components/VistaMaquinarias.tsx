// MAQUINARIAS — las máquinas con operador (clase «equipo»), en su propia solapa.
//
// Dueño, 22/09/2026: *«en el medio de esas dos categoria crear la cateogria "maquinarias" y ponerlas ahi,
// sacandolas de "rodados"»*. Eran un bloque debajo de Rodados; ahora tienen entrada propia entre
// Mantenimiento y Rodados. Mismas columnas que tenían: no se inventa ningún dato nuevo.

import Link from 'next/link'
import {
  ETIQUETA_ESTADO_CORTA, TONO_ESTADO, quienLaMovio, rotuloUbicacion, vivo, type Parque,
} from '../logica/parque'
import { numeroAr, sinVerificarHoy, textoLectura, textoVerificacion, ultimaLectura, verificacionDe } from '../logica/verificacion'
import type { Activo } from '../types'
import { COLOR_TONO, MONO, V, bajadaPagina, eyebrow, pagina, tituloPagina, vacio } from './estilo'

const COLS_EQ = 'minmax(0,1.3fr) minmax(0,1.2fr) 150px 130px 100px 110px'
const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`

export function VistaMaquinarias({ parque, hoy = new Date() }: { parque: Parque; hoy?: Date }) {
  const equipos = parque.activos.filter((a) => a.clase === 'equipo' && vivo(a))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const sv = sinVerificarHoy(parque, hoy)
  const sinVer = sv ? equipos.filter((e) => verificacionDe(parque, e.id, hoy).tipo !== 'hoy').length : null
  return (
    <div style={pagina} data-testid="maquinarias">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <h1 style={tituloPagina}>Maquinarias</h1>
        <div style={bajadaPagina}>
          {plural(equipos.length, 'equipo', 'equipos')}
          {sinVer != null ? ` · ${sinVer} sin verificar hoy` : ' · verificación sin la migración'}
        </div>
      </div>

      {equipos.length === 0 ? (
        <div style={{ fontSize: '13px', color: V.apagado }}>No hay equipos cargados: lo que se opera con gente se da de alta con clase «Equipo».</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', overflowX: 'auto' }}>
          <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: COLS_EQ, gap: 16, height: 34, alignItems: 'center', borderBottom: `1px solid ${V.linea}`, minWidth: 860 }}>
            <div>Equipo</div><div>Dónde está</div><div>Estado</div><div>Lo movió</div>
            <div style={{ textAlign: 'right' }}>Horómetro</div><div style={{ textAlign: 'right' }}>Verificación</div>
          </div>
          {equipos.map((e, i) => {
            const quien = quienLaMovio(parque, e.id)
            return (
              <Link key={e.id} href={`/herramientas/inventario?clase=equipo&activo=${encodeURIComponent(e.codigo)}`} prefetch={false} className="hover:bg-surface-quiet" data-testid="fila-equipo"
                style={{ display: 'grid', gridTemplateColumns: COLS_EQ, gap: 16, minHeight: 52, alignItems: 'center', borderBottom: i < equipos.length - 1 ? `1px solid ${V.linea}` : undefined, fontSize: '13.5px', minWidth: 860 }}>
                <Unidad a={e} />
                <div style={e.ubicacion_id ? { color: V.tintaSuave } : vacio}>{rotuloUbicacion(parque, e.ubicacion_id)}</div>
                <Estado a={e} />
                <div style={quien ? { color: V.tintaSuave } : vacio}>{quien ?? 'sin registro'}</div>
                <Lectura parque={parque} a={e} unidad="h" />
                <Verificacion parque={parque} a={e} hoy={hoy} />
              </Link>
            )
          })}
        </div>
      )}

      <div style={{ fontSize: '12.5px', color: V.apagado }}>
        La verificación la carga desde el teléfono quien opera, antes de arrancar. Sin verificar no traba el uso: se ve acá.
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
  const tono = TONO_ESTADO[a.estado] ?? 'neutro'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: tono === 'neutro' ? V.tintaSuave : COLOR_TONO[tono] }}>
      {ETIQUETA_ESTADO_CORTA[a.estado] ?? a.estado}
    </div>
  )
}

function Lectura({ parque, a, unidad }: { parque: Parque; a: Activo; unidad: 'km' | 'h' }) {
  if (!parque.lecturas) return <div style={{ ...vacio, textAlign: 'right' }}>sin la migración</div>
  const l = ultimaLectura(parque, a.id)
  const t = !l ? textoLectura(l, unidad) : unidad === 'km' ? numeroAr(l.valor) : textoLectura(l, unidad)
  return <div style={l ? { textAlign: 'right', color: V.tinta } : { ...vacio, textAlign: 'right' }} data-testid="lectura">{t}</div>
}

function Verificacion({ parque, a, hoy }: { parque: Parque; a: Activo; hoy: Date }) {
  const v = verificacionDe(parque, a.id, hoy)
  return <div style={{ textAlign: 'right', color: v.tipo === 'hoy' ? COLOR_TONO.pos : v.tipo === 'nunca' ? V.tenue : V.tintaSuave }}>{textoVerificacion(v)}</div>
}
