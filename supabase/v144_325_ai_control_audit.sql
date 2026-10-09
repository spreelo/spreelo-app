-- v325: add separate purposes, preserving every v322 default and existing selections.
insert into public.ai_model_settings (purpose,provider,model,default_model,capability) values
('manual_post','openai','gpt-5.5','gpt-5.5','text_reasoning'),
('campaign_plan','openai','gpt-5.5','gpt-5.5','text_reasoning')
on conflict (purpose) do nothing;
