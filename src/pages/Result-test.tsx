import React from 'react'

function ResultTest() {
  console.log('ResultTest: 組件開始渲染')
  return React.createElement('div', { className: 'max-w-[960px] mx-auto px-4' }, 
    React.createElement('h2', { className: 'h2 mb-2' }, '結果測試'),
    React.createElement('div', { className: 'p-4 border rounded-[12px] text-left' },
      React.createElement('div', { className: 'h3 mb-2' }, '本次總結'),
      React.createElement('ul', { className: 'list-disc list-inside space-y-1 pl-1 text-left' },
        React.createElement('li', null, '這是一個測試組件'),
        React.createElement('li', null, '如果看到這個，說明組件載入成功')
      )
    )
  )
}

export default ResultTest