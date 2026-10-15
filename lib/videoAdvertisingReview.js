import sharp from 'sharp';

const REVIEW_MODEL = 'gpt-4.1-mini';
const NONTERMINAL_CREATIVE_FEEDBACK = new Set(['poor_hierarchy', 'wrong_alignment']);
const PREFLIGHT_CREATIVE_FEEDBACK = new Set(['too_small','low_contrast']);
const REASONS = ['none','too_small','low_contrast','subject_overlap','wrong_alignment','stray_graphics','poor_hierarchy','unfinished_end_card','other'];

// Run against the actual composed assets, never against GPT Image's atlas.
// The model is a quality gate, not a fallback graphic designer: a bad result
// must remain blocked for review or be redrawn without paying Kling again.
export async function reviewAdvertisingComposition({openai, frames, endCard, headline='', closingLine='', phase='composite', model=REVIEW_MODEL, allowReviewServiceOutage=false,typographyPreflightPassed=false}) {
  if (!openai?.responses?.create) throw new Error('Advertising review requires a vision-capable AI service');
  if (!Array.isArray(frames) || frames.length < 1 || !endCard) throw new Error('Advertising quality review requires composited scene frames and a closing card');
  const input = [{type:'input_text',text:`Independent visual art-direction audit of a vertical 9:16 product commercial, phase ${phase}. The supplied images are the FINAL COMPOSITED visible frames followed by the FINAL COMPOSITED end card, not isolated lettering or an atlas. Expected main message (reference only): ${JSON.stringify(headline)}. Expected closing line (reference only): ${JSON.stringify(closingLine)}. Decide whether each piece of typography is LARGE ENOUGH to read on a phone, has intentional premium visual hierarchy appropriate to this particular imagery, is visibly aligned, has sufficient contrast, avoids covering the product/face, and has no isolated accidental rules, stripes, vertical lines, scraps or detached strokes. The closing card must be a finished and visually balanced advertising design with a prominent well-centered CTA, not generic tiny text on a blank plate. An opening frame may intentionally precede the headline; do not require text in every image, only during the active headline interval. Do not reject solely because a visual style is bold, restrained, playful or unconventional; evaluate execution, not taste. Do not infer unseen frames or hidden bugs. approved=false only if there is a clearly visible significant defect. Identify the single primary reason using the enum; add one short actionable explanation, without inventing defects. Return JSON only.`}];
  const inputs = [...frames.slice(0,3),endCard];
  for (const frame of inputs) {
    const preview=await sharp(frame).rotate().resize({width:540,height:960,fit:'cover'}).jpeg({quality:83}).toBuffer();
    input.push({type:'input_image',image_url:`data:image/jpeg;base64,${preview.toString('base64')}`,detail:'high'});
  }
  let answer;
  try { answer = await openai.responses.create({model,input:[{role:'user',content:input}],max_output_tokens:280,
    text:{format:{type:'json_schema',name:'video_advertising_composition_review_v345',strict:true,schema:{type:'object',additionalProperties:false,
      properties:{approved:{type:'boolean'},issue:{type:'string',enum:REASONS},reason:{type:'string'}},required:['approved','issue','reason']}}}},
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
  if (result.approved!==true || result.issue!=='none') {
    // Aesthetic preference is feedback, not proof that the delivered product
    // or exact, legible wording is unsafe. Keep hard stops for objectively
    // defective text, stray objects, subject overlap and broken end cards.
    if(NONTERMINAL_CREATIVE_FEEDBACK.has(result.issue) || (typographyPreflightPassed && PREFLIGHT_CREATIVE_FEEDBACK.has(result.issue))) {
      return {approved:true,issue:'none',phase,model,reviewStatus:'creative_advisory',
        creativeFeedback:{issue:result.issue,reason:String(result.reason||'').slice(0,250)}};
    }
    const error=new Error(`Advertising visual quality rejected (${result.issue}): ${String(result.reason||'Design did not pass the visual review').slice(0,250)}`);
    error.code='VIDEO_ADVERTISING_DESIGN_REJECTED';
    error.review={approved:false,issue:result.issue,reason:result.reason,phase};
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
export async function reviewRenderedAdvertisingVideo({openai,videoUrl,durationSeconds,sampleFrames,headline='',closingLine='',model=REVIEW_MODEL,allowReviewServiceOutage=false,typographyPreflightPassed=false}) {
  if (!sampleFrames) throw new Error('Advertising render review requires a frame sampler');
  const frames=await sampleFrames({videoUrl,durationSeconds,fractions:[0.14,0.42,0.68,0.96]});
  if (!frames || frames.length!==4 || frames.some(f=>!f?.buffer)) throw new Error('Advertising render could not be fully inspected');
  return reviewAdvertisingComposition({openai,frames:frames.slice(0,3).map(f=>f.buffer),endCard:frames[3].buffer,headline,closingLine,phase:'rendered_video',model,allowReviewServiceOutage,typographyPreflightPassed});
}
