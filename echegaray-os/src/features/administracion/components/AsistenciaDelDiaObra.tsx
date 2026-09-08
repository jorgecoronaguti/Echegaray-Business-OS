// LA ASISTENCIA DEL DÍA DE UNA OBRA — lista compacta, no una tarjeta por persona.
//
// ═══ POR QUÉ ACÁ NO HAY TARJETAS Y EN EL FICHAJE SÍ ═══
//
// `JornadaPorObra.tsx` dibuja fichas porque cada marca de fichaje trae cosas que no son
// comparables entre sí —hora, reloj corriendo, punto de GPS, enlace al mapa— y necesitan su propio
// marco. Esto es lo contrario: una lista de filas idénticas donde lo único que cambia es un número
// de horas o una palabra. Diecisiete cajas para diecisiete renglones es exactamente la
// «tarjeta por cada dato» que el patrón prohíbe, y era la mitad del ruido de la pantalla vieja.
//
// ═══ NINGÚN ESTADO SE DICE SÓLO CON COLOR ═══
//
// Cada fila escribe la palabra. Y «sin cargar» va en gris, no en ámbar: ámbar significa que algo
// bloquea, y que a las nueve de la mañana falte cargar el día no bloquea nada.

import Link from 'next/link'
import { ALTO_V2, V } from '@/shared/components/v2/patron'
import { hs } from '../services/jornadaPorObra'
import type { ObraDelDia, PersonaDelDia } from '../services/asistenciaDelDia'

/**
 * LAS DOS CAPAS DE LA FILA, EN HORIZONTAL Y SIN QUE UNA HABLE POR LA OTRA (08/09/2026).
 *
 * El dueño, por tercera vez: *«una cosa es asistencia o activo en el día y otra cosa son las
 * cantidades de hs»*. Antes esta fila escribía «9 hs» donde va el ESTADO —la cantidad ocupaba el
 * lugar del hecho— y «sin cargar» donde no había número, que se lee como falta.
 *
 *   ESTADO   ● presente · A ausente · L licencia · «sin marcar». Sale de lo declarado o del
 *            fichaje, NUNCA de un número de horas. Ningún estado se dice sólo con color: la
 *            palabra siempre está.
 *   HORAS    la cantidad, monoespaciada y en tinta plena. Sin color de estado: 9 h no es «bien»
 *            ni «mal», es 9 h. Cuando no hay, no se escribe nada — el hueco no acusa a nadie.
 */
function Estado({ p }: { p: PersonaDelDia }) {
  return (
    <span className="shrink-0" style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <Presencia p={p} />
      {p.horas !== null && (
        <span
          className="font-mono tabular-nums text-ink"
          style={{ fontSize: '12px', fontWeight: 500 }}
          data-capa="horas"
        >
          {hs(p.horas)} hs
        </span>
      )}
    </span>
  )
}

/** SÓLO EL ESTADO. `sin_marcar` va en el gris más tenue y sin símbolo: no hay palabra que decir
 *  sobre un dato que no existe, y «no fichó» acusaría a todo el plantel. */
function Presencia({ p }: { p: PersonaDelDia }) {
  if (p.presencia === 'presente') {
    return (
      <span className="text-pos" style={{ fontSize: '11.5px' }} data-capa="presencia">
        <span style={{ fontWeight: 600 }}>●</span> presente
      </span>
    )
  }
  if (p.presencia === 'sin_marcar') {
    return (
      <span className="text-faint" style={{ fontSize: '11.5px' }} data-capa="presencia">sin marcar</span>
    )
  }
  return (
    <span
      className={`truncate ${p.presencia === 'ausente' ? 'text-neg' : 'text-muted'}`}
      style={{ fontSize: '11.5px' }}
      data-capa="presencia"
    >
      {p.presencia === 'licencia' ? 'licencia' : 'ausente'}
      {/* EL CONFLICTO SE VE, NO SE RESUELVE. El jefe declaró que no vino y el día tiene horas
          cargadas: las dos afirmaciones no pueden ser ciertas y una de ellas se liquida. La
          pantalla no elige — lo dice y lo deja resolver a quien sabe cuál está mal. */}
      {p.conflicto && (
        <span
          data-testid="conflicto-dia"
          title="Ausencia declarada y horas cargadas el mismo día"
          className="text-neg"
          style={{ fontWeight: 600 }}
        >
          {' '}· con horas cargadas
        </span>
      )}
      {/* EL MOTIVO SÓLO SI SE DECLARÓ. Sin él no se escribe «sin motivo»: la fila ya dice lo que
          se sabe, y agregarle una carencia la haría sonar a error de alguien. */}
      {p.motivo && <span className="text-faint"> · {p.motivo}</span>}
    </span>
  )
}

export function AsistenciaDeLaObra({ obra, testid }: { obra: ObraDelDia; testid?: string }) {
  return (
    <section style={{ marginBottom: 20 }} data-testid={testid} data-obra={obra.obraId ?? 'sin-obra'}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: 6, borderBottom: `1px solid ${V.lineaFuerte}`, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 600, color: V.tinta }}>{obra.nombre}</h2>
        {/* DOS CUENTAS SEPARADAS: quién está (presencia) y cuánto hay cargado (horas). «N de M con
            horas» era una sola, y hacía pasar la carga administrativa por asistencia. */}
        <span
          style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 600, color: V.apagado }}
          data-testid="conteo-obra"
        >
          {obra.presentes} presentes · {obra.ausentes} ausentes · {obra.licencias} licencia · {obra.sinMarcar} sin marcar
        </span>
        <span
          className="font-mono tabular-nums"
          style={{ fontSize: '11.5px', color: V.tenue }}
          data-testid="conteo-horas-obra"
        >
          {hs(obra.horas)} hs · {obra.sinHoras} sin horas
        </span>
      </div>

      <ul>
        {obra.gente.map((p) => (
          <li
            key={p.personaId}
            data-testid="fila-asistencia"
            data-presencia={p.presencia}
            data-horas={p.horas ?? ''}
            data-persona={p.personaId}
            className="hover:bg-[#F2F1ED]"
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              minHeight: ALTO_V2.hija, padding: '0 8px',
              borderBottom: `1px solid ${V.lineaFila}`,
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <Link
                href={`/administracion/personas/${p.personaId}`}
                prefetch={false}
                className="block truncate hover:underline"
                style={{
                  fontSize: '12.5px',
                  // EL NOMBRE NO SE APAGA POR NO TENER HORAS: que a alguien no le hayan cargado
                  // el día no lo hace menos parte del plantel de la obra.
                  fontWeight: 500,
                  color: V.tinta,
                }}
              >
                {p.nombre}
              </Link>
            </span>
            {/* LA MISMA PALABRA QUE LA COLUMNA CATEGORÍA DE PLANTEL, guión bajo incluido: la base
                guarda `oficial_especializado` y las dos pantallas tienen que decir lo mismo de la
                misma persona (decisión del dueño del 08/09, ver `notaDe`). */}
            <span className="truncate shrink-0" style={{ fontSize: '11px', color: V.tenue, maxWidth: 160 }}>
              {p.categoria?.replace('_', ' ') ?? ''}
            </span>
            <Estado p={p} />
          </li>
        ))}
      </ul>
    </section>
  )
}
