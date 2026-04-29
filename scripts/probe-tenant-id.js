const { chromium } = require('@playwright/test')

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  const requests = []
  page.on('request', req => {
    if (req.url().includes('/api/walliam/')) {
      requests.push({ method: req.method(), url: req.url(), headers: req.headers() })
    }
  })

  await page.goto('http://localhost:3000/', { waitUntil: 'load', timeout: 20000 })
  await page.waitForTimeout(3000)

  // Read the body's tenant-id attribute as the browser sees it
  const tenantIdAttr = await page.evaluate(() => document.body.dataset.tenantId ?? null)

  // Also read what the body HTML looks like
  const bodyTag = await page.evaluate(() => {
    return document.body.outerHTML.substring(0, 200)
  })

  console.log('=== Runtime probe of localhost:3000/ ===')
  console.log('document.body.dataset.tenantId =', JSON.stringify(tenantIdAttr))
  console.log('body opening tag preview:')
  console.log(bodyTag)
  console.log()
  console.log(`=== /api/walliam/* requests captured (${requests.length}) ===`)
  requests.forEach((r, i) => {
    console.log(`${i + 1}. ${r.method} ${r.url}`)
    console.log(`   x-tenant-id header: ${JSON.stringify(r.headers['x-tenant-id'])}`)
  })

  await browser.close()
})()