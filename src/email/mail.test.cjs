const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(env = {}, status = 200) {
  const sent = [];
  const transports = [];
  const requests = [];
  const context = { exports: {}, process: { env }, AbortSignal, fetch: async (url, options) => {
    requests.push({ url, ...options });
    return { ok: status === 200, status };
  }, require: (name) => {
    if (name === './transport') {
      const transportContext = { ...context, exports: {} };
      vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/email/transport.ts', 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      }).outputText, transportContext);
      return transportContext.exports;
    }
    if (name === 'nodemailer') return { default: { createTransport(options) {
      transports.push(options);
      return { sendMail: async (message) => { sent.push(message); return { accepted: [message.to] }; } };
    } } };
    if (name === './login-email') return {
      buildLoginEmail: () => ({ subject: 'Login', text: 'Login', html: '<p>Login</p>' }),
      buildJudgeInvitationEmail: () => ({ subject: 'Invite', text: 'Invite', html: '<p>Invite</p>' }),
    };
    throw new Error(name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/email/mail.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return { mail: context.exports, sent, transports, requests };
}

test('email module loads without SMTP; sending fails clearly without opening a transport', async () => {
  const { mail, transports } = load();
  for (const send of [() => mail.sendTestEmail('test@example.com'),
    () => mail.sendLoginEmail('test@example.com', 'https://example.com'),
    () => mail.sendJudgeInvitationEmail('test@example.com', 'https://example.com', 'Show')]) {
    await assert.rejects(send, /SMTP environment variables are not fully configured/);
  }
  assert.equal(transports.length, 0);
});

test('Resend sends all email types over HTTPS without creating an SMTP transport', async () => {
  const { mail, requests, transports } = load({ RESEND_API_KEY: 'test-only', RESEND_FROM: 'sender@example.com' });
  await mail.sendTestEmail('test@example.com');
  await mail.sendLoginEmail('test@example.com', 'https://example.com');
  await mail.sendJudgeInvitationEmail('test@example.com', 'https://example.com', 'Show');
  assert.equal(requests.length, 3);
  assert.equal(transports.length, 0);
  for (const request of requests) {
    assert.equal(request.url, 'https://api.resend.com/emails');
    assert.equal(request.headers.Authorization, 'Bearer test-only');
    const body = JSON.parse(request.body);
    assert.equal(body.from, 'sender@example.com');
    assert.deepEqual(body.to, ['test@example.com']);
    assert.ok(body.subject && body.html && body.text);
  }
});

test('Resend errors fail without falling back to SMTP or exposing credentials', async () => {
  const { mail, transports } = load({ RESEND_API_KEY: 'secret-test', RESEND_FROM: 'sender@example.com' }, 403);
  await assert.rejects(() => mail.sendTestEmail('test@example.com'), /Resend email request failed \(HTTP 403\)/);
  assert.equal(transports.length, 0);
});

test('Resend requires an explicit sender before making a request', async () => {
  const { mail, requests } = load({ RESEND_API_KEY: 'test-only' });
  await assert.rejects(() => mail.sendTestEmail('test@example.com'), /RESEND_FROM is not configured/);
  assert.equal(requests.length, 0);
});

test('all email functions use the configured sender and SMTP transport', async () => {
  const { mail, sent, transports } = load({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465',
    SMTP_USER: 'test', SMTP_PASSWORD: 'test-only', SMTP_FROM: 'sender@example.com' });
  assert.equal(transports.length, 0);
  await mail.sendTestEmail('test@example.com');
  await mail.sendLoginEmail('test@example.com', 'https://example.com');
  await mail.sendJudgeInvitationEmail('test@example.com', 'https://example.com', 'Show');
  assert.equal(sent.length, 3);
  assert.ok(sent.every(message => message.from === 'sender@example.com'));
  assert.ok(transports.every(options => options.secure === true && options.port === 465));
});
