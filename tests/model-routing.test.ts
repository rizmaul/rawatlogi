import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultAPIConfig, apiConfigSchema, modelProfile, modelPurposeForJob, selectModelConfig} from '../shared/ai';

test('research and content jobs use their assigned profiles, including writing topics and legacy drafts',()=>{
  const config={...defaultAPIConfig,apiKey:'fixture',content:{...modelProfile(defaultAPIConfig),model:'premium-fixture',effort:'high' as const,protocol:'chat-completions' as const,maxOutputTokens:8192}};
  const cases:[Parameters<typeof modelPurposeForJob>[0],'research'|'content'][]=[
    [{kind:'research'},'research'],[{kind:'questions',purpose:'research'},'research'],
    [{kind:'questions',purpose:'writing'},'content'],[{kind:'writing'},'content'],[{},'content'],
    [{kind:'connection-test'},'research'],[{kind:'connection-test',modelPurpose:'content'},'content'],
  ];
  for(const [payload,expected] of cases){
    const purpose=modelPurposeForJob(payload);assert.equal(purpose,expected);
    const selected=selectModelConfig(config,purpose);
    assert.equal(selected.model,expected==='content'?'premium-fixture':defaultAPIConfig.model);
    assert.equal(selected.apiKey,'fixture');assert.equal(selected.baseUrl,config.baseUrl);
  }
  assert.equal(selectModelConfig(config,'content').effort,'high');
  assert.equal(selectModelConfig(config,'research').maxOutputTokens,32768);
  assert.equal(apiConfigSchema.safeParse({...config,content:{...config.content,model:''}}).success,false);
});
