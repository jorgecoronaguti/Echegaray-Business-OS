const { query } = await import('/home/jorge/echegaray-os/worktrees/wt-ordenes/echegaray-os/orquestador/lib/db.mjs')
const { rows } = await query(`select coalesce(ob.nombre,'— NIVEL CLIENTE') obra, o.tipo, o.numero, to_char(o.fecha,'DD/MM/YY') f, o.importe, o.nombre_archivo
 from public.cliente_orden o left join public.obra_canonica ob on ob.id=o.obra_id where o.eliminado_en is null order by obra, o.numero`)
for (const r of rows) console.log([r.obra,r.tipo,r.numero,r.f,r.importe,r.nombre_archivo].join(' | '))
process.exit(0)
