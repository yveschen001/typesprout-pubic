import { z } from 'zod'

export const ContentItem = z.object({
  id: z.string(),
  lang: z.string(),
  text: z.string(),
  type: z.string().optional(),
  grade_min: z.number().optional(),
  grade_max: z.number().optional(),
  tags: z.string().optional(),
})

export const ContentResponse = z.object({
  items: z.array(ContentItem),
  next: z.string().nullable().optional(),
})

export type TContentItem = z.infer<typeof ContentItem>


