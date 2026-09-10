import crypto from "crypto";
import { adminContextError, getAdminContext } from "../../../../lib/adminAuth";
import { getAdminMassTestFormats, buildMassTestRule, mapCampaignPostContentType, normalizeCampaignPlan } from "../../../../lib/adminMassTest";

export const dynamic = "force-dynamic";

const ADMIN_TEST_PLATFORMS = ["facebook", "instagram", "linkedin", "tiktok", "pinterest", "threads", "youtube"];

function platformLabel(value) {
  const v = String(value || "").toLowerCase();
  return ({ facebook:"Facebook", instagram:"Instagram", linkedin:"LinkedIn", tiktok:"TikTok", pinterest:"Pinterest", threads:"Threads", youtube:"YouTube" })[v] || value;
}
function buildPlatformValue(keys=[]) { return [...new Set(keys.map((x)=>String(x||"").toLowerCase()).filter(Boolean))].map(platformLabel).join(" + "); }
function specialConfigIsValid(typeId, cfg={}) {
  if (typeId === "manual_prompt") return Boolean(String(cfg.manualPrompt || "").trim());
  if (typeId === "focus_source") return /^https?:\/\//i.test(String(cfg.focusUrl || "").trim());
  if (typeId === "offer_campaign") return Boolean(String(cfg.offer || "").trim());
  if (typeId === "giveaway") return Boolean(String(cfg.giveaway || "").trim());
  return true;
}

async function loadSetup(context) {
  const { data: brands, error: brandError } = await context.admin
    .from("brand_profiles")
    .select("id, business_name, website_url, website_product_source_url, website_product_mode_available, content_language, country_code, content_market, logo_url, logo_enabled_by_default")
    .eq("user_id", context.user.id)
    .order("business_name", { ascending:true });
  if (brandError) throw brandError;
  const brandIds = (brands || []).map((b)=>b.id);
  const [connectionsResult, campaignsResult, formatsResult, batchesResult] = await Promise.all([
    brandIds.length ? context.admin.from("social_connections").select("brand_profile_id, platform, status").eq("user_id", context.user.id).in("brand_profile_id", brandIds).eq("status","connected") : Promise.resolve({data:[],error:null}),
    brandIds.length ? context.admin.from("brand_campaign_opportunities").select("id, brand_profile_id, title, description, start_date, end_date, event_date, recommended_post_count, post_plan, visual_image_url, relevance_reason, prompt_context, campaign_angles, language").eq("user_id", context.user.id).in("brand_profile_id", brandIds).eq("is_active",true).eq("is_hidden",false).eq("is_archived",false).order("start_date",{ascending:true,nullsFirst:false}) : Promise.resolve({data:[],error:null}),
    context.admin.from("content_format_library").select("content_type_id, display_label, description, active, customer_credit_cost, estimated_cost_sek, sort_order").order("sort_order",{ascending:true}),
    context.admin.from("admin_test_batches").select("id, title, status, total_jobs, settings, created_at, started_at, finished_at, updated_at").eq("created_by",context.user.id).order("created_at",{ascending:false}).limit(20),
  ]);
  if (connectionsResult.error) throw connectionsResult.error;
  if (campaignsResult.error) throw campaignsResult.error;
  if (formatsResult.error && !/content_format_library|schema cache|does not exist/i.test(String(formatsResult.error.message||""))) throw formatsResult.error;
  if (batchesResult.error) throw new Error(`${batchesResult.error.message}. Run supabase/v144_102_admin_mass_tests.sql first.`);
  const connectionsByBrand = {};
  for (const item of connectionsResult.data || []) {
    if (!connectionsByBrand[item.brand_profile_id]) connectionsByBrand[item.brand_profile_id] = [];
    const p = String(item.platform || "").toLowerCase();
    if (p && !connectionsByBrand[item.brand_profile_id].includes(p)) connectionsByBrand[item.brand_profile_id].push(p);
  }
  const campaignsByBrand = {};
  for (const campaign of campaignsResult.data || []) {
    const brand = (brands || []).find((b)=>b.id===campaign.brand_profile_id);
    const plan = normalizeCampaignPlan(campaign, brand).map((post,index)=>({ ...post, _index:index, content_type_id:mapCampaignPostContentType(post, brand) }));
    if (!campaignsByBrand[campaign.brand_profile_id]) campaignsByBrand[campaign.brand_profile_id] = [];
    campaignsByBrand[campaign.brand_profile_id].push({ ...campaign, post_plan:plan });
  }
  return {
    brands:(brands||[]).map((brand)=>({ ...brand, connected_platforms:connectionsByBrand[brand.id]||[], campaigns:campaignsByBrand[brand.id]||[] })),
    formats:getAdminMassTestFormats(formatsResult.data || []),
    test_platforms: ADMIN_TEST_PLATFORMS.map((value)=>({ value, label:platformLabel(value) })),
    batches:batchesResult.data || [],
  };
}

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);
  try { return Response.json({ok:true, ...(await loadSetup(context))}); }
  catch (error) { return Response.json({ok:false,error:error.message||String(error)},{status:500}); }
}

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);
  const body = await request.json().catch(()=>({}));
  const requestedBrands = Array.isArray(body?.brands) ? body.brands : [];
  if (!requestedBrands.length) return Response.json({ok:false,error:"Choose at least one brand."},{status:400});
  const setup = await loadSetup(context).catch((error)=>({error}));
  if (setup.error) return Response.json({ok:false,error:setup.error.message},{status:500});
  const brandMap = Object.fromEntries(setup.brands.map((b)=>[b.id,b]));
  const formatMap = Object.fromEntries(setup.formats.map((f)=>[f.id,f]));
  const batchId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const rules=[]; const recipe=[]; let estimatedCostSek=0;
  for (const requested of requestedBrands) {
    const brand = brandMap[String(requested?.brandProfileId||"")];
    if (!brand) return Response.json({ok:false,error:"A selected brand does not belong to your administrator account."},{status:400});
    const requestedPlatforms = Array.isArray(requested.platforms) ? requested.platforms.map((p)=>String(p).toLowerCase()) : [];
    const supportedRequestedPlatforms = requestedPlatforms.filter((p)=>ADMIN_TEST_PLATFORMS.includes(p));
    const connectedDefaults = (brand.connected_platforms || []).filter((p)=>ADMIN_TEST_PLATFORMS.includes(p)).slice(0,2);
    // v144.103: mass tests generate content but do not publish. A live social connection
    // is therefore not required just to exercise the real platform-specific generation path.
    const testPlatforms = supportedRequestedPlatforms.length
      ? supportedRequestedPlatforms
      : connectedDefaults.length
      ? connectedDefaults
      : ["facebook", "instagram"];
    const platform=buildPlatformValue(testPlatforms);
    const repeats=Math.max(1,Math.min(5,Number(requested?.studio?.repeats||1)||1));
    const specialConfig=requested?.studio?.special || {};
    const selectedTypes=[...new Set((requested?.studio?.contentTypeIds||[]).map(String))].filter((id)=>formatMap[id]);
    for (const typeId of selectedTypes) {
      if (!specialConfigIsValid(typeId,specialConfig)) return Response.json({ok:false,error:`${formatMap[typeId]?.label || typeId} requires the test details to be completed for ${brand.business_name}.`},{status:400});
      for (let repeat=1;repeat<=repeats;repeat+=1) {
        const jobKey=`studio:${brand.id}:${typeId}:${repeat}:${crypto.randomUUID().slice(0,8)}`;
        rules.push(buildMassTestRule({userId:context.user.id,brand,platform,contentTypeId:typeId,batchId,jobKey,repeatIndex:repeat,specialConfig,nowIso}));
        recipe.push({jobKey,brandProfileId:brand.id,kind:"studio",contentTypeId:typeId,repeat});
        estimatedCostSek += Math.max(0,Number(formatMap[typeId]?.estimatedCostSek||0));
      }
    }
    const campaignSelections=Array.isArray(requested?.campaigns)?requested.campaigns:[];
    for (const selection of campaignSelections) {
      const campaign=(brand.campaigns||[]).find((c)=>c.id===selection.campaignId);
      if (!campaign) return Response.json({ok:false,error:`A selected campaign could not be found for ${brand.business_name}.`},{status:400});
      const plan=normalizeCampaignPlan(campaign,brand);
      const requestedIndexes=Array.isArray(selection.postIndexes)&&selection.postIndexes.length ? selection.postIndexes.map(Number) : plan.map((_,i)=>i);
      const indexes=[...new Set(requestedIndexes)].filter((i)=>Number.isInteger(i)&&i>=0&&i<plan.length);
      for (const index of indexes) {
        const post=plan[index]; const typeId=mapCampaignPostContentType(post,brand);
        const jobKey=`campaign:${brand.id}:${campaign.id}:${index}:${crypto.randomUUID().slice(0,8)}`;
        rules.push(buildMassTestRule({userId:context.user.id,brand,platform,contentTypeId:typeId,batchId,jobKey,repeatIndex:1,specialConfig,nowIso,campaign,campaignPost:post,campaignIndex:index,campaignCount:plan.length}));
        recipe.push({jobKey,brandProfileId:brand.id,kind:"campaign",campaignId:campaign.id,campaignPostIndex:index,contentTypeId:typeId});
        estimatedCostSek += Math.max(0,Number(formatMap[typeId]?.estimatedCostSek||0));
      }
    }
  }
  if (!rules.length) return Response.json({ok:false,error:"Choose at least one content type or campaign post."},{status:400});
  if (rules.length>500) return Response.json({ok:false,error:"A mass test can contain at most 500 jobs at a time."},{status:400});
  const title=String(body?.title||"").trim() || `Mass test · ${new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Stockholm"}).format(new Date())}`;
  const { error:batchError }=await context.admin.from("admin_test_batches").insert({id:batchId,created_by:context.user.id,title,status:"queued",total_jobs:rules.length,started_at:nowIso,settings:{estimated_cost_sek:estimatedCostSek,credit_bypass:true,run_mode:"asap",brands:requestedBrands,recipe},updated_at:nowIso});
  if (batchError) return Response.json({ok:false,error:`${batchError.message}. Run supabase/v144_102_admin_mass_tests.sql first.`},{status:500});
  const { error:ruleError }=await context.admin.from("automation_rules").insert(rules);
  if (ruleError) { await context.admin.from("admin_test_batches").delete().eq("id",batchId); return Response.json({ok:false,error:ruleError.message},{status:500}); }
  return Response.json({ok:true,batch:{id:batchId,title,totalJobs:rules.length,estimatedCostSek,runMode:"asap",creditsDeducted:0}});
}
