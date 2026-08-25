import type { CertificadoPortal, RubroCertificado } from '../types'
import { COLS_RUBROS, P } from '../estilos'
import { millonesPortal, porcentajePortal } from '../formato'
import { BarraPortal } from './piezas'

// LA APERTURA POR RUBRO DEL CERTIFICADO — `29`, líneas 163–236.
//
// Cinco columnas: RUBRO · CONTRATADO · AVANCE ACUM. · ESTE CERT. · FALTA, con el pie de totales
// DENTRO de la caja sobre #FAFAF8. Es la tabla que le permite al cliente entender qué está
// aprobando: sin ella, «Aprobar» es firmar un número.
//
// ═══ EL «—» ACÁ SÍ ES CORRECTO, Y ES OTRA COSA ═══
//
// El mockup escribe «—» en ESTE CERT. de un rubro terminado: ese rubro no aporta nada a este
// certificado, y ese cero SÍ es un cero verdadero. No confundir con el «—» prohibido por permisos,
// que taparía un importe que existe. Acá el guión dice «nada este mes»; allá diría «no te lo puedo
// mostrar», y por eso allá la columna entera desaparece.
//
// ═══ SIN PERMISO DE MONTOS QUEDAN DOS COLUMNAS ═══
//
// Rubro y avance. No es la tabla del mockup con huecos: es la misma tabla sin las tres columnas de
// plata, que es lo que ese acceso puede ver.

const SIN_MONTOS = 'minmax(0,1.5fr) 142px'

const filaBase = (cols: string, alto: number): React.CSSProperties => ({
  display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'center',
  height: alto, padding: '0 16px',
})

const rotulo = (derecha = false): React.CSSProperties => ({
  fontSize: '9.5px', color: P.tenue, letterSpacing: '.05em', paddingBottom: 6,
  textAlign: derecha ? 'right' : undefined,
})

const importe = (tam: string, color: string): React.CSSProperties => ({
  fontFamily: "'IBM Plex Mono',monospace", fontSize: tam, color, textAlign: 'right',
})

function CeldaAvance({ pct }: { pct: number | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <BarraPortal pct={pct} color={pct !== null && pct >= 100 ? P.pos : P.info} />
      <span style={{
        fontFamily: pct === null ? 'inherit' : "'IBM Plex Mono',monospace",
        fontSize: '11.5px', color: pct === null ? P.guion : P.tintaSuave,
        width: 34, textAlign: 'right',
      }}>
        {pct === null ? 'sin iniciar' : `${Math.round(pct)}%`}
      </span>
    </div>
  )
}

function Fila({ r, cols, montos }: { r: RubroCertificado; cols: string; montos: boolean }) {
  const activo = r.avance_acum_pct !== null && r.avance_acum_pct > 0
  return (
    <div style={{ ...filaBase(cols, 41), borderBottom: `1px solid ${P.lineaTenue}` }}>
      <span style={{ fontSize: '12.5px', color: activo ? P.tinta : P.apagado }}>{r.rubro}</span>
      {montos && (
        <span style={importe('12px', P.apagado)}>{millonesPortal(r.contratado) ?? '—'}</span>
      )}
      <CeldaAvance pct={r.avance_acum_pct} />
      {montos && (
        <>
          <span style={r.este_certificado === null
            ? { fontSize: '12px', color: P.guion, textAlign: 'right' }
            : importe('12px', P.tinta)}>
            {millonesPortal(r.este_certificado) ?? '—'}
          </span>
          <span style={r.falta === null
            ? { fontSize: '11.5px', color: P.guion, textAlign: 'right' }
            : importe('11.5px', P.tenue)}>
            {millonesPortal(r.falta) ?? '—'}
          </span>
        </>
      )}
    </div>
  )
}

export function TablaRubros({ certificado, contratado, avanceAcumulado, montos }: {
  certificado: CertificadoPortal
  /** El total contratado de la obra, para el pie. `null` = sin contrato cargado. */
  contratado: number | null
  /** El avance acumulado de la obra, para el pie. */
  avanceAcumulado: number | null
  montos: boolean
}) {
  const cols = montos ? COLS_RUBROS : SIN_MONTOS
  const rubros = certificado.rubros
  if (rubros.length === 0) return null

  const sumaFalta = rubros.reduce((t, r) => t + (r.falta ?? 0), 0)

  return (
    <>
      <div style={{
        ...filaBase(cols, 31), alignItems: 'end',
        background: P.superficieTenue, borderBottom: `1px solid ${P.lineaFila}`,
      }}>
        <span style={rotulo()}>RUBRO</span>
        {montos && <span style={rotulo(true)}>CONTRATADO</span>}
        <span style={rotulo()}>AVANCE ACUM.</span>
        {montos && <span style={rotulo(true)}>ESTE CERT.</span>}
        {montos && <span style={rotulo(true)}>FALTA</span>}
      </div>

      {rubros.map((r) => (
        <Fila key={r.rubro} r={r} cols={cols} montos={montos} />
      ))}

      <div style={{ ...filaBase(cols, 42), background: P.superficieTenue }}>
        <span style={{ fontSize: '12.5px', fontWeight: 600, color: P.tinta }}>Total</span>
        {montos && (
          <span style={{ ...importe('12px', P.tinta), fontWeight: 600 }}>
            {millonesPortal(contratado) ?? '—'}
          </span>
        )}
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11.5px', color: P.tintaSuave }}>
          {avanceAcumulado === null ? '' : `${porcentajePortal(avanceAcumulado, 1)} acumulado`}
        </span>
        {montos && (
          <span style={{ ...importe('12px', P.tinta), fontWeight: 600 }}>
            {millonesPortal(certificado.monto)}
          </span>
        )}
        {montos && <span style={importe('11.5px', P.tenue)}>{millonesPortal(sumaFalta)}</span>}
      </div>
    </>
  )
}
