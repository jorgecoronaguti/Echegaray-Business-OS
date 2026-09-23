'use client'

// LOS CÓDIGOS POR UNIDAD DE UN LOTE (dueño, 23/09: «lo que tiene cantidad tiene que ir generando códigos
// únicos cuando haga falta»). Sirve en la ficha de escritorio y en la del teléfono: una sola pieza, la
// misma acción (`individualizar_unidades`) y la misma lista, para que las dos caras digan lo mismo.
//
// No usa el contexto del espacio (`useHerramientas`): el teléfono no lo tiene. Recibe el lote y sus
// unidades, y avisa con `onHecho` para que quien la dibuja refresque.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { codigosParaEtiquetas, individualizable, MIGRACION_UNIDADES, unidadesDe, type Unidad } from '../logica/unidades'
import { individualizarUnidadesAction } from '../services/acciones-unidades'
import type { Activo } from '../types'
import { AZUL, MONO, V, botonSecundario, campo, eyebrow, vacio } from './estilo'

export function Unidades({ activo, unidades, variante = 'escritorio', onHecho }: {
  activo: Pick<Activo, 'id' | 'codigo' | 'cantidad' | 'estado'>
  unidades: readonly Unidad[] | null | undefined
  variante?: 'escritorio' | 'telefono'
  onHecho?: () => void
}) {
  const router = useRouter()
  const [pidiendo, setPidiendo] = useState(false)
  const [cuantas, setCuantas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  if (activo.cantidad <= 1 || activo.estado === 'baja') return null
  const tel = variante === 'telefono'
  const estado = individualizable(activo, unidades)
  const mias = unidadesDe(unidades, activo.id)
  const grande = tel ? { fontSize: '15px', minHeight: 48 } : { fontSize: '13px', minHeight: 30 }

  async function dar() {
    const n = Math.trunc(Number(cuantas))
    if (!Number.isFinite(n) || n < 1) return setError('Es un número de 1 o más.')
    setEnviando(true)
    setError(null)
    const r = await individualizarUnidadesAction({ activo: activo.id, cuantas: n })
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    setPidiendo(false)
    setAviso(`${r.dato.length} ${r.dato.length === 1 ? 'código nuevo' : 'códigos nuevos'}: ${r.dato[0]?.codigo}${r.dato.length > 1 ? ` a ${r.dato[r.dato.length - 1]?.codigo}` : ''}.`)
    ;(onHecho ?? router.refresh)()
  }

  return (
    <div data-testid="unidades-lote" style={{ display: 'flex', flexDirection: 'column', gap: tel ? 10 : 8, paddingTop: 4, borderTop: `1px solid ${V.linea}` }}>
      <div style={{ ...eyebrow, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <span>Código por unidad</span>
        <span style={{ textTransform: 'none', letterSpacing: 0 }}>{estado.tiene} de {activo.cantidad}</span>
      </div>
      {estado.puede === false && estado.motivo === 'sin_migracion' && (
        <div style={{ fontSize: tel ? '14px' : '12.5px', color: V.tenue }}>Falta aplicar la migración {MIGRACION_UNIDADES} de los códigos por unidad.</div>
      )}
      {mias.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: tel ? 8 : 6 }} data-testid="lista-unidades">
          {mias.map((u) => (
            <span key={u.id} data-testid="unidad" style={{
              fontFamily: MONO, fontSize: tel ? '13.5px' : '12px', padding: tel ? '6px 10px' : '3px 8px', border: `1px solid ${V.linea}`, borderRadius: 6,
              color: u.estado === 'baja' ? V.tenue : V.tinta, textDecoration: u.estado === 'baja' ? 'line-through' : undefined,
            }}>{u.codigo}</span>
          ))}
        </div>
      )}
      {mias.length === 0 && estado.puede && (
        <div style={{ ...vacio, fontSize: tel ? '14px' : '12.5px' }}>Ninguna unidad tiene código todavía: se mueven y se cuentan por lote.</div>
      )}
      {aviso && <div role="status" style={{ fontSize: tel ? '13.5px' : '12.5px', color: V.pos }}>{aviso}</div>}
      {estado.puede && !pidiendo && (
        <div style={{ display: 'flex', gap: tel ? 10 : 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" data-testid="dar-codigo-unidades" onClick={() => { setPidiendo(true); setCuantas(String(estado.propuesta)); setAviso(null) }}
            style={{ ...botonSecundario, ...(tel ? { height: 48, fontSize: '15px', flex: 1, justifyContent: 'center' } : {}) }}>
            Dar código a cada unidad
          </button>
          {mias.length > 0 && (
            <Link href={`/herramientas/etiquetas?codigos=${encodeURIComponent(codigosParaEtiquetas(mias))}`} prefetch={false} data-testid="imprimir-unidades"
              style={{ fontSize: tel ? '14px' : '12.5px', color: AZUL }}>
              Imprimir etiquetas
            </Link>
          )}
        </div>
      )}
      {estado.puede && pidiendo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, ...grande }}>
            <span style={{ color: V.apagado, flex: 1 }}>Cuántas ahora (faltan {estado.faltan})</span>
            <input type="number" min={1} max={estado.faltan} value={cuantas} onChange={(e) => setCuantas(e.target.value)} autoFocus data-testid="cuantas-unidades"
              onKeyDown={(e) => { if (e.key === 'Enter') dar(); if (e.key === 'Escape') setPidiendo(false) }}
              style={{ ...campo, width: tel ? 110 : 84, height: tel ? 48 : 34, fontSize: tel ? '16px' : '13.5px', textAlign: 'right' }} />
          </label>
          <div style={{ fontSize: tel ? '13px' : '12px', color: V.apagado, lineHeight: 1.5 }}>
            Los códigos siguen al último: {activo.codigo}/{estado.tiene + 1} en adelante. No se etiquetan las {activo.cantidad} de golpe: se piden cuando hacen falta.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={enviando} onClick={dar} data-testid="confirmar-unidades"
              style={{ ...botonSecundario, fontWeight: 600, background: V.marca, border: 0, color: V.grafito, ...(tel ? { height: 48, fontSize: '15px', flex: 1, justifyContent: 'center' } : {}) }}>
              {enviando ? 'Generando…' : `Generar ${Number(cuantas) || ''}`.trim()}
            </button>
            <button type="button" onClick={() => { setPidiendo(false); setError(null) }} style={{ fontSize: tel ? '14px' : '12.5px', color: V.apagado, padding: '0 10px' }}>cancelar</button>
          </div>
        </div>
      )}
      {estado.puede === false && estado.motivo === 'completo' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: tel ? '14px' : '12.5px', color: V.apagado }}>
          Todas las unidades tienen código.
          <Link href={`/herramientas/etiquetas?codigos=${encodeURIComponent(codigosParaEtiquetas(mias))}`} prefetch={false} style={{ color: AZUL }}>Imprimir etiquetas</Link>
        </div>
      )}
      {error && <div role="alert" style={{ fontSize: tel ? '13.5px' : '12.5px', color: V.neg }}>{error}</div>}
    </div>
  )
}
