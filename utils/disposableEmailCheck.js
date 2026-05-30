/**
 * utils/disposableEmailCheck.js
 *
 * Blocks registration attempts from known disposable / temporary email services.
 * Prevents spam that gets our email-provider accounts flagged and blocked.
 *
 * Keep this list lean — only genuine throwaway services, not all free providers.
 * Gmail, Yahoo, Outlook, iCloud, etc. are intentionally ALLOWED.
 */

'use strict';

// ─── Blocked domains ──────────────────────────────────────────────────────────
// Sourced from real abuse in production logs + the most common throwaway services.
const BLOCKED_DOMAINS = new Set([
  // Seen in production logs
  'bltiwd.com', 'gmeenramy.com', 'bwmyga.com', 'lnovic.com', 'yzcalo.com',

  // Major throwaway / temp-mail services
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'guerrillamail.biz',
  'guerrillamail.de', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamailblock.com',
  'temp-mail.org', 'tempmail.com', 'tmpmail.net', 'tmpmail.org',
  'throwam.com', 'throwaway.email',
  'sharklasers.com', 'grr.la',
  'spam4.me', 'yopmail.com', 'yopmail.fr', 'yopmail.pp.ua',
  'cool.fr.nf', 'jetable.fr.nf', 'jetable.org',
  'nospam.ze.tc', 'nomail.xl.cx',
  'courriel.fr.nf', 'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf',
  'dispostable.com', 'fakeinbox.com', 'maildrop.cc',
  'trashmail.at', 'trashmail.com', 'trashmail.me', 'trashmail.net',
  'trashmail.io', 'trashmail.xyz',
  'trash-mail.at', 'trash-mail.com', 'trash-mail.de', 'trash-mail.io',
  'trashdevil.com', 'trashdevil.de', 'trashemail.de', 'trashimail.com',
  'mailnesia.com', 'mailnull.com', 'spamgourmet.com', 'spamgourmet.net', 'spamgourmet.org',
  'mail-temporaire.fr',
  'spambox.us', 'spamfree24.org',
  'mailsac.com', 'spamdecoy.net',
  'tempr.email', 'discard.email', 'discardmail.com', 'discardmail.de',
  'tempinbox.co.uk', 'tempinbox.com',
  'temporary-mail.net', 'temporaryemail.net', 'temporaryemail.us',
  'temporaryforwarding.com', 'temporaryinbox.com',
  'trbvm.com', 'tyldd.com', 'klzlk.com', 'rklips.com', 'rppkn.com',
  'rcpt.at', 'owlpic.com', 'iogcheckbox.net', 'altmails.com',
  'deadaddress.com', 'mailfreeonline.com',
  'mailinator.net', 'mailinator2.com',
  'getonemail.com', 'getonemail.net',
  'quickinbox.com', 'inboxclean.com', 'inboxclean.org',
  'binkmail.com', 'bob.email',
  'dispostable.com',
  'fakeinbox.com', 'fakedemail.com', 'fakeemailgenerator.com',
  'filzmail.com',
  'mail0.ga', 'mail1a.de',
  'mailbidon.com', 'mailbiz.biz', 'mailblocks.com',
  'mailbucket.org', 'mailcat.biz', 'mailcatch.com',
  'maileater.com', 'maileimer.de', 'mailexpire.com',
  'mailfall.com', 'mailguard.me',
  'mailinater.com', 'mailme.lv', 'mailme24.com',
  'mailmetrash.com', 'mailmoat.com',
  'mailpen.com', 'mailscrap.com', 'mailsiphon.com',
  'mailslapping.com', 'mailslite.com',
  'mailzilla.org',
  'meinspamschutz.de', 'meltmail.com', 'messagebeamer.de',
  'mintemail.com', 'mt2009.com', 'mt2014.com',
  'mytempemail.com', 'mytrashmail.com',
  'no-spam.ws', 'nobulk.com', 'nomail.pw', 'nomail2me.com', 'nospamfor.us',
  'odnorazovoe.ru',
  'omail.pro', 'oneoffemail.com', 'onewaymail.com',
  'opayq.com',
  'pookmail.com', 'proxymail.eu',
  'safetymail.info', 'safetypost.de',
  'scramble.im',
  'secret-police.com',
  'slopsbox.com',
  'spamavert.com',
  'spambob.com', 'spambob.net', 'spambob.org',
  'spamcero.com', 'spamcon.org',
  'spamcowboy.com', 'spamcowboy.net', 'spamcowboy.org',
  'spamday.com', 'spamex.com', 'spamfree.eu',
  'spamhole.com', 'spamify.com', 'spamkill.info',
  'spaml.com', 'spaml.de', 'spammotel.com', 'spamobox.com', 'spamoff.de',
  'spamslicer.com', 'spamspot.com', 'spamstack.net',
  'spamthis.co.uk', 'spamthisplease.com', 'spamtrail.com',
  'spoofmail.de', 'stuffmail.de',
  'super-auswahl.de',
  'sweetxxx.de',
  'tafmail.com', 'techemail.com',
  'tilien.com', 'tittbit.in', 'tradermail.info',
  'twinmail.de', 'turual.com',
  'umail.net', 'uroid.com',
  'venompen.com',
  'vkcode.ru', 'vomoto.com', 'vpn.st', 'vsimcard.com', 'vubby.com',
  'wasteland.raptors.dk',
  'webemail.me', 'webm4il.info',
  'wegwerfadresse.de', 'wegwerfemail.de', 'wegwerfemail.net', 'wegwerfemail.org',
  'wegwerfemailadresse.de', 'wegwerfmail.de', 'wegwerfmail.info',
  'wegwerfmail.net', 'wegwerfmail.org',
  'wh4f.org', 'whyspam.me', 'willhackforfood.biz', 'willselfdestruct.com',
  'wolfsmail.tk', 'wuzup.net', 'wuzupmail.net',
  'xagloo.com', 'xemaps.com', 'xents.com', 'xmaily.com', 'xoxy.net', 'xyzfree.net',
  'yapped.net', 'yepmail.net', 'yogamaven.com', 'youmail.ga', 'yourspam.eu', 'yuoia.com',
  'z1p.biz', 'za.com', 'zehnminutenmail.de', 'zippymail.info',
  'zl0.com', 'zoemail.net', 'zoemail.org', 'zomg.info',
]);

/**
 * Returns true if the email address uses a known disposable / throwaway domain.
 * @param {string} email
 * @returns {boolean}
 */
function isDisposableEmail(email) {
  if (!email || !email.includes('@')) return false;
  const domain = email.trim().toLowerCase().split('@')[1];
  if (!domain) return false;

  // Direct match
  if (BLOCKED_DOMAINS.has(domain)) return true;

  // Subdomain match (e.g. anything.mailinator.com)
  for (const blocked of BLOCKED_DOMAINS) {
    if (domain.endsWith('.' + blocked)) return true;
  }

  return false;
}

/**
 * Express middleware — rejects disposable emails with a clear 400 response.
 * Mount before any route that sends transactional email to a user-supplied address.
 *
 * DEV BYPASS: Disabled when NODE_ENV=development so temp-mail services (ozsaip.com,
 * ruutukf.com, etc.) can be used freely during local testing. Re-enable in production
 * by setting NODE_ENV=production (or any value other than 'development').
 */
function rejectDisposableEmail(req, res, next) {
  // ── Temporarily disabled in development for faster testing ──────────────────
  // To re-enable: remove or change this condition, or set NODE_ENV=production.
  if (process.env.NODE_ENV === 'development') {
    return next();
  }
  // ────────────────────────────────────────────────────────────────────────────

  const email = (req.body?.email || '').trim();
  if (email && isDisposableEmail(email)) {
    return res.status(400).json({
      error: 'Temporary or disposable email addresses are not allowed. Please use your real email address.',
    });
  }
  return next();
}

module.exports = { isDisposableEmail, rejectDisposableEmail };
