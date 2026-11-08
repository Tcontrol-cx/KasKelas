import { defineConfig } from '@neon/config/v1';

export default defineConfig({
  functions: {
    'kasapi': {
      name: 'KasKelas API',
      source: './functions/kasapi.ts'
    }
  }
});
