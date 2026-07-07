import type { ResumenSnapshotPostMortem } from '../types'

function valorOInsuficiente(valor: number | null, sufijo = ''): string {
  return valor === null ? 'Dato insuficiente' : `${valor}${sufijo}`
}

export function ResumenPostMortem({
  resumen,
  congelado,
}: {
  resumen: ResumenSnapshotPostMortem
  congelado: boolean
}) {
  return (
    <div data-testid="resumen-post-mortem">
      <p className="text-sm text-gray-600">
        {congelado
          ? 'Snapshot congelado al momento del cierre — no cambia aunque se corrijan datos de la obra después.'
          : 'Vista previa en vivo — todavía no se cerró el Post Mortem.'}
      </p>

      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-gray-500">Margen esperado</dt>
          <dd>{valorOInsuficiente(resumen.margenEsperado, '$')}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Margen real</dt>
          <dd>{valorOInsuficiente(resumen.margenReal, '$')}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Desvío de costo</dt>
          <dd>
            {valorOInsuficiente(resumen.desvioCostoAbsoluto, '$')}
            {resumen.desvioCostoPorcentual !== null ? ` (${resumen.desvioCostoPorcentual}%)` : ''}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Desvío de HH</dt>
          <dd>
            {valorOInsuficiente(resumen.desvioHHAbsoluto)}
            {resumen.desvioHHPorcentual !== null ? ` (${resumen.desvioHHPorcentual}%)` : ''}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Adicionales detectados</dt>
          <dd>{resumen.totalAdicionalesDetectados}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Adicionales cobrados / no cobrados</dt>
          <dd>
            {resumen.totalAdicionalesCobrados} / {resumen.totalAdicionalesNoCobrados}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Certificado / Facturado / Cobrado</dt>
          <dd>
            {valorOInsuficiente(resumen.totalCertificado, '$')} / {valorOInsuficiente(resumen.totalFacturado, '$')} /{' '}
            {valorOInsuficiente(resumen.totalCobrado, '$')}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">% contrato cobrado</dt>
          <dd>{valorOInsuficiente(resumen.porcentajeContratoCobrado, '%')}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Alertas registradas</dt>
          <dd>{resumen.cantidadAlertasAlCierre}</dd>
        </div>
      </dl>
    </div>
  )
}
