import { expect, test } from '@playwright/test'

test.use({ baseURL: `http://127.0.0.1:${Number(process.env.ATLAS_TEST_PORT || 8106) + 1}` })

for (const width of [1440, 390, 320]) {
  test(`family album is private, uncropped, and keyboard accessible at ${width}px`, async ({ page, context, browser }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 })
    const familyRequests: string[] = []
    page.on('request', (request) => { if (request.url().includes('/api/family')) familyRequests.push(request.url()) })
    await page.goto('/')
    await expect(page.getByLabel('Team invite code')).toBeVisible()
    expect(familyRequests).toEqual([])
    expect((await context.request.get('/api/family')).status()).toBe(401)
    expect((await context.request.get('/api/family/together/photo')).status()).toBe(401)
    await page.getByLabel('Team invite code').fill('browser-test-invite')
    await page.getByRole('button', { name: 'Come on in' }).click()
    const album = page.getByRole('region', { name: 'Meet the little legend.' })
    await expect(album).toBeVisible()
    await expect(album.locator('figure')).toHaveCount(4)
    for (const figure of await album.locator('figure').all()) await expect(figure).toHaveCSS('opacity', '1')
    await album.scrollIntoViewIfNeeded()
    for (const image of await album.locator('img').all()) {
      await image.scrollIntoViewIfNeeded()
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
      const dimensions = await image.evaluate((element: HTMLImageElement) => ({
        actual: element.clientWidth / element.clientHeight, natural: element.naturalWidth / element.naturalHeight,
      }))
      expect(Math.abs(dimensions.actual - dimensions.natural)).toBeLessThan(0.03)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const placement = await page.evaluate(() => ({
      heroEnd: document.querySelector('.welcome')!.getBoundingClientRect().bottom,
      album: document.querySelector('.family-album')!.getBoundingClientRect().toJSON(),
      boardStart: document.querySelector('#love-board')!.getBoundingClientRect().top,
    }))
    expect(placement.album.top).toBeGreaterThan(placement.heroEnd)
    expect(placement.album.bottom).toBeLessThanOrEqual(placement.boardStart)
    await album.screenshot({ path: testInfo.outputPath(`family-album-${width}.png`) })
    const opener = album.getByRole('button', { name: /^View photo:/ }).first()
    await opener.click()
    const viewer = page.getByRole('dialog', { name: 'Family album', exact: true })
    await expect(viewer).toBeVisible()
    await expect(viewer.locator('.family-viewer-footer span')).toHaveText('1 / 4')
    await page.keyboard.press('ArrowRight')
    await expect(viewer.locator('.family-viewer-footer span')).toHaveText('2 / 4')
    await expect(viewer.locator('img')).toHaveAttribute('src', '/api/family/player-two/photo')
    await viewer.getByRole('button', { name: 'Previous family photo' }).click()
    await page.keyboard.press('ArrowLeft')
    await expect(viewer.locator('.family-viewer-footer span')).toHaveText('4 / 4')
    await viewer.getByRole('button', { name: 'Next family photo' }).click()
    await expect(viewer.locator('.family-viewer-footer span')).toHaveText('1 / 4')
    await page.screenshot({ path: testInfo.outputPath(`family-viewer-${width}.png`) })
    await page.keyboard.press('Escape')
    await expect(viewer).toHaveCount(0)
    await expect(opener).toBeFocused()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const figure of await album.locator('figure').all()) await expect(figure).toHaveCSS('opacity', '1')
    const stranger = await browser.newContext()
    expect((await stranger.request.get(new URL('/api/family/together/photo', page.url()).href)).status()).toBe(401)
    await stranger.close()
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(album).toHaveCount(0)
    expect((await context.request.get('/api/family/together/photo')).status()).toBe(401)
  })
}

test('album errors can be retried without blocking the message board', async ({ page }) => {
  await page.route('**/api/family', (route) => route.abort())
  await page.goto('/')
  await page.getByLabel('Team invite code').fill('browser-test-invite')
  await page.getByRole('button', { name: 'Come on in' }).click()
  await expect(page.locator('#love-board')).toBeVisible()
  const album = page.locator('.family-album')
  await expect(album.getByRole('alert')).toContainText("couldn't load")
  await page.unroute('**/api/family')
  await album.getByRole('button', { name: 'Try again' }).click()
  await expect(album.locator('figure')).toHaveCount(4)
})