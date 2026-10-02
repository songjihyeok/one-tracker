import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const oceanTile = readFileSync(new URL('../fixtures/ocean-tile.png', import.meta.url));

test.beforeEach(async ({ page }) => {
  await page.route('https://services.arcgisonline.com/**/tile/**', route => route.fulfill({
    contentType: 'image/png', body: oceanTile,
  }));
});

async function view(page: Page, property: string) {
  return Number(await page.getByTestId('voyage-scene').getAttribute(`data-camera-${property}`));
}

function longitudeDelta(a: number, b: number) {
  return ((a - b + 540) % 360) - 180;
}

async function openOverview(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  await expect(page.getByTestId('voyage-scene')).toHaveAttribute('data-scene-status', 'ready', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Route overview', exact: true }).click();
  await expect.poll(() => view(page, 'zoom')).toBeLessThan(4);
  // The overview camera eases for 1200 ms. Finish it before comparing pan movement.
  await page.waitForTimeout(1300);
  const bounds = await page.getByTestId('voyage-scene').locator('canvas').boundingBox();
  if (!bounds) throw new Error('The map canvas has no bounds');
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

async function dragWorld(page: Page, center: { x: number; y: number }, direction: number) {
  await page.mouse.move(center.x - direction * 310, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + direction * 310, center.y, { steps: 6 });
  // Release without a fling so the next drag can start on a settled camera.
  await page.waitForTimeout(170);
  await page.mouse.up();
}

test('overview pans across both world edges and follows the ship in the visible world copy', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const center = await openOverview(page);
  const initialZoom = await view(page, 'zoom');
  let previousLongitude = await view(page, 'longitude');
  let westward = 0;
  for (let index = 0; index < 9 && westward > -380; index++) {
    await dragWorld(page, center, 1);
    const currentLongitude = await view(page, 'longitude');
    const delta = longitudeDelta(currentLongitude, previousLongitude);
    expect(delta).toBeLessThan(-20);
    westward += delta;
    previousLongitude = currentLongitude;
  }
  expect(westward).toBeLessThan(-360);
  let eastward = 0;
  for (let index = 0; index < 9 && eastward < 380; index++) {
    await dragWorld(page, center, -1);
    const currentLongitude = await view(page, 'longitude');
    const delta = longitudeDelta(currentLongitude, previousLongitude);
    expect(delta).toBeGreaterThan(20);
    eastward += delta;
    previousLongitude = currentLongitude;
  }
  expect(eastward).toBeGreaterThan(360);
  expect(await view(page, 'zoom')).toBeCloseTo(initialZoom, 2);
  await expect(page.getByRole('button', { name: 'Route overview', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: testInfo.outputPath('overview-world-wrap.png'), fullPage: true });

  const currentWorldLongitude = await view(page, 'longitude');
  const shipLongitude = Number(await page.getByTestId('simulation-position').getAttribute('data-lng'));
  const nearestCopy = shipLongitude + 360 * Math.round((currentWorldLongitude - shipLongitude) / 360);
  await page.getByRole('button', { name: 'Follow vessel', exact: true }).click();
  await expect.poll(async () => Math.abs(longitudeDelta(await view(page, 'longitude'), nearestCopy))).toBeLessThan(0.05);
  await expect.poll(() => view(page, 'zoom')).toBeGreaterThan(16);
  await expect(page.getByTestId('voyage-scene')).toHaveAttribute('data-rendered-ships', '4');
  await page.screenshot({ path: testInfo.outputPath('follow-world-wrap.png'), fullPage: true });
});

test('horizontal trackpad scrolling pans the overview without zooming', async ({ page }) => {
  const center = await openOverview(page);
  const initialLongitude = await view(page, 'longitude');
  const initialZoom = await view(page, 'zoom');
  await page.mouse.move(center.x, center.y);
  await page.mouse.wheel(300, 0);
  await expect.poll(async () => Math.abs(await view(page, 'longitude') - initialLongitude)).toBeGreaterThan(10);
  expect(await view(page, 'zoom')).toBeCloseTo(initialZoom, 3);
  const movedLongitude = await view(page, 'longitude');
  await page.mouse.wheel(-300, 0);
  await expect.poll(async () => Math.abs(await view(page, 'longitude') - movedLongitude)).toBeGreaterThan(10);
  await expect(page.getByRole('button', { name: 'Route overview', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
