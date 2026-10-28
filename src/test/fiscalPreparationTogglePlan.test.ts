// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'
import { positivePlanFixture } from './fixtures/fiscalPositivePlan'
import { planFiscalPreparationToggle } from '../../scripts/plan-fiscal-preparation-toggle.mjs'
const domain=readFileSync('supabase/bootstrap/001_domain.sql','utf8')
const issuerDdl=readFileSync('supabase/pilot-fiscal/005_fiscal_worker_authorization.sql','utf8')
const catalogDdl=readFileSync('supabase/pilot-fiscal/012_fiscal_preparation.sql','utf8')
function table(name:string,source:string){const value=source.match(new RegExp('CREATE TABLE (?:IF NOT EXISTS )?public\\.'+name+' \\([\\s\\S]*?\\n\\);'))?.[0];if(!value)throw Error('Canonical table absent');return value}
async function setup(){
  const {config,snapshot}=positivePlanFixture(),plan=await planFiscalPreparationToggle(config),db=new PGlite()
  try{
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE public.sesiones_caja(id uuid PRIMARY KEY); CREATE TABLE public.productos(id uuid PRIMARY KEY);')
    for(const name of ['kioscos','usuarios','ventas','detalles_venta'])await db.exec(table(name,domain))
    await db.exec(table('fiscal_emisores_homologacion',issuerDdl)+table('fiscal_parametros_homologacion',catalogDdl))
    await db.exec('ALTER TABLE fiscal_emisores_homologacion ENABLE ROW LEVEL SECURITY; ALTER TABLE fiscal_parametros_homologacion ENABLE ROW LEVEL SECURITY;')
    // Only existence checks use these stubs; this test does not claim full fiscal schema acceptance.
    await db.exec('CREATE TABLE public.devoluciones_venta(venta_id uuid); CREATE TABLE public.fiscal_operaciones_homologacion(id uuid,venta_id uuid);')
    await db.query('INSERT INTO auth.users VALUES($1)',[config.ownerAuthId])
    await db.query("INSERT INTO kioscos(id,nombre) VALUES($1,'Synthetic')",[config.kioskId])
    await db.query("INSERT INTO usuarios(auth_user_id,kiosco_id,nombre,rol) VALUES($1,$2,'Synthetic owner','DUEÑO')",[config.ownerAuthId,config.kioskId])
    await db.query('INSERT INTO ventas(id,kiosco_id,fecha_hora,total) VALUES($1,$2,$3,$4)',[snapshot.sale.id,config.kioskId,snapshot.sale.fecha_hora,snapshot.sale.total])
    const d=snapshot.details[0];await db.query('INSERT INTO productos VALUES($1)',[d.producto_id])
    await db.query('INSERT INTO detalles_venta(id,venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES($1,$2,$3,$4,$5,$6)',[d.id,snapshot.sale.id,d.producto_id,d.cantidad,d.precio_unitario,d.subtotal])
    await db.query('INSERT INTO fiscal_emisores_homologacion SELECT * FROM jsonb_populate_record(NULL::fiscal_emisores_homologacion,$1::jsonb)',[JSON.stringify(snapshot.issuer)])
    await db.query('INSERT INTO fiscal_parametros_homologacion SELECT * FROM jsonb_populate_record(NULL::fiscal_parametros_homologacion,$1::jsonb)',[JSON.stringify(snapshot.catalog)])
    return {db,config,snapshot,plan}
  }catch(e){await db.close();throw e}
}
const currentClock=(sql:string)=>sql.replaceAll('clock_timestamp()',"('2026-10-28T15:10:01Z'::timestamptz)")
async function approve(db:PGlite,hash:unknown){await db.query("SELECT set_config('kioskopos.window_target','acoyfwwmhaeruciyedri',false),set_config('kioskopos.window_plan',$1,false)",[hash])}
it('requires GO, activates metadata once, rejects replay and closes after expiry without touching operations',async()=>{
  const {db,config,plan}=await setup()
  try{
    await expect(db.exec(currentClock(plan.activationSql))).rejects.toThrow('WINDOW_GO_REQUIRED');await db.exec('ROLLBACK')
    await approve(db,plan.data.manifest.planSha256);await db.exec(currentClock(plan.activationSql))
    expect((await db.query('SELECT habilitado FROM fiscal_emisores_homologacion')).rows).toEqual([{habilitado:true}])
    expect((await db.query('SELECT habilitado FROM fiscal_parametros_homologacion')).rows).toEqual([{habilitado:true}])
    await expect(db.exec(currentClock(plan.activationSql))).rejects.toThrow('WINDOW_BINDING_CHANGED');await db.exec('ROLLBACK')
    await db.query('INSERT INTO fiscal_operaciones_homologacion VALUES($1,$2)',[config.operationId,plan.data.manifest.saleId])
    const receipt=(await db.query<{opened_at:string}>('SELECT actualizado_en::text AS opened_at FROM fiscal_emisores_homologacion')).rows[0].opened_at
    await db.query("SELECT set_config('kioskopos.window_opened_at',$1,false)",[receipt])
    await db.exec(plan.closureSql);await db.exec(plan.closureSql)
    await expect(db.exec(currentClock(plan.activationSql))).rejects.toThrow(/WINDOW_(BINDING|SALE)_CHANGED/);await db.exec('ROLLBACK')
    expect((await db.query('SELECT habilitado FROM fiscal_emisores_homologacion')).rows).toEqual([{habilitado:false}])
    expect((await db.query('SELECT habilitado FROM fiscal_parametros_homologacion')).rows).toEqual([{habilitado:false}])
    expect((await db.query('SELECT id FROM fiscal_operaciones_homologacion')).rows).toEqual([{id:config.operationId}])
    expect(plan.manifest).toMatchObject({readyForGo:false,operatorAssistantReady:false,sqlExecuted:false,persistentWindowLease:false})
  }finally{await db.close()}
},30000)
it.each(['owner','kiosk','sale','detail','return','operation','issuer','other-catalog','before-window','after-window','rls','table-grant','column-grant'])('rejects %s drift before activation, without partial metadata updates',async mode=>{
  const {db,plan,config,snapshot}=await setup()
  try{
    if(mode==='owner')await db.exec("UPDATE usuarios SET rol='CAJERO'")
    if(mode==='kiosk')await db.exec("UPDATE kioscos SET estado_suscripcion='SOLO_LECTURA'")
    if(mode==='sale')await db.exec('UPDATE ventas SET total=201')
    if(mode==='detail')await db.exec('UPDATE detalles_venta SET cantidad=2')
    if(mode==='return')await db.query('INSERT INTO devoluciones_venta VALUES($1)',[snapshot.sale.id])
    if(mode==='operation')await db.query('INSERT INTO fiscal_operaciones_homologacion VALUES($1,$2)',[config.operationId,snapshot.sale.id])
    if(mode==='issuer')await db.exec('UPDATE fiscal_emisores_homologacion SET revision=2')
    if(mode==='rls')await db.exec('ALTER TABLE fiscal_emisores_homologacion DISABLE ROW LEVEL SECURITY')
    if(mode==='table-grant')await db.exec('GRANT SELECT ON fiscal_parametros_homologacion TO anon')
    if(mode==='column-grant')await db.exec('GRANT SELECT(credencial_id) ON fiscal_emisores_homologacion TO authenticated')
    if(mode==='other-catalog')await db.exec('INSERT INTO fiscal_parametros_homologacion SELECT 3,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,true FROM fiscal_parametros_homologacion')
    await approve(db,plan.data.manifest.planSha256)
    const sql=mode==='before-window'?plan.activationSql.replaceAll('clock_timestamp()',"('2026-10-28T15:00:00Z'::timestamptz)"):mode==='after-window'?plan.activationSql.replaceAll('clock_timestamp()',"('2026-10-28T15:25:00Z'::timestamptz)"):currentClock(plan.activationSql)
    await expect(db.exec(sql)).rejects.toThrow(/WINDOW_/);await db.exec('ROLLBACK')
    expect((await db.query('SELECT habilitado FROM fiscal_emisores_homologacion')).rows).toEqual([{habilitado:false}])
    expect((await db.query('SELECT habilitado FROM fiscal_parametros_homologacion WHERE revision=2')).rows).toEqual([{habilitado:false}])
  }finally{await db.close()}
},30000)
it('closure stops on changed binding rather than overwriting another metadata revision',async()=>{
  const {db,plan}=await setup()
  try{
    await approve(db,plan.data.manifest.planSha256);await db.exec(currentClock(plan.activationSql))
    await db.exec('UPDATE fiscal_emisores_homologacion SET revision=2')
    await expect(db.exec(plan.closureSql)).rejects.toThrow('WINDOW_CLOSE_DRIFT_REVIEW_REQUIRED');await db.exec('ROLLBACK')
    expect((await db.query('SELECT revision,habilitado FROM fiscal_emisores_homologacion')).rows).toEqual([{revision:2,habilitado:true}])
  }finally{await db.close()}
},30000)
it('rolls back issuer activation if the later catalog update fails',async()=>{
  const {db,plan}=await setup()
  try{
    await approve(db,plan.data.manifest.planSha256)
    await db.exec("CREATE FUNCTION public.fail_catalog_window() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'SYNTHETIC_LATE_FAILURE'; END$$; CREATE TRIGGER fail_catalog_window BEFORE UPDATE ON fiscal_parametros_homologacion FOR EACH ROW EXECUTE FUNCTION public.fail_catalog_window();")
    await expect(db.exec(currentClock(plan.activationSql))).rejects.toThrow('SYNTHETIC_LATE_FAILURE');await db.exec('ROLLBACK')
    expect((await db.query('SELECT habilitado FROM fiscal_emisores_homologacion')).rows).toEqual([{habilitado:false}])
    expect((await db.query('SELECT habilitado FROM fiscal_parametros_homologacion')).rows).toEqual([{habilitado:false}])
  }finally{await db.close()}
},30000)
it('requires the opening receipt and prevents reopening after closure even without an operation',async()=>{
  const {db,plan}=await setup()
  try{
    await approve(db,plan.data.manifest.planSha256);await db.exec(currentClock(plan.activationSql))
    await expect(db.exec(plan.closureSql)).rejects.toThrow('WINDOW_OPEN_RECEIPT_REQUIRED');await db.exec('ROLLBACK')
    await db.exec("SELECT set_config('kioskopos.window_opened_at','2026-10-28T15:10:02Z',false)")
    await expect(db.exec(plan.closureSql)).rejects.toThrow('WINDOW_OPEN_RECEIPT_REQUIRED');await db.exec('ROLLBACK')
    const receipt=(await db.query<{opened_at:string}>('SELECT actualizado_en::text AS opened_at FROM fiscal_emisores_homologacion')).rows[0].opened_at
    await db.query("SELECT set_config('kioskopos.window_opened_at',$1,false)",[receipt]);await db.exec(plan.closureSql)
    expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_operaciones_homologacion')).rows[0].n).toBe(0)
    await expect(db.exec(currentClock(plan.activationSql))).rejects.toThrow('WINDOW_BINDING_CHANGED');await db.exec('ROLLBACK')
  }finally{await db.close()}
},30000)
