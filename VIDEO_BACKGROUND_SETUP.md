# Video background library setup

This version uses reusable 9:16 MP4 backgrounds for Animated product Reel posts.

## 1. Run the SQL

Run this file in the Supabase SQL Editor:

`supabase/video_background_library.sql`

It creates:

- Storage bucket `video-backgrounds`
- Table `video_background_assets`
- Background-selection fields on `posts`

## 2. Add an administrator in Vercel

Add one of these environment variables and redeploy:

- `SPREELO_ADMIN_EMAILS` — comma-separated Spreelo login emails
- `SPREELO_ADMIN_USER_IDS` — comma-separated Supabase auth user IDs

Example:

`SPREELO_ADMIN_EMAILS=your-login@example.com`

Optional:

`ANIMATED_OVERLAY_IMAGE_MODEL=gpt-image-1.5`

The default is already `gpt-image-1.5`, because the animated foreground needs a transparent PNG.

## 3. Upload backgrounds

Open:

`https://app.spreelo.com/video-backgrounds`

Accepted files:

- MP4
- 1080 × 1920
- 4.5–15 seconds
- Maximum 60 MB

The page creates a poster automatically, uploads both files directly to Supabase with signed upload URLs, and saves the metadata.

Upload at least one neutral asset and mark it as **Use as neutral fallback**.

## 4. How selection works

Spreelo scores active backgrounds using:

1. Specific campaign or season
2. Industry and product category
3. Mood
4. Contrast against the product color/brightness
5. Text/logo safe metadata
6. Recent background and family usage

The selected asset and scoring details are stored on the generated post.

## 5. Publishing behavior

Animated product content is rendered only as 1080 × 1920 vertical video.

- Facebook: Reels Publishing API
- Instagram: Reel with `share_to_feed: false`

One rendered video can later be reused for TikTok and YouTube Shorts.
