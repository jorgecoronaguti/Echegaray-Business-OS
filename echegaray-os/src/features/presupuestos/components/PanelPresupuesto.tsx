'use client'

// 14 · EL PANEL DE LA CARTERA — porte literal del panel de `14 · Presupuestos Cartera.dc.html`
// (bloque `hayPanel`, 372px, líneas 162-232).
//
// ═══ POR QUÉ LA SELECCIÓN NO NAVEGA ═══
//
// Este panel no lee NADA que la fila no tenga ya: `cotizacion_cascada` trae todo lo que muestra.
// Navegar agregaría un viaje al servidor y un esqueleto por cada fila que alguien toca mientras
// compara tres ofertas.
//
// ═══ EL BOTÓN PRIMARIO ES EL PASO QUE SIGUE DE VERDAD ═══
//
// El mockup elige el rótulo por estado: ganado → «Preparar obra», borrador → «Completar precios»,
// resto → «Enviar al cliente». Se porta esa idea, con UNA corrección declarada: el mockup le pone
// «Enviar al cliente» también a un presupuesto YA enviado, y ése sería un botón que no hace nada —
// la clase de botón falso que este repo ya pagó («la pantalla más ancha que la base»). Para un
// presupuesto enviado el paso real es registrar la respuesta del cliente, así que ahí va
// «Marcar ganado», que es una transición que la base acepta (`transicionesDe`).
//
// Y ESE BOTÓN ESCRIBE DE VERDAD, ACÁ MISMO: `cambiarEstado` es la server action que ya usa la
// pantalla 15. No navega a ningún lado — el dueño fue explícito: «necesito que la pantalla permita
// que si quiero editar edite ahí mismo, no me sirve que me cargue y me lleve a otro lado».
//
// ═══ EL PANEL NO PUEDE PUBLICAR UN NÚMERO QUE LA LISTA NO PUBLICA ═══
//
// Los mismos `null` con los mismos nombres: «sin cotizar» cuando no hay partidas, «sin dato» cuando
// no hay margen contra el cual medir. Un panel que rellena con 0 lo que la fila declara ausente
// contradice a la fila que lo abrió.

import Link from 'next/link'
import { useActionState, startTransition, type ReactNode } from 'react'
import {
  C, FilaDato, PANEL, TARJETA,
  IcoAlerta, IcoCerrar, IcoChevron, IcoCliente, IcoConvertir, IcoDuplicar, IcoEditar, IcoEnviar,
  IcoFecha, IcoLista, IcoObra, IcoReloj,
  entero, millones, porcentajeCanon,
} from '@/shared/components/canon'
import type { PresupuestoCascada } from '../types'
import { lecturaEstado, puedeConvertir } from '../services/estado'
import { tieneCifras } from '../services/cascada'
import { problemasDe } from '../services/cartera'
import { fecha } from '../services/formato'
import { cambiarEstado } from '../services/actions'
import { INICIAL } from '../services/accion'

export function PanelPresupuesto({
  p,
  onCerrar,
  margenObjetivo,
}: {
  p: PresupuestoCascada
  onCerrar: () => void
  /** De `parametro_operativo.margen_objetivo_pct`. `null` = nadie lo declaró, o este rol no lo ve. */
  margenObjetivo: number | null
}) {
  const e = lecturaEstado(p.estado)
  const conCifras = tieneCifras(p)
  const margen = p.margen_sobre_precio_pct
  // Sin umbral declarado no se juzga el margen. Ver `ListaPresupuestos`.
  const bajoObjetivo = margenObjetivo !== null && margen !== null && margen < margenObjetivo
  const conversion = puedeConvertir(p)
  const problemas = problemasDe(p)

  const [estadoAccion, ejecutar, pendiente] = useActionState(cambiarEstado, INICIAL)
  const mover = (a: 'enviada' | 'adjudicada') => {
    const datos = new FormData()
    datos.set('id', p.id)
    datos.set('estado', a)
    startTransition(() => ejecutar(datos))
  }

  return (
    <aside
      data-testid="panel-presupuesto"
      style={{
        ...TARJETA,
        width: PANEL.cartera,
        flexShrink: 0,
        marginLeft: 12,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 160px)',
      }}
    >
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Primaria
            p={p}
            conversion={conversion}
            problemas={problemas.length}
            pendiente={pendiente}
            onMover={mover}
          />
          <BotonCuadrado title="Abrir presupuesto" href={`/presupuestos/${p.id}`} testid="abrir-computo">
            <IcoEditar s={15} />
          </BotonCuadrado>
          {/* Duplicar es la VERSIÓN NUEVA del modelo: un presupuesto duplicado sin número propio
              sería una fila huérfana. Se ofrece desde adentro del presupuesto, que es donde vive
              `nuevaVersion` con su confirmación — acá abriría una escritura de dos pasos sin
              contexto. Queda declarado en el informe. */}
          <BotonCuadrado title="Ver versiones" href={`/presupuestos/${p.id}#versiones`} testid="ver-versiones">
            <IcoDuplicar s={15} />
          </BotonCuadrado>
          <button
            type="button"
            onClick={onCerrar}
            title="Cerrar"
            data-testid="cerrar-panel"
            style={{ marginLeft: 'auto', display: 'flex', color: C.tenue }}
            className="transition-colors hover:text-[#1F1F1E]"
          >
            <span className="sr-only">Cerrar</span>
            <IcoCerrar s={15} />
          </button>
        </div>
        <div style={{ fontSize: '15.5px', fontWeight: 600, color: C.tinta, lineHeight: 1.3, marginTop: 12 }}>
          {p.obra_nombre ?? 'sin objeto'}
        </div>
        <div style={{ fontSize: '11.5px', color: C.apagado, marginTop: 3 }}>
          {p.cliente ?? 'sin cliente'} · {e.label}
          <span className="ml-1.5 font-mono tabular-nums">
            {p.numero ?? 'sin número'} · rev {p.version}{p.vigente ? '' : ' · reemplazada'}
          </span>
        </div>
        {estadoAccion.error && (
          <div style={{ marginTop: 8, fontSize: '11.5px', color: C.neg }} data-testid="panel-error">
            {estadoAccion.error}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Bloque rotulo="TOTAL" valor={conCifras ? millones(p.precio_venta) : null} falta="sin cotizar" />
          <Bloque
            rotulo="MARGEN"
            valor={porcentajeCanon(margen)}
            falta="sin dato"
            color={margen === null ? C.tenue : bajoObjetivo ? C.neg : C.pos}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <FilaDato icono={<IcoCliente s={14} />} rotulo="Cliente" valor={p.cliente ?? 'sin cliente'} color={p.cliente ? C.tinta : C.tenue} />
          <FilaDato
            icono={<IcoLista s={14} />}
            rotulo="Partidas"
            valor={p.n_partidas === 0 ? 'sin cargar' : `${p.n_partidas} ${p.n_partidas === 1 ? 'partida' : 'partidas'}`}
            color={p.n_partidas === 0 ? C.warn : C.tinta}
          />
          <FilaDato
            icono={<IcoReloj s={14} />}
            rotulo="HH del cómputo"
            valor={conCifras && p.hh_previstas !== null ? `${entero(p.hh_previstas)} HH` : 'sin cargar'}
            color={conCifras && p.hh_previstas !== null ? C.tinta : C.warn}
          />
          <FilaDato
            icono={<IcoFecha s={14} />}
            rotulo="Última revisión"
            valor={p.fecha_cotizacion ? `${fecha(p.fecha_cotizacion)} · rev ${p.version}` : 'sin fecha'}
            color={p.fecha_cotizacion ? C.tinta : C.tenue}
          />
          <FilaDato
            icono={<IcoFecha s={14} />}
            rotulo="Congelado"
            valor={p.congelada_en ? (fecha(p.congelada_en) ?? 'sin fecha') : 'todavía no'}
            color={p.congelada_en ? C.tinta : C.tenue}
          />
          <FilaDato
            icono={<IcoObra s={14} />}
            rotulo="Obra"
            valor={p.obra_canonica_id ? (p.obra_nombre ?? 'vinculada') : p.estado === 'adjudicada' ? 'sin crear' : 'no corresponde'}
            color={p.obra_canonica_id ? C.tinta : p.estado === 'adjudicada' ? C.warn : C.tenue}
          />
        </div>

        {/* EL AVISO Y EL CHIP «CON PROBLEMA» DICEN LA MISMA FRASE: los dos salen de `problemasDe()`,
            así que no pueden separarse. Antes el chip contaba cuatro deudas y el panel mencionaba
            dos: el filtro mandaba a alguien a una ficha que no explicaba por qué estaba ahí. */}
        {problemas.length > 0 && (
          <Link
            href={`/presupuestos/${p.id}`}
            data-testid="panel-problemas"
            style={{
              marginTop: 14, border: `1px solid ${'#F0E1CD'}`, background: '#FDF6EE', borderRadius: 8,
              padding: '10px 11px', display: 'flex', alignItems: 'center', gap: 9,
            }}
          >
            <span style={{ display: 'flex', color: C.warn, flexShrink: 0 }}><IcoAlerta s={15} /></span>
            <span style={{ fontSize: '12px', fontWeight: 500, color: C.tinta, minWidth: 0 }}>
              {problemas.join(' · ')}
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', color: C.tenue, flexShrink: 0 }}>
              <IcoChevron s={13} />
            </span>
          </Link>
        )}

        {/* DESVÍO DECLARADO: el mockup cierra el panel con un bloque «Revisiones» que lista cada
            versión con su delta de precio («+4,2 %»). Ese dato NO existe en `cotizacion_cascada`:
            haría falta leer las otras versiones del mismo número y comparar sus precios, o sea un
            viaje al servidor por cada fila que alguien toca — exactamente el viaje que este panel
            existe para no pagar. Inventar los deltas está prohibido, así que el bloque no se dibuja
            y el acceso a las versiones queda en el botón «Ver versiones» de arriba. */}
      </div>
    </aside>
  )
}

/** El botón primario del panel: el paso que sigue de verdad, según el estado. */
function Primaria({
  p, conversion, problemas, pendiente, onMover,
}: {
  p: PresupuestoCascada
  conversion: { puede: boolean; motivo: string | null }
  problemas: number
  pendiente: boolean
  onMover: (a: 'enviada' | 'adjudicada') => void
}) {
  const clase =
    'inline-flex items-center gap-1.5 rounded-[6px] bg-[#FDC900] px-[13px] py-[7px] text-[12.5px] font-semibold text-[#1F1F1E] transition-colors hover:bg-[#EEBE00] disabled:cursor-not-allowed disabled:opacity-60'

  if (p.estado === 'adjudicada') {
    return conversion.puede ? (
      <Link href={`/presupuestos/${p.id}/convertir`} data-testid="panel-convertir" className={clase}>
        <IcoConvertir s={14} /> Preparar obra
      </Link>
    ) : (
      <span data-testid="panel-convertir-motivo" style={{ fontSize: '11.5px', color: C.tenue, minWidth: 0 }}>
        {conversion.motivo}
      </span>
    )
  }

  // Un borrador con deudas de carga NO se manda: primero se completa el precio. Es la misma
  // lectura del mockup («Completar precios» cuando faltan las 12 partidas vacías).
  if (p.estado === 'borrador' && (problemas > 0 || p.n_partidas === 0)) {
    return (
      <Link href={`/presupuestos/${p.id}`} data-testid="panel-completar" className={clase}>
        <IcoLista s={14} /> Completar precios
      </Link>
    )
  }

  if (p.estado === 'borrador') {
    return (
      <button type="button" disabled={pendiente} onClick={() => onMover('enviada')} data-testid="panel-enviar" className={clase}>
        <IcoEnviar s={14} /> {pendiente ? 'Enviando…' : 'Enviar al cliente'}
      </button>
    )
  }

  if (p.estado === 'enviada') {
    return (
      <button type="button" disabled={pendiente} onClick={() => onMover('adjudicada')} data-testid="panel-ganar" className={clase}>
        <IcoConvertir s={14} /> {pendiente ? 'Guardando…' : 'Marcar ganado'}
      </button>
    )
  }

  // perdida · anulada: el ciclo terminó. Un botón acá sería un botón que no hace nada.
  return (
    <Link href={`/presupuestos/${p.id}`} data-testid="panel-completar" className={clase}>
      <IcoLista s={14} /> Abrir el cómputo
    </Link>
  )
}

function BotonCuadrado({ title, href, children, testid }: { title: string; href: string; children: ReactNode; testid?: string }) {
  return (
    <Link
      href={href}
      title={title}
      data-testid={testid}
      className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[6px] border border-[#E7E6E2] text-[#6B6B67] transition-colors hover:border-[#D7D5CF] hover:text-[#1F1F1E]"
    >
      <span className="sr-only">{title}</span>
      {children}
    </Link>
  )
}

/**
 * Los dos bloques de arriba del panel: `background:#FAFAF8;border:1px solid #EFEEEA;borderRadius:8;
 * padding:10px 11px`, rótulo 10px y valor mono 16px/600.
 *
 * 16px y no más: «$ 144,8 M» entra, pero el mismo bloque muestra «sin cotizar» cuando no hay
 * partidas, y esa palabra en 16px de mono partiría el bloque en dos renglones. La falta se escribe
 * en el tamaño del texto, no en el del número: no es un número.
 */
function Bloque({ rotulo, valor, falta, color = C.tinta }: { rotulo: string; valor: string | null; falta: string; color?: string }) {
  return (
    <div style={{ background: C.superficieTenue, border: `1px solid ${C.lineaBloque}`, borderRadius: 8, padding: '10px 11px' }}>
      <div style={{ fontSize: '10px', color: C.tenue, letterSpacing: '.05em' }}>{rotulo}</div>
      <div
        className="font-mono tabular-nums"
        style={{ fontSize: '16px', fontWeight: 600, color: valor === null ? C.tenue : color, marginTop: 3 }}
      >
        {valor ?? <span className="font-sans" style={{ fontSize: '12.5px', fontWeight: 400 }}>{falta}</span>}
      </div>
    </div>
  )
}
