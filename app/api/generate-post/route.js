import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(request) {
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

    const { idea, platform, tone, language, postType } = await request.json();

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

    const response = await openai.responses.create({
      model: "gpt-5.5",
      instructions:
        "You are Vifsy, an expert social media content assistant for small businesses. Write practical, ready-to-publish social media posts. Do not mention that you are AI. Keep the result clean and useful.",
      input: `
Create one social media post.

Business name: ${businessName}
Industry: ${industry}
Target audience: ${targetAudience}

Platform: ${platform}
Tone: ${tone}
Language: ${language}
Post type: ${postType}

Post idea:
${idea}

Rules:
- Write in the selected language.
- Make it suitable for the selected platform.
- Include a clear call to action.
- Include a few relevant hashtags if suitable.
- Do not explain the post. Only return the finished post text.
      `,
    });

    return Response.json({
      content: response.output_text,
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Something went wrong." },
      { status: 500 }
    );
  }
}
