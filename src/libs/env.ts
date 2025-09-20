export const ENV = {
  SHEETS_CONTENT_URL: (import.meta.env.VITE_SHEETS_CONTENT_URL as string) || '',
  SHEETS_UI_URL: (import.meta.env.VITE_SHEETS_UI_URL as string) || '',
  SHEETS_ADMIN_TOKEN: (import.meta.env.VITE_SHEETS_ADMIN_TOKEN as string) || '',
}

export default ENV


