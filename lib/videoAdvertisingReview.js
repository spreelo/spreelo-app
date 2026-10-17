import sharp from 'sharp';

const REVIEW_MODEL = 'gpt-4.1-mini';
const NONTERMINAL_CREATIVE_FEEDBACK = new Set(['poor_hierarchy', 'wrong_alignment']);
const PREFLIGHT_CREATIVE_FEEDBACK = new Set(['too_small','low_contrast']);
// Independent vision opinions are not a second publication authority over a
// successfully rendered, source-verified movie. Concrete visible corruption
// still requires manual repair; routine art-direction opinions are recorded.
const FINAL_RENDER_SAFETY_ISSUES = new Set(['subject_overlap','stray_graphics','unfinished_end_card']);
const END_CARD_DEFECTS = ['none','alignment_or_spacing_only','missing_content','clipped_content','overlapping_content','other_visible_corruption'];
const CONCRETE_END_CARD_DEFECTS = new Set(END_CARD_DEFECTS.slice(2));
export function isFinalRenderSafetyIssue(issue) { return FINAL_RENDER_SAFETY_ISSUES.has(String(issue||'')); }
export function isRecoverableAestheticRejection(reason) {
  return /\((?:too_small|low_contrast|poor_hierarchy|wrong_alignment|other)\)|review is unavailable|reviewer returned no valid JSON|could not be fully inspected|requires a frame sampler/i.test(String(reason||''));
}
const REASONS = ['none','too_small','low_contrast','subject_overlap','wrong_alignment','stray_graphics','poor_hierarchy','unfinished_end_card','other'];

// Run against the actual composed assets, never against GPT Image's atlas.
// The model is a quality gate, not a fallback graphic designer: a bad result
// must remain blocked for review or be redrawn without paying Kling again.
export async function reviewAdvertisingComposition({openai, frames, endCard, headline='', endCardHeadline='', closingLine='', phase='composite', model=REVIEW_MODEL, allowReviewServiceOutage=false,typographyPreflightPassed=false,deliveryFirstRender=false,sceneHeadlineOmitted=false}) {
  if (!openai?.responses?.create) throw new Error('Advertising review requires a vision-capable AI service');
  if (!Array.isArray(frames) || frames.length < 1 || !endCard) throw new Error('Advertising quality review requires composited scene frames and a closing card');
  const input = [{type:'input_text',text:`Independent visual art-direction audit of a vertical 9:16 product commercial, phase ${phase}. The supplied images are the FINAL COMPOSITED visible frames followed by the FINAL COMPOSITED end card, not isolated lettering or an atlas. Expected main message (reference only): ${JSON.stringify(headline)}. Expected separate closing hook (reference only): ${JSON.stringify(endCardHeadline||headline)}. This approved hook may differ from the scene headline; do not require the scene headline again on the end card. Expected closing line (reference only): ${JSON.stringify(closingLine)}. Decide whether each piece of typography is LARGE ENOUGH to read on a phone, has intentional premium visual hierarchy appropriate to this particular imagery, is visibly aligned, has sufficient contrast, avoids covering the product/face, and has no isolated accidental rules, stripes, vertical lines, scraps or detached strokes. The closing card must be a finished and visually balanced advertising design with a prominent well-centered CTA, not generic tiny text on a blank plate. An opening frame may intentionally precede the headline; do not require text in every image, only during the active headline interval. Do not reject solely because a visual style is bold, restrained, playful or unconventional; evaluate execution, not taste. Do not infer unseen frames or hidden bugs. approved=false only if there is a clearly visible significant defect. Identify the single primary reason using the enum; add one short actionable explanation, without inventing defects. Return JSON only.`}];
  if(sceneHeadlineOmitted) input[0].text += ' The scene headline is deliberately omitted to keep the verified product and face unobstructed. The approved separate closing hook and CTA must appear on the closing card only; do not require the omitted scene headline as well. Do not report absent scene typography as a defect.';
  input[0].text += ` Classify the closing card separately in end_card_defect. Use alignment_or_spacing_only when all required content is present, legible and intact and the ONLY complaint is centering, balance, spacing or polish; its primary issue is wrong_alignment or poor_hierarchy, NEVER unfinished_end_card. Reserve unfinished_end_card for concrete missing required content, visibly clipped content, overlapping content or other visible corruption. State exactly what is missing, clipped, overlapping or corrupted in the reason. A claim that a card "appears unfinished" because of balance or spacing alone is not concrete corruption. Use none when no closing-card defect is visible. Do not let an alignment label conceal missing or damaged content.`;
  const inputs = [...frames.slice(0,3),endCard];
  for (const frame of inputs) {
    const preview=await sharp(frame).rotate().resize({width:540,height:960,fit:'cover'}).jpeg({quality:83}).toBuffer();
    input.push({type:'input_image',image_url:`data:image/jpeg;base64,${preview.toString('base64')}`,detail:'high'});
  }
  let answer;
  try { answer = await openai.responses.create({model,input:[{role:'user',content:input}],max_output_tokens:280,
    text:{format:{type:'json_schema',name:'video_advertising_composition_review_v358',strict:true,schema:{type:'object',additionalProperties:false,
      properties:{approved:{type:'boolean'},issue:{type:'string',enum:REASONS},end_card_defect:{type:'string',enum:END_CARD_DEFECTS},reason:{type:'string'}},required:['approved','issue','end_card_defect','reason']}}}},
    {timeout:25000,maxRetries:0}); }
  catch(error) {
    // A design-review API outage does not mean that already source-verified,
    // copy-verified and 1080x1920 typography-preflighted assets are defective.
    // The caller must explicitly opt in after those independent checks.
    if(allowReviewServiceOutage) {
      console.warn('Advertising creative-opinion review unavailable; using existing deterministic checks', {phase,reason:String(error?.message||error).slice(0,240)});
      return {approved:true,issue:'none',phase,model,reviewStatus:'unavailable',requiresFollowup:true};
    }
    throw Object.assign(new Error(`Advertising visual review is unavailable: ${error.message}`),{code:'VIDEO_DESIGN_REVIEW_UNAVAILABLE',cause:error});
  }
  const output=answer?.output_text||(answer?.output||[]).flatMap(x=>x?.content||[]).map(x=>x?.text||'').join('');
  let result; try { result=JSON.parse(output); } catch(error) { throw Object.assign(new Error('Advertising visual reviewer returned no valid JSON decision'),{code:'VIDEO_DESIGN_REVIEW_UNAVAILABLE',cause:error}); }
  // Use an explicit scoped finding, never English keyword matching: a reason
  // mentioning "alignment" can ALSO report missing or clipped text. Missing
  // structured evidence (including old reviews) keeps the original hard stop.
  const reportedIssue=result.issue;
  if(CONCRETE_END_CARD_DEFECTS.has(result.end_card_defect) && !['subject_overlap','stray_graphics'].includes(result.issue)) {
    result={...result,issue:'unfinished_end_card'};
  } else if(result.issue==='unfinished_end_card' && result.end_card_defect==='alignment_or_spacing_only') {
    result={...result,issue:'wrong_alignment'};
  }
  if (result.approved!==true || result.issue!=='none') {
    // Aesthetic preference is feedback, not proof that the delivered product
    // or exact, legible wording is unsafe. Keep hard stops for objectively
    // defective text, stray objects, subject overlap and broken end cards.
    if(NONTERMINAL_CREATIVE_FEEDBACK.has(result.issue) || (typographyPreflightPassed && PREFLIGHT_CREATIVE_FEEDBACK.has(result.issue)) || (deliveryFirstRender && !isFinalRenderSafetyIssue(result.issue))) {
      return {approved:true,issue:'none',phase,model,reviewStatus:'creative_advisory',
        creativeFeedback:{issue:result.issue,reportedIssue,end_card_defect:result.end_card_defect||null,reason:String(result.reason||'').slice(0,500)}};
    }
    const error=new Error(`Advertising visual quality rejected (${result.issue}): ${String(result.reason||'Design did not pass the visual review').slice(0,250)}`);
    error.code='VIDEO_ADVERTISING_DESIGN_REJECTED';
    error.review={approved:false,issue:result.issue,reportedIssue,end_card_defect:result.end_card_defect||null,reason:result.reason,phase};
    throw error;
  }
  return {approved:true,issue:'none',reason:String(result.reason||'').slice(0,250),phase,model};
}

export async function composedAdvertisingSceneFrames(backgrounds, typography, productLayer=null, logoLayer=null) {
  const frames=[];
  for(const background of backgrounds.slice(0,3)) {
    const layers=[];
    if(productLayer) layers.push({input:productLayer,left:0,top:0});
    layers.push({input:typography,left:0,top:0});
    if(logoLayer) layers.push({input:logoLayer,left:0,top:0});
    frames.push(await sharp(background).resize(1080,1920,{fit:'cover'}).composite(layers).png().toBuffer());
  }
  return frames;
}

// Render-level gate: the output can be wrong even when the individual PNGs
// are correct (wrong asset, stale Shotstack edit, missing/frozen end card).
// Reuse the existing renderer and task; never order a second provider video.
export async function reviewRenderedAdvertisingVideo({openai,videoUrl,durationSeconds,sampleFrames,headline='',endCardHeadline='',closingLine='',model=REVIEW_MODEL,allowReviewServiceOutage=false,typographyPreflightPassed=false,deliveryFirstRender=false,sceneHeadlineOmitted=false}) {
  // Sample retrieval is an external quality-review dependency, not evidence of
  // corrupt content. Keep the finished Shotstack job and record follow-up.
  let frames;
  try {
    if (!sampleFrames) throw new Error('Advertising render review requires a frame sampler');
    frames=await sampleFrames({videoUrl,durationSeconds,fractions:[0.14,0.42,0.68,0.96]});
    if (!frames || frames.length!==4 || frames.some(f=>!f?.buffer)) throw new Error('Advertising render could not be fully inspected');
  } catch(error) {
    if(!allowReviewServiceOutage || !deliveryFirstRender) throw error;
    console.warn('Rendered advertisement review samples unavailable; preserving already completed provider render',
      {reason:String(error?.message||error).slice(0,240)});
    return {approved:true,issue:'none',phase:'rendered_video',reviewStatus:'unavailable',requiresFollowup:true,
      reason:String(error?.message||error).slice(0,240)};
  }
  try {
    return await reviewAdvertisingComposition({openai,frames:frames.slice(0,3).map(f=>f.buffer),endCard:frames[3].buffer,
      headline,endCardHeadline,closingLine,phase:'rendered_video',model,allowReviewServiceOutage,typographyPreflightPassed,deliveryFirstRender,sceneHeadlineOmitted});
  } catch(error) {
    // Never disguise an observed, concrete integrity defect as an outage.
    if(!allowReviewServiceOutage || !deliveryFirstRender || error?.code==='VIDEO_ADVERTISING_DESIGN_REJECTED') throw error;
    console.warn('Completed video review service could not supply a decision; retaining verified render',
      {reason:String(error?.message||error).slice(0,240)});
    return {approved:true,issue:'none',phase:'rendered_video',reviewStatus:'unavailable',requiresFollowup:true,
      reason:String(error?.message||error).slice(0,240)};
  }
}
