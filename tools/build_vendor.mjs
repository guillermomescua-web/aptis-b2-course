import {build} from 'esbuild';
import fs from 'node:fs';
const outfile=new URL('../src/vendor/supabase.js',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1');
await build({stdin:{contents:"export {createClient} from '@supabase/supabase-js';",resolveDir:process.cwd()},outfile,bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',legalComments:'external'});
fs.writeFileSync(new URL('../src/vendor/README.md',import.meta.url),'Supabase JavaScript client 2.102.0, bundled locally. Rebuild with `node tools/build_vendor.mjs`. Sources and licenses: https://github.com/supabase/supabase-js\n');
const licenses=[['Supabase','@supabase+auth-js@2.102.0/node_modules/@supabase/auth-js/LICENSE'],['Phoenix','@supabase+phoenix@0.4.5/node_modules/@supabase/phoenix/LICENSE.md'],['Iceberg','iceberg-js@0.8.1/node_modules/iceberg-js/LICENSE'],['tslib','tslib@2.8.1/node_modules/tslib/LICENSE.txt']];
fs.writeFileSync(new URL('../src/vendor/THIRD-PARTY-LICENSES.txt',import.meta.url),licenses.map(([name,file])=>name+'\n'+fs.readFileSync(new URL('../node_modules/.pnpm/'+file,import.meta.url),'utf8')).join('\n\n'));
