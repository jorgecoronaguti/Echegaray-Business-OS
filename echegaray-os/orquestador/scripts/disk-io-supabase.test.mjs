import test from 'node:test'
import assert from 'node:assert/strict'
import { parsearMetricas, tasas, veredicto } from './disk-io-supabase.mjs'

const L = 'supabase_project_ref="x",service_type="db"'
/** Dos muestras a 10 s, con los números redondos de la instancia real del 07/09/2026 (Nano, 406 MB). */
const A = `
node_disk_read_bytes_total{${L},device="nvme0n1"} 1000000
node_disk_written_bytes_total{${L},device="nvme0n1"} 0
node_disk_reads_completed_total{${L},device="nvme0n1"} 1000
node_disk_writes_completed_total{${L},device="nvme0n1"} 0
node_disk_read_bytes_total{${L},device="nvme1n1"} 0
node_disk_written_bytes_total{${L},device="nvme1n1"} 0
node_disk_reads_completed_total{${L},device="nvme1n1"} 0
node_disk_writes_completed_total{${L},device="nvme1n1"} 0
node_vmstat_pswpin{${L}} 0
node_vmstat_pswpout{${L}} 0
node_vmstat_pgmajfault{${L}} 0
node_memory_SwapTotal_bytes{${L}} 1073741824
node_memory_SwapFree_bytes{${L}} 536870912
node_memory_MemTotal_bytes{${L}} 426258432
node_memory_MemAvailable_bytes{${L}} 104857600
node_filesystem_size_bytes{${L},device="/dev/nvme0n1p2",fstype="ext4",mountpoint="/"} 1
node_filesystem_size_bytes{${L},device="/dev/nvme1n1",fstype="ext4",mountpoint="/data"} 1
`
const conRaiz = (bytesLeidos, lecturas) => A
  .replace('device="nvme0n1"} 1000000', `device="nvme0n1"} ${1000000 + bytesLeidos}`)
  .replace('node_disk_reads_completed_total{' + L + ',device="nvme0n1"} 1000', `node_disk_reads_completed_total{${L},device="nvme0n1"} ${1000 + lecturas}`)
  .replace('node_vmstat_pswpin{' + L + '} 0', `node_vmstat_pswpin{${L}} 2560`)

test('parsea sólo lo que hace falta y ubica el disco de /data por su punto de montaje', () => {
  const m = parsearMetricas(A)
  assert.equal(m['node_disk_read_bytes_total:nvme0n1'], 1000000)
  assert.equal(m['fs:/'], 'nvme0n1')
  assert.equal(m['fs:/data'], 'nvme1n1')
  assert.equal(m.node_memory_SwapFree_bytes, 536870912)
})

test('la tasa es la diferencia dividida por los segundos, y el swap se cuenta en páginas de 4 KB', () => {
  const t = tasas(parsearMetricas(A), parsearMetricas(conRaiz(70_000_000, 3400)), 10)
  assert.equal(t.raiz.lectura_mbs, 7)
  assert.equal(t.raiz.iops, 340)
  assert.equal(t.datos.iops, 0)
  assert.ok(Math.abs(t.swap_in_mbs - 1.048576) < 1e-9) // 2.560 páginas × 4 KB en 10 s
  assert.equal(t.swap_usado_mb, 512)
})

test('el control PUEDE dar rojo y PUEDE dar verde contra el baseline de Nano (5 MB/s, 250 IOPS)', () => {
  const rojo = veredicto(tasas(parsearMetricas(A), parsearMetricas(conRaiz(70_000_000, 3400)), 10))
  assert.equal(rojo.sobre_baseline, true)
  assert.equal(rojo.uso_mbs_pct, 140)
  const verde = veredicto(tasas(parsearMetricas(A), parsearMetricas(conRaiz(10_000_000, 1000)), 10))
  assert.equal(verde.sobre_baseline, false)
  assert.equal(verde.uso_iops_pct, 40)
  // IOPS solos también alcanzan para el rojo: muchas lecturas chicas gastan presupuesto sin mover MB
  assert.equal(veredicto(tasas(parsearMetricas(A), parsearMetricas(conRaiz(1_000_000, 3000)), 10)).sobre_baseline, true)
})

test('sin medida no hay verde: dos muestras iguales o una métrica que falta salen como «no pude mirar»', () => {
  assert.equal(veredicto(tasas(parsearMetricas(A), parsearMetricas(A), 10)).sobre_baseline, null)
  const sinDisco = A.replace(/node_disk_read_bytes_total\{[^}]*device="nvme0n1"\} \d+\n/, '')
  assert.equal(veredicto(tasas(parsearMetricas(sinDisco), parsearMetricas(sinDisco), 10)).sobre_baseline, null)
})
