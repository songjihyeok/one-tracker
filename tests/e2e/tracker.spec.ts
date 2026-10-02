import { expect, test } from '@playwright/test';
import type { Vessel } from '../../shared/types';

test.beforeEach(async ({ page }) => {
  // Test our overlays and controls without repeatedly downloading public map tiles.
  // Actual geographic tile rendering is checked separately in the browser.
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e8edf0"/></svg>',
  }));
});

test('loads the fleet and switches vessel information, map and itinerary together', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?view=tracker');
  const select = page.getByRole('combobox', { name: 'Select vessel' });
  await expect(select.locator('option')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'ONE INNOVATION', exact: true })).toBeVisible();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.getByRole('table')).toHaveAccessibleName('Sample port itinerary for ONE INNOVATION');
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true });
  await select.selectOption({ label: 'ONE HAMBURG' });
  await expect(page.getByRole('heading', { name: 'ONE HAMBURG', exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toHaveAccessibleName('Sample port itinerary for ONE HAMBURG');
  await expect(page.getByText('9395159', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('map controls toggle the planned route and fit its endpoints', async ({ page }) => {
  await page.goto('/?view=tracker');
  await expect(page.getByRole('heading', { name: 'ONE INNOVATION', exact: true })).toBeVisible();
  const route = page.getByRole('button', { name: 'Route', exact: true });
  await expect(route).toHaveAttribute('aria-pressed', 'true');
  await route.click();
  await expect(route).toHaveAttribute('aria-pressed', 'false');
  await route.click();
  await expect(route).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Fit route', exact: true }).click();
  await expect(page.locator('.leaflet-container').getByText('Rotterdam', { exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Center on vessel', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
});

test('keeps the displayed position on a failed refresh and recovers on retry', async ({ page }) => {
  await page.goto('/?view=tracker');
  await expect(page.getByRole('heading', { name: 'ONE INNOVATION', exact: true })).toBeVisible();
  await page.route('**/api/vessels/9939137', (route) => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await page.getByRole('button', { name: 'Refresh vessel data' }).click();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ONE INNOVATION', exact: true })).toBeVisible();
  await page.unroute('**/api/vessels/9939137');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0);
});

test('warns about stale real AIS positions', async ({ page, request }) => {
  const vessel: Vessel = await (await request.get('/api/vessels/9939137')).json();
  vessel.source = 'live';
  vessel.streamStatus = 'connected';
  vessel.position!.updatedAt = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  await page.route('**/api/vessels/9939137', (route) => route.fulfill({ json: vessel }));
  await page.goto('/?view=tracker');
  await expect(page.getByText(/12 hours ago/).first()).toBeVisible();
  await expect(page.getByText(/stale|older than|outdated|last position received/i).first()).toBeVisible();
});

test('shows a waiting state without inventing a live position', async ({ page, request }) => {
  const vessel: Vessel = await (await request.get('/api/vessels/9939137')).json();
  delete vessel.position;
  vessel.source = 'waiting';
  vessel.streamStatus = 'connected';
  await page.route('**/api/vessels/9939137', (route) => route.fulfill({ json: vessel }));
  await page.goto('/?view=tracker');
  await expect(page.getByRole('heading', { name: 'ONE INNOVATION', exact: true })).toBeVisible();
  await expect(page.getByText(/waiting for.*AIS|awaiting.*AIS/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Center on vessel' })).toBeDisabled();
  await expect(page.getByRole('table')).toBeVisible();
  vessel.source = 'live';
  vessel.position = { latitude: -10, longitude: -130, speed: 12, heading: 180, course: 181, updatedAt: new Date().toISOString() };
  await page.getByRole('button', { name: 'Refresh vessel data' }).click();
  await expect(page.getByRole('button', { name: 'Center on vessel' })).toBeEnabled();
  await expect(page.locator('.leaflet-marker-icon[title="ONE INNOVATION"]')).toBeInViewport();
  await expect(page.getByText('AIS workspace', { exact: true })).toBeVisible();
});

test('can select another vessel after a selected vessel request fails', async ({ page }) => {
  await page.goto('/?view=tracker');
  const select = page.getByRole('combobox', { name: 'Select vessel' });
  await expect(page.getByRole('heading', { name: 'ONE INNOVATION', exact: true })).toBeVisible();
  await page.route('**/api/vessels/9395159', (route) => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await select.selectOption({ label: 'ONE HAMBURG' });
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await select.selectOption({ label: 'ONE HOUSTON' });
  await expect(page.getByRole('heading', { name: 'ONE HOUSTON', exact: true })).toBeVisible();
});

test('information dialog supports keyboard dismissal', async ({ page }) => {
  await page.goto('/?view=tracker');
  await page.getByRole('button', { name: 'About this tracker' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('mobile layout stays within the viewport and remains usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?view=tracker');
  await expect(page.getByRole('heading', { name: 'ONE INNOVATION', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('combobox', { name: 'Select vessel' }).selectOption({ label: 'ONE APUS' });
  await expect(page.getByRole('heading', { name: 'ONE APUS', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fit route', exact: true }).click();
  await expect.poll(() => page.locator('.leaflet-container').evaluate((map) => {
    const bounds = map.getBoundingClientRect();
    return [...map.querySelectorAll('.leaflet-marker-icon')].every((marker) => {
      const box = marker.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
    });
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
});
