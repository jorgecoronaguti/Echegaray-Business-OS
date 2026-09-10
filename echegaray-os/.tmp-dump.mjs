import path from 'node:path'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const R='/home/jorge/echegaray-os/worktrees/wt-ordenes/echegaray-os'
const { query } = await import(R+'/orquestador/lib/db.mjs')
const { leerPdf } = await import(R+'/orquestador/lib/ingesta/pdf.mjs')
const { APP_DIR } = await import(R+'/orquestador/lib/config.mjs')
const { loadEnvLocalInto } = await import(R+'/scripts/lib/env-file.mjs')
loadEnvLocalInto(process.env, '/home/jorge/echegaray-os/app/echegaray-os/.env.local')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} })
const { rows } = await query(`select id, tipo, numero, nombre_archivo, archivo_path, asunto, obra_id from public.cliente_orden where eliminado_en is null order by nombre_archivo`)
const out=[]
for (const r of rows) {
  const { data, error } = await sb.storage.from('obras-documentos').download(r.archivo_path)
  let txt=''
  if (data) { const b=Buffer.from(await data.arrayBuffer()); try { const {leidas}=await leerPdf(b,{conGeometria:false,hasta:3}); txt=leidas.map(p=>p.textos.map(t=>t.texto).join(' ')).join('\n') } catch(e){ txt='ERR '+e.message } }
  else txt='SIN OBJETO '+(error?.message)
  out.push(`\n===== ${r.nombre_archivo} | ${r.tipo} | num=${r.numero} | obra=${r.obra_id} | asunto=${r.asunto}\n${txt.replace(/\s+/g,' ').slice(0,6000)}`)
}
fs.writeFileSync(process.argv[2], out.join('\n'))
process.exit(0)
