# v144.299 — Animated typography and logo

Deploy this complete archive over v144.298. No SQL changes are required.

Animated typography now defaults to gpt-image-2.5-flare, including when a legacy ANIMATED_OVERLAY_IMAGE_MODEL=gpt-image-2 override exists. Flare dated snapshots remain supported. The existing single image-edit request, medium quality, transparent PNG and validation remain in place. Fallback errors now include the actual model. Product rendering and Shotstack limits are unchanged.

Removed the generated white rounded plate behind the animated brand logo. The original logo pixels are preserved; a white background embedded in the uploaded logo itself is not removed.

Kling already uses Flare in its finalizer. Ordinary image generation remains on its existing model.

Verify with one new animated generation after deployment. Existing generated videos are unchanged. Local mock checks do not verify production API access or artistic quality.
