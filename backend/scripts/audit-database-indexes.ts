import 'dotenv/config';
import mongoose from 'mongoose';
import {loadEnv} from '../src/config/env.js';
import {indexModels} from '../src/config/indexes.js';
import {writeFile,mkdir} from 'node:fs/promises';
const connection=mongoose.createConnection();
const results:{model:string;status:string;missing:number}[]=[];
try {
 const env=loadEnv();
 await connection.openUri(env.MONGODB_URI,{dbName:'foodiego',autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:8000});
 await connection.db!.admin().ping({maxTimeMS:1000});
 for(const model of indexModels){
  try{
   const existing=await connection.db!.collection(model.collection.name).indexes();
   const missing=model.schema.indexes().filter(([key,options])=>!existing.some(index=>(Object.values(key).includes('text') ? index.key._fts==='text'&&JSON.stringify(Object.keys(index.weights||{}).sort())===JSON.stringify(Object.entries(key).filter(([,value])=>value==='text').map(([field])=>field).sort()) : JSON.stringify(index.key)===JSON.stringify(key))&&(!options.unique||index.unique===true)&&(!options.sparse||index.sparse===true)&&(options.expireAfterSeconds===undefined||index.expireAfterSeconds===options.expireAfterSeconds)&&(!options.partialFilterExpression||JSON.stringify(index.partialFilterExpression)===JSON.stringify(options.partialFilterExpression))));
   results.push({model:model.modelName,status:missing.length?'FAIL':'PASS',missing:missing.length});
  }catch{results.push({model:model.modelName,status:'NOT VERIFIED',missing:model.schema.indexes().length});}
 }
 await mkdir('../docs/phase8',{recursive:true});
 await writeFile('../docs/phase8/database-index-audit.json',JSON.stringify({measuredAt:new Date().toISOString(),connection:'PASS',scope:'Read-only listIndexes audit of configured foodiego database; no migration, createCollection or data writes',results},null,2));
 console.log('Database connectivity: PASS; read-only index audit saved (no credentials or documents printed).');
 console.log(`Index declarations: ${results.filter(row=>row.status==='PASS').length}/${results.length} models PASS.`);
 if(results.some(row=>row.status!=='PASS'))process.exitCode=1;
}catch{
 console.error('Database audit: NOT VERIFIED; connection or permission error. No credentials printed.');process.exitCode=1;
}finally{await connection.close();}
