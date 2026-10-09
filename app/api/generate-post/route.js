import { activeAiModel, withRuntimeAiModels } from "../../../lib/aiModelControl.js";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { normalizeSingleContentLanguage } from "../../../lib/contentLanguage.js";
import {
  createGenerationCostTracker,
  wrapOpenAIForCostTracking,
} from "../../../lib/generationCostTracking.js";

const rawOpenai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function originalPost(request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader) {
      return Response.json(
        { error: "Missing authorization header." },
        { status: 401 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return Response.json(
        { error: "You must be logged in to generate posts." },
        { status: 401 }
      );
    }

    const {
      idea,
      platform,
      tone,
      language,
      postType,
      websiteUrl,
      length,
      includeEmojis,
      includeHashtags,
      ctaType,
    } = await request.json();

    if (!idea || !idea.trim()) {
      return Response.json(
        { error: "Post idea is required." },
        { status: 400 }
      );
    }

    const { data: brandProfile } = await supabase
      .from("brand_profiles")
      .select("business_name, industry, target_audience")
      .eq("user_id", user.id)
      .single();

    const businessName = brandProfile?.business_name || "the business";
    const industry = brandProfile?.industry || "unknown industry";
    const targetAudience =
      brandProfile?.target_audience || "the target audience";

    const normalizedLanguage = normalizeSingleContentLanguage(language, "English");

    // v144.12: meter the existing manual-create model call without changing
    // how the post is generated. The random session is later bound to the
    // saved draft after the client receives its post id. Metering is strictly
    // non-fatal: if the admin-only table is unavailable, generation continues.
    const generationCostSessionId = randomUUID();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const adminSupabase = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
    const costTracker = adminSupabase
      ? createGenerationCostTracker({
          supabase: adminSupabase,
          generationSessionId: generationCostSessionId,
          generationUserId: user.id,
        })
      : null;
    const openai = costTracker
      ? wrapOpenAIForCostTracking(rawOpenai, () => costTracker)
      : rawOpenai;

    const emojiRule = includeEmojis
      ? "Use emojis where they make the post more engaging, but do not overdo it."
      : "Do not use emojis.";

    const hashtagRule = includeHashtags
      ? "Add a few relevant hashtags at the end."
      : "Do not include hashtags.";

    const websiteRule = websiteUrl
      ? `Include this website link naturally in the call to action: ${websiteUrl}`
      : "Do not invent a website link.";

    const response = await openai.responses.create({
      model: activeAiModel("manual_post", "gpt-5.5"),
      instructions:
        "You are Spreelo, an expert social media content assistant for small businesses. Write practical, ready-to-publish social media posts. Do not mention that you are AI. Do not explain your work. Only return the finished post text.",
      input: `
Create one social media post.

Business name: ${businessName}
Industry: ${industry}
Target audience: ${targetAudience}

Platform: ${platform}
Tone: ${tone}
Language: ${normalizedLanguage}
Post type: ${postType}
Length: ${length}
CTA type: ${ctaType}

Website:
${websiteUrl || "No website provided"}

Post idea:
${idea}

Rules:
- Write in the selected language.
- Make it suitable for the selected platform.
- Match the selected tone.
- Match the selected length.
- Use a clear call to action based on the CTA type.
- ${websiteRule}
- ${emojiRule}
- ${hashtagRule}
- Make the post feel natural, not generic.
- Do not use quotation marks around the final post.
- Only return the finished post text.
      `,
    });

    return Response.json({
      content: response.output_text,
      generation_cost_session_id: generationCostSessionId,
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Something went wrong." },
      { status: 500 }
    );
  }
}

// Model settings are scoped to this request; v322 model is the fallback.
export async function POST(request) { return withRuntimeAiModels(() => originalPost(request)); }
