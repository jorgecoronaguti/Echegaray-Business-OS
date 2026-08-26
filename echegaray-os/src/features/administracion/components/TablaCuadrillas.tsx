// 21 v2 · LA LISTA DE CUADRILLAS — porte medido de `21 · Cuadrillas y HH v2.dc.html` (líneas 95-137).
//
// ═══ QUÉ CAMBIÓ CONTRA EL PORTE ANTERIOR ═══
//
// La caja. La versión de agosto dibujaba `ListaCanon` —borde, radio 10, encabezado gris de 38px y
// pie de totales adentro—, y el v2 borra el objeto entero: criterio 3 del patrón, «sin cajas; filos,
// tipografía y números tabulares». Tampoco hay fila de rótulos de columna: el mockup abre directo
// con la primera cuadrilla, cerrada arriba por un filo `#D7D5CF` que hace de encabezado.
//
// Y la fila dejó de ser un renglón para pasar a ser un BLOQUE: al elegirla se despliega su gente
// debajo, indentada 26px (criterio 4, jerarquía por indentación). Antes eso vivía en un panel
// lateral de 372px que empujaba la lista a 600px y estrangulaba el nombre de la cuadrilla.
//
// ═══ LAS COLUMNAS DEL MOCKUP QUE NO SE DIBUJAN, Y POR QUÉ ═══
//
//   «5/6 PRESENTES»  se dibuja como FICHADOS. `presencia_del_dia` guarda MARCAS, no asistencia: sin
//                    fichar incluye al que no tiene teléfono, al que le negó el permiso al GPS y al
//                    que faltó. Escribir «presentes» convertiría esa ignorancia en una ausencia.
//   «REND. 1,08»     no tiene fuente. Exige HH DE BASE de lo ejecutado por la cuadrilla, y la base
//                    maestra las tiene por TAREA mientras que estas HH se imputan por PERSONA y
//                    obra: no existe el vínculo cuadrilla → tarea que las haría comparables.

import Link from 'next/link'
import { CAJA_CONTENIDO, V } from '@/shared/components/v2/patron'
import { BarraDeCostado } from '@/shared/components/v2/segundoNivel'
import { IconoCuadrilla } from '@/shared/components/iconos'
import type { Cuadrilla, Integrante } from '../types'
import type { Fichaje } from '../services/hhPorPeriodo'

/** HH sin decimales: el mockup escribe «486 HH», y media hora no cambia una decisión de dotación. */
const horas = (n: number) => `${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })} HH`

/** Las dos grillas del mockup (`21v2:227`): bajo 1250px se suelta FICHADOS, nunca la identidad. */
const GRILLA = 'grid items-center gap-[14px] grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,80px)]'
  + ' min-[1250px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,150px)_minmax(0,80px)]'

export interface DespliegueDeCuadrilla {
  /** Los integrantes VIGENTES de la cuadrilla abierta, en el orden en que se muestran. */
  integrantes: Integrante[]
  /** HH del período de cada persona. Ausente del mapa = sin registros, que NO es haber hecho 0. */
  porPersona: Map<string, number>
  /** Quiénes marcaron hoy. `null` = no se pudo leer la presencia; entonces no se afirma ninguna. */
  fichadosHoy: Set<string> | null
  /** Dónde se edita la cuadrilla, se archiva y se toca su gente. */
  hrefEditar: string
}

export function TablaCuadrillas({
  cuadrillas, abierta, hrefDe, hh, fichaje, despliegue, vacio,
}: {
  cuadrillas: Cuadrilla[]
  abierta?: string
  hrefDe: (id: string) => string
  /** HH trabajadas del período por cuadrilla. `undefined` = no se leyeron. */
  hh?: Map<string, number>
  /** Cuántos de los vigentes marcaron hoy. `undefined` = no se pudo leer la presencia. */
  fichaje?: Map<string, Fichaje>
  despliegue?: DespliegueDeCuadrilla
  vacio: string
}) {
  if (cuadrillas.length === 0) {
    return (
      <p style={{ fontSize: '12.5px', color: V.apagado, paddingTop: 4 }} data-testid="cuadrillas-vacio">
        {vacio}
      </p>
    )
  }

  return (
    <div data-testid="tabla-cuadrillas">
      {cuadrillas.map((c) => {
        const esta = c.id === abierta
        const f = fichaje?.get(c.id)
        const suyas = hh?.get(c.id)
        return (
          <div key={c.id} style={{ marginBottom: 16 }}>
            <Link
              href={hrefDe(c.id)} prefetch={false} data-testid="fila-cuadrilla"
              className={`${GRILLA} ${CAJA_CONTENIDO} hover:bg-[#F2F1ED]`}
              style={{
                // 44 y no los 40 de una fila de tabla: la de la 21 es la cabeza de un bloque que se
                // despliega, no un renglón de lista (`21v2:99`).
                height: 44, paddingLeft: 13,
                borderTop: `1px solid ${V.lineaFuerte}`, borderBottom: `1px solid ${V.lineaFila}`,
                background: esta ? V.seleccion : 'transparent',
                // EL FILO ÁMBAR DICE «ESTO BLOQUEA», NO «ESTO ESTÁ ELEGIDO»: sobrevive a la
                // selección, que se expresa sólo con el fondo.
                boxShadow: c.obras_actuales ? 'none' : `inset 2px 0 0 ${V.warn}`,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ display: 'flex', color: V.inerteTrabajo, flexShrink: 0 }}>
                  <IconoCuadrilla className="h-4 w-4" />
                </span>
                <span className="truncate" style={{ fontSize: '13.5px', fontWeight: 600, color: V.tinta }}>
                  {c.nombre}
                </span>
                <span style={{ fontSize: '11.5px', color: V.tenue, flexShrink: 0 }}>
                  {c.responsable ?? 'sin capataz'}{!c.activa && ' · archivada'}
                </span>
              </span>

              <span
                className="truncate"
                style={{ fontSize: '12px', color: c.obras_actuales ? V.tintaSuave : V.warn }}
              >
                {c.obras_actuales ?? 'sin obra asignada'}
              </span>

              {/* FICHADOS, no «presentes». Sin lectura de presencia la columna dice «sin leer»: un
                  «0/6» ahí afirmaría que no fue nadie. */}
              <span className="hidden min-w-0 items-center gap-2 min-[1250px]:flex" data-testid="fichados-cuadrilla">
                {f
                  ? (
                      <>
                        <span style={{ display: 'flex', flex: 1, minWidth: 40 }}>
                          <BarraDeCostado
                            fraccion={f.integrantes === 0 ? 0 : f.fichados / f.integrantes}
                            color={f.fichados === f.integrantes ? '#067647' : V.warn}
                          />
                        </span>
                        <span
                          className="font-mono tabular-nums"
                          style={{
                            fontSize: '11.5px', flexShrink: 0,
                            color: f.integrantes > 0 && f.fichados === f.integrantes ? '#067647' : V.warn,
                          }}
                        >
                          {f.fichados}/{f.integrantes} fichados
                        </span>
                      </>
                    )
                  : <span style={{ fontSize: '11.5px', color: V.tenue }}>sin leer</span>}
              </span>

              <span
                className="font-mono tabular-nums" data-testid="hh-cuadrilla"
                style={{
                  fontSize: '13px', fontWeight: 600, textAlign: 'right',
                  color: suyas === undefined ? V.tenue : V.tinta,
                }}
              >
                {suyas === undefined ? '—' : horas(suyas)}
              </span>
            </Link>

            {esta && despliegue && (
              <Gente {...despliegue} nombre={c.nombre} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/** El despliegue de una cuadrilla: su gente indentada, y el enlace a lo que se puede cambiar. */
function Gente({ integrantes, porPersona, fichadosHoy, hrefEditar, nombre }: DespliegueDeCuadrilla & { nombre: string }) {
  return (
    <div data-testid="gente-cuadrilla">
      {integrantes.length === 0 && (
        <p style={{ fontSize: '12px', color: V.warn, padding: '8px 0 8px 39px' }} data-testid="cuadrilla-sin-gente">
          Nadie vigente en esta cuadrilla. Sus HH no pueden imputarse a nadie.
        </p>
      )}
      {integrantes.map((i) => {
        const suyas = porPersona.get(i.persona_id)
        const marco = fichadosHoy?.has(i.persona_id)
        return (
          <div
            key={i.id}
            className={`${GRILLA} ${CAJA_CONTENIDO} hover:bg-[#FAFAF8]`}
            style={{ height: 34, paddingLeft: 13, borderBottom: `1px solid ${V.lineaPanel}` }}
            data-testid="fila-integrante"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, paddingLeft: 26 }}>
              <span
                aria-hidden
                style={{
                  width: 6, height: 6, borderRadius: 3, flexShrink: 0,
                  background: fichadosHoy == null ? V.inerte : (marco ? '#067647' : V.warn),
                }}
              />
              <span className="truncate" style={{ fontSize: '12px', color: V.tinta }}>
                {i.nombre_completo ?? 'sin nombre en el legajo'}
              </span>
              <span style={{ fontSize: '11px', color: V.lupa, flexShrink: 0 }}>
                {i.categoria ?? 'sin categoría'}
              </span>
            </span>

            {/* «SIN FICHAR» NO ES «AUSENTE», y sin lectura de presencia no se dice ninguna de las dos. */}
            <span style={{ fontSize: '11.5px', color: marco ? V.tintaSuave : V.warn }}>
              {fichadosHoy == null ? '' : (marco ? 'fichó hoy' : 'sin fichar hoy')}
            </span>

            <span className="hidden min-[1250px]:block" />

            <span
              className="font-mono tabular-nums"
              style={{ fontSize: '11.5px', color: suyas === undefined ? V.tenue : V.apagado, textAlign: 'right' }}
            >
              {suyas === undefined ? '—' : horas(suyas)}
            </span>
          </div>
        )
      })}
      <Link
        href={hrefEditar} prefetch={false} data-testid="editar-cuadrilla"
        className="hover:text-[#30302F]"
        style={{ display: 'inline-block', fontSize: '12.5px', fontWeight: 500, color: V.tinta, margin: '10px 0 0 39px' }}
      >
        Editar {nombre} →
      </Link>
    </div>
  )
}
