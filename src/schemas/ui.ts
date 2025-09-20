import { z } from 'zod'

export const UIItem = z.object({ key: z.string(), value: z.string() })

export const UIResponse = z.object({
  lang: z.string(),
  items: z.array(UIItem),
})

export type TUIResponse = z.infer<typeof UIResponse>


