import { getAuth } from '../auth/store.js';

// A session is only valid if it carries the current auth version,
// so changing the password signs out every other session.
export function isAuthed(req) {
  return Boolean(req.session?.isAdmin) && req.session.authVersion === getAuth().version;
}

export function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.redirect('/login');
}
