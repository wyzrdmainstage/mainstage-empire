const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(env = {}) {
  const sent = [];
  const transports = [];
  const context = { exports: {}, process: { env }, require: (name) => {
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
  return { mail: context.exports, sent, transports };
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
