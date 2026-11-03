// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

// https://astro.build/config
// ASTRO_SITE / ASTRO_BASE are set by the GitHub Pages workflow
// (.github/workflows/deploy.yml) so the site is served under /fuzzy-sets-explorer/.
export default defineConfig({
  site: process.env.ASTRO_SITE || undefined,
  base: process.env.ASTRO_BASE || undefined,
  integrations: [react()]
});
