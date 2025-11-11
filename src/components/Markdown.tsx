import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github.min.css'

interface MarkdownProps {
  content: string
}

export function Markdown({ content }: MarkdownProps) {
  // 防止"未闭合的```代码块/数学块"导致解析失败：临时补全
  const safeContent = useMemo(() => {
    let s = content

    // 处理三反引号代码块
    const fenceCount = (s.match(/```/g) || []).length
    if (fenceCount % 2 === 1) {
      s += '\n```'
    }

    // 处理 $$ 数学块
    const mathBlockCount = (s.match(/\$\$/g) || []).length
    if (mathBlockCount % 2 === 1) {
      s += '\n$$'
    }

    return s
  }, [content])

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex, rehypeHighlight, rehypeSanitize]}
      components={{
        // 自定义样式
        code({ node, className, children, ...props }) {
          const isInline = !className || !className.includes('language-')
          return isInline ? (
            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-800" style={{ fontFamily: "'JetBrains Mono', monospace" }} {...props}>
              {children}
            </code>
          ) : (
            <code className={className} style={{ fontFamily: "'JetBrains Mono', monospace" }} {...props}>
              {children}
            </code>
          )
        },
        pre({ node, children, ...props }) {
          return (
            <pre className="rounded-lg bg-gray-100 p-3 text-xs overflow-x-auto" style={{ fontFamily: "'JetBrains Mono', monospace" }} {...props}>
              {children}
            </pre>
          )
        },
        p({ node, children, ...props }) {
          return (
            <p className="mb-2 last:mb-0" {...props}>
              {children}
            </p>
          )
        },
        ul({ node, children, ...props }) {
          return (
            <ul className="mb-2 ml-4 list-disc space-y-1" {...props}>
              {children}
            </ul>
          )
        },
        ol({ node, children, ...props }) {
          return (
            <ol className="mb-2 ml-4 list-decimal space-y-1" {...props}>
              {children}
            </ol>
          )
        },
        li({ node, children, ...props }) {
          return (
            <li className="pl-1" {...props}>
              {children}
            </li>
          )
        },
        blockquote({ node, children, ...props }) {
          return (
            <blockquote className="mb-2 border-l-4 border-gray-300 pl-3 italic text-gray-600" {...props}>
              {children}
            </blockquote>
          )
        },
        h1({ node, children, ...props }) {
          return (
            <h1 className="mb-2 mt-4 text-lg font-bold first:mt-0" {...props}>
              {children}
            </h1>
          )
        },
        h2({ node, children, ...props }) {
          return (
            <h2 className="mb-2 mt-3 text-base font-bold first:mt-0" {...props}>
              {children}
            </h2>
          )
        },
        h3({ node, children, ...props }) {
          return (
            <h3 className="mb-2 mt-2 text-sm font-bold first:mt-0" {...props}>
              {children}
            </h3>
          )
        },
        table({ node, children, ...props }) {
          return (
            <div className="mb-2 overflow-x-auto">
              <table className="min-w-full border-collapse border border-gray-300" {...props}>
                {children}
              </table>
            </div>
          )
        },
        th({ node, children, ...props }) {
          return (
            <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-left font-semibold" {...props}>
              {children}
            </th>
          )
        },
        td({ node, children, ...props }) {
          return (
            <td className="border border-gray-300 px-2 py-1" {...props}>
              {children}
            </td>
          )
        },
        a({ node, children, ...props }) {
          return (
            <a className="text-blue-600 underline hover:text-blue-800" {...props}>
              {children}
            </a>
          )
        },
        hr({ node, ...props }) {
          return <hr className="my-3 border-gray-300" {...props} />
        },
      }}
    >
      {safeContent}
    </ReactMarkdown>
  )
}

