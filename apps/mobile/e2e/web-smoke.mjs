// Drives the exported web build against a running API with the demo data from
// `pnpm --filter backend prisma:seed` plus activity on alice's newest video (see README).
// Usage: pnpm web:smoke [screenshotDir]   (CHROMIUM_PATH points at a Chromium binary)
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = process.env.WEB_URL ?? 'http://localhost:8081';
const OUT = process.argv[2] ?? join(tmpdir(), 'shortvid-web-smoke');
mkdirSync(OUT, { recursive: true });
const CLIP = join(OUT, 'clip.mp4');
writeFileSync(CLIP, Buffer.alloc(4096, 1));
const results = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.setDefaultTimeout(10000);
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
page.on('pageerror', (e) => errors.push(e.message));

async function step(name, fn) {
  try {
    await fn();
    results.push(`PASS ${name}`);
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`);
    console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: `${OUT}/fail-${name.replace(/\W+/g, '-')}.png` }).catch(() => {});
  }
}
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const visible = (loc) => loc.filter({ visible: true }).first();

await step('welcome screen', async () => {
  await page.goto(APP);
  await page.getByText('Short videos from creators').waitFor({ timeout: 30000 });
  await shot('01-welcome');
});

await step('validation on login', async () => {
  await page.getByText('Log in', { exact: true }).click();
  await page.getByText('Welcome back').waitFor();
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByText('Enter a valid email address').waitFor();
});

await step('wrong password shows the API error', async () => {
  await page.getByLabel('Email').fill('alice@example.com');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByText('Invalid email or password').waitFor();
  await shot('02-login-error');
});

await step('log in and see the feed', async () => {
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Log in' }).click();
  await visible(page.getByText(/^@(bob|carol|dave|erin)$/)).waitFor({ timeout: 20000 });
  await shot('03-feed');
});

let likeLabelBefore;
await step('like a video (optimistic)', async () => {
  const like = visible(page.getByLabel('Like', { exact: true }));
  await like.waitFor();
  likeLabelBefore = await like
    .locator('xpath=following-sibling::*|descendant::*[last()]')
    .last()
    .innerText()
    .catch(() => '');
  await like.click();
  await visible(page.getByLabel('Unlike', { exact: true })).waitFor({ timeout: 3000 });
  await shot('04-liked');
});

await step('like survives a reload', async () => {
  await page.reload();
  await visible(page.getByText(/^@(bob|carol|dave|erin)$/)).waitFor({ timeout: 20000 });
  await visible(page.getByLabel('Unlike', { exact: true })).waitFor({ timeout: 5000 });
});

await step('comment on a video', async () => {
  await visible(page.getByLabel('Comments', { exact: true })).click();
  await page.getByPlaceholder('Add a comment…').waitFor();
  await page.getByPlaceholder('Add a comment…').fill('Posted from the web smoke test 👋');
  await page.getByLabel('Send comment').click();
  await page.getByText('Posted from the web smoke test 👋').waitFor({ timeout: 5000 });
  await shot('05-comments');
  await page.goBack();
});

await step('open a creator profile from the feed', async () => {
  await visible(page.getByText(/^@(bob|carol|dave|erin)$/)).click();
  await page.getByText('Followers').waitFor({ timeout: 10000 });
  await shot('06-creator-profile');
  await page.goBack();
});

await step('inbox shows notifications and clears the badge', async () => {
  await page.getByRole('tab', { name: /Inbox/ }).click();
  await page.getByText('liked your video').waitFor({ timeout: 10000 });
  await page
    .getByText(/commented:/)
    .first()
    .waitFor();
  await shot('07-inbox');
  await page.waitForTimeout(1500);
  const tab = await page.getByRole('tab', { name: /Inbox/ }).innerText();
  if (/\d/.test(tab)) throw new Error(`badge still shows: ${tab}`);
});

await step('own profile and edit bio', async () => {
  await page.getByRole('tab', { name: /Profile/ }).click();
  await page.getByText('@alice').waitFor({ timeout: 10000 });
  await shot('08-profile');
  await page.getByText('Edit profile', { exact: true }).click();
  await page.getByLabel('Bio').fill('Dance clips, city walks and smoke tests');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Dance clips, city walks and smoke tests').waitFor({ timeout: 10000 });
  await shot('09-profile-edited');
});

await step('following tab', async () => {
  await page.getByRole('tab', { name: /Home/ }).click();
  await page.getByRole('tab', { name: 'Following' }).click();
  await visible(page.getByText('@bob')).waitFor({ timeout: 10000 });
  await shot('10-following');
});

await step('upload screen', async () => {
  await page.getByRole('tab', { name: /Upload/ }).click();
  await page.getByText('Choose a video').waitFor();
  await shot('11-upload');
});

await step('upload without Mux shows a friendly error', async () => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose a video').click();
  await (await chooser).setFiles(CLIP);
  await page.getByText('Video selected').waitFor();
  await page.getByLabel('Caption').fill('My first upload');
  await page.getByRole('button', { name: 'Post' }).click();
  await page.getByText('Uploads aren’t available on this server yet.').waitFor();
  await shot('12-upload-503');
});

await step('report a video from the … menu', async () => {
  await page.getByRole('tab', { name: /Home/ }).click();
  await page.getByRole('tab', { name: 'For You' }).click();
  await visible(page.getByLabel('More options', { exact: true })).click();
  await page.getByText('Report video', { exact: true }).click();
  await page.getByText('Why are you reporting this video?').waitFor();
  await shot('13-report-reasons');
  await page.getByText('Spam or scam', { exact: true }).click();
  await page.getByText('Thanks for letting us know').waitFor();
  await page.getByText('OK', { exact: true }).click();
});

await step('creator stats on your own profile', async () => {
  await page.getByRole('tab', { name: /Profile/ }).click();
  await page.getByLabel('Your stats').waitFor();
  await page.getByText('New this week').waitFor();
  await shot('14-creator-stats');
});

let blocked;
await step('block a creator from their profile', async () => {
  await page.getByRole('tab', { name: /Home/ }).click();
  const author = visible(page.getByText(/^@(bob|carol|dave|erin)$/));
  blocked = (await author.innerText()).slice(1);
  await author.click();
  await visible(page.getByText('Followers')).waitFor();
  await visible(page.getByLabel('More options', { exact: true })).click();
  await page.getByText(`Block @${blocked}`, { exact: true }).click();
  await page.getByText(`Block @${blocked}?`).waitFor();
  await page.getByText('Block', { exact: true }).click();
  await page.getByText(`@${blocked} is blocked`).waitFor();
  await page.getByText('OK', { exact: true }).click();
  await visible(page.getByText('You blocked this account.')).waitFor();
  await visible(page.getByRole('button', { name: 'Unblock' })).waitFor();
  await shot('15-blocked-profile');
  await page.goBack();
});

await step('blocked creator is gone from the feed', async () => {
  await page.reload();
  await visible(page.getByText(/^@(bob|carol|dave|erin)$/)).waitFor({ timeout: 20000 });
  const authors = await page.getByText(/^@(bob|carol|dave|erin)$/).allInnerTexts();
  if (authors.includes(`@${blocked}`)) throw new Error(`still seeing @${blocked}`);
});

const throwaway = `smoke${Date.now().toString(36)}`;
await step('log out from settings', async () => {
  await page.getByRole('tab', { name: /Profile/ }).click();
  await page.getByText('Settings', { exact: true }).click();
  await page.getByText('Privacy Policy').waitFor();
  await shot('16-settings');
  await page.getByText('Log out', { exact: true }).click();
  await page.getByText('Short videos from creators').waitFor();
});

await step('sign up shows the legal links', async () => {
  await page.getByText('Create account', { exact: true }).click();
  await page.getByText('Terms of Service').waitFor();
  await page.getByText('Privacy Policy').waitFor();
  await page.getByLabel('Email').fill(`${throwaway}@example.com`);
  await page.getByLabel('Username').fill(throwaway);
  await page.getByLabel('Password').fill('password123');
  await shot('17-signup');
  await page.getByRole('button', { name: 'Sign up' }).click();
  await page.getByRole('tab', { name: /Profile/ }).waitFor({ timeout: 20000 });
});

await step('delete the account and get signed out', async () => {
  await page.getByRole('tab', { name: /Profile/ }).click();
  await page.getByText(`@${throwaway}`).waitFor();
  await page.getByText('Settings', { exact: true }).click();
  await page.getByLabel('Current password').fill('wrong-password');
  await page.getByRole('button', { name: 'Delete account' }).click();
  await page.getByText('Delete my account', { exact: true }).click();
  await page.getByText('Incorrect password').waitFor();
  await page.getByLabel('Current password').fill('password123');
  await page.getByRole('button', { name: 'Delete account' }).click();
  await page.getByText('Delete my account', { exact: true }).click();
  await page.getByText('Short videos from creators').waitFor({ timeout: 10000 });
});

await step('a deleted account can’t log in', async () => {
  await page.getByText('Log in', { exact: true }).click();
  await page.getByLabel('Email').fill(`${throwaway}@example.com`);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByText('Invalid email or password').waitFor();
  await shot('18-deleted-login');
});

await browser.close();

if (errors.length) console.log('page errors:\n' + [...new Set(errors)].join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
