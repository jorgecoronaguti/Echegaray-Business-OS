// Ejecutor de OPERACIONES APROBADAS — el eslabón que cerraba el lazo.
// Antes: un humano aprobaba una operación (web o extensión), la fila quedaba en
// status='approved'... y no pasaba nada. Ahora, aprobar encola una tarea
// type='operation_execute' (dedupe_key `opexec:<id>`); este handler la toma, corre
// el efecto real en Drive vía la tool de escritura, y marca 'executed'/'failed'.
//
// Idempotente: si la operación ya está 'executed' no repite; si no está 'approved'
// no hace nada. Re-verifica la policy (drive.delete sigue 'forbidden' aun aprobado
// por error). El efecto real vive en las tools de escritura (drive-write.mjs), acá
// solo se orquesta — un solo lugar con la lógica de escritura (DRY).
import { query } from '../lib/db.mjs'
import { decide } from '../lib/policy.mjs'
import { makeGoogleClient, WRITE_SCOPES, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { driveWriteTools } from '../lib/tools/drive-write.mjs'
import { sheetsFormatTools } from '../lib/tools/sheets-format.mjs'
import { docsFormatTools } from '../lib/tools/docs-format.mjs'
import { workspaceTools } from '../lib/tools/workspace.mjs'
import { appsheetPedidosTools } from '../lib/tools/appsheet-pedidos.mjs'
import { operadorEmail, getTokenFor } from '../lib/google-oauth.mjs'

async function markFailed(opId, error) {
  await query(
    `update orq.pending_operations set status='failed', error=$2, updated_at=now() where id=$1`,
    [opId, String(error).slice(0, 1000)],
  )
}

async function directorPrincipalId(ctx) {
  const { rows } = await query("select id from orq.principals where slug='agent:director-general' limit 1")
  return rows[0]?.id ?? ctx.context.systemPrincipalId
}

export async function operationExecuteHandler(task, ctx) {
  const opId = task.inputs?.pending_operation_id
  if (!opId) throw new Error('operation_execute: falta pending_operation_id en inputs')

  const { rows } = await query('select * from orq.pending_operations where id = $1', [opId])
  const op = rows[0]
  if (!op) throw new Error(`operation_execute: operación ${opId} inexistente`)

  // Idempotencia + guardas de estado.
  if (op.status === 'executed') return { result: { already_executed: true, operation_id: opId } }
  if (op.status !== 'approved') return { result: { skipped: true, status: op.status, operation_id: opId } }

  // Re-verificar policy: una capacidad Nivel F (drive.delete) queda forbidden aunque
  // alguien la haya aprobado por error. No aflojamos la policy en la ejecución.
  const pid = await directorPrincipalId(ctx)
  const dispo = await decide(op.capability_slug, pid)
  if (dispo === 'forbidden') {
    await markFailed(opId, `capacidad ${op.capability_slug} prohibida (Nivel F): no se ejecuta nunca`)
    return { result: { failed: true, reason: 'forbidden', operation_id: opId } }
  }

  const payload = op.payload || {}
  const toolName = payload.tool
  const args = payload.args ?? {}
  // Cliente OAuth actuando COMO el usuario operador (Drive + Gmail + Calendar): así una
  // operación aprobada de mail/calendar se ejecuta desde SU cuenta, no la del SA (que no
  // tiene buzón). Si nadie autorizó, cae al SA (solo sirve para Drive compartido).
  const op_email = await operadorEmail()
  const google = op_email
    ? makeGoogleClient({ config: ctx.config, scopes: WORKSPACE_SCOPES, getToken: getTokenFor(op_email) })
    : makeGoogleClient({ config: ctx.config, scopes: WRITE_SCOPES })
  const registry = { ...driveWriteTools(google), ...sheetsFormatTools(op_email ? google : null), ...docsFormatTools(op_email ? google : null), ...workspaceTools({ google: op_email ? google : null }), ...appsheetPedidosTools({ google: op_email ? google : null }) }
  const entry = Object.values(registry).find((t) => t.schema.name === toolName)
  if (!entry) {
    await markFailed(opId, `tool desconocida en la operación: ${toolName}`)
    return { result: { failed: true, reason: 'unknown_tool', tool: toolName, operation_id: opId } }
  }

  try {
    const out = await entry.run(args)
    // La tool puede devolver {error} (input inválido / 403 sin permiso de edición).
    if (out?.error) {
      await markFailed(opId, out.error)
      return { result: { failed: true, error: out.error, operation_id: opId } }
    }
    await query(
      `update orq.pending_operations set status='executed', result=$2::jsonb, error=null, updated_at=now() where id=$1`,
      [opId, JSON.stringify(out)],
    )
    ctx.logger.info('operation_execute: operación ejecutada', { op_id: opId, tool: toolName, capability: op.capability_slug })
    return { result: { executed: true, operation_id: opId, tool: toolName, output: out } }
  } catch (e) {
    // Fallo real (ej. 403 del Service Account sin permiso de edición sobre el archivo,
    // ver Gotcha). Queda registrado en la operación; NO relanzamos para no entrar en
    // retry infinito por un error no transitorio.
    await markFailed(opId, e?.message ?? String(e))
    ctx.logger.warn('operation_execute: falló la ejecución', { op_id: opId, tool: toolName, error: e?.message })
    return { result: { failed: true, error: e?.message ?? String(e), operation_id: opId } }
  }
}
