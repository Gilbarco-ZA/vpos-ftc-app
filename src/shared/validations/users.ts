import { z } from 'zod'

export const createUserSchema = z.object({
  stationId: z.string().uuid('Invalid station ID'),
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['administrator', 'manager', 'tenant']),
  fullName: z.string().optional(),
})

export const updateUserSchema = z
  .object({
    userId: z.string().uuid('Invalid user ID'),
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .optional(),
    email: z.string().email('Invalid email address').optional(),
    role: z.enum(['administrator', 'manager', 'tenant']).optional(),
    fullName: z.string().optional(),
  })
  .refine(
    (data) =>
      data.username !== undefined ||
      data.email !== undefined ||
      data.role !== undefined ||
      data.fullName !== undefined,
    { message: 'At least one field must be updated' },
  )

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
