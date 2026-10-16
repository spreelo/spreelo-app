// v144.340 — Read-only failure explanations for the admin workbench.
// Do not infer a confirmed provider outage from a generic exception. An error
// raised outside an identified occurrence cannot be attributed to a post.
import { POST_RESCUE_TYPES, resolvePostRescueType } from "./postRescueFormat.js";

const normalize = (value) => String(value ?? "").trim().toLowerCase();
const any = (value, regex) => regex.test(value);

export function diagnoseFailedPost(post, locale = "sv") {
  if (!post || (post.status !== "failed" && post.video_status !== "failed")) return null;
  const sv = normalize(locale).startsWith("sv");
  const choose = (swedish, english) => sv ? swedish : english;
  const failure = post.failure || {};
  const diagnostic = post.video_background_selection?.failure_diagnostic || {};
  const audit = post.video_background_selection?.product_video_validation || {};
  const code = normalize(failure.failure_code || post.work_item?.failure_code || diagnostic.code);
  const stage = normalize(failure.failure_stage || post.work_item?.failure_stage || diagnostic.stage);
  const message = String(diagnostic.message || failure.failure_message_internal || failure.failure_message_customer || post.work_item?.failure_message || post.video_error || failure.technical_run_log?.error_message || failure.technical_log?.error_message || "").trim();
  const technical = [code, stage, message].join(" ").toLowerCase();
  const sourceKind = resolvePostRescueType(post);
  const isAiVideo = sourceKind === POST_RESCUE_TYPES.AI_PRODUCT_VIDEO ||
    normalize(post.video_provider) === "kling" || Boolean(post.kling_task_id) ||
    any(normalize(post.content_type_id), /ai.product.video/);
  const hasRealPost = Boolean(post.id && !/^(occurrence|review-case|work-item)-/.test(String(post.id)));
  const auditRejected = isAiVideo && normalize(post.video_status) === "failed" &&
    (normalize(audit.status) === "failed" || stage === "kling_finished_product_identity" || code === "kling_finished_product_identity_rejected");
  const rescueReady = normalize(post.work_item?.rescue_status || post.rescue_status || failure.rescue_status) === "ready";
  const hasWorkItem = Boolean(post.work_item_id);
  const hasContent = Boolean(post.image_url || post.video_url || (post.slides || []).some((slide) => slide?.image_url) || (hasRealPost && String(post.content || "").trim()));
  const rescueInstruction = rescueReady
    ? choose("Rescue-materialet är importerat. Kontrollera materialet i redigeraren och välj Regenerate för att skapa ett nytt inlägg. Det kan medföra en ny kostnad.", "Rescue material is imported. Verify it in the editor and choose Regenerate to create a new post. This may incur a new charge.")
    : hasWorkItem
      ? choose("Använd AI Rescue på det här inlägget: öppna uppgiften i ChatGPT, skapa Rescue-ZIP, importera den och kontrollera materialet innan Regenerate. Starta inte en extra videokörning innan tidigare providerjobb har kontrollerats.", "Use AI Rescue for this post: open the ChatGPT task, create and import the Rescue ZIP, then verify materials before Regenerate. Check any previous provider task before starting another video run.")
      : choose("Kontrollera eller komplettera originalmaterialet och öppna sedan inläggets redigerare. Om felkällan saknas behöver den återställas innan Regenerate.", "Check or restore the original source material in the post editor. Restore any missing source before choosing Regenerate.");

  const actionNames = {
    database: choose("Kontrollera Supabase och kön", "Check Supabase and queue"),
    publishing: choose("Kontrollera kanalen och publicera befintligt innehåll", "Check channel and retry existing post"),
    billing: choose("Kontrollera krediter och kvoter", "Check credits and quotas"),
    audit: choose("Kontrollera granskningen", "Review audit findings"),
    video: choose("Kontrollera befintlig videokörning", "Check existing video task"),
    source: rescueReady ? choose("Granska Rescue och Regenerate", "Review Rescue, then Regenerate") : choose("Rescue / komplettera material", "Rescue / restore materials"),
    interrupted: choose("Kontrollera pågående körning", "Check existing task"),
    generation: choose("Regenerate om inget resultat finns", "Regenerate if no result exists"),
    unknown: choose("Utred felkoden innan ny körning", "Investigate before rerunning"),
  };
  const result = (category, title, reason, instruction, action, { confirmed = false, allowRegenerate = false, safety = "" } = {}) => ({
    category, title, reason, instruction, action, confirmed, allowRegenerate,
    actionLabel: action === "kling_retry" ? choose("Granska och försök Kling igen", "Review and retry Kling") : actionNames[category],
    safety: safety || null, code: failure.failure_code || post.work_item?.failure_code || diagnostic.code || null,
    stage: failure.failure_stage || post.work_item?.failure_stage || diagnostic.stage || null,
    recordedMessage: message || null,
  });

  if (auditRejected) {
    return result("audit", choose("AI-videon underkänd i granskningen", "AI video rejected by quality review"),
      choose("Den färdiga Kling-videon godkändes inte vid kontrollen av produktens identitet eller rörelser.", "The finished Kling video did not pass the product identity or motion review."),
      hasRealPost && normalize(post.video_provider) === "kling"
        ? choose("Läs granskningsanmärkningarna nedan. Knappen ”Försök Kling igen” skapar en ny, säkrare körning – använd den bara om du godkänner en möjlig ny videokostnad.", "Read the review findings below. 'Retry Kling' creates a new safer run; use it only if a new video charge is acceptable.")
        : rescueInstruction,
      hasRealPost && normalize(post.video_provider) === "kling" ? "kling_retry" : "rescue", { confirmed: true, safety: choose("En ny Kling-körning kan debiteras.", "A new Kling run may be charged.") });
  }
  if (any(technical, /project not specified|supabase|postgrest|pgrst\d|database.*(unavailable|timeout|connect)|connection.*(refused|terminated)|getaddrinfo.*supabase|schema cache|db[_ -]?error/)) {
    return result("database", choose("Databas / Supabase – tillfälligt fel möjligt", "Database / Supabase – possibly temporary"),
      choose("Körningen fick ett databas- eller projektanslutningsfel. Det säger inte i sig att Supabase hade en bekräftad driftstörning.", "A database or project routing request failed. This does not prove a confirmed Supabase outage."),
      choose("Kontrollera först att Supabase svarar och om jobbet redan återupptagits i kön. Finns ett färdigt inlägg ska det återanvändas; starta inte Regenerate i onödan. Om jobbet är permanent misslyckat, verifiera originalstatus och återställ från befintligt material.", "First check whether Supabase is responding and the queue already resumed the job. Reuse existing content rather than Regenerate. If terminally failed, verify the original job state before recovery."),
      "inspect", { confirmed: Boolean(code || message) });
  }
  const providerFailure = /^(kling|shotstack)_/.test(code) || /kling|shotstack/.test(message.toLowerCase());
  if (providerFailure && (Number(diagnostic.http_status) === 401 || Number(diagnostic.http_status) === 403 || /unauthoriz|invalid.api.key|(?:status|submit)[_ ]40[13]/.test(technical))) {
    return result("video", choose("Videoleverantören nekade åtkomst", "Video provider denied access"),
      message,
      choose("Kontrollera leverantörens API-nyckel och behörighet i serverinställningarna. Återuppta befintligt task/render-ID efter korrigering.", "Check the provider API key and permissions in server settings. Resume the existing task/render ID after correction."),
      "inspect", { confirmed: true });
  }
  if (providerFailure && (Number(diagnostic.http_status) === 429 || /(?:status|submit)[_ ]429|rate.limit|too many requests/.test(technical))) {
    return result("video", choose("Videoleverantören begränsar anropen", "Video provider rate limit"), message,
      choose("Kontrollera leverantörens gränser och nästa statuskontroll. Återanvänd befintligt task/render-ID. Detta gäller inte webbutikens åtkomst.", "Check provider limits and the next status check. Reuse the existing task/render ID. This does not concern website access."),
      "inspect", { confirmed: true });
  }
  if (/^(kling_render_design_rejected|shotstack_design_review_rejected)$/.test(code)) {
    return result("video", choose("Renderingen stoppades i designgranskningen", "Render stopped at design review"),
      diagnostic.visual_review?.reason || message,
      choose("Öppna den sparade renderingen och kontrollera slutbilden mot granskningsorsaken. Skilj centrering och mellanrum från saknad, avklippt eller överlappande text. Teknisk återställning ska först granska samma render-ID igen; ett verkligt layoutfel rättas med den sparade Kling-filmen. Starta inte Regenerate för detta fel.", "Inspect the saved render and compare its closing card with the review finding. Distinguish alignment and spacing from missing, clipped or overlapping text. Technical recovery should first reinspect the same render ID; repair a real layout defect using the saved Kling source. Do not use Regenerate for this failure."),
      "inspect", { confirmed: true });
  }
  if (any(technical, /social.publish|publish.failed|publish_error|post_publish|delivery|token.expir|oauth|permission.denied|invalid.token|social.connection|unauthoriz|facebook.*(publish|token)|instagram.*(publish|token)|pinterest.*(publish|token)|tiktok.*(publish|token)/)) {
    const auth = any(technical, /token.expir|oauth|permission.denied|invalid.token|social.connection|unauthoriz/);
    return result("publishing", choose(auth ? "Anslutningen till social kanal fungerar inte" : "Publiceringen misslyckades", auth ? "Social channel connection failed" : "Publishing failed"),
      choose(auth ? "Kanalen verkar sakna fungerande behörighet eller giltig anslutning." : "Innehållet kan redan vara färdigt, men leveransen till den sociala kanalen misslyckades.", auth ? "The channel appears to have an invalid connection or insufficient permissions." : "The content may already exist, but delivery to the social platform failed."),
      choose(auth ? "Kontrollera eller återanslut kanalen. Kontrollera därefter om inlägget redan publicerats innan publicering görs om. Använd inte Regenerate." : "Kontrollera om inlägget redan ligger på kanalen. Försök därefter publicera samma färdiga inlägg igen via ordinarie publiceringsflöde, inte Regenerate.", auth ? "Verify or reconnect the social channel. Check whether the post was already published before attempting delivery again. Do not Regenerate." : "First verify the post was not already published. Retry delivery of the existing finished content through the normal publishing flow; do not Regenerate."),
      "retry_publish", { confirmed: Boolean(code) });
  }
  if (any(technical, /insufficient.credits|credit.balance|quota.exceeded|insufficient.quota|billing.*(failed|limit)/)) {
    return result("billing", choose("Krediter eller leverantörskvot saknas", "Insufficient credits or provider quota"),
      choose("Körningen stoppades av en kreditgräns eller leverantörens kvot.", "The run was blocked by a credit or provider quota limit."),
      choose("Kontrollera Spreelo-krediter och API-leverantörens saldo. När problemet är löst: kontrollera om något redan skapats innan Regenerate, eftersom en ny körning kan kosta.", "Check Spreelo credits and provider balance. Once fixed, check existing results before Regenerate, since a new run may incur costs."),
      "resolve", { confirmed: Boolean(code) });
  }
  if (any(technical, /finished.product.identity|quality.audit|reference.prerequisite|audit.*(failed|missing|reject)|product.identity.rejected|quality.review|moderation|policy.rejected|visual.quality/)) {
    return result("audit", choose("Granskning eller kvalitetskontroll stoppade inlägget", "Review or quality checks blocked the post"),
      choose("Innehållet klarade inte den obligatoriska granskningen eller kunde inte granskas säkert.", "The content failed mandatory quality review or required evidence for review was missing."),
      isAiVideo
        ? choose("Kontrollera om den färdiga videon och dess referensbilder finns kvar. Återställ granskningsunderlaget eller använd AI Rescue om material måste skapas om. Kör inte Kling igen utan att först kontrollera tidigare körning.", "Check whether the finished video and its reference images still exist. Restore review evidence or use AI Rescue if content truly must be recreated. Do not run Kling again until the previous run is checked.")
        : choose("Läs granskningsdetaljerna, korrigera underlaget och använd därefter Regenerate eller Rescue om material saknas.", "Inspect the review findings, correct source material, then Regenerate or use Rescue if material is missing."),
      isAiVideo ? "inspect" : "rescue", { confirmed: Boolean(code) });
  }
  if (any(technical, /kling|shotstack|video.render|image.to.video|video.finaliz|video.generat|polling.window|task.id/)) {
    return result("video", choose("AI-video eller videorendering misslyckades", "AI video or rendering failed"),
      message || choose("Ett steg hos Kling eller videorenderingen misslyckades. En tidigare körning kan redan ha skapat material och kostnader.", "A Kling or rendering step failed. An earlier run may already have produced content and incurred costs."),
      choose("Kontrollera först uppgifts-ID, videolänk och status hos leverantören. Återuppta eller färdigställ befintlig körning om det går. Endast om ingen användbar video finns: använd Rescue för ett nytt underlag; det kan innebära ny kostnad.", "First check provider task ID, video link and status. Resume or finalize the existing run if possible. Only if no usable result exists, use Rescue for new materials; this may incur a new charge."),
      "inspect", { confirmed: Boolean(code), allowRegenerate: rescueReady && hasWorkItem });
  }
  if (any(technical, /website|crawler|crawl|fetch|http.40[1349]|rate.limit|blocked|no.product|product.not.found|catalog|verified.product|source.research|source[_ -]?(missing|unavailable|failed)|no.suitable|image.*missing|product.*missing|product[_ -]?(missing|unavailable|failed)/)) {
    return result("source", choose("Källmaterial eller produkt kunde inte verifieras", "Source or product verification failed"),
      choose("Spreelo kunde inte hämta eller verifiera det material som behövs för inlägget.", "Spreelo could not retrieve or verify the source material required for the post."),
      rescueInstruction,
      "rescue", { confirmed: Boolean(code), allowRegenerate: rescueReady });
  }
  if (any(technical, /stale|runtime.timeout|timed.out|worker.*(unhandled|failure)|transient.runtime|lease.expir|queue.*(fail|abandon)/)) {
    return result("interrupted", choose("Körningen avbröts eller tog för lång tid", "Job interrupted or timed out"),
      choose("Automationsjobbet slutfördes inte inom sin körningstid. Orsaken kan vara en tillfällig störning eller ett steg som fastnade.", "The job did not finish within its execution window. It may have been interrupted by a temporary service problem."),
      choose("Kontrollera om jobbet fortfarande körs hos någon AI-leverantör eller har återupptagits. Återanvänd färdigt material. Starta inte en ny generering förrän pågående körningar och kostnader har kontrollerats.", "Check for a running provider job or queue recovery and reuse existing results. Do not start a new generation until previous tasks and costs have been checked."),
      "inspect", { confirmed: Boolean(code) });
  }
  if (any(technical, /openai|image.generat|text.generat|gpt.image|model.error|model.not.found|response.error/)) {
    return result("generation", choose("AI-genereringen misslyckades", "AI generation failed"),
      choose("Text- eller bildleverantören kunde inte slutföra genereringen.", "The text or image provider could not complete generation."),
      choose("Kontrollera först leverantörens status och eventuella redan färdiga resultat. Om inget material skapades: använd Regenerate. Ny generering kan medföra kostnad.", "Check provider status and any existing results first. If no output was produced, use Regenerate. A new run may incur a charge."),
      "regenerate", { confirmed: Boolean(code), allowRegenerate: !isAiVideo && !hasContent });
  }
  return result("unknown", choose("Orsaken går inte att fastställa från loggen", "Cause not identifiable from stored data"),
    choose("Det finns inte tillräckligt tydliga feluppgifter för att avgöra om problemet gäller Supabase, granskning, material eller en AI-leverantör.", "The stored failure data does not identify whether the issue came from the database, review, source material or an AI provider."),
    choose("Öppna Tekniska detaljer och kontrollera felkod, körningsfas och eventuell extern uppgiftsstatus. Välj inte Regenerate eller Rescue förrän ett tidigare resultat eller en redan debiterad körning har uteslutits.", "Open Technical details and inspect failure code, stage and external task status. Do not use Regenerate or Rescue before checking whether a result or charged task already exists."),
    "inspect", { confirmed: false });
}
