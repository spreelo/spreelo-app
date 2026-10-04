// Only delivery operations are injected: this module cannot generate images or submit renders.
export async function completeShotstackDelivery({supabase,post,rule,reviewRequired,isAdminTest=false,
  sendEmail,saveHistory,getRecipient,submissionAlreadySettled=false}) {
  const {data:claim,error:claimError}=await supabase.rpc('claim_shotstack_delivery',{p_post_id:post.id});
  if(claimError)throw new Error(`Shotstack delivery migration is required: ${claimError.message}`);
  if(!claim?.claimed)return {completed:claim?.status==='completed',busy:true};
  const delivery=claim.delivery;
  const checkpoint=post.video_background_selection?.shotstack_checkpoint||{};
  const context=checkpoint.delivery_context||{};
  const alreadyReleased=Boolean(post.approval_email_sent_at&&['approved_by_spreelo','released','archived'].includes(post.admin_review_status));
  const requiresReview=!alreadyReleased&&Boolean(reviewRequired||isAdminTest||context.is_admin_test||checkpoint.origin==='admin');
  const persist=async values=>{
    const {data,error}=await supabase.from('shotstack_post_deliveries').update(values)
      .eq('post_id',post.id).eq('lease_token',delivery.lease_token).select('post_id');
    if(error||!data?.length)throw new Error(error?.message||'Shotstack delivery lease was lost');
    Object.assign(delivery,values);
  };
  const writePost=async values=>{
    const {error}=await supabase.from('posts').update(values).eq('id',post.id).eq('video_status','ready');
    if(error)throw error;
  };
  const routeReview=async(sent=false,note=null)=>{
    await writePost({admin_review_status:alreadyReleased?post.admin_review_status:(requiresReview||note?'pending':'not_required'),admin_review_note:note,updated_at:new Date().toISOString()});
    if(checkpoint.occurrence_id){
      const {error}=await supabase.from('admin_review_cases').upsert({occurrence_id:checkpoint.occurrence_id,
        post_id:post.id,user_id:post.user_id,brand_profile_id:post.brand_profile_id,
        automation_rule_id:post.automation_rule_id,status:sent?'sent_directly':'awaiting_spreelo',
        needs_review:!sent,draft_content:post.content,product_items:post.admin_product_items||[],
        content_format:post.content_format,scheduled_for:post.scheduled_for,
        failure_message:note,delivered_at:sent?new Date().toISOString():null,updated_at:new Date().toISOString()}, {onConflict:'occurrence_id'});
      if(error)throw error;
    }
    if(!checkpoint.occurrence_id){
      const {error}=await supabase.from('admin_review_cases').update({status:sent?'sent_directly':'awaiting_spreelo',
        needs_review:!sent,failure_code:null,failure_stage:null,failure_message:note,
        delivered_at:sent?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('post_id',post.id);
      if(error)throw error;
    }
    const {error}=await supabase.from('admin_generation_work_items').update({status:sent?'history':'approval',
      failure_message:note,...(post.video_provider==='kling'?{rescue_status:'used'}:{}),updated_at:new Date().toISOString()}).eq('post_id',post.id);
    if(error)throw error;
  };
  try{
    if(!delivery.history_done){if(!submissionAlreadySettled)await saveHistory({post,rule,context});await persist({history_done:true});}
    if(!delivery.credits_done){
      if(submissionAlreadySettled){await persist({credits_done:true});}
      const {error}=submissionAlreadySettled?{error:null}:await supabase.rpc('settle_shotstack_delivery_credit',{p_post_id:post.id});
      if(error)throw error;
      delivery.credits_done=true;
    }
    await routeReview(false);
    if(!requiresReview){
      if(!delivery.mail_sent_at&&!post.approval_email_sent_at){
        const recipient=await getRecipient(post.user_id);
        if(!recipient?.email)throw new Error('Customer approval email address is missing');
        await sendEmail({post,rule,recipient,delivery});
      }
      if(delivery.mail_sent_at||post.approval_email_sent_at){
        await writePost({approval_email_sent_at:delivery.mail_sent_at||post.approval_email_sent_at});
      }
      await routeReview(true);
    }
    await persist({status:'completed',completed_at:new Date().toISOString(),lease_until:null,last_error:null});
    return {completed:true,emailed:!requiresReview,reviewRequired:requiresReview};
  }catch(error){
    const note=`Video ready; delivery needs another check: ${error.message}`;
    try{await routeReview(false,note);}catch(reviewError){console.error('Could not expose pending Shotstack delivery',{postId:post.id,message:reviewError.message});}
    try{await persist({status:error.code==='EMAIL_RECONCILIATION_REQUIRED'||/Original (credit reservation|automation rule).*reconciliation/i.test(error.message)?'needs_review':'pending',
      retry_at:new Date(Date.now()+90_000).toISOString(),lease_until:null,last_error:error.message});}catch(persistError){console.error('Could not retain Shotstack delivery retry',{postId:post.id,message:persistError.message});}
    return {completed:false,deliveryPending:true,error:error.message};
  }
}
