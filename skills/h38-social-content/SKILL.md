---
name: h38-social-content
description: Create and validate tenant-neutral social content and AI-spokesperson workflows for H38 Social Studio. Use for Hank scripts, social posts, branded media, avatar/spokesperson video prototypes, or future Northern Lakes/customer social modules.
---

1. Treat Social Studio as a tenant-neutral engine. H38 is one tenant; Hank is one spokesperson configuration.
2. Keep tenant assets/config isolated: logo, brand colors, services, voice, spokesperson/avatar, social accounts, templates, and approval settings.
3. For H38, use the exact approved H38 logo asset. Never redraw, regenerate, recolor, distort, trace, crop, or substitute it.
4. Separate content generation from rendering:
   - content brief;
   - script/caption;
   - scene/shot plan;
   - avatar/voice configuration;
   - render job;
   - preview;
   - owner approval;
   - publish/schedule.
5. Store source assets and render metadata so the same content can be rerendered without rewriting the business logic.
6. A spokesperson video is not complete merely because a static image has audio. Verify visible speech animation/lip sync, natural motion, audio, aspect ratio, captions when requested, and final brand placement.
7. Never bake tenant-specific H38 assumptions into the shared renderer. Keep Hank/H38 values in configuration.
8. Require owner approval before publishing or scheduling external social content unless a future tenant explicitly enables an approved automation policy.
9. Prefer real business photos/screenshots/product footage when they better prove the software/service; use generated visuals only where appropriate and never to recreate a locked brand asset.
10. For each content item, return/store: tenant, campaign, platform, format, script/caption, asset references, spokesperson/voice, render status, approval status, and publish/schedule status.
