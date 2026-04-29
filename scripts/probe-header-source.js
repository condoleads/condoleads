const { chromium } = require('@playwright/test')

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto('http://localhost:3000/', { waitUntil: 'load', timeout: 20000 })
  await page.waitForTimeout(3000)

  // Find every element containing "Remax" or "Crossroads"
  const matches = await page.evaluate(() => {
    const results = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null)
    let node
    while ((node = walker.nextNode())) {
      const text = node.textContent || ''
      if (text.match(/Remax|Crossroads/i)) {
        const el = node.parentElement
        if (!el) continue
        // Walk up to find a useful parent with a class or component-like tag
        let path = []
        let cur = el
        for (let i = 0; i < 6 && cur; i++) {
          const id = cur.id ? `#${cur.id}` : ''
          const cls = cur.className && typeof cur.className === 'string'
            ? `.${cur.className.split(' ').filter(Boolean).slice(0, 2).join('.')}`
            : ''
          path.unshift(`${cur.tagName.toLowerCase()}${id}${cls}`)
          cur = cur.parentElement
        }
        results.push({
          text: text.trim(),
          path: path.join(' > '),
          outerHTML: el.outerHTML.substring(0, 300),
        })
      }
    }
    return results
  })

  // Also check what data-tenant-id the body has
  const bodyTenant = await page.evaluate(() => document.body.dataset.tenantId)
  const bodyClass = await page.evaluate(() => document.body.className)

  console.log(`document.body[data-tenant-id] = ${JSON.stringify(bodyTenant)}`)
  console.log(`document.body className = ${bodyClass}`)
  console.log(`\nMatches for "Remax|Crossroads" (${matches.length}):`)
  matches.forEach((m, i) => {
    console.log(`\n--- Match ${i + 1} ---`)
    console.log(`Text: "${m.text}"`)
    console.log(`DOM path: ${m.path}`)
    console.log(`HTML preview: ${m.outerHTML}`)
  })

  await browser.close()
})()