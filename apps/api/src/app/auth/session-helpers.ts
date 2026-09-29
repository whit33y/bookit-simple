import { Request } from 'express';
import { SessionIdentity } from './auth.service';

/** New session id on login, so a session id planted before login is useless (session fixation). */
export function startSession(
  req: Request,
  { userId, staffMemberId }: SessionIdentity,
): Promise<void> {
  return new Promise((resolve, reject) =>
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.staffMemberId = staffMemberId;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    }),
  );
}

export function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) =>
    req.session.destroy((err) => (err ? reject(err) : resolve())),
  );
}
