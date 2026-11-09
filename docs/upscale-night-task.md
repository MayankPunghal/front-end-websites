# Night task: upscale only the images that need it

Upscale the `/original` site's images that are displayed larger than their real size. Leave everything else alone. The laptop must stay awake and plugged in.

## Background

- The site has 788 mirrored images, listed in `src/data/img-manifest.json` on branch `original-video-hero` (worktree `artifacts/_tmp/main-wt`). Each entry has `i` (id), `w`, `h`, `bs` (widths available) and `a` (has transparency). Files are `public/img/<id>-<width>.webp`.
- 455 are already at least 1920 px wide. The other 333 total 479 megapixels, roughly 20+ hours, so do not run them all.
- The upscaler is `artifacts/_tmp/esrgan/bin/realesrgan-ncnn-vulkan.exe`, model `realesrgan-x4plus`, tile size 256. It is not committed; if missing, download v0.2.5.0 from the xinntao/Real-ESRGAN releases, with permission.
- Speed on this laptop: about 3.2 megapixels in 8 minutes.

## Pick the images

1. Build the original site and serve it on the preview server (`studio-preview`, port 4322).
2. With Playwright at 1440 x 900, device scale 2, open every page in the built site and scroll to the bottom so lazy images load.
3. For each `<img>`, record its displayed width, `currentSrc` and page.
4. Select an image only if all of these hold:
   - displayed width x 2 is greater than its manifest `w`, by at least 25%;
   - displayed width is at least 500 CSS px;
   - it is a photo, so skip `a: 1` cut-outs, logos, icons and anything smaller than 300 px wide.
5. Sort by displayed area, largest first. Write the list to `artifacts/_tmp/esrgan/picks.json` with id, URL, source size and page. Stop adding images once the estimate reaches 7 hours.

Already done, skip these: `Before_LE_upscale_prime.jpg`, `After_LE_upscale_prime.jpg`.

## Upscale

For each pick, skip it if its output already exists, so the run can resume:

1. Download the original from its manifest URL to `artifacts/_tmp/esrgan/src/`.
2. Upscale it 4x to `<name>-x4.png`.
3. With `sharp`, resize to at most 3840 px wide, preserving aspect ratio, and save as `public/img/<id>-<width>.webp` at quality 84. Use the output width in the file name.
4. Add that width to the entry's `bs` in the manifest. Do not change `w` or `h`.
5. Add it to the image's `srcset` if the page lists widths by hand, as the café slider does in `HomeBody.astro`. Otherwise raise the requested width.

## Check before shipping

- Compare each result with its original at the same crop. Reject any where text, faces, logos or the product changed; keep the original for those and list them in the report.
- People and printed text are the main risk. Team portraits must look like the same person, so leave them out if there is any doubt.
- Build, then `node tools/build-original.mjs`, then build the root. Check for broken images and that total `dist` stays well under 1 GB.

## Finish

Commit on `original-video-hero` and `studio`. Do not push `main` until the user has reviewed the results, because a push to `main` publishes the site.

Report: how many were upscaled, how many rejected and why, and hours taken.
