'use client'

// LA TABLA DE TAREAS — porte de «04 · Obra · Trabajo · Tareas» (1440) del diseño «De cero al final».
//
//   columnas   Actividad · Medición · Avance · Estado · HH · Responsable
//   rubro      44px sobre `tenueFondo`, «1» mono faint + nombre 11,5/600 uppercase .06em; Medición
//              «resumen» faint; Avance «91%»; HH la suma de lo que cuelga («sin HH» faint)
//   sector     30px, 11,5 muted: la cadena de contenedores entre el rubro y la tarea (épica · historia)
//   tarea      52px (58 con bajada), código «1.01» mono faint + nombre 13,5; «· tiempo técnico» 11,5
//              Medición: Cantidad · Partes · Pasos · «Manual» warn · «sin método» warn/600
//              Avance: «81% 890/1.100» · «30% declarado» warn · «no se puede medir» faint
//              Estado: Hecha verde · En curso azul · Bloqueada roja/600 · Pendiente tinta
//              la fila abierta con filete amarillo de 3px a la izquierda; la sin método, filete rojo
//   pie        «Rubro › Sector › Ítem › Parte diario · N ítems en M rubros · X sin fecha · Y sin método
//              de medición.» — «N ítems» lleva a la vista de Ítems ponderados (04b, `?vista=items`).

import Link from 'next/link'
import { C, MONO } from '../canon/tokens'
import type { FilaItem } from './filasDeItems'

export const COLS_TAREAS = 'minmax(0,1fr) 110px 150px 110px 64px 120px'

const pct = (n: number) => `${Math.round(n).toLocaleString('es-AR')}%`
const hhTxt = (n: number) => Math.round(n).toLocaleString('es-AR')

const ESTADO: Record<FilaItem['estado'], { texto: string; color: string }> = {
  sin_parte: { texto: 'Pendiente', color: C.tinta },
  en_progreso: { texto: 'En curso', color: C.curso },
  completado: { texto: 'Hecha', color: C.pos },
}

/** «1.01»: el número del rubro y la posición de la tarea dentro de él, de a dos cifras. */
function codigosDeTareas(filas: readonly FilaItem[]): Map<string, string> {
  const salida = new Map<string, string>()
  let rubro = 0
  let n = 0
  for (const f of filas) {
    if (f.nivel === 'rubro') { rubro++; n = 0; continue }
    if (f.nivel !== 'tarea') continue
    n++
    salida.set(f.id, `${rubro || 1}.${String(n).padStart(2, '0')}`)
  }
  return salida
}

export function TablaTareas({ filas, hhPor, abierta, alAbrir, vacio, hrefItems }: {
  filas: FilaItem[]
  /** HH reales por ítem (la tarea, o la suma de lo que cuelga del contenedor). null = sin HH. */
  hhPor: Readonly<Record<string, number | null>>
  abierta: string | null
  alAbrir: (id: string) => void
  vacio: React.ReactNode
  /** La vista de Ítems ponderados (04b). */
  hrefItems: string
}) {
  const codigos = codigosDeTareas(filas)
  const tareas = filas.filter((f) => f.nivel === 'tarea')
  const rubros = filas.filter((f) => f.nivel === 'rubro').length
  const sinFecha = tareas.filter((f) => !f.plan).length
  const sinMetodo = tareas.filter((f) => !f.puedeMedir).length

  // El renglón «Sector»: la cadena de contenedores bajo el rubro, dicha una vez antes de sus tareas.
  const filasConSector: (FilaItem | { sector: string; id: string })[] = []
  const nombres: string[] = []
  let rubroActual = ''
  let ultimoSector = ''
  for (const f of filas) {
    if (f.nivel === 'rubro') { rubroActual = f.nombre; nombres.length = 0; ultimoSector = ''; filasConSector.push(f); continue }
    if (f.nivel === 'epica' || f.nivel === 'historia') { nombres.length = f.profundidad; nombres[f.profundidad] = f.nombre; continue }
    if (f.nivel !== 'tarea') continue
    // La historia que se llama como su rubro (las obras migradas el 25/09) no se repite como sector.
    const sector = nombres.slice(1, f.profundidad).filter((x, i, a) => x && x !== rubroActual && a.indexOf(x) === i).join(' · ')
    if (sector && sector !== ultimoSector) { filasConSector.push({ sector, id: `sector-${f.id}` }); ultimoSector = sector }
    filasConSector.push(f)
  }

  return (
    <div style={{ padding: '16px 30px 30px', display: 'flex', flexDirection: 'column', minWidth: 0, overflowX: 'auto' }} data-testid="tabla-tareas">
      <div style={{ minWidth: '900px', display: 'flex', flexDirection: 'column' }}>
        <div role="row" style={{
          display: 'grid', gridTemplateColumns: COLS_TAREAS, gap: '16px', height: '34px', alignItems: 'center',
          borderBottom: `1px solid ${C.borde}`, fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase',
        }}>
          <div>Actividad</div><div>Medición</div><div>Avance</div><div>Estado</div><div style={{ textAlign: 'right' }}>HH</div><div>Responsable</div>
        </div>
        {filas.length === 0 && <div style={{ padding: '24px 0', fontSize: '12.5px', color: C.tintaSuave }} data-testid="wbs-vacio">{vacio}</div>}
        {filasConSector.map((x) => {
          if ('sector' in x) {
            return <div key={x.id} style={{ height: '30px', display: 'flex', alignItems: 'center', paddingLeft: '14px', fontSize: '11.5px', color: C.tintaSuave }}>{x.sector}</div>
          }
          const f = x
          const hh = hhPor[f.id] ?? null
          if (f.nivel === 'rubro') {
            return (
              <div key={f.id} role="row" data-testid={`tarea-rubro-${f.id}`} style={{
                display: 'grid', gridTemplateColumns: COLS_TAREAS, gap: '16px', height: '44px', alignItems: 'center',
                background: C.tenueFondo, borderBottom: `1px solid ${C.borde}`, fontVariantNumeric: 'tabular-nums',
              }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', minWidth: 0 }}>
                  <span style={{ fontFamily: MONO, fontSize: '11.5px', color: C.tenue }}>{f.codigo}</span>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: C.tinta, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre}</span>
                </div>
                <div style={{ fontSize: '12px', color: C.tenue }}>resumen</div>
                <div style={{ fontSize: '13px', color: f.pctItem == null ? C.tenue : C.tinta }}>{f.pctItem == null ? 'sin avance' : pct(f.pctItem)}</div>
                <div />
                <div style={{ textAlign: 'right', fontSize: '13px', color: hh == null ? C.tenue : C.tinta }}>{hh == null ? 'sin HH' : hhTxt(hh)}</div>
                <div />
              </div>
            )
          }
          const partes = f.medicion.texto.split(' · ')
          const metodo = f.puedeMedir ? partes[0] : null
          const detalle = partes.slice(1).join(' · ')
          const manual = metodo === 'Manual'
          const estado = f.bloqueada ? { texto: 'Bloqueada', color: C.neg } : ESTADO[f.estado]
          const sel = abierta === f.id
          return (
            <div key={f.id} role="row" data-testid={`tarea-${f.id}`} onClick={() => alAbrir(f.id)} style={{
              display: 'grid', gridTemplateColumns: COLS_TAREAS, gap: '16px', minHeight: '52px', alignItems: 'center',
              borderBottom: `1px solid ${C.bordeTarjeta}`, cursor: 'pointer', fontVariantNumeric: 'tabular-nums',
              background: sel ? C.marcaSuave : 'transparent',
              boxShadow: sel ? `inset 3px 0 0 ${C.marca}` : !f.puedeMedir ? `inset 3px 0 0 ${C.neg}` : 'none',
            }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', paddingLeft: '36px', minWidth: 0 }}>
                <span style={{ fontFamily: MONO, fontSize: '11.5px', color: C.tenue, flexShrink: 0 }}>{codigos.get(f.id)}</span>
                <span style={{ fontSize: '13.5px', color: C.tinta, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.nombre}{f.tiempoTecnico && <span style={{ fontSize: '11.5px', color: C.tintaSuave }}> · tiempo técnico</span>}
                </span>
              </div>
              <div style={{ fontSize: '12.5px', color: !metodo ? C.warn : manual ? C.warn : C.tintaSuave, fontWeight: !metodo ? 600 : 400 }}>
                {f.tiempoTecnico && f.diasTeoricos != null ? `${f.diasTeoricos} d fijos` : metodo ?? 'sin método'}
              </div>
              <div style={{ fontSize: '12.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {!metodo ? <span style={{ color: C.tenue }}>no se puede medir</span>
                  : f.tiempoTecnico ? <span style={{ color: C.tenue }}>no aplica</span>
                    : f.pctItem == null ? <span style={{ color: C.tenue }}>sin registrar</span>
                      : <><span style={{ color: manual ? C.warn : C.tinta }}>{pct(f.pctItem)}</span>{' '}<span style={{ color: C.tenue }}>{manual ? 'declarado' : detalle}</span></>}
              </div>
              <div style={{ fontSize: '12.5px', color: estado.color, fontWeight: f.bloqueada ? 600 : 400 }}>{estado.texto}</div>
              <div style={{ textAlign: 'right', fontSize: '13px', color: hh == null ? C.tenue : C.tinta }}>{hh == null ? (manual ? 'sin HH' : '—') : hhTxt(hh)}</div>
              <div style={{ fontSize: '12.5px', color: f.responsable ? C.tinta : C.tenue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.responsable ?? 'sin asignar'}</div>
            </div>
          )
        })}
        {filas.length > 0 && (
          <div style={{ paddingTop: '18px', fontSize: '12.5px', color: C.tintaSuave }} data-testid="pie-tareas">
            Rubro › Sector › Ítem › Parte diario · <Link href={hrefItems} prefetch={false} style={{ color: C.tinta, textDecoration: 'underline' }}>{tareas.length} {tareas.length === 1 ? 'ítem' : 'ítems'}</Link> en {rubros} {rubros === 1 ? 'rubro' : 'rubros'} · {sinFecha} sin fecha · {sinMetodo} sin método de medición.
          </div>
        )}
      </div>
    </div>
  )
}
