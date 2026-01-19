// lib/utils/link-parser.tsx
import React from 'react'

export function renderMessageContent(content: string): React.ReactNode {
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s]+)|(mailto:[^\s]+)|(tel:[^\s]+)/g
  
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match
  let keyIndex = 0

  while ((match = linkPattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }

    if (match[1] && match[2]) {
      const url = match[2]
      const isExternal = !url.startsWith('mailto:') && !url.startsWith('tel:')
      parts.push(
        React.createElement('a', {
          key: keyIndex++,
          href: url,
          target: isExternal ? '_blank' : undefined,
          rel: isExternal ? 'noopener noreferrer' : undefined,
          className: 'text-blue-600 hover:text-blue-800 underline font-medium'
        }, match[1])
      )
    } else {
      const url = match[3] || match[4] || match[5]
      const isExternal = !url.startsWith('mailto:') && !url.startsWith('tel:')
      const displayText = url.replace('mailto:', '').replace('tel:', '')
      parts.push(
        React.createElement('a', {
          key: keyIndex++,
          href: url,
          target: isExternal ? '_blank' : undefined,
          rel: isExternal ? 'noopener noreferrer' : undefined,
          className: 'text-blue-600 hover:text-blue-800 underline font-medium'
        }, displayText)
      )
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return parts.length > 0 ? parts : content
}
