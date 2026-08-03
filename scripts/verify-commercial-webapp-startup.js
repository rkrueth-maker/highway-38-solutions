#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const [deploymentUrl, credentialsArg] = process.argv.slice(2);
const credentialsPath = credentialsArg || path.join(process.env.HOME || '', '.clasprc.json');

function fail(message, details = {}) {
  console.error(JSON.stringify({ status: 'FAIL', message, ...details }, null, 2));
  process.exit(1);
}

if (!deploymentUrl) fail('Deployment URL is required.');
if (!fs.existsSync(credentialsPath)) fail('Authorized Google credential file was not found.');

let credentials;
try {
  credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
} catch (error) {
  fail('Authorized Google credential file is not valid JSON.', { error: error.message });
}

function findByKey(value, keys, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return '';
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (keys.includes(key) && typeof child === 'string' && child.trim()) return child.trim();
  }
  for (const child of Object.values(value)) {
    const found = findByKey(child, keys, seen);
    if (found) return found;
  }
  return '';
}

let accessToken = findByKey(credentials, ['access_token', 'accessToken']);
const refreshToken = findByKey(credentials, ['refresh_token', 'refreshToken']);
const clientId = findByKey(credentials, ['client_id', 'clientId']);
const clientSecret = findByKey(credentials, ['client_secret', 'clientSecret']);

if (!accessToken && !(refreshToken && clientId && clientSecret)) {
  fail('The existing Google credential does not contain a usable access token or refresh credentials.');
}

function isScriptHost(hostname) {
  return hostname === 'script.google.com' ||
    hostname === 'script.googleusercontent.com' ||
    hostname.endsWith('.script.googleusercontent.com');
}

async function refreshAccessToken() {
  if (!(refreshToken && clientId && clientSecret)) return false;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  if (!response.ok) return false;
  const payload = await response.json();
  if (!payload.access_token) return false;
  accessToken = payload.access_token;
  return true;
}

async function fetchAuthorized(url, redirects = 0) {
  if (redirects > 6) fail('The deployed web app exceeded the allowed redirect count.');
  const parsed = new URL(url);
  if (!isScriptHost(parsed.hostname)) {
    fail('The deployed web app redirected outside the approved Apps Script hosts.', {
      redirectedHost: parsed.hostname
    });
  }

  const response = await fetch(parsed, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json,text/plain;q=0.9'
    },
    redirect: 'manual'
  });

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) fail('The deployed web app returned a redirect without a destination.');
    const next = new URL(location, parsed);
    if (!isScriptHost(next.hostname)) {
      fail('The deployed web app redirected to Google sign-in instead of completing authorized startup.', {
        redirectedHost: next.hostname,
        httpStatus: response.status
      });
    }
    return fetchAuthorized(next.toString(), redirects + 1);
  }

  return response;
}

(async () => {
  const acceptanceUrl = new URL(deploymentUrl);
  acceptanceUrl.searchParams.set('acceptance', 'startup');
  acceptanceUrl.searchParams.set('v', String(Date.now()));

  let response = await fetchAuthorized(acceptanceUrl.toString());
  if ([401, 403].includes(response.status) && await refreshAccessToken()) {
    response = await fetchAuthorized(acceptanceUrl.toString());
  }

  const text = await response.text();
  if (!response.ok) {
    fail('The deployed startup acceptance endpoint returned a non-success status.', {
      httpStatus: response.status,
      contentType: response.headers.get('content-type') || '',
      bodyPreview: text.slice(0, 240)
    });
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    fail('The deployed startup acceptance endpoint did not return JSON.', {
      httpStatus: response.status,
      contentType: response.headers.get('content-type') || '',
      bodyPreview: text.slice(0, 240)
    });
  }

  if (payload.status !== 'PASS' || !payload.businessId || !payload.businessName) {
    fail('The deployed startup acceptance payload was incomplete or failed.', {
      payload: {
        status: payload.status || '',
        businessIdPresent: Boolean(payload.businessId),
        businessNamePresent: Boolean(payload.businessName),
        fullRefreshPending: payload.fullRefreshPending
      }
    });
  }

  console.log(JSON.stringify({
    status: 'PASS',
    acceptance: 'DEPLOYED_WEB_APP_STARTUP',
    businessId: payload.businessId,
    businessName: payload.businessName,
    canSwitchBusinesses: payload.canSwitchBusinesses === true,
    elapsedMs: Number(payload.elapsedMs || 0),
    fullRefreshPending: payload.fullRefreshPending === true,
    httpStatus: response.status
  }, null, 2));
})().catch(error => fail('Authorized deployed startup acceptance crashed.', { error: error.message }));
