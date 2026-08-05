import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const here=path.dirname(fileURLToPath(import.meta.url));
const spanishDir=path.resolve(here,'..');
const html=await readFile(path.join(spanishDir,'index.html'),'utf8');
const cloze=JSON.parse(await readFile(path.join(spanishDir,'data','cloze_sentences.json'),'utf8'));

// Evaluate only the static verb dictionaries so generated conjugated sentences
// receive the same dependable, same-origin audio as the mined sentence bank.
const dataStart=html.indexOf('const VERBS=');
const dataEnd=html.indexOf('/* ============ STATE & HELPERS',dataStart);
if(dataStart<0||dataEnd<0) throw new Error('Could not locate verb data');
const context={};
vm.createContext(context);
vm.runInContext(
  html.slice(dataStart,dataEnd)
    .replace('const VERBS=','var VERBS=')
    .replace('const VERB_SENTENCES=','var VERB_SENTENCES='),
  context
);

const texts=new Set(cloze.map(item=>item.es));
for(const row of context.VERB_SENTENCES){
  for(const tense of row.tenses){
    const answer=row.answer||context.VERBS[row.verb][tense][row.subject];
    texts.add(row.es.replace('___',answer));
  }
}

const lessonStart=html.indexOf('const LESSONS =');
const lessonEnd=html.indexOf('/* ============ VERB GAME DATA',lessonStart);
const lessonContext={};
vm.createContext(lessonContext);
vm.runInContext(html.slice(lessonStart,lessonEnd).replace('const LESSONS =','var LESSONS ='),lessonContext);
for(const lesson of lessonContext.LESSONS){
  lesson.match?.forEach(pair=>texts.add(pair.b));
  lesson.swatches?.forEach(swatch=>texts.add(swatch.a));
  lesson.bank?.forEach(item=>texts.add(item.p.includes('___')?item.p.replace('___',item.a):item.p));
}

const extraMatch=html.match(/const EXTRA_VOCAB=(\[[\s\S]*?\n\]);/);
if(extraMatch){
  const extraContext={};vm.createContext(extraContext);vm.runInContext('var EXTRA_VOCAB='+extraMatch[1],extraContext);
  extraContext.EXTRA_VOCAB.forEach(item=>texts.add(item.b));
}

const outputDir=path.join(spanishDir,'audio');
await mkdir(outputDir,{recursive:true});
const manifest={};
const jobs=[];
for(const text of [...texts].sort((a,b)=>a.localeCompare(b,'es'))){
  const file='es-'+createHash('sha1').update(text).digest('hex').slice(0,14)+'.wav';
  manifest[text]=file;
  jobs.push({text,file:path.join(outputDir,file)});
}

let cursor=0,complete=0;
async function worker(){
  while(cursor<jobs.length){
    const job=jobs[cursor++];
    try{if((await stat(job.file)).size>4096){complete++;continue}}catch{}
    await new Promise((resolve,reject)=>{
      execFile('/usr/bin/say',['-v','Mónica','-r','180','--file-format=WAVE','--data-format=LEI16@16000','-o',job.file,'--',job.text],error=>error?reject(error):resolve());
    });
    complete++;
    if(complete%50===0) process.stdout.write(`generated ${complete}/${jobs.length}\n`);
  }
}
await Promise.all(Array.from({length:8},worker));
await writeFile(path.join(outputDir,'manifest.json'),JSON.stringify(manifest));
process.stdout.write(`generated ${complete} local Spanish audio files\n`);
