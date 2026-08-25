'use client'

// 00 · EL PANEL LATERAL DE LA CARTERA — el detalle sin salir de la lista.
//
// ═══ POR QUÉ EL PANEL Y NO LA FICHA ═══
//
// El canónico 00 dibuja la cartera con un panel de 372px al lado: se toca un cliente, se ve con quién
// se habla y qué obras tiene, se toca el siguiente. La ficha completa (canónico 26) sigue existiendo
// y es a donde se va a EDITAR; el panel contesta «¿quién es éste?» mientras se recorre la lista, que
// es el trabajo de esta pantalla. Regla 9 de `UX_PRINCIPLES.md`: no sacar a la persona de la lista
// para ver el detalle.
//
// ═══ LA SELECCIÓN NO NAVEGA ═══
//
// Mismo criterio que el panel de la 14: el panel no lee NADA que la página no haya traído ya —los
// datos salen de `cliente_panel` y las obras de una única consulta a `obra_panel`—, así que un
// `?cliente=` sólo agregaría un viaje al servidor y un esqueleto por cada fila que alguien toca
// comparando dos clientes.
//
// ═══ EL PANEL NO PUBLICA UN NÚMERO QUE LA LISTA NO PUBLIQUE ═══
//
// Los mismos `null` con los mismos nombres. «sin cargar» es sin cargar en los dos lados, y CONTRATADO
// desaparece del panel para quien no ve economía exactamente igual que desaparece la columna: el
// permiso no se relaja porque el dato pase por otro componente.
//
// ═══ LO QUE EL CANÓNICO DIBUJA Y ACÁ NO ESTÁ ═══
//
// La solapa **Actividad** del mockup. La línea de tiempo del cliente (`getActividadCliente`) son seis
// lecturas por cliente: traerla para los cinco de la cartera al abrir la pantalla es pagar treinta
// consultas para que se miren tres renglones. Vive en la ficha, y el pie del panel lleva hasta ahí.

import Link from 'next/link'
import { useState } from 'react'
import { BotonEnlace, Estado, Nulo, Num, PanelDetalle } from '@/shared/components/ds'
import { money } from '@/shared/utils/format'
import { iniciales } from '@/shared/components/canon'
import type { ClientePanel, ObraDePanel } from '../types'

type Solapa = 'resumen' | 'obras' | 'documentos' | 'cuenta'

/** El estado de la obra, en punto + palabra. Nunca pastilla de color (COMPONENTS.md §Status badges). */
function tonoDeObra(estado: string): { tono: 'pos' | 'curso' | 'pendiente' | 'nulo'; label: string } {
  if (estado === 'activa') return { tono: 'curso', label: 'en ejecución' }
  if (estado === 'cerrada') return { tono: 'pos', label: 'terminada' }
  if (estado === 'pausada') return { tono: 'pendiente', label: 'pausada' }
  return { tono: 'nulo', label: estado }
}

// LAS INICIALES DEL AVATAR VIVEN EN UN SOLO LUGAR.
//
// Esta copia era idéntica a la de `shared/components/canon/Cabeceras.tsx`, que es la que usan las
// fichas 23 y 26. Dos definiciones del mismo avatar es cómo un sistema termina con «Q-» en una
// pantalla y «QM» en la de al lado para el mismo cliente. Se re-exporta para no romper a quien la
// importaba desde acá.
export { iniciales }

function Dato({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-2 last:border-0">
      <span className="w-[88px] shrink-0 text-[11.5px] text-muted">{k}</span>
      <span className="min-w-0 truncate text-[12.5px] text-ink">{children}</span>
    </div>
  )
}

export function PanelCliente({
  c,
  obras,
  veEconomia,
  onCerrar,
}: {
  c: ClientePanel
  /** Todas sus obras, no sólo las activas: el panel muestra la relación completa. */
  obras: ObraDePanel[]
  veEconomia: boolean
  onCerrar: () => void
}) {
  const [solapa, setSolapa] = useState<Solapa>('resumen')
  // CUENTA ES ECONOMÍA. Para quien no la ve, la solapa no existe — no se dibuja vacía ni con un
  // cartel de permiso, que sería anunciarle un dato que no le corresponde.
  const solapas: { k: Solapa; t: string; n: number | null }[] = [
    { k: 'resumen', t: 'Resumen', n: null },
    { k: 'obras', t: 'Obras', n: obras.length },
    { k: 'documentos', t: 'Documentos', n: c.n_documentos },
    ...(veEconomia ? [{ k: 'cuenta' as Solapa, t: 'Cuenta', n: null }] : []),
  ]
  const activa = solapas.some((s) => s.k === solapa) ? solapa : 'resumen'

  return (
    <PanelDetalle
      titulo={
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-surface-quiet text-[12px] font-semibold text-ink-soft"
          >
            {iniciales(c.nombre_comercial)}
          </span>
          <span className="min-w-0 truncate">{c.nombre_comercial}</span>
        </span>
      }
      subtitulo={c.razon_social ?? <Nulo>sin razón social</Nulo>}
      onCerrar={onCerrar}
      ancho={372}
      testid="panel-cliente"
      pie={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {c.slug ? (
            <>
              <BotonEnlace href={`/clientes/${c.slug}`} variante="secundaria" data-testid="panel-cliente-ficha">
                Abrir ficha
              </BotonEnlace>
              {/* LA PRIMARIA DEL CANÓNICO es «Nueva obra». El alta de obra vive en /obras: repetir el
                  formulario acá crearía una segunda puerta al mismo maestro. */}
              <BotonEnlace href={`/obras?nueva=1&cliente=${c.slug}`} data-testid="panel-cliente-nueva-obra">
                Nueva obra
              </BotonEnlace>
            </>
          ) : (
            // Sin identificador no hay ficha a la que ir, y ofrecer el botón sería ofrecer un 404.
            <Nulo className="text-[11.5px]">sin identificador: este cliente todavía no tiene ficha</Nulo>
          )}
        </div>
      }
    >
      <div className="mb-3 flex items-stretch gap-0 border-b border-line" role="tablist" data-testid="panel-cliente-solapas">
        {solapas.map((s) => (
          <button
            key={s.k}
            type="button"
            role="tab"
            aria-selected={activa === s.k}
            onClick={() => setSolapa(s.k)}
            data-testid={`panel-cliente-solapa-${s.k}`}
            className={`-mb-px flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] transition-colors ${
              activa === s.k
                ? 'border-b-2 border-marca font-semibold text-ink'
                : 'border-b-2 border-transparent text-muted hover:text-ink'
            }`}
          >
            {s.t}
            {s.n !== null && <span className="font-mono text-[10.5px] tabular-nums text-faint">{s.n}</span>}
          </button>
        ))}
      </div>

      {activa === 'resumen' && (
        <div data-testid="panel-cliente-resumen">
          <Dato k="CUIT">{c.cuit ?? <Nulo>sin cargar</Nulo>}</Dato>
          <Dato k="Contacto">{c.responsable_nombre ?? <Nulo>sin asignar</Nulo>}</Dato>
          <Dato k="Teléfono">{c.telefono ?? <Nulo>sin cargar</Nulo>}</Dato>
          <Dato k="Email">{c.email ?? <Nulo>sin cargar</Nulo>}</Dato>
          <Dato k="Domicilio">{c.direccion ?? <Nulo>sin cargar</Nulo>}</Dato>
          {veEconomia && (
            <Dato k="Contratado">
              {c.contratado === null ? (
                <Nulo>sin cargar</Nulo>
              ) : (
                <span className="font-mono tabular-nums">{money(c.contratado)}</span>
              )}
            </Dato>
          )}
        </div>
      )}

      {activa === 'obras' && (
        <div data-testid="panel-cliente-obras">
          {obras.length === 0 ? (
            <p className="py-2 text-[12.5px] text-muted">Todavía no tiene obras cargadas.</p>
          ) : (
            obras.map((o) => {
              const e = tonoDeObra(o.estado)
              return (
                <Link
                  key={o.obra_id}
                  href={`/obras/${o.obra_id}`}
                  className="flex items-center gap-3 border-b border-line py-2 last:border-0 hover:bg-surface-quiet"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-ink">{o.nombre}</span>
                    <Estado tono={e.tono} clave={o.estado} className="text-[11px]">{e.label}</Estado>
                  </span>
                  {/* UN AVANCE QUE NO SE SINCRONIZÓ NO ES 0 %. */}
                  <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink">
                    {o.avance_pct === null ? <Nulo>—</Nulo> : `${o.avance_pct} %`}
                  </span>
                </Link>
              )
            })
          )}
        </div>
      )}

      {activa === 'documentos' && (
        <div data-testid="panel-cliente-documentos">
          {/* SÓLO EL CONTEO, Y SE DICE QUE ES EL CONTEO. `cliente_panel` trae cuántos hay; la lista
              de archivos son dos lecturas más contra `drive_index` que no se pagan por cliente
              mientras alguien recorre la cartera. El enlace lleva a donde sí están. */}
          <p className="py-2 text-[12.5px] text-ink">
            <Num>{c.n_documentos}</Num> documento{c.n_documentos === 1 ? '' : 's'} vinculado
            {c.n_documentos === 1 ? '' : 's'}.
          </p>
          {c.slug && (
            <Link href={`/clientes/${c.slug}#documentos`} className="text-[12.5px] text-ink underline underline-offset-2">
              Verlos en la ficha
            </Link>
          )}
        </div>
      )}

      {activa === 'cuenta' && veEconomia && (
        <div data-testid="panel-cliente-cuenta">
          <Dato k="Contratado">
            {c.contratado === null ? <Nulo>sin cargar</Nulo> : <span className="font-mono tabular-nums">{money(c.contratado)}</span>}
          </Dato>
          <Dato k="Costo real">
            {c.costo_real === null ? <Nulo>sin cargar</Nulo> : <span className="font-mono tabular-nums">{money(c.costo_real)}</span>}
          </Dato>
          <Dato k="Obras">
            <span className="font-mono tabular-nums">{c.n_obras}</span>
            <span className="text-muted"> · {c.n_obras_activas} en ejecución</span>
          </Dato>
          <Dato k="Contactos">
            <span className="font-mono tabular-nums">{c.n_contactos}</span>
          </Dato>
        </div>
      )}
    </PanelDetalle>
  )
}
