import { test,expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

test.skip(process.env.FOODIEGO_LIVE_E2E!=='1'&&process.env.FOODIEGO_E2E_ISOLATED!=='1','Opt-in live Atlas integration test');
test('signed-in cart, coupon, address, COD order, history, cancellation and reorder',async({page})=>{
  const email=`phase4-e2e-${crypto.randomUUID()}@example.invalid`;
  try {
    await page.goto('/signup');
    await page.getByLabel('Full name').fill('Phase Four Tester');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password',{exact:true}).fill('GoodPassword123');
    await page.getByRole('button',{name:'Create account'}).click();
    await expect(page).toHaveURL(/\/profile/);
    await page.goto('/restaurant/1');
    await page.getByRole('button',{name:'ADD +',exact:true}).first().click();
    await page.getByLabel('Extra portion').check();
    await page.getByRole('button',{name:/Add to cart/}).click();
    await expect(page.getByText(/added to your cart/)).toBeVisible();
    await page.goto('/cart');
    await expect(page.locator('.cart-item')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('.cart-item')).toHaveCount(1);
    await page.getByLabel('Coupon code').fill('FOODIE50');
    await page.getByRole('button',{name:'Apply'}).click();
    await expect(page.getByText(/Coupon applied/)).toBeVisible();
    await page.getByRole('link',{name:/Continue to checkout/}).click();
    await page.getByRole('button',{name:'Add delivery address to order'}).first().click();
    await page.getByLabel('Full name').fill('Phase Four Tester');
    await page.getByLabel('Phone').fill('+91 99999 99999');
    await page.getByLabel('Address line 1').fill('12 Park Street');
    await page.getByLabel('City').fill('Kolkata');
    await page.getByLabel('State').fill('West Bengal');
    await page.getByLabel('Postal code').fill('700016');
    await page.getByRole('button',{name:'Save address'}).click();
    await expect(page.getByText('Coupon savings')).toBeVisible();
    await expect(page.getByRole('button',{name:'Place COD order',exact:true}).first()).toBeEnabled();
    await page.getByRole('button',{name:'Place COD order',exact:true}).first().click();
    await expect(page).toHaveURL(/\/orders\/[a-f\d]{24}\/confirmation/);
    await expect(page.getByText('Order placed successfully.')).toBeVisible();
    await page.goto('/orders');
    await expect(page.locator('.order-card')).toHaveCount(1);
    await page.getByRole('link',{name:'View details'}).click();
    await expect(page.getByText('Order status: PLACED')).toBeVisible();
    await page.getByLabel('Cancellation reason').fill('Test order complete');
    await page.getByRole('button',{name:'Cancel order'}).click();
    await expect(page.getByText('Order status: CANCELLED')).toBeVisible();
    await page.goto('/orders');
    await page.getByRole('button',{name:'Reorder'}).click();
    await expect(page.getByText(/Review the cart before checkout/)).toBeVisible();
    await page.goto('/cart');
    await expect(page.locator('.cart-item')).toHaveCount(1);
  } finally {
    if(process.env.FOODIEGO_E2E_ISOLATED!=='1'){
    const backend=path.resolve(process.cwd(),'../backend');
    const runner=path.join(backend,'node_modules','tsx','dist','cli.mjs');
    try { execFileSync(process.execPath,[runner,'scripts/cleanup-commerce-test.ts',email],{cwd:backend,stdio:'pipe',timeout:120000}); }
    catch { console.warn(`Test account cleanup requires MongoDB network access: ${email}`); }
    }
  }
});
