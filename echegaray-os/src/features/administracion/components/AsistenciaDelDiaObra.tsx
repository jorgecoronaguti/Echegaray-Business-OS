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

/** La palabra de la derecha. Nunca «no fichó»: esta lista no sabe nada del fichaje. */
function Estado({ p }: { p: PersonaDelDia }) {
  if (p.estado === 'con_horas') {
    return (
      <span
        className="font-mono tabular-nums shrink-0"
        style={{ fontSize: '12px', fontWeight: 500, color: V.tinta }}
      >
        {hs(p.horas ?? 0)} hs
      </span>
    )
  }
  if (p.estado === 'sin_cargar') {
    return (
      <span className="shrink-0" style={{ fontSize: '11.5px', color: V.tenue }}>sin cargar</span>
    )
  }
  // PRESENCIA DECLARADA SIN HORAS. El jefe marcó la cuadrilla y todavía no cargó el día: es una
  // verdad válida y NO es «sin cargar», que era lo que esta pantalla decía de todo el que no tenía
  // un número. El ● es el mismo símbolo de presencia de `CeldaDia`, y la palabra va al lado porque
  // ningún estado se dice sólo con color.
  if (p.estado === 'presente') {
    return (
      <span className="shrink-0" style={{ fontSize: '11.5px', color: V.tenue }} data-estado-presencia="presente">
        <span style={{ color: 'var(--os-pos)', fontWeight: 600 }}>●</span> presente · sin horas
      </span>
    )
  }
  return (
    <span className="shrink-0 truncate" style={{ fontSize: '11.5px', color: V.apagado }}>
      {p.estado === 'licencia' ? 'Licencia' : 'Ausente'}
      {/* EL CONFLICTO SE VE, NO SE RESUELVE. El jefe declaró que no vino y el día tiene horas
          cargadas: las dos afirmaciones no pueden ser ciertas y una de ellas se liquida. La
          pantalla no elige — lo dice y lo deja resolver a quien sabe cuál está mal. */}
      {p.conflicto && (
        <span
          data-testid="conflicto-dia"
          title="Ausencia declarada y horas cargadas el mismo día"
          style={{ color: 'var(--os-neg)', fontWeight: 600 }}
        >
          {' '}· con {hs(p.horas ?? 0)} hs cargadas
        </span>
      )}
      {/* EL MOTIVO SÓLO SI SE DECLARÓ. Sin él no se escribe «sin motivo»: la fila ya dice lo que
          se sabe, y agregarle una carencia la haría sonar a error de alguien. */}
      {p.motivo && <span style={{ color: V.tenue }}> · {p.motivo}</span>}
    </span>
  )
}

export function AsistenciaDeLaObra({ obra, testid }: { obra: ObraDelDia; testid?: string }) {
  return (
    <section style={{ marginBottom: 20 }} data-testid={testid} data-obra={obra.obraId ?? 'sin-obra'}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: 6, borderBottom: `1px solid ${V.lineaFuerte}`, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 600, color: V.tinta }}>{obra.nombre}</h2>
        <span
          className="font-mono tabular-nums"
          style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 600, color: V.apagado }}
          data-testid="conteo-obra"
        >
          {obra.conHoras} de {obra.gente.length} con horas
        </span>
        {obra.horas > 0 && (
          <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: V.tenue }}>
            {hs(obra.horas)} hs
          </span>
        )}
      </div>

      <ul>
        {obra.gente.map((p) => (
          <li
            key={p.personaId}
            data-testid="fila-asistencia"
            data-estado={p.estado}
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
                  fontWeight: p.estado === 'sin_cargar' ? 400 : 500,
                  color: p.estado === 'sin_cargar' ? V.apagado : V.tinta,
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
