// 17 · EL PANEL DE UNA TAREA TIPO — porte literal del panel de `17 · Base Maestra Tareas.dc.html`.
//
// ═══ MEDIDO DEL CANÓNICO (líneas 145-260) ═══
//
//   panel    `width:392px;marginLeft:12px;background:#FFFFFF;border:1px solid #E7E6E2;
//             borderRadius:10px;display:flex;flexDirection:column;overflow:hidden`
//   cabeza   `padding:14px 16px 0` · «Editar tarea» amarillo `7px 13px` · Duplicar 30×30 · ✕
//   título   código mono 12px #6B6B67 + nombre 15,5px/600 + rubro 11,5px #6B6B67
//   solapas  Resumen · Composición · Historial · 12px `padding:7px 9px` · activa `inset 0 -2px 0 #FDC900`
//   cuerpo   `flex:1;overflowY:auto;padding:14px 16px 16px`
//   tarjetas BASE / REAL DE OBRA · `1fr 1fr` gap 10 · valor mono 17px/600
//
// ═══ LAS TRES SOLAPAS DEL ZIP CONTRA LAS SEIS QUE HABÍA ═══
//
// El panel anterior tenía Resumen · Análisis · Secuencia · Esfuerzo · Versiones · Uso. El canónico
// dibuja TRES, y ninguna información se tira: Análisis y Secuencia entran en **Composición** (de qué
// está hecha y en qué orden se ejecuta); Esfuerzo, Versiones y Uso entran en **Historial** (qué
// aprendimos, qué versiones hubo y dónde se usó). La decisión —aceptar o descartar la recomendación—
// sube al Resumen, que es exactamente donde el canónico pone «Actualizar la base con el real».
//
// ═══ «DUPLICAR» NO ESTÁ, Y ES UNA DECISIÓN ═══
//
// Duplicar una tarea tipo tiene que copiar también su análisis vigente con todas sus líneas, que es
// la maquinaria de versionado de `analisisActions` (cuatro pasos sin transacción). Media medida —una
// tarea nueva con el nombre copiado y SIN composición— es peor que no ofrecerla: nace «Sin análisis»
// y aporta 0 HH y 0 costo a cualquier presupuesto que la use. DECLARADO, no olvidado.

import Link from 'next/link'
import {
  BotonMarca, C, IcoAlerta, IcoBaseMaestra, IcoCerrar, IcoCuadrilla, IcoEditar, IcoEquipo,
  IcoHistorial, IcoMaterial, PANEL,
} from '@/shared/components/canon'
import { Aviso } from '@/shared/components/ds'
import { BotonAccion } from '@/shared/components/ui'
import type { FichaTarea as Ficha, LineaAnalisis } from '../types'
import { desvioObservado, fechaLarga, motivoDelEstado, numero } from '../services/reglas'
import { CajaPanel, Cifra, FILA_PANEL, Linea, Seccion } from './panel'
import { SolapaAnalisis } from './SolapaAnalisis'
import { Decision } from './SolapaRendimiento'
import { SolapaHistorial, Secuencia } from './SolapaHistorial'

export const SOLAPAS = ['resumen', 'analisis', 'historial'] as const
export type Solapa = (typeof SOLAPAS)[number]

const ETIQUETA: Record<Solapa, string> = {
  resumen: 'Resumen', analisis: 'Composición', historial: 'Historial',
}

/**
 * LA CLAVE `analisis` NO SE RENOMBRA, EL RÓTULO SÍ. La clave viaja en la URL (`?s=analisis`) y está
 * en enlaces mandados por chat, en marcadores y en los tests. Lo que el canónico cambia es la
 * PALABRA en pantalla.
 *
 * `?s=rendimiento`, `?s=secuencia`, `?s=versiones` y `?s=uso` —las cuatro solapas que se fundieron—
 * caen donde ahora vive su contenido en vez de en Resumen: quien tenía guardado un enlace a
 * «Esfuerzo» llega a Historial, que es donde está la cadena.
 */
export function solapaDe(v: string | undefined, economia: boolean): Solapa {
  const s = v === 'secuencia' ? 'analisis'
    : v === 'rendimiento' || v === 'versiones' || v === 'uso' ? 'historial'
      : (SOLAPAS as readonly string[]).includes(v ?? '') ? (v as Solapa) : 'resumen'
  // Pedir la composición sin permiso NO cae en Resumen: las cantidades son operativas y el jefe de
  // obra las necesita. Lo que no se dibuja adentro son las columnas de costo.
  return s === 'analisis' && !economia ? 'analisis' : s
}

export function FichaTarea({
  ficha, solapa, economia, hrefSolapa, hrefCerrar, hrefEditar, archivar,
}: {
  ficha: Ficha
  solapa: Solapa
  economia: boolean
  hrefSolapa: (s: Solapa) => string
  hrefCerrar: string
  hrefEditar?: string
  /** Sacarla de la base viva. No la borra: `analisis` y `obra_actividad` cuelgan de ella. */
  archivar?: (tareaId: string) => Promise<{ ok: true; mensaje?: string } | { ok: false; error: string }>
}) {
  const { tarea } = ficha

  return (
    <CajaPanel ancho={PANEL.analisis} testid="ficha-tarea">
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {hrefEditar && (
            <BotonMarca href={hrefEditar} testid="editar-tarea">
              <IcoEditar s={14} /> Editar tarea
            </BotonMarca>
          )}
          {/* ARCHIVAR NO ESTÁ EN EL ZIP y se queda igual: es la única salida que tiene una tarea
              cargada por error, y borrarla no es una opción (le cuelga el costo de obras vendidas).
              Va discreta, a la derecha de la primaria, como el resto de las bajas del sistema. */}
          {archivar && (
            <BotonAccion accion={archivar} args={[tarea.id]} tono="peligro" testid="archivar-tarea">
              Archivar
            </BotonAccion>
          )}
          <Link
            href={hrefCerrar}
            scroll={false}
            data-testid="cerrar-ficha"
            title="Cerrar"
            aria-label="Cerrar la ficha"
            style={{ marginLeft: 'auto', display: 'flex', color: C.tenue }}
          >
            <IcoCerrar s={15} />
          </Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 12 }}>
          <span className="font-mono" style={{ fontSize: '12px', color: C.apagado }}>{tarea.codigo}</span>
          <h2 style={{ fontSize: '15.5px', fontWeight: 600, color: C.tinta, lineHeight: 1.3, minWidth: 0, margin: 0 }}>
            {tarea.nombre}
          </h2>
        </div>
        <div style={{ fontSize: '11.5px', color: C.apagado, marginTop: 3 }}>
          {tarea.division ?? 'sin rubro'}
          {tarea.version != null ? ` · v${tarea.version}` : ''}
        </div>

        <nav data-testid="solapas-ficha" style={{ display: 'flex', alignItems: 'stretch', marginTop: 11, borderBottom: `1px solid ${C.linea}` }}>
          {SOLAPAS.map((s) => (
            <Link
              key={s}
              href={hrefSolapa(s)}
              scroll={false}
              prefetch={false}
              data-testid={`solapa-${s}`}
              aria-current={s === solapa ? 'page' : undefined}
              style={{
                fontSize: '12px', padding: '7px 9px',
                color: s === solapa ? C.tinta : C.apagado,
                fontWeight: s === solapa ? 600 : 400,
                boxShadow: s === solapa ? `inset 0 -2px 0 ${C.marca}` : 'none',
              }}
            >
              {ETIQUETA[s]}
            </Link>
          ))}
        </nav>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 16px' }} data-testid={`panel-${solapa}`}>
        {ficha.avisos.map((a) => (
          <div key={a} style={{ marginBottom: 12 }}><Aviso tono="warn">{a}</Aviso></div>
        ))}
        {solapa === 'resumen' && <Resumen ficha={ficha} />}
        {solapa === 'analisis' && (
          <>
            <SolapaAnalisis ficha={ficha} economia={economia} />
            <Secuencia ficha={ficha} />
          </>
        )}
        {solapa === 'historial' && <SolapaHistorial ficha={ficha} />}
      </div>
    </CajaPanel>
  )
}

// ═══ RESUMEN — el cuerpo del canónico, en su orden ═════════════════════════════════════════════

function Resumen({ ficha }: { ficha: Ficha }) {
  const { tarea, rendimiento, lineas, obras } = ficha
  const d = desvioObservado(tarea.hs_unitarias, tarea.hs_observado)
  const tono = d == null
    ? { fondo: C.superficieTenue, borde: C.lineaBloque, color: C.tenue }
    : d.direccion === 'peor'
      ? { fondo: '#FDF6EE', borde: '#F0E1CD', color: C.warn }
      : d.direccion === 'mejor'
        ? { fondo: '#F5FAF7', borde: '#E2EFE8', color: C.pos }
        : { fondo: '#F5FAF7', borde: '#E2EFE8', color: C.tinta }

  return (
    <div data-testid="resumen-tarea">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Cifra rotulo="BASE" pie={`HH por ${tarea.unidad}`}>
          {/* «sin análisis» y no 0: un cero afirmaría que la tarea no lleva mano de obra. */}
          {numero(tarea.hs_unitarias, 2) ?? <span style={{ fontSize: '13px', color: C.tenue }}>sin análisis</span>}
        </Cifra>
        <Cifra
          rotulo="REAL DE OBRA"
          fondo={tono.fondo}
          borde={tono.borde}
          color={tono.color}
          pie={d == null
            ? 'sin obras con dato'
            : `${numero(d.ratio, 2)}× sobre la base · ${rendimiento?.obras ?? 0} ${rendimiento?.obras === 1 ? 'obra' : 'obras'}`}
        >
          {numero(tarea.hs_observado, 2) ?? <span style={{ fontSize: '13px', color: C.tenue }}>sin medir</span>}
        </Cifra>
      </div>

      {/* «ACTUALIZAR LA BASE CON EL REAL» — y acá SE HACE, no se navega a otro lado. El canónico
          dibuja una tarjeta con un chevron; el pedido del dueño es que la acción funcione en el
          lugar, así que la tarjeta trae adentro la decisión de verdad: aceptar y versionar, o
          descartar con su motivo.
          APARECE CUANDO EL MOTOR PROPUSO ALGO, no cuando la pantalla calcula una diferencia:
          `hs_recomendado` en NULL significa que la muestra no alcanza, y ofrecer la acción ahí
          invitaría a meter un caso raro en la base para siempre. */}
      {rendimiento?.hs_recomendado != null && (
        <div
          data-testid="sugerencia-actualizar"
          style={{ marginTop: 12, border: '1px solid #F0E1CD', background: '#FDF6EE', borderRadius: 8, padding: '10px 11px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ display: 'flex', color: C.warn, flexShrink: 0 }}><IcoBaseMaestra s={15} /></span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: 500, color: C.tinta }}>Actualizar la base con el real</div>
              <div style={{ fontSize: '11px', color: C.apagado, marginTop: 1 }}>
                pasar de {numero(tarea.hs_unitarias, 2) ?? 'sin dato'} a {numero(rendimiento.hs_recomendado, 2)} HH/{tarea.unidad}{' '}
                afecta los presupuestos que vengan
              </div>
            </div>
          </div>
          <Decision tareaTipoId={tarea.id} r={rendimiento} />
        </div>
      )}

      {tarea.estado !== 'completo' && (
        <div style={{ marginTop: 12 }}>
          <Aviso tono={tarea.estado === 'sin_analisis' ? 'neg' : 'warn'} titulo="Deuda de carga">
            {motivoDelEstado(tarea.estado, tarea.falta) ?? 'Falta completar el análisis.'}
          </Aviso>
        </div>
      )}

      <Seccion titulo="Composición por unidad">
        {lineas.length === 0 ? (
          <Linea>Sin composición cargada: esta tarea no aporta HH ni costo a ningún presupuesto.</Linea>
        ) : (
          lineas.map((l) => (
            <div key={l.id} style={FILA_PANEL}>
              <span title={RUBRO[l.tipo]} style={{ display: 'flex', color: C.apagado, flexShrink: 0 }}>
                {ICONO[l.tipo]}
              </span>
              <span style={{ fontSize: '12px', color: C.tinta, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {l.nombre}
              </span>
              <span className="font-mono tabular-nums" style={{ fontSize: '12px', color: C.tintaSuave, flexShrink: 0 }}>
                {numero(l.cantidad, 2)} {l.unidad}
              </span>
            </div>
          ))
        )}
      </Seccion>

      <Seccion titulo="Rendimiento por obra">
        {obras.length === 0 ? (
          <Linea>Ninguna obra terminó esta tarea con horas imputadas todavía: no hay real que comparar.</Linea>
        ) : (
          obras.map((o) => (
            <div key={`${o.obra_id}-${o.obra_nombre}`} style={FILA_PANEL}>
              <span
                title={`${o.muestra} ${o.muestra === 1 ? 'registro' : 'registros'}${o.confianza ? ` · confianza ${o.confianza}` : ''}`}
                style={{ fontSize: '12px', color: C.tinta, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {o.obra_nombre}
                {/* DE QUÉ CLASE ES EL DATO. Desde que XSAS mide la obra conviven la referencia con
                    la que se venía cotizando y lo medido en ejecución, y una barra sin rótulo las
                    presenta como si fueran lo mismo. */}
                {o.naturaleza && (
                  <span style={{ fontSize: '10px', color: C.tenue, marginLeft: 6 }}>
                    {o.naturaleza === 'REFERENCIA' ? 'referencia'
                      : o.naturaleza === 'VALIDADO' ? 'real · validado'
                        : o.naturaleza === 'CANDIDATO' ? 'real · 1 caso'
                          : 'mezcla'}
                  </span>
                )}
              </span>
              <div style={{ width: 74, height: 5, background: C.pista, borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ height: '100%', width: `${o.ancho}%`, background: o.direccion === 'peor' ? C.warn : o.direccion === 'mejor' ? C.pos : C.info }} />
              </div>
              <span
                className="font-mono tabular-nums"
                style={{ fontSize: '11.5px', width: 46, textAlign: 'right', flexShrink: 0, color: o.direccion === 'peor' ? C.warn : o.direccion === 'mejor' ? C.pos : C.tinta }}
              >
                {o.ratio == null ? numero(o.hs_unitarias, 2) : `${numero(o.ratio, 2)}×`}
              </span>
            </div>
          ))
        )}
      </Seccion>

      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 9, fontSize: '11.5px', color: C.tenue }}>
        <IcoHistorial s={14} />
        {ficha.actualizado
          ? `Última actualización ${fechaLarga(ficha.actualizado)} · ${obras.length} ${obras.length === 1 ? 'obra' : 'obras'} con dato real`
          : 'Sin análisis vigente: nunca se actualizó'}
      </div>
    </div>
  )
}

const RUBRO: Record<LineaAnalisis['tipo'], string> = {
  mano_obra: 'Mano de obra', carga_social: 'Carga social', material: 'Material', equipo: 'Equipo', otro: 'Otro',
}

const ICONO: Record<LineaAnalisis['tipo'], React.ReactNode> = {
  mano_obra: <IcoCuadrilla s={15} />,
  carga_social: <IcoCuadrilla s={15} />,
  material: <IcoMaterial s={15} />,
  equipo: <IcoEquipo s={15} />,
  otro: <IcoAlerta s={15} />,
}
