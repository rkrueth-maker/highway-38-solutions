#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'supabase/functions/h38-office-gateway/index.ts');
const bridgePath = path.join(root, 'commercial-app/bridge.js');
const failures = [];

function check(name, condition) {
  if (!condition) failures.push(name);
}

if (!fs.existsSync(sourcePath)) failures.push('gateway source file is missing');
if (!fs.existsSync(bridgePath)) failures.push('commercial Office bridge source is missing');
if (failures.length) {
  console.error(JSON.stringify({ status: 'FAIL', failures }, null, 2));
  process.exit(1);
}

const source = fs.readFileSync(sourcePath, 'utf8');
const bridge = fs.readFileSync(bridgePath, 'utf8');

check('dynamic Google Apps Script origin is allowed', source.includes('value.endsWith("-script.googleusercontent.com")'));
check('standard Google Apps Script origin is allowed', source.includes('value.endsWith(".script.googleusercontent.com")'));
check('Highway 38 production origin is explicit', source.includes('"https://highway38solutions.com"'));
check('Highway 38 www origin is explicit', source.includes('"https://www.highway38solutions.com"'));
check('CORS never uses a wildcard origin', !source.includes('"access-control-allow-origin": "*"'));
check('preflight reflects only a syntactically valid HTTP origin', source.includes('const allowed = isHttpOrigin(requested) ? requested'));
check('invalid preflight origins are rejected', source.includes('if (!isHttpOrigin(origin)) return new Response(null, { status: 403'));
check('bootstrap remains restricted to Google Apps Script', source.includes('if (!isGoogleScriptOrigin(origin)) return json(origin, 403'));
check('Office API remains restricted to Highway 38', source.includes('if (!isHighwayOrigin(origin)) return json(origin, 403'));
check('existing Apps Script project is pinned exactly', source.includes('1nNYrjaH4kwCWQ2SGWMbXGxpkDgLWXXEa_vGSec9N1DjSVLzAl1Z1fxhf'));
check('transcription-damaged Apps Script project ID is absent', !source.includes('1nNYrjaH4kwCWQ2SGWMbXgLWXXEa_vGSec9N1DjSVLzAl1Z1fxhf'));
check('existing Apps Script deployment is pinned', source.includes('AKfycbyY8cbfvGLzllw7rMhRY46wx_eIKhsK5oLlV6vIcDxDIKuCzX0_oTi4EyVufSxonLdxow'));
check('browser token isolation remains declared', source.includes('browserReceivesGoogleToken: false'));
check('external JWT verification remains intentionally custom', source.includes('type === "bootstrap"') && source.includes('type === "api"'));
check('active gateway transport version is recorded', source.includes('version: "3.0.3"') && source.includes('dynamicCorsTransport: true'));
check('gateway accepts encrypted session from JSON body', source.includes('const bodySession = String(body.gatewaySession || "").trim()'));
check('gateway API keeps Authorization fallback only inside the function', source.includes('const sessionToken = bodySession || (match ? match[1] : "")'));
check('gateway API returns an explicit result envelope', source.includes('return json(origin, 200, { status: "PASS", result })'));
check('gateway health declares body transport', source.includes('opaqueSessionInRequestBody: true'));
check('browser sends encrypted session in JSON body', bridge.includes("gatewaySession:this.session.gatewaySession"));
check('browser does not send opaque session in Authorization header', !bridge.includes('authorization:`Bearer ${this.session.gatewaySession}`'));
check('browser never stores a Google access token', !bridge.includes('accessToken:this.session') && bridge.includes('browserReceivesGoogleToken:false'));

const output = {
  status: failures.length ? 'FAIL' : 'PASS',
  checks: 22,
  failures,
  dynamicGoogleScriptOrigin: true,
  exactAppsScriptProjectId: true,
  wildcardCors: false,
  bootstrapOriginRestricted: true,
  officeApiOriginRestricted: true,
  opaqueSessionInRequestBody: true,
  opaqueSessionInAuthorizationHeader: false,
  existingAppsScriptProject: true,
  existingAppsScriptDeployment: true,
  browserReceivesGoogleToken: false
};

if (failures.length) {
  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(output, null, 2));