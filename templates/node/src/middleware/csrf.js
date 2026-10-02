import crypto from 'node:crypto';

export function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  return req.session.csrf;
}

export function verifyCsrf(req, res, next) {
  const sent = Buffer.from(String(req.body?._csrf ?? ''));
  const expected = Buffer.from(String(req.session?.csrf ?? ''));

  if (sent.length === 0 || sent.length !== expected.length || !crypto.timingSafeEqual(sent, expected)) {
    return res.status(403).send('Invalid form token. Reload the page and try again.');
  }
  next();
}
