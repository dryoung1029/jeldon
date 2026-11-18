/**
 * @jeldon/google — Google service-account auth + Gmail MIME building for edge
 * runtimes. No domain values: the mailbox, sender name and scopes are all
 * caller-supplied. Network goes through an injected `fetch`.
 */
export {
  parseServiceAccount,
  getAccessToken,
  signJwtAssertion,
  pemToDer,
  createTokenCache,
  GoogleAuthError,
  GOOGLE_TOKEN_URI,
  type ServiceAccount,
  type GetAccessTokenOptions,
  type TokenCache,
  type GoogleAuthErrorCode,
} from './auth.js';
export {
  buildRawEmail,
  buildMimeMessage,
  flattenHeader,
  encodeHeaderWord,
  formatAddress,
  sendRawEmail,
  GMAIL_SEND_SCOPE,
  GMAIL_READONLY_SCOPE,
  type RawEmailInput,
  type MailAddress,
  type MailAttachment,
  type SendRawEmailOptions,
} from './mime.js';
export { base64url, base64urlDecodeUtf8 } from './encoding.js';
