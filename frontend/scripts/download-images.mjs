import fs from 'node:fs/promises';
const source = await fs.readFile('src/lib/data.ts', 'utf8');
await fs.mkdir('public/images', {recursive:true});
const photos = [...source.matchAll(/(\w+): '(https:\/\/images\.unsplash\.com\/[^']+)'/g)];
await Promise.all(photos.map(async ([,name,url]) => {
  const response = await fetch(url);
  if(!response.ok) throw new Error(`${name}: ${response.status}`);
  await fs.writeFile(`public/images/${name}.jpg`,Buffer.from(await response.arrayBuffer()));
  console.log(`Downloaded ${name}`);
}));
if(photos.length) {
  await fs.writeFile('public/images/SOURCES.md', '# Demo photography\n\nStock food photographs from Unsplash. Illustrative, not photographs of the fictional restaurants.\n\n'+photos.map(([,name,url])=>`- ${name}: ${url}`).join('\n')+'\n');
  await fs.writeFile('src/lib/data.ts', source.replace(/(\w+): '(https:\/\/images\.unsplash\.com\/[^']+)'/g,(_,name)=>`${name}: '/images/${name}.jpg'`));
}
