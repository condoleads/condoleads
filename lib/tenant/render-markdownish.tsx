// lib/tenant/render-markdownish.tsx
// Shared Markdown-ish parser for tenant content pages (about, privacy, terms).
// Supports: ## h1/h2, ### h3, #### h4, **bold**, [text](url), - bullets, paragraphs.

import React from 'react'

const BOLD_RE = /\*\*([^*]+)\*\*/
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/

function renderInline(text: string, prefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    const boldMatch = remaining.match(BOLD_RE)
    const linkMatch = remaining.match(LINK_RE)
    const boldIdx = boldMatch ? (boldMatch.index ?? -1) : -1
    const linkIdx = linkMatch ? (linkMatch.index ?? -1) : -1

    if (boldIdx === -1 && linkIdx === -1) {
      if (remaining) {
        nodes.push(<React.Fragment key={`${prefix}-${key++}`}>{remaining}</React.Fragment>)
      }
      break
    }

    const useBold = boldIdx !== -1 && (linkIdx === -1 || boldIdx < linkIdx)

    if (useBold && boldMatch) {
      const idx = boldMatch.index ?? 0
      if (idx > 0) {
        nodes.push(<React.Fragment key={`${prefix}-${key++}`}>{remaining.slice(0, idx)}</React.Fragment>)
      }
      nodes.push(<strong key={`${prefix}-${key++}`} style={{ color: '#fff', fontWeight: 700 }}>{boldMatch[1]}</strong>)
      remaining = remaining.slice(idx + boldMatch[0].length)
    } else if (linkMatch) {
      const idx = linkMatch.index ?? 0
      if (idx > 0) {
        nodes.push(<React.Fragment key={`${prefix}-${key++}`}>{remaining.slice(0, idx)}</React.Fragment>)
      }
      const href = linkMatch[2]
      const isInternal = href.startsWith('/') || href.startsWith('#')
      nodes.push(
        <a
          key={`${prefix}-${key++}`}
          href={href}
          style={{ color: '#60a5fa', textDecoration: 'underline' }}
          target={isInternal ? undefined : '_blank'}
          rel={isInternal ? undefined : 'noopener noreferrer'}
        >
          {linkMatch[1]}
        </a>
      )
      remaining = remaining.slice(idx + linkMatch[0].length)
    }
  }

  return nodes
}

export function renderMarkdownish(source: string): React.ReactNode {
  const lines = source.split(/\r?\n/)
  const blocks: React.ReactNode[] = []
  let i = 0
  let blockKey = 0

  while (i < lines.length) {
    const trimmed = lines[i].trim()

    if (!trimmed) {
      i++
      continue
    }

    if (trimmed.startsWith('#### ')) {
      blocks.push(
        <h3
          key={blockKey++}
          style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginTop: 24, marginBottom: 8 }}
        >
          {renderInline(trimmed.slice(5), `h4-${blockKey}`)}
        </h3>
      )
      i++
      continue
    }

    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h3
          key={blockKey++}
          style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginTop: 32, marginBottom: 10 }}
        >
          {renderInline(trimmed.slice(4), `h3-${blockKey}`)}
        </h3>
      )
      i++
      continue
    }

    if (trimmed.startsWith('## ')) {
      const isFirst = blocks.length === 0
      if (isFirst) {
        blocks.push(
          <h1
            key={blockKey++}
            style={{
              fontSize: 40,
              fontWeight: 900,
              color: '#fff',
              marginBottom: 32,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}
          >
            {renderInline(trimmed.slice(3), `h1-${blockKey}`)}
          </h1>
        )
      } else {
        blocks.push(
          <h2
            key={blockKey++}
            style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginTop: 48, marginBottom: 14 }}
          >
            {renderInline(trimmed.slice(3), `h2-${blockKey}`)}
          </h2>
        )
      }
      i++
      continue
    }

    if (trimmed.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        items.push(lines[i].trim().slice(2))
        i++
      }
      blocks.push(
        <ul
          key={blockKey++}
          style={{
            listStyle: 'disc',
            paddingLeft: 24,
            color: 'rgba(255,255,255,0.75)',
            fontSize: 15,
            lineHeight: 1.75,
            marginTop: 8,
            marginBottom: 16,
          }}
        >
          {items.map((item, idx) => (
            <li key={idx} style={{ marginBottom: 6 }}>
              {renderInline(item, `li-${blockKey}-${idx}`)}
            </li>
          ))}
        </ul>
      )
      continue
    }

    const paraLines: string[] = [trimmed]
    i++
    while (i < lines.length) {
      const next = lines[i].trim()
      if (!next) break
      if (next.startsWith('#') || next.startsWith('- ')) break
      paraLines.push(next)
      i++
    }
    blocks.push(
      <p
        key={blockKey++}
        style={{
          color: 'rgba(255,255,255,0.75)',
          fontSize: 15,
          lineHeight: 1.75,
          marginTop: 0,
          marginBottom: 16,
        }}
      >
        {renderInline(paraLines.join(' '), `p-${blockKey}`)}
      </p>
    )
  }

  return <>{blocks}</>
}
