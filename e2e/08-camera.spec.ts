import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { PNG } from 'pngjs'
import { qrPng } from '@/lib/qr'
import { expect, test } from './support/fixtures'
import { count, person, resetTo, PW } from './support/db'

// Writes a Y4M video (what Chromium's fake webcam plays) showing the given PNG centred on white, shrunk by
// `shrink` so the whole code sits inside qr-scanner's scan area (the middle 2/3 of the frame), as it would
// when someone holds their phone up at a normal distance.
async function qrVideo(png: Buffer, file: string, shrink = 2): Promise<void> {
  const W = 640, H = 480, img = PNG.sync.read(png)
  const w = Math.floor(img.width / shrink), h = Math.floor(img.height / shrink)
  const y = Buffer.alloc(W * H, 235)
  const ox = Math.floor((W - w) / 2), oy = Math.floor((H - h) / 2)
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const i = (r * shrink * img.width + c * shrink) * 4
    y[(oy + r) * W + ox + c] = img.data[i]! < 128 ? 16 : 235
  }
  const chroma = Buffer.alloc((W / 2) * (H / 2), 128)
  const frame = Buffer.concat([Buffer.from('FRAME\n'), y, chroma, chroma])
  writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), ...Array(10).fill(frame)]))
}

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => { await resetTo('confirmed') })

test('the real camera scanner reads a QR from the webcam and checks the person in', async () => {
  const p = await person("assigned_venue = 'DTH' AND team_id IS NOT NULL")
  // the image the participant received: the same PNG the app emails, with the real check-in URL
  const video = path.join(tmpdir(), `ctf-qr-${process.pid}.y4m`)
  process.env.PUBLIC_BASE_URL = 'http://localhost:3200'
  await qrVideo(await qrPng(p.qr_token), video)
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`] })
  const ctx = await browser.newContext({ baseURL: 'http://localhost:3200', permissions: ['camera'] })
  const page = await ctx.newPage()
  await page.goto('/admin/login')
  await page.getByLabel('Username').fill('dth'); await page.getByLabel('Password').fill(PW)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('/admin/dth')
  await page.getByRole('button', { name: 'SCAN QR' }).click()

  // nobody types anything: qr-scanner decodes the video frame and the desk submits it
  const ok = page.getByRole('alertdialog', { name: 'CHECK-IN SUCCESSFUL' })
  await expect(ok).toBeVisible({ timeout: 20_000 })
  await expect(ok).toContainText(p.name)
  expect(await count(`check_ins WHERE participant_id = ${p.id}`)).toBe(1)
  await expect(page.getByText(/camera needs HTTPS|Camera unavailable/)).toHaveCount(0)

  // the QR stays in front of the camera: after the result screen closes and the 4 s repeat guard
  // passes, the scanner reads it again and reports it as already checked in, with no duplicate row
  await expect(page.getByRole('alertdialog', { name: 'ALREADY CHECKED IN' })).toBeVisible({ timeout: 15_000 })
  expect(await count(`check_ins WHERE participant_id = ${p.id}`)).toBe(1)
  await browser.close()
})
