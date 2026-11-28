import { test,expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdtempSync,rmSync,readFileSync,statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walletLogin,registerRp,origin } from './management-fixture';
import { provider } from './wallet-fixture';
import { launchDevice,decodeTerminal } from './device-fixture';
test.use({trace:'off'});
const start=async(page:import('@playwright/test').Page)=>{const r=await page.request.post('/api/auth/device/code',{form:{client_id:'walletgate-cli',scope:'clients:manage clients:register offline_access',resource:'urn:walletgate:management',walletgate_label:'Remote <script>CLI</script>'}});expect(r.status()).toBe(200);return r.json();};
for(const theme of ['light','dark'] as const)test(`device ${theme} consent has keyboard, contrast, narrow and zoom coverage`,async({page})=>{
 await walletLogin(page);await registerRp(page,'Long untrusted application <script>alert(1)</script>');const f=await start(page);
 await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});await page.setViewportSize({width:375,height:812});await page.goto(f.verification_uri_complete);
 await page.getByRole('button',{name:'Review code'}).click();await expect(page.getByRole('checkbox',{name:'The code matches my CLI'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Authorize a remote CLI'})).toBeFocused();
 for(const checkbox of await page.getByRole('checkbox').all())await expect(checkbox).not.toBeChecked();
 await expect(page.getByRole('button',{name:'Allow selected access'})).toBeDisabled();
 expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByLabel('The code matches my CLI').focus();await page.keyboard.press('Space');await page.getByLabel('Allow continued access within these limits').check();await expect(page.getByRole('button',{name:'Allow selected access'})).toBeEnabled();
 await page.setViewportSize({width:750,height:1000});await page.evaluate(()=>{document.documentElement.style.zoom='2';});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>{document.documentElement.style.zoom='1';});await page.setViewportSize({width:375,height:812});
 await page.screenshot({path:`work/US-004-01/artifacts/device-consent-${theme}.png`,fullPage:true});
 await page.getByRole('button',{name:'Deny',exact:true}).click();await expect(page.getByRole('status')).toContainText('declined');await expect(page.getByRole('button',{name:'Allow selected access'})).toHaveCount(0);
});
test('actual headless CLI QR opens a separate browser, fresh SIWE consents and saves protected OAuth credentials',async({browser})=>{
 const directory=mkdtempSync(join(tmpdir(),'walletgate-device-browser-'));const cli=launchDevice(['login','--device','--origin',origin,'--state-dir',directory,'--label','My remote CLI']);const context=await browser.newContext({viewport:{width:390,height:844}});
 try{
  const event=JSON.parse(await cli.line());expect(event).not.toHaveProperty('device_code');const page=await context.newPage();await provider(page,{eip6963:true});await page.goto(event.verification_uri_complete);
  await expect(page.getByText('Sign in with your wallet before reviewing the code.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Sign in with MetaMask',exact:true}).click();await page.getByRole('button',{name:'Sign message & continue'}).click();await expect(page.getByRole('button',{name:'Review code'})).toBeVisible();
  await page.getByRole('button',{name:'Review code'}).click();await expect(page.locator('.device-confirmation-code')).toHaveText(event.user_code);
  await page.getByLabel('The code matches my CLI').check();await page.getByLabel('Allow continued access within these limits').check();await page.getByLabel('Create new applications using single-use IATs').check();await page.getByRole('button',{name:'Allow selected access'}).click();
  await expect(page.getByRole('status')).toContainText('Return to the CLI');const result=await cli.done;expect(result.status,result.stderr).toBe(0);
  const credential=JSON.parse(readFileSync(join(directory,'default.json'),'utf8'));expect(statSync(join(directory,'default.json')).mode&0o777).toBe(0o600);expect(statSync(directory).mode&0o777).toBe(0o700);
  for(const secret of [credential.access_token,credential.refresh_token]){expect(result.stdout).not.toContain(secret);expect(result.stderr).not.toContain(secret);}
  expect(decodeTerminal(result.stderr)).toBe(event.verification_uri_complete);
  const list=await launchDevice(['list','--state-dir',directory]).done;expect(list.status,list.stderr).toBe(0);expect(JSON.parse(list.stdout.trim()).applications).toEqual([]);
  await page.request.post('/api/logout',{headers:{origin},data:{}});expect((await launchDevice(['list','--state-dir',directory]).done).status).toBe(0);
  const logout=await launchDevice(['logout','--state-dir',directory]).done;expect(logout.status,logout.stderr).toBe(0);expect(()=>readFileSync(join(directory,'default.json'))).toThrow();
 }finally{cli.child.kill('SIGTERM');await context.close();rmSync(directory,{recursive:true,force:true});}
});
test('manual code fallback and invalid-code feedback are accessible',async({page})=>{
 await walletLogin(page);const f=await start(page);await page.goto(f.verification_uri);await expect(page.getByLabel('User code')).toHaveValue('');
 await page.getByLabel('User code').fill('invalid');await page.getByRole('button',{name:'Review code'}).click();await expect(page.getByRole('alert')).toContainText('Invalid');
 await page.getByLabel('User code').fill(f.user_code);await page.getByRole('button',{name:'Review code'}).click();await expect(page.locator('.device-confirmation-code')).toHaveText(f.user_code);
 await page.screenshot({path:'work/US-004-01/artifacts/device-manual.png',fullPage:true});
});
test('CLI cancellation exits promptly without storing credentials',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'walletgate-device-cancel-'));const cli=launchDevice(['login','--device','--origin',origin,'--state-dir',directory]);
 try{await cli.line();cli.child.kill('SIGINT');const result=await cli.done;expect(result.status).toBe(3);expect(result.stderr).toContain('cancelled');expect(()=>readFileSync(join(directory,'default.json'))).toThrow();}finally{cli.child.kill('SIGTERM');rmSync(directory,{recursive:true,force:true});}
});

test('expired device review announces restart and removes approval controls',async({page})=>{
 await walletLogin(page);const f=await start(page);
 await page.route('**/api/management/device',async route=>{const response=await route.fetch();const value=await response.json();await route.fulfill({response,json:value.expiresAt?{...value,expiresAt:Date.now()+200}:value});});
 await page.goto(f.verification_uri_complete);await page.getByRole('button',{name:'Review code'}).click();await expect(page.getByRole('alert')).toContainText('expired');await expect(page.getByRole('button',{name:'Allow selected access'})).toHaveCount(0);
});

test('switching wallets releases review and requires a fresh signature and consent',async({page})=>{
 await walletLogin(page);const f=await start(page);await provider(page,{eip6963:true});await page.goto(f.verification_uri_complete);await page.getByRole('button',{name:'Review code'}).click();await expect(page.getByLabel('The code matches my CLI')).toBeVisible();
 await page.getByRole('button',{name:'Switch wallet',exact:true}).click();await expect(page.getByRole('button',{name:'Sign in with MetaMask',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Sign in with MetaMask',exact:true}).click();await page.getByRole('button',{name:'Sign message & continue'}).click();await page.getByRole('button',{name:'Review code'}).click();
 await expect(page.getByLabel('The code matches my CLI')).not.toBeChecked();await expect(page.getByLabel('Allow continued access within these limits')).not.toBeChecked();await expect(page.getByRole('button',{name:'Allow selected access'})).toBeDisabled();
});
