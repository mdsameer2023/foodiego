"""Read-only release configuration validation; requires PyYAML and jsonschema.
Fetches public schemas only. Never reads .env or calls deployment APIs.
"""
import hashlib
import json
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import urlopen
import yaml
import jsonschema
ROOT=Path(__file__).resolve().parents[2]
TARGETS=[
 ('.github/workflows/ci.yml','https://json.schemastore.org/github-workflow.json'),
 ('render.yaml','https://render.com/schema/render.yaml.json'),
 ('frontend/vercel.json','https://openapi.vercel.sh/vercel.json'),
]
results=[]
for filename,url in TARGETS:
 try:
  content=(ROOT/filename).read_text(encoding='utf-8-sig')
  data=json.loads(content) if filename.endswith('.json') else yaml.safe_load(content)
  if filename.endswith('ci.yml') and True in data:
   data['on']=data.pop(True) # YAML 1.1 loader; GitHub uses the literal key "on".
  with urlopen(url,timeout=20) as response: raw=response.read()
  schema=json.loads(raw)
  validator=jsonschema.validators.validator_for(schema)
  errors=list(validator(schema).iter_errors(data))
  results.append({'file':filename,'status':'FAIL' if errors else 'PASS','schema':url,'schemaSha256':hashlib.sha256(raw).hexdigest(),'configSha256':hashlib.sha256(content.encode()).hexdigest(),'errors':[{'path':'/'.join(map(str,e.path)),'message':e.message} for e in errors]})
 except Exception as error:
  results.append({'file':filename,'status':'BLOCKED','schema':url,'reason':type(error).__name__})
# Additional release invariants are checked even if a public schema is unavailable.
render=yaml.safe_load((ROOT/'render.yaml').read_text())
vercel=json.loads((ROOT/'frontend/vercel.json').read_text())
assert render['services'][0]['autoDeployTrigger']=='off'
assert vercel['git']['deploymentEnabled'] is False
workflow=yaml.safe_load((ROOT/'.github/workflows/ci.yml').read_text())
assert workflow['permissions']=={'contents':'read'}
assert all('deploy' not in key.lower() for key in workflow['jobs'])
report={'measuredAt':datetime.now(timezone.utc).isoformat(),'scope':'Local schema and invariant validation only; no hosting deployment or remote CI execution','results':results,'releaseInvariants':'PASS'}
output=ROOT/'docs/phase8/config-validation.json';output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,indent=2)+'\n')
for item in results:print(item['file']+': '+item['status'])
raise SystemExit(0 if all(item['status']=='PASS' for item in results) else 1)
