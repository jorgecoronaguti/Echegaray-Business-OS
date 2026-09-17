-- EL SIGNO Y EL NOMBRE DE LOS CÓDIGOS DE ARCA, CONTRA LA TABLA OFICIAL (17/09/2026).
--
-- Espejo SQL de orquestador/lib/comprobante-arca.mjs, ampliado el mismo día. La liquidación mensual
-- del Banco Santander llega como código 63 («Liquidaciones A») y no tenía signo: su IVA no entraba al
-- crédito fiscal. Se sumaron las liquidaciones, cuentas de venta, recibos, despacho de importación y
-- las notas de débito/crédito de liquidación; el '41' pasa a SUMAR (en la tabla oficial es «Otros
-- comprobantes C RG 1415», no una nota de crédito).
-- Fuente: https://www.afip.gob.ar/fe/documentos/TABLACOMPROBANTES.xls
--
-- Sólo reemplaza el cuerpo de dos funciones immutable que usan vistas (sin índices ni columnas
-- generadas que dependan de ellas: verificado en pg_index/pg_attrdef el 17/09/2026). El test
-- comprobante-duplicado.pg.test.mjs compara código por código contra el JS.

create or replace function public.comprobante_signo(tipo text)
returns smallint
language sql
immutable
as $$
  select case
    -- RESTAN: notas de crédito en todas sus variantes.
    when btrim(coalesce(tipo, '')) in
      ('3','8','13','21','38','43','44','48','53','90','110','112','113','114','119','203','208','213') then -1::smallint
    -- SUMAN: facturas, tiques, notas de débito, liquidaciones y crédito electrónico.
    when btrim(coalesce(tipo, '')) in
      ('1','2','4','5','6','7','9','10','11','12','15','16','17','18','19','20','27','28','29','34','35','36','37','39','40','41','45','46','47','51','52','54','55','56','57','58','59','60','61','63','64','66','81','82','83','109','111','115','116','117','118','201','202','206','207','211','212') then 1::smallint
    else null
  end
$$;

create or replace function public.comprobante_nombre_tipo(tipo text)
returns text
language sql
immutable
as $$
  select coalesce(
    case btrim(coalesce(tipo, ''))
      when '1' then 'Factura A'
      when '2' then 'Nota de Débito A'
      when '3' then 'Nota de Crédito A'
      when '6' then 'Factura B'
      when '7' then 'Nota de Débito B'
      when '8' then 'Nota de Crédito B'
      when '11' then 'Factura C'
      when '12' then 'Nota de Débito C'
      when '13' then 'Nota de Crédito C'
      when '51' then 'Factura M'
      when '52' then 'Nota de Débito M'
      when '53' then 'Nota de Crédito M'
      when '60' then 'Cuenta de Venta y Líquido Producto A'
      when '61' then 'Cuenta de Venta y Líquido Producto B'
      when '63' then 'Liquidación A'
      when '64' then 'Liquidación B'
      when '66' then 'Despacho de Importación'
      when '81' then 'Tique Factura A'
      when '82' then 'Tique Factura B'
      when '83' then 'Tique'
      when '109' then 'Tique C'
      when '111' then 'Tique Factura C'
      when '112' then 'Tique Nota de Crédito A'
      when '113' then 'Tique Nota de Crédito B'
      when '114' then 'Tique Nota de Crédito C'
      when '201' then 'Factura de Crédito Electrónica MiPyME A'
      when '202' then 'Nota de Débito FCE MiPyME A'
      when '203' then 'Nota de Crédito FCE MiPyME A'
      else null
    end,
    'tipo ' || coalesce(tipo, '') || ' (desconocido)'
  )
$$;
