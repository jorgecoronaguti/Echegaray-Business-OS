'use client'

// D05 · REGISTRAR MOVIMIENTO — individual y masivo, el mismo panel.
//
// El origen no se elige: es donde cada uno está hoy (lo agrupa `origenes`). El destino sale de
// `destinos()`: Taller, rodados vivos, servicios técnicos y terceros, y las obras ACTIVAS del índice.
// Al mover un rodado que lleva algo encima, se pregunta si la carga viaja con él o baja donde está
// (`p_bajar_carga`): la base no lo adivina y el panel tampoco.

import { useMemo, useState } from 'react'
import { advertencias, claveDestino, destinos, origenes, textoBotonMover, type OpcionDestino } from '../logica/mover'
import { rotuloUbicacion, ETIQUETA_ESTADO } from '../logica/parque'
import { normalizarCodigo } from '../logica/codigo'
import { contieneEnAlguno } from '@/shared/utils/busqueda'
import { crearUbicacionAction, moverActivosAction } from '../services/acciones'
import { useHerramientas } from './Espacio'
import { Bloque, ErrorPanel, PanelLateral } from './PanelLateral'
import { IcoRodado } from './iconos'
import { botonPrimarioGrande, botonSecundarioGrande, campo, chip, V } from './estilo'
import { fechaHora } from './formato'

const VISIBLES = 4

export function PanelMover({ idsIniciales, destinoInicial, onHecho }: {
  idsIniciales: string[]
  destinoInicial?: string
  onHecho: (t: string) => void
}) {
  const { parque, obras, yo, cerrar, refrescar } = useHerramientas()
  const [ids, setIds] = useState(() => idsIniciales.filter((id) => parque.activoPorId.get(id)?.estado !== 'baja'))
  const [destino, setDestino] = useState<string | null>(destinoInicial ?? null)
  const [busca, setBusca] = useState('')
  const [abiertaLista, setAbiertaLista] = useState(false)
  const [nota, setNota] = useState('')
  const [bajarCarga, setBajarCarga] = useState<boolean | null>(null)
  const [codigo, setCodigo] = useState('')
  const [todos, setTodos] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [nuevo, setNuevo] = useState<{ tipo: 'tercero' | 'servicio_tecnico'; nombre: string; contacto: string } | null>(null)

  const activos = ids.map((id) => parque.activoPorId.get(id)!).filter(Boolean)
  const opciones = useMemo(() => destinos(parque, obras), [parque, obras])
  const elegida = opciones.find((o) => claveDestino(o) === destino) ?? null
  const destinoUbicacion = elegida?.tipo === 'ubicacion' ? elegida.ubicacionId : null
  const w = advertencias(parque, activos, destinoUbicacion)
  const rapidas = opciones.filter((o) => o.grupo !== 'obra')
  const filtradas = busca.trim() ? opciones.filter((o) => contieneEnAlguno([o.rotulo], busca)) : opciones
  const hayCarga = w.rodadosConCarga.length > 0
  const puede = activos.length > 0 && elegida && !w.adentroDeSiMismo && (!hayCarga || bajarCarga !== null) && !enviando

  function agregarCodigo() {
    const c = normalizarCodigo(codigo)
    if (!c) return
    const a = parque.activos.find((x) => x.codigo === c)
    if (!a) return setError(`${c} no está en el inventario.`)
    if (a.estado === 'baja') return setError(`${c} está dado de baja: no se mueve más.`)
    setError(null)
    setIds((l) => (l.includes(a.id) ? l : [...l, a.id]))
    setCodigo('')
  }

  async function crear() {
    if (!nuevo) return
    setEnviando(true)
    const r = await crearUbicacionAction({ tipo: nuevo.tipo, nombre: nuevo.nombre, contacto: nuevo.contacto })
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    // Queda elegido: cuando llega la lectura nueva, el destino ya aparece en la lista.
    setDestino(`u:${r.dato}`)
    setNuevo(null)
    refrescar()
  }

  async function mover() {
    if (!elegida) return
    setEnviando(true)
    setError(null)
    const r = await moverActivosAction({ activos: ids, destino: claveDestino(elegida), nota, bajarCarga: bajarCarga ?? false })
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    onHecho(r.mensaje ?? `${activos.length === 1 ? activos[0].nombre : `${activos.length} activos`} → ${elegida.rotulo}.`)
  }

  const lista = todos ? activos : activos.slice(0, VISIBLES)
  return (
    <PanelLateral
      testid="panel-mover" titulo="Registrar movimiento" onCerrar={cerrar}
      subtitulo={activos.length === 1 ? activos[0].nombre : `${activos.length} activos seleccionados`}
      pie={
        <>
          <button type="button" data-testid="confirmar-mover" disabled={!puede} onClick={mover} style={{ ...botonPrimarioGrande, opacity: puede ? 1 : 0.45 }}>
            {enviando ? 'Moviendo…' : textoBotonMover(activos.length)}
          </button>
          <button type="button" onClick={cerrar} style={botonSecundarioGrande}>Cancelar</button>
        </>
      }
    >
      <Bloque rotulo="Desde" primero>
        {activos.length === 0 ? (
          <div style={{ fontSize: '13px', color: V.apagado }}>Todavía no hay nada para mover. Agregalo por código abajo.</div>
        ) : (
          origenes(parque, activos).map((g) => (
            <div key={g.ubicacionId ?? 'sin'} style={{ fontSize: '14px', fontStyle: g.ubicacionId ? undefined : 'italic', color: g.ubicacionId ? V.tinta : V.tenue }}>
              {g.rotulo} <span style={{ color: V.apagado, fontSize: '12.5px', fontStyle: 'normal' }}>· {g.cuenta} {g.cuenta === 1 ? 'activo' : 'activos'}</span>
            </div>
          ))
        )}
        <div style={{ fontSize: '12.5px', color: V.apagado }}>El origen no se elige: es donde cada uno está hoy.</div>
      </Bloque>

      <Bloque rotulo="Hacia">
        <div style={{ position: 'relative' }}>
          <input
            data-testid="destino-mover" aria-label="Hacia dónde"
            value={abiertaLista ? busca : (elegida?.rotulo ?? busca)}
            placeholder="Obra, taller, rodado o servicio técnico"
            onFocus={() => { setAbiertaLista(true); setBusca('') }}
            onBlur={() => setTimeout(() => setAbiertaLista(false), 150)}
            onChange={(e) => setBusca(e.target.value)}
            style={{ ...campo, fontSize: '14px', borderColor: elegida || abiertaLista ? V.grafito : V.lineaFuerte }}
          />
          {abiertaLista && (
            <ul
              role="listbox"
              style={{ position: 'absolute', zIndex: 10, left: 0, right: 0, top: 42, maxHeight: 260, overflowY: 'auto', background: '#FFFFFF', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, boxShadow: '0 6px 18px rgba(0,0,0,.08)' }}
            >
              {filtradas.length === 0 && <li style={{ padding: '9px 12px', fontSize: '13px', color: V.tenue }}>Nada con ese nombre. Las obras que se ofrecen son las activas del índice.</li>}
              {filtradas.map((o) => (
                <li key={claveDestino(o)}>
                  <button
                    type="button" role="option" aria-selected={claveDestino(o) === destino}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setDestino(claveDestino(o)); setAbiertaLista(false); setBusca('') }}
                    className="hover:bg-surface-quiet"
                    style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: '13px', display: 'flex', gap: 8 }}
                  >
                    <span style={{ flex: 1 }}>{o.rotulo}</span>
                    <span style={{ color: V.tenue, fontSize: '11.5px' }}>{GRUPO[o.grupo]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {rapidas.map((o) => (
            <button
              key={claveDestino(o)} type="button" onClick={() => setDestino(claveDestino(o))}
              style={{ ...chip, borderColor: claveDestino(o) === destino ? V.grafito : V.linea }}
            >
              {o.grupo === 'rodado' && <IcoRodado tam={13} />}
              {o.grupo === 'rodado' ? o.rotulo.split(' ').pop() : o.rotulo}
            </button>
          ))}
          <button type="button" onClick={() => setNuevo({ tipo: 'tercero', nombre: '', contacto: '' })} style={chip}>Tercero…</button>
        </div>
        {nuevo && <NuevoLugar nuevo={nuevo} setNuevo={setNuevo} crear={crear} enviando={enviando} />}
        {w.adentroDeSiMismo && <div style={{ fontSize: '12.5px', color: V.neg }}>{w.adentroDeSiMismo.nombre} no puede moverse adentro de sí mismo: sacalo de la lista o elegí otro destino.</div>}
        {w.yaEstan.length > 0 && <div style={{ fontSize: '12.5px', color: V.apagado }}>{w.yaEstan.length === 1 ? 'Uno ya está' : `${w.yaEstan.length} ya están`} ahí: no se registra movimiento para {w.yaEstan.length === 1 ? 'ese' : 'esos'}.</div>}
      </Bloque>

      <Bloque
        rotulo="Qué se mueve"
        derecha={
          <form onSubmit={(e) => { e.preventDefault(); agregarCodigo() }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Escanear o tipear código"
              aria-label="Agregar por código" data-testid="agregar-codigo"
              style={{ height: 26, width: 170, padding: '0 8px', border: `1px solid ${V.linea}`, borderRadius: 6, fontSize: '12.5px' }}
            />
          </form>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: '13px' }}>
          {lista.map((a) => {
            const problema = a.estado === 'requiere_mantenimiento' || a.estado === 'fuera_servicio' || a.estado === 'reparacion_externa'
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 36, borderBottom: `1px solid ${V.linea}`, color: problema ? V.warn : V.tinta }}>
                <span>{a.nombre}{problema && ` · ${ETIQUETA_ESTADO[a.estado].toLowerCase()}`}</span>
                <button type="button" onClick={() => setIds((l) => l.filter((x) => x !== a.id))} style={{ color: V.tenue }}>quitar</button>
              </div>
            )
          })}
          {!todos && activos.length > VISIBLES && (
            <button type="button" onClick={() => setTodos(true)} style={{ minHeight: 36, textAlign: 'left', color: V.apagado }}>+ {activos.length - VISIBLES} más</button>
          )}
        </div>
        {w.conProblema.length > 0 && (
          <div style={{ fontSize: '12.5px', color: V.warn, lineHeight: 1.5 }}>
            {w.conProblema.length === 1 ? 'Uno tiene un problema reportado' : `${w.conProblema.length} tienen un problema reportado`}. Se mueve igual: el estado viaja con {w.conProblema.length === 1 ? 'él' : 'ellos'}.
          </div>
        )}
        {w.rodadosConCarga.map(({ rodado, carga }) => (
          <div key={rodado.id} data-testid="pregunta-carga" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '13px' }}>
            <div>{rodado.nombre} lleva {carga} {carga === 1 ? 'activo' : 'activos'} encima. ¿Qué pasa con la carga?</div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="radio" name="carga" checked={bajarCarga === false} onChange={() => setBajarCarga(false)} /> Viaja con el rodado
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="radio" name="carga" checked={bajarCarga === true} onChange={() => setBajarCarga(true)} />
              Baja en {rotuloUbicacion(parque, rodado.ubicacion_id)}
            </label>
          </div>
        ))}
      </Bloque>

      <Bloque rotulo={<>Nota <span style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'inherit', fontSize: '11.5px' }}>(opcional)</span></>}>
        <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={400} placeholder="Para qué van, si hace falta decirlo" style={campo} data-testid="nota-mover" />
        <div style={{ fontSize: '12.5px', color: V.apagado }}>Queda registrado: {fechaHora(new Date().toISOString())}{yo.nombre ? ` · ${yo.nombre}` : ''}.</div>
      </Bloque>
      <ErrorPanel texto={error} />
    </PanelLateral>
  )
}

const GRUPO: Record<OpcionDestino['grupo'], string> = {
  taller: 'taller', obra: 'obra', rodado: 'rodado', servicio_tecnico: 'servicio técnico', tercero: 'tercero',
}

function NuevoLugar({ nuevo, setNuevo, crear, enviando }: {
  nuevo: { tipo: 'tercero' | 'servicio_tecnico'; nombre: string; contacto: string }
  setNuevo: (n: { tipo: 'tercero' | 'servicio_tecnico'; nombre: string; contacto: string } | null) => void
  crear: () => void
  enviando: boolean
}) {
  return (
    <div data-testid="nuevo-lugar" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: `1px solid ${V.linea}`, borderRadius: 6 }}>
      <div style={{ display: 'flex', gap: 14, fontSize: '13px' }}>
        {(['tercero', 'servicio_tecnico'] as const).map((t) => (
          <label key={t} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="radio" checked={nuevo.tipo === t} onChange={() => setNuevo({ ...nuevo, tipo: t })} />
            {t === 'tercero' ? 'Tercero (préstamo, alquiler)' : 'Servicio técnico'}
          </label>
        ))}
      </div>
      <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre" style={campo} />
      <input value={nuevo.contacto} onChange={(e) => setNuevo({ ...nuevo, contacto: e.target.value })} placeholder="Contacto (opcional)" style={campo} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={enviando || nuevo.nombre.trim().length < 2} onClick={crear} style={{ ...botonPrimarioGrande, height: 32 }}>Crear lugar</button>
        <button type="button" onClick={() => setNuevo(null)} style={{ ...botonSecundarioGrande, height: 32 }}>Cancelar</button>
      </div>
    </div>
  )
}
