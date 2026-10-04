import assert from 'node:assert/strict';
import fs from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
await db.exec(`
create role anon;create role authenticated;create role service_role;
create table posts(id uuid primary key,user_id uuid,brand_profile_id uuid,automation_rule_id uuid,video_provider text,
 video_status text,video_storage_path text,status text,admin_archived_at timestamptz,video_background_selection jsonb,
 video_background_asset_id uuid,updated_at timestamptz default now(),is_admin_test boolean default false,content_type_id text);
create table automation_rules(id uuid primary key,user_id uuid,credit_cost integer,credit_reservation_status text);
create table automation_occurrences(id uuid primary key,status text);
create table user_credit_balances(user_id uuid primary key,credits_remaining integer,updated_at timestamptz);
create table credit_transactions(user_id uuid,amount integer,reason text,reference_type text,reference_id uuid);
create table credit_reservation_events(event_type text,metadata jsonb);
create table video_background_assets(id uuid primary key,times_used integer,last_used_at timestamptz,updated_at timestamptz);
create table website_content_history(user_id uuid,brand_profile_id uuid,automation_rule_id uuid,post_id uuid,
 source_url text,source_type text,content_type text,item_key text,item_url text,item_title text,item_description text,item_image_url text,cycle_number integer);
create table website_product_catalog(user_id uuid,brand_profile_id uuid,product_url text,times_used integer,last_used_at timestamptz,updated_at timestamptz);
create function consume_reserved_automation_credit(p_rule_id uuid,p_post_id uuid) returns jsonb language plpgsql as $$
begin insert into credit_reservation_events values('consumed',jsonb_build_object('post_id',p_post_id));
 update automation_rules set credit_reservation_status='reserved' where id=p_rule_id;
 return jsonb_build_object('handled',true,'next_reserved',true);end;$$;
`);
const migration=fs.readFileSync('supabase/v144_305_shotstack_delivery.sql','utf8');await db.exec(migration);
await assert.rejects(db.query('select shotstack_delivery_preflight()'),/Install v144.304/);
await db.exec("create function defer_automation_occurrence_for_shotstack(uuid,uuid,text,text) returns boolean language sql as $$select true$$;");
assert.equal((await db.query('select shotstack_delivery_preflight() as ready')).rows[0].ready,true);
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const user=id(1),brand=id(2),rule=id(3),bg=id(4),occurrence=id(5);
await db.query('insert into automation_rules values($1,$2,4,\'legacy\')',[rule,user]);
await db.query('insert into automation_occurrences values($1,\'completed\')',[occurrence]);
await db.query('insert into user_credit_balances values($1,20,now())',[user]);
await db.query('insert into video_background_assets values($1,0,null,null)',[bg]);
const makePost=async(n,extra={})=>{
 const post=id(n);const checkpoint={origin:'automation',occurrence_id:occurrence,delivery_context:{version:305,credit_cost:4,has_reserved_credits:false,...extra.context}};
 await db.query(`insert into posts(id,user_id,brand_profile_id,automation_rule_id,video_provider,video_status,video_storage_path,status,
 video_background_selection,video_background_asset_id,is_admin_test) values($1,$2,$3,$4,'shotstack','ready','video.mp4','pending_approval',$5,$6,$7)`,[post,user,brand,rule,JSON.stringify({shotstack_checkpoint:checkpoint}),bg,Boolean(extra.test)]);
 return post;
};
const claim=async p=>(await db.query('select claim_shotstack_delivery($1) as result',[p])).rows[0].result;
const settle=p=>db.query('select settle_shotstack_delivery_credit($1)',[p]);
const balance=async()=>(await db.query('select credits_remaining from user_credit_balances')).rows[0].credits_remaining;
const post=await makePost(10);assert.equal((await claim(post)).claimed,true);assert.equal((await claim(post)).claimed,false);
await settle(post);await settle(post);assert.equal(await balance(),16);assert.equal((await db.query('select * from credit_transactions')).rows.length,1);
assert.equal((await db.query('select times_used from video_background_assets')).rows[0].times_used,1);
await db.query("insert into website_product_catalog values($1,$2,'https://example.com/product',0,null,null)",[user,brand]);
const item=JSON.stringify({url:'https://example.com/product',title:'Exact saved product',item_key:'item',image_url:'image'});
await db.query('select save_shotstack_delivery_history($1,$2,$3,1)',[post,item,'https://example.com']);
await db.query('select save_shotstack_delivery_history($1,$2,$3,1)',[post,item,'https://example.com']);
assert.equal((await db.query('select * from website_content_history')).rows.length,1);assert.equal((await db.query('select times_used from website_product_catalog')).rows[0].times_used,1);
// Original reservation already consumed, with the next one reserved: do not consume it.
await db.query("update automation_rules set credit_reservation_status='reserved'");
const reserved=await makePost(11,{context:{has_reserved_credits:true}});await claim(reserved);await settle(reserved);await settle(reserved);
assert.equal((await db.query('select * from credit_reservation_events')).rows.length,1);assert.equal(await balance(),16);
const already=await makePost(12,{context:{has_reserved_credits:true}});await db.query("insert into credit_reservation_events values('consumed',$1)",[JSON.stringify({post_id:already})]);await claim(already);await settle(already);
assert.equal((await db.query('select * from credit_reservation_events')).rows.length,2);
const test=await makePost(13,{test:true});await claim(test);await settle(test);assert.equal(await balance(),16);
const shortage=await makePost(14,{context:{credit_cost:100}});await claim(shortage);await assert.rejects(settle(shortage),/Insufficient/);assert.equal(await balance(),16);
assert.equal((await db.query('select credits_done from shotstack_post_deliveries where post_id=$1',[shortage])).rows[0].credits_done,false);
await db.query('update posts set admin_archived_at=now() where id=$1',[post]);assert.equal((await claim(post)).status,'not_ready');
await db.query("update automation_occurrences set status='running'");assert.equal((await db.query('select * from list_pending_shotstack_deliveries()')).rows.length,0);
await db.query('alter table credit_transactions alter column reference_id type text using reference_id::text');
const textReference=await makePost(15);await claim(textReference);await settle(textReference);await settle(textReference);assert.equal(await balance(),12);
await db.close();console.log('v144.305 PostgreSQL: migration/preflight, leases, atomic charge, renewed reservation safety, test bypass, insufficient balance rollback, history and background once passed.');
