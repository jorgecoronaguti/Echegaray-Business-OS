// QUÉ VERSIÓN ESTÁ PUBLICADA — la pregunta de la pestaña vieja (`src/shared/tiempo-real/version.ts`).
// No devuelve ningún dato de la empresa: sólo el id del deploy. Sin caché: una respuesta guardada
// diría la versión de ayer.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export function GET() {
  const version = process.env.VERCEL_DEPLOYMENT_ID || 'local'
  return Response.json({ version }, { headers: { 'Cache-Control': 'no-store' } })
}
