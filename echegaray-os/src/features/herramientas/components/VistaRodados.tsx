// D11 · RODADOS Y MÁQUINAS CON OPERADOR — una fila por unidad con lo que hay: patente, dónde está,
// estado, qué lleva encima, quién lo movió por última vez (el «a cargo de» del diseño sale del último
// movimiento), km de la última lectura y la última verificación de uso (migración 20260922T1200).
//
// Los PAPELES ya están en la base (migración 20260922T2400, carpeta VEHÍCULOS de Drive): la columna dice
// RTO y seguro con su vencimiento, ámbar a 30 días y rojo vencido. El PLAN DE SERVICE sigue diciendo «sin
// cargar» porque no existe: un vencimiento de service inventado manda un camión a la ruta confiado en un
// dato que nadie cargó. Y un papel que no está tampoco se lee «al día»: dice «sin cargar».
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
import { CADUCAN, NOMBRE_PAPEL, cuantosVencen, estadoDePapel, papelDe, resumenDeUnidad } from '../logica/papeles'
import { NOMBRE_DISPONIBILIDAD, TONO_DISPONIBILIDAD, abiertos, disponibilidadDe, historialEventos, serviceEnKm, tallerDe } from '../logica/evento'
import { semaforo, vigenteDe } from '../logica/revision'
import type { Activo } from '../types'
import { COLOR_TONO, MONO, V, bajadaPagina, eyebrow, pagina, tituloPagina, vacio } from './estilo'

const COLS = 'minmax(0,1.3fr) minmax(0,1.2fr) 150px 110px 130px 100px 90px 190px 110px'

/** El color de cada estado de papel. `tenue` es lo que falta; `neg`, lo vencido. */
const COLOR_PAPEL = { ...COLOR_TONO, tenue: V.tenue, neg: V.neg }

const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`

export function VistaRodados({ parque, hoy = new Date() }: { parque: Parque; hoy?: Date }) {
  const orden = (a: Activo, b: Activo) => a.nombre.localeCompare(b.nombre, 'es')
  const rodados = parque.activos.filter((a) => a.clase === 'rodado' && vivo(a)).sort(orden)
  const sinUbic = rodados.filter((r) => !r.ubicacion_id).length
  const sv = sinVerificarHoy(parque, hoy)
  const svRod = sv ? rodados.filter((r) => verificacionDe(parque, r.id, hoy).tipo !== 'hoy').length : null
  // Los papeles del parque entero: `null` mientras la migración no esté, y entonces no se cuenta un cero.
  const porVencer = cuantosVencen(parque.papeles)
  // Disponibilidad: lo que hay que atender primero. `null` = el libro de vida todavía no está (no se cuenta un cero).
  const disp = (r: Activo) => disponibilidadDe(r, parque.eventos)
  const hayQueLlevar = parque.eventos == null ? null : rodados.filter((r) => disp(r) === 'hay_que_llevarlo').length
  const enMecanico = parque.eventos == null ? null : rodados.filter((r) => disp(r) === 'en_el_mecanico').length
  const fuera = rodados.filter((r) => disp(r) === 'fuera_de_servicio').length
  return (
    <div style={pagina} data-testid="rodados">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <h1 style={tituloPagina}>Rodados</h1>
        <div style={bajadaPagina}>
          {plural(rodados.length, 'unidad', 'unidades')}
          {svRod != null ? ` · ${svRod} sin verificar hoy` : ' · verificación sin la migración'}
          {sinUbic ? ` · ${sinUbic} sin ubicación cargada` : ''}
          {porVencer == null ? ' · papeles sin cargar' : porVencer ? ` · ${porVencer} ${porVencer === 1 ? 'papel vencido o por vencer' : 'papeles vencidos o por vencer'}` : ' · ningún papel por vencer'}
          {parque.eventos == null ? ' · libro de vida sin la migración' : ` · ${hayQueLlevar} hay que llevarlos · ${enMecanico} en el mecánico · ${fuera} fuera de servicio`}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', overflowX: 'auto' }}>
        <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: COLS, gap: 16, height: 34, alignItems: 'center', borderBottom: `1px solid ${V.linea}`, minWidth: 1200 }}>
          <div>Unidad</div><div>Dónde está</div><div>Disponibilidad</div><div>Lleva encima</div><div>Lo movió</div>
          <div style={{ textAlign: 'right' }}>Km</div><div>Service</div><div>Papeles</div><div style={{ textAlign: 'right' }}>Verificación</div>
        </div>
        {rodados.length === 0 && <div style={{ fontSize: '13.5px', color: V.apagado, padding: '16px 0' }}>Todavía no hay rodados cargados.</div>}
        {rodados.map((r, i) => {
          const u = ubicacionDelRodado(parque, r.id)
          const lleva = u ? activosEn(parque, u.id).length : 0
          const quien = quienLaMovio(parque, r.id)
          return (
            <Link key={r.id} href={`/herramientas/inventario?clase=rodado&activo=${encodeURIComponent(r.codigo)}`} prefetch={false} className="hover:bg-surface-quiet" data-testid="fila-rodado"
              style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, minHeight: 52, alignItems: 'center', borderBottom: i < rodados.length - 1 ? `1px solid ${V.linea}` : undefined, fontSize: '13.5px', minWidth: 1200 }}>
              <Unidad a={r} />
              <div style={r.ubicacion_id ? { color: V.tintaSuave } : vacio}>{rotuloUbicacion(parque, r.ubicacion_id)}</div>
              <Disponibilidad parque={parque} a={r} />
              <div style={lleva ? { color: V.tintaSuave } : { color: V.tenue }}>{lleva ? `${lleva} ${lleva === 1 ? 'activo' : 'activos'}` : 'nada'}</div>
              <div style={quien ? { color: V.tintaSuave } : vacio}>{quien ?? 'sin registro'}</div>
              <Lectura parque={parque} a={r} unidad="km" />
              <Service parque={parque} a={r} />
              <Papeles parque={parque} a={r} />
              <Verificacion parque={parque} a={r} hoy={hoy} />
            </Link>
          )
        })}
      </div>

      <div style={{ fontSize: '12.5px', color: V.apagado }}>
        Lo que pasa con cada unidad (taller, service, reparación) se carga desde su ficha o desde el teléfono. Un papel que no está queda «sin cargar», nunca «al día».
      </div>
    </div>
  )
}

/**
 * RTO Y SEGURO DE LA UNIDAD. Dos renglones, uno por papel, porque «RTO al día» y «seguro vencido» son dos
 * decisiones distintas y juntas en una línea se leen como una sola. La patente no se muestra acá: no la
 * tenemos en papel para ninguna unidad, y una tercera línea «sin cargar» en cada fila sólo hace ruido.
 */
function Papeles({ parque, a }: { parque: Parque; a: Activo }) {
  if (!parque.papeles) return <div style={vacio} data-testid="papeles">{resumenDeUnidad(parque.papeles, a.id)}</div>
  const filas = CADUCAN.filter((t) => t !== 'patente').map((t) => ({ t, p: papelDe(parque.papeles!, a.id, t) }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '12.5px' }} data-testid="papeles" title={resumenDeUnidad(parque.papeles, a.id)}>
      {filas.map(({ t, p }) => {
        const e = estadoDePapel(p)
        return (
          <div key={t} style={{ color: COLOR_PAPEL[e.tono], fontStyle: p ? undefined : 'italic' }}>
            <span style={{ color: V.tenue }}>{NOMBRE_PAPEL[t]}</span> {e.texto}
          </div>
        )
      })}
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

function Disponibilidad({ parque, a }: { parque: Parque; a: Activo }) {
  if (parque.eventos == null) return <Estado a={a} />
  const d = disponibilidadDe(a, parque.eventos)
  const tono = COLOR_PAPEL[TONO_DISPONIBILIDAD[d]]
  const ab = abiertos(parque.eventos, a.id)[0]
  const taller = ab ? tallerDe(ab, (id) => parque.proveedorPorId.get(id)?.nombre ?? null) : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }} data-testid="disponibilidad">
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: tono, fontWeight: d === 'disponible' ? 400 : 600 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: tono, flexShrink: 0 }} />
        {NOMBRE_DISPONIBILIDAD[d]}
      </div>
      {ab && <div style={{ fontSize: '12px', color: V.apagado }} className="truncate">{ab.descripcion}{taller ? ` · ${taller}` : ''}</div>}
    </div>
  )
}

/**
 * SERVICE: el próximo por fecha sale de los vencimientos (el mismo semáforo que la RTO) y el próximo por km
 * del último service registrado contra el último km conocido. Sin ninguno de los dos: «sin cargar», no un «al día».
 */
function Service({ parque, a }: { parque: Parque; a: Activo }) {
  if (parque.revisionesVigentes == null && parque.eventos == null) return <div style={vacio} data-testid="service">sin la migración</div>
  const porFecha = parque.revisionesVigentes ? vigenteDe(parque.revisionesVigentes, a.id, 'service') : null
  const s = porFecha ? semaforo(porFecha, new Date()) : null
  const l = ultimaLectura(parque, a.id)
  const k = parque.eventos ? serviceEnKm(historialEventos(parque.eventos, a.id), l?.valor ?? null) : null
  if (!s && !k) return <div style={vacio} data-testid="service">sin cargar</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '12.5px' }} data-testid="service">
      {s && <div style={{ color: COLOR_PAPEL[s.tono] }}>{s.texto}</div>}
      {k && <div style={{ color: COLOR_PAPEL[k.tono] }}>{k.faltan <= 0 ? `pasado ${numeroAr(-k.faltan)} km` : `faltan ${numeroAr(k.faltan)} km`}</div>}
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
