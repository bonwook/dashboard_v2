import { EditorState, WorkForm } from '../types'

export function useEditor() {
  // 에디터 상태 업데이트 함수
  const updateEditorState = (setEditorState: React.Dispatch<React.SetStateAction<EditorState>>) => {
    const editor = document.getElementById('work-content')
    if (editor) {
      setEditorState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
      })
    }
  }
  
  // 댓글 에디터 상태 업데이트 함수
  const updateCommentEditorState = (setWorkCommentEditorState: React.Dispatch<React.SetStateAction<EditorState>>) => {
    const editor = document.getElementById('work-comment-content')
    if (editor) {
      setWorkCommentEditorState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
      })
    }
  }
  
  // 테이블 리사이즈 핸들러 추가 함수
  const addResizeHandlersToTable = (
    table: HTMLTableElement,
    workForm: WorkForm,
    setWorkForm: React.Dispatch<React.SetStateAction<WorkForm>>
  ) => {
    const editor = document.getElementById('work-content')
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
          
          // 같은 열의 모든 셀 찾기
          const cellIndex = Array.from(row.children).indexOf(cell)
          const allCellsInColumn = Array.from(table.querySelectorAll('tr')).map(
            (row) => row.children[cellIndex] as HTMLElement
          )
          
          const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return
            const diff = e.clientX - startX
            const newWidth = Math.max(50, startWidth + diff)
            // 같은 열의 모든 셀에 동일한 너비 적용
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
            const html = editor.innerHTML
            setWorkForm({ ...workForm, content: html })
          }
          
          document.addEventListener('mousemove', handleMouseMove)
          document.addEventListener('mouseup', handleMouseUp)
        })
        
        cell.appendChild(resizeHandle)
      })
    })
  }
  
  // 테이블 생성 함수
  const createTable = (
    rows: number,
    cols: number,
    workForm: WorkForm,
    setWorkForm: React.Dispatch<React.SetStateAction<WorkForm>>,
    addResizeHandlers: typeof addResizeHandlersToTable
  ) => {
    const editor = document.getElementById('work-content')
    if (!editor) return
    
    // 에디터에 포커스 설정
    editor.focus()
    
    const table = document.createElement('table')
    table.style.borderCollapse = 'collapse'
    table.style.width = '100%'
    table.style.margin = '10px 0'
    table.style.border = '2px solid #6b7280'
    table.style.position = 'relative'
    table.style.tableLayout = 'fixed' // 테이블 레이아웃 고정
    table.setAttribute('data-resizable', 'true')
    
    // 각 열의 초기 너비 계산 (100%를 열 개수로 나눔)
    const columnWidth = `${100 / cols}%`
    
    for (let i = 0; i < rows; i++) {
      const row = document.createElement('tr')
      for (let j = 0; j < cols; j++) {
        const cell = document.createElement('td')
        cell.style.border = '2px solid #6b7280'
        cell.style.padding = '8px'
        cell.style.width = columnWidth // 고정 너비 설정
        cell.style.minWidth = '50px'
        cell.style.position = 'relative'
        cell.contentEditable = 'true'
        cell.innerHTML = '&nbsp;'
        
        // 테이블 셀에 포커스가 들어갈 때 포맷 초기화
        cell.addEventListener('focus', () => {
          document.execCommand('removeFormat', false)
          document.execCommand('unlink', false)
        })
        
        // 테이블 셀에 입력할 때 포맷 제거
        cell.addEventListener('input', () => {
          const selection = window.getSelection()
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0)
            const container = range.commonAncestorContainer
            if (cell.contains(container) || container === cell) {
              // 언더라인 등 포맷 제거
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
    
    // 에디터 내부에만 테이블 삽입
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      // 선택 범위가 에디터 내부에 있는지 확인
      if (editor.contains(range.commonAncestorContainer) || range.commonAncestorContainer === editor) {
        range.deleteContents()
        range.insertNode(table)
        range.setStartAfter(table)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
      } else {
        // 선택 범위가 에디터 외부에 있으면 에디터 끝에 추가
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
      // 선택이 없으면 에디터 끝에 추가
      editor.appendChild(table)
      const range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }
    
    setTimeout(() => {
      addResizeHandlers(table, workForm, setWorkForm)
    }, 0)
    
    const html = editor.innerHTML
    setWorkForm({ ...workForm, content: html })
  }
  
  // 댓글 에디터 테이블 리사이즈 핸들러 추가 함수
  const addResizeHandlersToCommentTable = (
    table: HTMLTableElement,
    setWorkCommentContent: React.Dispatch<React.SetStateAction<string>>
  ) => {
    const editor = document.getElementById('work-comment-content')
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
          
          // 같은 열의 모든 셀 찾기
          const cellIndex = Array.from(row.children).indexOf(cell)
          const allCellsInColumn = Array.from(table.querySelectorAll('tr')).map(
            (row) => row.children[cellIndex] as HTMLElement
          )
          
          const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return
            const diff = e.clientX - startX
            const newWidth = Math.max(50, startWidth + diff)
            // 같은 열의 모든 셀에 동일한 너비 적용
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
            const html = editor.innerHTML
            setWorkCommentContent(html)
          }
          
          document.addEventListener('mousemove', handleMouseMove)
          document.addEventListener('mouseup', handleMouseUp)
        })
        
        cell.appendChild(resizeHandle)
      })
    })
  }
  
  // 댓글 에디터 테이블 생성 함수
  const createCommentTable = (
    rows: number,
    cols: number,
    workTaskId: string | null,
    setWorkCommentContent: React.Dispatch<React.SetStateAction<string>>,
    addResizeHandlers: typeof addResizeHandlersToCommentTable
  ) => {
    if (!workTaskId) return
    const editor = document.getElementById('work-comment-content')
    if (!editor) return
    
    // 에디터에 포커스 설정
    editor.focus()
    
    const table = document.createElement('table')
    table.style.borderCollapse = 'collapse'
    table.style.width = '100%'
    table.style.margin = '10px 0'
    table.style.border = '2px solid #6b7280'
    table.style.position = 'relative'
    table.style.tableLayout = 'fixed' // 테이블 레이아웃 고정
    table.setAttribute('data-resizable', 'true')
    
    // 각 열의 초기 너비 계산 (100%를 열 개수로 나눔)
    const columnWidth = `${100 / cols}%`
    
    for (let i = 0; i < rows; i++) {
      const row = document.createElement('tr')
      for (let j = 0; j < cols; j++) {
        const cell = document.createElement('td')
        cell.style.border = '2px solid #6b7280'
        cell.style.padding = '8px'
        cell.style.width = columnWidth // 고정 너비 설정
        cell.style.minWidth = '50px'
        cell.style.position = 'relative'
        cell.contentEditable = 'true'
        cell.innerHTML = '&nbsp;'
        
        // 테이블 셀에 포커스가 들어갈 때 포맷 초기화
        cell.addEventListener('focus', () => {
          document.execCommand('removeFormat', false)
          document.execCommand('unlink', false)
        })
        
        // 테이블 셀에 입력할 때 포맷 제거
        cell.addEventListener('input', () => {
          const selection = window.getSelection()
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0)
            const container = range.commonAncestorContainer
            if (cell.contains(container) || container === cell) {
              // 언더라인 등 포맷 제거
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
    
    // 에디터 내부에만 테이블 삽입
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      // 선택 범위가 에디터 내부에 있는지 확인
      if (editor.contains(range.commonAncestorContainer) || range.commonAncestorContainer === editor) {
        range.deleteContents()
        range.insertNode(table)
        range.setStartAfter(table)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
      } else {
        // 선택 범위가 에디터 외부에 있으면 에디터 끝에 추가
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
      // 선택이 없으면 에디터 끝에 추가
      editor.appendChild(table)
      const range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }
    
    setTimeout(() => {
      addResizeHandlers(table, setWorkCommentContent)
    }, 0)
    
    const html = editor.innerHTML
    setWorkCommentContent(html)
  }

  return {
    updateEditorState,
    updateCommentEditorState,
    addResizeHandlersToTable,
    createTable,
    addResizeHandlersToCommentTable,
    createCommentTable,
  }
}
