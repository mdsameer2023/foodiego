import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deploymentEnvironmentIssues} from '../src/lib/deployment-env';
test('hosted frontend requires explicit HTTPS API and canonical URLs',()=>{
 assert.deepEqual(deploymentEnvironmentIssues({VERCEL:'1',NEXT_PUBLIC_API_URL:'https://api.foodiego.example/api',NEXT_PUBLIC_SITE_URL:'https://foodiego.example'}),[]);
 assert.equal(deploymentEnvironmentIssues({VERCEL:'1',NEXT_PUBLIC_API_URL:'http://localhost:5000/api'}).length,2);
 assert.deepEqual(deploymentEnvironmentIssues({NEXT_PUBLIC_API_URL:'http://localhost:5000/api'}),[]);
});
test('frontend cloud builds reject secret variables and live payment key IDs without printing values',()=>{
 const errors=deploymentEnvironmentIssues({VERCEL:'1',NEXT_PUBLIC_API_URL:'https://api.foodiego.example/api',NEXT_PUBLIC_SITE_URL:'https://foodiego.example',NEXT_PUBLIC_GEMINI_API_KEY:'synthetic-sensitive-value',NEXT_PUBLIC_RAZORPAY_KEY_ID:'rzp_live_synthetic'});
 assert.equal(errors.length,2);assert.equal(errors.join('').includes('synthetic-sensitive-value'),false);
});
