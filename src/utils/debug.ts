// 调试日志工具
export function debugLog(module: string, message: string, data?: any) {
  if (import.meta.env.DEV) {
    console.log(`[${module}] ${message}`, data || '')
  }
}
