export const securityHeaders = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
});

export function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(payload));
}

export function sendText(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { ...securityHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(body);
}

// `publicCode` (not `code`) so it can never be confused with a driver error's SQLSTATE `code`.
export function apiError(statusCode, publicCode) {
  return Object.assign(new Error(publicCode), { statusCode, publicCode });
}
