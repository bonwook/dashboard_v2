import { useState } from "react"

interface EditorState {
  bold: boolean
  italic: boolean
  underline: boolean
}

interface TableGridHover {
  row: number
  col: number
  show: boolean
}

interface UseContentEditorOptions {
  editorId: string
  onContentChange?: (content: string) => void
}

export function useContentEditor({ editorId, onContentChange }: UseContentEditorOptions) {
  const [editorState, setEditorState] = useState<EditorState>({
    bold: false,
    italic: false,
    underline: false,
  })
  
  const [tableGridHover, setTableGridHover] = useState<TableGridHover>({ 
    row: 0, 
    col: 0, 
    show: false 
  })

  const updateEditorState = () => {
    const editor = document.getElementById(editorId)
    if (editor) {
      setEditorState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
      })
    }
  }

  const addResizeHandlersToTable = (table: HTMLTableElement) => {
    const editor = document.getElementById(editorId)
    if (!editor) return
    
    const rows = table.querySelectorAll('tr')
    rows.forEach((row) => {
      const cells = row.querySelectorAll('td')
      cells.forEach((cell) => {
        const existingHandle = cell.querySelector('[data-resize-handle]')
        if (existingHandle) {
          existingHandle.remove()
        }
        
        const resizeHandle = document.createElement('div')
        resizeHandle.setAttribute('data-resize-handle', 'true')
        resizeHandle.style.position = 'absolute'
        resizeHandle.style.right = '-4px'
        resizeHandle.style.top = '0'
        resizeHandle.style.width = '8px'
        resizeHandle.style.height = '100%'
        resizeHandle.style.cursor = 'col-resize'
        resizeHandle.style.backgroundColor = 'transparent'
        resizeHandle.style.zIndex = '10'
        resizeHandle.style.userSelect = 'none'
        
        cell.style.position = 'relative'
        
        let isResizing = false
        let startX = 0
        let startWidth = 0
        
        resizeHandle.addEventListener('mousedown', (e) => {
          e.preventDefault()
          e.stopPropagation()
          isResizing = true
          startX = e.clientX
          startWidth = cell.offsetWidth
          
          const cellIndex = Array.from(row.children).indexOf(cell)
          const allCellsInColumn = Array.from(table.querySelectorAll('tr')).map(
            (row) => row.children[cellIndex] as HTMLElement
          )
          
          const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return
            const diff = e.clientX - startX
            const newWidth = Math.max(50, startWidth + diff)
            allCellsInColumn.forEach((colCell) => {
              if (colCell) {
                colCell.style.width = `${newWidth}px`
              }
            })
          }
          
          const handleMouseUp = () => {
            isResizing = false
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
            if (onContentChange) {
              onContentChange(editor.innerHTML)
            }
          }
          
          document.addEventListener('mousemove', handleMouseMove)
          document.addEventListener('mouseup', handleMouseUp)
        })
        
        cell.appendChild(resizeHandle)
      })
    })
  }

  const createTable = (rows: number, cols: number) => {
    const editor = document.getElementById(editorId)
    if (!editor) return
    
    editor.focus()
    
    const table = document.createElement('table')
    table.style.borderCollapse = 'collapse'
    table.style.width = '100%'
    table.style.margin = '10px 0'
    table.style.border = '2px solid #6b7280'
    table.style.position = 'relative'
    table.style.tableLayout = 'fixed'
    table.setAttribute('data-resizable', 'true')
    
    const columnWidth = `${100 / cols}%`
    
    for (let i = 0; i < rows; i++) {
      const row = document.createElement('tr')
      for (let j = 0; j < cols; j++) {
        const cell = document.createElement('td')
        cell.style.border = '2px solid #6b7280'
        cell.style.padding = '8px'
        cell.style.width = columnWidth
        cell.style.minWidth = '50px'
        cell.style.position = 'relative'
        cell.contentEditable = 'true'
        cell.innerHTML = '&nbsp;'
        
        cell.addEventListener('focus', () => {
          document.execCommand('removeFormat', false)
          document.execCommand('unlink', false)
        })
        
        cell.addEventListener('input', () => {
          const selection = window.getSelection()
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0)
            const container = range.commonAncestorContainer
            if (cell.contains(container) || container === cell) {
              const walker = document.createTreeWalker(
                cell,
                NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
                null
              )
              let node
              while (node = walker.nextNode()) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  const el = node as HTMLElement
                  if (el.tagName === 'U' || el.style.textDecoration === 'underline') {
                    const parent = el.parentNode
                    if (parent) {
                      while (el.firstChild) {
                        parent.insertBefore(el.firstChild, el)
                      }
                      parent.removeChild(el)
                    }
                  }
                }
              }
            }
          }
        })
        
        row.appendChild(cell)
      }
      table.appendChild(row)
    }
    
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      if (editor.contains(range.commonAncestorContainer) || range.commonAncestorContainer === editor) {
        range.deleteContents()
        range.insertNode(table)
        range.setStartAfter(table)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
      } else {
        const range = document.createRange()
        range.selectNodeContents(editor)
        range.collapse(false)
        range.insertNode(table)
        range.setStartAfter(table)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
      }
    } else {
      editor.appendChild(table)
      const range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
    
    setTimeout(() => {
      addResizeHandlersToTable(table)
    }, 0)
    
    if (onContentChange) {
      onContentChange(editor.innerHTML)
    }
    
    setTableGridHover({ row: 0, col: 0, show: false })
  }

  return {
    editorState,
    setEditorState,
    tableGridHover,
    setTableGridHover,
    updateEditorState,
    addResizeHandlersToTable,
    createTable,
  }
}

// Type exports
export type { EditorState, TableGridHover }
